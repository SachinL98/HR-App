# HR App: Product Specification

Version 0.1, 3 November 2026. Source plan: https://claude.ai/artifact/HkwFDc1X9WtV38hk3L4KH9

A multi-tenant HR SaaS with a web app and an iOS/Android app. Companies sign up, build their org structure and run calendars, meetings, leave, WFH, payroll, documents, notices and secure chat in one place. Feature numbers in brackets (for example [3]) match the plan.

## 1. Users and roles

| Actor | Description |
| --- | --- |
| Platform operator | Runs the SaaS. Manages plans, billing and support. Never reads tenant data without a logged, time-boxed support grant. |
| Organization owner | The person who registered the company. Has every permission and owns billing. Exactly one per tenant, transferable. |
| Admin | Any member granted admin permissions by the owner. |
| Delegated approver | A member granted specific powers, for example "approve leave for Engineering" [5]. |
| Member | Every employee. |

**Company roles** [13] are job titles the admin defines (for example "Software Engineer", "HR Executive"). They are descriptive and can carry a default permission set.

**Permissions** [5] are separate from roles. Each permission is a pair of action and scope:

- Actions: `leave.approve`, `wfh.approve`, `quota.manage`, `holiday.manage`, `notice.publish`, `member.invite`, `member.manage`, `department.manage`, `role.manage`, `payroll.manage`, `payroll.view`, `document.template.manage`, `document.issue`, `document.request.approve`, `meeting.manage_all`, `integration.manage`, `billing.manage`, `audit.view`, `branding.manage`.
- Scopes: whole company, one or more departments, or specific members.

A member's effective permissions = the union of their role's defaults and their direct grants. Every check runs server side.

## 2. Hierarchy [12]

Company → Department → Member. Departments may nest (for example Engineering → Mobile). Each member belongs to one primary department and has an optional line manager. The line manager is the default first approver.

## 3. Features

### 3.1 Organization signup and invites [1]

1. Owner signs up with email + password (or Google/Microsoft/Zoho SSO), verifies email and enables MFA (required for owners and admins).
2. Owner enters company details: legal name, display name, logo, address, country, time zone, work week, currency.
3. Tenant is created on the Free plan with a unique subdomain slug.
4. Admins invite members by email, singly or by CSV upload, choosing department, role, manager and start date. Invites expire after 7 days and can be resent or revoked.
5. Invitee accepts, sets a password, completes their profile.
6. Seat limits from the plan are enforced at invite time.

### 3.2 Profiles [21]

- **Company profile:** legal and display name, logo, address(es), registration and tax numbers, phone, website, time zone, work week, branding colors, stamp and signatures (see 3.10).
- **User profile:** photo, name, preferred name, employee ID, job role, department, manager, work email, phone, date of birth, address, start date, employment type, emergency contacts (name, relationship, phone, multiple allowed), bank details (encrypted, payroll only), national ID or NI number (encrypted).
- Field visibility: members see colleagues' work fields only. Personal fields are visible to the member, HR admins and payroll.

### 3.3 Availability calendar [2]

- Views: day, week, month and year, on web and mobile. Filters: department, team, person, status type.
- Each member has one status per day (or half-day): In office, WFH, On leave (with leave type, visible as "On leave" to non-approvers for privacy), Holiday, Out of office (time range), Not working day.
- Default status is "In office" on working days unless the member sets a default work pattern (for example WFH every Friday).
- Everyone in the company can view the calendar. Leave reasons are visible only to approvers and HR.

### 3.4 Meetings [23]

- Created from the day or week view by any member (or limited by plan and permission).
- Fields: title, description, start, end, time zone, organizer, attendees (members, departments or whole teams), location (room or online), recurrence (RRULE), reminders.
- Organizer sees attendee availability (leave, WFH, other meetings) before booking.
- Attendees RSVP yes, no or maybe. Changes and cancellations notify attendees.
- Online meetings get a Google Meet link automatically (Silver and above) via the organizer's connected Google account or a company service account.
- Two-way sync with Google Calendar and Zoho Calendar per member (Silver and above).

### 3.5 Leave [3]

- Leave types configured per company: Annual, Sick, Casual, Maternity, Paternity, Unpaid, custom. Each type: paid or unpaid, needs attachment (for example sick note after N days), half-day allowed, counts weekends or not.
- Request: type, start and end date (with half-day options), reason, attachment. System shows remaining balance and clashes with team members.
- Cancel: by requester before approval, or via a cancellation request after approval.

### 3.6 Work from home [4]

- Single-day or recurring WFH plans (for example "Mon and Wed for March").
- Request: dates or pattern, reason, optional location.

### 3.7 Quotas [6]

- Authorized users set allowances per leave type and for WFH, per month and/or per year, at company, department or member level (most specific wins).
- Options: carry-forward cap, accrual (monthly or up front), proration for joiners, reset date (calendar or fiscal year).
- Requests that exceed the quota are blocked or flagged, configurable per type.

### 3.8 Approval workflow [11]

- Applies to leave, WFH, leave cancellation, document requests and payslip requests.
- Workflow per request type: ordered steps, each step is "line manager", "department head", "specific member", or "anyone with permission X in scope".
- Free and Bronze: one step. Silver and Gold: multiple steps. Platinum: conditional rules (for example add HR step when leave > 5 days).
- Approver can approve, reject (reason required) or ask for changes. Auto-escalation after N hours, configurable.
- Full history kept per request. Approved items update the calendar and balances immediately.

### 3.9 Out of office [16]

- Member marks out of office for a time range during working hours (for example 14:00 to 15:30), with reason category (client visit, errand, medical, other).
- Shows on calendar and member's chat status. No approval by default; company can require approval.

### 3.10 Company holidays [15]

- Admin adds holidays one by one or imports a country's public holidays (UK, Sri Lanka at launch). Holidays can apply to the whole company or specific departments or locations.

### 3.11 Notices [18]

- Authorized users publish notices with title, rich text body, attachments, priority (normal or important), audience (everyone, departments, roles or members), publish and expiry dates.
- Optional "must acknowledge" with read tracking.

### 3.12 Notifications [17]

- Channels: in-app (bell + feed), push (mobile and web), email, and on Gold and above Discord and WhatsApp.
- Every event type has per-channel defaults. Members can mute non-critical types. Approval requests always notify.
- Email sends from the company's own address via its connected Zoho Mail account (Silver and above), otherwise from the platform's address.
- Events: invite, request submitted, approved, rejected, needs changes, escalation, upcoming leave of reports, meeting invite, change, reminder, notice published, document ready, payslip issued, chat mention.

### 3.13 Payroll [7]

- Pay groups: frequency (monthly), currency, pay day.
- Salary structure per member: basic, allowances (fixed or %), deductions, employer contributions.
- Unpaid leave from the leave module reduces pay automatically.
- Optional statutory rules: UK (PAYE income tax, National Insurance, pension auto-enrolment) and Sri Lanka (EPF 8% + 12%, ETF 3%, APIT). Rule tables are versioned by tax year.
- Payroll run: draft → review → approve → finalize. Finalized runs are locked and generate payslips.

### 3.14 Document templates and generation [8, 9, 10]

- Template library: payslip, employment confirmation, contract, offer, experience, salary certificate, custom.
- Authoring: upload a DOCX (from Word, Google Docs or a Canva export) with merge fields like `{{member.full_name}}`, `{{company.name}}`, `{{payslip.net_pay}}`, `{{today}}`, `{{stamp}}`, `{{signature.hr_manager}}`. Built-in editor for simple templates.
- Generation: pick template + member(s) → preview auto-filled document → edit if needed → issue as signed PDF.
- Company stamp and signatures [9]: uploaded as transparent PNG, stored encrypted, each signature tied to a signatory member. Only members with `document.issue` can apply them. Every use is logged.
- Requests [10]: members request a document type with purpose, it goes through approval, and the approver issues it from the template.
- Issued PDFs carry a verification code and QR that links to a public check page (valid or revoked, no personal data).

### 3.15 Chat [14]

- Conversations: company-wide, per department (auto membership), groups (ad hoc) and direct messages.
- Launch features: text with formatting, mentions, emoji, replies, reactions, edit and delete (for everyone within 1 hour), attachments (images, video, documents, up to 100 MB), voice notes, read receipts, typing indicators, online and OOO status, pin, star, search, mute, archive, disappearing messages (optional per chat).
- Later: voice and video calls.
- Security: end-to-end encrypted with a Signal-protocol or Matrix (Olm/Megolm) implementation. Server stores ciphertext only. Keys live on devices; multi-device and key backup protected by a user passphrase.
- Admin controls: who can create groups, retention policy, remove departed members (they lose access immediately). Admins cannot read E2EE message content.

### 3.16 Files [19]

- All uploads go to object storage encrypted with per-tenant keys (envelope encryption with a cloud KMS).
- Access through short-lived signed URLs after a permission check. Virus scan on upload. Max sizes by plan.

### 3.17 Integrations [24]

| Integration | Purpose | Plan |
| --- | --- | --- |
| Google Workspace | SSO, Google Meet links, Calendar two-way sync | Silver+ |
| Zoho | SSO, send email from company address (Zoho Mail SMTP/API), Zoho Calendar sync | Silver+ |
| Discord | Notifications to chosen channels via bot | Gold+ |
| WhatsApp Business Platform | Notifications to members' WhatsApp (opt-in) via approved templates | Gold+ |
| Webhooks and public API | Push events to other systems | Platinum |

Each company connects its own accounts via OAuth. Tokens are stored encrypted and can be revoked from the Integrations page.

### 3.18 Subscriptions and billing

Tiers Free, Bronze, Silver, Gold, Platinum, gated as in the plan's tier table. Billing per active user per month via Stripe, monthly or annual (2 months free). 14-day trial of Gold for new companies. Downgrades keep data but lock gated features read-only.

## 4. Security and compliance [20]

- Tenant isolation: every tenant-owned table carries `tenant_id`; PostgreSQL row-level security enforces it in addition to application checks.
- Auth: Argon2id password hashes, MFA (TOTP and passkeys), SSO, session timeouts, device list with remote sign-out.
- Encryption: TLS 1.3 in transit; AES-256 at rest; field-level encryption for bank details, national IDs, salary; E2EE for chat.
- Audit log: every admin action, permission change, approval, document issue, stamp use and data export, append-only.
- OWASP ASVS Level 2 as the baseline, rate limiting, CSP, dependency scanning, secrets in a vault.
- GDPR (UK GDPR) and Sri Lanka PDPA: data export, deletion, consent for WhatsApp, data processing agreement.
- External penetration test before launch; ISO 27001 / SOC 2 readiness.

## 5. Non-functional requirements

- Performance: p95 API latency under 300 ms; calendar month view for 500 people under 1 second.
- Availability: 99.9% monthly.
- Backups: daily, point-in-time recovery for 7 days, restore tested quarterly.
- Accessibility: WCAG 2.1 AA on web and mobile.
- Localization ready: English at launch, Sinhala and Tamil later. Dates and currency by company locale.

## 6. Out of scope for v1

Voice and video calls in chat, recruitment, performance reviews, expense claims, timesheets, Zoom and Microsoft Teams.
