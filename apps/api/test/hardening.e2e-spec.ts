import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';

process.env.FILE_STORAGE_DIR = mkdtempSync(join(tmpdir(), 'hr-files-'));

import { AppModule } from '../src/app.module';

const pw = 'correct horse battery';
const uniq = () => Math.random().toString(36).slice(2, 8);

/** Regression tests for the problems found in the security audit. */
describe('Hardening', () => {
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

  const company = async () => {
    const u = uniq();
    const r = await api()
      .post('/auth/register')
      .send({
        orgName: `Hard ${u}`,
        country: 'GB',
        timeZone: 'Europe/London',
        currency: 'GBP',
        firstName: 'Olivia',
        lastName: 'Owner',
        email: `o-${u}@hard.test`,
        password: pw,
      })
      .expect(201);
    const token = r.body.accessToken as string;
    const me = await api().get('/me').set(auth(token)).expect(200);
    return { token, id: me.body.id as string, email: `o-${u}@hard.test` };
  };
  const addMember = async (owner: string, roleId?: string) => {
    const inv = await api()
      .post('/invites')
      .set(auth(owner))
      .send({ email: `m-${uniq()}@hard.test`, jobRoleId: roleId })
      .expect(201);
    const token = new URL(inv.body.devLink as string).searchParams.get('token');
    const acc = await api()
      .post('/auth/invites/accept')
      .send({ token, firstName: 'Cleo', lastName: 'Clerk', password: pw })
      .expect(201);
    const t = acc.body.accessToken as string;
    const me = await api().get('/me').set(auth(t)).expect(200);
    return { token: t, id: me.body.id as string };
  };

  it('stops a clerk from handing out powers they do not hold through a job role', async () => {
    const o = await company();
    const clerkRole = await api()
      .post('/roles')
      .set(auth(o.token))
      .send({
        name: 'HR clerk',
        defaultPermissions: ['member.manage', 'member.invite'],
      })
      .expect(201);
    const bossRole = await api()
      .post('/roles')
      .set(auth(o.token))
      .send({ name: 'Payroll boss', defaultPermissions: ['payroll.manage'] })
      .expect(201);
    const clerk = await addMember(o.token, clerkRole.body.id as string);
    const victim = await addMember(o.token);

    // Cannot invite someone into, or assign, a role that carries payroll.manage.
    await api()
      .post('/invites')
      .set(auth(clerk.token))
      .send({ email: `x-${uniq()}@hard.test`, jobRoleId: bossRole.body.id })
      .expect(403);
    await api()
      .patch(`/members/${victim.id}`)
      .set(auth(clerk.token))
      .send({ jobRoleId: bossRole.body.id })
      .expect(403);
    // Cannot promote themselves, or pick their own manager.
    await api()
      .patch(`/members/${clerk.id}`)
      .set(auth(clerk.token))
      .send({ jobRoleId: bossRole.body.id })
      .expect(403);
    await api()
      .patch(`/members/${clerk.id}`)
      .set(auth(clerk.token))
      .send({ managerId: victim.id })
      .expect(403);
    // The owner still can.
    await api()
      .patch(`/members/${victim.id}`)
      .set(auth(o.token))
      .send({ jobRoleId: bossRole.body.id })
      .expect(200);
  });

  it('rejects absurd or impossible leave dates', async () => {
    const o = await company();
    const types = await api().get('/leave-types').set(auth(o.token));
    const id = (types.body as { id: string }[])[0].id;
    const body = { type: 'LEAVE', leaveTypeId: id, startPart: 'FULL' };
    await api()
      .post('/requests')
      .set(auth(o.token))
      .send({ ...body, startDate: '0001-01-01', endDate: '9999-12-31' })
      .expect(400);
    await api()
      .post('/requests')
      .set(auth(o.token))
      .send({ ...body, startDate: '2026-99-99', endDate: '2026-99-99' })
      .expect(400);
    await api().get('/holidays?year=99999999').set(auth(o.token)).expect(400);
  });

  it('locks an email out after repeated wrong passwords, and treats unknown emails alike', async () => {
    const o = await company();
    for (let i = 0; i < 5; i++)
      await api()
        .post('/auth/login')
        .send({ email: o.email, password: 'wrong-password-1' })
        .expect(401);
    const locked = await api()
      .post('/auth/login')
      .send({ email: o.email, password: pw })
      .expect(429);
    expect(JSON.stringify(locked.body)).toContain('Too many');
    const ghost = await api()
      .post('/auth/login')
      .send({ email: `nobody-${uniq()}@hard.test`, password: pw })
      .expect(401);
    expect(JSON.stringify(ghost.body)).toContain('Invalid email or password');
  });

  it('reports readiness from the database', async () => {
    await api().get('/health').expect(200);
    await api().get('/health/ready').expect(200);
  });

  it('rejects an invalid time zone and a non-UUID document filter', async () => {
    const u = uniq();
    await api()
      .post('/auth/register')
      .send({
        orgName: `Tz ${u}`,
        country: 'GB',
        timeZone: 'Mars/Olympus',
        currency: 'GBP',
        firstName: 'A',
        lastName: 'B',
        email: `tz-${u}@hard.test`,
        password: pw,
      })
      .expect(400);
    const o = await company();
    await api().get('/documents?memberId=nope').set(auth(o.token)).expect(400);
  });
});
