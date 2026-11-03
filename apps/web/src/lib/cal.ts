import type { CalendarData, DayType } from "./api";

export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const parse = (s: string) => new Date(`${s}T00:00:00.000Z`);
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400_000);
export const isoWeekday = (d: Date) => d.getUTCDay() || 7;
export const today = () => iso(new Date());

export type View = "day" | "week" | "month" | "year";

/** The first and last day shown for a view around a date. Weeks start on Monday. */
export function rangeFor(view: View, date: string) {
  const d = parse(date);
  if (view === "day") return { from: date, to: date };
  if (view === "week") {
    const start = addDays(d, 1 - isoWeekday(d));
    return { from: iso(start), to: iso(addDays(start, 6)) };
  }
  if (view === "month") {
    return { from: iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))), to: iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))) };
  }
  return { from: `${d.getUTCFullYear()}-01-01`, to: `${d.getUTCFullYear()}-12-31` };
}

export function shift(view: View, date: string, dir: -1 | 1) {
  const d = parse(date);
  if (view === "day") return iso(addDays(d, dir));
  if (view === "week") return iso(addDays(d, 7 * dir));
  if (view === "month") return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + dir, 1)));
  return iso(new Date(Date.UTC(d.getUTCFullYear() + dir, 0, 1)));
}

export function eachDay(from: string, to: string) {
  const out: string[] = [];
  for (let d = parse(from); iso(d) <= to; d = addDays(d, 1)) out.push(iso(d));
  return out;
}

export interface Cell { type: DayType; part: "FULL" | "AM" | "PM"; label: string; detail?: string }

/** What one person is doing on one day: holiday, a recorded status, or the default for a working day. */
export function cellFor(data: CalendarData, memberId: string, date: string): Cell[] {
  const h = data.holidays.find((x) => x.date === date);
  if (h) return [{ type: "HOLIDAY", part: "FULL", label: "Holiday", detail: h.name }];
  const rows = data.days.filter((x) => x.memberId === memberId && x.date === date);
  if (rows.length) {
    return rows.map((r) => ({
      type: r.type, part: r.part as Cell["part"], label: LABEL[r.type],
      detail: r.type === "OUT_OF_OFFICE" && r.startTime ? `${r.startTime} to ${r.endTime}` : undefined,
    }));
  }
  const wd = isoWeekday(parse(date));
  return data.workWeek.includes(wd) ? [{ type: "IN_OFFICE", part: "FULL", label: LABEL.IN_OFFICE }] : [{ type: "NON_WORKING", part: "FULL", label: LABEL.NON_WORKING }];
}

export const LABEL: Record<DayType, string> = {
  IN_OFFICE: "In office", WFH: "Working from home", LEAVE: "On leave", HOLIDAY: "Holiday", OUT_OF_OFFICE: "Out of office", NON_WORKING: "Day off",
};

/** Colour classes per status (readable in light and dark). */
export const TONE: Record<DayType, string> = {
  IN_OFFICE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  WFH: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  LEAVE: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  HOLIDAY: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  OUT_OF_OFFICE: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
  NON_WORKING: "bg-transparent text-muted",
};
export const SHORT: Record<DayType, string> = { IN_OFFICE: "In", WFH: "WFH", LEAVE: "Leave", HOLIDAY: "Hol", OUT_OF_OFFICE: "Out", NON_WORKING: "" };
