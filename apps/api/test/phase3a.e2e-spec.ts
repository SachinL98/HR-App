import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const pw = 'correct horse battery';
const uniq = () => Math.random().toString(36).slice(2, 8);

describe('Phase 3a: payroll', () => {
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
    return {
      token,
      tenantId: r.body.tenant.id as string,
      id: me.body.id as string,
    };
  };
  const addMember = async (owner: string) => {
    const inv = await api()
      .post('/invites')
      .set(auth(owner))
      .send({ email: `m-${uniq()}@x.test` })
      .expect(201);
    const token = new URL(inv.body.devLink as string).searchParams.get('token');
    const acc = await api()
      .post('/auth/invites/accept')
      .send({ token, firstName: 'Sam', lastName: 'M', password: pw })
      .expect(201);
    const t = acc.body.accessToken as string;
    const me = await api().get('/me').set(auth(t)).expect(200);
    return { token: t, id: me.body.id as string };
  };

  const salary = (payGroupId: string, basic = 3000) => ({
    payGroupId,
    basic,
    components: [
      {
        code: 'TRAVEL',
        label: 'Travel',
        type: 'fixed',
        value: 0,
        taxable: false,
      },
    ],
    effectiveFrom: '2026-01-01',
  });

  let o: { token: string; tenantId: string; id: string };
  let other: { token: string; tenantId: string; id: string };
  let a: { token: string; id: string };
  let b: { token: string; id: string };
  let groupId: string;
  let runId: string;
  const MONTH = '2027-03'; // 23 working days

  beforeAll(async () => {
    o = await company('Pay');
    other = await company('Else');
    a = await addMember(o.token);
    b = await addMember(o.token);
  });

  it('keeps payroll away from people without the permission', async () => {
    await api().get('/pay-groups').set(auth(a.token)).expect(403);
    await api()
      .post('/pay-groups')
      .set(auth(a.token))
      .send({ name: 'X', payDay: 25 })
      .expect(403);
    await api().get('/payroll/runs').set(auth(a.token)).expect(403);
  });

  it('creates a UK pay group and validates it', async () => {
    await api()
      .post('/pay-groups')
      .set(auth(o.token))
      .send({ name: 'Bad', payDay: 40 })
      .expect(400);
    await api()
      .post('/pay-groups')
      .set(auth(o.token))
      .send({ name: 'Bad', payDay: 25, taxRegime: 'fr' })
      .expect(400);
    const g = await api()
      .post('/pay-groups')
      .set(auth(o.token))
      .send({ name: 'Monthly UK', payDay: 25, taxRegime: 'uk' })
      .expect(201);
    groupId = g.body.id as string;
    expect(g.body.currency).toBe('GBP');
  });

  it('stores salaries encrypted and returns them to payroll users only', async () => {
    await api()
      .put(`/members/${a.id}/salary`)
      .set(auth(o.token))
      .send(salary(groupId))
      .expect(200);
    await api()
      .put(`/members/${b.id}/salary`)
      .set(auth(o.token))
      .send(salary(groupId))
      .expect(200);
    await api()
      .put(`/members/${a.id}/salary`)
      .set(auth(a.token))
      .send(salary(groupId))
      .expect(403);
    await api()
      .put(`/members/${a.id}/salary`)
      .set(auth(o.token))
      .send({ ...salary(groupId), basic: -5 })
      .expect(400);

    const list = await api()
      .get('/payroll/salaries')
      .set(auth(o.token))
      .expect(200);
    expect(list.body.length).toBe(2);
    expect(list.body[0].basic).toBe(3000);

    const raw = await prisma.system.salaryStructure.findFirstOrThrow({
      where: { memberId: a.id },
    });
    expect(Buffer.from(raw.basicEnc).toString('utf8')).not.toContain('3000');
  });

  it('deducts approved unpaid leave from that member only', async () => {
    const types = await api().get('/leave-types').set(auth(o.token));
    const unpaid = (types.body as { id: string; code: string }[]).find(
      (t) => t.code === 'UNPAID',
    );
    const req = await api()
      .post('/requests')
      .set(auth(b.token))
      .send({
        type: 'LEAVE',
        leaveTypeId: unpaid?.id,
        startDate: '2027-03-02',
        endDate: '2027-03-02',
      })
      .expect(201);
    await api()
      .post(`/requests/${req.body.id as string}/decision`)
      .set(auth(o.token))
      .send({ decision: 'APPROVED' })
      .expect(201);
  });

  it('runs payroll with UK rules, once per pay group and month', async () => {
    const r = await api()
      .post('/payroll/runs')
      .set(auth(o.token))
      .send({ payGroupId: groupId, month: MONTH })
      .expect(201);
    runId = r.body.id as string;
    expect(r.body.payslipCount).toBe(2);
    await api()
      .post('/payroll/runs')
      .set(auth(o.token))
      .send({ payGroupId: groupId, month: MONTH })
      .expect(409);

    const run = await api()
      .get(`/payroll/runs/${runId}`)
      .set(auth(o.token))
      .expect(200);
    expect(run.body.ruleVersion).toBe('uk-2025-26');
    const slips = run.body.payslips as {
      member: { id: string };
      gross: number;
      net: number;
      unpaidDays: string;
    }[];
    const sa = slips.find((s) => s.member.id === a.id);
    const sb = slips.find((s) => s.member.id === b.id);
    expect(sa?.gross).toBe(3000);
    expect(sa?.net).toBe(2354.29); // matches the engine's worked UK example
    expect(Number(sb?.unpaidDays)).toBe(1);
    expect(sb?.gross).toBe(2869.57); // 3000 less 1/23 of basic
    expect(run.body.totals.gross).toBe(5869.57);
  });

  it('moves a run through review, approval and finalisation, then locks it', async () => {
    await api()
      .post(`/payroll/runs/${runId}/finalize`)
      .set(auth(o.token))
      .expect(409);
    await api()
      .post(`/payroll/runs/${runId}/approve`)
      .set(auth(o.token))
      .expect(409);
    await api()
      .post(`/payroll/runs/${runId}/submit`)
      .set(auth(o.token))
      .expect(201);
    await api()
      .post(`/payroll/runs/${runId}/recompute`)
      .set(auth(o.token))
      .expect(409); // frozen once sent for approval
    await api()
      .post(`/payroll/runs/${runId}/approve`)
      .set(auth(o.token))
      .expect(201);
    await api()
      .post(`/payroll/runs/${runId}/recompute`)
      .set(auth(o.token))
      .expect(409);

    const none = await api()
      .get('/payslips/mine')
      .set(auth(a.token))
      .expect(200);
    expect(none.body.length).toBe(0); // not visible before finalisation

    await api()
      .post(`/payroll/runs/${runId}/finalize`)
      .set(auth(o.token))
      .expect(201);
    await api()
      .post(`/payroll/runs/${runId}/reopen`)
      .set(auth(o.token))
      .expect(409);
  });

  it('shows each person only their own payslip, and tells them it is ready', async () => {
    const mine = await api()
      .get('/payslips/mine')
      .set(auth(a.token))
      .expect(200);
    expect(mine.body.length).toBe(1);
    expect(mine.body[0].net).toBe(2354.29);
    const id = mine.body[0].id as string;

    const detail = await api()
      .get(`/payslips/${id}`)
      .set(auth(a.token))
      .expect(200);
    expect(
      (detail.body.lines as { code: string }[]).map((l) => l.code),
    ).toEqual(expect.arrayContaining(['BASIC', 'PAYE', 'NI', 'PENSION_EE']));

    // Another employee cannot read it, even knowing the id
    await api().get(`/payslips/${id}`).set(auth(b.token)).expect(404);
    // Another company cannot either
    await api().get(`/payslips/${id}`).set(auth(other.token)).expect(404);
    // Payroll staff can
    await api().get(`/payslips/${id}`).set(auth(o.token)).expect(200);

    const n = await api().get('/notifications').set(auth(a.token)).expect(200);
    expect(
      (n.body.items as { event: string }[]).some(
        (i) => i.event === 'payslip.issued',
      ),
    ).toBe(true);
  });

  it('gates payroll and statutory rules by plan', async () => {
    await prisma.system.subscription.update({
      where: { tenantId: o.tenantId },
      data: { tier: 'SILVER', status: 'ACTIVE' },
    });
    await api()
      .post('/pay-groups')
      .set(auth(o.token))
      .send({ name: 'Plain', payDay: 28 })
      .expect(201);
    await api()
      .post('/pay-groups')
      .set(auth(o.token))
      .send({ name: 'Statutory', payDay: 28, taxRegime: 'lk' })
      .expect(403);
    await prisma.system.subscription.update({
      where: { tenantId: o.tenantId },
      data: { tier: 'BRONZE' },
    });
    await api()
      .post('/pay-groups')
      .set(auth(o.token))
      .send({ name: 'Nope', payDay: 28 })
      .expect(403);
  });
});
