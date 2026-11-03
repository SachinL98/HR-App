# HR App

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
