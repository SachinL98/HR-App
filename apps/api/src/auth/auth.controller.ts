import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/ctx';
import { AuthService } from './auth.service';
import { AcceptInviteDto, LoginDto, RegisterDto } from './dto';

@Public()
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('register') register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }
  @Post('login') login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }
  @Post('invites/accept') accept(@Body() dto: AcceptInviteDto) {
    return this.auth.acceptInvite(dto);
  }
}
