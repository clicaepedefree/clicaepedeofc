#!/bin/bash
set -euo pipefail
umask 077
[[ "$(id -u)" == 0 ]] || { echo 'Run as root on the QA VPS.' >&2; exit 1; }
cd "$(dirname "$0")"
STACK=clica-evolution-qa
SECRETS=/etc/clicaepede/evolution-qa/secrets
install -d -m 700 "$SECRETS"
for name in pg_admin pg_app redis api; do
  secret="kan132_${name}_v1"
  if ! docker secret inspect "$secret" >/dev/null 2>&1; then
    [[ -f "$SECRETS/$name" ]] || openssl rand -hex 32 > "$SECRETS/$name"
    chmod 600 "$SECRETS/$name"
    docker secret create "$secret" "$SECRETS/$name" >/dev/null
  fi
done
docker stack config -c stack.yaml >/dev/null
docker stack deploy --resolve-image never -c stack.yaml "$STACK"
echo 'Stack deployed. Validate all healthchecks before switching the QA route.'
