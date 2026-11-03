import { calculate, workingDaysIn, Component } from './engine';

const line = (r: ReturnType<typeof calculate>, code: string) =>
  r.lines.find((l) => l.code === code)?.amount;

describe('payroll engine', () => {
  it('pays basic and components with no statutory rules', () => {
    const comps: Component[] = [
      {
        code: 'TRAVEL',
        label: 'Travel',
        type: 'fixed',
        value: 100,
        taxable: false,
      },
      {
        code: 'BONUS',
        label: 'Allowance',
        type: 'percent',
        value: 10,
        taxable: true,
      },
    ];
    const r = calculate({
      basic: 2000,
      components: comps,
      unpaidDays: 0,
      workingDays: 21,
      regime: null,
    });
    expect(r.gross).toBe(2300);
    expect(r.net).toBe(2300);
    expect(r.ruleVersion).toBeNull();
  });

  it('takes unpaid leave off basic pro rata', () => {
    const r = calculate({
      basic: 2100,
      components: [],
      unpaidDays: 2,
      workingDays: 21,
      regime: null,
    });
    expect(line(r, 'BASIC')).toBe(1900);
    expect(r.gross).toBe(1900);
  });

  it('never goes below zero for unpaid days', () => {
    const r = calculate({
      basic: 1000,
      components: [],
      unpaidDays: 40,
      workingDays: 20,
      regime: null,
    });
    expect(r.gross).toBe(0);
  });

  it('UK: PAYE, NI and auto-enrolment pension on 3000 a month', () => {
    const r = calculate({
      basic: 3000,
      components: [],
      unpaidDays: 0,
      workingDays: 21,
      regime: 'uk',
    });
    expect(line(r, 'PENSION_EE')).toBe(124); // 5% of (3000 - 520)
    expect(line(r, 'PAYE')).toBe(365.55); // (3000-124)*12 = 34,512; minus 12,579 (code 1257L); 20%; /12
    expect(line(r, 'NI')).toBe(156.16); // 8% of (3000 - 1048)
    expect(line(r, 'NI_ER')).toBe(387.45); // 15% of (3000 - 417)
    expect(line(r, 'PENSION_ER')).toBe(74.4);
    expect(r.net).toBe(2354.29);
    expect(r.ruleVersion).toBe('uk-2025-26');
  });

  it('UK: higher rate and the 2% NI band', () => {
    const r = calculate({
      basic: 8000,
      components: [],
      unpaidDays: 0,
      workingDays: 21,
      regime: 'uk',
      taxProfile: { pensionOptOut: true },
    });
    // annual 96,000, allowance 12,579: 37,700*20% + the rest*40%
    expect(line(r, 'PAYE')).toBe(r2((7540 + 45721 * 0.4) / 12));
    expect(line(r, 'NI')).toBe(r2((4189 - 1048) * 0.08 + (8000 - 4189) * 0.02));
  });

  it('UK: BR code taxes everything at 20% and category X skips NI', () => {
    const r = calculate({
      basic: 1000,
      components: [],
      unpaidDays: 0,
      workingDays: 21,
      regime: 'uk',
      taxProfile: { taxCode: 'BR', niCategory: 'X', pensionOptOut: true },
    });
    expect(line(r, 'PAYE')).toBe(200);
    expect(line(r, 'NI')).toBeUndefined();
    expect(line(r, 'NI_ER')).toBeUndefined();
  });

  it('UK: the personal allowance is tapered away above 100,000 when no code is given', () => {
    const r = calculate({
      basic: 20000,
      components: [],
      unpaidDays: 0,
      workingDays: 21,
      regime: 'uk',
      taxProfile: { pensionOptOut: true },
    });
    // annual 240,000: no allowance, 37,700@20 + (125,140-37,700)@40 + rest@45
    expect(line(r, 'PAYE')).toBe(
      r2((7540 + 87440 * 0.4 + (240000 - 125140) * 0.45) / 12),
    );
  });

  it('UK: no tax below the personal allowance', () => {
    const r = calculate({
      basic: 1000,
      components: [],
      unpaidDays: 0,
      workingDays: 21,
      regime: 'uk',
      taxProfile: { pensionOptOut: true },
    });
    expect(line(r, 'PAYE')).toBeUndefined();
  });

  it('Sri Lanka: EPF, ETF and APIT on 200,000 a month', () => {
    const r = calculate({
      basic: 200000,
      components: [],
      unpaidDays: 0,
      workingDays: 21,
      regime: 'lk',
    });
    expect(line(r, 'EPF_EE')).toBe(16000);
    expect(line(r, 'EPF_ER')).toBe(24000);
    expect(line(r, 'ETF_ER')).toBe(6000);
    expect(line(r, 'APIT')).toBe(3000); // (2.4M - 1.8M relief) at 6%, /12
    expect(r.net).toBe(181000);
    expect(r.ruleVersion).toBe('lk-2025-26');
  });

  it('Sri Lanka: upper slabs and no relief', () => {
    const r = calculate({
      basic: 500000,
      components: [],
      unpaidDays: 0,
      workingDays: 21,
      regime: 'lk',
      taxProfile: { claimRelief: false },
    });
    // 6,000,000: 1M@6 + 500k@18 + 500k@24 + 500k@30 + 3.5M@36
    expect(line(r, 'APIT')).toBe(
      r2((60000 + 90000 + 120000 + 150000 + 1260000) / 12),
    );
  });

  it('counts working days', () => {
    expect(workingDaysIn(2026, 11)).toBe(21);
    expect(workingDaysIn(2026, 2)).toBe(20);
  });
});

function r2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
