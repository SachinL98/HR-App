import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';

process.env.FILE_STORAGE_DIR = mkdtempSync(join(tmpdir(), 'hr-files-'));

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const pw = 'correct horse battery';
const uniq = () => Math.random().toString(36).slice(2, 8);
// A valid 1x1 transparent PNG.
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('Phase 3b: documents', () => {
  let app: INestApplication;
  let prisma: PrismaService;
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
  });
  afterAll(() => app.close());
  const api = () =>
    request(app.getHttpServer() as Parameters<typeof request>[0]);
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  const company = async (name: string) => {
    const u = uniq();
    const r = await api()
      .post('/auth/register')
      .send({
        orgName: `${name} ${u}`,
        country: 'GB',
        timeZone: 'Europe/London',
        currency: 'GBP',
        firstName: 'Olivia',
        lastName: 'Owner',
        email: `o-${u}@${name}.test`,
        password: pw,
      })
      .expect(201);
    const token = r.body.accessToken as string;
    const me = await api().get('/me').set(auth(token)).expect(200);
    return { token, id: me.body.id as string };
  };
  const addMember = async (owner: string, first = 'Sam') => {
    const inv = await api()
      .post('/invites')
      .set(auth(owner))
      .send({ email: `m-${uniq()}@x.test` })
      .expect(201);
    const token = new URL(inv.body.devLink as string).searchParams.get('token');
    const acc = await api()
      .post('/auth/invites/accept')
      .send({ token, firstName: first, lastName: 'Member', password: pw })
      .expect(201);
    const t = acc.body.accessToken as string;
    const me = await api().get('/me').set(auth(t)).expect(200);
    return { token: t, id: me.body.id as string };
  };

  let o: { token: string; id: string };
  let other: { token: string; id: string };
  let a: { token: string; id: string };
  let b: { token: string; id: string };
  let letterId: string;
  let certId: string;
  let stampId: string;
  let sigId: string;
  let docId: string;
  let code: string;

  beforeAll(async () => {
    o = await company('Docs');
    other = await company('Else');
    a = await addMember(o.token, 'Ann');
    b = await addMember(o.token, 'Bob');
  });

  it('lets only template managers create templates, and rejects unknown fields', async () => {
    const body = {
      name: 'Employment letter',
      kind: 'confirmation',
      body: 'To whom it may concern\n\n{{member.full_name}} works at {{company.name}}.\n\n{{signature.hr_manager}}\n{{stamp}}',
    };
    await api()
      .post('/document-templates')
      .set(auth(a.token))
      .send(body)
      .expect(403);
    const bad = await api()
      .post('/document-templates')
      .set(auth(o.token))
      .send({ ...body, body: 'Hi {{member.shoe_size}}' })
      .expect(400);
    expect(JSON.stringify(bad.body)).toContain('member.shoe_size');
    const ok = await api()
      .post('/document-templates')
      .set(auth(o.token))
      .send({ ...body, requestable: true })
      .expect(201);
    letterId = ok.body.id as string;
    expect(ok.body.fields).toEqual(['member.full_name', 'company.name']);
    const cert = await api()
      .post('/document-templates')
      .set(auth(o.token))
      .send({
        name: 'Salary certificate',
        kind: 'salary_cert',
        body: '{{member.full_name}} earns {{salary.currency}} {{salary.basic_monthly}} a month.',
      })
      .expect(201);
    certId = cert.body.id as string;
  });

  it('stores stamps and signatures, checking they are real PNGs', async () => {
    await api()
      .post('/seals')
      .set(auth(o.token))
      .send({
        kind: 'stamp',
        label: 'Company stamp',
        imageBase64: 'bm90IGEgcG5n',
      })
      .expect(400);
    await api()
      .post('/seals')
      .set(auth(o.token))
      .send({ kind: 'signature', label: 'HR Manager', imageBase64: PNG })
      .expect(400); // a signature belongs to a person
    const st = await api()
      .post('/seals')
      .set(auth(o.token))
      .send({ kind: 'stamp', label: 'Company stamp', imageBase64: PNG })
      .expect(201);
    stampId = st.body.id as string;
    expect(st.body.token).toBe('{{stamp}}');
    const sg = await api()
      .post('/seals')
      .set(auth(o.token))
      .send({
        kind: 'signature',
        label: 'HR Manager',
        signatoryId: o.id,
        imageBase64: PNG,
      })
      .expect(201);
    sigId = sg.body.id as string;
    expect(sg.body.token).toBe('{{signature.hr_manager}}');
    await api().get('/seals').set(auth(a.token)).expect(403);
  });

  it('previews a letter with the person’s details filled in', async () => {
    const r = await api()
      .post('/documents/preview')
      .set(auth(o.token))
      .send({ templateId: letterId, memberId: a.id })
      .expect(201);
    expect(r.body.text).toContain('Ann Member works at Docs');
    expect(r.body.needsStamp).toBe(true);
    expect(r.body.needsSignatures).toEqual(['hr_manager']);
    await api()
      .post('/documents/preview')
      .set(auth(a.token))
      .send({ templateId: letterId, memberId: a.id })
      .expect(403);
  });

  it('issues a PDF only when the stamp and signature it needs are applied', async () => {
    await api()
      .post('/documents')
      .set(auth(o.token))
      .send({ templateId: letterId, memberId: a.id })
      .expect(400);
    await api()
      .post('/documents')
      .set(auth(o.token))
      .send({ templateId: letterId, memberId: a.id, sealIds: [stampId] })
      .expect(400); // still missing the signature
    const r = await api()
      .post('/documents')
      .set(auth(o.token))
      .send({
        templateId: letterId,
        memberId: a.id,
        sealIds: [stampId, sigId],
      })
      .expect(201);
    docId = r.body.id as string;
    code = r.body.verifyCode as string;
    expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  });

  it('serves the PDF to the person and to issuers, and to nobody else', async () => {
    const pdf = await api()
      .get(`/documents/${docId}/pdf`)
      .set(auth(a.token))
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (d: Buffer) => chunks.push(d));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    await api().get(`/documents/${docId}/pdf`).set(auth(o.token)).expect(200);
    await api().get(`/documents/${docId}/pdf`).set(auth(b.token)).expect(404);
    await api()
      .get(`/documents/${docId}/pdf`)
      .set(auth(other.token))
      .expect(404);

    const mine = await api().get('/documents').set(auth(a.token)).expect(200);
    expect(mine.body.length).toBe(1);
    const bobs = await api().get('/documents').set(auth(b.token)).expect(200);
    expect(bobs.body.length).toBe(0);
    const n = await api().get('/notifications').set(auth(a.token)).expect(200);
    expect(
      (n.body.items as { event: string }[]).some(
        (i) => i.event === 'document.issued',
      ),
    ).toBe(true);
  });

  it('keeps files encrypted on disk', async () => {
    const d = await prisma.system.issuedDocument.findFirstOrThrow({
      where: { id: docId },
    });
    const f = await prisma.system.file.findFirstOrThrow({
      where: { id: d.fileId },
    });
    const raw = readFileSync(
      join(process.env.FILE_STORAGE_DIR as string, f.storageKey),
    );
    expect(raw.subarray(0, 5).toString()).not.toBe('%PDF-');
    expect(raw.toString('latin1')).not.toContain('Ann Member');
  });

  it('verifies a document publicly without exposing personal data, and honours revocation', async () => {
    const ok = await api().get(`/verify/${code}`).expect(200);
    expect(ok.body).toMatchObject({
      valid: true,
      document: 'Employment letter',
    });
    expect(JSON.stringify(ok.body)).not.toContain('Ann');
    const lower = await api().get(`/verify/${code.toLowerCase()}`).expect(200);
    expect(lower.body.valid).toBe(true);

    await api()
      .post(`/documents/${docId}/revoke`)
      .set(auth(a.token))
      .expect(403);
    await api()
      .post(`/documents/${docId}/revoke`)
      .set(auth(o.token))
      .expect(201);
    const revoked = await api().get(`/verify/${code}`).expect(200);
    expect(revoked.body).toMatchObject({ valid: false, revoked: true });
    await api().get(`/documents/${docId}/pdf`).set(auth(a.token)).expect(404);

    const none = await api().get('/verify/AAAA-BBBB-CCCC').expect(200);
    expect(none.body).toMatchObject({ valid: false, found: false });
  });

  it('needs payroll access for salary fields and keeps salary out of the data snapshot', async () => {
    await api()
      .post('/documents')
      .set(auth(o.token))
      .send({ templateId: certId, memberId: a.id })
      .expect(400); // no salary set yet
    const g = await api()
      .post('/pay-groups')
      .set(auth(o.token))
      .send({ name: 'Monthly', payDay: 25 })
      .expect(201);
    await api()
      .put(`/members/${a.id}/salary`)
      .set(auth(o.token))
      .send({
        payGroupId: g.body.id,
        basic: 4321.5,
        components: [],
        effectiveFrom: '2026-01-01',
      })
      .expect(200);

    // Someone who can issue documents but not see payroll is refused.
    await api()
      .put(`/members/${b.id}/permissions`)
      .set(auth(o.token))
      .send({
        grants: [
          { action: 'document.issue', scopeType: 'COMPANY', scopeIds: [] },
        ],
      })
      .expect(200);
    await api()
      .post('/documents/preview')
      .set(auth(b.token))
      .send({ templateId: certId, memberId: a.id })
      .expect(403);

    const r = await api()
      .post('/documents')
      .set(auth(o.token))
      .send({ templateId: certId, memberId: a.id })
      .expect(201);
    const d = await prisma.system.issuedDocument.findFirstOrThrow({
      where: { id: r.body.id as string },
    });
    expect(JSON.stringify(d.data)).not.toContain('4321');
    expect(d.data).toMatchObject({ containsSalary: true });
  });

  it('runs the request, approve, issue flow', async () => {
    const t = await api()
      .get('/document-templates/requestable')
      .set(auth(a.token))
      .expect(200);
    expect(t.body.length).toBe(1); // only the requestable one
    await api()
      .post('/document-requests')
      .set(auth(a.token))
      .send({ templateId: certId })
      .expect(404); // salary certificate is not requestable

    const req = await api()
      .post('/document-requests')
      .set(auth(a.token))
      .send({ templateId: letterId, purpose: 'Visa application' })
      .expect(201);
    await api()
      .post('/document-requests')
      .set(auth(a.token))
      .send({ templateId: letterId })
      .expect(409);

    await api()
      .get('/document-requests/inbox')
      .set(auth(a.token))
      .expect(200)
      .expect([]);
    const inbox = await api()
      .get('/document-requests/inbox')
      .set(auth(o.token))
      .expect(200);
    expect(inbox.body.length).toBe(1);

    // Cannot issue against it before it is approved
    await api()
      .post('/documents')
      .set(auth(o.token))
      .send({
        templateId: letterId,
        memberId: a.id,
        sealIds: [stampId, sigId],
        requestId: req.body.id,
      })
      .expect(400);
    await api()
      .post(`/document-requests/${req.body.id as string}/decision`)
      .set(auth(a.token))
      .send({ decision: 'APPROVED' })
      .expect(403);
    await api()
      .post(`/document-requests/${req.body.id as string}/decision`)
      .set(auth(o.token))
      .send({ decision: 'REJECTED' })
      .expect(400); // a reason is required
    await api()
      .post(`/document-requests/${req.body.id as string}/decision`)
      .set(auth(o.token))
      .send({ decision: 'APPROVED' })
      .expect(201);

    // The approval is for Ann only
    await api()
      .post('/documents')
      .set(auth(o.token))
      .send({
        templateId: letterId,
        memberId: b.id,
        sealIds: [stampId, sigId],
        requestId: req.body.id,
      })
      .expect(400);
    const issued = await api()
      .post('/documents')
      .set(auth(o.token))
      .send({
        templateId: letterId,
        memberId: a.id,
        sealIds: [stampId, sigId],
        requestId: req.body.id,
      })
      .expect(201);
    const mine = await api()
      .get('/document-requests/mine')
      .set(auth(a.token))
      .expect(200);
    expect(mine.body[0].status).toBe('APPROVED');
    expect(mine.body[0].details.documentId).toBe(issued.body.id);
  });

  it('archives templates and removes stamps', async () => {
    await api().delete(`/seals/${stampId}`).set(auth(o.token)).expect(200);
    await api()
      .post('/documents')
      .set(auth(o.token))
      .send({ templateId: letterId, memberId: a.id, sealIds: [stampId, sigId] })
      .expect(400);
    await api()
      .delete(`/document-templates/${letterId}`)
      .set(auth(o.token))
      .expect(200);
    await api()
      .post('/documents/preview')
      .set(auth(o.token))
      .send({ templateId: letterId, memberId: a.id })
      .expect(404);
  });
});
