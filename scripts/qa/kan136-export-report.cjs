const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// Export only the reviewed coverage ledger, never raw browser/session artifacts.
assert.equal(process.argv.length, 2)
const root =
  process.env.QA_ARTIFACT_ROOT || 'D:/ProjetoIA/codex/clicaepede/KAN-136'
const docs = path.resolve(__dirname, '../../docs/qa')
const coverage = JSON.parse(
  fs.readFileSync(path.join(docs, 'kan136-criteria-results.json'), 'utf8')
)
assert.equal(coverage.criteria.length, 189)
function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitize(item)])
    )
  if (typeof value !== 'string') return value
  return value
    .replace(
      /\[([^\]]+)\]\(<?[A-Z]:[\\/][^\n)]*>?\)/gi,
      '$1 (arquivo privado, nao publicado)'
    )
    .replace(/[A-Z]:[\\/][^\n"<>)]*/gi, '[referencia local privada]')
}
const publicCoverage = sanitize(coverage)
const report = sanitize(
  fs.readFileSync(path.join(docs, 'kan136-execution-results.md'), 'utf8')
)
const serialized = JSON.stringify(publicCoverage, null, 2)
for (const content of [serialized, report]) {
  assert(
    !/\+55\d{10,11}|(?:sk|pk)_(?:live|test)_[a-zA-Z0-9]{16,}|postgres(?:ql)?:\/\//.test(
      content
    ),
    'Refusing potential private data export'
  )
}
fs.mkdirSync(root, { recursive: true })
fs.writeFileSync(path.join(root, 'KAN-136-public-results.md'), report)
fs.writeFileSync(path.join(root, 'KAN-136-public-criteria.json'), serialized)
console.log(
  JSON.stringify({
    exported: 2,
    criteria: coverage.criteria.length,
    done: false,
  })
)
