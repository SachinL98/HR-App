/** Ready-made letters a company can start from. Everything in {{braces}} is filled in when a letter is issued. */
export interface Starter { id: string; name: string; kind: string; requestable: boolean; body: string }

export const STARTERS: Starter[] = [
  {
    id: "salary", name: "Employment and salary confirmation", kind: "salary_cert", requestable: true,
    body: `{{today}}

TO WHOM IT MAY CONCERN

CONFIRMATION OF EMPLOYMENT AND SALARY: {{member.full_name}}

This letter serves to confirm that {{member.full_name}}, holder of {{member.national_id}} (NIC), is a full time employee of {{company.name}}.

{{member.first_name}} holds the position of {{member.job_title}} and has been with the organization since {{member.start_date}}. We can confirm that this is a permanent position. Regarding {{member.first_name}}'s remuneration, a fixed monthly salary is paid as follows:

Fixed Monthly Gross Salary: {{salary.currency}} {{salary.basic_monthly}}

This certification is issued upon the request of the employee for verification of employment status and any legitimate legal or financial purpose. Please note that this letter is for information purposes only and does not constitute a financial guarantee or liability on behalf of {{company.name}}.

Yours faithfully,
{{signature.hr_manager}}
Name of signer
Title of signer
{{company.name}}`,
  },
  {
    id: "employment", name: "Employment confirmation", kind: "confirmation", requestable: true,
    body: `{{today}}

TO WHOM IT MAY CONCERN

CONFIRMATION OF EMPLOYMENT: {{member.full_name}}

This letter confirms that {{member.full_name}} works at {{company.name}} as {{member.job_title}} in the {{member.department}} department, and has done so since {{member.start_date}}.

This letter is issued at the employee's request and is for information only.

Yours faithfully,
{{signature.hr_manager}}
Name of signer
Title of signer
{{company.name}}
{{stamp}}`,
  },
  {
    id: "experience", name: "Experience letter", kind: "experience", requestable: true,
    body: `{{today}}

TO WHOM IT MAY CONCERN

EXPERIENCE LETTER: {{member.full_name}}

This is to certify that {{member.full_name}} worked at {{company.name}} as {{member.job_title}} in the {{member.department}} department from {{member.start_date}} to {{member.end_date}}.

During this time we found {{member.first_name}} to be diligent and professional. We wish {{member.first_name}} every success in the future.

Yours faithfully,
{{signature.hr_manager}}
Name of signer
Title of signer
{{company.name}}`,
  },
  {
    id: "offer", name: "Offer letter", kind: "offer", requestable: false,
    body: `{{today}}

Dear {{member.first_name}},

We are pleased to offer you the position of {{member.job_title}} in the {{member.department}} department at {{company.legal_name}}, starting on {{member.start_date}}.

Your fixed monthly gross salary will be {{salary.currency}} {{salary.basic_monthly}}. This offer is subject to the terms of your employment agreement.

Please sign and return a copy to accept. We look forward to welcoming you to the team.

Yours sincerely,
{{signature.hr_manager}}
Name of signer
Title of signer
{{company.name}}`,
  },
  {
    id: "payslip", name: "Payslip letterhead", kind: "payslip", requestable: false,
    // Only the letterhead and page layout of this one are used: payslips draw their own table on it.
    body: "Payslip letterhead. Only the letterhead and the page layout below are used; payslips fill in the rest themselves.",
  },
];
