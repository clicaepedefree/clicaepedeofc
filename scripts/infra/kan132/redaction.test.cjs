const {test} = require('node:test');
const assert = require('node:assert/strict');
const {Readable, Writable} = require('node:stream');
const {pipeline} = require('node:stream/promises');
const {redactor} = require('./start-redacted.cjs');
const fs = require('node:fs');
const vm = require('node:vm');
const {EventEmitter} = require('node:events');

async function render(chunks, secrets) {
  const parts = [];
  await pipeline(Readable.from(chunks), redactor(secrets), new Writable({
    highWaterMark:16,
    write(chunk, encoding, callback) { parts.push(Buffer.from(chunk)); setImmediate(callback); },
  }));
  return Buffer.concat(parts).toString();
}
test('redacts secrets across every stream boundary without changing other bytes', async () => {
  const secret = 'synthetic-runtime-secret-for-redaction';
  const text = `before:${secret}:after\n`;
  for (let split = 1; split < text.length; split++) {
    assert.equal(await render([text.slice(0,split),text.slice(split)], [secret]), 'before:[REDACTED]:after\n');
  }
});
test('long lines, adjacent secrets, UTF-8 and slow output remain intact', async () => {
  const secrets = ['synthetic-secret-one','synthetic-secret-two'];
  const prefix = 'x'.repeat(1024 * 1024);
  const input = Buffer.from(prefix + secrets.join('') + '\u00e7-end');
  const chunks = [];
  for (let offset=0; offset<input.length; offset+=4096) chunks.push(input.subarray(offset,offset+4096));
  assert.equal(await render(chunks,secrets), prefix + '[REDACTED][REDACTED]\u00e7-end');
});
test('pipeline failure remains exit code 1 after terminating the child', () => {
  const child = new EventEmitter();
  child.pid = 123;
  child.stdout = {};
  child.stderr = {};
  const module = {exports:{}};
  const process = {argv:['node','supervisor','command'], stdout:{}, stderr:{},
    on() {}, kill() {}, exit() {throw new Error('Unexpected exit');}};
  function mockedRequire(name) {
    if (name === 'node:fs') return {readFileSync:() => 'synthetic'.repeat(8)};
    if (name === 'node:child_process') return {spawn:() => child};
    if (name === 'node:stream') return {Transform:require('node:stream').Transform,
      pipeline(input, transform, output, callback) {callback(new Error('Synthetic output failure'));}};
    throw new Error('Unexpected dependency');
  }
  mockedRequire.main = module;
  vm.runInNewContext(fs.readFileSync(require.resolve('./start-redacted.cjs'),'utf8'),
    {require:mockedRequire,module,process,Buffer,console});
  assert.equal(process.exitCode,1);
  child.emit('exit',null,'SIGTERM');
  assert.equal(process.exitCode,1);
});
