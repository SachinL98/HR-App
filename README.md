# Seamless Source HR

Multi-tenant HR SaaS: web app and iOS/Android app for company calendars, meetings, leave, WFH, approvals, payroll, documents, notices and end-to-end encrypted chat.

- Product spec: [docs/spec.md](docs/spec.md)
- Data model: [docs/data-model.md](docs/data-model.md)

## Repo layout

| Path | What |
| --- | --- |
| `apps/web` | Next.js web app (session in an httpOnly cookie, all API calls made server side) |
| `apps/mobile` | Expo (React Native) iOS/Android app (token in the device keychain) |
| `apps/api` | NestJS API |
| `packages/db` | Prisma schema, migrations, roles and row-level security |

## Run it locally

You need Node 22 and PostgreSQL 16 (macOS: `brew install postgresql@16 && brew services start postgresql@16`).

```bash
npm install          # first, always: it installs the pinned Prisma 7 CLI
npm run db:setup     # creates the `hr` database, migrations, restricted roles, row-level security, Prisma client
npm run dev:api      # http://localhost:4000
npm run dev:web      # http://localhost:3000   (in a second terminal)
npm run dev:mobile   # Expo
```

`db:setup` connects with your normal Postgres login (on macOS with Homebrew that is your own user, no password) and is safe to re-run. If your server needs a different admin login:

```bash
ADMIN_URL=postgresql://postgres:secret@localhost:5432/postgres npm run db:setup
```

Do not run `npx prisma ...` from outside the repo's install: without `npm install` first, npx downloads the latest Prisma (a different major version) and fails.

| Variable | Used by | Default |
| --- | --- | --- |
| `DATABASE_URL` | API (restricted `hr_app` role, RLS enforced) | `postgresql://hr_app:pw@localhost:5432/hr` |
| `DATABASE_SYSTEM_URL` | API login and invite lookups only (`hr_system`, bypasses RLS) | `postgresql://hr_system:pw@localhost:5432/hr` |
| `FIELD_ENCRYPTION_KEY` | API. Encrypts salaries and payslips. **Required in production**, 32 bytes base64 (`openssl rand -base64 32`) | dev-only value |
| `JWT_SECRET` | API. **Required in production** | dev-only value |
| `WEB_URL` | API (CORS, invite links) | `http://localhost:3000` |
| `API_URL` | Web server | `http://localhost:4000` |
| `EXPO_PUBLIC_API_URL` | Mobile | `http://localhost:4000` |

The `pw` passwords in `roles.sql` are for local development. Change them anywhere real.

## Tests

```bash
npm test          # API unit tests
npm run test:e2e  # API end-to-end tests against real PostgreSQL with RLS on
npm run lint
```

## Going to production

Step-by-step hosting guide (everything on Vercel: web + API projects, Neon database, ZeptoMail email, cron, mobile, billing): **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**. The notes below are the short checklist.

Read this before the first real company signs up.

1. **Secrets.** Copy `.env.example`, fill every value, and keep it out of git. The API refuses to start in production if `JWT_SECRET` (32+ characters), `FIELD_ENCRYPTION_KEY`, the two database URLs or `WEB_URL` are missing, or if the database URLs still use the development password `pw`.
2. **Database roles.** `packages/db/sql/roles.sql` creates `hr_app` and `hr_system` with the development password `pw`. After running it, set real passwords: `ALTER ROLE hr_app PASSWORD '...'; ALTER ROLE hr_system PASSWORD '...';`.
3. **Migrations.** Run `npx prisma migrate deploy` (in `packages/db`) as the database owner, then `sql/roles.sql` and `sql/rls.sql`, before starting a new version. The API does not migrate on boot.
4. **Run behind a proxy that sets the visitor address.** The web app forwards `X-Forwarded-For` so login limits apply per visitor. Your proxy must overwrite that header, not append to what the client sent. Set `TRUST_PROXY` to the number of proxies in front of the API.
5. **Email.** Set `SMTP_URL` and `MAIL_FROM` (any SMTP provider). With email on, new accounts must confirm their address before first sign-in, and invitations, password resets and password-change notices are emailed. The API refuses to start in production without `SMTP_URL` unless `ALLOW_NO_MAIL=true`. Message bodies are never logged in production.
6. **Files and backups.** Documents are encrypted and kept either in `FILE_STORAGE_DIR` (`FILE_STORAGE=disk`, default locally) or in the database (`FILE_STORAGE=db`, automatic on Vercel). Back up the database, that folder if you use one, **and** `FIELD_ENCRYPTION_KEY` together. Without the key the data cannot be read.
7. **Health checks.** `GET /health` (alive) and `GET /health/ready` (database reachable) for your load balancer.
8. **Accounts.** People can reset a forgotten password, change it, see and end their sign-ins, and turn on two-factor sign-in (authenticator app plus ten one-time recovery codes) from **My account**. Signing out ends the session on the server. Five wrong passwords lock an email for 15 minutes; wrong two-factor codes lock for 15 minutes too. After deploying this version, everyone must sign in again, and run `sql/roles.sql` so the new `UserToken` table is granted to the app roles.
9. **Payroll controls.** Once two or more people can run payroll, nobody can approve or release a run they sent for approval, or change their own pay. A company with one payroll person is exempt, and those actions are marked "solo" in the activity log. A run is frozen once sent for approval (send it back to draft to change it). Every salary change is kept in an append-only history with who and why. After deploying, re-run `sql/roles.sql` and `sql/rls.sql` for the new `SalaryChange` table.
10. **People.** Every profile is visible to colleagues (basics only). The person, their manager and anyone with the checklist permission also see checklists; the person and people who manage members see kept documents (HR can hide a document from the person). Checklists, kept documents and the org chart need no setup beyond re-running `sql/roles.sql` and `sql/rls.sql` for the four new tables. Removing a kept document removes it from the profile, but the encrypted file stays in `FILE_STORAGE_DIR` until you clean it up.
11. **Approvals and calendar.** Requests with several approval steps need a different person at each step (set the steps under **Settings → Approval steps**). A person can hand their approvals to a colleague for up to 90 days from **Approvals**. Approvers see how many of the team are already off. New requests and decisions are emailed (with SMTP set up), and requests waiting more than a day are re-announced once a day by a timer inside the API (if you run several API servers, run that timer on one of them). Each person can create a private calendar link on the Calendar page for Google, Outlook or Apple Calendar; creating a new one stops the old one. Re-run `sql/roles.sql` and `sql/rls.sql` for the two new tables. Set `PUBLIC_API_URL` if the API's public address differs from `API_URL`.
12. **Search and shortcuts.** Press Ctrl+K (Cmd+K on Mac) anywhere to jump to a page or find people, notices and documents; search only returns what the person could already open. Successes in the app appear as toasts, pages show a loading skeleton, and there is a "Skip to content" link for keyboard users.
13. **Leave carry-over and accrual.** Per leave type (under **Settings → Leave policy**): how many unused days carry into the next year, how long carried days last, and whether the yearly allowance is available at once or builds up monthly in half-day steps. Carry-over is worked out from approved leave last year against today's yearly allowance, from the person's start date, so no separate ledger needs maintaining; changing a rule changes everyone's balance straight away, and past approved leave is never altered. It applies only to yearly allowances, not monthly ones or work from home. Re-run migrations (`prisma migrate deploy`) for the three new columns.
14. **Payslip PDFs and exports.** Each person can download their finalised payslips as a PDF, and payroll staff can open any. To put payslips on the company letterhead, create a template of type **Payslip letterhead** under Manage documents (only its letterhead and page layout are used). When a run is finalised every person gets an email with a link, never the figures. Each run can be downloaded as a CSV summary, a CSV of every pay line, and (once approved) a bank transfer file built from bank details entered on the Salaries page (stored encrypted; only the last four digits are ever shown again; downloads are recorded in the activity log). The bank file is a plain CSV (holder, bank, branch, account, amount, reference); banks each want their own layout, so check yours accepts it or ask for a bank-specific format.
15. **Trial and billing.** A new company gets 14 days of Gold, then 3 days of grace, then moves to the Free plan (5 people; payroll, tax rules and multi-step approvals become read-only; nothing is deleted and people already added keep working, but new invitations stop at the limit). A failed payment keeps the plan for 7 days. A cancelled plan runs to the end of the period paid for. Owners and billing managers see a banner as the date approaches, and a **Plan and billing** page under Admin. There is no payment provider connected: plan changes arrive through `POST /billing/webhook`, signed with `BILLING_WEBHOOK_SECRET` (HMAC-SHA256 of the exact request body in the `x-signature` header; body fields `tenantId`, `tier`, `status`, optional `seats`, `billingInterval`, `currentPeriodEnd`, `customerId`, and `timestamp` in Unix seconds, refused when more than 5 minutes old). A Stripe adapter would translate its events into that shape. Until then, move a company by calling that endpoint yourself.
16. **Mobile app.** The Expo app now has the new name, logo and icons, follows the company's colours (light and dark), and has five tabs: Home (time off balances, tasks, who is away, approvals waiting, plan warnings), Leave (request and cancel), Approvals (approve, reject or ask for changes), Alerts (notifications) and Account. Sign-in supports two-factor codes, several companies, and ends the session on the server when you sign out. Set `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_WEB_URL`. Not in the app yet: payslips, documents, the calendar views, people and the org chart, push notifications, and managing passwords or two-factor (these open the web app). It has been type-checked and bundled for iOS but not run on a device or simulator, and it uses a simple built-in tab bar rather than Expo Router.
17. **Languages.** The web app is available in English, Sinhala and Tamil. Each person picks a language from the selector in the top bar (or on the sign-in page); it is remembered on that device and on their account, so it follows them to a new device after signing in. The words live in `apps/web/src/lib/i18n` (`en.ts` is the source; `si.ts` and `ta.ts` fall back to English for anything missing, and a test checks they only use real keys and keep every `{placeholder}`). **Translated:** navigation and search, sign-in and sign-up, home, leave, approvals, notices, notifications, payslips, the calendar, people and profiles, the org chart, documents (mine and managing them), payroll, salaries, pay history, and every settings screen. **Still English:** error and success messages that come back from the server, emails, leave type and role names and other text companies type themselves, the long helper text in a few forms, payslip line names (Basic pay, tax lines), the starter letter wording. **The mobile app** is translated too (its own list in `apps/mobile/src/i18n/dictionaries.ts`, with its own consistency test): it starts in the phone's language if that is Sinhala or Tamil, there is a language row on the sign-in screen and a picker under Account, and the account's saved language is applied after sign-in. **Have a native speaker review the Sinhala and Tamil before launch**: they were written without one, and HR and payroll wording matters. Dates and months follow the chosen language automatically.
18. **Known gaps**: the lockout counters live in one server's memory (use a shared store before running several API servers), no payment provider is connected, bank file layouts are generic, browser (Playwright) tests are not set up, server messages, emails and the mobile app are still English only (see Languages), and the mobile app has only been compiled, not run.
