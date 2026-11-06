import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

const uniq = () => Math.random().toString(36).slice(2, 8);
const pw = 'correct horse battery';
const future = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

describe('A sole owner can decide their own request, nobody else can decide theirs', () => {
  let app: INestApplication;
  const api = () =>
    request(app.getHttpServer() as Parameters<typeof request>[0]);
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
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

  const setup = async () => {
    const u = uniq();
    const r = await api()
      .post('/auth/register')
      .send({
        orgName: `Solo ${u}`,
        country: 'GB',
        timeZone: 'Europe/London',
        currency: 'GBP',
        firstName: 'Sol',
        lastName: 'Owner',
        email: `o-${u}@solo.test`,
        password: pw,
      })
      .expect(201);
    const owner = r.body.accessToken as string;
    const annual = (
      (await api().get('/leave-types').set(auth(owner))).body as {
        id: string;
      }[]
    )[0].id;
    const ask = (t: string, start: string) =>
      api().post('/requests').set(auth(t)).send({
        type: 'LEAVE',
        leaveTypeId: annual,
        startDate: start,
        endDate: start,
      });
    const invite = async (first: string) => {
      const inv = await api()
        .post('/invites')
        .set(auth(owner))
        .send({ email: `${first}-${uniq()}@solo.test` })
        .expect(201);
      const token = new URL(inv.body.devLink as string).searchParams.get(
        'token',
      );
      const acc = await api()
        .post('/auth/invites/accept')
        .send({ token, firstName: first, lastName: 'Person', password: pw })
        .expect(201);
      return acc.body.accessToken as string;
    };
    return { owner, ask, invite };
  };

  it('shows the sole owner their own pending request, and lets them approve it', async () => {
    const { owner, ask } = await setup();
    const r = await ask(owner, future(20)).expect(201);
    const inbox = (
      await api().get('/requests/inbox').set(auth(owner)).expect(200)
    ).body as { id: string }[];
    expect(inbox.map((x) => x.id)).toContain(r.body.id);
    await api()
      .post(`/requests/${r.body.id}/decision`)
      .set(auth(owner))
      .send({ decision: 'APPROVED' })
      .expect(201);
    const after = (await api().get('/requests/inbox').set(auth(owner)))
      .body as unknown[];
    expect(after).toHaveLength(0);
  });

  it('never lets an ordinary employee decide their own request', async () => {
    const { owner, ask, invite } = await setup();
    const worker = await invite('Worker');
    const r = await ask(worker, future(21)).expect(201);
    await api()
      .post(`/requests/${r.body.id}/decision`)
      .set(auth(worker))
      .send({ decision: 'APPROVED' })
      .expect(403);
    expect(
      (await api().get('/requests/inbox').set(auth(worker))).body as unknown[],
    ).toHaveLength(0);
    // The owner is who decides it.
    expect(
      (
        (await api().get('/requests/inbox').set(auth(owner))).body as {
          id: string;
        }[]
      ).map((x) => x.id),
    ).toContain(r.body.id);
  });
});
