import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { signSso, verifySso } from '../src/common/sso';

const uniq = () => Math.random().toString(36).slice(2, 8);
const TOKEN = 'integration-token-for-tests-0123456789';

describe('Availability feed for other company tools', () => {
  let app: INestApplication;
  let slug = '';
  const http = () =>
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
    const u = uniq();
    const reg = await http()
      .post('/auth/register')
      .send({
        orgName: `Feed ${u}`,
        country: 'GB',
        timeZone: 'Europe/London',
        currency: 'GBP',
        firstName: 'Fay',
        lastName: 'Feed',
        email: `f-${u}@feed.test`,
        password: 'correct horse battery',
      });
    expect(reg.status).toBeLessThan(300);
    const t = await app
      .get(PrismaService)
      .system.tenant.findFirstOrThrow({ where: { displayName: `Feed ${u}` } });
    slug = t.slug;
  });
  afterAll(async () => {
    delete process.env.INTEGRATION_TOKEN;
    delete process.env.INTEGRATION_TENANT;
    await app.close();
  });

  it('does not exist until a token and company are configured', async () => {
    delete process.env.INTEGRATION_TOKEN;
    delete process.env.INTEGRATION_TENANT;
    await http()
      .get('/integrations/availability?from=2026-01-01&to=2026-01-31')
      .expect(404);
  });

  it('rejects a wrong or missing token and bad ranges', async () => {
    process.env.INTEGRATION_TOKEN = TOKEN;
    process.env.INTEGRATION_TENANT = slug;
    const q = '/integrations/availability?from=2026-01-01&to=2026-01-31';
    await http().get(q).expect(401);
    await http().get(q).set('Authorization', 'Bearer nope').expect(401);
    await http()
      .get('/integrations/availability?from=x&to=y')
      .set('Authorization', `Bearer ${TOKEN}`)
      .expect(400);
    await http()
      .get('/integrations/availability?from=2026-01-31&to=2026-01-01')
      .set('Authorization', `Bearer ${TOKEN}`)
      .expect(400);
  });

  it('returns members, days and holidays for its own company', async () => {
    process.env.INTEGRATION_TOKEN = TOKEN;
    process.env.INTEGRATION_TENANT = slug;
    const res = await http()
      .get('/integrations/availability?from=2026-01-01&to=2026-12-31')
      .set('Authorization', `Bearer ${TOKEN}`)
      .expect(200);
    expect(res.body.members.length).toBeGreaterThanOrEqual(1);
    expect(res.body.members[0].email).toMatch(/@feed\.test$/);
    expect(Array.isArray(res.body.days)).toBe(true);
    expect(Array.isArray(res.body.holidays)).toBe(true);
  });
});

describe('Single sign-on with the Developer Dashboard', () => {
  let app: INestApplication;
  const email = `sso-${uniq()}@sso.test`;
  const secret = 's'.repeat(40);
  const http = () =>
    request(app.getHttpServer() as Parameters<typeof request>[0]);
  beforeAll(async () => {
    process.env.SSO_SECRET = secret;
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
    await http()
      .post('/auth/register')
      .send({
        orgName: `Sso ${uniq()}`,
        country: 'GB',
        timeZone: 'Europe/London',
        currency: 'GBP',
        firstName: 'Sso',
        lastName: 'User',
        email,
        password: 'correct horse battery',
      })
      .expect(201);
  });
  afterAll(async () => {
    delete process.env.SSO_SECRET;
    await app.close();
  });

  it('signs in someone the dashboard vouches for, and refuses bad tokens', async () => {
    const ok = await http()
      .post('/auth/sso')
      .send({ token: signSso(email, 'hr', secret) })
      .expect(201);
    expect(ok.body.accessToken).toBeTruthy();
    await http()
      .get('/me')
      .set('Authorization', `Bearer ${ok.body.accessToken as string}`)
      .expect(200);
    await http()
      .post('/auth/sso')
      .send({ token: signSso(email, 'dash', secret) })
      .expect(401);
    await http()
      .post('/auth/sso')
      .send({ token: signSso('nobody@sso.test', 'hr', secret) })
      .expect(401);
    await http().post('/auth/sso').send({ token: 'nonsense' }).expect(401);
  });

  it('hands a signed-in person a token for the dashboard', async () => {
    const login = await http()
      .post('/auth/login')
      .send({ email, password: 'correct horse battery' })
      .expect(201);
    const r = await http()
      .post('/account/dashboard-token')
      .set('Authorization', `Bearer ${login.body.accessToken as string}`)
      .expect(201);
    expect(verifySso(r.body.token as string, 'dash', secret)?.email).toBe(
      email,
    );
    await http().post('/account/dashboard-token').expect(401);
  });

  it('does not exist without a secret', async () => {
    delete process.env.SSO_SECRET;
    await http().post('/auth/sso').send({ token: 'x' }).expect(404);
    process.env.SSO_SECRET = secret;
  });
});

describe('Password check for the Developer Dashboard', () => {
  let app: INestApplication;
  let slug = '';
  const email = `idn-${uniq()}@idn.test`;
  const pw = 'correct horse battery';
  const T = 'identity-token-for-tests-0123456789ab';
  const http = () =>
    request(app.getHttpServer() as Parameters<typeof request>[0]);
  const verify = (body: object, token: string | null = T) => {
    const r = http().post('/integrations/verify-login');
    return (token ? r.set('Authorization', `Bearer ${token}`) : r).send(body);
  };
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
    const org = `Idn ${uniq()}`;
    await http()
      .post('/auth/register')
      .send({
        orgName: org,
        country: 'GB',
        timeZone: 'Europe/London',
        currency: 'GBP',
        firstName: 'Ida',
        lastName: 'Nolan',
        email,
        password: pw,
      })
      .expect(201);
    slug = (
      await app
        .get(PrismaService)
        .system.tenant.findFirstOrThrow({ where: { displayName: org } })
    ).slug;
    process.env.INTEGRATION_TOKEN = T;
    process.env.INTEGRATION_TENANT = slug;
  });
  afterAll(async () => {
    delete process.env.INTEGRATION_TOKEN;
    delete process.env.INTEGRATION_TENANT;
    await app.close();
  });

  it('needs the integration token', async () => {
    await verify({ email, password: pw }, null).expect(401);
    await verify({ email, password: pw }, 'wrong').expect(401);
  });
  it('returns the profile for the right password', async () => {
    const r = await verify({ email, password: pw }).expect(201);
    expect(r.body).toMatchObject({
      status: 'ok',
      profile: {
        email,
        firstName: 'Ida',
        lastName: 'Nolan',
        name: 'Ida Nolan',
      },
    });
  });
  it('tells unknown people from wrong passwords, and locks after repeated failures', async () => {
    const r = await verify({ email: 'nobody@idn.test', password: pw }).expect(
      201,
    );
    expect(r.body.status).toBe('unknown');
    for (let i = 0; i < 5; i++) {
      expect(
        (await verify({ email, password: 'nope-nope-nope' }).expect(201)).body
          .status,
      ).toBe('invalid');
    }
    await verify({ email, password: pw }).expect(429);
  });
});
