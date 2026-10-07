#!/bin/bash
set -euo pipefail
[[ "$(id -u)" == 0 ]] || { echo 'Run as root on the QA VPS.' >&2; exit 1; }
cd "$(dirname "$0")"
STACK=clica-evolution-qa
container() { docker ps -q --filter "label=com.docker.swarm.service.name=${STACK}_$1"; }
healthy() {
  for _ in {1..90}; do
    local ready=yes
    for service in postgres redis evolution; do
      local update="$(docker service inspect "${STACK}_$service" --format '{{if .UpdateStatus}}{{.UpdateStatus.State}}{{end}}')"
      if [[ "$update" == paused || "$update" == rollback_paused ]]; then
        echo "FAIL: $service rollout is paused" >&2
        exit 1
      fi
      [[ -z "$update" || "$update" == completed || "$update" == rollback_completed ]] || ready=no
      local id="$(container "$service")"
      [[ -n "$id" && "$(docker inspect "$id" --format '{{.State.Health.Status}}')" == healthy ]] || ready=no
    done
    [[ "$ready" != yes ]] || return 0
    sleep 3
  done
  echo 'FAIL: stack did not become healthy within 270 seconds' >&2
  exit 1
}
phase="${1:-inspect}"
[[ "$phase" == inspect || "$phase" == restart || "$phase" == cleanup ]] || exit 1
healthy
docker stack services "$STACK" --format '{{.Name}} {{.Replicas}}'
for service in postgres redis evolution; do
  [[ "$(docker service inspect "${STACK}_$service" --format '{{len .Endpoint.Ports}}')" == 0 ]]
done
echo 'PASS: no service publishes host ports'
[[ "$(docker exec "$(container postgres)" psql -U evolution_admin -d evolution -Atc \
  "SELECT count(*) FROM pg_roles WHERE rolname='evolution' AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole;")" == 1 ]]
echo 'PASS: application role is not superuser'
[[ "$(docker exec "$(container postgres)" psql -U evolution_admin -d evolution -Atc \
  'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL;')" == 0 ]]
echo 'PASS: PostgreSQL migrations completed'
[[ "$(docker exec "$(container postgres)" psql -U evolution_admin -d evolution -Atc \
  "SELECT count(*) > 0 FROM pg_stat_activity WHERE usename='evolution' AND datname='evolution';")" == t ]]
echo 'PASS: Evolution PostgreSQL connections exist'
[[ "$(docker exec "$(container redis)" redis-cli ping 2>&1)" == *NOAUTH* ]]
echo 'PASS: Redis rejects unauthenticated access'
docker exec -i "$(container evolution)" node < redis-dependency.cjs
if [[ "$phase" == restart ]]; then
  declare -A originals
  for service in postgres redis evolution; do originals[$service]="$(container "$service")"; done
  docker exec -i -e KAN132_TEST_PHASE=before "$(container evolution)" node < api-test.cjs
  # Full stack stop/start, not merely a rolling app update. Named volumes remain.
  for service in evolution redis postgres; do
    docker service scale "${STACK}_$service=0" >/dev/null
  done
  [[ -z "$(docker ps -q --filter "label=com.docker.stack.namespace=$STACK")" ]]
  echo 'PASS: all three services fully stopped'
  for service in postgres redis evolution; do
    docker service scale "${STACK}_$service=1" >/dev/null
  done
  healthy
  for service in postgres redis evolution; do
    [[ "$(container "$service")" != "${originals[$service]}" ]]
    echo "PASS: $service container recreated"
  done
  docker exec -i -e KAN132_TEST_PHASE=after "$(container evolution)" node < api-test.cjs
  echo 'PASS: full stack restart preserved configuration and storage; WhatsApp unpaired'
elif [[ "$phase" == cleanup ]]; then
  docker exec -i -e KAN132_TEST_PHASE=cleanup "$(container evolution)" node < api-test.cjs
fi
