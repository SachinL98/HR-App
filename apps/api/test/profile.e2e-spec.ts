import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const uniq = () => Math.random().toString(36).slice(2, 8);
// A real 1x1 PNG.
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const TOKEN = 'profile-token-for-tests-0123456789abcd';

describe('Profile photo and details', () => {
  let app: INestApplication;
  let auth: { Authorization: string };
  let memberId = '';
  const email = `pf-${uniq()}@pf.test`;
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
    const org = `Pf ${uniq()}`;
    const reg = await http()
      .post('/auth/register')
      .send({
        orgName: org,
        country: 'GB',
        timeZone: 'Europe/London',
        currency: 'GBP',
        firstName: 'Pia',
        lastName: 'Foster',
        email,
        password: 'correct horse battery',
      })
      .expect(201);
    auth = { Authorization: `Bearer ${reg.body.accessToken as string}` };
    memberId = (await http().get('/me').set(auth).expect(200)).body
      .id as string;
    const t = await app
      .get(PrismaService)
      .system.tenant.findFirstOrThrow({ where: { displayName: org } });
    process.env.INTEGRATION_TOKEN = TOKEN;
    process.env.INTEGRATION_TENANT = t.slug;
  });
  afterAll(async () => {
    delete process.env.INTEGRATION_TOKEN;
    delete process.env.INTEGRATION_TENANT;
    await app.close();
  });

  it('saves contact details', async () => {
    await http()
      .put('/account/profile')
      .set(auth)
      .send({ preferredName: 'Pi', phone: '+44 7000 000000' })
      .expect(200);
    const p = await http().get('/account/profile').set(auth).expect(200);
    expect(p.body).toMatchObject({
      firstName: 'Pia',
      preferredName: 'Pi',
      phone: '+44 7000 000000',
      email,
      hasPhoto: false,
    });
  });

  it('uploads, serves and removes a photo, and rejects non-images', async () => {
    await http()
      .put('/account/photo')
      .set(auth)
      .send({ imageBase64: PNG })
      .expect(200);
    expect((await http().get('/account/profile').set(auth)).body.hasPhoto).toBe(
      true,
    );
    const img = await http()
      .get(`/members/${memberId}/photo`)
      .set(auth)
      .expect(200);
    expect(img.headers['content-type']).toBe('image/png');
    await http()
      .put('/account/photo')
      .set(auth)
      .send({
        imageBase64: Buffer.from('not an image at all').toString('base64'),
      })
      .expect(400);
    await http().put('/account/photo').set(auth);
    // Too large: refused by the body limit or by the size check, depending on how the app is set up.
    const big = await http()
      .put('/account/photo')
      .set(auth)
      .send({ imageBase64: Buffer.alloc(500_000, 0xff).toString('base64') });
    expect([400, 413]).toContain(big.status);
    await http().delete('/account/photo').set(auth).expect(200);
    await http().get(`/members/${memberId}/photo`).set(auth).expect(404);
    await http().get(`/members/${memberId}/photo`).expect(401);
  });

  it('shares the photo with the dashboard by email, token required', async () => {
    const B = { Authorization: `Bearer ${TOKEN}` };
    await http()
      .put('/integrations/photo')
      .send({ email, imageBase64: PNG })
      .expect(401);
    await http()
      .put('/integrations/photo')
      .set(B)
      .send({ email, imageBase64: PNG })
      .expect(200);
    const got = await http()
      .get('/integrations/photo')
      .query({ email })
      .set(B)
      .expect(200);
    expect(got.body).toMatchObject({ mime: 'image/png', imageBase64: PNG });
    await http()
      .get('/integrations/photo')
      .query({ email: 'nobody@pf.test' })
      .set(B)
      .expect(404);
    await http()
      .delete('/integrations/photo')
      .query({ email })
      .set(B)
      .expect(200);
    await http().get('/integrations/photo').query({ email }).set(B).expect(404);
  });
});
