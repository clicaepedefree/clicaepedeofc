# WhatsApp regression fixes: KAN-141 through KAN-149

## Scope and release gate

Nine open bugs were re-read against the Jira acceptance criteria. The product
changes are in PR #164. Do not merge automatically or equate preview acceptance
with production deployment. KAN-143 still requires a fresh distinct-sender inbound
and physical outbound receipt to close its combined end-to-end criterion.

The QA bot was explicitly reactivated on 2026-10-20. Its existing paired session
was preserved. Evolution callback and VPS worker both use the canonical production
origin; the obsolete preview bypass was removed. Billing scheduling was unchanged.

## Acceptance ledger

| Bug | Correction | Executed verification |
| --- | --- | --- |
| KAN-141 | Mount-time persisted store hydration; no generic error suppression | Four tabs, desktop/mobile, light/dark, plus no-theme-injection control; no React 418 |
| KAN-142 | Constrained widths, scrollable tabs and touch targets | Actual touch swipes at 360/390px, keyboard navigation, inner overflow measurements and desktop control |
| KAN-143 | Canonical authenticated callback, aligned worker and promotion/rollback runbook | Provider open, authenticated echo ignored without loop, lifecycle reconciliation, timer active; fresh physical exchange pending |
| KAN-144 | Transaction-scoped replay lock, dedup before mutation, monotonic contact/conversation timestamps | Real PostgreSQL rollback fixtures, older event, replay, newer event and tenant isolation |
| KAN-145 | Re-read promotional preference at dispatch, terminal suppression reason | Opt-out between enqueue/dispatch suppresses promotion; transactional/retry/tenant cases preserved |
| KAN-146 | Immutable authoritative snapshot and closed verified response grammar before persistence/send | Valid catalog response accepted; invented price/discount/internal sentinel replaced by traced safe fallback |
| KAN-147 | Omit absent/invalid optional cashback expiry | Template valid/absent/invalid dates, amounts and idempotency tests |
| KAN-148 | Portuguese access warning, unknown rather than disconnected, no unauthorized controls | Real cashier precondition, protected read denied, original role restored, assistant config unchanged; authorized control |
| KAN-149 | Responsive iFood layout without changing integration behavior | Card containment at 360/390/1440px, both themes; no OAuth/connect action performed |

## Reproducible evidence

Product revision tested: `be9f729fdd17a76ca96e05f0986e7d12cd965bde`.
Immutable preview: https://clicaepedeofc-ceap5kw0q-clicaepede-projects.vercel.app.
Later QA-harness-only commits do not change the product bundle.

- Unit suite: 592 passed, 1 existing gated integration skipped, 0 failed.
- PostgreSQL domain regression: 36 passed, 0 failed/blocked; source hash stable.
- Focused output-policy integration: 2 cases plus cleanup passed; source hash stable.
- Browser scan: 16 passed; no-theme-injection control: 1 passed.
- Geometry/touch matrix: 6 passed (three widths, both themes).
- Restricted-role flow passed, with role restoration and unchanged config verified.
- Build and GitHub/Vercel checks passed for the tested product revision.
- Independent senior review included SQL binding, availability claims, unsafe handoff
  promises and preview-auth redirect credential handling.
- Final browser repeat after the preview-auth fix: 16 passed. Chromium now owns
  redirect navigation and cookies; CDP scopes credential overrides to each hop.
  `node --test scripts/qa/preview-auth-browser.cjs` passed the synthetic two-origin
  fixture (login, restored session, URL/cookies, redirect methods, no external token).
  This starts only short-lived HTTP fixtures, not the application server.

Evidence index is stored in the operator's dated QA directory. Sanitized reports
and screenshots are attached to Jira comments. Auth state, recovery records,
headers, QR codes and authenticated traces/videos must stay private. Failed older
harness attempts are retained rather than relabeled as product failures or erased.

## Limits

No real LLM is configured. Fake model/transport integration proves domain contracts,
not model quality or physical WhatsApp receipt. The output policy intentionally
accepts exact verified full lines, not arbitrary paraphrases. It does not infer
live opening availability or delivery fees absent from its authoritative source.

Opt-out is revalidated immediately before dispatch. A preference changed concurrently
after that read cannot unsend a provider request already in flight.

Tests use fresh synthetic stores and rollback transactions. The only temporary
real-store data precondition was the controlled QA user role, restored afterward.
No logout, new QR, app-server deployment on the workstation, schema migration,
paid-service purchase or billing cutover was performed.
