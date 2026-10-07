const {test} = require('node:test');
const assert = require('node:assert/strict');
const {validatePlan, backupFreshness} = require('./plan.cjs');
const policy = require('./qa-policy.json');

test('preparation never claims deployment or operational acceptance', () => {
  const result = validatePlan(policy);
  assert.equal(result.deploymentAuthorized, false);
  assert.ok(result.pendingGates.includes('isolated-full-restore-and-rpo-rto-evidence'));
});
test('rejects public backup, missing encryption and missing isolated restore', () => {
  for (const [field,value] of [['privateBucketRequired',false],['clientEncryption','none'],
    ['credentialsRecoveryOffsiteRequired',false],['restoreTarget','live-stack']]) {
    const unsafe = structuredClone(policy);
    unsafe.backup[field] = value;
    assert.throws(() => validatePlan(unsafe));
  }
});
test('rejects schedule without margin, shorter retention and automatic deletion', () => {
  for (const [field,value] of [['intervalHours',24],['retentionDays',1],['automaticPruneEnabled',true]]) {
    const unsafe = structuredClone(policy);
    unsafe.backup[field] = value;
    assert.throws(() => validatePlan(unsafe));
  }
});
test('backup age is based only on confirmed offsite success', () => {
  const now = 200 * 3600000;
  assert.equal(backupFreshness(null,now).severity,'critical');
  assert.equal(backupFreshness(now - 17 * 3600000,now).severity,'ok');
  assert.equal(backupFreshness(now - 18 * 3600000,now).severity,'warning');
  assert.equal(backupFreshness(now - 24 * 3600000,now).severity,'critical');
});
test('all mandatory gates and monitoring signals must remain explicit', () => {
  for (const field of ['pendingGates','requiredSignals']) {
    const unsafe = structuredClone(policy);
    const target = field === 'pendingGates' ? unsafe : unsafe.monitoring;
    target[field] = ['placeholder'];
    assert.throws(() => validatePlan(unsafe));
  }
});
test('numeric policy thresholds reject zero, out of range and string coercion', () => {
  for (const field of ['cpuPercent','ramPercent','diskPercent','pollSeconds','cpuSustainMinutes','ramSustainMinutes']) {
    for (const value of [0,-1,'60',NaN,Infinity,1.5]) {
      const unsafe = structuredClone(policy);
      unsafe.monitoring[field] = value;
      assert.throws(() => validatePlan(unsafe));
    }
  }
  const unsafe = structuredClone(policy);
  unsafe.monitoring.diskPercent = 100;
  assert.throws(() => validatePlan(unsafe));
});
test('clock anomalies must not mark old or unknown backups healthy', () => {
  assert.equal(backupFreshness(NaN,0).severity,'critical');
  assert.equal(backupFreshness(1,0).severity,'critical');
  assert.throws(() => backupFreshness(0,NaN));
});
