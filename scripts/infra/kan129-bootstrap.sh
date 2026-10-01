#!/usr/bin/env bash
set -euo pipefail

exec > >(tee -a /var/log/clicaepede-kan129-bootstrap.log) 2>&1

HOSTNAME_VALUE="${KAN129_HOSTNAME:-ops-staging}"
TIMEZONE_VALUE="${KAN129_TIMEZONE:-America/Sao_Paulo}"

timedatectl set-timezone "$TIMEZONE_VALUE"
hostnamectl set-hostname "$HOSTNAME_VALUE"

install -d -m 700 /root/.ssh
touch /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys

if [[ -n "${KAN129_SSH_PUBLIC_KEY:-}" ]]; then
  grep -qxF "$KAN129_SSH_PUBLIC_KEY" /root/.ssh/authorized_keys ||
    printf '%s\n' "$KAN129_SSH_PUBLIC_KEY" >> /root/.ssh/authorized_keys
fi

if ! grep -Eq '^(ssh-(ed25519|rsa)|ecdsa-sha2-)' /root/.ssh/authorized_keys; then
  echo "Refusing to disable password authentication without an SSH key." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get -y dist-upgrade
systemctl enable docker

cat > /etc/ssh/sshd_config.d/00-clicaepede-hardening.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF

sshd -t
systemctl reload ssh

echo "KAN-129 bootstrap completed at $(date --iso-8601=seconds)"
