import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

/**
 * Sends email over SMTP, which every provider offers (Amazon SES, Zoho, SendGrid, Mailgun, Gmail...).
 *   SMTP_URL  e.g. smtps://username:password@smtp.example.com:465
 *   MAIL_FROM e.g. "Seamless Source HR <no-reply@example.com>"
 * Without SMTP_URL nothing is sent. Outside production the message is logged so you can use the
 * link while developing; in production the body is NEVER logged because it holds sign-in links.
 */
@Injectable()
export class MailService {
  private log = new Logger('Mail');
  private transport: Transporter | null = process.env.SMTP_URL
    ? createTransport(process.env.SMTP_URL)
    : null;

  /** True when real email is set up (so features may rely on it, like email verification). */
  get enabled() {
    return !!this.transport;
  }

  async send(to: string, subject: string, text: string, html?: string) {
    if (!this.transport) {
      if (process.env.NODE_ENV === 'production')
        this.log.warn(
          `No SMTP_URL is set, so "${subject}" to ${to} was NOT sent`,
        );
      else this.log.log(`to=${to} subject="${subject}"\n${text}`);
      return;
    }
    try {
      await this.transport.sendMail({
        from:
          process.env.MAIL_FROM ?? 'Seamless Source HR <no-reply@localhost>',
        to,
        subject,
        text,
        html: html ?? undefined,
      });
    } catch (e) {
      // Never let a mail outage break signing up or resetting; log the reason, not the content.
      this.log.error(
        `Could not send "${subject}" to ${to}: ${(e as Error).message}`,
      );
    }
  }
}

const esc = (s: string) =>
  s.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!,
  );

/** A plain, readable email with one button. */
export function emailBody(opts: {
  heading: string;
  lines: string[];
  button?: { label: string; url: string };
  footer?: string;
}) {
  const text = [
    opts.heading,
    '',
    ...opts.lines,
    ...(opts.button ? ['', `${opts.button.label}: ${opts.button.url}`] : []),
    '',
    opts.footer ?? '',
  ]
    .join('\n')
    .trim();
  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:480px;margin:auto;padding:24px;color:#0f172a">
<h2 style="margin:0 0 16px">${esc(opts.heading)}</h2>
${opts.lines.map((l) => `<p style="line-height:1.5">${esc(l)}</p>`).join('')}
${opts.button ? `<p><a href="${esc(opts.button.url)}" style="display:inline-block;background:#3b3fd8;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${esc(opts.button.label)}</a></p><p style="font-size:12px;color:#5f6b7e;word-break:break-all">Or paste this link: ${esc(opts.button.url)}</p>` : ''}
<p style="font-size:12px;color:#5f6b7e">${esc(opts.footer ?? 'If you did not expect this email, you can ignore it.')}</p></div>`;
  return { text, html };
}
