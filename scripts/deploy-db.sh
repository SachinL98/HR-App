#!/usr/bin/env bash
# Prepares (or updates) a PRODUCTION database. Safe to re-run on every release.
#
#   OWNER_URL=postgresql://owner:pass@host:5432/hr \
#   HR_APP_PASSWORD=...  HR_SYSTEM_PASSWORD=... \
#   npm run db:deploy
#
# OWNER_URL  A direct (not pooled) connection as the database owner. It is only used here, never by the app.
# What it does, in order:
#   1. applies the schema migrations;
#   2. creates the two app roles if they are missing (hr_app is restricted; hr_system bypasses row-level security);
#   3. sets their passwords;
#   4. grants access and (re)applies row-level security to every table, including any new ones;
#   5. checks the roles are what they must be, and stops with an error if hr_app could skip row-level security.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${OWNER_URL:?Set OWNER_URL to the owner connection string}"
: "${HR_APP_PASSWORD:?Set HR_APP_PASSWORD}"
: "${HR_SYSTEM_PASSWORD:?Set HR_SYSTEM_PASSWORD}"
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning" # hide "policy does not exist, skipping" notices
command -v psql >/dev/null || { echo "psql is needed (macOS: brew install libpq)." >&2; exit 1; }
[ -x node_modules/.bin/prisma ] || { echo "Run 'npm ci' in the repo root first." >&2; exit 1; }

if [ "${ALLOW_WEAK_PASSWORDS:-}" != "1" ]; then
  for p in "$HR_APP_PASSWORD" "$HR_SYSTEM_PASSWORD"; do
    if [ "${#p}" -lt 16 ] || [ "$p" = "pw" ]; then
      echo "Passwords must be at least 16 characters (some hosts also need upper and lower case). Try:  openssl rand -base64 36 | tr -dc A-Za-z0-9 | head -c 32" >&2; exit 1
    fi
  done
  [ "$HR_APP_PASSWORD" != "$HR_SYSTEM_PASSWORD" ] || { echo "Use different passwords for the two roles." >&2; exit 1; }
fi

echo "1/5 Applying migrations…"
( cd packages/db && DATABASE_URL="$OWNER_URL" ../../node_modules/.bin/prisma migrate deploy )

echo "2/5 Creating the app roles if they are missing…"
# Created here with the real passwords (some hosts, e.g. Neon, refuse the placeholder in roles.sql).
# On Neon hr_system is normally created in the console first (bypass row-level security); it is then left alone.
psql "$OWNER_URL" -v ON_ERROR_STOP=1 -q -v app_pw="$HR_APP_PASSWORD" -v sys_pw="$HR_SYSTEM_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE hr_app LOGIN PASSWORD %L', :'app_pw') WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hr_app') \gexec
SELECT format('CREATE ROLE hr_system LOGIN BYPASSRLS PASSWORD %L', :'sys_pw') WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hr_system') \gexec
SQL

echo "3/5 Setting passwords…"
psql "$OWNER_URL" -v ON_ERROR_STOP=1 -q -v app_pw="$HR_APP_PASSWORD" -v sys_pw="$HR_SYSTEM_PASSWORD" <<'SQL'
ALTER ROLE hr_app PASSWORD :'app_pw';
SQL
# On Neon the owner may not change hr_system's password (it belongs to the console). Then reset it there
# (`neon roles reset-password hr_system`) and use that value as HR_SYSTEM_PASSWORD.
echo "ALTER ROLE hr_system PASSWORD :'sys_pw';" | psql "$OWNER_URL" -q -v sys_pw="$HR_SYSTEM_PASSWORD" 2>/dev/null \
  || echo "   (kept hr_system's existing password; make sure HR_SYSTEM_PASSWORD matches it)"

echo "4/5 Applying grants and row-level security…"
psql "$OWNER_URL" -v ON_ERROR_STOP=1 -q -f packages/db/sql/roles.sql -f packages/db/sql/rls.sql

echo "5/5 Checking the roles…"
psql "$OWNER_URL" -v ON_ERROR_STOP=1 -tA -F'|' -c "SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname IN ('hr_app','hr_system') ORDER BY rolname" | {
  ok=1
  while IFS='|' read -r name super bypass; do
    echo "   $name  superuser=$super  bypass-rls=$bypass"
    if [ "$name" = "hr_app" ] && { [ "$super" = "t" ] || [ "$bypass" = "t" ]; }; then
      echo "   ERROR: hr_app can skip row-level security, so companies would NOT be isolated. Recreate it with plain SQL (no console), without superuser or BYPASSRLS." >&2; ok=0; fi
    if [ "$name" = "hr_system" ] && [ "$bypass" != "t" ]; then
      echo "   ERROR: hr_system must bypass row-level security (login and invite lookups need it)." >&2; ok=0; fi
  done
  [ "$ok" = 1 ]
}
echo "Done. Put these in the API's environment:"
echo "  DATABASE_URL        = postgresql://hr_app:<HR_APP_PASSWORD>@<host>/<db>?sslmode=require"
echo "  DATABASE_SYSTEM_URL = postgresql://hr_system:<HR_SYSTEM_PASSWORD>@<host>/<db>?sslmode=require"
