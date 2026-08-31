import fs from 'node:fs'
import path from 'node:path'

type CriticalFile = {
  path: string
  minLineCoverage: number
}

const criticalFiles: CriticalFile[] = [
  {
    path: 'src/app/api/cron/billing/route.ts',
    minLineCoverage: 85,
  },
  {
    path: 'src/app/api/webhooks/billing/route.ts',
    minLineCoverage: 85,
  },
  {
    path: 'src/features/billing/billing-cron-policy.ts',
    minLineCoverage: 90,
  },
  {
    path: 'src/features/billing/gateway-webhooks-policy.ts',
    minLineCoverage: 80,
  },
]

const lcovPath = path.resolve(process.cwd(), 'coverage', 'lcov.info')

if (!fs.existsSync(lcovPath)) {
  console.error(
    `Critical coverage gate failed: coverage report not found at ${lcovPath}`
  )
  process.exit(1)
}

const normalize = (value: string) => value.replace(/\\/g, '/')

const records = fs
  .readFileSync(lcovPath, 'utf8')
  .split('end_of_record')
  .map(record => record.trim())
  .filter(Boolean)

const coverageByFile = new Map<string, { found: number; hit: number }>()

for (const record of records) {
  const lines = record.split(/\r?\n/)
  const sourceLine = lines.find(line => line.startsWith('SF:'))
  if (!sourceLine) continue

  const sourcePath = normalize(sourceLine.slice(3))
  const found = Number(lines.find(line => line.startsWith('LF:'))?.slice(3) ?? 0)
  const hit = Number(lines.find(line => line.startsWith('LH:'))?.slice(3) ?? 0)

  coverageByFile.set(sourcePath, { found, hit })
}

const failures: string[] = []

for (const file of criticalFiles) {
  const normalizedPath = normalize(file.path)
  const entry = [...coverageByFile.entries()].find(([sourcePath]) =>
    sourcePath.endsWith(normalizedPath)
  )

  if (!entry) {
    failures.push(`${file.path}: missing from coverage report`)
    continue
  }

  const [, coverage] = entry
  const percentage =
    coverage.found === 0 ? 0 : (coverage.hit / coverage.found) * 100

  if (percentage < file.minLineCoverage) {
    failures.push(
      `${file.path}: ${percentage.toFixed(2)}% line coverage, expected >= ${file.minLineCoverage}%`
    )
  } else {
    console.log(
      `Critical coverage ok: ${file.path} ${percentage.toFixed(2)}% >= ${file.minLineCoverage}%`
    )
  }
}

if (failures.length > 0) {
  console.error('Critical coverage gate failed:')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log('Critical coverage gate passed.')
