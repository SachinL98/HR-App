# HR App

Multi-tenant HR SaaS: web app and iOS/Android app for company calendars, meetings, leave, WFH, approvals, payroll, documents, notices and end-to-end encrypted chat.

- Product spec: [docs/spec.md](docs/spec.md)
- Data model: [docs/data-model.md](docs/data-model.md)

## Database (local)

```bash
cd packages/db
npm install
export DATABASE_URL=postgresql://hr_owner:pw@localhost:5432/hr
npx prisma migrate dev
psql "$DATABASE_URL" -f sql/rls.sql
```

## Repo layout

| Path | What |
| --- | --- |
| `apps/web` | Next.js web app |
| `apps/mobile` | Expo (React Native) iOS/Android app |
| `apps/api` | NestJS API |
| `packages/db` | Prisma schema, migrations, row-level security |

```bash
npm install
npm run dev:api     # http://localhost:4000
npm run dev:web     # http://localhost:3000
npm run dev:mobile
```
