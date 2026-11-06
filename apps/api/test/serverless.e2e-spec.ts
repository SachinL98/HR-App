import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtempSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PDFDocument } from 'pdf-lib';
import request from 'supertest';

const dir = mkdtempSync(join(tmpdir(), 'hr-files-'));
process.env.FILE_STORAGE_DIR = dir;
process.env.FILE_STORAGE = 'db'; // keep file bytes in the database, as on Vercel
process.env.CRON_SECRET = 'cron-secret-for-tests';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const pw = 'correct horse battery';
const uniq = () => Math.random().toString(36).slice(2, 8);

async function boot() {
  const mod = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = mod.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  return app;
}
const http = (a: INestApplication) =>
  request(a.getHttpServer() as Parameters<typeof request>[0]);

describe('Running without a disk or shared memory (serverless)', () => {
  let a: INestApplication;
  let b: INestApplication; // a second "server" that shares nothing but the database
  beforeAll(async () => {
    a = await boot();
    b = await boot();
  });
  afterAll(async () => {
    await a.close();
    await b.close();
  });

  it('keeps encrypted files in the database and reads them back', async () => {
    const u = uniq();
    const email = `s-${u}@sls.test`;
    const reg = await http(a)
      .post('/auth/register')
      .send({
        orgName: `Sls ${u}`,
        country: 'GB',
        timeZone: 'Europe/London',
        currency: 'GBP',
        firstName: 'Sam',
        lastName: 'Owner',
        email,
        password: pw,
      })
      .expect(201);
    const auth = { Authorization: `Bearer ${reg.body.accessToken as string}` };
    const me = await http(a).get('/me').set(auth).expect(200);
    const pdf = await PDFDocument.create();
    pdf.addPage().drawText('Kept in the database');
    const doc = await http(a)
      .post(`/members/${me.body.id as string}/documents`)
      .set(auth)
      .send({
        title: 'Contract',
        kind: 'contract',
        fileName: 'c.pdf',
        fileBase64: Buffer.from(await pdf.save()).toString('base64'),
        visibleToMember: true,
      })
      .expect(201);

    expect(readdirSync(dir)).toHaveLength(0); // nothing was written to disk
    const sys = b.get(PrismaService).system;
    const { tenantId } = await sys.member.findUniqueOrThrow({
      where: { id: me.body.id as string },
    });
    const blobs = await sys.fileBlob.count({ where: { tenantId } });
    expect(blobs).toBeGreaterThan(0);

    // A different server instance can read it, and what is stored is ciphertext, not a PDF.
    const login = await http(b)
      .post('/auth/login')
      .send({ email, password: pw })
      .expect(201);
    const f = await http(b)
      .get(`/member-documents/${doc.body.id as string}/file`)
      .set({ Authorization: `Bearer ${login.body.accessToken as string}` })
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect((f.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    const raw = await sys.fileBlob.findFirst({ where: { tenantId } });
    expect(Buffer.from(raw!.data).subarray(0, 5).toString()).not.toBe('%PDF-');
  });

  it('shares sign-in lockouts between servers', async () => {
    const email = `lock-${uniq()}@sls.test`;
    for (let i = 0; i < 5; i++)
      await http(a)
        .post('/auth/login')
        .send({ email, password: 'wrong-password-1' })
        .expect(401);
    // The other server has seen none of those attempts itself, yet refuses.
    await http(b)
      .post('/auth/login')
      .send({ email, password: 'wrong-password-1' })
      .expect(429);
  });

  it('runs scheduled reminders only with the secret', async () => {
    await http(a).get('/cron/reminders').expect(401);
    await http(a)
      .get('/cron/reminders')
      .set('Authorization', 'Bearer nope')
      .expect(401);
    const ok = await http(a)
      .get('/cron/reminders')
      .set('Authorization', 'Bearer cron-secret-for-tests')
      .expect(200);
    expect(ok.body).toHaveProperty('reminded');
  });
});
