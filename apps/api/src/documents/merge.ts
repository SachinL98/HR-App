/**
 * Merge fields for document templates: {{member.full_name}}, {{company.name}}, ...
 * Plus two special tokens that place images: {{stamp}} and {{signature.<name>}}.
 * Unknown fields are rejected when a template is saved, so a typo never reaches
 * an issued letter.
 */
export const FIELDS = {
  'member.full_name': 'Full name',
  'member.first_name': 'First name',
  'member.last_name': 'Last name',
  'member.employee_no': 'Employee number',
  'member.national_id': 'National ID / NIC (needs member management access)',
  'member.work_email': 'Work email',
  'member.job_title': 'Job title',
  'member.department': 'Department',
  'member.start_date': 'Start date',
  'member.end_date': 'End date',
  'member.employment_type': 'Employment type',
  'company.name': 'Company name',
  'company.legal_name': 'Company legal name',
  today: 'Today’s date',
  'salary.basic_monthly': 'Monthly basic salary (needs payroll access)',
  'salary.currency': 'Salary currency (needs payroll access)',
} as const;
/** Fields that may legitimately be blank (a current employee has no end date). */
export const OPTIONAL_FIELDS = new Set([
  'member.end_date',
  'member.employee_no',
]);
export type FieldName = keyof typeof FIELDS;

export const STAMP_MARK = '\u0001stamp\u0002';
export const SIG_MARK = '\u0001sig:';
const TOKEN = /\{\{\s*([a-z0-9_.]+)\s*\}\}/gi;
export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

export interface Parsed {
  fields: string[]; // text fields used
  stamp: boolean;
  signatures: string[]; // slugs
  unknown: string[];
}

export function parse(body: string): Parsed {
  const out: Parsed = { fields: [], stamp: false, signatures: [], unknown: [] };
  for (const m of body.matchAll(TOKEN)) {
    const t = m[1].toLowerCase();
    if (t === 'stamp') out.stamp = true;
    else if (t.startsWith('signature.')) out.signatures.push(t.slice(10));
    else if (t in FIELDS) out.fields.push(t);
    else out.unknown.push(t);
  }
  out.fields = [...new Set(out.fields)];
  out.signatures = [...new Set(out.signatures)];
  return out;
}

/** Fills text fields and removes the image tokens (they are drawn separately). */
export function fill(
  body: string,
  values: Record<string, string>,
  /** Keep image tokens as markers so the PDF can draw them where they were typed. */
  keepImages = false,
) {
  return body
    .replace(TOKEN, (_all, raw: string) => {
      const t = raw.toLowerCase();
      if (t === 'stamp') return keepImages ? STAMP_MARK : '';
      if (t.startsWith('signature.'))
        return keepImages ? `${SIG_MARK}${t.slice(10)}\u0002` : '';
      return values[t] ?? '';
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const longDate = (d: Date) =>
  d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
