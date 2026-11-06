import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { BillingController } from './org/billing.controller';
import { SearchController } from './org/search.controller';
import { PeopleController } from './people/people.controller';
import { AuditController } from './org/audit.controller';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthController } from './auth/auth.controller';
import { AccountController } from './auth/account.controller';
import { AccountService } from './auth/account.service';
import { LoginThrottle } from './auth/login-throttle';
import { AuthService } from './auth/auth.service';
import { AuthGuard } from './auth/auth.guard';
import { MailService } from './auth/mail.service';
import { OrgController } from './org/org.controller';
import { AppController } from './app.controller';
import { LeaveController } from './leave/leave.controller';
import { DocumentsController } from './documents/documents.controller';
import { DocumentsService } from './documents/documents.service';
import { FileStore } from './documents/file-store';
import { PayrollController } from './payroll/payroll.controller';
import { PayrollService } from './payroll/payroll.service';
import { MeetingsController } from './meetings/meetings.controller';
import { MeetingsService } from './meetings/meetings.service';
import { NoticesController } from './notices/notices.controller';
import { NotificationsController } from './notifications/notifications.controller';
import { SetupController } from './leave/setup.controller';
import { LeaveService } from './leave/leave.service';
import { CronController } from './cron/cron.controller';
import { AvailabilityController } from './integrations/availability.controller';
import { IdentityController } from './integrations/identity.controller';
import { ProfileController } from './people/profile.controller';
import { ProfileService } from './people/profile.service';
import { ReminderJob } from './leave/reminders';
import { ApprovalsExtraController } from './leave/extras.controller';

if (process.env.NODE_ENV === 'production') {
  if (!process.env.SMTP_URL && process.env.ALLOW_NO_MAIL !== 'true')
    throw new Error(
      'SMTP_URL must be set in production (invites and password resets are emailed). Set ALLOW_NO_MAIL=true to start without email.',
    );
  for (const k of [
    'JWT_SECRET',
    'FIELD_ENCRYPTION_KEY',
    'DATABASE_URL',
    'DATABASE_SYSTEM_URL',
    'WEB_URL',
  ])
    if (!process.env[k]) throw new Error(`${k} must be set in production`);
  if ((process.env.JWT_SECRET ?? '').length < 32)
    throw new Error('JWT_SECRET must be at least 32 characters in production');
  if (
    /:pw@/.test(`${process.env.DATABASE_URL}${process.env.DATABASE_SYSTEM_URL}`)
  )
    throw new Error(
      'Change the database passwords from the development default "pw"',
    );
}

@Module({
  imports: [
    PrismaModule,
    ThrottlerModule.forRoot({
      // Per address per minute. When every request arrives from one front end (all-Vercel), raise it; the real per-person limit is the database-backed sign-in lockout.
      throttlers: [
        { ttl: 60_000, limit: Number(process.env.THROTTLE_LIMIT ?? 300) },
      ],
      // Only ever honoured under test, so a stray variable in production cannot switch rate limits off.
      skipIf: () =>
        process.env.NODE_ENV === 'test' && process.env.THROTTLE_OFF === '1',
    }),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET ?? 'dev-only-secret-change-me',
      signOptions: { expiresIn: '8h' },
    }),
  ],
  controllers: [
    CronController,
    AvailabilityController,
    IdentityController,
    ProfileController,
    AppController,
    AuthController,
    OrgController,
    LeaveController,
    MeetingsController,
    PayrollController,
    DocumentsController,
    NoticesController,
    NotificationsController,
    SetupController,
    AuditController,
    AccountController,
    PeopleController,
    ApprovalsExtraController,
    SearchController,
    BillingController,
  ],
  providers: [
    AuthService,
    LoginThrottle,
    MailService,
    AccountService,
    LeaveService,
    ReminderJob,
    MeetingsService,
    PayrollService,
    DocumentsService,
    FileStore,
    ProfileService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
