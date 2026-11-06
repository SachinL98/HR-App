import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from '../common/password';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PLAN_LIMITS } from '../org/permissions';
import { planOf } from '../org/plan';
import { AcceptInviteDto, LoginDto, RegisterDto } from './dto';
import { seedLeaveDefaults } from '../leave/leave.service';
import { MailService, emailBody } from './mail.service';
import { LoginThrottle } from './login-throttle';
import { checkTotp } from '../common/totp';
import { decryptBytes } from '../common/field-crypto';

/** Where a sign-in came from, kept with the session so people can recognise and end them. */
export interface Meta {
  ip?: string;
  userAgent?: string;
}
const MFA_KEY = 'user-mfa'; // key context for authenticator secrets (a person can belong to several companies)
const SESSION_HOURS = 8;

/** Rejects passwords that are short, repetitive, the email itself, or on a short list of the most common ones. */
export function weakPassword(pw: string, email?: string) {
  const lower = pw.toLowerCase();
  const local = (email ?? '').split('@')[0].toLowerCase();
  if (pw.length < 10) return 'Use at least 10 characters.';
  if (/^(.)\1+$/.test(pw)) return 'That password is too repetitive.';
  if (local.length >= 4 && lower.includes(local))
    return 'The password should not contain your email name.';
  const common = [
    'password',
    'qwerty',
    '123456',
    'letmein',
    'welcome',
    'iloveyou',
    'admin123',
    'abcdef',
  ];
  if (common.some((c) => lower.includes(c)))
    return 'That password is too easy to guess. Try a few unrelated words.';
  return null;
}

/** Failed sign-ins per email: five misses lock that email out for 15 minutes (it doubles on each repeat). Kept in the database (LoginThrottle). */
let DUMMY_HASH: Promise<string> | undefined;

export const hashToken = (t: string) =>
  createHash('sha256').update(t).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'org';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private mail: MailService,
    private throttle: LoginThrottle,
  ) {}

  /** Starts a session (one row per sign-in, so it can be listed and ended) and returns its token. */
  private async token(
    userId: string,
    memberId: string,
    tenantId: string,
    meta: Meta = {},
  ) {
    const s = await this.prisma.system.session.create({
      data: {
        userId,
        ip: meta.ip?.slice(0, 64),
        userAgent: meta.userAgent?.slice(0, 300),
        expiresAt: new Date(Date.now() + SESSION_HOURS * 3600_000),
      },
    });
    return this.jwt.signAsync({
      sub: userId,
      mid: memberId,
      tid: tenantId,
      sid: s.id,
    });
  }

  private webUrl() {
    return process.env.WEB_URL ?? 'http://localhost:3000';
  }

  /** Emails a one-time link and returns it (the link is only handed back to callers outside production). */
  private async oneTimeLink(
    userId: string,
    kind: 'verify_email' | 'reset_password',
    hours: number,
    path: string,
  ) {
    const token = newToken();
    await this.prisma.system.userToken.create({
      data: {
        userId,
        kind,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + hours * 3600_000),
      },
    });
    return `${this.webUrl()}${path}?token=${token}`;
  }

  async sendVerification(userId: string, email: string) {
    const link = await this.oneTimeLink(
      userId,
      'verify_email',
      48,
      '/verify-email',
    );
    const m = emailBody({
      heading: 'Confirm your email',
      lines: [
        'Confirm this address to finish setting up your Seamless Source HR account. The link works for 48 hours.',
      ],
      button: { label: 'Confirm my email', url: link },
    });
    await this.mail.send(email, 'Confirm your email', m.text, m.html);
    return link;
  }

  async register(dto: RegisterDto, meta: Meta = {}) {
    const email = dto.email.toLowerCase();
    const weak = weakPassword(dto.password, email);
    if (weak) throw new BadRequestException(weak);
    if (await this.prisma.system.user.findUnique({ where: { email } }))
      throw new ConflictException('An account with this email already exists');

    const tenantId = randomUUID();
    const passwordHash = await argon2.hash(dto.password);
    const slug = `${slugify(dto.orgName)}-${randomBytes(2).toString('hex')}`;

    const { userId, memberId } = await this.prisma.withTenant(
      tenantId,
      async (tx) => {
        await tx.tenant.create({
          data: {
            id: tenantId,
            slug,
            legalName: dto.orgName,
            displayName: dto.orgName,
            country: dto.country.toUpperCase(),
            timeZone: dto.timeZone,
            currency: dto.currency.toUpperCase(),
            workWeek: [1, 2, 3, 4, 5],
          },
        });
        // New companies start on a 14-day Gold trial (see spec 3.18).
        await tx.subscription.create({
          data: {
            tenantId,
            tier: 'GOLD',
            status: 'TRIALING',
            seats: PLAN_LIMITS.GOLD.seats,
            trialEndsAt: new Date(Date.now() + 14 * 86400_000),
          },
        });
        const user = await tx.user.create({ data: { email, passwordHash } });
        const member = await tx.member.create({
          data: {
            tenantId,
            userId: user.id,
            isOwner: true,
            firstName: dto.firstName,
            lastName: dto.lastName,
            workEmail: email,
          },
        });
        await seedLeaveDefaults(tx, tenantId, member.id);
        await tx.auditLog.create({
          data: { tenantId, actorId: member.id, action: 'tenant.create' },
        });
        return { userId: user.id, memberId: member.id };
      },
    );

    const link = await this.sendVerification(userId, email);
    // With real email set up, the address must be confirmed before first sign-in.
    if (this.mail.enabled) return { verifyEmail: true as const, email };
    return {
      accessToken: await this.token(userId, memberId, tenantId, meta),
      tenant: { id: tenantId, slug },
      ...(process.env.NODE_ENV === 'production' ? {} : { devLink: link }),
    };
  }

  async login(dto: LoginDto, meta: Meta = {}) {
    const email = dto.email.toLowerCase();
    if (await this.throttle.lockedFor(email))
      throw new HttpException(
        'Too many failed attempts. Try again in a few minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    const user = await this.prisma.system.user.findUnique({
      where: { email },
      include: {
        memberships: { where: { status: 'ACTIVE' }, include: { tenant: true } },
      },
    });
    // Unknown emails still pay for a password check, so response time does not reveal who has an account.
    DUMMY_HASH ??= argon2.hash('not-a-real-password');
    const ok = await argon2.verify(
      user?.passwordHash ?? (await DUMMY_HASH),
      dto.password,
    );
    if (!user || !user.passwordHash || !ok) {
      await this.throttle.fail(email, 15, true);
      throw new UnauthorizedException('Invalid email or password');
    }
    await this.throttle.clear(email);

    const options = user.memberships.map((m) => ({
      slug: m.tenant.slug,
      name: m.tenant.displayName,
    }));
    const chosen = dto.tenantSlug
      ? user.memberships.find((m) => m.tenant.slug === dto.tenantSlug)
      : user.memberships.length === 1
        ? user.memberships[0]
        : undefined;
    if (!chosen) {
      if (!user.memberships.length)
        throw new UnauthorizedException('No active membership');
      throw new ConflictException({
        message: 'Choose an organization',
        options,
      });
    }
    if (this.mail.enabled && !user.emailVerified)
      throw new ForbiddenException(
        'Please confirm your email first. Check your inbox for the link, or ask for a new one.',
      );
    if (user.mfaEnabled && user.mfaSecretEnc)
      return {
        mfaRequired: true as const,
        // Only good for the second step: it has no session id, so the API refuses it as a sign-in token.
        challenge: await this.jwt.signAsync(
          {
            purpose: 'mfa',
            sub: user.id,
            mid: chosen.id,
            tid: chosen.tenantId,
          },
          { expiresIn: '5m' },
        ),
      };
    return this.finishLogin(user.id, chosen, meta);
  }

  private async finishLogin(
    userId: string,
    chosen: { id: string; tenantId: string; tenant: { slug: string } },
    meta: Meta,
  ) {
    await this.prisma.system.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
    return {
      accessToken: await this.token(userId, chosen.id, chosen.tenantId, meta),
      tenant: { id: chosen.tenantId, slug: chosen.tenant.slug },
    };
  }

  /** Second step of sign-in: an authenticator code, or one of the one-time recovery codes. */
  async loginMfa(challenge: string, code: string, meta: Meta = {}) {
    let p: { purpose?: string; sub: string; mid: string; tid: string };
    try {
      p = await this.jwt.verifyAsync(challenge);
    } catch {
      throw new UnauthorizedException(
        'That sign-in took too long. Start again.',
      );
    }
    if (p.purpose !== 'mfa') throw new UnauthorizedException();
    const key = `mfa:${p.sub}`;
    if (await this.throttle.lockedFor(key))
      throw new HttpException(
        'Too many wrong codes. Try again in a few minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    const user = await this.prisma.system.user.findUnique({
      where: { id: p.sub },
    });
    const member = await this.prisma.system.member.findFirst({
      where: { id: p.mid, userId: p.sub, status: 'ACTIVE' },
      include: { tenant: true },
    });
    if (!user || !member || !user.mfaEnabled || !user.mfaSecretEnc)
      throw new UnauthorizedException();

    let ok = false;
    const secret = decryptBytes(MFA_KEY, user.mfaSecretEnc).toString('utf8');
    const step = checkTotp(secret, code, user.mfaLastStep);
    if (step !== null) {
      ok = true;
      await this.prisma.system.user.update({
        where: { id: user.id },
        data: { mfaLastStep: step },
      });
    } else {
      const h = hashToken(code.replace(/[\s-]/g, '').toLowerCase());
      if (user.mfaRecoveryHashes.includes(h)) {
        ok = true;
        await this.prisma.system.user.update({
          where: { id: user.id },
          data: {
            mfaRecoveryHashes: user.mfaRecoveryHashes.filter((x) => x !== h),
          },
        });
      }
    }
    if (!ok) {
      await this.throttle.fail(key, 15, false);
      throw new UnauthorizedException('That code is not right');
    }
    await this.throttle.clear(key);
    return this.finishLogin(user.id, member, meta);
  }

  async verifyEmail(token: string) {
    const t = await this.prisma.system.userToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!t || t.kind !== 'verify_email' || t.usedAt || t.expiresAt < new Date())
      throw new BadRequestException('This link is invalid or has expired');
    await this.prisma.system.$transaction([
      this.prisma.system.userToken.update({
        where: { id: t.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.system.user.update({
        where: { id: t.userId },
        data: { emailVerified: new Date() },
      }),
    ]);
    return { ok: true };
  }

  /** Always answers the same, so nobody can use it to find out who has an account. */
  async resendVerification(email: string) {
    const user = await this.prisma.system.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    let devLink: string | undefined;
    if (
      user &&
      !user.emailVerified &&
      (await this.cooledDown(user.id, 'verify_email'))
    )
      devLink = await this.sendVerification(user.id, user.email);
    return {
      ok: true,
      ...(process.env.NODE_ENV === 'production' ? {} : { devLink }),
    };
  }

  /** At most one email of each kind per minute per person. */
  private async cooledDown(userId: string, kind: string) {
    const recent = await this.prisma.system.userToken.findFirst({
      where: { userId, kind, createdAt: { gt: new Date(Date.now() - 60_000) } },
    });
    return !recent;
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.system.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    let devLink: string | undefined;
    if (
      user?.passwordHash &&
      (await this.cooledDown(user.id, 'reset_password'))
    ) {
      devLink = await this.oneTimeLink(
        user.id,
        'reset_password',
        1,
        '/reset-password',
      );
      const m = emailBody({
        heading: 'Reset your password',
        lines: [
          'Someone asked to reset the password for your Seamless Source HR account. The link works for 1 hour and can be used once.',
        ],
        button: { label: 'Choose a new password', url: devLink },
        footer:
          'If this was not you, ignore this email. Your password has not changed.',
      });
      await this.mail.send(user.email, 'Reset your password', m.text, m.html);
    }
    return {
      ok: true,
      ...(process.env.NODE_ENV === 'production' ? {} : { devLink }),
    };
  }

  async resetPassword(token: string, password: string) {
    const t = await this.prisma.system.userToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (
      !t ||
      t.kind !== 'reset_password' ||
      t.usedAt ||
      t.expiresAt < new Date()
    )
      throw new BadRequestException(
        'This link is invalid or has expired. Ask for a new one.',
      );
    const weak = weakPassword(password, t.user.email);
    if (weak) throw new BadRequestException(weak);
    const passwordHash = await argon2.hash(password);
    await this.prisma.system.$transaction([
      this.prisma.system.userToken.update({
        where: { id: t.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.system.user.update({
        where: { id: t.userId },
        data: {
          passwordHash,
          passwordChangedAt: new Date(),
          // Owning the mailbox proves the address too.
          emailVerified: t.user.emailVerified ?? new Date(),
        },
      }),
      // Everyone signed in with the old password is signed out.
      this.prisma.system.session.updateMany({
        where: { userId: t.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.throttle.clear(t.user.email);
    const m = emailBody({
      heading: 'Your password was changed',
      lines: [
        'The password for your Seamless Source HR account was just changed, and you were signed out everywhere.',
      ],
      footer:
        'If this was not you, reset your password again straight away and contact your administrator.',
    });
    await this.mail.send(
      t.user.email,
      'Your password was changed',
      m.text,
      m.html,
    );
    return { ok: true };
  }

  async acceptInvite(dto: AcceptInviteDto, meta: Meta = {}) {
    const invite = await this.prisma.system.invite.findUnique({
      where: { tokenHash: hashToken(dto.token) },
    });
    if (
      !invite ||
      invite.acceptedAt ||
      invite.revokedAt ||
      invite.expiresAt < new Date()
    )
      throw new BadRequestException('This invite is invalid or has expired');

    const tenantId = invite.tenantId;
    const weak = weakPassword(dto.password, invite.email);
    if (weak) throw new BadRequestException(weak);
    const passwordHash = await argon2.hash(dto.password);

    const { userId, memberId } = await this.prisma.withTenant(
      tenantId,
      async (tx) => {
        const sub = await tx.subscription.findUniqueOrThrow({
          where: { tenantId },
        });
        const seatsUsed = await tx.member.count({
          where: { status: { in: ['ACTIVE', 'INVITED'] } },
        });
        if (seatsUsed >= planOf(sub).seatLimit)
          throw new ConflictException(
            'This organization has no free seats on its plan',
          );

        let user = await tx.user.findUnique({ where: { email: invite.email } });
        if (user) {
          // Existing login joining another company: must prove they own it.
          if (
            !user.passwordHash ||
            !(await argon2.verify(user.passwordHash, dto.password))
          )
            throw new UnauthorizedException(
              'Invalid password for existing account',
            );
        } else {
          user = await tx.user.create({
            data: {
              email: invite.email,
              passwordHash,
              emailVerified: new Date(),
            },
          });
        }
        const member = await tx.member.create({
          data: {
            tenantId,
            userId: user.id,
            firstName: dto.firstName,
            lastName: dto.lastName,
            workEmail: invite.email,
            departmentId: invite.departmentId,
            jobRoleId: invite.jobRoleId,
            managerId: invite.managerId,
          },
        });
        await tx.invite.update({
          where: { id: invite.id },
          data: { acceptedAt: new Date() },
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            actorId: member.id,
            action: 'invite.accept',
            targetId: invite.id,
          },
        });
        return { userId: user.id, memberId: member.id };
      },
    );

    return { accessToken: await this.token(userId, memberId, tenantId, meta) };
  }
}
