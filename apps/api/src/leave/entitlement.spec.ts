import {
  carryExpiry,
  entitlement,
  monthsElapsed,
  type EntitlementInput,
} from './entitlement';

const base: EntitlementInput = {
  amount: 14,
  period: 'YEAR',
  periodStart: '2026-01-01',
  accrualDate: '2026-06-15',
  useDate: '2026-06-15',
  carryMax: 0,
  carryExpiryMonths: null,
  accrual: 'upfront',
  prevUnused: 0,
  usedUpToExpiry: 0,
};

describe('entitlement', () => {
  it('gives the whole year at once by default, with nothing carried', () => {
    expect(entitlement({ ...base, prevUnused: 9 })).toMatchObject({
      base: 14,
      carried: 0,
      total: 14,
    });
  });
  it('carries over unused days up to the cap', () => {
    expect(entitlement({ ...base, carryMax: 5, prevUnused: 9 })).toMatchObject({
      carried: 5,
      carriedLeft: 5,
      total: 19,
    });
    expect(entitlement({ ...base, carryMax: 5, prevUnused: 2 })).toMatchObject({
      carried: 2,
      total: 16,
    });
    expect(entitlement({ ...base, carryMax: 5, prevUnused: -3 })).toMatchObject(
      { carried: 0, total: 14 },
    );
  });
  it('lets carried days expire, keeping only those already used', () => {
    const e = { ...base, carryMax: 5, prevUnused: 9, carryExpiryMonths: 3 };
    expect(carryExpiry('2026-01-01', 3)).toBe('2026-03-31');
    expect(entitlement({ ...e, useDate: '2026-03-31' }).carriedLeft).toBe(5); // last good day
    expect(
      entitlement({ ...e, useDate: '2026-04-01', usedUpToExpiry: 2 }),
    ).toMatchObject({ carriedLeft: 2, total: 16 });
    expect(
      entitlement({ ...e, useDate: '2026-04-01', usedUpToExpiry: 0 })
        .carriedLeft,
    ).toBe(0);
    expect(
      entitlement({ ...e, useDate: '2026-04-01', usedUpToExpiry: 9 })
        .carriedLeft,
    ).toBe(5); // cannot exceed what carried
  });
  it('builds up monthly in half-day steps, rounded down, never past the year', () => {
    const m = { ...base, accrual: 'monthly' as const };
    expect(entitlement({ ...m, accrualDate: '2026-01-10' }).base).toBe(1); // 14/12 = 1.16 -> 1
    expect(entitlement({ ...m, accrualDate: '2026-06-30' }).base).toBe(7); // 6 months
    expect(entitlement({ ...m, accrualDate: '2026-12-31' }).base).toBe(14);
    expect(monthsElapsed('2026-04-01', '2027-03-31')).toBe(12);
    expect(monthsElapsed('2026-04-01', '2026-04-01')).toBe(1);
  });
  it('ignores carry-over and accrual for monthly allowances', () => {
    expect(
      entitlement({
        ...base,
        period: 'MONTH',
        accrual: 'monthly',
        carryMax: 5,
        prevUnused: 4,
        amount: 8,
      }),
    ).toMatchObject({ base: 8, carried: 0, total: 8 });
  });
});
