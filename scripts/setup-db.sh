#!/usr/bin/env bash
# Creates the local `hr` database, applies migrations, and installs the restricted
# roles and row-level security. Safe to re-run.
#
#   npm install        # first, so the pinned Prisma 7 CLI is available
#   npm run db:setup
#
# Uses your normal Postgres login (on macOS with Homebrew that is your own user,
# no password). To use another admin login:
#   ADMIN_URL=postgresql://postgres:secret@localhost:5432/postgres npm run db:setup
set -euo pipefail
cd "$(dirname "$0")/.."

ADMIN_URL="${ADMIN_URL:-postgresql://localhost:5432/postgres}"
DB_NAME="${DB_NAME:-hr}"
# Same server, the new database. Handles an optional ?query string.
DB_URL="$(printf '%s' "$ADMIN_URL" | sed -E "s#/[^/?]*(\?|$)#/${DB_NAME}\1#")"

export DATABASE_URL="$DB_URL" # Prisma's config reads it for migrate and generate

if [ ! -x node_modules/.bin/prisma ]; then
  echo "Prisma is not installed. Run 'npm install' in the repo root first." >&2
  exit 1
fi
command -v psql >/dev/null || { echo "psql not found. Install PostgreSQL 16 (macOS: brew install postgresql@16)." >&2; exit 1; }

psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 \
  || psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${DB_NAME}"

( cd packages/db && ../../node_modules/.bin/prisma migrate deploy )
psql "$DB_URL" -v ON_ERROR_STOP=1 -f packages/db/sql/roles.sql -f packages/db/sql/rls.sql
npm run db:generate

echo
echo "Done. Database '${DB_NAME}' is ready. Start the app with:"
echo "  npm run dev:api   # http://localhost:4000"
echo "  npm run dev:web   # http://localhost:3000"
