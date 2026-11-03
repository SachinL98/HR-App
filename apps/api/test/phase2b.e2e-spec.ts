import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

const pw = 'correct horse battery';
const uniq = () => Math.random().toString(36).slice(2, 8);

describe('Phase 2b: meetings, notices, notifications', () => {
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
    return r.body.accessToken as string;
  };
  const addMember = async (owner: string, dept?: string) => {
    const email = `m-${uniq()}@x.test`;
    const inv = await api()
      .post('/invites')
      .set(auth(owner))
      .send({ email, departmentId: dept })
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

  let owner: string;
  let other: string;
  let a: { token: string; id: string };
  let b: { token: string; id: string };
  let deptId: string;
  let meetingId: string;
  const start = new Date(Date.now() + 2 * 86400_000);
  start.setUTCHours(10, 0, 0, 0);
  const end = new Date(start.getTime() + 3600_000);

  beforeAll(async () => {
    owner = await company('Meet');
    other = await company('Else');
    const d = await api()
      .post('/departments')
      .set(auth(owner))
      .send({ name: 'Eng' })
      .expect(201);
    deptId = d.body.id as string;
    a = await addMember(owner, deptId);
    b = await addMember(owner);
  });

  it('creates a meeting with a department invited and notifies them', async () => {
    const r = await api()
      .post('/meetings')
      .set(auth(owner))
      .send({
        title: 'Planning',
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        departmentIds: [deptId],
        meetUrl: 'https://meet.google.com/abc-defg-hij',
      })
      .expect(201);
    meetingId = r.body.id as string;
    expect(r.body.attendees.length).toBe(2); // organizer + dept member
    const n = await api().get('/notifications').set(auth(a.token)).expect(200);
    expect(n.body.unreadCount).toBe(1);
    expect(n.body.items[0].event).toBe('meeting.invited');
    const none = await api()
      .get('/notifications')
      .set(auth(b.token))
      .expect(200);
    expect(none.body.unreadCount).toBe(0);
  });

  it('validates times, links and invitees', async () => {
    await api()
      .post('/meetings')
      .set(auth(owner))
      .send({
        title: 'Bad',
        startsAt: end.toISOString(),
        endsAt: start.toISOString(),
      })
      .expect(400);
    await api()
      .post('/meetings')
      .set(auth(owner))
      .send({
        title: 'Bad',
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        meetUrl: 'http://insecure.example',
      })
      .expect(400);
    const foreign = (await api().get('/me').set(auth(other))).body.id as string;
    await api()
      .post('/meetings')
      .set(auth(owner))
      .send({
        title: 'Cross tenant',
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        memberIds: [foreign],
      })
      .expect(400);
  });

  it('shows meetings only to people involved', async () => {
    const q = `?from=${start.toISOString().slice(0, 10)}&to=${new Date(start.getTime() + 86400_000).toISOString().slice(0, 10)}`;
    const mine = await api()
      .get(`/meetings${q}`)
      .set(auth(a.token))
      .expect(200);
    expect(mine.body.length).toBe(1);
    const notMine = await api()
      .get(`/meetings${q}`)
      .set(auth(b.token))
      .expect(200);
    expect(notMine.body.length).toBe(0);
  });

  it('flags clashes in the availability check', async () => {
    const r = await api()
      .post('/meetings/availability')
      .set(auth(owner))
      .send({
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        memberIds: [a.id, b.id],
      })
      .expect(201);
    const byId = Object.fromEntries(
      (r.body as { member: { id: string }; free: boolean }[]).map((x) => [
        x.member.id,
        x.free,
      ]),
    );
    expect(byId[a.id]).toBe(false);
    expect(byId[b.id]).toBe(true);
  });

  it('records RSVPs, which only invitees can give', async () => {
    await api()
      .put(`/meetings/${meetingId}/rsvp`)
      .set(auth(a.token))
      .send({ rsvp: 'YES' })
      .expect(200);
    await api()
      .put(`/meetings/${meetingId}/rsvp`)
      .set(auth(b.token))
      .send({ rsvp: 'YES' })
      .expect(404);
    const n = await api().get('/notifications').set(auth(owner)).expect(200);
    expect(
      (n.body.items as { event: string }[]).some(
        (i) => i.event === 'meeting.rsvp',
      ),
    ).toBe(true);
  });

  it('lets only the organizer cancel, and tells the invitees', async () => {
    await api().delete(`/meetings/${meetingId}`).set(auth(a.token)).expect(403);
    await api().delete(`/meetings/${meetingId}`).set(auth(owner)).expect(200);
    const n = await api().get('/notifications').set(auth(a.token)).expect(200);
    expect(
      (n.body.items as { event: string }[]).some(
        (i) => i.event === 'meeting.canceled',
      ),
    ).toBe(true);
  });

  it('targets notices at the right audience', async () => {
    await api()
      .post('/notices')
      .set(auth(a.token))
      .send({ title: 'Nope', body: 'x', everyone: true })
      .expect(403);
    await api()
      .post('/notices')
      .set(auth(owner))
      .send({ title: 'Nobody', body: 'x' })
      .expect(400);
    const dept = await api()
      .post('/notices')
      .set(auth(owner))
      .send({
        title: 'Eng offsite',
        body: '<b>Friday</b>',
        departmentIds: [deptId],
        requireAck: true,
      })
      .expect(201);
    await api()
      .post('/notices')
      .set(auth(owner))
      .send({ title: 'Everyone', body: 'Hello', everyone: true })
      .expect(201);
    const forA = await api().get('/notices').set(auth(a.token)).expect(200);
    const forB = await api().get('/notices').set(auth(b.token)).expect(200);
    expect(forA.body.length).toBe(2);
    expect(forB.body.length).toBe(1);
    // Body is stored as plain text, never interpreted
    expect(
      (forA.body as { body: string }[]).some((n) => n.body === '<b>Friday</b>'),
    ).toBe(true);
    const outsider = await api().get('/notices').set(auth(other)).expect(200);
    expect(outsider.body.length).toBe(0);

    const id = dept.body.id as string;
    await api()
      .post(`/notices/${id}/read`)
      .set(auth(a.token))
      .send({ acknowledge: true })
      .expect(201);
    const reads = await api()
      .get(`/notices/${id}/reads`)
      .set(auth(owner))
      .expect(200);
    expect(reads.body.length).toBe(1);
    expect(reads.body[0].ackAt).not.toBeNull();
    await api().get(`/notices/${id}/reads`).set(auth(a.token)).expect(403);
  });

  it('marks notifications read', async () => {
    const before = await api()
      .get('/notifications')
      .set(auth(a.token))
      .expect(200);
    expect(before.body.unreadCount).toBeGreaterThan(0);
    await api().post('/notifications/read-all').set(auth(a.token)).expect(201);
    const after = await api()
      .get('/notifications')
      .set(auth(a.token))
      .expect(200);
    expect(after.body.unreadCount).toBe(0);
  });
});
