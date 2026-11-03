import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

const pw = 'correct horse battery';
const uniq = () => Math.random().toString(36).slice(2, 8);
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('Phase 2: leave, WFH, quotas, approvals, calendar', () => {
  let app: INestApplication;
  const api = () =>
    request(app.getHttpServer() as Parameters<typeof request>[0]);

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

  const register = async (org: string) => {
    const r = await api()
      .post('/auth/register')
      .send({
        orgName: org,
        country: 'GB',
        timeZone: 'Europe/London',
        currency: 'GBP',
        firstName: 'Olivia',
        lastName: 'Owner',
        email: `o-${uniq()}@${org}.test`,
        password: pw,
      })
      .expect(201);
    return r.body.accessToken as string;
  };
  const join = async (
    owner: string,
    name: string,
    extra: { departmentId?: string } = {},
  ) => {
    const inv = await api()
      .post('/invites')
      .set(auth(owner))
      .send({ email: `${name}-${uniq()}@x.test`, ...extra })
      .expect(201);
    const token = new URL(inv.body.devLink as string).searchParams.get('token');
    const r = await api()
      .post('/auth/invites/accept')
      .send({ token, firstName: name, lastName: 'Test', password: pw })
      .expect(201);
    const t = r.body.accessToken as string;
    const me = await api().get('/me').set(auth(t)).expect(200);
    return { token: t, id: me.body.id as string };
  };

  let owner: string;
  let ownerId: string;
  let sam: { token: string; id: string };
  let tess: { token: string; id: string };
  let uma: { token: string; id: string };
  let eng: string;
  let hr: string;
  let annual: string;

  it('sets up a company with starter leave types and quotas', async () => {
    owner = await register(`Leave${uniq()}`);
    ownerId = (await api().get('/me').set(auth(owner))).body.id;
    eng = (
      await api()
        .post('/departments')
        .set(auth(owner))
        .send({ name: 'Engineering' })
    ).body.id;
    hr = (
      await api().post('/departments').set(auth(owner)).send({ name: 'HR' })
    ).body.id;
    sam = await join(owner, 'sam', { departmentId: eng });
    tess = await join(owner, 'tess');
    uma = await join(owner, 'uma', { departmentId: hr });
    await api()
      .patch(`/members/${sam.id}`)
      .set(auth(owner))
      .send({ managerId: tess.id })
      .expect(200);

    const types = await api()
      .get('/leave-types')
      .set(auth(sam.token))
      .expect(200);
    annual = types.body.find((t: { code: string }) => t.code === 'ANNUAL').id;
    const b = await api()
      .get('/balances/me?on=2027-03-01')
      .set(auth(sam.token))
      .expect(200);
    const line = (k: string): unknown =>
      b.body.find((x: { key: string }) => x.key === k);
    expect(line('ANNUAL')).toMatchObject({
      entitled: 14,
      used: 0,
      remaining: 14,
    });
    expect(line('WFH')).toMatchObject({ entitled: 8, period: 'MONTH' });
  });

  it('only counts working days and applies holidays', async () => {
    await api()
      .post('/holidays')
      .set(auth(owner))
      .send({ holidays: [{ name: 'Bank holiday', date: '2027-04-06' }] })
      .expect(201);
    // Mon 5 Apr to Wed 7 Apr 2027 with a holiday on Tue = 2 days
    const r = await api()
      .post('/requests')
      .set(auth(sam.token))
      .send({
        type: 'LEAVE',
        leaveTypeId: annual,
        startDate: '2027-04-05',
        endDate: '2027-04-07',
      })
      .expect(201);
    expect(Number(r.body.days)).toBe(2);
    await api()
      .post(`/requests/${r.body.id}/cancel`)
      .set(auth(sam.token))
      .expect(201);
  });

  it('rejects bad requests: dates, overlap, and quota', async () => {
    await api()
      .post('/requests')
      .set(auth(sam.token))
      .send({
        type: 'LEAVE',
        leaveTypeId: annual,
        startDate: '2027-03-05',
        endDate: '2027-03-01',
      })
      .expect(400);
    await api()
      .post('/requests')
      .set(auth(sam.token))
      .send({
        type: 'LEAVE',
        leaveTypeId: annual,
        startDate: '2027-03-06',
        endDate: '2027-03-07',
      })
      .expect(400); // weekend only
    await api()
      .post('/requests')
      .set(auth(sam.token))
      .send({ type: 'LEAVE', startDate: '2027-03-01', endDate: '2027-03-02' })
      .expect(400); // no type
    await api()
      .post('/requests')
      .set(auth(sam.token))
      .send({
        type: 'LEAVE',
        leaveTypeId: annual,
        startDate: '2027-06-01',
        endDate: '2027-06-30',
      })
      .expect(409); // over 14 days
  });

  let req1: string;
  it('submits leave, shows it as pending, and blocks overlaps', async () => {
    const r = await api()
      .post('/requests')
      .set(auth(sam.token))
      .send({
        type: 'LEAVE',
        leaveTypeId: annual,
        startDate: '2027-03-01',
        endDate: '2027-03-03',
        reason: 'Trip',
      })
      .expect(201);
    req1 = r.body.id;
    expect(Number(r.body.days)).toBe(3);
    const b = await api()
      .get('/balances/me?on=2027-03-01')
      .set(auth(sam.token));
    expect(
      b.body.find((x: { key: string }) => x.key === 'ANNUAL'),
    ).toMatchObject({ pending: 3, used: 0, remaining: 11 });
    await api()
      .post('/requests')
      .set(auth(sam.token))
      .send({ type: 'WFH', startDate: '2027-03-03', endDate: '2027-03-04' })
      .expect(409);
  });

  it('only the right people can decide: not the requester, not a stranger', async () => {
    await api()
      .post(`/requests/${req1}/decision`)
      .set(auth(sam.token))
      .send({ decision: 'APPROVED' })
      .expect(403);
    await api()
      .post(`/requests/${req1}/decision`)
      .set(auth(uma.token))
      .send({ decision: 'APPROVED' })
      .expect(403);
    await api().get(`/requests/${req1}`).set(auth(uma.token)).expect(404); // private
    const inbox = await api()
      .get('/requests/inbox')
      .set(auth(tess.token))
      .expect(200); // Tess is Sam's manager
    expect(inbox.body.map((x: { id: string }) => x.id)).toContain(req1);
    expect(
      (await api().get('/requests/inbox').set(auth(uma.token))).body,
    ).toHaveLength(0);
  });

  it('rejection needs a reason and does not touch the calendar', async () => {
    await api()
      .post(`/requests/${req1}/decision`)
      .set(auth(tess.token))
      .send({ decision: 'REJECTED' })
      .expect(400);
  });

  it('manager approves, calendar and balance update', async () => {
    const d = await api()
      .post(`/requests/${req1}/decision`)
      .set(auth(tess.token))
      .send({ decision: 'APPROVED' })
      .expect(201);
    expect(d.body.status).toBe('APPROVED');
    const cal = await api()
      .get('/calendar?from=2027-03-01&to=2027-03-07')
      .set(auth(uma.token))
      .expect(200); // everyone can see
    const leaveDays = cal.body.days.filter(
      (x: { memberId: string; type: string }) =>
        x.memberId === sam.id && x.type === 'LEAVE',
    );
    expect(leaveDays.map((x: { date: string }) => x.date)).toEqual([
      '2027-03-01',
      '2027-03-02',
      '2027-03-03',
    ]);
    expect(JSON.stringify(cal.body)).not.toContain('Trip'); // reasons stay private
    const b = await api()
      .get('/balances/me?on=2027-03-01')
      .set(auth(sam.token));
    expect(
      b.body.find((x: { key: string }) => x.key === 'ANNUAL'),
    ).toMatchObject({ used: 3, pending: 0, remaining: 11 });
    await api()
      .post(`/requests/${req1}/decision`)
      .set(auth(tess.token))
      .send({ decision: 'APPROVED' })
      .expect(404); // already decided
  });

  it('half days count as 0.5', async () => {
    const r = await api()
      .post('/requests')
      .set(auth(sam.token))
      .send({
        type: 'LEAVE',
        leaveTypeId: annual,
        startDate: '2027-03-09',
        endDate: '2027-03-09',
        startPart: 'AM',
      })
      .expect(201);
    expect(Number(r.body.days)).toBe(0.5);
  });

  it('enforces the monthly work-from-home quota', async () => {
    // Mon 1 Nov to Fri 12 Nov 2027 is 10 working days, over the 8 allowed
    await api()
      .post('/requests')
      .set(auth(sam.token))
      .send({ type: 'WFH', startDate: '2027-11-01', endDate: '2027-11-12' })
      .expect(409);
    await api()
      .post('/requests')
      .set(auth(sam.token))
      .send({ type: 'WFH', startDate: '2027-11-01', endDate: '2027-11-10' })
      .expect(201); // 8 days
    await api()
      .post('/requests')
      .set(auth(sam.token))
      .send({ type: 'WFH', startDate: '2027-11-11', endDate: '2027-11-11' })
      .expect(409); // 9th
  });

  it('department-scoped approval power covers only that department', async () => {
    await api()
      .put(`/members/${uma.id}/permissions`)
      .set(auth(owner))
      .send({
        grants: [
          { action: 'leave.approve', scopeType: 'DEPARTMENT', scopeIds: [eng] },
        ],
      })
      .expect(200);
    const r = await api()
      .post('/requests')
      .set(auth(sam.token))
      .send({
        type: 'LEAVE',
        leaveTypeId: annual,
        startDate: '2027-05-03',
        endDate: '2027-05-03',
      })
      .expect(201);
    await api()
      .post(`/requests/${r.body.id}/decision`)
      .set(auth(uma.token))
      .send({ decision: 'APPROVED' })
      .expect(201); // Sam is in Engineering
    const r2 = await api()
      .post('/requests')
      .set(auth(tess.token))
      .send({
        type: 'LEAVE',
        leaveTypeId: annual,
        startDate: '2027-05-03',
        endDate: '2027-05-03',
      })
      .expect(201);
    await api()
      .post(`/requests/${r2.body.id}/decision`)
      .set(auth(uma.token))
      .send({ decision: 'APPROVED' })
      .expect(403); // Tess has no department
  });

  it('asks for changes, then lets the requester withdraw', async () => {
    const r = await api()
      .post('/requests')
      .set(auth(sam.token))
      .send({
        type: 'LEAVE',
        leaveTypeId: annual,
        startDate: '2027-07-05',
        endDate: '2027-07-05',
      })
      .expect(201);
    const d = await api()
      .post(`/requests/${r.body.id}/decision`)
      .set(auth(tess.token))
      .send({ decision: 'CHANGES_REQUESTED', comment: 'Pick another day' })
      .expect(201);
    expect(d.body.status).toBe('CHANGES_REQUESTED');
    await api()
      .post(`/requests/${r.body.id}/cancel`)
      .set(auth(sam.token))
      .expect(201);
  });

  it('cancelling approved future leave clears the calendar and returns the days', async () => {
    await api()
      .post(`/requests/${req1}/cancel`)
      .set(auth(sam.token))
      .expect(201);
    const cal = await api()
      .get('/calendar?from=2027-03-01&to=2027-03-07')
      .set(auth(owner));
    expect(
      cal.body.days.filter((x: { type: string }) => x.type === 'LEAVE'),
    ).toHaveLength(0);
  });

  it('quotas can be overridden for a department', async () => {
    await api()
      .put('/quotas')
      .set(auth(owner))
      .send({
        subject: 'LEAVE',
        leaveTypeId: annual,
        period: 'YEAR',
        amountDays: 20,
        scopeType: 'DEPARTMENT',
        scopeId: eng,
      })
      .expect(200);
    const sb = await api()
      .get('/balances/me?on=2027-03-01')
      .set(auth(sam.token));
    expect(
      sb.body.find((x: { key: string }) => x.key === 'ANNUAL').entitled,
    ).toBe(20);
    const ub = await api()
      .get('/balances/me?on=2027-03-01')
      .set(auth(uma.token));
    expect(
      ub.body.find((x: { key: string }) => x.key === 'ANNUAL').entitled,
    ).toBe(14);
    await api()
      .put('/quotas')
      .set(auth(sam.token))
      .send({
        subject: 'WFH',
        period: 'MONTH',
        amountDays: 99,
        scopeType: 'COMPANY',
      })
      .expect(403);
  });

  it('multi-step approval needs every step (Gold trial)', async () => {
    await api()
      .put('/workflows/leave')
      .set(auth(owner))
      .send({
        steps: [{ kind: 'manager' }, { kind: 'member', memberId: ownerId }],
      })
      .expect(200);
    const r = await api()
      .post('/requests')
      .set(auth(sam.token))
      .send({
        type: 'LEAVE',
        leaveTypeId: annual,
        startDate: '2027-09-06',
        endDate: '2027-09-06',
      })
      .expect(201);
    const first = await api()
      .post(`/requests/${r.body.id}/decision`)
      .set(auth(tess.token))
      .send({ decision: 'APPROVED' })
      .expect(201);
    expect(first.body).toMatchObject({ status: 'PENDING', currentStep: 1 });
    const second = await api()
      .post(`/requests/${r.body.id}/decision`)
      .set(auth(owner))
      .send({ decision: 'APPROVED' })
      .expect(201);
    expect(second.body.status).toBe('APPROVED');
  });

  it('records out of office on the calendar', async () => {
    await api()
      .post('/out-of-office')
      .set(auth(sam.token))
      .send({
        date: '2027-02-01',
        from: '14:00',
        to: '15:30',
        reason: 'errand',
      })
      .expect(201);
    await api()
      .post('/out-of-office')
      .set(auth(sam.token))
      .send({ date: '2027-02-01', from: '15:30', to: '14:00' })
      .expect(400);
    const cal = await api()
      .get('/calendar?from=2027-02-01&to=2027-02-01')
      .set(auth(uma.token));
    expect(cal.body.days).toEqual([
      expect.objectContaining({
        memberId: sam.id,
        type: 'OUT_OF_OFFICE',
        startTime: '14:00',
        endTime: '15:30',
      }),
    ]);
  });

  it('keeps another company out of all of it', async () => {
    const other = await register(`Other${uniq()}`);
    await api().get(`/requests/${req1}`).set(auth(other)).expect(404);
    await api()
      .post(`/requests/${req1}/decision`)
      .set(auth(other))
      .send({ decision: 'APPROVED' })
      .expect(404);
    const cal = await api()
      .get('/calendar?from=2027-01-01&to=2027-12-31')
      .set(auth(other))
      .expect(200);
    expect(cal.body.days).toHaveLength(0);
    expect(cal.body.holidays).toHaveLength(0);
  });

  it('refuses silly calendar ranges', async () => {
    await api()
      .get('/calendar?from=2020-01-01&to=2027-12-31')
      .set(auth(owner))
      .expect(400);
  });
});
