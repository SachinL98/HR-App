// Pure date helpers. Dates are plain UTC calendar days ("YYYY-MM-DD"), never local times.

export type Part = 'FULL' | 'AM' | 'PM';
export interface DayWeight {
  date: string; // YYYY-MM-DD
  part: Part;
  weight: number; // 1 or 0.5
}

export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const parseDay = (s: string) => new Date(`${s}T00:00:00.000Z`);
export const addDays = (d: Date, n: number) =>
  new Date(d.getTime() + n * 86400_000);
/** ISO weekday: Monday = 1 … Sunday = 7 */
export const isoWeekday = (d: Date) => d.getUTCDay() || 7;

export interface DayRules {
  workWeek: number[];
  holidays: Set<string>;
  countWeekends?: boolean; // leave types that also use up weekend days
}

/**
 * The days a request actually uses, with half-day parts.
 * Single day: FULL = 1, AM or PM = 0.5.
 * Several days: the first day may be PM (0.5), the last day may be AM (0.5).
 * Non-working days and company holidays are skipped unless countWeekends is set
 * (holidays are always skipped).
 */
export function requestDays(
  start: string,
  end: string,
  startPart: Part,
  endPart: Part,
  rules: DayRules,
): DayWeight[] {
  const s = parseDay(start);
  const e = parseDay(end);
  const out: DayWeight[] = [];
  for (let d = s; d <= e; d = addDays(d, 1)) {
    const key = iso(d);
    if (rules.holidays.has(key)) continue;
    if (!rules.countWeekends && !rules.workWeek.includes(isoWeekday(d)))
      continue;
    let part: Part = 'FULL';
    if (start === end) part = startPart;
    else if (key === start && startPart === 'PM') part = 'PM';
    else if (key === end && endPart === 'AM') part = 'AM';
    out.push({ date: key, part, weight: part === 'FULL' ? 1 : 0.5 });
  }
  return out;
}

export type Period = 'MONTH' | 'YEAR';

/** The quota period (inclusive start and end) that contains a date. fiscalStart = month 1-12. */
export function periodFor(date: string, period: Period, fiscalStart = 1) {
  const d = parseDay(date);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth(); // 0-11
  if (period === 'MONTH') {
    return {
      start: iso(new Date(Date.UTC(y, m, 1))),
      end: iso(new Date(Date.UTC(y, m + 1, 0))),
    };
  }
  const startYear = m + 1 >= fiscalStart ? y : y - 1;
  const start = new Date(Date.UTC(startYear, fiscalStart - 1, 1));
  const end = new Date(Date.UTC(startYear + 1, fiscalStart - 1, 0));
  return { start: iso(start), end: iso(end) };
}

export const sum = (xs: DayWeight[]) => xs.reduce((a, x) => a + x.weight, 0);

/** Do two inclusive date ranges overlap? */
export const overlaps = (aS: string, aE: string, bS: string, bE: string) =>
  aS <= bE && bS <= aE;
