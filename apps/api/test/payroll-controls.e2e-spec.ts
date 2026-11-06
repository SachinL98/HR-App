import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';

process.env.FILE_STORAGE_DIR = mkdtempSync(join(tmpdir(), 'hr-files-'));

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const pw = 'correct horse battery';
const uniq = () => Math.random().toString(36).slice(2, 8);

describe('Payroll controls: two-person approval, own pay, history', () => {
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

  const company = async () => {
    const u = uniq();
    const r = await api()
      .post('/auth/register')
      .send({
        orgName: `Pay ${u}`,
        country: 'GB',
        timeZone: 'Europe/London',
        currency: 'GBP',
        firstName: 'Olivia',
        lastName: 'Owner',
        email: `o-${u}@pay.test`,
        password: pw,
      })
      .expect(201);
    const token = r.body.accessToken as string;
    const me = await api().get('/me').set(auth(token)).expect(200);
    return {
      token,
      id: me.body.id as string,
      tenantId: r.body.tenant.id as string,
    };
  };
  const addMember = async (owner: string, roleId?: string) => {
    const inv = await api()
      .post('/invites')
      .set(auth(owner))
      .send({ email: `m-${uniq()}@pay.test`, jobRoleId: roleId })
      .expect(201);
    const token = new URL(inv.body.devLink as string).searchParams.get('token');
    const acc = await api()
      .post('/auth/invites/accept')
      .send({ token, firstName: 'Pat', lastName: 'Payroll', password: pw })
      .expect(201);
    const t = acc.body.accessToken as string;
    const me = await api().get('/me').set(auth(t)).expect(200);
    return { token: t, id: me.body.id as string };
  };
  const group = async (t: string) =>
    (
      await api()
        .post('/pay-groups')
        .set(auth(t))
        .send({ name: 'Monthly', payDay: 25 })
        .expect(201)
    ).body.id as string;
  const pay = (payGroupId: string, basic: number, reason?: string) => ({
    payGroupId,
    basic,
    components: [],
    effectiveFrom: '2026-01-01',
    reason,
  });
  const month = new Date().toISOString().slice(0, 7);

  it('records every salary change, and asks why when pay changes', async () => {
    const o = await company();
    const worker = await addMember(o.token);
    const g = await group(o.token);
    await api()
      .put(`/members/${worker.id}/salary`)
      .set(auth(o.token))
      .send(pay(g, 3000))
      .expect(200);
    await api()
      .put(`/members/${worker.id}/salary`)
      .set(auth(o.token))
      .send(pay(g, 3200))
      .expect(400); // no reason
    await api()
      .put(`/members/${worker.id}/salary`)
      .set(auth(o.token))
      .send(pay(g, 3200, 'Annual review'))
      .expect(200);
    const h = await api()
      .get(`/members/${worker.id}/salary/history`)
      .set(auth(o.token))
      .expect(200);
    expect(h.body.changes.map((c: { basic: number }) => c.basic)).toEqual([
      3200, 3000,
    ]);
    expect(h.body.changes[0].reason).toBe('Annual review');
    expect(h.body.changes[1].reason).toBe('First salary');
    await api()
      .get(`/members/${worker.id}/salary/history`)
      .set(auth(worker.token))
      .expect(403);
    // Stored encrypted, and the history table cannot be edited or deleted by the app.
    const raw = await prisma.system.salaryChange.findFirstOrThrow({
      where: { memberId: worker.id },
    });
    expect(Buffer.from(raw.basicEnc).toString('utf8')).not.toContain('3000');
  });

  it('lets a single payroll person run payroll alone, and notes it in the activity log', async () => {
    const o = await company();
    const g = await group(o.token);
    const w = await addMember(o.token);
    await api()
      .put(`/members/${w.id}/salary`)
      .set(auth(o.token))
      .send(pay(g, 2500))
      .expect(200);
    await api()
      .put(`/members/${o.id}/salary`)
      .set(auth(o.token))
      .send(pay(g, 5000))
      .expect(200); // own pay, nobody else to ask
    const run = await api()
      .post('/payroll/runs')
      .set(auth(o.token))
      .send({ payGroupId: g, month })
      .expect(201);
    const id = run.body.id as string;
    for (const step of ['submit', 'approve', 'finalize'])
      await api()
        .post(`/payroll/runs/${id}/${step}`)
        .set(auth(o.token))
        .expect(201);
    const log = await api()
      .get('/audit?action=payroll')
      .set(auth(o.token))
      .expect(200);
    const actions = (log.body.items as { action: string }[]).map(
      (i) => i.action,
    );
    expect(actions).toContain('payroll.run.approved.solo');
    expect(actions).toContain('payroll.salary.set.self.solo');
  });

  it('needs a second person once two people can run payroll', async () => {
    const o = await company();
    const role = await api()
      .post('/roles')
      .set(auth(o.token))
      .send({
        name: 'Payroll lead',
        defaultPermissions: ['payroll.manage', 'payroll.view'],
      })
      .expect(201);
    const lead = await addMember(o.token, role.body.id as string);
    const w = await addMember(o.token);
    const g = await group(o.token);
    await api()
      .put(`/members/${w.id}/salary`)
      .set(auth(o.token))
      .send(pay(g, 2500))
      .expect(200);

    // Nobody sets their own pay once there are two payroll people.
    await api()
      .put(`/members/${o.id}/salary`)
      .set(auth(o.token))
      .send(pay(g, 9000))
      .expect(403);
    await api()
      .put(`/members/${lead.id}/salary`)
      .set(auth(lead.token))
      .send(pay(g, 4000))
      .expect(403);
    await api()
      .put(`/members/${o.id}/salary`)
      .set(auth(lead.token))
      .send(pay(g, 9000))
      .expect(200);

    const run = await api()
      .post('/payroll/runs')
      .set(auth(o.token))
      .send({ payGroupId: g, month })
      .expect(201);
    const id = run.body.id as string;
    await api()
      .post(`/payroll/runs/${id}/submit`)
      .set(auth(o.token))
      .expect(201);
    // Frozen once sent for approval.
    await api()
      .post(`/payroll/runs/${id}/recompute`)
      .set(auth(o.token))
      .expect(409);

    // The sender can neither approve nor release it.
    await api()
      .post(`/payroll/runs/${id}/approve`)
      .set(auth(o.token))
      .expect(403);
    const seen = await api()
      .get(`/payroll/runs/${id}`)
      .set(auth(o.token))
      .expect(200);
    expect(seen.body.youMustWait).toBe(true);
    expect(seen.body.people.submittedBy).toBe('Olivia Owner');

    // Two people clicking approve at once: exactly one wins.
    const both = await Promise.all([
      api().post(`/payroll/runs/${id}/approve`).set(auth(lead.token)),
      api().post(`/payroll/runs/${id}/approve`).set(auth(lead.token)),
    ]);
    expect(both.map((r) => r.status).sort()).toEqual([201, 409]);

    await api()
      .post(`/payroll/runs/${id}/finalize`)
      .set(auth(o.token))
      .expect(403);
    await api()
      .post(`/payroll/runs/${id}/finalize`)
      .set(auth(lead.token))
      .expect(201);
    const done = await api()
      .get(`/payroll/runs/${id}`)
      .set(auth(lead.token))
      .expect(200);
    expect(done.body.people).toMatchObject({
      preparedBy: 'Olivia Owner',
      approvedBy: 'Pat Payroll',
      finalizedBy: 'Pat Payroll',
    });
    // The lead was told a run was waiting.
    const notes = await api()
      .get('/notifications')
      .set(auth(lead.token))
      .expect(200);
    expect(JSON.stringify(notes.body)).toContain('waiting for your approval');
  });
});
