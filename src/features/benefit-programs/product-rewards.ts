import 'server-only'

import { and, asc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import type { DbTransaction } from '@/services/db/types'
import {
  benefitAccountsTable as accounts,
  benefitCapturesTable as captures,
  benefitGrantsTable as grants,
  benefitProductRedemptionsTable as redemptions,
  categoriesTable as categories,
  itemOfferingsTable as offerings,
  itemsTable as items,
  type SelectOrder,
} from '@/services/db/schema'
import {
  appendBenefitEvent,
  benefitLedgerNow,
  lockBenefitAccount,
  lockBenefitOrder,
} from './ledger'
import { normalizeBenefitPhone } from './ledger-policy'
import {
  ProductRewardError,
  productRewardAvailability,
  productRewardIdentity,
  productRewardState,
  productRewardVoucherCode,
  type ProductRewardAvailability,
  type ProductRewardState,
} from './product-rewards-policy'

export { ProductRewardError } from './product-rewards-policy'

type Redemption = typeof redemptions.$inferSelect

export type ProductRewardReservation = {
  rewardId: string
  grantId: string
  redemptionId: string
  voucherCode: string
  itemId: number
  itemName: string
  quantity: 1
  unitPrice: '0.00'
  expiresAt: Date
}

export type ProductRewardView = {
  rewardId: string
  voucherCode: string
  itemId: number
  itemName: string
  state: ProductRewardState
  expiresAt: Date | null
  confirmedAt: Date | null
  availability: ProductRewardAvailability
  itemOfferingId: number | null
  canReserve: boolean
  history: {
    redemptionId: string
    orderId: number
    state: Redemption['state']
    reservedAt: Date
    completedAt: Date | null
    refundedAt: Date | null
  }[]
}

// Same-item offerings only. A required option must never be silently bypassed.
// The checkout still locks/rechecks its chosen offering and decrements stock in
// this transaction; a wallet availability read is not a stock reservation.
export async function getProductRewardCatalogAvailability(
  storeId: number,
  itemIds: number[],
  tx: DbTransaction
) {
  if (!itemIds.length)
    return new Map<
      number,
      {
        availability: ProductRewardAvailability
        itemOfferingId: number | null
      }
    >()
  const products = await tx
    .select()
    .from(items)
    .where(and(eq(items.storeId, storeId), inArray(items.id, itemIds)))
  const plain = await tx
    .select({ itemId: offerings.itemId, id: offerings.id })
    .from(offerings)
    .innerJoin(categories, eq(categories.id, offerings.categoryId))
    .where(
      and(
        inArray(offerings.itemId, itemIds),
        eq(categories.storeId, storeId),
        eq(categories.isAvailable, true),
        eq(offerings.isAvailable, true),
        sql`not exists (
        select 1 from public.item_offering_option_groups iog
        join public.option_groups og on og.id = iog.option_group_id
        where iog.item_offering_id = ${offerings.id}
          and (og.min_quantity <> 0 or og.store_id <> ${storeId})
      )`
      )
    )
    .orderBy(asc(offerings.index), asc(offerings.id))
  return new Map(
    itemIds.map(id => {
      const offering = plain.find(o => o.itemId === id)
      return [
        id,
        {
          availability: productRewardAvailability(
            products.find(p => p.id === id),
            !!offering
          ),
          itemOfferingId: offering?.id ?? null,
        },
      ]
    })
  )
}

/** Internal only: caller proves wallet ownership. Read-only apart from the
 * account advisory/row lock. Never call before acquiring an order lock in a
 * transaction that also mutates an existing order. History includes expired,
 * suspended and consumed rights; catalog loss never deletes the right.
 */
export async function listAvailableProductRewards(
  storeId: number,
  phone: string,
  tx: DbTransaction
): Promise<ProductRewardView[]> {
  const canonical = productRewardIdentity(storeId, phone)
  const account = await lockBenefitAccount(storeId, canonical, tx)
  if (!account) return []
  const issued = await tx
    .select()
    .from(grants)
    .where(
      and(
        eq(grants.accountId, account.id),
        eq(grants.storeId, storeId),
        eq(grants.kind, 'reward'),
        isNotNull(grants.rewardItemId)
      )
    )
    .orderBy(asc(grants.createdAt), asc(grants.id))
  if (!issued.length) return []
  const history = await tx
    .select()
    .from(redemptions)
    .where(
      and(
        eq(redemptions.accountId, account.id),
        eq(redemptions.storeId, storeId)
      )
    )
    .orderBy(asc(redemptions.createdAt), asc(redemptions.id))
  const availability = await getProductRewardCatalogAvailability(
    storeId,
    [...new Set(issued.map(g => g.rewardItemId!))],
    tx
  )
  const at = await benefitLedgerNow(tx)
  return issued.map(grant => {
    const used = history.filter(r => r.grantId === grant.id)
    const active = used.find(r => r.state !== 'refunded')
    const state = productRewardState(grant, active, at)
    const product = availability.get(grant.rewardItemId!)!
    return {
      rewardId: grant.id,
      voucherCode: productRewardVoucherCode(grant.id),
      itemId: grant.rewardItemId!,
      itemName: grant.rewardItemName!,
      state,
      expiresAt: grant.expiresAt,
      confirmedAt: grant.confirmedAt,
      ...product,
      canReserve: state === 'available' && product.availability === 'available',
      history: used.map(r => ({
        redemptionId: r.id,
        orderId: r.orderId,
        state: r.state,
        reservedAt: r.createdAt,
        completedAt: r.completedAt,
        refundedAt: r.refundedAt,
      })),
    }
  })
}

function reservation(row: Redemption): ProductRewardReservation {
  return {
    rewardId: row.grantId,
    grantId: row.grantId,
    redemptionId: row.id,
    voucherCode: productRewardVoucherCode(row.grantId),
    itemId: row.itemId,
    itemName: row.itemName,
    quantity: 1,
    unitPrice: '0.00',
    expiresAt: row.originalExpiresAt,
  }
}

/** Checkout: create order -> reserve -> insert one zero-price/no-options line
 * and debit inventory -> capture earnings. All in the SAME caller transaction.
 * Throw/rollback if the catalog line or stock cannot be committed. Replay only
 * returns the original reservation; it is not permission to insert a second line.
 */
export async function reserveProductRewardForOrder(
  input: { storeId: number; phone: string; orderId: number; rewardId: string },
  tx: DbTransaction
): Promise<ProductRewardReservation> {
  const canonical = productRewardIdentity(input.storeId, input.phone)
  if (
    !Number.isSafeInteger(input.orderId) ||
    input.orderId <= 0 ||
    input.orderId > 2147483647 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      input.rewardId
    )
  )
    throw new ProductRewardError()
  const rewardId = input.rewardId.toLowerCase()
  // lockBenefitOrder uses an internal diagnostic, never expose identifiers.
  const order = await lockBenefitOrder(
    { id: input.orderId, storeId: input.storeId },
    tx
  ).catch(error => {
    if (
      error instanceof Error &&
      error.message === 'Benefit order not found in store'
    )
      throw new ProductRewardError()
    throw error
  })
  if (
    order.salesChannel !== 'DIGITAL_MENU' ||
    !['TAKEOUT', 'DELIVERY'].includes(order.type) ||
    normalizeBenefitPhone(order.customerPhone) !== canonical ||
    ['CANCELLED', 'REJECTED'].includes(order.status)
  )
    throw new ProductRewardError()
  const account = await lockBenefitAccount(input.storeId, canonical, tx)
  if (!account) throw new ProductRewardError()
  const [previous] = await tx
    .select()
    .from(redemptions)
    .where(eq(redemptions.orderId, order.id))
  if (previous) {
    if (
      previous.storeId !== input.storeId ||
      previous.accountId !== account.id ||
      previous.grantId !== rewardId ||
      previous.state === 'refunded'
    )
      throw new ProductRewardError()
    return reservation(previous)
  }
  if (!['PENDING', 'CREATED'].includes(order.status))
    throw new ProductRewardError()
  const [captured] = await tx
    .select({ orderId: captures.orderId })
    .from(captures)
    .where(eq(captures.orderId, order.id))
  if (captured) throw new ProductRewardError()
  const [grant] = await tx
    .select()
    .from(grants)
    .where(
      and(
        eq(grants.id, rewardId),
        eq(grants.accountId, account.id),
        eq(grants.storeId, input.storeId),
        eq(grants.kind, 'reward'),
        isNotNull(grants.rewardItemId)
      )
    )
  const at = await benefitLedgerNow(tx)
  if (!grant || productRewardState(grant, undefined, at) !== 'available')
    throw new ProductRewardError()
  const [active] = await tx
    .select({ id: redemptions.id })
    .from(redemptions)
    .where(
      and(
        eq(redemptions.grantId, grant.id),
        sql`${redemptions.state} <> 'refunded'`
      )
    )
  if (active) throw new ProductRewardError()
  const product = (
    await getProductRewardCatalogAvailability(
      input.storeId,
      [grant.rewardItemId!],
      tx
    )
  ).get(grant.rewardItemId!)!
  if (product.availability !== 'available') throw new ProductRewardError()
  const [created] = await tx
    .insert(redemptions)
    .values({
      storeId: input.storeId,
      accountId: account.id,
      grantId: grant.id,
      orderId: order.id,
      itemId: grant.rewardItemId!,
      itemName: grant.rewardItemName!,
      originalExpiresAt: grant.expiresAt!,
      createdAt: at,
    })
    .returning()
  await appendBenefitEvent(
    account,
    `product:reserve:${order.id}`,
    'product_reserved',
    tx,
    {
      orderId: order.id,
      grantId: grant.id,
      metadata: {
        redemptionId: created.id,
        itemId: created.itemId,
        quantity: 1,
      },
    }
  )
  return reservation(created)
}

async function settleProductReward(
  order: SelectOrder,
  refund: boolean,
  tx: DbTransaction
) {
  const stored = await lockBenefitOrder(order, tx)
  if (
    refund
      ? !['CANCELLED', 'REJECTED'].includes(stored.status)
      : stored.status !== 'COMPLETED'
  )
    return
  const [used] = await tx
    .select()
    .from(redemptions)
    .where(
      and(
        eq(redemptions.orderId, stored.id),
        eq(redemptions.storeId, stored.storeId)
      )
    )
  if (!used) return
  // Use the captured reservation identity, not a subsequently edited phone.
  const [identity] = await tx
    .select()
    .from(accounts)
    .where(
      and(eq(accounts.id, used.accountId), eq(accounts.storeId, stored.storeId))
    )
  if (!identity) throw new ProductRewardError()
  const account = await lockBenefitAccount(stored.storeId, identity.phone, tx)
  if (!account) throw new ProductRewardError()
  // Read again AFTER account lock: another order may have changed the right.
  const [current] = await tx
    .select()
    .from(redemptions)
    .where(eq(redemptions.id, used.id))
  if (
    current.state === 'refunded' ||
    (!refund && current.state === 'completed')
  )
    return
  const at = await benefitLedgerNow(tx)
  await tx
    .update(redemptions)
    .set(
      refund
        ? { state: 'refunded', refundedAt: at }
        : { state: 'completed', completedAt: at }
    )
    .where(eq(redemptions.id, current.id))
  await appendBenefitEvent(
    account,
    `product:${refund ? 'refund' : 'complete'}:${stored.id}`,
    refund ? 'product_refunded' : 'product_consumed',
    tx,
    {
      orderId: stored.id,
      grantId: current.grantId,
      metadata: {
        redemptionId: current.id,
        itemId: current.itemId,
        originalExpiresAt: current.originalExpiresAt.toISOString(),
      },
    }
  )
}

export async function completeProductRewardForOrder(
  order: SelectOrder,
  tx: DbTransaction
): Promise<void> {
  await settleProductReward(order, false, tx)
}

export async function refundProductRewardForOrder(
  order: SelectOrder,
  tx: DbTransaction
): Promise<void> {
  // No money, no new grant, no validity extension, no catalog substitution.
  await settleProductReward(order, true, tx)
}
