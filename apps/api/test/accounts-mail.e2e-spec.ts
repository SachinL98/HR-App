import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';

process.env.FILE_STORAGE_DIR = mkdtempSync(join(tmpdir(), 'hr-files-'));
// A mail server that is not there: email counts as "set up", but sending fails quietly.
process.env.SMTP_URL = 'smtp://127.0.0.1:1';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const pw = 'correct horse battery';
const uniq = () => Math.random().toString(36).slice(2, 8);

describe('Accounts when email is set up', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });
  afterAll(async () => {
    delete process.env.SMTP_URL;
    await app.close();
  });
  const api = () =>
    request(app.getHttpServer() as Parameters<typeof request>[0]);

  it('needs the email address confirmed before the first sign-in', async () => {
    const u = uniq();
    const email = `v-${u}@mail.test`;
    const r = await api()
      .post('/auth/register')
      .send({
        orgName: `Mail ${u}`,
        country: 'GB',
        timeZone: 'Europe/London',
        currency: 'GBP',
        firstName: 'Vera',
        lastName: 'Owner',
        email,
        password: pw,
      })
      .expect(201);
    expect(r.body.verifyEmail).toBe(true);
    expect(r.body.accessToken).toBeUndefined();
    const blocked = await api()
      .post('/auth/login')
      .send({ email, password: pw })
      .expect(403);
    expect(JSON.stringify(blocked.body)).toContain('confirm your email');
    // A second email within a minute is held back; pretend a minute has passed.
    const prisma = app.get(PrismaService);
    await prisma.system.userToken.updateMany({
      where: { user: { email } },
      data: { createdAt: new Date(Date.now() - 120_000) },
    });
    const again = await api()
      .post('/auth/verify-email/resend')
      .send({ email })
      .expect(201);
    const token = new URL(again.body.devLink as string).searchParams.get(
      'token',
    );
    await api().post('/auth/verify-email').send({ token }).expect(201);
    await api().post('/auth/login').send({ email, password: pw }).expect(201);
  });
});
