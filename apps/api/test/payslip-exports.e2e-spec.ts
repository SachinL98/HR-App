import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PDFDocument } from 'pdf-lib';
import request from 'supertest';

process.env.FILE_STORAGE_DIR = mkdtempSync(join(tmpdir(), 'hr-files-'));
process.env.THROTTLE_OFF = '1';

import { AppModule } from '../src/app.module';

const pw = 'correct horse battery';
const uniq = () => Math.random().toString(36).slice(2, 8);
const month = new Date().toISOString().slice(0, 7);
const binary = (
  res: request.Response,
  cb: (e: Error | null, b: Buffer) => void,
) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

describe('Payslip PDFs and payroll exports', () => {
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
  afterAll(() => app.close());
  const api = () =>
    request(app.getHttpServer() as Parameters<typeof request>[0]);
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  const setup = async () => {
    const u = uniq();
    const r = await api()
      .post('/auth/register')
      .send({
        orgName: `Slips ${u}`,
        country: 'GB',
        timeZone: 'Europe/London',
        currency: 'GBP',
        firstName: 'Olivia',
        lastName: 'Owner',
        email: `o-${u}@slip.test`,
        password: pw,
      })
      .expect(201);
    const owner = r.body.accessToken as string;
    const add = async (first: string) => {
      const inv = await api()
        .post('/invites')
        .set(auth(owner))
        .send({ email: `${uniq()}@slip.test` })
        .expect(201);
      const token = new URL(inv.body.devLink as string).searchParams.get(
        'token',
      );
      const acc = await api()
        .post('/auth/invites/accept')
        .send({ token, firstName: first, lastName: 'Worker', password: pw })
        .expect(201);
      const t = acc.body.accessToken as string;
      return {
        token: t,
        id: (await api().get('/me').set(auth(t))).body.id as string,
      };
    };
    const worker = await add('=cmd');
    const other = await add('Otto');
    const g = (
      await api()
        .post('/pay-groups')
        .set(auth(owner))
        .send({ name: 'Monthly', payDay: 25 })
        .expect(201)
    ).body.id as string;
    for (const m of [worker, other])
      await api()
        .put(`/members/${m.id}/salary`)
        .set(auth(owner))
        .send({
          payGroupId: g,
          basic: 3000,
          components: [],
          effectiveFrom: '2026-01-01',
        })
        .expect(200);
    const run = (
      await api()
        .post('/payroll/runs')
        .set(auth(owner))
        .send({ payGroupId: g, month })
        .expect(201)
    ).body.id as string;
    const step = (s: string) =>
      api().post(`/payroll/runs/${run}/${s}`).set(auth(owner)).expect(201);
    return { owner, worker, other, run, step };
  };
  const text = (path: string, t: string) =>
    api().get(path).set(auth(t)).buffer(true).parse(binary);

  it('exports a summary and every pay line, keeping spreadsheet formulas harmless and limiting who can download', async () => {
    const { owner, worker, run } = await setup();
    const sum = await text(`/payroll/runs/${run}/export/summary`, owner).expect(
      200,
    );
    expect(sum.headers['content-type']).toContain('text/csv');
    expect(sum.headers['content-disposition']).toContain('attachment');
    const body = (sum.body as Buffer).toString('utf8');
    expect(body).toContain('Gross,Deductions,Net');
    expect(body).toContain("'=cmd Worker"); // a name that looks like a formula is neutralised
    const lines = (
      await text(`/payroll/runs/${run}/export/lines`, owner).expect(200)
    ).body as Buffer;
    expect(lines.toString('utf8')).toContain('Basic');
    // Ordinary staff cannot download payroll.
    await api()
      .get(`/payroll/runs/${run}/export/summary`)
      .set(auth(worker.token))
      .expect(403);
    await api()
      .get(`/payroll/runs/${run}/export/bank`)
      .set(auth(worker.token))
      .expect(403);
  });

  it('builds the bank transfer file only once approved and only when everyone has bank details', async () => {
    const { owner, worker, other, run, step } = await setup();
    await text(`/payroll/runs/${run}/export/bank`, owner).expect(409); // still a draft
    await step('submit');
    await step('approve');
    const missing = await api()
      .get(`/payroll/runs/${run}/export/bank`)
      .set(auth(owner))
      .expect(400);
    expect(JSON.stringify(missing.body)).toContain('No bank details');
    for (const [m, acct] of [
      [worker, '12345678'],
      [other, '87654321'],
    ] as const)
      await api()
        .put(`/members/${m.id}/bank`)
        .set(auth(owner))
        .send({ holder: 'A Holder', bank: 'Test Bank', account: acct })
        .expect(200);
    const status = (
      await api().get('/payroll/bank-status').set(auth(owner)).expect(200)
    ).body as Record<string, { set: boolean; last4: string }>;
    expect(status[worker.id]).toEqual({ set: true, last4: '5678' }); // never the full number
    const file = (
      (await text(`/payroll/runs/${run}/export/bank`, owner).expect(200))
        .body as Buffer
    ).toString('utf8');
    expect(file).toContain('12345678');
    expect(file).toContain('3000.00');
    expect(file).toContain(`Salary `);
    await api()
      .put(`/members/${worker.id}/bank`)
      .set(auth(worker.token))
      .send({ holder: 'x', bank: 'y', account: '1234' })
      .expect(403);
  });

  it('gives each person their own finalised payslip as a PDF, on the company letterhead when there is one', async () => {
    const { owner, worker, other, run, step } = await setup();
    const mine = async (t: string) =>
      (
        (await api().get('/payslips/mine').set(auth(t)).expect(200)).body as {
          id: string;
        }[]
      )[0]?.id;
    await step('submit');
    await step('approve');
    // Not visible to staff until the run is finalised.
    const ownerSlips = (
      await api().get(`/payroll/runs/${run}`).set(auth(owner)).expect(200)
    ).body.payslips as { id: string; member: { id: string } }[];
    const workerSlip = ownerSlips.find((p) => p.member.id === worker.id)!.id;
    await api()
      .get(`/payslips/${workerSlip}/pdf`)
      .set(auth(worker.token))
      .expect(404);
    await step('finalize');
    expect(await mine(worker.token)).toBe(workerSlip);

    const pdf = await api()
      .get(`/payslips/${workerSlip}/pdf`)
      .set(auth(worker.token))
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.headers['content-disposition']).toContain('payslip-');
    // Someone else's payslip stays private, but payroll staff can open it.
    await api()
      .get(`/payslips/${workerSlip}/pdf`)
      .set(auth(other.token))
      .expect(404);
    await api().get(`/payslips/${workerSlip}/pdf`).set(auth(owner)).expect(200);

    // A "payslip" template with a letterhead is used as the background.
    const lh = await PDFDocument.create();
    lh.addPage([595.28, 841.89]).drawRectangle({
      x: 0,
      y: 0,
      width: 595,
      height: 80,
    });
    await api()
      .post('/document-templates')
      .set(auth(owner))
      .send({
        name: 'Payslip letterhead',
        kind: 'payslip',
        body: 'Payslip',
        letterheadBase64: Buffer.from(await lh.save()).toString('base64'),
        layout: { top: 160 },
      })
      .expect(201);
    const withLh = await api()
      .get(`/payslips/${workerSlip}/pdf`)
      .set(auth(worker.token))
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect((withLh.body as Buffer).length).toBeGreaterThan(
      (pdf.body as Buffer).length - 1,
    );
    const doc = await PDFDocument.load(withLh.body as Buffer);
    expect(doc.getPageCount()).toBe(1);
  });
});
