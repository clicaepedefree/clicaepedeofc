#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env.local"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: .env.local not found"
  exit 1
fi

# Parse a variable from .env.local (handles quoted and unquoted values)
get_env_var() {
  local value
  value=$(grep "^$1=" "$ENV_FILE" | head -1 | cut -d'=' -f2-)
  # Strip surrounding quotes
  value="${value%\"}" ; value="${value#\"}"
  value="${value%\'}" ; value="${value#\'}"
  echo "$value"
}

PROD_URL=$(get_env_var "POSTGRES_URL_PROD")
LOCAL_URL=$(get_env_var "POSTGRES_URL")

if [ -z "$PROD_URL" ]; then
  echo "Error: POSTGRES_URL_PROD not set in .env.local"
  exit 1
fi

if [ -z "$LOCAL_URL" ]; then
  echo "Error: POSTGRES_URL not set in .env.local"
  exit 1
fi

# pg_dump requires a direct connection — Supabase pooler (port 6543) won't work.
# Convert to direct connection (port 5432) and ensure SSL.
DIRECT_PROD_URL=$(echo "$PROD_URL" | sed 's/:6543\//:5432\//')
if [[ "$DIRECT_PROD_URL" != *"sslmode="* ]]; then
  if [[ "$DIRECT_PROD_URL" == *"?"* ]]; then
    DIRECT_PROD_URL="${DIRECT_PROD_URL}&sslmode=require"
  else
    DIRECT_PROD_URL="${DIRECT_PROD_URL}?sslmode=require"
  fi
fi

# Use PostgreSQL 15 client tools if available (needed for Supabase PG 15)
PG15_BIN="/opt/homebrew/opt/postgresql@15/bin"
if [ -d "$PG15_BIN" ]; then
  PG_DUMP="$PG15_BIN/pg_dump"
else
  PG_DUMP="pg_dump"
fi

DUMP_FILE=$(mktemp /tmp/prod_data_dump.XXXXXX.sql)
cleanup() { rm -f "$DUMP_FILE"; }
trap cleanup EXIT

echo "=> Dumping production data (public schema only)..."
"$PG_DUMP" "$DIRECT_PROD_URL" \
  --data-only \
  --schema=public \
  --disable-triggers \
  --no-owner \
  --no-privileges \
  --exclude-table='__drizzle_migrations' \
  > "$DUMP_FILE"

echo "=> Truncating local tables..."
psql "$LOCAL_URL" --quiet <<'SQL'
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename NOT LIKE '%drizzle%'
    ) LOOP
        EXECUTE 'TRUNCATE TABLE public.' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
END $$;
SQL

echo "=> Loading production data into local database..."
psql "$LOCAL_URL" --quiet < "$DUMP_FILE"

echo "=> Done! Local database now has production data."
