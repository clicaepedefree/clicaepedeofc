import 'server-only'

import Decimal from 'decimal.js'
import { and, asc, desc, eq, gt, lte, ne, sql } from 'drizzle-orm'
import type { DbTransaction } from '@/services/db/types'
import {
  benefitAccountsTable as accounts,
  benefitAllocationsTable as allocations,
  benefitCapturesTable as captures,
  benefitCyclesTable as cycles,
  benefitDebitsTable as debits,
  benefitEventsTable as events,
  benefitGrantsTable as grants,
  benefitLotsTable as lots,
  benefitProductRedemptionsTable as productRedemptions,
  ordersTable,
  storeBenefitProgramVersionsTable as versions,
  type SelectOrder,
} from '@/services/db/schema'
import type { OrderBenefitNotificationGrant } from '@/features/order/benefit-notifications'
import { getBenefitModules } from './db'
import { productRewardVoucherCode } from './product-rewards-policy'
import {
  completeProductRewardForOrder,
  getProductRewardCatalogAvailability,
  refundProductRewardForOrder,
} from './product-rewards'
import {
  benefitBase,
  benefitExpiry,
  benefitMoney,
  cashbackGain,
  normalizeBenefitPhone,
  refundExpiry,
  splitBenefitCredit,
  validatedDebitAmount,
} from './ledger-policy'

type Account = typeof accounts.$inferSelect
type Grant = typeof grants.$inferSelect
type Cycle = typeof cycles.$inferSelect
type Rule = typeof versions.$inferSelect
const scope = (account: Account) => ({
  accountId: account.id,
  storeId: account.storeId,
})
const fixed = (value: Decimal.Value) => new Decimal(value).toFixed(2)

async function now(tx: DbTransaction): Promise<Date> {
  const result = await tx.execute(sql`select clock_timestamp() as instant`)
  return new Date(result[0].instant as string | Date)
}

async function lockOrder(
  order: Pick<SelectOrder, 'id' | 'storeId'>,
  tx: DbTransaction
) {
  const [stored] = await tx
    .select()
    .from(ordersTable)
    .where(
      and(eq(ordersTable.id, order.id), eq(ordersTable.storeId, order.storeId))
    )
    .for('update')
  if (!stored) throw new Error('Benefit order not found in store')
  return stored
}

async function lockAccount(
  storeId: number,
  phone: string,
  tx: DbTransaction,
  create = false
) {
  // Serializes even the first two orders, before an account row exists. Hash
  // collisions only over-serialize; the unique composite identity remains exact.
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`benefits:${storeId}:${phone}`}, 0))`
  )
  if (create)
    await tx.insert(accounts).values({ storeId, phone }).onConflictDoNothing()
  const [account] = await tx
    .select()
    .from(accounts)
    .where(and(eq(accounts.storeId, storeId), eq(accounts.phone, phone)))
    .for('update')
  return account
}

async function capturedAccount(order: SelectOrder, tx: DbTransaction) {
  const [captured] = await tx
    .select()
    .from(captures)
    .where(
      and(eq(captures.orderId, order.id), eq(captures.storeId, order.storeId))
    )
  if (!captured) return null
  const [identity] = await tx
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.id, captured.accountId),
        eq(accounts.storeId, order.storeId)
      )
    )
  if (!identity) throw new Error('Missing benefit account')
  return (await lockAccount(identity.storeId, identity.phone, tx))!
}

async function event(
  account: Account,
  eventKey: string,
  type: string,
  tx: DbTransaction,
  data: Partial<
    Pick<
      typeof events.$inferInsert,
      'orderId' | 'grantId' | 'lotId' | 'amount' | 'debtDelta' | 'metadata'
    >
  > = {}
) {
  await tx.insert(events).values({ ...scope(account), eventKey, type, ...data })
}

async function hasEvent(account: Account, key: string, tx: DbTransaction) {
  const [found] = await tx
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.accountId, account.id), eq(events.eventKey, key)))
  return !!found
}

async function setDebt(account: Account, debt: string, tx: DbTransaction) {
  await tx
    .update(accounts)
    .set({ adjustmentDebt: debt })
    .where(eq(accounts.id, account.id))
  account.adjustmentDebt = debt
}

async function expireLots(account: Account, at: Date, tx: DbTransaction) {
  const expired = await tx
    .select()
    .from(lots)
    .where(
      and(
        eq(lots.accountId, account.id),
        lte(lots.expiresAt, at),
        gt(lots.remainingAmount, '0')
      )
    )
  for (const lot of expired) {
    await tx
      .update(lots)
      .set({
        remainingAmount: '0.00',
        expiredAmount: fixed(
          new Decimal(lot.expiredAmount).plus(lot.remainingAmount)
        ),
      })
      .where(eq(lots.id, lot.id))
    await event(account, `expire:${lot.id}`, 'expiry', tx, {
      lotId: lot.id,
      grantId: lot.grantId,
      amount: lot.remainingAmount,
    })
  }
}

async function credit(
  account: Account,
  amount: string,
  expiresAt: Date,
  sourceKey: string,
  grantId: string | null,
  tx: DbTransaction,
  orderId: number,
  options: { offsetDebt?: boolean; frozen?: boolean } = {}
) {
  if (new Decimal(amount).isZero()) return null
  const offsetDebt = options.offsetDebt !== false && !options.frozen
  const split = splitBenefitCredit(
    amount,
    offsetDebt ? account.adjustmentDebt : '0.00'
  )
  if (offsetDebt) await setDebt(account, split.debt, tx)
  const [lot] = await tx
    .insert(lots)
    .values({
      ...scope(account),
      grantId,
      sourceKey,
      originalAmount: amount,
      remainingAmount: split.available,
      offsetAmount: split.offset,
      frozen: options.frozen ?? false,
      expiresAt,
    })
    .returning()
  await event(account, `credit:${sourceKey}`, 'credit', tx, {
    orderId,
    grantId,
    lotId: lot.id,
    amount: split.available,
    debtDelta: fixed(new Decimal(split.offset).negated()),
    metadata: { grossAmount: amount },
  })
  return lot
}

async function rule(
  storeId: number,
  version: number,
  tx: DbTransaction
): Promise<Rule> {
  const [found] = await tx
    .select()
    .from(versions)
    .where(and(eq(versions.storeId, storeId), eq(versions.version, version)))
  if (!found) throw new Error('Missing pinned benefit rule')
  return found
}

async function cycleParticipants(cycleId: string, tx: DbTransaction) {
  return tx
    .select()
    .from(grants)
    .where(
      and(
        eq(grants.cycleId, cycleId),
        eq(grants.kind, 'loyalty'),
        ne(grants.state, 'reversed')
      )
    )
}

async function reserveCycle(
  account: Account,
  current: Rule,
  base: string,
  tx: DbTransaction
): Promise<{ cycle: Cycle; pinned: Rule } | null> {
  // Oldest non-full eligible cycle wins, including already rewarded cycles with
  // a cancelled participant. Pending reservations count towards N slots, not N
  // confirmations. New rules never migrate or abandon an existing cycle.
  const existing = await tx
    .select()
    .from(cycles)
    .where(eq(cycles.accountId, account.id))
    .orderBy(asc(cycles.createdAt), asc(cycles.id))
  for (const cycle of existing) {
    const pinned = await rule(account.storeId, cycle.ruleVersion, tx)
    if (new Decimal(base).lt(pinned.loyaltyMinimumOrderAmount!)) continue
    if (
      (await cycleParticipants(cycle.id, tx)).length <
      pinned.loyaltyRequiredOrders!
    )
      return { cycle, pinned }
  }
  if (
    !current.loyaltyEnabled ||
    new Decimal(base).lt(current.loyaltyMinimumOrderAmount!)
  )
    return null
  const [cycle] = await tx
    .insert(cycles)
    .values({ ...scope(account), ruleVersion: current.version })
    .returning()
  return { cycle, pinned: current }
}

/** Creation-only, caller must opt in from the authoritative digital-menu flow.
 * No data under order.snapshot participates in configuration or money authority.
 * All helpers use the caller's transaction and never start/commit their own.
 */
export async function captureOrderBenefits(
  order: SelectOrder,
  tx: DbTransaction
): Promise<void> {
  const stored = await lockOrder(order, tx)
  if (
    stored.salesChannel !== 'DIGITAL_MENU' ||
    !['TAKEOUT', 'DELIVERY'].includes(stored.type) ||
    ['CANCELLED', 'REJECTED'].includes(stored.status)
  )
    return
  const phone = normalizeBenefitPhone(stored.customerPhone)
  if (!phone) return
  const [already] = await tx
    .select()
    .from(captures)
    .where(eq(captures.orderId, stored.id))
  if (already) return
  const modules = await getBenefitModules(stored.storeId, tx)
  if (!modules.cashback && !modules.loyalty) return
  const [current] = await tx
    .select()
    .from(versions)
    .where(eq(versions.storeId, stored.storeId))
    .orderBy(desc(versions.version))
    .limit(1)
  if (!current) return
  const account = (await lockAccount(stored.storeId, phone, tx, true))!
  const [debit] = await tx
    .select()
    .from(debits)
    .where(eq(debits.orderId, stored.id))
  if (
    debit &&
    (debit.accountId !== account.id || debit.storeId !== account.storeId)
  )
    throw new Error('Benefit debit belongs to another account')
  // totalPrice is AFTER server promotions and BEFORE wallet. KAN157 must debit
  // then capture in the same creation transaction, never supply client benefits.
  const spent = debit?.amount ?? '0.00'
  const base = benefitBase(stored.totalPrice, stored.deliveryFee, spent)
  // Redeeming a free product is not another purchase. Even N=1/minimum=0
  // cannot turn a zero-paid reward-only order into an endless reward cycle.
  const [productRedemption] = new Decimal(base).isZero()
    ? await tx
        .select({ id: productRedemptions.id })
        .from(productRedemptions)
        .where(
          and(
            eq(productRedemptions.orderId, stored.id),
            eq(productRedemptions.accountId, account.id),
            eq(productRedemptions.storeId, stored.storeId)
          )
        )
    : []
  const loyaltyEnabled =
    modules.loyalty && current.loyaltyEnabled && !productRedemption
  await tx.insert(captures).values({
    orderId: stored.id,
    ...scope(account),
    ruleVersion: current.version,
    baseAmount: base,
    cashbackSpent: spent,
    cashbackEnabled: modules.cashback && current.cashbackEnabled,
    loyaltyEnabled,
  })
  await event(account, `capture:${stored.id}`, 'capture', tx, {
    orderId: stored.id,
    metadata: {
      ruleVersion: current.version,
      baseAmount: base,
      cashbackSpent: spent,
    },
  })
  if (
    modules.cashback &&
    current.cashbackEnabled &&
    new Decimal(base).gte(current.cashbackMinimumOrderAmount!)
  ) {
    const amount = cashbackGain(base, current.cashbackPercentage!)
    if (new Decimal(amount).gt(0)) {
      const [grant] = await tx
        .insert(grants)
        .values({
          ...scope(account),
          orderId: stored.id,
          ruleVersion: current.version,
          kind: 'cashback',
          amount,
          validityDays: current.cashbackExpiresAfterDays!,
        })
        .returning()
      await event(account, `pending:${grant.id}`, 'pending', tx, {
        orderId: stored.id,
        grantId: grant.id,
        amount,
      })
    }
  }
  if (loyaltyEnabled) {
    const reservation = await reserveCycle(account, current, base, tx)
    if (reservation) {
      const [grant] = await tx
        .insert(grants)
        .values({
          ...scope(account),
          orderId: stored.id,
          kind: 'loyalty',
          ruleVersion: reservation.pinned.version,
          cycleId: reservation.cycle.id,
          validityDays: reservation.pinned.loyaltyRewardExpiresAfterDays!,
        })
        .returning()
      await event(account, `pending:${grant.id}`, 'pending', tx, {
        orderId: stored.id,
        grantId: grant.id,
        metadata: { cycleId: reservation.cycle.id },
      })
    }
  }
}

async function reconcileCycles(
  account: Account,
  order: SelectOrder,
  at: Date,
  tx: DbTransaction
) {
  const existing = await tx
    .select()
    .from(cycles)
    .where(eq(cycles.accountId, account.id))
    .orderBy(asc(cycles.createdAt), asc(cycles.id))
  let missingEarlierReward = false
  for (const cycle of existing) {
    const pinned = await rule(account.storeId, cycle.ruleVersion, tx)
    const participants = await cycleParticipants(cycle.id, tx)
    const full =
      participants.filter(p => p.state === 'confirmed').length ===
      pinned.loyaltyRequiredOrders
    const [reward] = await tx
      .select()
      .from(grants)
      .where(and(eq(grants.cycleId, cycle.id), eq(grants.kind, 'reward')))
    if (reward) {
      // A reward is issued once per cycle. Missing confirmed participation freezes
      // its unconsumed remainder; consumption is never charged as monetary debt.
      const enabled = full
      if ((reward.state === 'confirmed') !== enabled) {
        await tx
          .update(grants)
          .set({ state: enabled ? 'confirmed' : 'pending' })
          .where(eq(grants.id, reward.id))
        await tx
          .update(lots)
          .set({ frozen: !enabled })
          .where(eq(lots.grantId, reward.id))
        await event(
          account,
          `cycle:${cycle.id}:${order.id}:${order.status}`,
          enabled ? 'reward_restored' : 'reward_suspended',
          tx,
          {
            orderId: order.id,
            grantId: reward.id,
            metadata: { cycleId: cycle.id },
          }
        )
      }
      if (!full) missingEarlierReward = true
      continue
    }
    if (!full || missingEarlierReward || order.status !== 'COMPLETED') continue
    const expiresAt = benefitExpiry(at, pinned.loyaltyRewardExpiresAfterDays!)
    const [created] = await tx
      .insert(grants)
      .values({
        ...scope(account),
        orderId: order.id,
        kind: 'reward',
        cycleId: cycle.id,
        ruleVersion: pinned.version,
        state: 'confirmed',
        amount:
          pinned.loyaltyRewardType === 'cashback'
            ? pinned.loyaltyRewardAmount!
            : '0.00',
        rewardItemId: pinned.loyaltyRewardItemId,
        rewardItemName: pinned.loyaltyRewardItemName,
        validityDays: pinned.loyaltyRewardExpiresAfterDays!,
        confirmedAt: at,
        expiresAt,
      })
      .returning()
    await event(account, `reward:${cycle.id}`, 'reward', tx, {
      orderId: order.id,
      grantId: created.id,
      amount: created.amount,
      metadata: {
        cycleId: cycle.id,
        ruleVersion: pinned.version,
        rewardItemId: created.rewardItemId,
      },
    })
    await credit(
      account,
      created.amount,
      expiresAt,
      `grant:${created.id}`,
      created.id,
      tx,
      order.id
    )
  }
}

async function reverseCashback(
  account: Account,
  grant: Grant,
  tx: DbTransaction
) {
  const sourceLots = await tx
    .select()
    .from(lots)
    .where(eq(lots.grantId, grant.id))
  for (const lot of sourceLots) {
    if (lot.reversed) continue
    const debt = new Decimal(lot.spentAmount).plus(lot.offsetAmount)
    await setDebt(
      account,
      fixed(new Decimal(account.adjustmentDebt).plus(debt)),
      tx
    )
    await tx
      .update(lots)
      .set({
        remainingAmount: '0.00',
        reversed: true,
        revokedAmount: fixed(
          new Decimal(lot.revokedAmount).plus(lot.remainingAmount)
        ),
      })
      .where(eq(lots.id, lot.id))
    await event(account, `reverse:${lot.id}`, 'reversal', tx, {
      orderId: grant.orderId,
      grantId: grant.id,
      lotId: lot.id,
      amount: lot.remainingAmount,
      debtDelta: fixed(debt),
    })
  }
}

export async function settleOrderBenefits(
  order: SelectOrder,
  tx: DbTransaction
): Promise<void> {
  const stored = await lockOrder(order, tx)
  if (!['COMPLETED', 'CANCELLED', 'REJECTED'].includes(stored.status)) return
  if (stored.status === 'COMPLETED')
    await completeProductRewardForOrder(stored, tx)
  else await refundProductRewardForOrder(stored, tx)
  const account = await capturedAccount(stored, tx)
  if (!account) {
    // No backfill. A future checkout debit may exist without an earning capture.
    if (stored.status !== 'COMPLETED')
      await refundOrderBenefitBalance(stored, tx)
    return
  }
  const at = await now(tx)
  await expireLots(account, at, tx)
  const captured = await tx
    .select()
    .from(grants)
    .where(and(eq(grants.orderId, stored.id), ne(grants.kind, 'reward')))
  for (const grant of captured) {
    if (stored.status === 'COMPLETED') {
      if (grant.state !== 'pending') continue
      const expiresAt = benefitExpiry(at, grant.validityDays)
      await tx
        .update(grants)
        .set({ state: 'confirmed', confirmedAt: at, expiresAt })
        .where(eq(grants.id, grant.id))
      await event(account, `confirm:${grant.id}`, 'confirmation', tx, {
        orderId: stored.id,
        grantId: grant.id,
        amount: grant.amount,
      })
      if (grant.kind === 'cashback')
        await credit(
          account,
          grant.amount,
          expiresAt,
          `grant:${grant.id}`,
          grant.id,
          tx,
          stored.id
        )
    } else {
      if (grant.state === 'reversed') continue
      if (grant.kind === 'cashback' && grant.state === 'confirmed')
        await reverseCashback(account, grant, tx)
      await tx
        .update(grants)
        .set({ state: 'reversed' })
        .where(eq(grants.id, grant.id))
      await event(account, `cancel:${grant.id}`, 'cancellation', tx, {
        orderId: stored.id,
        grantId: grant.id,
        amount: grant.amount,
      })
    }
  }
  await reconcileCycles(account, stored, at, tx)
  if (stored.status !== 'COMPLETED') await refundOrderBenefitBalance(stored, tx)
}

// Internal transaction primitives shared with product rewards. Mutating callers
// must acquire the order lock before the account lock, including on replay.
export {
  now as benefitLedgerNow,
  lockOrder as lockBenefitOrder,
  lockAccount as lockBenefitAccount,
  event as appendBenefitEvent,
}

async function summary(account: Account, at: Date, tx: DbTransaction) {
  await expireLots(account, at, tx)
  const live = await tx
    .select()
    .from(lots)
    .where(
      and(
        eq(lots.accountId, account.id),
        gt(lots.expiresAt, at),
        eq(lots.frozen, false),
        eq(lots.reversed, false)
      )
    )
  const pending = await tx
    .select()
    .from(grants)
    .where(
      and(
        eq(grants.accountId, account.id),
        eq(grants.kind, 'cashback'),
        eq(grants.state, 'pending')
      )
    )
  const participations = await tx
    .select()
    .from(grants)
    .where(
      and(
        eq(grants.accountId, account.id),
        eq(grants.kind, 'loyalty'),
        ne(grants.state, 'reversed')
      )
    )
  return {
    availableAmount: fixed(Decimal.sum(0, ...live.map(l => l.remainingAmount))),
    pendingAmount: fixed(Decimal.sum(0, ...pending.map(g => g.amount))),
    adjustmentDebt: account.adjustmentDebt,
    confirmedParticipations: participations.filter(g => g.state === 'confirmed')
      .length,
    pendingParticipations: participations.filter(g => g.state === 'pending')
      .length,
  }
}

export async function getBenefitAccountSummary(
  storeId: number,
  phone: string,
  tx: DbTransaction
) {
  const canonical = normalizeBenefitPhone(phone)
  const account = canonical ? await lockAccount(storeId, canonical, tx) : null
  if (!account)
    return {
      availableAmount: '0.00',
      pendingAmount: '0.00',
      adjustmentDebt: '0.00',
      confirmedParticipations: 0,
      pendingParticipations: 0,
    }
  return summary(account, await now(tx), tx)
}

export async function getOrderBenefitNotificationData(
  orderId: number,
  storeId: number,
  tx: DbTransaction
): Promise<{
  customerPhone: string
  grants: OrderBenefitNotificationGrant[]
} | null> {
  const stored = await lockOrder({ id: orderId, storeId }, tx)
  if (stored.status !== 'COMPLETED') return null
  const account = await capturedAccount(stored, tx)
  if (!account) return null
  const at = await now(tx)
  const balance = await summary(account, at, tx)
  const confirmed = await tx
    .select()
    .from(grants)
    .where(and(eq(grants.orderId, orderId), eq(grants.state, 'confirmed')))
  const result: OrderBenefitNotificationGrant[] = []
  for (const grant of confirmed) {
    if (
      grant.kind === 'cashback' ||
      (grant.kind === 'reward' && !grant.rewardItemId)
    ) {
      const issued = await tx
        .select()
        .from(lots)
        .where(
          and(
            eq(lots.grantId, grant.id),
            eq(lots.sourceKey, `grant:${grant.id}`)
          )
        )
      // Notify only the net real credit, never money absorbed by adjustment debt.
      const net = Decimal.sum(
        0,
        ...issued.map(l => new Decimal(l.originalAmount).minus(l.offsetAmount))
      )
      if (net.gt(0) && grant.expiresAt && grant.expiresAt > at)
        result.push({
          type: 'cashback',
          grantId: grant.id,
          earnedAmount: net.toFixed(2),
          balanceAmount: balance.availableAmount,
          expiresAt: grant.expiresAt.toISOString(),
        })
    } else if (grant.kind === 'loyalty') {
      const participants = await cycleParticipants(grant.cycleId!, tx)
      const pinned = await rule(storeId, grant.ruleVersion, tx)
      result.push({
        type: 'loyalty',
        grantId: grant.id,
        earnedPoints: 1,
        balancePoints: participants.filter(p => p.state === 'confirmed').length,
        ruleDescription: `${pinned.loyaltyRequiredOrders} pedidos`,
        nextRewardDescription: null,
      })
    } else if (grant.rewardItemId && grant.expiresAt && grant.expiresAt > at) {
      const availability = await getProductRewardCatalogAvailability(
        storeId,
        [grant.rewardItemId],
        tx
      )
      if (availability.get(grant.rewardItemId)?.availability !== 'available')
        continue
      result.push({
        type: 'product_reward',
        grantId: grant.id,
        productName: grant.rewardItemName!,
        voucherCode: productRewardVoucherCode(grant.id),
        expiresAt: grant.expiresAt.toISOString(),
      })
    }
  }
  return result.length ? { customerPhone: account.phone, grants: result } : null
}

/** Server-only KAN157 primitive, NOT customer authorization. Caller must prove
 * possession/authorization and supply a server-validated amount. No endpoint.
 * Must run BEFORE capture in the same creation transaction. Stored totalPrice
 * is AFTER promotions but BEFORE wallet; capture subtracts this persisted debit.
 * This does not implement checkout totals or redemption UI.
 */
export async function debitOrderBenefitBalance(
  order: SelectOrder,
  phone: string,
  amount: string,
  tx: DbTransaction
): Promise<void> {
  const requested = validatedDebitAmount(amount)
  const stored = await lockOrder(order, tx)
  const canonical = normalizeBenefitPhone(phone)
  if (
    !canonical ||
    normalizeBenefitPhone(stored.customerPhone) !== canonical ||
    stored.salesChannel !== 'DIGITAL_MENU' ||
    !['TAKEOUT', 'DELIVERY'].includes(stored.type)
  )
    throw new Error('Invalid benefit debit account')
  const account = await lockAccount(stored.storeId, canonical, tx)
  if (!account) throw new Error('Insufficient benefit balance')
  const [capture] = await tx
    .select()
    .from(captures)
    .where(eq(captures.orderId, stored.id))
  if (capture && capture.accountId !== account.id)
    throw new Error('Benefit order belongs to another account')
  const key = `debit:${stored.id}`
  const [previous] = await tx
    .select()
    .from(debits)
    .where(eq(debits.orderId, stored.id))
  if (previous) {
    if (
      previous.accountId !== account.id ||
      !new Decimal(previous.amount).eq(requested)
    )
      throw new Error('Benefit debit idempotency conflict')
    return
  }
  if (capture) throw new Error('Benefit debit must precede immutable capture')
  if (['COMPLETED', 'CANCELLED', 'REJECTED'].includes(stored.status))
    throw new Error('Cannot debit terminal order')
  if (new Decimal(requested).gt(benefitMoney(stored.totalPrice)))
    throw new Error('Benefit debit exceeds server order total')
  const at = await now(tx)
  const balance = await summary(account, at, tx)
  if (new Decimal(balance.availableAmount).lt(requested))
    throw new Error('Insufficient benefit balance')
  await tx
    .insert(debits)
    .values({ ...scope(account), orderId: stored.id, amount: requested })
  const available = await tx
    .select()
    .from(lots)
    .where(
      and(
        eq(lots.accountId, account.id),
        gt(lots.expiresAt, at),
        eq(lots.frozen, false),
        eq(lots.reversed, false),
        gt(lots.remainingAmount, '0')
      )
    )
    .orderBy(asc(lots.expiresAt), asc(lots.createdAt), asc(lots.id))
  let left = new Decimal(requested)
  for (const lot of available) {
    if (left.isZero()) break
    const used = Decimal.min(left, lot.remainingAmount)
    await tx.insert(allocations).values({
      ...scope(account),
      orderId: stored.id,
      lotId: lot.id,
      amount: used.toFixed(2),
    })
    await tx
      .update(lots)
      .set({
        remainingAmount: fixed(new Decimal(lot.remainingAmount).minus(used)),
        spentAmount: fixed(new Decimal(lot.spentAmount).plus(used)),
      })
      .where(eq(lots.id, lot.id))
    left = left.minus(used)
  }
  await event(account, key, 'debit', tx, {
    orderId: stored.id,
    amount: requested,
  })
}

export async function refundOrderBenefitBalance(
  order: SelectOrder,
  tx: DbTransaction
): Promise<void> {
  const stored = await lockOrder(order, tx)
  if (!['CANCELLED', 'REJECTED'].includes(stored.status))
    throw new Error('Benefit refund requires cancelled/rejected order')
  const used = await tx
    .select()
    .from(allocations)
    .where(
      and(
        eq(allocations.orderId, stored.id),
        eq(allocations.storeId, stored.storeId)
      )
    )
  if (!used.length) return
  const [identity] = await tx
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.id, used[0].accountId),
        eq(accounts.storeId, stored.storeId)
      )
    )
  if (!identity) throw new Error('Missing benefit refund account')
  const account = (await lockAccount(identity.storeId, identity.phone, tx))!
  const at = await now(tx)
  await expireLots(account, at, tx)
  for (const allocation of used) {
    if (allocation.accountId !== account.id)
      throw new Error('Mixed benefit allocation accounts')
    const key = `refund:${allocation.id}`
    if (await hasEvent(account, key, tx)) continue
    const [source] = await tx
      .select()
      .from(lots)
      .where(eq(lots.id, allocation.lotId))
    await tx
      .update(lots)
      .set({
        spentAmount: fixed(
          new Decimal(source.spentAmount).minus(allocation.amount)
        ),
        refundedAmount: fixed(
          new Decimal(source.refundedAmount).plus(allocation.amount)
        ),
      })
      .where(eq(lots.id, source.id))
    const restored = await credit(
      account,
      allocation.amount,
      refundExpiry(source.expiresAt, at),
      key,
      source.reversed ? null : source.grantId,
      tx,
      stored.id,
      { offsetDebt: false, frozen: source.frozen }
    )
    await event(account, key, 'refund', tx, {
      orderId: stored.id,
      lotId: source.id,
      amount: allocation.amount,
      metadata: { allocationId: allocation.id, restoredLotId: restored?.id },
    })
  }
}
