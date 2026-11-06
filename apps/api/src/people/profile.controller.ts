import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { CurrentCtx } from '../common/ctx';
import type { Ctx } from '../common/ctx';
import { ProfileService } from './profile.service';

export class ProfileDto {
  @IsOptional() @IsString() @Length(0, 80) preferredName?: string;
  @IsOptional() @IsString() @Length(0, 40) phone?: string;
}
export class PhotoDto {
  @IsString() @MaxLength(600_000) imageBase64!: string;
}

@Controller()
export class ProfileController {
  constructor(private svc: ProfileService) {}

  @Get('account/profile') profile(@CurrentCtx() c: Ctx) {
    return this.svc.get(c.tenantId, c.memberId);
  }
  @Put('account/profile') update(
    @CurrentCtx() c: Ctx,
    @Body() dto: ProfileDto,
  ) {
    return this.svc.update(c.tenantId, c.memberId, dto);
  }
  @Put('account/photo') setPhoto(@CurrentCtx() c: Ctx, @Body() dto: PhotoDto) {
    return this.svc.setPhoto(c.tenantId, c.memberId, dto.imageBase64);
  }
  @Delete('account/photo') removePhoto(@CurrentCtx() c: Ctx) {
    return this.svc.removePhoto(c.tenantId, c.memberId);
  }

  /** Everyone in the company can see everyone's photo. */
  @Get('members/:id/photo')
  async photo(
    @CurrentCtx() c: Ctx,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const p = await this.svc.photo(c.tenantId, id);
    res.set({
      'Content-Type': p.mime,
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(p.bytes);
  }
}
