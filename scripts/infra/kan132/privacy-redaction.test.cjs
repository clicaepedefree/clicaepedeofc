const {test} = require('node:test');
const assert = require('node:assert/strict');
const {Readable, Writable} = require('node:stream');
const {pipeline} = require('node:stream/promises');
const {createHmac} = require('node:crypto');
const {EventEmitter} = require('node:events');
const {PassThrough} = require('node:stream');
const {finished} = require('node:stream/promises');
const {privacyRedactor, redactor, PRIVACY_LINE_LIMIT} = require('./start-redacted.cjs');
const fs = require('node:fs');
const vm = require('node:vm');
const {inspect} = require('node:util');
const KEY = 'fixture-api-secret-only-for-testing-151';

test('ANSI decoded from JSON and inspect is normalized before identifiers and keys', async () => {
  const {inspect}=require('node:util');
  const inputs=[
    JSON.stringify({participant:'15555550123\x1b[0m@s.whatsapp.net'}),
    inspect({participant:'15555550123\x1b[0m@s.whatsapp.net'}),
    JSON.stringify({'ph\x1b[31mone':'15555550123'}),
    JSON.stringify({message:JSON.stringify({participant:'15555550123\x1b[0m@s.whatsapp.net'})}),
  ];
  for(const input of inputs){
    const bytes=Buffer.from(input),expected=await render([bytes]);
    assert(!expected.includes('15555550123'));
    assert.match(expected,/\[(PHONE|JID):[a-f0-9]{32}\]/);
    for(let split=0;split<=bytes.length;split++)assert.equal(await render([bytes.subarray(0,split),bytes.subarray(split)]),expected);
    assert.equal(await render([...bytes].map(byte=>Buffer.from([byte]))),expected);
  }
});

test('KAN151 escaped identifiers and parent phone context at ALL splits and one-byte chunks', async () => {
  const phone = '15555550123';
  for (const input of [
    '{"participant":"15555550123\\u0040s.whatsapp.net"}',
    '{"ph\\u006fne":"15555550123"}',
    JSON.stringify({message: JSON.stringify({message: JSON.stringify({phone})})}),
    inspect({phone: [phone]}, {compact: false}),
    inspect({phone: `${phone} ("work's")`}),
    JSON.stringify({phone: {number: phone}, eventId: phone}),
    '{\n "ph\\u006fne": {\n entries: [\n {number: "15555550123"},\n [15555550123]\n ]\n },\n eventId: 1234567890123\n}\nERROR E_REAL\n',
    '{"message":"{\\"ph\\\\u006fne\\":\\"15555550123\\"}"}',
    '{"phone": {"15555550123": "work"}}',
    '{"15555550123\\u0040s.whatsapp.net": "participant"}',
    '{"message":"{\\"phone\\":\\"15555550123\\""}',
    '{"phone":\n "15555550123\ncontinued"}\nERROR E_REAL\n',
    '{"phone":"[PHONE:15555550123]"}',
    '{"phone": [PHONE:15555550123]}',
    '{"phone":"[PHONE:15555550123aaaaaaaaaaaaaaaaaaaaa]"}',
    '{"phone":"[JID:15555550123aaaaaaaaaaaaaaaaaaaaa]"}',
  ]) {
    const bytes = Buffer.from(input);
    const expected = await render([bytes]);
    assert(!expected.replace(`"eventId":"${phone}"`, '').includes(phone), expected);
    assert.match(expected, /\[(PHONE|JID):[a-f0-9]{32}\]/);
    assert(!expected.includes('"number":"15555550123"'), expected);
    for (let split = 0; split <= bytes.length; split++) {
      assert.equal(await render([bytes.subarray(0, split), bytes.subarray(split)]), expected, `${input}: ${split}`);
    }
    assert.equal(await render([...bytes].map(byte => Buffer.from([byte]))), expected);
  }
});

async function render(chunks, secrets = [KEY], key = KEY) {
  const parts = [];
  await pipeline(Readable.from(chunks), redactor(secrets), privacyRedactor(key), new Writable({
    highWaterMark: 1,
    write(chunk, encoding, callback) { parts.push(Buffer.from(chunk)); setImmediate(callback); },
  }));
  return Buffer.concat(parts).toString('utf8');
}

test('JIDs, inspect, JSON, ANSI, phones and UTF-8 are invariant at ALL splits and one-byte chunks', async () => {
  const input = Buffer.from('ERROR a\u00e7\u00e3o E_CONN 2026-11-09T12:00:00.123Z\n' +
    '{\n remoteJid: \'5511999998888:42@s.whatsapp.net\',\n remoteJidAlt: "123456789@lid",\n' +
    ' phone: "+55 (11) 99999-8888", mobileNumber: 5511988887777,\n' +
    ' "phone_number": "+55 11 99999-8888; +1 (212) 555-0123"\n}\n' +
    '5511999998888@c.us 120363012345678901-123@g.us 12345:8@lid\n' +
    '\u001b[31m551199\u001b[0m9998888@s.whatsapp.net\n' +
    ' at Client.send (/app/client.js:123:45)\n');
  const expected = await render([input]);
  assert(!expected.includes('5511'));
  assert(!expected.includes('@'));
  assert(!expected.includes('212'));
  assert(expected.includes('ERROR a\u00e7\u00e3o E_CONN 2026-11-09T12:00:00.123Z'));
  assert(expected.includes(' at Client.send (/app/client.js:123:45)'));
  for (let split = 0; split <= input.length; split++) {
    assert.equal(await render([input.subarray(0, split), input.subarray(split)]), expected, `split ${split}`);
  }
  assert.equal(await render([...input].map(byte => Buffer.from([byte]))), expected);
});

test('phone normalization and domain-separated keyed pseudonyms are stable', async () => {
  const a = await render(['phone: "+55 (11) 99999-8888"\n']);
  const b = await render(['phone: "5511999998888"\n']);
  assert.equal(a, b);
  const derived = createHmac('sha256', KEY).update('KAN151/log-privacy/v1').digest();
  const digest = createHmac('sha256', derived).update('phone\0').update('5511999998888').digest('hex').slice(0, 32);
  assert(a.includes(digest));
  assert.notEqual(a, await render(['phone: "5511999998888"\n'], [KEY], KEY + '-rotated'));
  assert(!(await render(['5511999998888@lid'])).includes(digest));
});

test('secrets precede JIDs and phones, including overlapping tokens', async () => {
  const secret = '5511999998888';
  const input = `${KEY} ${secret}@s.whatsapp.net phone: "${secret}"\n`;
  const output = await render([input], [KEY, secret]);
  assert(!output.includes(secret));
  assert(!output.includes(KEY));
  assert(output.includes('[REDACTED]'));
  const bytes = Buffer.from(input);
  for (let split = 0; split <= bytes.length; split++) {
    assert.equal(await render([bytes.subarray(0, split), bytes.subarray(split)], [KEY, secret]), output);
  }
  assert.equal(await render([...bytes].map(byte => Buffer.from([byte])), [KEY, secret]), output);
});

test('technical numbers, event IDs, timestamps, error codes and stacks are unchanged', async () => {
  const input = 'ERROR code=401 eventId=5511999998888 messageId=ABC123:456\n' +
    '{ timestamp: 1794230400000, port: 8080, retries: 3, numberOfItems: 5511999998888 }\n' +
    'at fn (node:internal/file:123:45)\nservice@example.com\n';
  assert.equal(await render([input]), input);
});

test('quoted/unquoted fields, multiple formats, escaped JSON and EOF are redacted', async () => {
  for (const input of [
    'phone=+5511999998888', "'phone': '(11) 99999-8888'", 'phone: (11) 99999-8888',
    '"phone": "\\u002b55 11 99999-8888"',
    '"remoteJidAlt":"5511999998888\\u0040s.whatsapp.net"',
    'phone: "5511999998888 / 12125550123"',
  ]) {
    const output = await render([input]);
    assert(!output.includes('99999'), output);
    assert(!output.includes('12125550123'), output);
    assert.match(output, /\[(PHONE|JID):[a-f0-9]{32}\]/);
    const bytes = Buffer.from(input);
    for (let split = 0; split <= bytes.length; split++) {
      assert.equal(await render([bytes.subarray(0, split), bytes.subarray(split)]), output);
    }
    assert.equal(await render([...bytes].map(byte => Buffer.from([byte]))), output);
  }
});

test('multiline inspect phone values do not leak at any byte boundary', async () => {
  const input = Buffer.from('{\n phone:\n\n  "+55 (11) 99999-8888",\n remoteJidAlt:\n  \'123456789:4@lid\'\n}\n');
  const expected = await render([input]);
  assert(!expected.includes('99999'));
  assert(!expected.includes('123456789'));
  for (let split = 0; split <= input.length; split++) {
    assert.equal(await render([input.subarray(0, split), input.subarray(split)]), expected);
  }
  assert.equal(await render([...input].map(byte => Buffer.from([byte]))), expected);
});

test('unquoted and quoted JIDs use the same identity before phone processing', async () => {
  const token = (await render(['5511999998888:42@s.whatsapp.net'])).trim();
  assert.equal(await render(['remoteJid: 5511999998888:42@s.whatsapp.net']), `remoteJid: ${token}`);
  assert.equal(await render(['remoteJid: "5511999998888:42@s.whatsapp.net"']), `remoteJid: "${token}"`);
});

test('64KiB policy drops the entire oversize line and resumes real errors', async () => {
  const input = Buffer.from('ERROR 5511999998888@s.whatsapp.net ' + 'x'.repeat(1024 * 1024) +
    '\nERROR E_REAL\n at /app/main.js:10:5\n');
  const chunks = [];
  for (let i = 0; i < input.length; i += 101) chunks.push(input.subarray(i, i + 101));
  assert.equal(await render(chunks), 'ERROR [PRIVACY_OVERSIZE_LINE limit=65536]\n' +
    '[PRIVACY_CONTEXT_LOST] ERROR E_REAL\n[PRIVACY_CONTEXT_LOST]  at /app/main.js:10:5\n');
  assert.equal(await render(['x'.repeat(PRIVACY_LINE_LIMIT)]), 'x'.repeat(PRIVACY_LINE_LIMIT));
  assert.equal(await render(['x'.repeat(PRIVACY_LINE_LIMIT + 1)]), '[PRIVACY_OVERSIZE_LINE limit=65536]');
  assert.equal(await render(Array.from({length: PRIVACY_LINE_LIMIT + 1}, () => Buffer.from('x'))),
    '[PRIVACY_OVERSIZE_LINE limit=65536]');
});

test('bounded depth, incomplete strings and oversize continuations fail explicitly without leaking', async () => {
  const phone = '15555550123';
  const depth = '{"phone":' + '['.repeat(65) + `"${phone}"` + ']'.repeat(65) + '}\n';
  const deepOutput = await render([depth, 'ERROR E_REAL\n']);
  assert(deepOutput.includes('[PRIVACY_DEPTH_LIMIT limit=64]'));
  assert(deepOutput.includes('ERROR E_REAL'));
  assert(!deepOutput.includes(phone));
  for (const input of ['phone: "' + phone, 'phone: "\\u0031' + phone.slice(1)]) {
    assert.match(await render([input]), /PRIVACY_INCOMPLETE_STRING/);
  }
  const input = '{phone: [\n"' + 'x'.repeat(PRIVACY_LINE_LIMIT) + '\n' +
    `"${phone}",\nERROR E_REAL ${phone}\n at /app/main.js:10:5\n`;
  const output = await render([input]);
  assert(!output.includes(phone));
  assert(output.includes('PRIVACY_OVERSIZE_LINE'));
  assert(output.includes('PRIVACY_CONTEXT_LOST'));
  assert(output.includes('ERROR E_REAL'));
  assert(output.includes(' at /app/main.js:10:5'));
  const nested = JSON.stringify({message: JSON.stringify({message: JSON.stringify({phone})})});
  assert(!(await render([nested])).includes(phone));
});

test('ordinary quoted diagnostics and numbers outside phone subtrees remain intact', async () => {
  const diagnostic = "ERROR worker's retry failed code=401\nERROR E_REAL\n";
  assert.equal(await render([diagnostic]), diagnostic);
  const input = JSON.stringify({message: "Error: worker's retry failed", eventId: '15555550123',
    timestamp: 1794230400000, details: {number: '15555550123'}}) + '\n';
  assert.equal(await render([input]), input);
  const output = await render(['{"phone":{"number":"15555550123"},"eventId":"15555550123",' +
    '"timestamp":1794230400000,"message":"ERROR E_REAL"}\n']);
  assert(output.includes('"eventId":"15555550123"'));
  assert(output.includes('"timestamp":1794230400000'));
  assert(output.includes('"message":"ERROR E_REAL"'));
  assert(!output.includes('"number":"15555550123"'));
});

test('invalid privacy keys fail synchronously; startup fails before child spawn', () => {
  for (const key of [undefined, null, '', 'short', ' '.repeat(64), Buffer.alloc(64)]) {
    assert.throws(() => privacyRedactor(key), /Invalid privacy key/);
  }
  let spawned = false;
  const module = {exports: {}};
  function mockedRequire(name) {
    if (name === 'node:fs') return {readFileSync: () => 'bad'};
    if (name === 'node:child_process') return {spawn() { spawned = true; }};
    return require(name);
  }
  mockedRequire.main = module;
  assert.throws(() => vm.runInNewContext(fs.readFileSync(require.resolve('./start-redacted.cjs'), 'utf8'),
    {require: mockedRequire, module, Buffer, process: {argv: []}, console}), /Invalid runtime secret/);
  assert.equal(spawned, false);
});

test('privacy initialization failure prevents spawning even with valid runtime secrets', () => {
  let spawned = false;
  const module = {exports: {}};
  function mockedRequire(name) {
    if (name === 'node:fs') return {readFileSync: () => KEY};
    if (name === 'node:crypto') return {createHmac() { throw new Error('Synthetic crypto failure'); }};
    if (name === 'node:child_process') return {spawn() { spawned = true; }};
    return require(name);
  }
  mockedRequire.main = module;
  assert.throws(() => vm.runInNewContext(fs.readFileSync(require.resolve('./start-redacted.cjs'), 'utf8'),
    {require: mockedRequire, module, Buffer, process: {argv: []}, console}), /Synthetic crypto failure/);
  assert.equal(spawned, false);
});

test('supervisor filters stdout AND stderr, forwards signals, and preserves nonzero child exit', async () => {
  const child = new EventEmitter();
  child.pid = 123;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  const output = [[], []];
  const sinks = output.map(parts => new Writable({
    highWaterMark: 1,
    write(chunk, encoding, callback) { parts.push(Buffer.from(chunk)); setImmediate(callback); },
  }));
  const done = sinks.map(sink => finished(sink));
  const signals = {};
  const kills = [];
  const process = {argv: ['node', 'supervisor', 'command'], stdout: sinks[0], stderr: sinks[1],
    on(signal, handler) { signals[signal] = handler; },
    kill(...args) { kills.push(args); }, exit() { throw new Error('Unexpected exit'); }};
  const module = {exports: {}};
  function mockedRequire(name) {
    if (name === 'node:fs') return {readFileSync: () => KEY};
    if (name === 'node:child_process') return {spawn(command, args, options) {
      assert.equal(command, 'command');
      assert.equal(options.detached, true);
      assert.equal(options.stdio.join(','), 'inherit,pipe,pipe');
      return child;
    }};
    return require(name);
  }
  mockedRequire.main = module;
  vm.runInNewContext(fs.readFileSync(require.resolve('./start-redacted.cjs'), 'utf8'),
    {require: mockedRequire, module, Buffer, process, console});
  for (const stream of [child.stdout, child.stderr]) stream.end(`ERROR E_REAL ${KEY} 5511999998888@lid phone: +5511988887777\n`);
  await Promise.all(done);
  for (const parts of output) {
    const text = Buffer.concat(parts).toString();
    assert(text.includes('ERROR E_REAL [REDACTED] [JID:'));
    assert(!text.includes('5511'));
    assert(text.includes('[PHONE:'));
  }
  signals.SIGTERM();
  signals.SIGINT();
  assert.deepEqual(kills, [[-123, 'SIGTERM'], [-123, 'SIGINT']]);
  child.emit('exit', 7, null);
  assert.equal(process.exitCode, 7);
});
