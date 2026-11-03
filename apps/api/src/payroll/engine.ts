/**
 * Pure payroll calculation. No database, no clock: the same input always gives
 * the same payslip, which is what makes it testable and auditable.
 *
 * Statutory rules are optional (a company can run payroll with none) and
 * versioned by tax year so an old run can always say which rules it used.
 * They are a best-effort implementation of the published monthly rules and
 * must be checked by an accountant before real use: see docs/payroll.md.
 */
export type Regime = 'uk' | 'lk' | null;

export interface Component {
  code: string;
  label: string;
  type: 'fixed' | 'percent'; // percent is of full (pre-deduction) basic pay
  value: number;
  taxable: boolean;
}

export interface TaxProfile {
  taxCode?: string; // UK, e.g. "1257L", "BR", "0T"
  niCategory?: 'A' | 'C' | 'X'; // UK: A standard, C over state pension age, X none
  pensionOptOut?: boolean; // UK auto-enrolment
  claimRelief?: boolean; // LK: personal relief claimed with this employer (default true)
}

export interface PayInput {
  basic: number; // monthly
  components: Component[];
  unpaidDays: number;
  workingDays: number; // working days in the period
  regime: Regime;
  taxProfile?: TaxProfile;
}

export interface Line {
  code: string;
  label: string;
  kind: 'earning' | 'deduction' | 'employer';
  amount: number;
}

export interface PayResult {
  gross: number;
  net: number;
  lines: Line[];
  ruleVersion: string | null;
}

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function slabs(amount: number, bands: [limit: number, rate: number][]) {
  let tax = 0;
  let from = 0;
  for (const [limit, rate] of bands) {
    if (amount <= from) break;
    tax += (Math.min(amount, limit) - from) * rate;
    from = limit;
  }
  return tax;
}

// ───────────── United Kingdom, tax year 2025/26 (England, Wales, NI) ─────────────
export const UK_VERSION = 'uk-2025-26';
const UK = {
  defaultAllowance: 12570,
  taperStart: 100000,
  bands: [
    [37700, 0.2],
    [125140, 0.4],
    [Infinity, 0.45],
  ] as [number, number][],
  ni: { primaryThreshold: 1048, upperLimit: 4189, main: 0.08, above: 0.02 },
  employerNi: { threshold: 417, rate: 0.15 },
  pension: { lower: 520, upper: 4189, employee: 0.05, employer: 0.03 },
};

function ukAllowance(code: string | undefined, annualTaxable: number) {
  const c = code?.toUpperCase();
  if (c === '0T') return 0;
  // HMRC tables turn a code such as 1257L into an allowance of 12,579.
  const m = c ? /^(\d{1,5})[LMNTY]$/.exec(c) : null;
  if (m) return Number(m[1]) * 10 + 9;
  // No code given: standard allowance, tapered away for incomes over 100,000.
  if (annualTaxable <= UK.taperStart) return UK.defaultAllowance + 9;
  const taper = Math.floor((annualTaxable - UK.taperStart) / 2);
  return Math.max(0, UK.defaultAllowance - taper);
}

function ukTax(code: string | undefined, annualTaxable: number) {
  const c = code?.toUpperCase();
  if (c === 'BR') return annualTaxable * 0.2;
  if (c === 'D0') return annualTaxable * 0.4;
  if (c === 'D1') return annualTaxable * 0.45;
  const taxable = Math.max(0, annualTaxable - ukAllowance(code, annualTaxable));
  return slabs(taxable, UK.bands);
}

function uk(gross: number, taxableGross: number, p: TaxProfile) {
  const lines: Line[] = [];
  const qualifying = Math.max(
    0,
    Math.min(gross, UK.pension.upper) - UK.pension.lower,
  );
  const pensionEe = p.pensionOptOut ? 0 : r2(qualifying * UK.pension.employee);
  const pensionEr = p.pensionOptOut ? 0 : r2(qualifying * UK.pension.employer);
  // Net pay arrangement: employee pension comes off before income tax.
  const annualTaxable = Math.max(0, taxableGross - pensionEe) * 12;
  const tax = r2(ukTax(p.taxCode, annualTaxable) / 12);

  const cat = p.niCategory ?? 'A';
  const ni =
    cat === 'A'
      ? r2(
          Math.max(
            0,
            Math.min(gross, UK.ni.upperLimit) - UK.ni.primaryThreshold,
          ) *
            UK.ni.main +
            Math.max(0, gross - UK.ni.upperLimit) * UK.ni.above,
        )
      : 0;
  const erNi =
    cat === 'X'
      ? 0
      : r2(Math.max(0, gross - UK.employerNi.threshold) * UK.employerNi.rate);

  if (tax)
    lines.push({
      code: 'PAYE',
      label: 'Income tax (PAYE)',
      kind: 'deduction',
      amount: tax,
    });
  if (ni)
    lines.push({
      code: 'NI',
      label: 'National Insurance',
      kind: 'deduction',
      amount: ni,
    });
  if (pensionEe)
    lines.push({
      code: 'PENSION_EE',
      label: 'Pension (employee)',
      kind: 'deduction',
      amount: pensionEe,
    });
  if (erNi)
    lines.push({
      code: 'NI_ER',
      label: 'Employer National Insurance',
      kind: 'employer',
      amount: erNi,
    });
  if (pensionEr)
    lines.push({
      code: 'PENSION_ER',
      label: 'Pension (employer)',
      kind: 'employer',
      amount: pensionEr,
    });
  return { lines, version: UK_VERSION };
}

// ───────────── Sri Lanka, 2025/26 ─────────────
export const LK_VERSION = 'lk-2025-26';
const LK = {
  relief: 1_800_000,
  bands: [
    [1_000_000, 0.06],
    [1_500_000, 0.18],
    [2_000_000, 0.24],
    [2_500_000, 0.3],
    [Infinity, 0.36],
  ] as [number, number][],
  epfEmployee: 0.08,
  epfEmployer: 0.12,
  etfEmployer: 0.03,
};

function lk(
  gross: number,
  taxableGross: number,
  epfBase: number,
  p: TaxProfile,
) {
  const epfEe = r2(epfBase * LK.epfEmployee);
  const epfEr = r2(epfBase * LK.epfEmployer);
  const etf = r2(epfBase * LK.etfEmployer);
  const relief = p.claimRelief === false ? 0 : LK.relief;
  const apit = r2(
    slabs(Math.max(0, taxableGross * 12 - relief), LK.bands) / 12,
  );
  const lines: Line[] = [];
  if (apit)
    lines.push({
      code: 'APIT',
      label: 'Income tax (APIT)',
      kind: 'deduction',
      amount: apit,
    });
  if (epfEe)
    lines.push({
      code: 'EPF_EE',
      label: 'EPF (employee 8%)',
      kind: 'deduction',
      amount: epfEe,
    });
  if (epfEr)
    lines.push({
      code: 'EPF_ER',
      label: 'EPF (employer 12%)',
      kind: 'employer',
      amount: epfEr,
    });
  if (etf)
    lines.push({
      code: 'ETF_ER',
      label: 'ETF (employer 3%)',
      kind: 'employer',
      amount: etf,
    });
  void gross;
  return { lines, version: LK_VERSION };
}

export function calculate(input: PayInput): PayResult {
  const { basic, components, unpaidDays, workingDays } = input;
  const unpaid =
    workingDays > 0 && unpaidDays > 0
      ? r2(Math.min(basic, (basic / workingDays) * unpaidDays))
      : 0;
  const basicPaid = r2(basic - unpaid);

  const lines: Line[] = [
    { code: 'BASIC', label: 'Basic pay', kind: 'earning', amount: basicPaid },
  ];
  if (unpaid)
    lines.push({
      code: 'UNPAID_INFO',
      label: `Unpaid leave (${unpaidDays} day${unpaidDays === 1 ? '' : 's'}, already deducted from basic)`,
      kind: 'earning',
      amount: 0,
    });
  let gross = basicPaid;
  let taxable = basicPaid;
  for (const c of components) {
    const amount = r2(c.type === 'percent' ? (basic * c.value) / 100 : c.value);
    if (!amount) continue;
    lines.push({ code: c.code, label: c.label, kind: 'earning', amount });
    gross += amount;
    if (c.taxable) taxable += amount;
  }
  gross = r2(gross);
  taxable = r2(taxable);

  let statutory: { lines: Line[]; version: string } | null = null;
  const profile = input.taxProfile ?? {};
  if (input.regime === 'uk') statutory = uk(gross, taxable, profile);
  if (input.regime === 'lk') statutory = lk(gross, taxable, basicPaid, profile);
  if (statutory) lines.push(...statutory.lines);

  const deductions = lines
    .filter((l) => l.kind === 'deduction')
    .reduce((a, l) => a + l.amount, 0);
  return {
    gross,
    net: r2(gross - deductions),
    lines,
    ruleVersion: statutory?.version ?? null,
  };
}

/** Weekdays Mon to Fri (or the given work week, ISO 1..7) in a calendar month. */
export function workingDaysIn(
  year: number,
  month: number, // 1..12
  workWeek: number[] = [1, 2, 3, 4, 5],
) {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let n = 0;
  for (let d = 1; d <= days; d++) {
    const dow = new Date(Date.UTC(year, month - 1, d)).getUTCDay() || 7;
    if (workWeek.includes(dow)) n++;
  }
  return n;
}
