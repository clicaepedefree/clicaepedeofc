#!/usr/bin/env bash
set -euo pipefail
umask 077

[[ "$(id -u)" == 0 ]] || { echo "Run as root on the QA VPS." >&2; exit 1; }
SOURCE="$(cd "$(dirname "$0")/acme-lab" && pwd)"
STATE="$(mktemp -d /var/tmp/kan131-acme.XXXXXXXX)"
PREFIX="kan131-acme-${STATE##*.}"
REPORT="/var/log/clicaepede/$PREFIX"
mkdir -p "$REPORT"
NETWORK="$PREFIX"
PEBBLE="$PREFIX-ca"
PROXY="$PREFIX-proxy"
CREATED_NETWORK=no
CREATED_CA=no
CREATED_PROXY=no
cleanup() {
  local code=$?
  trap - EXIT
  set +e
  docker logs "$PROXY" > "$REPORT/traefik.log" 2>&1
  docker logs "$PEBBLE" > "$REPORT/pebble.log" 2>&1
  [[ "$CREATED_PROXY" == no ]] || docker rm -f "$PROXY" >/dev/null
  [[ "$CREATED_CA" == no ]] || docker rm -f "$PEBBLE" >/dev/null
  [[ "$CREATED_NETWORK" == no ]] || docker network rm "$NETWORK" >/dev/null
  if [[ "$STATE" == /var/tmp/kan131-acme.* && -d "$STATE" ]]; then
    rm -rf -- "$STATE"
  fi
  echo "lab_report=$REPORT"
  if [[ "$code" != 0 ]]; then tail -n 20 "$REPORT/traefik.log" >&2; fi
  exit "$code"
}
trap cleanup EXIT

cp "$SOURCE"/* "$STATE/"
mkdir "$STATE/state"
touch "$STATE/state/acme.json"
chmod 600 "$STATE/state/acme.json"

docker image inspect traefik:3.6.7 >/dev/null
docker pull ghcr.io/letsencrypt/pebble:2.8.0 >&2
docker network create --internal "$NETWORK" >/dev/null
CREATED_NETWORK=yes
CREATED_CA=yes
docker create --name "$PEBBLE" --network "$NETWORK" --network-alias pebble \
  --memory 128m --cpus 0.5 -e PEBBLE_VA_NOSLEEP=1 \
  -e PEBBLE_AUTHZREUSE=0 -e PEBBLE_WFE_NONCEREJECT=0 \
  -v "$STATE/pebble.json:/test/kan131.json:ro" \
  ghcr.io/letsencrypt/pebble:2.8.0 -config /test/kan131.json \
  -dnsserver 127.0.0.11:53 >/dev/null
docker cp "$PEBBLE:/test/certs/pebble.minica.pem" "$STATE/pebble.minica.pem"
docker start "$PEBBLE" >/dev/null
CA_IP="$(docker inspect "$PEBBLE" --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')"
for _ in {1..30}; do
  if curl --noproxy '*' --silent --fail --max-time 2 \
    --cacert "$STATE/pebble.minica.pem" --resolve "pebble:14000:$CA_IP" \
    https://pebble:14000/dir >/dev/null; then break; fi
  sleep 1
done
curl --noproxy '*' --silent --show-error --fail --max-time 5 \
  --cacert "$STATE/pebble.minica.pem" --resolve "pebble:15000:$CA_IP" \
  https://pebble:15000/roots/0 > "$STATE/root.pem"

CREATED_PROXY=yes
docker run -d --name "$PROXY" --network "$NETWORK" \
  --network-alias renewal.example.test --memory 192m --cpus 0.5 \
  -v "$STATE:/lab:ro" -v "$STATE/state:/state" \
  traefik:3.6.7 --configFile=/lab/traefik.yaml >/dev/null
PROXY_IP="$(docker inspect "$PROXY" --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')"

# Read only the public certificate hash and account-key hash; never print keys.
snapshot() {
  python3 - "$STATE/state/acme.json" <<'PY'
import base64, hashlib, json, ssl, sys
with open(sys.argv[1]) as f:
    state = json.load(f)["lab"]
certs = state.get("Certificates", [])
if len(certs) != 1:
    sys.exit(1)
cert = certs[0]
assert cert["domain"]["main"] == "renewal.example.test"
leaf = base64.b64decode(cert["certificate"]).decode().split("-----END CERTIFICATE-----")[0] + "-----END CERTIFICATE-----\n"
print(hashlib.sha256(ssl.PEM_cert_to_DER_cert(leaf)).hexdigest(),
      hashlib.sha256(state["Account"]["PrivateKey"].encode()).hexdigest())
PY
}

FIRST=""
for _ in {1..45}; do
  FIRST="$(snapshot 2>/dev/null || true)"
  [[ -z "$FIRST" ]] || break
  sleep 1
done
[[ -n "$FIRST" ]] || { docker logs "$PROXY" >&2; exit 1; }
FIRST_CERT="${FIRST%% *}"
ACCOUNT="${FIRST##* }"

# No restart, force flag, clock change or storage editing: the minute timer renews.
SECOND=""
for _ in {1..100}; do
  SECOND="$(snapshot 2>/dev/null || true)"
  if [[ -n "$SECOND" && "${SECOND%% *}" != "$FIRST_CERT" ]]; then break; fi
  sleep 1
done
[[ -n "$SECOND" && "${SECOND%% *}" != "$FIRST_CERT" && "${SECOND##* }" == "$ACCOUNT" ]]
docker logs "$PROXY" > "$REPORT/traefik.log" 2>&1
grep -q 'Renewing ACME certificate' "$REPORT/traefik.log"
STATUS="$(curl --noproxy '*' --silent --show-error --max-time 5 \
  --cacert "$STATE/root.pem" --resolve "renewal.example.test:443:$PROXY_IP" \
  -o /dev/null -w '%{http_code}' https://renewal.example.test/)"
[[ "$STATUS" == 418 ]]
served_fingerprint() {
  timeout 15 openssl s_client -connect "$PROXY_IP:443" -servername renewal.example.test \
    -CAfile "$STATE/root.pem" -verify_return_error </dev/null 2>"$REPORT/handshake.log" |
    openssl x509 -outform DER | sha256sum | cut -d ' ' -f 1
}
SERVED=""
for _ in {1..15}; do
  SERVED="$(served_fingerprint)"
  [[ "$SERVED" != "${SECOND%% *}" ]] || break
  sleep 1
done
[[ "$SERVED" == "${SECOND%% *}" ]]
timeout 15 openssl s_client -connect "$PROXY_IP:443" -servername renewal.example.test \
  -CAfile "$STATE/root.pem" -verify_return_error </dev/null 2>/dev/null |
  openssl x509 -noout -serial -dates -ext subjectAltName > "$REPORT/certificate.txt"
cat "$REPORT/certificate.txt"
echo "PASS: automatic timer renewal, changed leaf certificate, same ACME account, trusted lab TLS."
echo "certificate_before=$FIRST_CERT"
echo "certificate_after=${SECOND%% *}"

# CA offline prevents startup reissuance: the restarted proxy must serve B from disk.
docker stop "$PEBBLE" >/dev/null
docker restart "$PROXY" >/dev/null
PROXY_IP="$(docker inspect "$PROXY" --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')"
for _ in {1..20}; do
  if STATUS="$(curl --noproxy '*' --silent --max-time 2 --cacert "$STATE/root.pem" \
    --resolve "renewal.example.test:443:$PROXY_IP" -o /dev/null -w '%{http_code}' \
    https://renewal.example.test/)" && [[ "$STATUS" == 418 ]]; then break; fi
  sleep 1
done
[[ "$STATUS" == 418 ]]
FINAL="$(snapshot)"
[[ "${FINAL##* }" == "$ACCOUNT" ]]
[[ "${FINAL%% *}" == "${SECOND%% *}" ]]
[[ "$(served_fingerprint)" == "$SERVED" ]]
echo "PASS: persisted account/certificate and trusted TLS after lab restart."
echo "Lab only: no public DNS, ports, production ACME store or trust store changed."
