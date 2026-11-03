import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthController } from './auth/auth.controller';
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

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET)
  throw new Error('JWT_SECRET must be set in production');

@Module({
  imports: [
    PrismaModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET ?? 'dev-only-secret-change-me',
      signOptions: { expiresIn: '8h' },
    }),
  ],
  controllers: [
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
  ],
  providers: [
    AuthService,
    MailService,
    LeaveService,
    MeetingsService,
    PayrollService,
    DocumentsService,
    FileStore,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
