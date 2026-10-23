# Node security maintenance - 22 October 2026

Tracking: KAN-150 and PR #165. The user authorized updates after the official
October 21 Node release, including CVE-2026-111497. This is not a general audit
or proof that exploitation has or has not occurred.

## Scope and observed evidence

| Component | Before | Verified result |
| --- | --- | --- |
| Windows project runtime in D:/nodejs | 24.15.0 | 24.22.1, official SHA-256 and valid OpenJS Authenticode signature |
| EasyPanel | Node 22.23.3 | Official vendor image running Node 22.23.4; local HTTP 200 |
| Evolution application 2.3.7 | Node 24.11.1 | Node 24.22.1 live, healthy; sharp operation, Prisma load and exact-pin recovery passed; provider remains paired |
| Vercel project | Managed 24.x | Real preview Function still reported 24.21.0; patch NOT established by settings/build |

Windows keeps its previous executable as a recovery artifact; npm was not changed.
Already-running processes retain their loaded runtime until restarted. Restart the
development tools/terminals after this task; do not kill unrelated user processes.
Bundled Codex/browser runtimes are vendor-managed and were not manually replaced.

EasyPanel persisted configuration was backed up before its controlled restart.
The encrypted offsite Evolution backup succeeded before image changes. No database
engine, Redis, Traefik, schema, subscription, DNS or application feature was upgraded.

## Vercel verification must be runtime-specific

An authorized redeploy reuses production Git revision
`8a6a366d6bf9298fc8be002f2067b861617402d2`, not the unmerged security branch:
`dpl_DedGBcrMrM3kGhQqYhMWGzznhHfm`. It reached READY; login and the public QA
menu returned HTTP 200. That verifies availability, not the runtime patch.

Preview `dpl_5uxgmvsi2Sv98moCmWRpa9Zw11d4`, Git revision `4f311af`, produced
this private Function startup event after an actual GET /login in GRU1:

```json
{"event":"node_runtime_security","version":"v24.21.0","october2026Patch":"update-required"}
```

It does not prove the version of production, other regions or every warm instance.
The vendor controls managed minor/patch rollout. WAF protection does not replace
patching, particularly when a Function fetches attacker-controlled Brotli responses.
The supported Node 22 line was also checked only in preview: deployment
`dpl_3CJWFwpEJ4uU2e7pWg4e3QE5aAY8`, revision `1cecfec`, GET /login in IAD1
reported `v22.23.2/update-required`. This was not promoted. The final branch keeps
Node 24 and its corrected minimum, matching the production major rather than
introducing an ineffective downgrade. The two observed Functions need a vendor
runtime patch; no claim is made that every region or production uses those builds.
Do not move KAN-150 to Done based on a green build or an engines range.

The new instrumentation logs only runtime version and a tested patch classification.
It adds no public endpoint, no secrets and no request logging. It is informational,
not an availability gate. Unknown versions are not certified. The policy covers
this specific October release, not all future security advisories.

## Tests and preservation

- 607 unit tests passed; 1 existing explicitly gated integration skipped; 0 failed.
- Local production build with the patched Windows Node passed.
- Initial CI tests/build and backup/recovery job passed.
- Image archive recovery from empty isolated Docker storage passed, including
  loading the saved registry runtime without download. Copies and hashes are
  stored off the VPS in the private dated D: directory. Temporary daemons and
  registry containers were stopped; no public registry was introduced.
- Root-owned canonical stack and restore validator were installed after the image
  proof. Restore policy suite: 56 tests, 1 existing skip, no failures.
- Live Evolution cutover passed: Node 24.22.1, healthy container, provider open,
  webhook disabled. A fresh encrypted offsite backup after cutover succeeded;
  the subsequent verification confirmed the patched runtime and paired session.
- Final image artifacts, canonical pin recovery and live pause checks are recorded
  in `security-node-20261022-evolution-image.md` and the dated private evidence.
- WhatsApp must remain paused: webhook disabled, worker disabled, timer inactive,
  number inactive, assistant/session paused, paired provider open. No new QR,
  logout, test message or automatic resume is authorized by this maintenance.

## Official sources

- https://nodejs.org/en/blog/vulnerability/october-2026-security-releases
- https://nodejs.org/en/blog/release/v24.22.1
- https://vercel.com/ja/kb/bulletin/node-js-security-advisory
- https://vercel.com/docs/functions/runtimes/node-js/node-js-versions
