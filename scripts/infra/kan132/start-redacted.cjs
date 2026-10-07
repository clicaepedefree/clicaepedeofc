const {readFileSync} = require('node:fs');
const {spawn} = require('node:child_process');
const {Transform, pipeline} = require('node:stream');

function redactor(values) {
  const secrets = values.map(value => Buffer.from(value));
  if (secrets.some(value => !value.length)) throw new Error('Empty secret');
  const keep = Math.max(...secrets.map(value => value.length)) - 1;
  let tail = Buffer.alloc(0);
  function consume(chunk, final) {
    const data = Buffer.concat([tail, chunk]);
    const safeEnd = final ? data.length : Math.max(0, data.length - keep);
    const parts = [];
    let offset = 0;
    while (offset < safeEnd) {
      let index = -1;
      let matched;
      for (const secret of secrets) {
        const found = data.indexOf(secret, offset);
        if (found >= 0 && (index < 0 || found < index)) { index = found; matched = secret; }
      }
      if (index < 0 || index >= safeEnd) { parts.push(data.subarray(offset, safeEnd)); offset = safeEnd; break; }
      parts.push(data.subarray(offset, index), Buffer.from('[REDACTED]'));
      offset = index + matched.length;
    }
    tail = Buffer.from(data.subarray(offset));
    return Buffer.concat(parts);
  }
  // Bounded overlap handles split secrets without buffering entire log lines.
  return new Transform({
    transform(chunk, encoding, callback) { callback(null, consume(chunk, false)); },
    flush(callback) { callback(null, consume(Buffer.alloc(0), true)); },
  });
}
module.exports = {redactor};
if (require.main === module) {
const secrets = ['api_key', 'pg_app_password', 'redis_password'].map(name =>
  readFileSync(`/run/secrets/${name}`, 'utf8').trim()
);
if (secrets.some(value => value.length < 32)) throw new Error('Invalid runtime secret');
const child = spawn(process.argv[2], process.argv.slice(3), {
  stdio: ['inherit', 'pipe', 'pipe'], detached: true,
});
for (const [input, output] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
  pipeline(input, redactor(secrets), output, error => {
    if (error) {
      try { process.kill(-child.pid, 'SIGTERM'); } catch {}
      process.exitCode = 1;
    }
  });
}
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  try { process.kill(-child.pid, signal); } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
});
child.on('error', () => { console.error('Evolution startup failed'); process.exit(1); });
child.on('exit', (code, signal) => {
  process.exitCode = process.exitCode || (code ?? (signal === 'SIGTERM' ? 0 : 1));
});
}
