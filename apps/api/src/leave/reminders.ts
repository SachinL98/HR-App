import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { LeaveService } from './leave.service';

/**
 * Hourly check for requests nobody has answered. Each request is nudged at most once a day.
 * A plain timer, so there is nothing extra to install. With several API servers every one runs it,
 * so move it to a single worker or a scheduler before scaling out (the once-a-day guard limits repeats).
 */
@Injectable()
export class ReminderJob implements OnModuleInit, OnModuleDestroy {
  private log = new Logger('Reminders');
  private timer?: NodeJS.Timeout;
  constructor(private leave: LeaveService) {}

  onModuleInit() {
    // Serverless hosts have no long-lived process; they call GET /cron/reminders instead.
    if (process.env.NODE_ENV === 'test' || process.env.VERCEL) return;
    this.timer = setInterval(() => void this.run(), 3600_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async run() {
    try {
      const r = await this.leave.remindPending();
      if (r.reminded)
        this.log.log(`Reminded approvers about ${r.reminded} request(s)`);
    } catch (e) {
      this.log.error(`Reminder run failed: ${(e as Error).message}`);
    }
  }
}
