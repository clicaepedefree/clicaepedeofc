// Reserved synthetic test identifiers; no real transport or credentials are used.
const fs = require('node:fs');
const secret = fs.readFileSync('/run/secrets/api_key', 'utf8');
for (const stream of [process.stdout, process.stderr]) {
  stream.write('WARN qa151-diagnostic-event reconnect ECONNRESET remoteJid: "15555550123@s.whatsapp.net"\n');
  stream.write("ERROR qa151-diagnostic-event send ECONNRESET remoteJidAlt: '123456789@lid', phone: '+1 (555) 555-0124'\n");
  stream.write('ERROR qa151-diagnostic-event receive ECONNRESET ' + secret + '\n');
  stream.write(' at Driver.send (/app/driver.js:42:7)\n');
}
