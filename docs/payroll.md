# Payroll

How payroll works, what it assumes, and what must be checked before real use.

## Flow

1. **Pay group**: a currency, a pay day and (optionally) a statutory rule set: `uk` or `lk`. Gold plan or above for the rule sets, Silver or above for payroll itself.
2. **Salary** per member: basic monthly pay, fixed or percentage components (taxable or not), a tax profile. Stored encrypted.
3. **Run** per pay group and month: draft → in review → approved → finalised. Creating or recalculating a run computes every payslip. Approved and finalised runs are locked; "send back to draft" reopens an unfinalised run.
4. **Finalising** makes payslips visible to the employees and notifies them. A finalised run never changes.

Permissions: `payroll.manage` runs and edits, `payroll.view` reads everything. Everyone can read only their own finalised payslips. Every payslip view by payroll staff is written to the audit log.

## Calculation (`apps/api/src/payroll/engine.ts`)

A pure function: same input, same payslip. Unit-tested against worked examples.

- **Unpaid leave**: approved leave of a type that is not paid reduces basic pay by `basic / working days in the month × unpaid days` (half days count 0.5). Working days follow the company's work week and ignore public holidays.
- **Percent components** are a percentage of full basic pay.

### United Kingdom, `uk-2025-26`

- Income tax on a monthly-equivalent basis: annualised taxable pay, personal allowance from the tax code (`1257L` is treated as 12,579, as in HMRC tables), 20% / 40% / 45% bands, `BR`, `D0`, `D1`, `0T`, and the allowance taper above 100,000 when no code is given.
- Employee National Insurance (category A): 8% between 1,048 and 4,189 a month, 2% above. Category C and X supported.
- Employer National Insurance: 15% above 417 a month.
- Workplace pension (auto-enrolment, net pay arrangement): 5% employee and 3% employer of earnings between 520 and 4,189 a month, opt-out supported.

### Sri Lanka, `lk-2025-26`

- EPF 8% employee and 12% employer, ETF 3% employer, all on basic pay after unpaid leave.
- APIT on annualised taxable pay: 1,800,000 personal relief, then 6%, 18%, 24%, 30% and 36% slabs.

## Known limits (read before paying anyone)

These rules are a best-effort implementation of published figures. **An accountant must check a test run against your real payslips before you rely on them.**

- UK tax is computed per month on an annualised basis, not cumulatively through the tax year, so it will differ from HMRC's cumulative PAYE when pay varies or the tax code changes mid-year. No student loans, salary sacrifice, statutory pay (sick, maternity), benefits in kind, or RTI/HMRC submission. The employer's NI employment allowance is not applied.
- Sri Lanka: EPF is calculated on basic pay only; allowances are not added to the EPF base. APIT uses the annualised-monthly method with the 2025/26 slabs.
- Rule tables are in code and versioned by tax year. Each run records the version it used. A new tax year means a new version, not an edit of an old one.
- No bank file export, no payments, no year-end documents yet.

## Encryption

Salaries, payslip lines and totals are encrypted per value with AES-256-GCM. The key for each company is derived (HKDF) from one master key, and the company id is bound in as authenticated data, so a value copied to another company's row will not decrypt.

Set `FIELD_ENCRYPTION_KEY` (32 random bytes, base64: `openssl rand -base64 32`). The API refuses to start in production without it. **If the key is lost the data cannot be recovered**: store it in a secrets manager and back it up separately from the database. Rotating the key needs a re-encryption job, which is not built yet.

## Documents (Phase 3b)

Templates are plain text with `{{member.*}}`, `{{company.*}}`, `{{today}}`, `{{stamp}}` and `{{signature.<label>}}` tokens. Issued letters are rendered to PDF with a QR code pointing at the public `/verify/<code>` page, which shows only the document type, company and date. Files are encrypted at rest in `FILE_STORAGE_DIR` (default `./.data/files`). Limits: PDF text is Latin only (other scripts show as `?`), no virus scanning, no DOCX import.
