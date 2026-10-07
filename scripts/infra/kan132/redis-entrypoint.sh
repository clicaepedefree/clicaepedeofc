#!/bin/sh
set -eu
umask 077
password="$(cat /run/secrets/redis_password)"
# Password is stored in a private runtime file, not in process arguments.
printf '%s\n' 'bind 0.0.0.0' 'protected-mode yes' "requirepass $password" \
  'dir /data' 'appendonly yes' 'appendfsync everysec' 'save 60 1' \
  'maxmemory 128mb' 'maxmemory-policy noeviction' > /tmp/kan132-redis.conf
chown redis:redis /tmp/kan132-redis.conf
exec /usr/local/bin/docker-entrypoint.sh redis-server /tmp/kan132-redis.conf
