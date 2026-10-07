#!/bin/bash
set -euo pipefail
umask 077
[[ "$(id -u)" == 0 ]] || exit 1
SOURCE="$(cd "$(dirname "$0")" && pwd)"
TEMP="$(mktemp -d /var/tmp/kan132-bootstrap.XXXXXXXX)"
NAME="kan132-bootstrap-${TEMP##*.}"
cleanup() {
  local code=$?
  trap - EXIT
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  if [[ "$TEMP" == /var/tmp/kan132-bootstrap.* && -d "$TEMP" ]]; then rm -rf -- "$TEMP"; fi
  exit "$code"
}
trap cleanup EXIT
openssl rand -hex 32 > "$TEMP/admin"
openssl rand -hex 32 > "$TEMP/app"
# Mounts readable by the PostgreSQL OS user, protected by root-only parent on host.
chmod 444 "$TEMP/admin" "$TEMP/app"
docker run -d --name "$NAME" --network none --memory 512m --cpus 0.5 \
  --tmpfs /var/lib/postgresql/data:rw,size=268435456 \
  -e POSTGRES_USER=evolution_admin -e POSTGRES_DB=evolution \
  -e POSTGRES_PASSWORD_FILE=/run/secrets/pg_admin_password \
  -v "$TEMP/admin:/run/secrets/pg_admin_password:ro" \
  -v "$TEMP/app:/run/secrets/pg_app_password:ro" \
  -v "$SOURCE/postgres-init.sh:/docker-entrypoint-initdb.d/kan132-init.sh:ro" \
  postgres:17.11-bookworm@sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826 >/dev/null
ready=no
for _ in {1..45}; do
  result="$(docker exec "$NAME" psql -U evolution_admin -d evolution -Atc \
    "SELECT count(*) FROM pg_roles WHERE rolname='evolution' AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole;" 2>/dev/null || true)"
  if [[ "$result" == 1 ]]; then ready=yes; break; fi
  sleep 1
done
[[ "$ready" == yes ]]
[[ "$(docker exec "$NAME" psql -U evolution_admin -d evolution -Atc \
  "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='evolution';")" == evolution ]]
echo 'PASS: final PostgreSQL init script creates restricted app role and database ownership on fresh isolated storage'
