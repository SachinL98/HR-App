/** Offset of a time zone from UTC at an instant, in ms (positive east of UTC). */
function offset(ts: number, tz: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(new Date(ts)).map((x) => [x.type, x.value]),
  );
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(ts / 1000) * 1000;
}

/** "2026-11-05" + "14:30" wall-clock time in `tz` → the UTC instant as an ISO string. */
export function zonedToUtc(day: string, time: string, tz: string) {
  const [y, m, d] = day.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let ts = guess - offset(guess, tz);
  ts = guess - offset(ts, tz); // second pass handles daylight-saving boundaries
  return new Date(ts).toISOString();
}

/** The calendar day (YYYY-MM-DD) an instant falls on in `tz`. */
export const dayIn = (iso: string, tz: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

export const timeIn = (iso: string, tz: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
