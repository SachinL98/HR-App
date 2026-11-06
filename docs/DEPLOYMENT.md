# Deploying Seamless Source HR

A step-by-step guide to run **everything on Vercel**: the web app and the API as two Vercel projects from the same repo, a **Neon Postgres** database (from the Vercel Marketplace), **Zoho ZeptoMail** for email, and the mobile app and billing connections around it.

(Prefer a classic server for the API? Section 12 says how, and what changes.)

---

## 1. What goes where

```
   Phones (Expo app) ─────────────┐
                                  ▼
   Browser ──► Vercel project 1: web (Next.js) ──server-side calls──► Vercel project 2: API (NestJS function) ──► Neon Postgres (RLS)
                                                                          │  └─► ZeptoMail (SMTP) ─► people's inboxes
   Vercel Cron ──daily──► /cron/reminders ────────────────────────────────┤
   Billing provider ──signed webhook──────────────────────────────────────┘
```

| Part | Where | Notes |
| --- | --- | --- |
| Web app (`apps/web`) | **Vercel project 1** | Root Directory `apps/web` |
| API (`apps/api`) | **Vercel project 2** | Root Directory `apps/api`; runs as a Vercel Function |
| Database | **Neon** via the Vercel Marketplace (or any Postgres 16) | Needs 3 roles and row-level security (section 4) |
| Files (letters, letterheads, seals) | **The database** (encrypted) | Automatic on Vercel; no disk or extra storage service |
| Email | **Zoho ZeptoMail** over SMTP | You only set `SMTP_URL` |
| Reminders | **Vercel Cron** | Calls `GET /cron/reminders` daily with `CRON_SECRET` |

**What was changed so the API can run there.** A function has a read-only filesystem and no long-lived process, so: files are now stored encrypted in the database (`FileBlob`) instead of on disk; sign-in lockout counters live in the database (`LoginThrottle`) so they hold across function instances; the hourly reminder timer is replaced by Vercel Cron; password hashing uses a WebAssembly argon2id (same hash format as before, so existing accounts keep working); each function instance keeps at most 2 database connections; and `apps/api/api/index.js` + `apps/api/vercel.json` are the Vercel entry point.

**Limits of the test-friendly setup (fine for testing and small teams):**

- Files in the database: great up to a few thousand letters and payslips per company; for heavy volumes move to object storage later (the code is isolated in `file-store.ts`).
- Function time limit is set to 60 seconds, enough for a payroll run or PDF batch of normal size. Vercel also caps a request body at 4.5 MB (uploads here are capped at 2 MB).
- The per-address request limit (`THROTTLE_LIMIT`) sees only the web project's address, not each visitor's. Raise it (below) and use Vercel Firewall rules on the web project for edge rate limiting. The per-person protection (sign-in and two-factor lockout) is per email, in the database, and is unaffected.
- Vercel Hobby allows only daily crons; that matches the daily reminder schedule.

---

---

## 2. Before you start

You need accounts for: **GitHub** (the repo must be pushed), **Vercel**, **Neon** (or another Postgres host), **Zoho ZeptoMail**, and a **domain name** you control (for sending email and for friendly URLs). For a quick test you can skip the domain and use the `*.vercel.app` addresses (email then needs a verified sending domain anyway, or set `ALLOW_NO_MAIL=true` to test without email).

Pick your addresses now and keep them consistent everywhere:

| Name | Example |
| --- | --- |
| Web app | `https://hr.example.com` |
| API | `https://api.hr.example.com` (or the API project's `*.vercel.app` address) |
| Sender address | `no-reply@example.com` (must be on a domain you verify in ZeptoMail) |

### Generate the secrets (on your own computer)

```bash
openssl rand -base64 48      # JWT_SECRET  (must be 32+ characters)
openssl rand -base64 32      # FIELD_ENCRYPTION_KEY  (32 random bytes, base64)
openssl rand -hex 24         # HR_APP_PASSWORD      (database role password)
openssl rand -hex 24         # HR_SYSTEM_PASSWORD   (a different one)
openssl rand -hex 32         # BILLING_WEBHOOK_SECRET
openssl rand -hex 24         # CRON_SECRET
```

Use `-hex` for the two database passwords so they have no characters that break connection strings.

> **`FIELD_ENCRYPTION_KEY` protects salaries, National IDs, bank details, payslips and every stored file.** If you lose it, that data cannot be read again, and there is no key-rotation feature yet. Save it in a password manager *and* one offline copy before you go any further. Never commit it.

---

## 3. Order of work

(Once the two Vercel projects and the database exist, section 13 automates releases with GitHub Actions.)

1. Database (section 4)
2. ZeptoMail (section 5)
3. API on Vercel (section 6)
4. Web on Vercel (section 7)
5. Connect the rest and test (sections 8 and 9)

---

## 4. Database

The app needs **PostgreSQL 16** and three database roles. This is what keeps one company's data away from another's, so do not skip the checks.

| Role | Used for | Must be |
| --- | --- | --- |
| **owner** | Running migrations (only from your computer or CI, never by the app) | The database owner |
| **`hr_app`** | Everything the API does for a signed-in person | **Not** a superuser, **no** BYPASSRLS. Row-level security applies to it. |
| **`hr_system`** | Only login, invite links and the public document check | BYPASSRLS |

### 4a. Neon (recommended; also available from the Vercel Marketplace)

1. Create a project (Postgres 16) in the region closest to your API host. You can add it from Vercel (**Storage → Create → Neon**) or directly at neon.com; either gives you a database and an owner role.
2. Copy the **direct (non-pooled)** connection string for the owner. You will use it as `OWNER_URL`. (Migrations must not go through a pooler.)
3. **Create `hr_system` in the Neon console** (Roles → New role, name `hr_system`). Roles created in the console, CLI or API get the `neon_superuser` group, which includes BYPASSRLS ([Neon roles](https://neon.com/docs/manage/roles/)), and that is exactly what `hr_system` needs.
4. **Do not create `hr_app` in the console.** If you do, it also gets BYPASSRLS and the companies would no longer be isolated. Leave it: the next step creates it with plain SQL, which does not give it that group.
5. From the repo root on your computer (Postgres client `psql` installed; `npm ci` already run):

```bash
OWNER_URL='postgresql://OWNER:PASSWORD@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require' \
HR_APP_PASSWORD='...'  HR_SYSTEM_PASSWORD='...' \
npm run db:deploy
```

It applies the migrations, creates `hr_app` if needed, sets both passwords, grants access, switches on row-level security for every table, and then **checks the roles and stops with an error if `hr_app` could skip row-level security**. The last lines tell you the two connection strings to use:

```
DATABASE_URL        = postgresql://hr_app:<HR_APP_PASSWORD>@<host>/<db>?sslmode=require
DATABASE_SYSTEM_URL = postgresql://hr_system:<HR_SYSTEM_PASSWORD>@<host>/<db>?sslmode=require
```

Run `npm run db:deploy` again **before every release that adds a migration** (section 10). It is safe to repeat.

Check it yourself once:

```sql
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname IN ('hr_app','hr_system');
-- hr_app     f  f
-- hr_system  f  t
```

### 4b. Any other Postgres (RDS, Supabase, Render Postgres, your own server)

Same steps, with these differences: use an admin or owner login for `OWNER_URL`; on hosts where only a true superuser may create a BYPASSRLS role, create `hr_system` yourself first with `CREATE ROLE hr_system LOGIN BYPASSRLS;` and then run `npm run db:deploy`. Always finish with the check query above.

### 4c. Connection pooling

**On Vercel, use the pooled host** (the one with `-pooler` in its name) for `DATABASE_URL` and `DATABASE_SYSTEM_URL`: many short-lived function instances would otherwise exhaust the database's connections. `withTenant` sets the company inside each transaction, so it works through Neon's transaction-mode pooler. Keep the **direct** host for `OWNER_URL` (migrations). The API keeps at most 2 connections per instance (`DB_POOL_MAX` changes that).

### 4d. Backups

Turn on the host's automatic backups / point-in-time recovery and **do a restore test** into a scratch database before launch. Files are stored in the database, so one backup covers them; restore also needs `FIELD_ENCRYPTION_KEY`.

---

## 5. Zoho ZeptoMail (email)

The API sends invitations, email confirmation, password resets, approval notices, reminders and "your payslip is ready" messages. It talks to ZeptoMail over SMTP. It does **not** send payslip figures by email, only links.

### 5a. Set up the sending domain

1. Sign up at zoho.com/zeptomail. A **Mail Agent** is created for you (or create one named *Seamless Source HR*). ZeptoMail is for transactional email, which is what this is.
2. **Add and verify your domain** (Mail Agent → Domains). ZeptoMail shows DNS records to add at your DNS provider:
   - an **SPF** TXT record (the value is `v=spf1 include:zeptomail.net ~all` per ZeptoMail's docs; if you already have an SPF record, **merge** `include:zeptomail.net` into it rather than adding a second one),
   - a **DKIM** TXT record (copy the exact name and value from the Domains tab),
   - a **CNAME** for the bounce address (copy from the Domain Verification tab).

   The domain counts as verified only when all three pass ([domain verification](https://zstatic.zohostatic.com/zeptomail/help/domains.html), [bounce address](https://www.zoho.com/zeptomail/help/bounce-address.html)). DNS can take from minutes to a day or two.
3. Choose your sender, for example `no-reply@example.com`. It must be on the verified domain.

### 5b. Get the SMTP details

In ZeptoMail open your Mail Agent → **SMTP/API → SMTP** tab. The documented values are ([ZeptoMail SMTP](https://help.zoho.com/portal/en/kb/zeptomail/faqs/sending-emails/articles/how-to-configure-smtp)):

| Setting | Value |
| --- | --- |
| Host | `smtp.zeptomail.com` (use the host shown in **your** Agent's tab; accounts in other Zoho data centres show a different domain, for example `.eu`) |
| Port | `465` (SSL) or `587` (TLS) |
| Username | `emailapikey` |
| Password | the SMTP password shown on that tab for your Agent |

### 5c. Build `SMTP_URL`

```
SMTP_URL=smtps://emailapikey:ENCODED_PASSWORD@smtp.zeptomail.com:465
MAIL_FROM="Seamless Source HR <no-reply@example.com>"
```

**URL-encode the password.** SMTP passwords often contain `+`, `/`, `=` or `@`, which break the URL. Encode them first:

```bash
node -e 'console.log(encodeURIComponent(process.argv[1]))' 'the-password-from-zeptomail'
```

Use `smtps://…:465` for SSL. If you prefer port 587, use `smtp://…:587` (the connection upgrades to TLS).

### 5d. Test it

After the API is running (section 6), use **Forgot your password?** on the sign-in page with a real address. The email should arrive within a minute. If not, look at section 11 and the API logs: a failed send is logged as `Could not send "…" to …: <reason>` and never shows the message body.

### 5e. Good practice

- In ZeptoMail you can restrict SMTP use to specific IP addresses; if your API host has a fixed outbound IP, add it.
- Watch the **Processed Emails** page in ZeptoMail for bounces during your first days.
- Add a DMARC record for your domain (`_dmarc` TXT, start with `p=none` and read the reports before tightening).

> Without `SMTP_URL`, the API **refuses to start in production** unless you set `ALLOW_NO_MAIL=true`. In that mode nothing is emailed, so invitations and password resets cannot work. Do not launch that way.

---

## 6. The API on Vercel

### 6a. Create the project

1. In Vercel: **Add New → Project**, import the same GitHub repo a second time.
2. **Project name:** for example `hr-api`. **Root Directory:** `apps/api`. Keep "Include source files outside of the Root Directory" on.
3. **Framework Preset:** *Other*. The repo's `apps/api/vercel.json` already sets the install command (from the repo root), the build command (generates the database client, then builds the API), the single function (`api/index.js`, 60 s) and the daily cron. Leave those fields alone.
4. **Node.js Version:** 22.x.

### 6b. Environment variables (Settings → Environment Variables)

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | the `hr_app` string from section 4, **pooled host** |
| `DATABASE_SYSTEM_URL` | the `hr_system` string, pooled host |
| `JWT_SECRET` | from section 2 |
| `FIELD_ENCRYPTION_KEY` | from section 2 |
| `WEB_URL` | the web project's address, e.g. `https://hr.example.com` (email links and CORS) |
| `SMTP_URL`, `MAIL_FROM` | from section 5 |
| `CRON_SECRET` | from section 2 (Vercel sends it to the cron automatically) |
| `THROTTLE_LIMIT` | `3000` (see section 1) |
| `TRUST_PROXY` | `1` |
| `BILLING_WEBHOOK_SECRET` | from section 2, or leave empty to switch the endpoint off |

`DATABASE_URL` must also be available at **build** time (the build generates the database client): in Vercel, variables apply to builds and runtime by default.

Files are kept in the database automatically on Vercel (`VERCEL` is set by the platform). You do **not** need `FILE_STORAGE_DIR`.

The API **will not start in production** if `JWT_SECRET` (32+ characters), `FIELD_ENCRYPTION_KEY`, either database URL, `WEB_URL` or `SMTP_URL` is missing, or if a database URL still uses the development password `pw`. That is deliberate.

### 6c. Deploy and check

Deploy, then open `https://<api address>/health/ready`. You should see `{"ok":true}`. Add your API domain under **Settings → Domains** if you use one.

Check the cron: in Vercel **Settings → Cron Jobs** you should see `/cron/reminders` at 08:00 UTC daily; use **Run** there once. Calling the address yourself without the secret must answer 401:

```bash
curl -i https://<api address>/cron/reminders                                   # 401
curl -i -H "Authorization: Bearer $CRON_SECRET" https://<api address>/cron/reminders   # 200 {"reminded":0}
```

### 6d. Protection settings

Vercel's *Deployment Protection* (login in front of deployments) applies to preview deployments by default. The web project calls the API server to server and cannot log in, so for **test deployments that use preview URLs**, either turn protection off for the API project or use its Production address (production domains are public). The API protects itself: every route except the public ones needs a signed token.

---

---

## 7. The web app on Vercel

1. In Vercel: **Add New → Project**, import the GitHub repo.
2. **Root Directory:** `apps/web`. Keep **"Include source files outside of the Root Directory in the Build Step"** on (it is the default for new projects) so the root `package.json` with the workspaces is used ([Vercel monorepo FAQ](https://vercel.com/docs/monorepos/monorepo-faq)).
3. **Framework Preset:** Next.js. Leave the build and install commands at their defaults.
4. **Node.js Version:** 22.x (Settings → General).
5. **Environment variables** (Settings → Environment Variables). `API_URL` is the address of the API project from section 6:

| Variable | Production value | Notes |
| --- | --- | --- |
| `API_URL` | `https://api.hr.example.com` (or the API project's production `*.vercel.app` address) | Server-side only. The browser never calls the API directly. |
| `PUBLIC_API_URL` | `https://api.hr.example.com` | Used to build each person's calendar-feed link |
| `BILLING_CONTACT_EMAIL` | `billing@example.com` | Shown on the Plan and billing page |

   **Set these for Production only, not Preview.** Preview deployments (one per pull request) would otherwise talk to your real API and data. Point Preview at a separate staging API and database, or leave Preview without a working API.
6. Click **Deploy**. Then **Settings → Domains** → add `hr.example.com` and create the DNS record Vercel shows.
7. If the build fails with "No Next.js version detected" or cannot find workspace packages, check that Root Directory is exactly `apps/web` and that the repo root contains `package.json` and `package-lock.json` ([common cause](https://community.vercel.com/t/vercel-no-next-js-version-detected-for-next-15-app-in-pnpm-monorepo/18750)). If it still cannot trace files outside `apps/web`, set `outputFileTracingRoot` in `apps/web/next.config.ts` to the repo root ([Vercel guide](https://vercel.com/guides/how-can-i-use-files-in-serverless-functions)).

The web app sets browser security headers itself (`next.config.ts`) and keeps the sign-in in an httpOnly cookie, marked secure because Vercel serves HTTPS.

---

## 8. Connectors, one by one

| Connection | How it is set | Check |
| --- | --- | --- |
| **Web → API** | `API_URL` on Vercel | Sign-in page loads, you can sign in |
| **API → Database** | `DATABASE_URL`, `DATABASE_SYSTEM_URL` | `/health/ready` is OK |
| **API → ZeptoMail** | `SMTP_URL`, `MAIL_FROM` | Password-reset email arrives |
| **API → files** | Stored encrypted in the database (automatic on Vercel) | Issue a letter, redeploy, open it again |
| **Vercel Cron → API** | `CRON_SECRET` on the API project | Section 6c |
| **Billing provider → API** | `POST https://api.hr.example.com/billing/webhook`, signed | See 8a |
| **Mobile app → API** | `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WEB_URL` | See 8b |
| **Calendar feeds** | `PUBLIC_API_URL` on Vercel | Create a link on the Calendar page and subscribe to it |
| **Canva letterheads** | Nothing to connect: export a PNG/PDF from Canva and upload it on *Manage documents* | Preview a letter |

### 8a. Billing webhook (no payment provider is connected yet)

Plan changes arrive as a signed `POST /billing/webhook`. Sign the **exact body** with HMAC-SHA256 using `BILLING_WEBHOOK_SECRET` and send the hex digest in `x-signature`. Example (move a company onto Silver for a month):

```bash
BODY='{"tenantId":"<company id>","tier":"SILVER","status":"ACTIVE","seats":40,"billingInterval":"month","currentPeriodEnd":"2026-12-31T00:00:00Z","timestamp":'$(date +%s)'}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$BILLING_WEBHOOK_SECRET" -hex | sed 's/^.* //')
curl -X POST https://api.hr.example.com/billing/webhook \
  -H 'content-type: application/json' -H "x-signature: sha256=$SIG" -d "$BODY"
```

Events older than 5 minutes are refused. A Stripe (or other) integration would be a small adapter that turns the provider's events into this body; it is not built yet. Until then, new companies get 14 days of Gold, then 3 days of grace, then the Free plan (5 people, paid features read-only).

### 8b. Mobile app

- Set `EXPO_PUBLIC_API_URL=https://api.hr.example.com` and `EXPO_PUBLIC_WEB_URL=https://hr.example.com`.
- Test with Expo Go while developing. To publish, build with EAS (`npx eas-cli@latest build`) and submit to the App Store / Google Play. The bundle identifiers are `com.seamlesssource.hr`; change them in `apps/mobile/app.json` if you need your own.
- The mobile app has been compiled but **not yet run on a phone**: test it on a real iPhone and Android before releasing.

---

## 9. First-run checklist

Do these in order on the live site. Tick each one.

1. `https://api…/health/ready` returns `{"ok":true}`.
2. Open the web app. It loads in English; switch to Sinhala and Tamil and back.
3. **Register** a test company. You should get a "Check your email" page, and the email should arrive.
4. Click the link, press **Confirm my email**, sign in.
5. Turn on **two-factor sign-in** under My account and sign out and in again.
6. **Forgot your password?** with a real address: the email arrives and the reset works.
7. Invite a second person (use another real address); they get the email and can join.
8. Add a leave allowance, request leave as the second person, approve it as the owner.
9. **Manage documents:** upload a Canva letterhead, preview and issue a letter. **Redeploy the API**, then open the letter again (proves files survive).
10. **Payroll:** create a pay group, set a salary, run payroll, approve, finalise, open the payslip PDF, download the bank file.
11. Open the **Activity log**: your actions are listed.
12. Try the billing webhook (8a) on the test company and watch the plan page change.
13. Confirm **two different companies cannot see each other**: register a second company and check it shows none of the first one's people.
14. Delete the test companies' data if you do not want it (ask for a script; there is no delete-company button yet).

---

## 10. Running it day to day

### Releasing a new version (always in this order)

1. **Back up** the database (a manual snapshot before any release with a migration).
2. Run **`npm run db:deploy`** from your computer (new tables get permissions and row-level security here).
3. Deploy the **API** project (push to the branch Vercel watches). Wait for `/health/ready`.
4. Deploy the **web** project (same push deploys both).

If the new version only changes the web app, steps 1 to 3 can be skipped.

### Rolling back

Promote the previous deployment in each Vercel project (**Deployments → ⋯ → Promote to Production**). Database migrations only add things, so the older code keeps working against the newer database.

### Backups to keep

| What | How | How often |
| --- | --- | --- |
| Database | Host backups / point-in-time recovery | Continuous or daily; test a restore before launch and every quarter |
| Files | In the database, so covered by the line above | |
| `FIELD_ENCRYPTION_KEY` | Password manager + offline copy | Once; never lose it |

### Rotating secrets

- **Database role passwords:** change `HR_APP_PASSWORD` / `HR_SYSTEM_PASSWORD`, rerun `npm run db:deploy`, update the API environment.
- **`JWT_SECRET`:** changing it signs everyone out (they sign in again).
- **`FIELD_ENCRYPTION_KEY`:** **do not change it**; rotation is not supported and old data would become unreadable.
- **ZeptoMail password:** generate a new one in the Agent, update `SMTP_URL`.

### Limits to know about

Files live in the database (see section 1 for the size note), reminders run once a day, and the per-address request limit is coarse (use Vercel Firewall on the web project for edge limits). Server error messages and emails are English only. No error-tracking service is connected; add Sentry or similar if you want alerts, and point an uptime monitor (for example UptimeRobot) at `/health/ready`.

---

## 11. When something goes wrong

| What you see | Likely cause | Fix |
| --- | --- | --- |
| API function fails on every request with "… must be set in production" in the logs | A required variable is missing | Add it (section 6b) and redeploy |
| "Change the database passwords from the development default" | A URL still contains `:pw@` | Use the passwords from `db:deploy` |
| `/health/ready` says the database is not reachable | Wrong URL, firewall/IP allow-list, or `sslmode` | Use the host's string with `?sslmode=require`; allow the API host's IP |
| `db:deploy` stops: "hr_app can skip row-level security" | `hr_app` was created in a console with BYPASSRLS | Drop it (`DROP OWNED BY hr_app; DROP ROLE hr_app;`) and run `db:deploy` again |
| `db:deploy` stops: "hr_system must bypass…" | `hr_system` was created without BYPASSRLS | On Neon, create it in the console; elsewhere `ALTER ROLE hr_system BYPASSRLS;` as a superuser |
| Web shows errors on every page, nothing loads | `API_URL` is wrong or the API is down | Check `API_URL` on Vercel (Production), then the API's health |
| "Too many requests" for many users at once | The per-address limit sees only the web project | Raise `THROTTLE_LIMIT` on the API project (section 6b) |
| Web works locally but pages error on a preview deployment | Vercel Deployment Protection blocks the web→API call | Section 6d |
| No emails arrive | Domain not verified yet, wrong `SMTP_URL`, password not URL-encoded, sender not on the verified domain | Section 5; look for `Could not send` in the API logs and at ZeptoMail's Processed Emails |
| Emails go to spam | SPF/DKIM not aligned, no DMARC | Verify all three ZeptoMail records; add DMARC |
| Issued letters cannot be opened | Files stored on disk by an earlier setup (`FILE_STORAGE=disk`) or the database was restored without them | On Vercel leave `FILE_STORAGE` unset (database) |
| Reminders never sent | `CRON_SECRET` missing or wrong | Section 6c |
| Vercel build: "No Next.js version detected" | Root Directory wrong | Set it to `apps/web` |
| Preview deployments show real data | Production variables applied to Preview | Scope variables to Production only |
| Billing webhook returns 401 | Signature is over different bytes | Sign the exact raw body; check the secret; the timestamp must be fresh |
| Billing webhook returns 404 | `BILLING_WEBHOOK_SECRET` is not set | Set it on the API |
| Login is slow (about 1 s) | argon2id hashing in WebAssembly, by design | Normal |

---

## 12. Other API hosts (Render, Railway, Fly) instead

The same code runs as a normal server (`npm run build -w @hr/api` then `npm run start:prod -w @hr/api`, health check `/health/ready`, Node 22). Differences from the Vercel setup:

- Files go to a **persistent disk** if you set `FILE_STORAGE=disk` and `FILE_STORAGE_DIR=/data/files` (mount a disk there and snapshot it daily). Or keep them in the database on any host with `FILE_STORAGE=db`, as on Vercel.
- The hourly reminder timer runs inside the server, so `CRON_SECRET` is not needed (still harmless).
- Set `TRUST_PROXY=2` behind one extra proxy (Render, Railway, Fly) so rate limits see each visitor, and leave `THROTTLE_LIMIT` at its default.
- A direct (non-pooled) database URL is fine for a single server.

## 13. Deploying with GitHub Actions (recommended)

The file `.github/workflows/deploy.yml` deploys on every push to `main` once the CI workflow passes: **database first, then the API, then the web app**, with a health check between each. You can also run it by hand (**Actions → Deploy to Vercel → Run workflow**).

### One-time setup

1. **Create the two Vercel projects** (sections 6 and 7) so they exist and have their environment variables. In both, turn **off** automatic Git deployments (**Settings → Git → Ignored Build Step**, or disconnect the repository) so GitHub Actions is the only thing deploying; otherwise every push deploys twice and the web app can go live before the database is ready.
2. **Collect the IDs.** From the repo root on your computer:

   ```bash
   npx vercel@latest login
   cd apps/api && npx vercel@latest link      # choose the API project, then read .vercel/project.json
   cd ../web   && npx vercel@latest link      # choose the web project, then read .vercel/project.json
   ```

   `.vercel/project.json` holds `orgId` and `projectId`. (Both projects share the same `orgId`. These folders are git-ignored; delete the `.vercel` folders afterwards.) You can also see them in each project under **Settings → General**.
3. **Create a Vercel token:** vercel.com → Account Settings → **Tokens** → Create (scope: your team). Copy it once.
4. **In GitHub:** repo → **Settings → Environments → New environment** named `production` (optionally require a reviewer there so every deploy needs a click). Add:

   | Type | Name | Value |
   | --- | --- | --- |
   | Secret | `VERCEL_TOKEN` | the token from step 3 |
   | Secret | `VERCEL_ORG_ID` | `orgId` |
   | Secret | `VERCEL_API_PROJECT_ID` | the API project's `projectId` |
   | Secret | `VERCEL_WEB_PROJECT_ID` | the web project's `projectId` |
   | Secret | `OWNER_URL` | the **direct** owner connection string from section 4 |
   | Secret | `HR_APP_PASSWORD` | from section 2 |
   | Secret | `HR_SYSTEM_PASSWORD` | from section 2 |
   | Variable | `API_URL` | the API's production address, e.g. `https://hr-api.vercel.app` |
   | Variable | `WEB_URL` | the web app's production address |

5. **Confirm each Vercel project's settings:** Root Directory (`apps/api` / `apps/web`), "Include source files outside of the Root Directory" on, Node 22.x, and all environment variables from sections 6b and 7.
6. Push to `main` (or run the workflow). Watch **Actions**: `database` → `api` → `web` should all go green.

### Notes

- The workflow uploads the repository to Vercel and **builds there**, using each project's Root Directory, so the settings in step 5 are what matter.
- Deploys are serialised (a second push waits for the first), so the database step never races itself.
- If `database` fails, nothing else deploys. That is on purpose: the code is never newer than the schema.
- To roll back, use **Promote to Production** on the previous deployment in Vercel (section 10).

---

## Sources used for this guide

- ZeptoMail: [How to configure SMTP](https://help.zoho.com/portal/en/kb/zeptomail/faqs/sending-emails/articles/how-to-configure-smtp), [Domain addition and verification](https://zstatic.zohostatic.com/zeptomail/help/domains.html), [Bounce address](https://www.zoho.com/zeptomail/help/bounce-address.html)
- Vercel: [Cron Jobs](https://vercel.com/docs/cron-jobs), [Monorepo FAQ](https://vercel.com/docs/monorepos/monorepo-faq), [NestJS on Vercel](https://vercel.com/docs/frameworks/backend/nestjs), [Runtimes (read-only filesystem, `/tmp`)](https://vercel.com/docs/runtimes)
- Neon: [Roles](https://neon.com/docs/manage/roles/)

Dashboard wording and menus change; where this guide names a button, look for the closest match. Values that depend on your account (hosts, regions, DNS records) always come from your own dashboards.

## 14. Connecting the Developer Dashboard

The HR app is the single source of truth for leave, work from home and public holidays. The Developer Dashboard reads them for sprint capacity and finish forecasts.

1. On the **hr-api** Vercel project add `INTEGRATION_TOKEN` (a long random string, for example `openssl rand -hex 32`) and `INTEGRATION_TENANT` (your company's slug), then redeploy.
2. On the dashboard add `HR_API_URL` (the hr-api URL, no trailing slash) and `HR_API_TOKEN` (the same token), then redeploy.
3. People are matched by work email, so a developer needs the same email in both apps.

Without the variables nothing changes: the endpoint returns 404 and the dashboard uses its own leave tables. If the HR app is down the dashboard logs it and falls back to its local data.

### Single sign-on between the apps

People sign in once, normally on the Developer Dashboard, and switch to the HR app from the account menu (and back from the HR sidebar) without a second login.

1. Generate one secret: `openssl rand -hex 32`. Put the **same** value in `SSO_SECRET` on the `hr-api` project and on the dashboard.
2. On the HR **web** project set `DASHBOARD_URL` to the dashboard's URL. On the dashboard set `HR_WEB_URL` to the HR web URL (already needed above).
3. Redeploy all three.

How it works: the app you are signed in to creates a signed token that is valid for one minute and only for the other app; the other app checks the signature and starts its own session. Nothing is created automatically, so the person must already have an account (same email) in both apps. HR accounts with two-factor sign-in on are sent to the normal HR login instead. Anyone who can approve dashboard sign-ups can therefore let a person into the HR account with that email, so only approve emails you recognise.

### Jira people

A person imported from Jira is linked to their sign-up automatically when the names clearly match (same words in any order, one name inside the other such as "Sachin Lakshan" and "Sachin Lakshan Perera", or a one-letter typo in a long name) and only one person fits. Ambiguous matches are left alone: use Admin → Users → Merge.

### One profile and one password

With the connection above in place, the HR app owns each person's password, name, email and job title.

- **Sign-in on the dashboard** is checked against the HR app (`POST /integrations/verify-login`, protected by `INTEGRATION_TOKEN`, sharing the HR sign-in lockout). On success the dashboard creates or refreshes its own record from the HR profile and keeps its Jira, GitHub and sprint data on it.
- **Password, email and name changes** are made in the HR app and apply to both. The dashboard's change-password form points people there, and dashboard sign-up is closed (invite people in the HR app instead).
- **People who exist only on the dashboard** keep signing in with their local password until they are added to the HR app with the same email. A dashboard account that is later created in HR under a different email is matched by full name when only one account fits.
- **Two-factor:** accounts with two-factor on cannot sign in through the dashboard form. They sign in to the HR app and use "Switch to Dev Dashboard".
- **Safety:** once the HR app owns an account, the dashboard never falls back to a local password. Someone removed from HR cannot sign in, and an HR outage shows a "try again" message instead of opening a back door. Already signed-in sessions keep working.
- **Profile photo:** one photo for both apps. Upload or remove it in either app (My account in HR, Settings on the dashboard); the HR app keeps the stored copy and the dashboard keeps a small cached one. The first time HR owns someone, their existing dashboard photo is handed over to HR if HR has none. HR people can also set a preferred name and phone on My account; the dashboard's hours per week and GitHub username stay dashboard-only, and the job title is set in HR.
