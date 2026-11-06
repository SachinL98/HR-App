import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  NotFoundException,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { IsEmail, IsString, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileService } from '../people/profile.service';
import { Public } from '../common/ctx';
import { AuthService } from '../auth/auth.service';
import { requireIntegration } from './integration-auth';

class PhotoPutDto {
  @IsEmail() email!: string;
  @IsString() @MaxLength(600_000) imageBase64!: string;
}

class VerifyDto {
  @IsEmail() email!: string;
  @IsString() @MaxLength(128) password!: string;
}

/** The Developer Dashboard asks this app whether a password is right, so people keep one password and one profile. */
@Controller('integrations')
export class IdentityController {
  constructor(
    private auth: AuthService,
    private prisma: PrismaService,
    private profile: ProfileService,
  ) {}

  private async tenantAndMember(h: string | undefined, email: string) {
    const slug = requireIntegration(h);
    const t = await this.prisma.system.tenant.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!t) throw new NotFoundException();
    return {
      tenantId: t.id,
      memberId: await this.profile.memberIdByEmail(t.id, email),
    };
  }

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

  /** The person's profile photo, so the dashboard can show the same picture. */
  @Public()
  @Get('photo')
  async photo(
    @Headers('authorization') h: string | undefined,
    @Query('email') email = '',
  ) {
    const { tenantId, memberId } = await this.tenantAndMember(h, email);
    const p = await this.profile.photo(tenantId, memberId);
    return {
      mime: p.mime,
      imageBase64: Buffer.from(p.bytes).toString('base64'),
    };
  }

  /** A photo uploaded on the dashboard is stored here, so there is one photo for both apps. */
  @Public()
  @Put('photo')
  async setPhoto(
    @Headers('authorization') h: string | undefined,
    @Body() dto: PhotoPutDto,
  ) {
    const { tenantId, memberId } = await this.tenantAndMember(h, dto.email);
    return this.profile.setPhoto(tenantId, memberId, dto.imageBase64);
  }

  @Public()
  @Delete('photo')
  async removePhoto(
    @Headers('authorization') h: string | undefined,
    @Query('email') email = '',
  ) {
    const { tenantId, memberId } = await this.tenantAndMember(h, email);
    return this.profile.removePhoto(tenantId, memberId);
  }
}
