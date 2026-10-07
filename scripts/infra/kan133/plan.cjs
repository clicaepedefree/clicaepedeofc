const assert = require('node:assert/strict');
const policy = require('./qa-policy.json');
const requiredGates = ['deployment-approval','storage-plan-quota-and-cost-confirmation',
  'private-bucket-and-credential-scope','restic-supabase-compatibility-test',
  'encryption-key-offsite-recovery','alert-channel-recipient-and-delivery',
  'off-vps-watchdog-heartbeat','isolated-full-restore-and-rpo-rto-evidence'];
const requiredSignals = ['cpu','ram','disk','evolution-https','container-restarts',
  'container-oom','backup-offsite-success','backup-failure'];

function positiveInteger(value, maximum = Number.MAX_SAFE_INTEGER) {
  assert.ok(Number.isSafeInteger(value) && value > 0 && value <= maximum);
}
function includesAll(actual, required) {
  assert.ok(Array.isArray(actual) && actual.every(value => typeof value === 'string'));
  assert.equal(new Set(actual).size, actual.length);
  for (const value of required) assert.ok(actual.includes(value), `Missing required entry: ${value}`);
}

function validatePlan(plan) {
  assert.equal(plan.schemaVersion, 1);
  assert.equal(plan.environment, 'qa');
  assert.equal(plan.deploymentAuthorized, false, 'This delivery must remain preparation-only');
  assert.equal(plan.status, 'prepared-not-deployed');
  assert.equal(plan.backup.rpoHours, 24);
  assert.equal(plan.backup.rtoHours, 8);
  positiveInteger(plan.backup.intervalHours);
  positiveInteger(plan.backup.retentionDays);
  assert.ok(plan.backup.intervalHours > 0 && plan.backup.intervalHours < plan.backup.rpoHours);
  assert.ok(plan.backup.retentionDays >= 7);
  assert.equal(plan.backup.privateBucketRequired, true);
  assert.equal(plan.backup.clientEncryption, 'restic');
  assert.equal(plan.backup.credentialsRecoveryOffsiteRequired, true);
  assert.equal(plan.backup.restoreTarget, 'isolated-no-egress-no-published-ports');
  assert.equal(plan.backup.automaticPruneEnabled, false);
  includesAll(plan.backup.sources, ['postgres-logical-dump','redis-consistent-export','evolution-session-volume','infra-config-and-secrets']);
  assert.equal(plan.monitoring.externalWatchdogRequired, true);
  includesAll(plan.monitoring.requiredSignals, requiredSignals);
  for (const name of ['cpuPercent','ramPercent','diskPercent']) positiveInteger(plan.monitoring[name],99);
  for (const name of ['cpuSustainMinutes','ramSustainMinutes']) positiveInteger(plan.monitoring[name],60);
  positiveInteger(plan.monitoring.pollSeconds,300);
  positiveInteger(plan.monitoring.backupWarningHours);
  positiveInteger(plan.monitoring.backupCriticalHours);
  assert.ok(plan.monitoring.backupWarningHours < plan.monitoring.backupCriticalHours);
  assert.equal(plan.monitoring.backupCriticalHours, plan.backup.rpoHours);
  assert.equal(plan.logging.includeMessageBodies, false);
  assert.equal(plan.logging.includeQrOrCredentials, false);
  for (const name of ['containerMaxSizeMiB','containerMaxFiles','operationalRetentionDays']) positiveInteger(plan.logging[name]);
  includesAll(plan.pendingGates, requiredGates);
  return {status:plan.status, deploymentAuthorized:false, pendingGates:[...plan.pendingGates]};
}

// Pure policy calculation only: it does not collect metrics or send notifications.
function backupFreshness(lastVerifiedOffsiteEpochMs, nowEpochMs, plan = policy) {
  if (!Number.isFinite(nowEpochMs)) throw new Error('Invalid clock');
  if (lastVerifiedOffsiteEpochMs === null) return {severity:'critical', code:'no-verified-offsite-backup'};
  if (!Number.isFinite(lastVerifiedOffsiteEpochMs) || lastVerifiedOffsiteEpochMs > nowEpochMs) {
    return {severity:'critical', code:'invalid-backup-timestamp'};
  }
  const ageHours = (nowEpochMs - lastVerifiedOffsiteEpochMs) / 3600000;
  if (ageHours >= plan.monitoring.backupCriticalHours) return {severity:'critical', code:'backup-rpo-exceeded'};
  if (ageHours >= plan.monitoring.backupWarningHours) return {severity:'warning', code:'backup-aging'};
  return {severity:'ok', code:'verified-offsite-backup-fresh'};
}

module.exports = {validatePlan, backupFreshness};
if (require.main === module) {
  console.log(JSON.stringify(validatePlan(policy), null, 2));
}
