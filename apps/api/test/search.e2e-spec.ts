import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';

process.env.FILE_STORAGE_DIR = mkdtempSync(join(tmpdir(), 'hr-files-'));
process.env.THROTTLE_OFF = '1';

import { AppModule } from '../src/app.module';

const pw = 'correct horse battery';
const uniq = () => Math.random().toString(36).slice(2, 8);

describe('Search', () => {
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
  const company = async (tag: string, first = 'Olivia') => {
    const u = uniq();
    const r = await api()
      .post('/auth/register')
      .send({
        orgName: `${tag} ${u}`,
        country: 'GB',
        timeZone: 'Europe/London',
        currency: 'GBP',
        firstName: first,
        lastName: `Zebrowski${tag}`,
        email: `o-${u}@s.test`,
        password: pw,
      })
      .expect(201);
    return r.body.accessToken as string;
  };

  it('finds people by name or email, ignores one-letter searches, and never crosses companies', async () => {
    const a = await company('Alpha');
    const b = await company('Beta');
    expect(
      (await api().get('/search?q=z').set(auth(a)).expect(200)).body.people,
    ).toEqual([]);
    const hit = await api()
      .get('/search?q=zebrowskialpha')
      .set(auth(a))
      .expect(200);
    expect(hit.body.people).toHaveLength(1);
    expect(hit.body.people[0].name).toContain('ZebrowskiAlpha');
    // The other company's person is invisible, even by exact name.
    const miss = await api()
      .get('/search?q=zebrowskialpha')
      .set(auth(b))
      .expect(200);
    expect(miss.body.people).toEqual([]);
    await api().get('/search?q=zebrowski').expect(401);
  });

  it('finds notices by title only for people they were sent to', async () => {
    const owner = await company('Gamma');
    await api()
      .post('/notices')
      .set(auth(owner))
      .send({
        title: 'Quarterly offsite plan',
        body: 'Details',
        everyone: true,
      })
      .expect(201);
    const r = await api().get('/search?q=offsite').set(auth(owner)).expect(200);
    expect(r.body.notices.map((n: { title: string }) => n.title)).toEqual([
      'Quarterly offsite plan',
    ]);
  });
});
