/** A small iCalendar (.ics) writer: all-day and timed events that Google, Outlook and Apple Calendar can subscribe to. */
const esc = (s: string) =>
  s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\' + ';')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');

/** Lines longer than 75 bytes are folded, as the format requires. */
function fold(line: string) {
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > 74) {
      out.push(cur);
      cur = ' ' + ch;
    } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n');
}

const stamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
const day = (iso: string) => iso.replace(/-/g, '');

export interface IcsEvent {
  uid: string;
  title: string;
  /** All-day: YYYY-MM-DD start and an inclusive end day. Timed: Date objects. */
  allDay?: { start: string; end: string };
  start?: Date;
  end?: Date;
  description?: string;
  location?: string;
}

export function buildIcs(name: string, events: IcsEvent[], now = new Date()) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Seamless Source HR//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(name)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
  ];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp(now)}`);
    if (e.allDay) {
      // The end of an all-day event is the day after the last day.
      const next = new Date(`${e.allDay.end}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      lines.push(
        `DTSTART;VALUE=DATE:${day(e.allDay.start)}`,
        `DTEND;VALUE=DATE:${day(next.toISOString().slice(0, 10))}`,
        'TRANSP:TRANSPARENT',
      );
    } else if (e.start && e.end) {
      lines.push(`DTSTART:${stamp(e.start)}`, `DTEND:${stamp(e.end)}`);
    }
    lines.push(`SUMMARY:${esc(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
