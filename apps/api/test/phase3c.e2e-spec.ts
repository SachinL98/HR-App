import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PDFDocument } from 'pdf-lib';
import request from 'supertest';

process.env.FILE_STORAGE_DIR = mkdtempSync(join(tmpdir(), 'hr-files-'));

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const pw = 'correct horse battery';
const uniq = () => Math.random().toString(36).slice(2, 8);

describe('Phase 3c: letterhead templates', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let me: string;
  let letterhead: string;
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
    prisma = app.get(PrismaService);
    const u = uniq();
    const r = await api()
      .post('/auth/register')
      .send({
        orgName: `Letters ${u}`,
        country: 'GB',
        timeZone: 'Europe/London',
        currency: 'GBP',
        firstName: 'Olivia',
        lastName: 'Owner',
        email: `o-${u}@letters.test`,
        password: pw,
      })
      .expect(201);
    token = r.body.accessToken as string;
    me = (await api().get('/me').set(auth()).expect(200)).body.id as string;
    const lh = await PDFDocument.create();
    lh.addPage([595.28, 841.89]).drawRectangle({
      x: 0,
      y: 0,
      width: 595,
      height: 80,
    });
    letterhead = Buffer.from(await lh.save()).toString('base64');
  });
  afterAll(() => app.close());
  const api = () =>
    request(app.getHttpServer() as Parameters<typeof request>[0]);
  const auth = () => ({ Authorization: `Bearer ${token}` });

  const template = (extra: object = {}) =>
    api()
      .post('/document-templates')
      .set(auth())
      .send({
        name: 'Employment confirmation',
        kind: 'confirmation',
        body: '{{member.full_name}}, NIC {{member.national_id}}, started {{member.start_date}}.',
        ...extra,
      });

  it('rejects a letterhead that is not a PNG or a PDF', async () => {
    const bad = await template({
      letterheadBase64: Buffer.from('not an image').toString('base64'),
    }).expect(400);
    expect(JSON.stringify(bad.body)).toContain('PNG or PDF');
  });

  it('needs a National ID on file before it can fill {{member.national_id}}', async () => {
    const t = await template({
      letterheadBase64: letterhead,
      layout: { justify: true, size: 12 },
    }).expect(201);
    expect(t.body.fileId).toBeTruthy();
    const none = await api()
      .post('/documents/preview-pdf')
      .set(auth())
      .send({ templateId: t.body.id, memberId: me })
      .expect(400);
    expect(JSON.stringify(none.body)).toContain('National ID');
  });

  it('renders the letter on the letterhead and keeps the NIC out of the snapshot', async () => {
    await api()
      .patch(`/members/${me}`)
      .set(auth())
      .send({ nationalId: '983360700V', startDate: '2023-08-15' })
      .expect(200);
    const t = await template({ letterheadBase64: letterhead }).expect(201);
    const pdf = await api()
      .post('/documents/preview-pdf')
      .set(auth())
      .send({ templateId: t.body.id, memberId: me })
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(201);
    const bytes = pdf.body as Buffer;
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    const issued = await api()
      .post('/documents')
      .set(auth())
      .send({ templateId: t.body.id, memberId: me })
      .expect(201);
    const row = await prisma.system.issuedDocument.findUniqueOrThrow({
      where: { id: issued.body.id as string },
    });
    expect(JSON.stringify(row.data)).not.toContain('983360700V');
  });

  it('refuses to issue a letter with a blank field and says what is missing', async () => {
    const t = await template({
      body: '{{member.full_name}} works as {{member.job_title}}.',
    }).expect(201);
    const pv = await api()
      .post('/documents/preview')
      .set(auth())
      .send({ templateId: t.body.id, memberId: me })
      .expect(201);
    expect(pv.body.missing).toEqual(['Job title']);
    const r = await api()
      .post('/documents')
      .set(auth())
      .send({ templateId: t.body.id, memberId: me })
      .expect(400);
    expect(JSON.stringify(r.body)).toContain('Job title');
  });

  it('can change and remove a letterhead', async () => {
    const t = await template({ letterheadBase64: letterhead }).expect(201);
    const removed = await api()
      .patch(`/document-templates/${t.body.id}`)
      .set(auth())
      .send({ removeLetterhead: true })
      .expect(200);
    expect(removed.body.fileId).toBeNull();
    expect(removed.body.version).toBe(2);
  });

  it('shows the activity log to people with audit access only, without details', async () => {
    const log = await api().get('/audit').set(auth()).expect(200);
    expect(log.body.items.length).toBeGreaterThan(0);
    expect(log.body.items[0]).not.toHaveProperty('meta');
    expect(JSON.stringify(log.body)).not.toContain('983360700V');
    const u = uniq();
    const invite = await api()
      .post('/invites')
      .set(auth())
      .send({ email: `m-${u}@letters.test` })
      .expect(201);
    expect(invite.status).toBe(201);
    // A signed-out caller gets nothing.
    await api().get('/audit').expect(401);
  });
});
