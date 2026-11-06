import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHmac } from 'crypto';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';

process.env.FILE_STORAGE_DIR = mkdtempSync(join(tmpdir(), 'hr-files-'));
process.env.THROTTLE_OFF = '1';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const pw = 'correct horse battery';
const uniq = () => Math.random().toString(36).slice(2, 8);
const day = 86400_000;

describe('Trial and billing limits', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication({ rawBody: true });
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
  afterAll(() => {
    delete process.env.BILLING_WEBHOOK_SECRET;
    return app.close();
  });
  const api = () =>
    request(app.getHttpServer() as Parameters<typeof request>[0]);
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  const company = async () => {
    const u = uniq();
    const r = await api()
      .post('/auth/register')
      .send({
        orgName: `Bill ${u}`,
        country: 'GB',
        timeZone: 'Europe/London',
        currency: 'GBP',
        firstName: 'Olivia',
        lastName: 'Owner',
        email: `o-${u}@b.test`,
        password: pw,
      })
      .expect(201);
    return {
      owner: r.body.accessToken as string,
      tenantId: r.body.tenant.id as string,
    };
  };
  const setSub = (tenantId: string, data: object) =>
    prisma.system.subscription.update({ where: { tenantId }, data });
  const org = async (t: string) =>
    (await api().get('/org').set(auth(t)).expect(200)).body.plan as {
      tier: string;
      state: string;
      seatLimit: number;
      seatsUsed: number;
    };
  const group = (t: string) =>
    api()
      .post('/pay-groups')
      .set(auth(t))
      .send({ name: `G${uniq()}`, payDay: 25 });

  it('keeps full access during the trial and three days of grace, then moves to Free', async () => {
    const { owner, tenantId } = await company();
    expect(await org(owner)).toMatchObject({ tier: 'GOLD', state: 'trial' });
    await group(owner).expect(201);

    await setSub(tenantId, { trialEndsAt: new Date(Date.now() - 1 * day) });
    expect(await org(owner)).toMatchObject({
      tier: 'GOLD',
      state: 'trial_grace',
    });
    await group(owner).expect(201);

    await setSub(tenantId, { trialEndsAt: new Date(Date.now() - 5 * day) });
    expect(await org(owner)).toMatchObject({
      tier: 'FREE',
      state: 'trial_ended',
      seatLimit: 5,
    });
    // Gated features lock, but nothing is lost and the history stays readable.
    const locked = await group(owner).expect(403);
    expect(JSON.stringify(locked.body)).toContain('plan has ended');
    await api().get('/pay-groups').set(auth(owner)).expect(200);
    await api().get('/payroll/runs').set(auth(owner)).expect(200);
    await api().get('/members').set(auth(owner)).expect(200);
  });

  it('stops new invitations beyond the Free limit once the trial has ended', async () => {
    const { owner, tenantId } = await company();
    await setSub(tenantId, { trialEndsAt: new Date(Date.now() - 5 * day) });
    for (let i = 0; i < 4; i++)
      await api()
        .post('/invites')
        .set(auth(owner))
        .send({ email: `i${i}-${uniq()}@b.test` })
        .expect(201);
    const full = await api()
      .post('/invites')
      .set(auth(owner))
      .send({ email: `x-${uniq()}@b.test` })
      .expect(409);
    expect(JSON.stringify(full.body)).toContain('Free plan');
    expect((await org(owner)).seatLimit).toBe(5);
  });

  it('accepts signed billing events only, and ignores stale or forged ones', async () => {
    const { owner, tenantId } = await company();
    const send = (
      event: object,
      secret = 'test-secret-with-enough-length',
      sign = true,
    ) => {
      const body = JSON.stringify(event);
      const sig = createHmac('sha256', secret).update(body).digest('hex');
      const r = api()
        .post('/billing/webhook')
        .set('content-type', 'application/json');
      if (sign) r.set('x-signature', `sha256=${sig}`);
      return r.send(body);
    };
    const ev = (o: object) => ({
      tenantId,
      tier: 'SILVER',
      status: 'ACTIVE',
      seats: 40,
      timestamp: Math.floor(Date.now() / 1000),
      ...o,
    });

    await send(ev({})).expect(404); // no secret configured yet
    process.env.BILLING_WEBHOOK_SECRET = 'test-secret-with-enough-length';
    await send(ev({}), 'wrong-secret-entirely-different').expect(401);
    await send(ev({}), undefined, false).expect(401);
    await send(ev({ timestamp: Math.floor(Date.now() / 1000) - 3600 })).expect(
      400,
    );
    await send(ev({ tenantId: '00000000-0000-4000-8000-000000000000' })).expect(
      404,
    );

    // Paying for Silver replaces the trial.
    await setSub(tenantId, { trialEndsAt: new Date(Date.now() - 9 * day) });
    expect((await org(owner)).tier).toBe('FREE');
    await send(
      ev({
        currentPeriodEnd: new Date(Date.now() + 20 * day).toISOString(),
        customerId: `cus_${uniq()}`,
      }),
    ).expect(200);
    expect(await org(owner)).toMatchObject({
      tier: 'SILVER',
      state: 'active',
      seatLimit: 40,
    });
    await group(owner).expect(201);

    // Another company cannot claim the same customer id.
    const other = await company();
    const linked = await prisma.system.subscription.findUniqueOrThrow({
      where: { tenantId },
    });
    await send(
      ev({ tenantId: other.tenantId, customerId: linked.stripeCustomerId }),
    ).expect(409);

    // A failed payment keeps access for a week, then drops to Free.
    await send(
      ev({
        status: 'PAST_DUE',
        currentPeriodEnd: new Date(Date.now() - 3 * day).toISOString(),
      }),
    ).expect(200);
    expect(await org(owner)).toMatchObject({
      tier: 'SILVER',
      state: 'past_due',
    });
    await send(
      ev({
        status: 'PAST_DUE',
        currentPeriodEnd: new Date(Date.now() - 10 * day).toISOString(),
      }),
    ).expect(200);
    expect(await org(owner)).toMatchObject({ tier: 'FREE' });
  });

  it('shows the plan page only to people who manage billing', async () => {
    const { owner } = await company();
    const ov = await api().get('/billing').set(auth(owner)).expect(200);
    expect(ov.body.plan).toMatchObject({
      tier: 'GOLD',
      state: 'trial',
      seatsUsed: 1,
    });
    expect(ov.body.features).toHaveLength(5);
    await api().get('/billing').expect(401);
  });
});
