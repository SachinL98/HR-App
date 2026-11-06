import { parseDay } from './dates';

/**
 * How many days of a yearly allowance a person can use on a given date, with carry-over and monthly accrual.
 * Pure arithmetic, so the rules can be tested without a database.
 */
export interface EntitlementInput {
  amount: number; // the allowance for one period
  period: 'MONTH' | 'YEAR';
  periodStart: string; // YYYY-MM-DD
  /** Date used to work out how much has built up so far (monthly accrual). */
  accrualDate: string;
  /** Date the leave is taken; decides whether carried days have expired. */
  useDate: string;
  carryMax: number; // 0 = nothing carries over
  carryExpiryMonths: number | null; // null = carried days never expire
  accrual: 'upfront' | 'monthly';
  /** Days left unused from the previous period (never below 0). */
  prevUnused: number;
  /** Days used so far between the period start and the expiry date. */
  usedUpToExpiry: number;
}

export interface Entitlement {
  base: number; // this period's own allowance available so far
  carried: number; // days rolled over from last period
  carriedLeft: number; // of those, how many are still usable (some may have expired)
  expires: string | null; // last day carried days can be used
  total: number; // base + carriedLeft
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Last day carried days can be used: the end of the month, N months after the period starts. */
export function carryExpiry(periodStart: string, months: number | null) {
  if (months === null) return null;
  const s = parseDay(periodStart);
  return iso(
    new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + months, 0)),
  );
}

/** Months into the period that a date falls in, counting the current month (1 to 12). */
export function monthsElapsed(periodStart: string, date: string) {
  const s = parseDay(periodStart);
  const d = parseDay(date);
  const n =
    (d.getUTCFullYear() - s.getUTCFullYear()) * 12 +
    d.getUTCMonth() -
    s.getUTCMonth() +
    1;
  return Math.min(12, Math.max(1, n));
}

export function entitlement(i: EntitlementInput): Entitlement {
  const yearly = i.period === 'YEAR';
  const carried = yearly
    ? Math.min(Math.max(i.carryMax, 0), Math.max(i.prevUnused, 0))
    : 0;
  const expires =
    yearly && carried > 0
      ? carryExpiry(i.periodStart, i.carryExpiryMonths)
      : null;
  // After the expiry date only the carried days already used survive; the rest are gone.
  const carriedLeft =
    expires && i.useDate > expires
      ? Math.min(carried, Math.max(i.usedUpToExpiry, 0))
      : carried;
  // Monthly accrual builds up in half-day steps, rounded down.
  const base =
    yearly && i.accrual === 'monthly'
      ? Math.floor(
          ((i.amount * monthsElapsed(i.periodStart, i.accrualDate)) / 12) * 2,
        ) / 2
      : i.amount;
  return { base, carried, carriedLeft, expires, total: base + carriedLeft };
}
