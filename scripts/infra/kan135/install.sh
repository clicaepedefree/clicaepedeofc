#!/bin/sh
set -eu
umask 077
test "$(id -u)" = 0
source_dir=${1:?Provide script directory}
shift
enable=false
enable_billing=false
for argument in "$@"; do
  case "$argument" in
    --enable) enable=true ;;
    --enable-billing-after-cutover) enable_billing=true ;;
    *) printf '%s\n' 'Unknown option' >&2; exit 2 ;;
  esac
done
install -d -m 700 /opt/clicaepede/kan135 /etc/clicaepede/kan135 /var/lib/clicaepede/kan135
install -o root -g root -m 700 "$source_dir/scheduler.py" /opt/clicaepede/kan135/scheduler.py
if ! test -e /etc/clicaepede/kan135/config.json; then
  install -o root -g root -m 600 "$source_dir/config.example.json" /etc/clicaepede/kan135/config.json
fi
python3 -B -c 'import ast; from pathlib import Path; ast.parse(Path("/opt/clicaepede/kan135/scheduler.py").read_text())'
for unit in "$source_dir"/systemd/kan135-*.service "$source_dir"/systemd/kan135-*.timer; do
  install -o root -g root -m 644 "$unit" /etc/systemd/system/
done
systemd-analyze verify /etc/systemd/system/kan135-*.service /etc/systemd/system/kan135-*.timer
systemctl daemon-reload
if "$enable" || "$enable_billing"; then
  # Validate gates and private credentials, without making any HTTP call.
  python3 -B - "$enable" "$enable_billing" <<'PY'
import sys
sys.path.insert(0, '/opt/clicaepede/kan135')
import scheduler
c = scheduler.config_read()
jobs = []
if sys.argv[1] == 'true':
    jobs.append('whatsapp')
if sys.argv[2] == 'true':
    jobs.append('billing')
tokens = []
for job in jobs:
    if not c.get(job + '_enabled', False):
        raise SystemExit('Runtime flag must be explicitly enabled in private config')
    token = scheduler.private_read(c[job + '_secret_file']).strip()
    if not scheduler.valid_token(token):
        raise SystemExit('Invalid private token')
    tokens.append(token)
if len(tokens) > 1 and len(set(tokens)) != len(tokens):
    raise SystemExit('Dedicated tokens required')
if c.get('origin', scheduler.ORIGIN) != scheduler.ORIGIN and c.get('preview_bypass_secret_file'):
    if not scheduler.valid_token(scheduler.private_read(c['preview_bypass_secret_file']).strip()):
        raise SystemExit('Invalid private preview bypass token')
PY
fi
if "$enable"; then
  systemctl enable kan135-whatsapp.timer kan135-monitor.timer kan135-retry.timer
fi
if "$enable_billing"; then
  systemctl enable kan135-billing.timer kan135-monitor.timer kan135-retry.timer
fi
# Never start/restart units here, including when explicitly enabling for boot.
printf '%s\n' '{"status":"installed","activation":"manual-only"}'
