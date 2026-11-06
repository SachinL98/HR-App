import { Body, Controller, Headers, Post } from '@nestjs/common';
import { IsEmail, IsString, MaxLength } from 'class-validator';
import { Public } from '../common/ctx';
import { AuthService } from '../auth/auth.service';
import { requireIntegration } from './integration-auth';

class VerifyDto {
  @IsEmail() email!: string;
  @IsString() @MaxLength(128) password!: string;
}

/** The Developer Dashboard asks this app whether a password is right, so people keep one password and one profile. */
@Controller('integrations')
export class IdentityController {
  constructor(private auth: AuthService) {}

  @Public()
  @Post('verify-login')
  verify(
    @Headers('authorization') h: string | undefined,
    @Body() dto: VerifyDto,
  ) {
    return this.auth.verifyForIntegration(
      requireIntegration(h),
      dto.email,
      dto.password,
    );
  }
}
