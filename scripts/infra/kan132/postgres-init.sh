#!/bin/sh
set -eu
# The application owns its database but cannot administer the PostgreSQL cluster.
read -r PGAPP_SECRET < /run/secrets/pg_app_password
export PGAPP_SECRET
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv app_password PGAPP_SECRET
CREATE ROLE evolution LOGIN PASSWORD :'app_password'; -- secret-scan: allow-test (runtime psql variable, not a password value)
ALTER DATABASE evolution OWNER TO evolution;
ALTER SCHEMA public OWNER TO evolution;
SQL
