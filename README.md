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

You need Node 22 and PostgreSQL 16.

```bash
npm install

# 1. Database: migrate as the owner, then create the restricted roles and RLS policies
cd packages/db
export DATABASE_URL=postgresql://hr_owner:pw@localhost:5432/hr
npx prisma migrate deploy
psql "$DATABASE_URL" -f sql/roles.sql -f sql/rls.sql
cd ../..
npm run db:generate   # builds the typed Prisma client

# 2. Run everything
npm run dev:api      # http://localhost:4000
npm run dev:web      # http://localhost:3000
npm run dev:mobile   # Expo
```

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
