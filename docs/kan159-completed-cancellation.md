# KAN159 - Completed cancellation and documentary manual review

## Approved Product Contract

- Only active store owners/managers, including every active existing manager,
  may execute the new commands. Permission: `orders.completed.cancel`.
  Existing authorization checks active membership, user/store blocks and store
  access. No new manager subtype, allowlist or internal-role bypass.
- Only `COMPLETED -> CANCELLED` is permitted. Existing transition policy stays
  terminal and unchanged; this is a separate explicit command.
- Mandatory reason is normalized through the existing audit reason policy,
  with control characters removed, empty/PII reasons rejected and a 1000-character
  limit. A UUID idempotency key is mandatory for each command.
- Lock the order by `(id, store_id)` before reading command state. One record
  per order/store; store-scoped unique cancellation and confirmation keys.
  Same key, normalized reason and actor replay without duplicate writes.
  A changed key/reason/actor conflicts; reusing a key for another order fails
  its database unique constraint and rolls back the transaction.
- Order, public submission/event, audit, manual review and `settleOrderBenefits`
  share the caller transaction. Benefit failure is fatal and rolls everything
  back. No feature flag bypass, best-effort catch or eligibility recapture.
- Preserve payment rows, amounts, change, counter association, original
  `completedAt` and original cash history. Never restock automatically.
- Any order payment row, including zero-value or PENDING-only rows, creates
  `manual_review_pending`. No rows creates `not_required`; benefits still settle.
- PREPAID is a recorded receipt designation, not verified physical settlement.
  PENDING is payment expected, not evidence of receipt. Report them separately.
  Snapshot contains only payment id/type/method/value, not customer identifiers.
- Confirmation by owner/manager requires its own reason/key and changes review
  to `documented`. It records an operator's documentary review, not proof of
  actual receipt or refund. No automatic withdrawal or payment-provider call.
  The explicit manual financial reconciliation notice remains after confirmation.

## Exact UI/API Integration

Exports from `src/features/order/api.ts`:

```ts
cancelCompletedOrder({ storeId, orderId, reason, idempotencyKey })
confirmManualRefundReview({ storeId, orderId, reason, idempotencyKey })
listOrderManualRefunds({ storeId, orderId })
```

IDs are positive integers; command keys are UUID strings. Keep the same key
and same reason for network retries of a command. Use a fresh key for the
separate confirmation. Do not regenerate a key on every retry.

Both mutations return:

```ts
{
  orderId: number,
  storeId: number,
  status: 'CANCELLED',
  manualRefundId: number,
  payments: Array<{ id: number; type: 'PREPAID' | 'PENDING'; method: string; value: string }>,
  prepaidRecordedAmount: string,       // 4 decimal places, no receipt verification
  pendingNotReceivedAmount: string,   // 4 decimal places, expected/not asserted received
  receiptVerified: false,
  reviewStatus: 'not_required' | 'manual_review_pending' | 'documented',
  confirmedAt: Date | null,
  manualFinancialReconciliationRequired: boolean,
  financialNotice: string,
  cashRefundExecuted: false,
  stockRestocked: false,
  replayed: boolean
}
```

List action requires `orders.completed.cancel` server-side, returns `[]` or one
result with additional `reason`, `confirmationReason: string | null` and
`createdAt: Date`. No raw actor IDs or idempotency keys in its DTO. It does not
assert an order exists when no matching record exists (including another store).

`listOrders(storeId)` retains `orders.manage` authorization and now returns on
each order `canCancelCompleted: boolean` from the existing validated role,
without additional authorization exceptions or round trips. This is a capability
flag, not a status predicate: UI combines it with `status === 'COMPLETED'`.
It also returns `cashbackApplied` and `amountDue` (2-decimal strings) via main's
`readWalletPaymentSnapshot(order.snapshot.totals, order.totalPrice)` helper.
Main owns this helper and its trust boundary. Client-supplied amountDue is ignored.

The persistent financial notice is:
`Necessaria conciliacao financeira manual. Este registro nao executa nem comprova reembolso e nao realiza retirada de caixa.`

## Small Main Integration Contract

- Main owns `order/db.ts`, `digital-menu/api.ts`, `ledger*`, schema barrel and UI.
  This module imports only `createOrderAuditEventOnDb` from `order/db.ts` and
  `settleOrderBenefits(cancelledOrder, tx)` from ledger; no signature changes.
- Main should export `manualRefundsTable` from `src/services/db/schema/index.ts`
  during integration. Current modules import the new schema directly and use
  select/insert/update builders, so commands do not require relational registration.
- Main owns orders page controls and public tracking polling after COMPLETED.
  This backend updates the public submission to CANCELLED and adds a public
  status event with empty payload (no private review reason).
- Following main's integration request, cancellation calls existing
  `enqueueOrderStatusWhatsappNotificationOnDb` in the same transaction with
  `fromStatus: 'COMPLETED', toStatus: 'CANCELLED', reason: null`. No review reason
  is included. Replay/confirmation do not enqueue. Existing helper owns channel,
  template and recipient policy; no direct network send is performed or tested.
- New action transaction failures become a generic public error with no raw
  error logging or attached cause. Validation/authorization remain server-side.
- Both receipt rendering calls in order/api pass `cashbackApplied` and `amountDue`
  from persisted `snapshot.totals` via main's wallet helper. Main owns optional
  receipt-template props and rendering.
- No bot sends, infrastructure, migration application,
  commits or pushes in this delivery.

## Reports And Limitations

Existing report status filters remain unchanged. An order previously included
as COMPLETED is retroactively excluded after cancellation, including its original
reporting period. That is a status-based reporting change, NOT a cash refund,
withdrawal, amended payment receipt or proof of financial reconciliation.

Migration was generated BEFORE code edits using installed Supabase CLI 2.115.0:
`node_modules/.bin/supabase.exe migration new kan159_completed_cancellation_manual_refunds`.
It creates `manual_refunds` with tenant FK, UUID actor/confirmer composite FKs
to `(user_id, store_id)` membership, unique keys, state constraints and forced
RLS, revoking PUBLIC/anon/authenticated/service_role table/sequence access.
SECURITY INVOKER history guards reject DELETE/TRUNCATE, changes to any origin
field (including payment snapshot/reason/actor/time/keys), initially confirmed
inserts, and updates other than the once-only pending-to-documented transition.
No bypass flag is introduced. Historical membership cannot be hard-deleted;
existing soft revocation/deletion remains possible. Actor role/activity is
validated by the server authorization layer, not inferred from a historic FK.
All access is through authorized server actions using the existing privileged
backend postgres connection (must have BYPASSRLS/superuser, not service_role).

Main reviews/applies migration. No database was changed by this implementation.
Local tests use a deterministic transaction adapter and mocked ledger/audit/API
authorization boundaries; they prove orchestration and caller rollback behavior,
not real PostgreSQL locking, live RLS, cash settlement or provider refunds.
Before release, main must validate migration, FK/uniqueness/RLS, concurrent retries
and rollback with actual ledger on an authorized test database, and exercise UI.
Existing cash reports may still include preserved original payment rows; manual
reconciliation is deliberately outside automatic report/payment mutation.
