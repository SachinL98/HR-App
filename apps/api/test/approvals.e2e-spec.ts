import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';

process.env.FILE_STORAGE_DIR = mkdtempSync(join(tmpdir(), 'hr-files-'));
process.env.THROTTLE_OFF = '1'; // this file signs up many people in a minute

import { AppModule } from '../src/app.module';
import { LeaveService } from '../src/leave/leave.service';
import { PrismaService } from '../src/prisma/prisma.service';

const pw = 'correct horse battery';
const uniq = () => Math.random().toString(36).slice(2, 8);
const future = (n: number) => {
  const d = new Date(Date.now() + n * 86400_000);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

describe('Approvals: cover, steps, team clashes, reminders, calendar feed', () => {
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

  const setup = async () => {
    const u = uniq();
    const r = await api()
      .post('/auth/register')
      .send({
        orgName: `Appr ${u}`,
        country: 'GB',
        timeZone: 'Europe/London',
        currency: 'GBP',
        firstName: 'Olivia',
        lastName: 'Owner',
        email: `o-${u}@appr.test`,
        password: pw,
      })
      .expect(201);
    const owner = r.body.accessToken as string;
    const ownerId = (await api().get('/me').set(auth(owner))).body.id as string;
    const add = async (first: string, extra: object = {}) => {
      const inv = await api()
        .post('/invites')
        .set(auth(owner))
        .send({ email: `${first.toLowerCase()}-${uniq()}@appr.test`, ...extra })
        .expect(201);
      const token = new URL(inv.body.devLink as string).searchParams.get(
        'token',
      );
      const acc = await api()
        .post('/auth/invites/accept')
        .send({ token, firstName: first, lastName: 'Person', password: pw })
        .expect(201);
      const t = acc.body.accessToken as string;
      return {
        token: t,
        id: (await api().get('/me').set(auth(t))).body.id as string,
      };
    };
    const types = await api().get('/leave-types').set(auth(owner));
    const annual = (types.body as { id: string; code: string }[])[0].id;
    const ask = (t: string, start: string, end = start) =>
      api().post('/requests').set(auth(t)).send({
        type: 'LEAVE',
        leaveTypeId: annual,
        startDate: start,
        endDate: end,
      });
    return { owner, ownerId, add, ask };
  };

  it('lets a covering colleague approve while the manager is away, and only then', async () => {
    const { add, ask } = await setup();
    const boss = await add('Boss');
    const cover = await add('Cover');
    const worker = await add('Worker', { managerId: boss.id });
    const r = await ask(worker.token, future(10)).expect(201);

    await api()
      .post(`/requests/${r.body.id}/decision`)
      .set(auth(cover.token))
      .send({ decision: 'APPROVED' })
      .expect(403);
    expect(
      (await api().get('/requests/inbox').set(auth(cover.token))).body,
    ).toHaveLength(0);

    const today = new Date().toISOString().slice(0, 10);
    await api()
      .post('/delegations')
      .set(auth(boss.token))
      .send({ toId: boss.id, startsOn: today, endsOn: today })
      .expect(400); // not yourself
    const d = await api()
      .post('/delegations')
      .set(auth(boss.token))
      .send({ toId: cover.id, startsOn: today, endsOn: future(5) })
      .expect(201);
    const note = await api()
      .get('/notifications')
      .set(auth(cover.token))
      .expect(200);
    expect(JSON.stringify(note.body)).toContain('cover their approvals');

    expect(
      (await api().get('/requests/inbox').set(auth(cover.token))).body,
    ).toHaveLength(1);
    const mine = await api()
      .get('/delegations')
      .set(auth(cover.token))
      .expect(200);
    expect(mine.body.received).toHaveLength(1);
    // Nobody else can end someone's cover; the person who gave it can.
    await api()
      .delete(`/delegations/${d.body.id}`)
      .set(auth(cover.token))
      .expect(404);
    await api()
      .delete(`/delegations/${d.body.id}`)
      .set(auth(boss.token))
      .expect(200);
    await api()
      .post(`/requests/${r.body.id}/decision`)
      .set(auth(cover.token))
      .send({ decision: 'APPROVED' })
      .expect(403);
  });

  it('needs a different person at each step of a multi-step chain, and only one wins a race', async () => {
    const { owner, ownerId, add, ask } = await setup();
    const boss = await add('Boss');
    const head = await add('Head');
    const worker = await add('Worker', { managerId: boss.id });
    await api()
      .put('/workflows/leave')
      .set(auth(owner))
      .send({
        steps: [{ kind: 'manager' }, { kind: 'member', memberId: head.id }],
      })
      .expect(200);
    const r = await ask(worker.token, future(12)).expect(201);
    // Step one goes to the manager; the second person cannot jump in yet.
    await api()
      .post(`/requests/${r.body.id}/decision`)
      .set(auth(head.token))
      .send({ decision: 'APPROVED' })
      .expect(403);
    await api()
      .post(`/requests/${r.body.id}/decision`)
      .set(auth(boss.token))
      .send({ decision: 'APPROVED' })
      .expect(201);
    // The owner holds the approve permission, so could act at any step. After approving step one they must not do step two.
    const r2 = await ask(worker.token, future(20)).expect(201);
    await api()
      .post(`/requests/${r2.body.id}/decision`)
      .set(auth(owner))
      .send({ decision: 'APPROVED' })
      .expect(201);
    await api()
      .post(`/requests/${r2.body.id}/decision`)
      .set(auth(owner))
      .send({ decision: 'APPROVED' })
      .expect(403);
    await api()
      .post(`/requests/${r2.body.id}/decision`)
      .set(auth(head.token))
      .send({ decision: 'APPROVED' })
      .expect(201);
    expect(ownerId).toBeTruthy();

    // Two heads deciding at once on a fresh request: exactly one counts.
    const r3 = await ask(worker.token, future(30)).expect(201);
    await api()
      .post(`/requests/${r3.body.id}/decision`)
      .set(auth(boss.token))
      .send({ decision: 'APPROVED' })
      .expect(201);
    const both = await Promise.all([
      api()
        .post(`/requests/${r3.body.id}/decision`)
        .set(auth(head.token))
        .send({ decision: 'APPROVED' }),
      api()
        .post(`/requests/${r3.body.id}/decision`)
        .set(auth(head.token))
        .send({ decision: 'REJECTED', comment: 'no' }),
    ]);
    const codes = both.map((x) => x.status).sort();
    expect(codes[0]).toBe(201);
    expect([404, 409]).toContain(codes[1]); // the loser finds nothing left to decide
  });

  it('warns the approver how many of the team are already off', async () => {
    const { owner, add, ask } = await setup();
    const dep = await api()
      .post('/departments')
      .set(auth(owner))
      .send({ name: 'Support' })
      .expect(201);
    const boss = await add('Boss', { departmentId: dep.body.id });
    const a = await add('Ann', {
      departmentId: dep.body.id,
      managerId: boss.id,
    });
    const b = await add('Bob', {
      departmentId: dep.body.id,
      managerId: boss.id,
    });
    const day = future(14);
    await ask(a.token, day).expect(201);
    await ask(b.token, day).expect(201);
    const inbox = await api()
      .get('/requests/inbox')
      .set(auth(boss.token))
      .expect(200);
    expect(inbox.body).toHaveLength(2);
    // Each request sees the other person already asking for the same day.
    expect(inbox.body[0].teamOff).toMatchObject({ off: 1, total: 3 });
    expect(inbox.body[0].teamOff.names).toHaveLength(1);
  });

  it('reminds approvers once a day about requests that have waited', async () => {
    const { add, ask } = await setup();
    const boss = await add('Boss');
    const worker = await add('Worker', { managerId: boss.id });
    const r = await ask(worker.token, future(16)).expect(201);
    const before = (await api().get('/notifications').set(auth(boss.token)))
      .body.items.length as number;
    const svc = app.get(LeaveService);
    await svc.remindPending(); // too new: nothing for this approver yet
    expect(
      (await api().get('/notifications').set(auth(boss.token))).body.items
        .length,
    ).toBe(before);
    await prisma.system.request.update({
      where: { id: r.body.id as string },
      data: { createdAt: new Date(Date.now() - 30 * 3600_000) },
    });
    const first = await svc.remindPending();
    expect(first.reminded).toBeGreaterThanOrEqual(1);
    const after = (await api().get('/notifications').set(auth(boss.token))).body
      .items.length as number;
    expect(after).toBe(before + 1);
    await svc.remindPending(); // same day: no second reminder
    expect(
      (await api().get('/notifications').set(auth(boss.token))).body.items
        .length,
    ).toBe(after);
  });

  it('serves a private calendar feed that stops working when replaced or switched off', async () => {
    const { owner, add, ask } = await setup();
    const boss = await add('Boss');
    const worker = await add('Worker', { managerId: boss.id });
    const r = await ask(worker.token, future(18), future(19)).expect(201);
    await api()
      .post(`/requests/${r.body.id}/decision`)
      .set(auth(boss.token))
      .send({ decision: 'APPROVED' })
      .expect(201);
    await api().get('/calendar-feed').set(auth(owner)).expect(200);
    const link = await api()
      .post('/calendar-feed')
      .set(auth(owner))
      .expect(201);
    const feed = await api()
      .get(link.body.path as string)
      .expect(200);
    expect(feed.headers['content-type']).toContain('text/calendar');
    expect(feed.text).toContain('BEGIN:VCALENDAR');
    await api()
      .get('/calendar/feed/not-a-real-token-at-all-0000.ics')
      .expect(404);
    await api().get('/calendar/feed/bad.ics').expect(404);
    const second = await api()
      .post('/calendar-feed')
      .set(auth(owner))
      .expect(201);
    await api()
      .get(link.body.path as string)
      .expect(404); // old link dead
    await api()
      .get(second.body.path as string)
      .expect(200);
    await api().delete('/calendar-feed').set(auth(owner)).expect(200);
    await api()
      .get(second.body.path as string)
      .expect(404);
  });
});
