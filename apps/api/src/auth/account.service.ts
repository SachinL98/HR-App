import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from '../common/password';
import { randomBytes } from 'crypto';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import type { Ctx } from '../common/ctx';
import { decryptBytes, encryptBytes } from '../common/field-crypto';
import { checkTotp, newSecret, otpauthUrl } from '../common/totp';
import { hashToken, weakPassword } from './auth.service';
import { MailService, emailBody } from './mail.service';

const MFA_KEY = 'user-mfa';

/** What a signed-in person can do about their own account: sessions, password, two-factor sign-in. */
@Injectable()
export class AccountService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  private user(c: Ctx) {
    return this.prisma.system.user.findUniqueOrThrow({
      where: { id: c.userId },
    });
  }

  async overview(c: Ctx) {
    const u = await this.user(c);
    return {
      email: u.email,
      emailVerified: !!u.emailVerified,
      mfaEnabled: u.mfaEnabled,
      recoveryCodesLeft: u.mfaRecoveryHashes.length,
      mailEnabled: this.mail.enabled,
      locale: u.locale ?? null,
    };
  }

  async setLocale(c: Ctx, locale: string) {
    await this.prisma.system.user.update({
      where: { id: c.userId },
      data: { locale },
    });
    return { ok: true };
  }

  // ───────── sessions ─────────

  async sessions(c: Ctx) {
    const rows = await this.prisma.system.session.findMany({
      where: {
        userId: c.userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      ip: s.ip,
      userAgent: s.userAgent,
      current: s.id === c.sessionId,
    }));
  }

  async revokeSession(c: Ctx, id: string) {
    const r = await this.prisma.system.session.updateMany({
      where: { id, userId: c.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!r.count) throw new NotFoundException('Session not found');
    return { ok: true };
  }

  async revokeOthers(c: Ctx) {
    const r = await this.prisma.system.session.updateMany({
      where: { userId: c.userId, revokedAt: null, id: { not: c.sessionId } },
      data: { revokedAt: new Date() },
    });
    return { ended: r.count };
  }

  logout(c: Ctx) {
    return this.prisma.system.session
      .updateMany({
        where: { id: c.sessionId, userId: c.userId },
        data: { revokedAt: new Date() },
      })
      .then(() => ({ ok: true }));
  }

  // ───────── password ─────────

  async changePassword(c: Ctx, current: string, next: string) {
    const u = await this.user(c);
    if (!u.passwordHash || !(await argon2.verify(u.passwordHash, current)))
      throw new UnauthorizedException('Your current password is not right');
    const weak = weakPassword(next, u.email);
    if (weak) throw new BadRequestException(weak);
    if (await argon2.verify(u.passwordHash, next))
      throw new BadRequestException(
        'Choose a password you have not used just now',
      );
    await this.prisma.system.user.update({
      where: { id: u.id },
      data: {
        passwordHash: await argon2.hash(next),
        passwordChangedAt: new Date(),
      },
    });
    // Every other sign-in ends; this one stays.
    const r = await this.prisma.system.session.updateMany({
      where: { userId: u.id, revokedAt: null, id: { not: c.sessionId } },
      data: { revokedAt: new Date() },
    });
    const m = emailBody({
      heading: 'Your password was changed',
      lines: [
        'The password for your Seamless Source HR account was just changed.',
      ],
      footer:
        'If this was not you, reset your password straight away and tell your administrator.',
    });
    await this.mail.send(u.email, 'Your password was changed', m.text, m.html);
    return { ok: true, otherSessionsEnded: r.count };
  }

  // ───────── two-factor sign-in ─────────

  async mfaSetup(c: Ctx) {
    const u = await this.user(c);
    if (u.mfaEnabled)
      throw new BadRequestException('Two-factor sign-in is already on');
    const secret = newSecret();
    await this.prisma.system.user.update({
      where: { id: u.id },
      data: {
        mfaSecretEnc: encryptBytes(MFA_KEY, Buffer.from(secret)),
        mfaLastStep: null,
      },
    });
    const url = otpauthUrl(secret, u.email, 'Seamless Source HR');
    return {
      secret: secret.match(/.{1,4}/g)!.join(' '),
      otpauthUrl: url,
      qr: await QRCode.toDataURL(url, { margin: 1, width: 220 }),
    };
  }

  async mfaEnable(c: Ctx, code: string) {
    const u = await this.user(c);
    if (u.mfaEnabled || !u.mfaSecretEnc)
      throw new BadRequestException('Start the setup first');
    const secret = decryptBytes(MFA_KEY, u.mfaSecretEnc).toString('utf8');
    const step = checkTotp(secret, code, u.mfaLastStep);
    if (step === null)
      throw new BadRequestException(
        'That code is not right. Check the time on your phone and try again.',
      );
    // Ten one-time codes for when the phone is lost. They are shown once, then only a hash is kept.
    const codes = Array.from({ length: 10 }, () => {
      const r = randomBytes(5).toString('hex');
      return `${r.slice(0, 5)}-${r.slice(5)}`;
    });
    await this.prisma.system.user.update({
      where: { id: u.id },
      data: {
        mfaEnabled: true,
        mfaLastStep: step,
        mfaRecoveryHashes: codes.map((x) => hashToken(x.replace('-', ''))),
      },
    });
    return { recoveryCodes: codes };
  }

  async mfaDisable(c: Ctx, password: string, code: string) {
    const u = await this.user(c);
    if (!u.mfaEnabled || !u.mfaSecretEnc)
      throw new BadRequestException('Two-factor sign-in is not on');
    if (!u.passwordHash || !(await argon2.verify(u.passwordHash, password)))
      throw new ForbiddenException('Your password is not right');
    const secret = decryptBytes(MFA_KEY, u.mfaSecretEnc).toString('utf8');
    const rc = hashToken(code.replace(/[\s-]/g, '').toLowerCase());
    if (
      checkTotp(secret, code, u.mfaLastStep) === null &&
      !u.mfaRecoveryHashes.includes(rc)
    )
      throw new ForbiddenException('That code is not right');
    await this.prisma.system.user.update({
      where: { id: u.id },
      data: {
        mfaEnabled: false,
        mfaSecretEnc: null,
        mfaRecoveryHashes: [],
        mfaLastStep: null,
      },
    });
    return { ok: true };
  }
}
