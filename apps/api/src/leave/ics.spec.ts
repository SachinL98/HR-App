import { buildIcs } from './ics';

describe('ics', () => {
  it('writes all-day events with an exclusive end, escapes text, and folds long lines', () => {
    const out = buildIcs(
      'Team, "calendar"',
      [
        {
          uid: 'a@x',
          title: 'Sam; away, back soon',
          allDay: { start: '2026-12-24', end: '2026-12-31' },
        },
        {
          uid: 'b@x',
          title: 'x'.repeat(200),
          start: new Date('2026-12-01T10:00:00Z'),
          end: new Date('2026-12-01T10:30:00Z'),
        },
      ],
      new Date('2026-11-01T00:00:00Z'),
    );
    expect(out).toContain('DTSTART;VALUE=DATE:20261224');
    expect(out).toContain('DTEND;VALUE=DATE:20270101');
    expect(out).toContain(
      'SUMMARY:Sam' + '\\' + '; away' + '\\' + ', back soon',
    );
    expect(out).toContain('DTSTART:20261201T100000Z');
    expect(out.split('\r\n').every((l) => Buffer.byteLength(l) <= 75)).toBe(
      true,
    );
    expect(out.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});
