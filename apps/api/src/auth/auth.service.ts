import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PLAN_LIMITS } from '../org/permissions';
import { AcceptInviteDto, LoginDto, RegisterDto } from './dto';

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
  ) {}

  private token(userId: string, memberId: string, tenantId: string) {
    return this.jwt.signAsync({ sub: userId, mid: memberId, tid: tenantId });
  }

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    if (await this.prisma.system.user.findUnique({ where: { email } }))
      throw new ConflictException('An account with this email already exists');

    const tenantId = randomUUID();
    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });
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
        await tx.auditLog.create({
          data: { tenantId, actorId: member.id, action: 'tenant.create' },
        });
        return { userId: user.id, memberId: member.id };
      },
    );

    return {
      accessToken: await this.token(userId, memberId, tenantId),
      tenant: { id: tenantId, slug },
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.system.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: {
        memberships: { where: { status: 'ACTIVE' }, include: { tenant: true } },
      },
    });
    const ok =
      user?.passwordHash &&
      (await argon2.verify(user.passwordHash, dto.password));
    if (!user || !ok)
      throw new UnauthorizedException('Invalid email or password');

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
    await this.prisma.system.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    return {
      accessToken: await this.token(user.id, chosen.id, chosen.tenantId),
      tenant: { id: chosen.tenantId, slug: chosen.tenant.slug },
    };
  }

  async acceptInvite(dto: AcceptInviteDto) {
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
    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });

    const { userId, memberId } = await this.prisma.withTenant(
      tenantId,
      async (tx) => {
        const sub = await tx.subscription.findUniqueOrThrow({
          where: { tenantId },
        });
        const seatsUsed = await tx.member.count({
          where: { status: { in: ['ACTIVE', 'INVITED'] } },
        });
        if (seatsUsed >= sub.seats)
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

    return { accessToken: await this.token(userId, memberId, tenantId) };
  }
}
