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
const YEAR = new Date().getUTCFullYear();
/** The first Monday on or after a date, as YYYY-MM-DD, plus an offset in days. */
const monday = (y: number, m: number, plus = 0) => {
  const d = new Date(Date.UTC(y, m - 1, 1));
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCDate(d.getUTCDate() + plus);
  return d.toISOString().slice(0, 10);
};

describe('Leave carry-over and accrual', () => {
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

  const setup = async () => {
    const u = uniq();
    const r = await api()
      .post('/auth/register')
      .send({
        orgName: `Carry ${u}`,
        country: 'GB',
        timeZone: 'Europe/London',
        currency: 'GBP',
        firstName: 'Olivia',
        lastName: 'Owner',
        email: `o-${u}@c.test`,
        password: pw,
      })
      .expect(201);
    const owner = r.body.accessToken as string;
    const inv = await api()
      .post('/invites')
      .set(auth(owner))
      .send({ email: `w-${uniq()}@c.test` })
      .expect(201);
    const token = new URL(inv.body.devLink as string).searchParams.get('token');
    const acc = await api()
      .post('/auth/invites/accept')
      .send({ token, firstName: 'Wanda', lastName: 'Worker', password: pw })
      .expect(201);
    const worker = acc.body.accessToken as string;
    const types = (await api().get('/leave-types').set(auth(owner))).body as {
      id: string;
      code: string;
    }[];
    const annual = types.find((t) => t.code === 'ANNUAL')!.id;
    const balance = async (on: string) => {
      const b = (
        await api().get(`/balances/me?on=${on}`).set(auth(worker)).expect(200)
      ).body as {
        key: string;
        entitled: number;
        remaining: number;
        carriedOver: number;
        carriedLeft: number;
        carryExpires: string | null;
      }[];
      return b.find((x) => x.key === 'ANNUAL')!;
    };
    const ask = (start: string, end: string) =>
      api().post('/requests').set(auth(worker)).send({
        type: 'LEAVE',
        leaveTypeId: annual,
        startDate: start,
        endDate: end,
      });
    const policy = (body: object) =>
      api().patch(`/leave-types/${annual}/policy`).set(auth(owner)).send(body);
    return { owner, worker, annual, balance, ask, policy };
  };

  it('does not carry anything over until a policy is set, then carries up to the cap and lets it expire', async () => {
    const { owner, ask, balance, policy } = await setup();
    // Last year: 3 working days of annual leave, approved.
    const used = await ask(monday(YEAR - 1, 3), monday(YEAR - 1, 3, 2)).expect(
      201,
    );
    await api()
      .post(`/requests/${used.body.id}/decision`)
      .set(auth(owner))
      .send({ decision: 'APPROVED' })
      .expect(201);

    expect(await balance(`${YEAR}-02-10`)).toMatchObject({
      entitled: 14,
      carriedOver: 0,
    });

    await policy({ carryOverMax: 5, carryOverExpiryMonths: 3 }).expect(200);
    // 14 - 3 used = 11 unused, capped at 5, usable until the end of March.
    expect(await balance(`${YEAR}-02-10`)).toMatchObject({
      entitled: 19,
      carriedOver: 5,
      carriedLeft: 5,
      carryExpires: `${YEAR}-03-31`,
    });
    expect(await balance(`${YEAR}-04-10`)).toMatchObject({
      entitled: 14,
      carriedOver: 5,
      carriedLeft: 0,
    });

    await policy({ carryOverMax: 2, carryOverExpiryMonths: 3 }).expect(200);
    expect(await balance(`${YEAR}-02-10`)).toMatchObject({
      entitled: 16,
      carriedOver: 2,
    });

    // Turning it off clears the expiry too.
    await policy({ carryOverMax: 0 }).expect(200);
    expect(await balance(`${YEAR}-02-10`)).toMatchObject({
      entitled: 14,
      carriedOver: 0,
      carryExpires: null,
    });
  });

  it('lets carried-over days cover a request that the normal allowance would not', async () => {
    const { owner, ask, policy } = await setup();
    const used = await ask(monday(YEAR - 1, 3), monday(YEAR - 1, 3, 2)).expect(
      201,
    );
    await api()
      .post(`/requests/${used.body.id}/decision`)
      .set(auth(owner))
      .send({ decision: 'APPROVED' })
      .expect(201);
    // Three working weeks is 15 days: over the 14-day allowance.
    const start = monday(YEAR, 9);
    const end = monday(YEAR, 9, 18); // the Friday of the third week: 15 working days
    const e = end;
    const blocked = await ask(start, e).expect(409);
    expect(JSON.stringify(blocked.body)).toContain('Not enough');
    await policy({ carryOverMax: 5 }).expect(200);
    await ask(start, e).expect(201);
  });

  it('builds the allowance up month by month when set to accrue', async () => {
    const { balance, ask, policy } = await setup();
    await policy({ accrual: 'monthly' }).expect(200);
    expect(await balance(`${YEAR}-01-10`)).toMatchObject({ entitled: 1 }); // 14 / 12, rounded down to half days
    expect(await balance(`${YEAR}-06-30`)).toMatchObject({ entitled: 7 });
    expect(await balance(`${YEAR}-12-31`)).toMatchObject({ entitled: 14 });
    // Only one day has built up by early January, so three days then is refused, and one day is fine.
    const blocked = await ask(
      monday(YEAR + 1, 1),
      monday(YEAR + 1, 1, 2),
    ).expect(409);
    expect(JSON.stringify(blocked.body)).toContain('building up each month');
    await ask(monday(YEAR + 1, 1), monday(YEAR + 1, 1)).expect(201);
  });

  it('only people who manage leave allowances can change the policy, and bad values are refused', async () => {
    const { worker, annual, policy } = await setup();
    await api()
      .patch(`/leave-types/${annual}/policy`)
      .set(auth(worker))
      .send({ carryOverMax: 5 })
      .expect(403);
    await policy({ carryOverMax: 99 }).expect(400);
    await policy({ accrual: 'daily' }).expect(400);
    await policy({ carryOverMax: 5, carryOverExpiryMonths: 18 }).expect(400);
  });
});
