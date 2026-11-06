import { planOf, type SubLike } from './plan';

const day = 86400_000;
const now = new Date('2026-06-15T12:00:00Z');
const sub = (o: Partial<SubLike>): SubLike => ({
  tier: 'GOLD',
  status: 'TRIALING',
  seats: 500,
  trialEndsAt: null,
  currentPeriodEnd: null,
  ...o,
});

describe('planOf', () => {
  it('keeps Gold during the trial and for three days after, then drops to Free with 5 seats', () => {
    const ends = new Date(now.getTime() + 2 * day);
    expect(planOf(sub({ trialEndsAt: ends }), now)).toMatchObject({
      tier: 'GOLD',
      state: 'trial',
      seatLimit: 500,
    });
    const lapsed = new Date(now.getTime() - 1 * day);
    expect(planOf(sub({ trialEndsAt: lapsed }), now)).toMatchObject({
      tier: 'GOLD',
      state: 'trial_grace',
    });
    expect(
      planOf(sub({ trialEndsAt: lapsed }), now).graceEndsAt?.toISOString(),
    ).toBe(new Date(lapsed.getTime() + 3 * day).toISOString());
    const gone = new Date(now.getTime() - 4 * day);
    expect(planOf(sub({ trialEndsAt: gone }), now)).toMatchObject({
      tier: 'FREE',
      chosen: 'GOLD',
      state: 'trial_ended',
      seatLimit: 5,
    });
  });
  it('treats a paid plan as active and caps seats by what was paid for', () => {
    expect(
      planOf(sub({ status: 'ACTIVE', tier: 'SILVER', seats: 40 }), now),
    ).toMatchObject({ tier: 'SILVER', state: 'active', seatLimit: 40 });
    expect(
      planOf(sub({ status: 'ACTIVE', tier: 'BRONZE', seats: 999 }), now)
        .seatLimit,
    ).toBe(25);
  });
  it('gives seven days of grace after a failed payment, then Free', () => {
    const end = new Date(now.getTime() - 5 * day);
    expect(
      planOf(
        sub({ status: 'PAST_DUE', tier: 'SILVER', currentPeriodEnd: end }),
        now,
      ),
    ).toMatchObject({ tier: 'SILVER', state: 'past_due' });
    const old = new Date(now.getTime() - 8 * day);
    expect(
      planOf(
        sub({ status: 'PAST_DUE', tier: 'SILVER', currentPeriodEnd: old }),
        now,
      ),
    ).toMatchObject({ tier: 'FREE', state: 'canceled' });
  });
  it('lets a cancelled plan run to the end of the paid period', () => {
    const later = new Date(now.getTime() + 10 * day);
    expect(
      planOf(
        sub({ status: 'CANCELED', tier: 'SILVER', currentPeriodEnd: later }),
        now,
      ),
    ).toMatchObject({ tier: 'SILVER', state: 'active' });
    expect(
      planOf(
        sub({ status: 'CANCELED', tier: 'SILVER', currentPeriodEnd: null }),
        now,
      ),
    ).toMatchObject({ tier: 'FREE', state: 'canceled' });
  });
});
