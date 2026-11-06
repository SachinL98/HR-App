import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';

process.env.FILE_STORAGE_DIR = mkdtempSync(join(tmpdir(), 'hr-files-'));

import { AppModule } from '../src/app.module';
import { codeAt, stepNow } from '../src/common/totp';

const pw = 'correct horse battery';
const uniq = () => Math.random().toString(36).slice(2, 8);
const tokenOf = (link: string) => new URL(link).searchParams.get('token');

describe('Accounts: sessions, reset, verification, two-factor', () => {
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

  const signUp = async () => {
    const u = uniq();
    const email = `a-${u}@acct.test`;
    const r = await api()
      .post('/auth/register')
      .send({
        orgName: `Acct ${u}`,
        country: 'GB',
        timeZone: 'Europe/London',
        currency: 'GBP',
        firstName: 'Ada',
        lastName: 'Owner',
        email,
        password: pw,
      })
      .expect(201);
    return {
      email,
      token: r.body.accessToken as string,
      devLink: r.body.devLink as string,
    };
  };
  const login = (email: string, password = pw) =>
    api().post('/auth/login').send({ email, password });

  it('ends a session for real when someone signs out', async () => {
    const a = await signUp();
    await api().get('/me').set(auth(a.token)).expect(200);
    await api().post('/account/logout').set(auth(a.token)).expect(201);
    await api().get('/me').set(auth(a.token)).expect(401);
  });

  it('lists sessions and ends the others', async () => {
    const a = await signUp();
    const second = (await login(a.email).expect(201)).body
      .accessToken as string;
    const list = await api()
      .get('/account/sessions')
      .set(auth(a.token))
      .expect(200);
    expect(list.body).toHaveLength(2);
    expect(
      list.body.filter((s: { current: boolean }) => s.current),
    ).toHaveLength(1);
    await api()
      .post('/account/sessions/revoke-others')
      .set(auth(a.token))
      .expect(201);
    await api().get('/me').set(auth(second)).expect(401);
    await api().get('/me').set(auth(a.token)).expect(200);
  });

  it('confirms an email address with a one-time link', async () => {
    const a = await signUp();
    expect(
      (await api().get('/me').set(auth(a.token))).body.account.emailVerified,
    ).toBe(false);
    const token = tokenOf(a.devLink);
    await api().post('/auth/verify-email').send({ token }).expect(201);
    expect(
      (await api().get('/me').set(auth(a.token))).body.account.emailVerified,
    ).toBe(true);
    await api().post('/auth/verify-email').send({ token }).expect(400); // used once
  });

  it('resets a forgotten password once, signs everyone out, and does not reveal who has an account', async () => {
    const a = await signUp();
    const ghost = await api()
      .post('/auth/forgot-password')
      .send({ email: `nobody-${uniq()}@acct.test` })
      .expect(201);
    expect(ghost.body.ok).toBe(true);
    expect(ghost.body.devLink).toBeUndefined();
    const f = await api()
      .post('/auth/forgot-password')
      .send({ email: a.email })
      .expect(201);
    const token = tokenOf(f.body.devLink as string);
    await api()
      .post('/auth/reset-password')
      .send({ token, password: 'password123456' })
      .expect(400); // too easy
    await api()
      .post('/auth/reset-password')
      .send({ token, password: 'blue-lamp-ferry-9' })
      .expect(201);
    await api()
      .post('/auth/reset-password')
      .send({ token, password: 'another-long-one-7' })
      .expect(400); // single use
    await api().get('/me').set(auth(a.token)).expect(401); // old session ended
    await login(a.email, pw).expect(401);
    await login(a.email, 'blue-lamp-ferry-9').expect(201);
  });

  it('changes a password only with the current one, keeping this session and ending the rest', async () => {
    const a = await signUp();
    const other = (await login(a.email).expect(201)).body.accessToken as string;
    await api()
      .post('/account/password')
      .set(auth(a.token))
      .send({ current: 'wrong-wrong-1', next: 'blue-lamp-ferry-9' })
      .expect(401);
    await api()
      .post('/account/password')
      .set(auth(a.token))
      .send({ current: pw, next: 'short' })
      .expect(400);
    await api()
      .post('/account/password')
      .set(auth(a.token))
      .send({ current: pw, next: 'blue-lamp-ferry-9' })
      .expect(201);
    await api().get('/me').set(auth(a.token)).expect(200);
    await api().get('/me').set(auth(other)).expect(401);
  });

  it('adds two-factor sign-in, with recovery codes that work once', async () => {
    const a = await signUp();
    const setup = await api()
      .post('/account/mfa/setup')
      .set(auth(a.token))
      .expect(201);
    const secret = (setup.body.secret as string).replace(/\s/g, '');
    expect(setup.body.qr).toMatch(/^data:image\/png/);
    await api()
      .post('/account/mfa/enable')
      .set(auth(a.token))
      .send({ code: '000000' })
      .expect(400);
    const enabled = await api()
      .post('/account/mfa/enable')
      .set(auth(a.token))
      .send({ code: codeAt(secret, stepNow()) })
      .expect(201);
    const recovery = enabled.body.recoveryCodes as string[];
    expect(recovery).toHaveLength(10);

    // Password alone no longer signs in; it only starts the second step.
    const first = await login(a.email).expect(201);
    expect(first.body.accessToken).toBeUndefined();
    const challenge = first.body.challenge as string;
    // The step-one token is not a sign-in token.
    await api().get('/me').set(auth(challenge)).expect(401);
    await api()
      .post('/auth/mfa')
      .send({ challenge, code: '123456' })
      .expect(401);

    // A recovery code signs in once.
    const ok = await api()
      .post('/auth/mfa')
      .send({ challenge, code: recovery[0] })
      .expect(201);
    await api()
      .get('/me')
      .set(auth(ok.body.accessToken as string))
      .expect(200);
    const again = (await login(a.email).expect(201)).body.challenge as string;
    await api()
      .post('/auth/mfa')
      .send({ challenge: again, code: recovery[0] })
      .expect(401);

    // Turning it off needs the password and a code.
    await api()
      .post('/account/mfa/disable')
      .set(auth(ok.body.accessToken as string))
      .send({ password: 'nope-nope-nope', code: recovery[1] })
      .expect(403);
    await api()
      .post('/account/mfa/disable')
      .set(auth(ok.body.accessToken as string))
      .send({ password: pw, code: recovery[1] })
      .expect(201);
    expect((await login(a.email).expect(201)).body.accessToken).toBeTruthy();
  });

  it('refuses weak passwords when registering', async () => {
    const u = uniq();
    const r = await api()
      .post('/auth/register')
      .send({
        orgName: `Weak ${u}`,
        country: 'GB',
        timeZone: 'Europe/London',
        currency: 'GBP',
        firstName: 'W',
        lastName: 'K',
        email: `w-${u}@acct.test`,
        password: 'password12345',
      })
      .expect(400);
    expect(JSON.stringify(r.body)).toContain('easy to guess');
  });

  it("remembers each person's language and refuses ones we do not offer", async () => {
    const a = await signUp();
    expect(
      (await api().get('/me').set(auth(a.token))).body.account.locale,
    ).toBeNull();
    await api()
      .put('/account/locale')
      .set(auth(a.token))
      .send({ locale: 'fr' })
      .expect(400);
    await api()
      .put('/account/locale')
      .set(auth(a.token))
      .send({ locale: 'si' })
      .expect(200);
    expect(
      (await api().get('/me').set(auth(a.token))).body.account.locale,
    ).toBe('si');
    expect((await api().get('/account').set(auth(a.token))).body.locale).toBe(
      'si',
    );
  });
});
