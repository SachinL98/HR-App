import { periodFor, requestDays, sum } from './dates';

const mon_fri = { workWeek: [1, 2, 3, 4, 5], holidays: new Set<string>() };

describe('requestDays', () => {
  it('counts only working days across a weekend', () => {
    // Fri 8 May 2026 to Tue 12 May 2026: Fri, Mon, Tue
    expect(
      sum(requestDays('2026-05-08', '2026-05-12', 'FULL', 'FULL', mon_fri)),
    ).toBe(3);
  });
  it('skips company holidays', () => {
    const rules = { ...mon_fri, holidays: new Set(['2026-05-11']) };
    expect(
      sum(requestDays('2026-05-08', '2026-05-12', 'FULL', 'FULL', rules)),
    ).toBe(2);
  });
  it('a single half day is 0.5', () => {
    expect(
      sum(requestDays('2026-05-12', '2026-05-12', 'AM', 'AM', mon_fri)),
    ).toBe(0.5);
  });
  it('half days at either end of a range', () => {
    // Mon PM, Tue, Wed AM = 0.5 + 1 + 0.5
    expect(
      sum(requestDays('2026-05-11', '2026-05-13', 'PM', 'AM', mon_fri)),
    ).toBe(2);
  });
  it('a weekend-only request uses nothing', () => {
    expect(
      sum(requestDays('2026-05-09', '2026-05-10', 'FULL', 'FULL', mon_fri)),
    ).toBe(0);
  });
  it('leave types can count weekends', () => {
    expect(
      sum(
        requestDays('2026-05-09', '2026-05-10', 'FULL', 'FULL', {
          ...mon_fri,
          countWeekends: true,
        }),
      ),
    ).toBe(2);
  });
  it('supports a Sunday to Thursday work week', () => {
    const rules = { workWeek: [7, 1, 2, 3, 4], holidays: new Set<string>() };
    // Fri 8 May and Sat 9 May are off; Sun 10 May is a working day
    expect(
      sum(requestDays('2026-05-08', '2026-05-10', 'FULL', 'FULL', rules)),
    ).toBe(1);
  });
});

describe('periodFor', () => {
  it('month', () => {
    expect(periodFor('2026-02-14', 'MONTH')).toEqual({
      start: '2026-02-01',
      end: '2026-02-28',
    });
  });
  it('calendar year', () => {
    expect(periodFor('2026-06-01', 'YEAR')).toEqual({
      start: '2026-01-01',
      end: '2026-12-31',
    });
  });
  it('fiscal year starting in April', () => {
    expect(periodFor('2026-02-10', 'YEAR', 4)).toEqual({
      start: '2025-04-01',
      end: '2026-03-31',
    });
    expect(periodFor('2026-04-01', 'YEAR', 4)).toEqual({
      start: '2026-04-01',
      end: '2027-03-31',
    });
  });
});
