#!/bin/sh
set -eu
umask 077
test "$(id -u)" = 0
source_dir=${1:?Provide uploaded script directory}
test -f "$source_dir/backup.py"
test -f "$source_dir/restore.py"
install -d -m 700 /opt/clicaepede/kan133 /var/lib/clicaepede/kan133 /etc/clicaepede/kan133
for file in backup.py restore.py restore-offsite.py restore-recover.py monitor.py retention.py; do
  install -o root -g root -m 700 "$source_dir/$file" "/opt/clicaepede/kan133/$file"
done
install -d -m 700 /opt/clicaepede/kan132
install -o root -g root -m 600 "$source_dir/kan133-trusted-stack.yaml" /opt/clicaepede/kan132/stack.yaml
python3 -m py_compile /opt/clicaepede/kan133/*.py
test "$(stat -c '%a %U' /etc/clicaepede/kan133/config.json)" = '600 root'
cat > /etc/systemd/system/kan133-backup.service <<'EOF'
[Unit]
Description=Encrypted offsite Evolution QA backup
After=docker.service network-online.target kan133-recover.service
Wants=network-online.target
StartLimitIntervalSec=900
StartLimitBurst=3
[Service]
Type=oneshot
ExecStart=/usr/bin/python3 /opt/clicaepede/kan133/backup.py backup
TimeoutStartSec=600
Restart=on-failure
RestartSec=120
UMask=0077
Nice=10
MemoryMax=256M
NoNewPrivileges=true
PrivateTmp=true
LogNamespace=kan133
EOF
cat > /etc/systemd/system/kan133-backup.timer <<'EOF'
[Unit]
Description=12-hour QA backup schedule
[Timer]
OnCalendar=*-*-* 00,12:00:00 UTC
Persistent=true
RandomizedDelaySec=30
Unit=kan133-backup.service
[Install]
WantedBy=timers.target
EOF
cat > /etc/systemd/system/kan133-recover.service <<'EOF'
[Unit]
Description=Reconcile interrupted QA backup maintenance
After=docker.service
Requires=docker.service
[Service]
Type=oneshot
ExecStart=/usr/bin/python3 /opt/clicaepede/kan133/backup.py recover
ExecStartPost=/usr/bin/python3 /opt/clicaepede/kan133/restore-recover.py
TimeoutStartSec=240
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
LogNamespace=kan133
[Install]
WantedBy=multi-user.target
EOF
cat > /etc/systemd/system/kan133-recover.timer <<'EOF'
[Unit]
Description=QA maintenance reconciliation watchdog
[Timer]
OnBootSec=30
OnUnitActiveSec=60
Unit=kan133-recover.service
[Install]
WantedBy=timers.target
EOF
cat > /etc/systemd/system/kan133-monitor.service <<'EOF'
[Unit]
Description=Allowlisted infrastructure telemetry and Telegram alerts
After=network-online.target docker.service
[Service]
Type=oneshot
ExecStart=/usr/bin/python3 /opt/clicaepede/kan133/monitor.py
TimeoutStartSec=55
UMask=0077
MemoryMax=128M
NoNewPrivileges=true
PrivateTmp=true
LogNamespace=kan133
EOF
cat > /etc/systemd/system/kan133-monitor.timer <<'EOF'
[Unit]
Description=Minute QA telemetry
[Timer]
OnBootSec=60
OnUnitActiveSec=60
Unit=kan133-monitor.service
[Install]
WantedBy=timers.target
EOF
systemd-analyze verify /etc/systemd/system/kan133-*.service /etc/systemd/system/kan133-*.timer
cat > /etc/systemd/system/kan133-retention.service <<'EOF'
[Unit]
Description=Restricted seven-day offsite QA retention
After=network-online.target
[Service]
Type=oneshot
ExecStart=/usr/bin/python3 /opt/clicaepede/kan133/retention.py --apply
TimeoutStartSec=180
UMask=0077
MemoryMax=128M
NoNewPrivileges=true
PrivateTmp=true
LogNamespace=kan133
EOF
cat > /etc/systemd/system/kan133-retention.timer <<'EOF'
[Unit]
Description=Restricted QA retention schedule
[Timer]
OnCalendar=*-*-* 00,12:15:00 UTC
Persistent=true
Unit=kan133-retention.service
[Install]
WantedBy=timers.target
EOF
systemd-analyze verify /etc/systemd/system/kan133-*.service /etc/systemd/system/kan133-*.timer
systemctl daemon-reload
install -d -m 755 /etc/systemd/journald@kan133.conf.d
cat > /etc/systemd/journald@kan133.conf.d/retention.conf <<'EOF'
[Journal]
Storage=persistent
MaxRetentionSec=7day
SystemMaxUse=16M
RuntimeMaxUse=8M
EOF
systemctl enable kan133-recover.service
systemctl enable --now kan133-recover.timer
# Backup and alert timers activated by Main only after functional validation.
printf '%s\n' '{"status":"installed","backup_monitor_retention_schedules":"unchanged"}'
