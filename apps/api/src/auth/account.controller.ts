import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentCtx } from '../common/ctx';
import type { Ctx } from '../common/ctx';
import { AccountService } from './account.service';
import { AuthService } from './auth.service';
import {
  ChangePasswordDto,
  LocaleDto,
  MfaDisableDto,
  MfaEnableDto,
} from './dto';

/** Signed-in people managing their own account. */
@Controller('account')
export class AccountController {
  constructor(
    private svc: AccountService,
    private auth: AuthService,
  ) {}

  /** Signed token that lets this person step into the Developer Dashboard without signing in again. */
  @Post('dashboard-token') dashboardToken(@CurrentCtx() c: Ctx) {
    return this.auth.dashboardToken(c.userId, c.memberId, c.tenantId);
  }

  @Get() overview(@CurrentCtx() c: Ctx) {
    return this.svc.overview(c);
  }
  @Put('locale') locale(@CurrentCtx() c: Ctx, @Body() dto: LocaleDto) {
    return this.svc.setLocale(c, dto.locale);
  }
  @Get('sessions') sessions(@CurrentCtx() c: Ctx) {
    return this.svc.sessions(c);
  }
  @Delete('sessions/:id') revoke(
    @CurrentCtx() c: Ctx,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.revokeSession(c, id);
  }
  @Post('sessions/revoke-others') others(@CurrentCtx() c: Ctx) {
    return this.svc.revokeOthers(c);
  }
  @Post('logout') logout(@CurrentCtx() c: Ctx) {
    return this.svc.logout(c);
  }
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('password')
  password(@CurrentCtx() c: Ctx, @Body() dto: ChangePasswordDto) {
    return this.svc.changePassword(c, dto.current, dto.next);
  }
  @Post('mfa/setup') setup(@CurrentCtx() c: Ctx) {
    return this.svc.mfaSetup(c);
  }
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('mfa/enable')
  enable(@CurrentCtx() c: Ctx, @Body() dto: MfaEnableDto) {
    return this.svc.mfaEnable(c, dto.code);
  }
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('mfa/disable')
  disable(@CurrentCtx() c: Ctx, @Body() dto: MfaDisableDto) {
    return this.svc.mfaDisable(c, dto.password, dto.code);
  }
}
