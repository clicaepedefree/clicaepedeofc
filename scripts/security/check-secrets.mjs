import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const trackedFiles = execFileSync("git", ["ls-files", "-z"], {
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);

const binaryExtensions = new Set([
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".lockb",
  ".pdf",
  ".png",
  ".webp",
  ".woff",
  ".woff2",
]);

const signatures = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["GitHub token", /\b(?:gh[opusr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/],
  ["OpenAI token", /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
];

const assignedValue = /\b([A-Z][A-Z0-9_]*)\s*[:=]\s*([^\s,;]+)/;
const secretName =
  /(?:^|_)(?:SECRET|TOKEN|PASSWORD|PRIVATE_KEY|API_KEY|ENCRYPTION_KEY)(?:_|$)|(?:^|_)DATABASE_URL$|(?:^|_)KEY$/;
const placeholderMarkers =
  /^(?:["']?(?:ci_|test_|fixture_|your_|change-me)|.*(?:placeholder|example|xxx|\.\.\.))/i;

function inspectLine(file, line, lineNumber, findings) {
  if (line.includes("secret-scan: allow-test")) return;
  const inspectedLine = line.replace(/^\s*#\s?/, "");
  const documentedPlaceholder =
    file === ".env.example" && placeholderMarkers.test(inspectedLine);

  for (const [label, pattern] of signatures) {
    if (!documentedPlaceholder && pattern.test(inspectedLine)) {
      findings.push(`${file}:${lineNumber}: ${label}`);
    }
  }

  const assignment = inspectedLine.match(assignedValue);
  if (
    !assignment ||
    !secretName.test(assignment[1]) ||
    /(?:PUBLIC|PUBLISHABLE)_KEY$/.test(assignment[1]) ||
    /_(?:PATTERN|VERSION|TYPE|TTL|LENGTH|STATUS|FIELD|COLUMN)$/.test(assignment[1])
  ) {
    return;
  }

  const rawValue = assignment[2];
  const value = rawValue.replace(/^['"]|['"]$/g, "");
  const isCodeReference =
    inspectedLine.includes("process.env.") && /^[A-Za-z_$][\w.$]*$/.test(value);
  const isZeroFixture = /^[0-9x]+[A-Z]{0,2}$/.test(value);
  const isLocalDatabase = /^postgres(?:ql)?:\/\/[^\s]+@localhost(?::\d+)?\//i.test(value);
  const isPatternConstant = rawValue.startsWith("/");
  const isKnownTestFixture =
    file.includes(".test.") &&
    /^(?:cron-secret|gateway-secret|wa-secret|global-key|test-key|test-secret|fixture[-_])/i.test(value);

  if (
    !placeholderMarkers.test(value) &&
    !isCodeReference &&
    !isZeroFixture &&
    !isLocalDatabase &&
    !isPatternConstant &&
    !isKnownTestFixture &&
    !documentedPlaceholder &&
    !value.startsWith("${")
  ) {
    findings.push(`${file}:${lineNumber}: assigned secret (${assignment[1]})`);
  }
}

if (process.argv.includes("--self-test")) {
  const cases = [
    ["config.env", 'CLERK_SECRET_KEY="RealSecretValue123"', true], // secret-scan: allow-test
    ["config.env", "SUPABASE_SERVICE_ROLE_KEY=RealServiceRoleValue123", true], // secret-scan: allow-test
    ["config.env", "DATABASE_URL=postgresql://prod:password@db.internal/prod", true], // secret-scan: allow-test
    ["config.env", "HOSTINGER_API_TOKEN=RealHostingerValue123", true], // secret-scan: allow-test
    [".env.example", "CLERK_SECRET_KEY=sk_...", false], // secret-scan: allow-test
    ["route.test.ts", "process.env.CRON_SECRET = 'cron-secret'", false], // secret-scan: allow-test
    ["policy.ts", "TOKEN_CIPHER_VERSION = 1", false], // secret-scan: allow-test
  ];

  for (const [file, line, shouldFail] of cases) {
    const selfTestFindings = [];
    inspectLine(file, line, 1, selfTestFindings);
    if ((selfTestFindings.length > 0) !== shouldFail) {
      const variable = line.match(/[A-Z][A-Z0-9_]*/)?.[0] ?? file;
      console.error(`Secret scanner self-test failed for: ${variable}`);
      process.exit(1);
    }
  }
  console.log("Secret scanner self-test aprovado.");
  process.exit(0);
}

const findings = [];

for (const file of trackedFiles) {
  const extension = file.slice(file.lastIndexOf(".")).toLowerCase();
  if (binaryExtensions.has(extension)) continue;

  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    inspectLine(file, lines[index], index + 1, findings);
  }
}

const baseSha = process.env.SECRET_SCAN_BASE_SHA;
if (baseSha && !/^0+$/.test(baseSha) && /^[0-9a-f]{7,40}$/i.test(baseSha)) {
  const patch = execFileSync(
    "git",
    ["log", "-p", "--format=", "--no-ext-diff", `${baseSha}..HEAD`],
    { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 },
  );
  let patchFile = "git-history";
  let patchLine = 0;
  for (const line of patch.split(/\r?\n/)) {
    if (line.startsWith("+++ b/")) patchFile = line.slice(6);
    if (!line.startsWith("+") || line.startsWith("+++")) continue;
    patchLine += 1;
    inspectLine(`${patchFile} (commit)`, line.slice(1), patchLine, findings);
  }
}

if (findings.length > 0) {
  console.error("Possiveis segredos encontrados em arquivos versionados:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`Secret scan aprovado (${trackedFiles.length} arquivos versionados).`);
