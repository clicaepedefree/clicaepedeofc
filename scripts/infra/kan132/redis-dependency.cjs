const fs = require('node:fs');
const {createClient} = require('redis');
const password = fs.readFileSync('/run/secrets/redis_password','utf8').trim();
const client = createClient({url:`redis://:${password}@redis:6379/0`,
  socket:{connectTimeout:5000,reconnectStrategy:false},disableOfflineQueue:true});
client.on('error', () => {});
const deadline = setTimeout(() => process.exit(1),15000);
deadline.unref();
async function main() {
  await client.connect();
  try {
    const current = await client.clientId();
    const peers = await client.clientList();
    // Swarm VIP may SNAT task addresses. Compare with this probe's observed source,
    // not the container's interface IP; exclude the probe itself and local healthchecks.
    const own = peers.find(peer => peer.id === current);
    const source = own?.addr.split(':')[0];
    if (!source || !peers.some(peer => peer.id !== current &&
      peer.addr.split(':')[0] === source && peer.cmd !== 'ping')) {
      throw new Error('No Evolution Redis connection');
    }
    const aof = await client.configGet('appendonly');
    const fsync = await client.configGet('appendfsync');
    if (aof.appendonly !== 'yes' || fsync.appendfsync !== 'everysec') throw new Error('Unexpected Redis persistence policy');
    console.log('PASS: Evolution Redis connection exists; AOF/everysec enabled');
  } finally { await client.quit(); clearTimeout(deadline); }
}
main().catch(error => {
  console.error('FAIL: Redis dependency/persistence verification (' +
    (['No Evolution Redis connection','Unexpected Redis persistence policy'].includes(error.message) ? error.message : error.name) + ')');
  process.exitCode=1;
});
