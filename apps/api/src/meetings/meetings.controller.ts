import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentCtx } from '../common/ctx';
import type { Ctx } from '../common/ctx';
import { MeetingsService } from './meetings.service';
import { AvailabilityDto, CreateMeetingDto, RsvpDto } from './dto';

@Controller('meetings')
export class MeetingsController {
  constructor(private svc: MeetingsService) {}

  @Post()
  create(@CurrentCtx() c: Ctx, @Body() dto: CreateMeetingDto) {
    return this.svc.create(c, dto);
  }

  @Get()
  list(
    @CurrentCtx() c: Ctx,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.svc.list(c, from, to);
  }

  @Post('availability')
  availability(@CurrentCtx() c: Ctx, @Body() dto: AvailabilityDto) {
    return this.svc.availability(c, dto);
  }

  @Put(':id/rsvp')
  rsvp(
    @CurrentCtx() c: Ctx,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RsvpDto,
  ) {
    return this.svc.rsvp(c, id, dto);
  }

  @Delete(':id')
  cancel(@CurrentCtx() c: Ctx, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.cancel(c, id);
  }
}
