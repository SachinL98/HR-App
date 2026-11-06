import { Body, Controller, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../common/ctx';
import { AuthService, type Meta } from './auth.service';
import {
  AcceptInviteDto,
  ForgotDto,
  LoginDto,
  MfaLoginDto,
  RegisterDto,
  ResetDto,
  SsoDto,
  TokenDto,
} from './dto';

const meta = (r: Request): Meta => ({
  ip: r.ip,
  userAgent: r.headers['user-agent'],
});

@Public()
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('register') register(@Body() dto: RegisterDto, @Req() r: Request) {
    return this.auth.register(dto, meta(r));
  }
  @Post('login') login(@Body() dto: LoginDto, @Req() r: Request) {
    return this.auth.login(dto, meta(r));
  }
  @Post('sso') sso(@Body() dto: SsoDto, @Req() r: Request) {
    return this.auth.ssoLogin(dto.token, meta(r));
  }
  @Post('mfa') mfa(@Body() dto: MfaLoginDto, @Req() r: Request) {
    return this.auth.loginMfa(dto.challenge, dto.code, meta(r));
  }
  @Post('invites/accept') accept(
    @Body() dto: AcceptInviteDto,
    @Req() r: Request,
  ) {
    return this.auth.acceptInvite(dto, meta(r));
  }
  @Post('verify-email') verify(@Body() dto: TokenDto) {
    return this.auth.verifyEmail(dto.token);
  }
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('verify-email/resend')
  resend(@Body() dto: ForgotDto) {
    return this.auth.resendVerification(dto.email);
  }
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  forgot(@Body() dto: ForgotDto) {
    return this.auth.forgotPassword(dto.email);
  }
  @Post('reset-password') reset(@Body() dto: ResetDto) {
    return this.auth.resetPassword(dto.token, dto.password);
  }
}
