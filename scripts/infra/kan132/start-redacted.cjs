const {readFileSync} = require('node:fs');
const {spawn} = require('node:child_process');
const {Transform, pipeline} = require('node:stream');
const {createHmac} = require('node:crypto');

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
const PRIVACY_LINE_LIMIT = 64 * 1024;

function privacyRedactor(apiSecret) {
  if (typeof apiSecret !== 'string' || apiSecret.trim().length < 32) {
    throw new Error('Invalid privacy key');
  }
  // Domain-separated, keyed derivation; neither phone numbers nor plain hashes are retained.
  const key = createHmac('sha256', apiSecret).update('KAN151/log-privacy/v1').digest();
  const pseudonym = (domain, value) => createHmac('sha256', key)
    .update(domain).update('\0').update(value).digest('hex').slice(0, 32);
  // The boundary avoids quadratic rescanning of long technical tokens without an @.
  const jid = /(?<![a-zA-Z0-9_.:+-])[a-zA-Z0-9_.:+-]+@(?:s\.whatsapp\.net|c\.us|lid|g\.us)\b/gi;
  const fieldName = /^(?:phone(?:_?number)?|mobile(?:_?number)?|telephone|recipientPhone|senderPhone|contactPhone|waNumber|remoteJidAlt|remoteJid)$/i;
  const maxDepth = 64;
  const stripAnsi = text => text.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[[0-?]*[ -/]*[@-~]|\x1b[@-_]/g, '');
  const redactJids = value => value.replace(jid, token => `[JID:${pseudonym('jid', token.toLowerCase())}]`);
  const phoneOrJid = new RegExp(`${jid.source}|\\[REDACTED\\]|\\+?\\d[\\d ().-]*\\d|\\d`, 'gi');
  const redactPhones = (value, uncertain = false) => value.replace(phoneOrJid, token => {
    if (token === '[REDACTED]') return token;
    if (token.includes('@')) return `[JID:${pseudonym('jid', token.toLowerCase())}]`;
    const digits = token.replace(/\D/g, '');
    if (uncertain && (digits.length < 7 || digits.length > 15)) return token;
    return digits.length >= 7 && digits.length <= 15
      ? `[PHONE:${pseudonym('phone', digits)}]` : '[PHONE:REDACTED]';
  });
  function decode(raw) {
    // JSON and util.inspect quoting, without executing JavaScript (including backticks).
    return raw.slice(1, -1).replace(/\\(?:u\{([a-f\d]{1,6})\}|u([a-f\d]{4})|x([a-f\d]{2})|([\s\S]))/gi,
      (_, point, unicode, hex, char) => {
        if (point || unicode || hex) {
          const code = parseInt(point || unicode || hex, 16);
          return code <= 0x10ffff ? String.fromCodePoint(code) : '\ufffd';
        }
        return ({n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0'})[char] ?? char;
      });
  }
  function lexer(depth = 0, inherited = false) {
    const stack = [];
    let nextPhone = false;
    let pending = null;
    let whitespace = '';
    let partial = '';
    let lost = false;
    const sensitive = () => inherited || nextPhone || stack.some(frame => frame.phone);
    function value(token) {
      const decoded = stripAnsi(token.quoted ? decode(token.raw) : token.raw);
      let cleaned;
      // Re-enter only decoded strings: nested serialized JSON is data, never code.
      if (token.quoted && /[:=]/.test(decoded) && /[\[{]|phone|mobile|telephone|recipientPhone|senderPhone|contactPhone|waNumber|remoteJid/i.test(decoded)) {
        cleaned = depth >= maxDepth ? '[PRIVACY_DEPTH_LIMIT limit=64]'
          : lexer(depth + 1, sensitive()).feed(decoded, true);
      } else cleaned = sensitive() ? redactPhones(decoded) : redactJids(decoded);
      nextPhone = false;
      return cleaned === decoded ? token.raw : (token.quoted ? JSON.stringify(cleaned) : cleaned);
    }
    function feed(input, final = false) {
      if (lost) return '[PRIVACY_CONTEXT_LOST]';
      const text = partial + input;
      // One bounded scan, not a suffix search at every colon in technical messages.
      const jids = new Map([...text.matchAll(jid)].map(match => [match.index, match[0]]));
      partial = '';
      let output = '';
      function flush() {
        if (pending) { output += value(pending); pending = null; }
        output += whitespace;
        whitespace = '';
      }
      for (let i = 0; i < text.length;) {
        const char = text[i];
        if (/\s/.test(char)) {
          let end = i + 1;
          while (end < text.length && /\s/.test(text[end])) end++;
          whitespace += text.slice(i, end);
          i = end;
          continue;
        }
        if (char === ':' || char === '=') {
          if (pending) {
            const phoneKey = fieldName.test(stripAnsi(pending.quoted ? decode(pending.raw) : pending.raw));
            output += value(pending) + whitespace;
            nextPhone = phoneKey;
            pending = null;
            whitespace = '';
          } else flush();
          output += char;
          i++;
          continue;
        }
        flush();
        if (char === '{' || char === '[') {
          // Only the content-free secret marker is trusted; input can forge PHONE/JID markers.
          const marker = text.slice(i).match(/^\[REDACTED\]/);
          if (marker) { output += marker[0]; i += marker[0].length; nextPhone = false; continue; }
          if (stack.length + depth >= maxDepth) {
            lost = true;
            return output + '[PRIVACY_DEPTH_LIMIT limit=64]';
          }
          stack.push({phone: sensitive(), close: char === '{' ? '}' : ']'});
          nextPhone = false;
          output += char;
          i++;
          continue;
        }
        if (char === '}' || char === ']' || char === ',') {
          if (char !== ',') {
            if (stack.at(-1)?.close !== char) {
              lost = true;
              return output + '[PRIVACY_CONTEXT_LOST]';
            }
            stack.pop();
          }
          nextPhone = false;
          output += char;
          i++;
          continue;
        }
        if (char === '"' || char === "'" || char === '`') {
          let end = i + 1;
          for (; end < text.length; end++) {
            if (text[end] === '\\') { end++; continue; }
            if (text[end] === char) break;
          }
          if (end >= text.length) {
            partial = text.slice(i);
            if (Buffer.byteLength(partial) > PRIVACY_LINE_LIMIT || final) {
              partial = '';
              lost = true;
              return output + '[PRIVACY_INCOMPLETE_STRING limit=65536]';
            }
            return output;
          }
          pending = {raw: text.slice(i, end + 1), quoted: true};
          i = end + 1;
          continue;
        }
        const rest = text.slice(i);
        const number = sensitive() && rest.match(/^(?:\+?[\d(][\d ()+.\-]*\d|\d)/);
        const raw = jids.get(i) || number?.[0] || rest.match(/^[^\s{}\[\],:=]+/)?.[0] || char;
        pending = {raw, quoted: false};
        i += raw.length;
      }
      // Retain candidate keys across line breaks, but emit ordinary bare diagnostics.
      if (pending && !pending.quoted && !fieldName.test(pending.raw)) flush();
      if (final) flush();
      if (Buffer.byteLength(whitespace) > PRIVACY_LINE_LIMIT) {
        lost = true;
        return output + '[PRIVACY_CONTEXT_LIMIT limit=65536]';
      }
      return output;
    }
    return {feed, failed: () => lost,
      retained: () => Buffer.byteLength(partial + whitespace + (pending?.raw || ''))};
  }
  let scanner = lexer();
  let contextLost = false;
  function sanitize(data, final = false) {
    const text = stripAnsi(data.toString('utf8'));
    // Discarding input destroys structural context for the rest of this stream.
    // Keep marked diagnostics, conservatively masking ambiguous 7-15 digit IDs there;
    // suppress other continuations. Do not guess that a newline ends a phone subtree.
    if (contextLost || scanner.failed()) {
      if (!text) return '';
      return /^(?:\s*(?:ERROR|WARN|INFO|DEBUG|TRACE|FATAL)\b|\s+at\s)/i.test(text)
        ? '[PRIVACY_CONTEXT_LOST] ' + lexer().feed(redactPhones(text, true), true)
        : '[PRIVACY_CONTEXT_LOST]' + (text.endsWith('\n') ? '\n' : '');
    }
    return scanner.feed(text, final);
  }
  // A line is withheld in full until its boundary is known. Oversize lines are discarded
  // in full (including their prefix), with an explicit marker and allowlisted severity.
  const line = Buffer.allocUnsafe(PRIVACY_LINE_LIMIT);
  let length = 0;
  let oversized = false;
  let level = '';
  function append(part) {
    if (oversized) return;
    if (length + part.length + scanner.retained() > PRIVACY_LINE_LIMIT) {
      const prefix = Buffer.concat([line.subarray(0, Math.min(length, 128)), part.subarray(0, Math.max(0, 128 - length))])
        .toString('utf8').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
      level = prefix.match(/\b(ERROR|WARN|INFO|DEBUG|TRACE|FATAL)\b/i)?.[1].toUpperCase() || '';
      length = 0;
      oversized = true;
      contextLost = true;
      scanner = lexer();
      return;
    }
    part.copy(line, length);
    length += part.length;
  }
  function finish(stream, newline) {
    stream.push(oversized ? `${level ? level + ' ' : ''}[PRIVACY_OVERSIZE_LINE limit=65536]${newline ? '\n' : ''}`
      : sanitize(Buffer.concat([line.subarray(0, length), Buffer.from(newline ? '\n' : '')]), !newline));
    length = 0;
    oversized = false;
    level = '';
  }
  return new Transform({
    transform(chunk, encoding, callback) {
      try {
        let offset = 0;
        let end;
        while ((end = chunk.indexOf(10, offset)) !== -1) {
          append(chunk.subarray(offset, end));
          finish(this, true);
          offset = end + 1;
        }
        append(chunk.subarray(offset));
        callback();
      } catch { callback(new Error('Privacy redaction failed')); }
    },
    flush(callback) {
      try { if (length || oversized) finish(this, false); else this.push(sanitize(Buffer.alloc(0), true)); callback(); }
      catch { callback(new Error('Privacy redaction failed')); }
    },
  });
}
module.exports = {redactor, privacyRedactor, PRIVACY_LINE_LIMIT};
if (require.main === module) {
const secrets = ['api_key', 'pg_app_password', 'redis_password'].map(name =>
  readFileSync(`/run/secrets/${name}`, 'utf8').trim()
);
if (secrets.some(value => value.length < 32)) throw new Error('Invalid runtime secret');
// Construct both privacy streams before spawning: invalid privacy state is fail-closed.
const privacyStreams = [privacyRedactor(secrets[0]), privacyRedactor(secrets[0])];
const child = spawn(process.argv[2], process.argv.slice(3), {
  stdio: ['inherit', 'pipe', 'pipe'], detached: true,
});
for (const [index, [input, output]] of [[child.stdout, process.stdout], [child.stderr, process.stderr]].entries()) {
  pipeline(input, redactor(secrets), privacyStreams[index], output, error => {
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
