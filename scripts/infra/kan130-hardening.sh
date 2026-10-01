#!/usr/bin/env bash
set -euo pipefail

exec > >(tee -a /var/log/clicaepede-kan130-hardening.log) 2>&1

ADMIN_USER="${KAN130_ADMIN_USER:-brunoops}"
ADMIN_PUBLIC_KEY="${KAN130_ADMIN_PUBLIC_KEY:-}"
ADMIN_CIDR="${KAN130_ADMIN_CIDR:-}"
DISABLE_ROOT="${KAN130_DISABLE_ROOT:-no}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Execute this script as root." >&2
  exit 1
fi

if ! [[ "$ADMIN_USER" =~ ^[a-z_][a-z0-9_-]{0,30}$ ]]; then
  echo "Invalid KAN130_ADMIN_USER." >&2
  exit 1
fi

if [[ "$ADMIN_PUBLIC_KEY" == *$'\n'* ]] ||
  ! [[ "$ADMIN_PUBLIC_KEY" =~ ^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp)\  ]]; then
  echo "KAN130_ADMIN_PUBLIC_KEY must contain a valid SSH public key." >&2
  exit 1
fi

KEY_CANDIDATE="$(mktemp)"
printf '%s\n' "$ADMIN_PUBLIC_KEY" > "$KEY_CANDIDATE"
if ! ssh-keygen -l -f "$KEY_CANDIDATE" >/dev/null 2>&1; then
  rm -f "$KEY_CANDIDATE"
  echo "KAN130_ADMIN_PUBLIC_KEY is not a parseable single SSH public key." >&2
  exit 1
fi
rm -f "$KEY_CANDIDATE"

if ! [[ "$ADMIN_CIDR" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}/32$ ]]; then
  echo "KAN130_ADMIN_CIDR must contain one authorized IPv4 address (/32)." >&2
  exit 1
fi

ADMIN_IP="${ADMIN_CIDR%/32}"
IFS=. read -r IP1 IP2 IP3 IP4 <<< "$ADMIN_IP"
for OCTET in "$IP1" "$IP2" "$IP3" "$IP4"; do
  if ((10#$OCTET > 255)); then
    echo "KAN130_ADMIN_CIDR contains an invalid IPv4 octet." >&2
    exit 1
  fi
done
if [[ "$ADMIN_IP" == "0.0.0.0" ]]; then
  echo "KAN130_ADMIN_CIDR cannot authorize every origin." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y fail2ban unattended-upgrades sudo

if ! id "$ADMIN_USER" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$ADMIN_USER"
fi
passwd --lock "$ADMIN_USER" >/dev/null

ADMIN_HOME="$(getent passwd "$ADMIN_USER" | cut -d: -f6)"
install -d -o "$ADMIN_USER" -g "$ADMIN_USER" -m 700 "$ADMIN_HOME/.ssh"
touch "$ADMIN_HOME/.ssh/authorized_keys"
grep -qxF "$ADMIN_PUBLIC_KEY" "$ADMIN_HOME/.ssh/authorized_keys" ||
  printf '%s\n' "$ADMIN_PUBLIC_KEY" >> "$ADMIN_HOME/.ssh/authorized_keys"
chown "$ADMIN_USER:$ADMIN_USER" "$ADMIN_HOME/.ssh/authorized_keys"
chmod 600 "$ADMIN_HOME/.ssh/authorized_keys"

cat > "/etc/sudoers.d/90-${ADMIN_USER}" <<EOF
${ADMIN_USER} ALL=(ALL:ALL) NOPASSWD:ALL
EOF
chmod 440 "/etc/sudoers.d/90-${ADMIN_USER}"
visudo -cf "/etc/sudoers.d/90-${ADMIN_USER}"

cat > /etc/fail2ban/jail.d/clicaepede-sshd.local <<EOF
[sshd]
enabled = true
backend = systemd
maxretry = 3
findtime = 10m
bantime = 1h
ignoreip = 127.0.0.1/8 ::1 ${ADMIN_CIDR}
EOF

fail2ban-client -t
systemctl enable fail2ban
systemctl restart fail2ban
for _ in {1..20}; do
  if fail2ban-client ping >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done
fail2ban-client ping >/dev/null
fail2ban-client status sshd >/dev/null

if [[ "$DISABLE_ROOT" == "yes" ]]; then
  ROOT_POLICY="no"
  ALLOWED_USERS="$ADMIN_USER"
else
  ROOT_POLICY="prohibit-password"
  ALLOWED_USERS="root $ADMIN_USER"
fi

SSH_DROP_IN=/etc/ssh/sshd_config.d/00-clicaepede-hardening.conf
SSH_CANDIDATE="$(mktemp)"
cat > "$SSH_CANDIDATE" <<EOF
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
PermitRootLogin ${ROOT_POLICY}
MaxAuthTries 3
AllowUsers ${ALLOWED_USERS}
EOF

SSH_BACKUP="$(mktemp)"
SSH_HAD_PREVIOUS=no
if [[ -f "$SSH_DROP_IN" ]]; then
  cp "$SSH_DROP_IN" "$SSH_BACKUP"
  SSH_HAD_PREVIOUS=yes
fi
install -m 600 "$SSH_CANDIDATE" "$SSH_DROP_IN"
if ! sshd -t; then
  if [[ "$SSH_HAD_PREVIOUS" == "yes" ]]; then
    install -m 600 "$SSH_BACKUP" "$SSH_DROP_IN"
  else
    rm -f "$SSH_DROP_IN"
  fi
  rm -f "$SSH_CANDIDATE" "$SSH_BACKUP"
  echo "Invalid SSH configuration; previous drop-in restored." >&2
  exit 1
fi
rm -f "$SSH_CANDIDATE" "$SSH_BACKUP"

if ! getent passwd "$ADMIN_USER" >/dev/null; then
  echo "Administrative user validation failed; SSH was not reloaded." >&2
  exit 1
fi

systemctl reload ssh
systemctl enable --now unattended-upgrades

echo "KAN-130 hardening completed (disable_root=${DISABLE_ROOT}) at $(date --iso-8601=seconds)"
