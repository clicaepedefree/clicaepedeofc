#!/bin/sh
set -eu
read -r AUTHENTICATION_API_KEY < /run/secrets/api_key
export AUTHENTICATION_API_KEY
export DATABASE_CONNECTION_URI="postgresql://evolution:$(cat /run/secrets/pg_app_password)@postgres:5432/evolution?schema=public"
export CACHE_REDIS_URI="redis://:$(cat /run/secrets/redis_password)@redis:6379/0"

# Swarm does not order service startup; wait for internal listeners before migrations.
node <<'JS'
const net = require('node:net');
async function wait(host, port) {
  for (let i = 0; i < 90; i++) {
    const ok = await new Promise(resolve => {
      const socket = net.connect({host, port});
      const finish = value => { socket.destroy(); resolve(value); };
      socket.setTimeout(1500, () => finish(false));
      socket.once('connect', () => finish(true));
      socket.once('error', () => finish(false));
    });
    if (ok) return;
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error(`Internal dependency unavailable: ${host}`);
}
Promise.all([wait('postgres', 5432), wait('redis', 6379)]).catch(() => process.exit(1));
JS
exec node /run/configs/start-redacted.cjs "$@"
