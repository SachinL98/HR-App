import {
  Controller,
  Get,
  Headers,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { Public } from '../common/ctx';
import { LeaveService } from '../leave/leave.service';

/**
 * Scheduled work for hosts that run no always-on server (Vercel Cron calls this with
 * `Authorization: Bearer $CRON_SECRET`). Without CRON_SECRET the endpoint does not exist.
 */
@Controller('cron')
export class CronController {
  constructor(private leave: LeaveService) {}

  @Public()
  @Get('reminders')
  async reminders(@Headers('authorization') auth?: string) {
    const secret = process.env.CRON_SECRET;
    if (!secret) throw new NotFoundException();
    const want = Buffer.from(`Bearer ${secret}`);
    const got = Buffer.from(auth ?? '');
    if (got.length !== want.length || !timingSafeEqual(got, want))
      throw new UnauthorizedException();
    return this.leave.remindPending();
  }
}
