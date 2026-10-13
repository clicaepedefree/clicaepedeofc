# QA In Review - 2026-10-12

Current Jira scope: KAN-81 through KAN-98 and KAN-127 through KAN-135.
27 issues and 177 original acceptance criteria. Every criterion has a concrete
matrix entry; this is not a claim that every acceptance flow passed or ran.

## Current Execution

- Real Chrome via Playwright, correct QA account, production Vercel application.
- Desktop/mobile, light/dark connection, personality, human queue and diagnostics.
- Personality save/reload/limits/unsafe instructions and restoration checked.
- Deployed read denied for a foreign tenant; anonymous requests redirect to login.
- QA membership temporarily changed to cashier for a deployed mutation denial;
  original role restored and verified. No connection command used for this test.
- Synthetic webhook contract: nine HTTP checks and one owned-fixture cleanup.
- Backend: 36 scenarios, 31 PASS and five FAIL_CONFIRMED. Real domain
  functions and current PostgreSQL; new synthetic tenants rolled back. Model and
  WhatsApp transports simulated; zero fixture stores remained.
- The supplemental retention scenario used actual tenant-scoped DELETE/metadata
  cleanup inside rollback, preserving opt-out, recent rows, pending queue and
  the other fixture tenant. It did not prove an authenticated user exclusion
  request or retention-operation audit.
- Infra: 87 criterion observations, current SSH/DNS/TLS/services/backups/timers,
  183 local Windows and 45 local Linux tests, eight skips. Local tests do not prove
  a fresh paired-session crash recovery or full host restore.
- Additional readonly DB constraints/indexes/EXPLAIN and deployed diagnostics
  compared to the application query windows (80 messages/60 conversations/80 events).
- Focused unit suite: 175 PASS, 0 FAIL, 1228 assertions across 23 files.

No LLM, purchases, new QR, reconnect, active infrastructure changes or product
fixes. Existing paired session retained. Browser flows still fail overall where
React #418 occurs, despite successful business assertions.

## Confirmed Bugs

| Issue   | Finding                                         | Evidence Scope                                                         |
| ------- | ----------------------------------------------- | ---------------------------------------------------------------------- |
| KAN-141 | React #418 hydration failure                    | Reconfirmed real browser runtime                                       |
| KAN-142 | Mobile tabs clipped without usable scrolling    | Reconfirmed real browser layout                                        |
| KAN-143 | Preview callback differs from production worker | Current configuration/runbook divergence, not proven message loss      |
| KAN-144 | Delayed/replayed messages regress contact data  | Real domain and SQL, rollback fixtures                                 |
| KAN-145 | Queued promotion still dispatches after opt-out | Real dispatcher, fake transport                                        |
| KAN-146 | Unsafe/fabricated provider output not blocked   | Real orchestrator, fake model/transport; no actual hallucination claim |
| KAN-147 | Invalid cashback expiry renders null            | Real template, synthetic canonical benefit                             |
| KAN-148 | Permission denial displayed as English server error and disconnected state | Real cashier screenshot; server authorization correctly denied |
| KAN-149 | iFood card/button containment failure | Four real Chrome desktop/mobile light/dark variants with geometry and applied-theme assertions; no connect action |

Issue URLs use https://gustavosworkspace-15436204.atlassian.net/browse/ plus the key.
Sanitized evidence uploaded to Jira; technical report screenshots are explicitly
labelled and are not screenshots of the application's UI.

## Execution Rules Learned

1. Await the connection query leaving its loading state before asserting status.
   A fixed 1.5-second delay produced an inconclusive false disconnection result.
2. Do not compare store-wide row counts while another test creates temporary
   fixtures. Count drift does not prove that internal simulation sent a message.
3. Verify the final URL when an anonymous server-action request follows a login
   redirect; response-body text alone is not a reliable denial oracle.
4. Preserve older reports when a fixture/selector is corrected; only the final
   verified attempt informs the result, not a rewritten historical PASS.
5. Database rollback tests and mock provider calls are integration evidence, not
   physical WhatsApp delivery, actual LLM quality or complete acceptance.
6. On PowerShell, pass directories to rg and select files with -g. Do not pass
   unexpanded path globs such as docs/kan134* or src/*.ts.

## Remaining Acceptance Gates

Full LLM behavior, new pairing/QR renewal, destructive recovery, fresh physical
message receipts and upstream benefit-grant/UI tracking flows are not approved by
this execution. The per-criterion ledger distinguishes partial evidence, failures
and unexecuted requirements. No whole issue was automatically moved to Done.
Private storageState, raw traces/videos and recovery instructions stay outside Git
and public Jira attachments. The external QA directory has restricted ACLs.
