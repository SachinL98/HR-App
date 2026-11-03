import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

const pw = 'correct horse battery';
const uniq = () => Math.random().toString(36).slice(2, 8);

describe('Phase 1: tenants, invites, permissions, theme', () => {
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
  const register = async (name: string) => {
    const email = `owner-${uniq()}@${name.replace(/\s/g, '')}.test`;
    const r = await api()
      .post('/auth/register')
      .send({
        orgName: name,
        country: 'GB',
        timeZone: 'Europe/London',
        currency: 'GBP',
        firstName: 'Olivia',
        lastName: 'Owner',
        email,
        password: pw,
      })
      .expect(201);
    return { token: r.body.accessToken as string, email };
  };
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  let a: { token: string; email: string };
  let b: { token: string; email: string };
  let deptId: string;
  let memberToken: string;
  let memberId: string;

  it('registers two separate companies', async () => {
    a = await register(`Acme ${uniq()}`);
    b = await register(`Beta ${uniq()}`);
    const me = await api().get('/me').set(auth(a.token)).expect(200);
    expect(me.body.isOwner).toBe(true);
    expect(me.body.permissions.length).toBeGreaterThan(10);
  });

  it('rejects weak passwords and duplicate emails', async () => {
    await api()
      .post('/auth/register')
      .send({
        orgName: 'X Co',
        country: 'GB',
        timeZone: 'Europe/London',
        currency: 'GBP',
        firstName: 'A',
        lastName: 'B',
        email: 'weak@x.test',
        password: 'short',
      })
      .expect(400);
    await api()
      .post('/auth/register')
      .send({
        orgName: 'Dup Co',
        country: 'GB',
        timeZone: 'Europe/London',
        currency: 'GBP',
        firstName: 'A',
        lastName: 'B',
        email: a.email,
        password: pw,
      })
      .expect(409);
  });

  it('logs in and refuses a wrong password', async () => {
    await api()
      .post('/auth/login')
      .send({ email: a.email, password: pw })
      .expect(201);
    await api()
      .post('/auth/login')
      .send({ email: a.email, password: 'nope-nope-nope' })
      .expect(401);
  });

  it('requires a token for protected routes', async () => {
    await api().get('/departments').expect(401);
    await api().get('/departments').set(auth('garbage')).expect(401);
  });

  it('creates a department hierarchy and rejects loops', async () => {
    const d1 = await api()
      .post('/departments')
      .set(auth(a.token))
      .send({ name: 'Engineering' })
      .expect(201);
    deptId = d1.body.id;
    const d2 = await api()
      .post('/departments')
      .set(auth(a.token))
      .send({ name: 'Mobile', parentId: deptId })
      .expect(201);
    await api()
      .patch(`/departments/${deptId}`)
      .set(auth(a.token))
      .send({ parentId: d2.body.id })
      .expect(400);
    await api().delete(`/departments/${deptId}`).set(auth(a.token)).expect(409);
  });

  it('keeps companies isolated from each other', async () => {
    const mine = await api().get('/departments').set(auth(a.token)).expect(200);
    const theirs = await api()
      .get('/departments')
      .set(auth(b.token))
      .expect(200);
    expect(mine.body.length).toBe(2);
    expect(theirs.body.length).toBe(0);
    await api()
      .patch(`/departments/${deptId}`)
      .set(auth(b.token))
      .send({ name: 'Hacked' })
      .expect(404);
  });

  it('defines a company role with delegated powers', async () => {
    await api()
      .post('/roles')
      .set(auth(a.token))
      .send({ name: 'Bad', defaultPermissions: ['nope.nope'] })
      .expect(400);
    await api()
      .post('/roles')
      .set(auth(a.token))
      .send({ name: 'Engineering Manager', defaultPermissions: [] })
      .expect(201);
  });

  it('invites a member who joins with the right department', async () => {
    const roles = await api().get('/roles').set(auth(a.token)).expect(200);
    const inv = await api()
      .post('/invites')
      .set(auth(a.token))
      .send({
        email: `sam-${uniq()}@acme.test`,
        departmentId: deptId,
        jobRoleId: roles.body[0].id,
      })
      .expect(201);
    const token = new URL(inv.body.devLink as string).searchParams.get('token');
    const acc = await api()
      .post('/auth/invites/accept')
      .send({
        token,
        firstName: 'Sam',
        lastName: 'Member',
        password: pw,
      })
      .expect(201);
    memberToken = acc.body.accessToken;
    const me = await api().get('/me').set(auth(memberToken)).expect(200);
    expect(me.body.departmentId).toBe(deptId);
    memberId = me.body.id;
    // Single use
    await api()
      .post('/auth/invites/accept')
      .send({ token, firstName: 'Sam', lastName: 'M', password: pw })
      .expect(400);
  });

  it('forbids members from admin actions', async () => {
    await api()
      .post('/departments')
      .set(auth(memberToken))
      .send({ name: 'Nope' })
      .expect(403);
    await api()
      .post('/invites')
      .set(auth(memberToken))
      .send({ email: 'x@y.test' })
      .expect(403);
    await api()
      .patch('/org/theme')
      .set(auth(memberToken))
      .send({ themePrimary: '#ff0000' })
      .expect(403);
  });

  it('lets the owner delegate a scoped power, and it works only in scope', async () => {
    const members = await api().get('/members').set(auth(a.token)).expect(200);
    expect(members.body.length).toBe(2);
    await api()
      .put(`/members/${memberId}/permissions`)
      .set(auth(a.token))
      .send({
        grants: [
          { action: 'branding.manage', scopeType: 'COMPANY', scopeIds: [] },
        ],
      })
      .expect(200);
    await api()
      .patch('/org/theme')
      .set(auth(memberToken))
      .send({ themePrimary: '#112233' })
      .expect(200);
    // Still cannot do something not granted
    await api()
      .post('/departments')
      .set(auth(memberToken))
      .send({ name: 'Nope' })
      .expect(403);
  });

  it('blocks privilege escalation through grants', async () => {
    await api()
      .put(`/members/${memberId}/permissions`)
      .set(auth(a.token))
      .send({
        grants: [
          { action: 'branding.manage', scopeType: 'COMPANY', scopeIds: [] },
          { action: 'permission.grant', scopeType: 'COMPANY', scopeIds: [] },
        ],
      })
      .expect(200);
    // Member holds permission.grant but not payroll.manage, so cannot hand it out.
    const owner = await api().get('/members').set(auth(a.token));
    const ownerId = owner.body.find((m: { isOwner: boolean }) => m.isOwner).id;
    await api()
      .put(`/members/${ownerId}/permissions`)
      .set(auth(memberToken))
      .send({ grants: [] })
      .expect(400);
    await api()
      .put(`/members/${memberId}/permissions`)
      .set(auth(memberToken))
      .send({ grants: [] })
      .expect(403);
  });

  it('applies the admin-set theme for everyone in the company', async () => {
    await api()
      .patch('/org/theme')
      .set(auth(a.token))
      .send({
        themePrimary: '#0F766E',
        themeAccent: '#F59E0B',
        themeMode: 'dark',
        themeRadius: 'lg',
      })
      .expect(200);
    const asMember = await api().get('/org').set(auth(memberToken)).expect(200);
    expect(asMember.body).toMatchObject({
      themePrimary: '#0F766E',
      themeAccent: '#F59E0B',
      themeMode: 'dark',
      themeRadius: 'lg',
    });
    const other = await api().get('/org').set(auth(b.token)).expect(200);
    expect(other.body.themePrimary).toBe('#3B3FD8');
  });

  it('rejects invalid theme values', async () => {
    await api()
      .patch('/org/theme')
      .set(auth(a.token))
      .send({ themePrimary: 'red' })
      .expect(400);
    await api()
      .patch('/org/theme')
      .set(auth(a.token))
      .send({ themeMode: 'neon' })
      .expect(400);
  });

  it('suspended members lose access immediately', async () => {
    await api()
      .patch(`/members/${memberId}`)
      .set(auth(a.token))
      .send({ status: 'SUSPENDED' })
      .expect(200);
    await api().get('/me').set(auth(memberToken)).expect(401);
  });
});
