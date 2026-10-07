const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const stack = JSON.parse(readFileSync(join(__dirname, 'stack.yaml'), 'utf8'));

test('all images use exact versions and immutable digests', () => {
  for (const service of Object.values(stack.services)) {
    assert.match(service.image, /:[^:@]+@sha256:[a-f0-9]{64}$/);
    assert.ok(!service.image.includes(':latest'));
  }
});
test('datastores are internal and no service publishes host ports', () => {
  assert.equal(stack.networks.internal.internal, true);
  for (const name of ['postgres', 'redis']) assert.deepEqual(stack.services[name].networks, ['internal']);
  for (const service of Object.values(stack.services)) assert.equal(service.ports, undefined);
  assert.ok(stack.services.evolution.networks.includes('proxy'));
});
test('all services have persistence, healthchecks, restart policy and resource ceilings', () => {
  for (const service of Object.values(stack.services)) {
    assert.equal(service.volumes.length, 1);
    assert.ok(service.healthcheck.test.length > 0);
    assert.equal(service.deploy.restart_policy.condition, 'any');
    assert.equal(service.deploy.update_config.order, 'stop-first');
    assert.ok(service.deploy.resources.limits.memory);
    assert.ok(service.deploy.resources.limits.cpus);
  }
});
test('only runtime secrets supply passwords and authentication key', () => {
  for (const secret of Object.values(stack.secrets)) assert.equal(secret.external, true);
  const env = stack.services.evolution.environment;
  for (const name of ['AUTHENTICATION_API_KEY', 'DATABASE_CONNECTION_URI', 'CACHE_REDIS_URI']) {
    assert.equal(env[name], undefined);
  }
  assert.equal(env.AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES, 'false');
  assert.equal(stack.services.postgres.environment.POSTGRES_PASSWORD_FILE, '/run/secrets/pg_admin_password');
  assert.equal(env.WEBHOOK_GLOBAL_ENABLED, 'false');
});
