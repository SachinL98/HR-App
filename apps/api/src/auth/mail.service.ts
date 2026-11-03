import { Injectable, Logger } from '@nestjs/common';

/** Placeholder. Phase 2 swaps this for the company's Zoho Mail / SES sender. */
@Injectable()
export class MailService {
  private log = new Logger('Mail');
  send(to: string, subject: string, body: string): Promise<void> {
    this.log.log(`to=${to} subject="${subject}"\n${body}`);
    return Promise.resolve();
  }
}
