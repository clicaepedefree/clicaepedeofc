const assert = require('node:assert/strict');
const fs = require('node:fs');
const {createClient} = require('redis');
const {Pool} = require('pg');
const {createHash} = require('node:crypto');

const name = 'kan132-persistence-probe';
const phase = process.env.KAN132_TEST_PHASE;
const key = fs.readFileSync('/run/secrets/api_key', 'utf8').trim();
const redisPassword = fs.readFileSync('/run/secrets/redis_password', 'utf8').trim();
const marker = '/evolution/instances/.kan132-volume-probe';
const expected = 'KAN132-persistent-storage-v1';
const deadline = setTimeout(() => { console.error('FAIL: API probe exceeded 75 seconds'); process.exit(1); }, 75000);
deadline.unref();
async function request(path, method = 'GET', body, token = key) {
  const response = await fetch(`http://127.0.0.1:8080${path}`, {
    method, headers: {'Content-Type':'application/json', ...(token ? {apikey:token} : {})},
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  return {status:response.status, data};
}

function postgres() {
  const password = fs.readFileSync('/run/secrets/pg_app_password','utf8').trim();
  return new Pool({connectionString:`postgresql://evolution:${password}@postgres:5432/evolution`,
    connectionTimeoutMillis:5000, query_timeout:5000});
}
async function sessionIdentity(id) {
  const pool = postgres();
  try {
    for (let attempt=0; attempt<30; attempt++) {
      const result = await pool.query('SELECT id, creds FROM "Session" WHERE "sessionId"=$1', [id]);
      const row = result.rows[0];
      if (row?.creds) {
        const stored = JSON.parse(row.creds);
        const creds = typeof stored === 'string' ? JSON.parse(stored) : stored;
        const material = value => {
          const bytes = value?.data ?? value;
          return (typeof bytes === 'string' || Array.isArray(bytes)) && bytes.length > 0;
        };
        assert.ok(Number.isInteger(creds.registrationId) && creds.registrationId >= 0 &&
          material(creds.signedIdentityKey?.public) && material(creds.signedIdentityKey?.private),
          'Real Baileys credentials must be initialized');
        assert.equal(creds.registered, false, 'Probe session must remain unpaired');
        return {id:row.id, fingerprint:createHash('sha256').update(JSON.stringify({
          registrationId:creds.registrationId, publicIdentity:creds.signedIdentityKey.public,
        })).digest('hex')};
      }
      await new Promise(resolve => setTimeout(resolve,500));
    }
    throw new Error('Session credentials not persisted');
  } finally { await pool.end(); }
}

async function main() {
  assert.ok(['before', 'after', 'cleanup'].includes(phase));
  for (const token of [null, 'kan132-invalid-key']) {
    const denied = await request('/instance/fetchInstances', 'GET', undefined, token);
    assert.equal(denied.status, 401, 'Missing/invalid API key must be denied');
  }
  console.log('PASS: protected API rejects missing and invalid keys');
  let list = await request('/instance/fetchInstances');
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.data));
  let instance = list.data.find(item => item.name === name || item.instanceName === name);
  if (phase === 'before') {
    assert.equal(instance, undefined, 'Probe already exists; do not overwrite prior state');
    const created = await request('/instance/create', 'POST', {
      instanceName:name, integration:'WHATSAPP-BAILEYS', qrcode:false,
      rejectCall:true, groupsIgnore:true, readMessages:false, readStatus:false,
    });
    assert.equal(created.status, 201, 'Real instance creation must succeed');
    list = await request('/instance/fetchInstances');
    instance = list.data.find(item => item.name === name || item.instanceName === name);
    assert.ok(instance?.id, 'Instance must be persisted and readable');
    fs.writeFileSync(marker, JSON.stringify({id:instance.id, value:expected}), {mode:0o600});
    // Initialize real credentials without pairing, printing a QR, sending messages or using a phone.
    const connected = await request(`/instance/connect/${name}`);
    assert.equal(connected.status, 200, 'Unpaired session initialization must succeed');
    const session = await sessionIdentity(instance.id);
    fs.writeFileSync(marker, JSON.stringify({id:instance.id,value:expected,session}), {mode:0o600});
    console.log('PASS: real unpaired Baileys credentials persisted without exposing QR or keys');
  } else if (phase === 'after') {
    assert.ok(instance?.id, 'Persisted instance must remain after restart');
    const saved = JSON.parse(fs.readFileSync(marker, 'utf8'));
    assert.equal(instance.id, saved.id, 'Instance identity must remain unchanged');
    assert.equal(saved.value, expected, 'Session volume marker must remain');
    assert.deepEqual(await sessionIdentity(instance.id), saved.session,
      'Persisted session row and public identity must remain unchanged');
    console.log('PASS: real unpaired session identity preserved after full stack restart');
  }
  if (phase !== 'cleanup') {
    const settings = await request(`/settings/find/${name}`);
    assert.equal(settings.status, 200);
    assert.equal(settings.data.groupsIgnore, true, 'Instance settings must persist');
    assert.equal(settings.data.rejectCall, true);
    console.log(`PASS: actual instance and settings ${phase === 'before' ? 'created' : 'preserved'}`);
  } else if (instance) {
    assert.ok(fs.existsSync(marker), 'Cannot delete instance without ownership marker');
    const saved = JSON.parse(fs.readFileSync(marker, 'utf8'));
    assert.equal(instance.id, saved.id);
    if (!saved.deleteRequested) {
      fs.writeFileSync(`${marker}.tmp`, JSON.stringify({...saved,deleteRequested:true}), {mode:0o600});
      fs.renameSync(`${marker}.tmp`, marker);
      const removed = await request(`/instance/delete/${name}`, 'DELETE');
      assert.equal(removed.status, 200);
    }
  }
  const redis = createClient({url:`redis://:${redisPassword}@redis:6379/0`,
    socket:{connectTimeout:5000, reconnectStrategy:false}, disableOfflineQueue:true});
  redis.on('error', () => {});
  await redis.connect();
  try {
    if (phase === 'before') {
      assert.equal(await redis.exists('kan132:persistence-probe'), 0);
      await redis.set('kan132:persistence-probe', expected);
      // Confirm persistence reaches disk before the controlled shutdown.
      await redis.sendCommand(['SAVE']);
    } else if (phase === 'after') {
      assert.equal(await redis.get('kan132:persistence-probe'), expected);
    }
    if (phase === 'cleanup') {
      // Evolution removes the instance asynchronously; retain ownership until confirmed.
      for (let attempt = 0; attempt < 30; attempt++) {
        list = await request('/instance/fetchInstances');
        assert.equal(list.status, 200);
        assert.ok(Array.isArray(list.data));
        const remaining = list.data.find(item => item.name === name || item.instanceName === name);
        if (!remaining) break;
        assert.ok(fs.existsSync(marker), 'Missing ownership marker for pending deletion');
        assert.equal(remaining.id, JSON.parse(fs.readFileSync(marker, 'utf8')).id);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      assert.ok(!list.data.some(item => item.name === name || item.instanceName === name),
        'Owned probe deletion must be confirmed before removing marker');
      if (fs.existsSync(marker)) {
        const pool = postgres();
        try {
          const saved = JSON.parse(fs.readFileSync(marker,'utf8'));
          const removed = await pool.query('SELECT count(*)::int AS count FROM "Session" WHERE "sessionId"=$1', [saved.id]);
          assert.equal(removed.rows[0].count, 0, 'Owned session must be removed by API cascade');
        } finally { await pool.end(); }
      }
      const value = await redis.get('kan132:persistence-probe');
      assert.ok(value === null || value === expected, 'Refuse deletion of foreign Redis value');
      await redis.del('kan132:persistence-probe');
      assert.equal(await redis.exists('kan132:persistence-probe'), 0);
      if (fs.existsSync(marker)) fs.unlinkSync(marker);
      assert.equal(fs.existsSync(marker), false);
      console.log('PASS: only KAN132-owned probes removed; no paired phone or messages');
    } else console.log('PASS: authenticated Redis storage and session-volume probe');
  } finally { await redis.quit(); }
  clearTimeout(deadline);
}
main().catch(error => {
  // Assertion output may contain API data; report only the controlled assertion message.
  console.error(`FAIL: ${error.code === 'ERR_ASSERTION' ? error.message.split('\n')[0] : 'Infrastructure API probe failed'}`);
  process.exitCode = 1;
});
