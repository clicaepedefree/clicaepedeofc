import 'server-only'

import { db } from '@/services/db'
import {
  billingModulesTable,
  billingPlanModulesTable,
  itemsTable,
  storeModuleEntitlementsTable,
  storeSubscriptionsTable,
  storesTable,
  storeBenefitProgramVersionsTable as versions,
  type SelectStoreBenefitProgramVersion,
} from '@/services/db/schema'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { getEffectiveStoreModules } from '@/features/billing/module-entitlements-policy'
import {
  assertBenefitModules,
  BenefitProgramsError,
  benefitProgramsInputSchema,
  unconfiguredBenefitPrograms,
  type BenefitProgramsInput,
} from './policy'

export type BenefitProgramsTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0]
type Transaction = BenefitProgramsTransaction
type Reader = Pick<Transaction, 'select'>

export async function getBenefitModules(storeId: number, reader: Reader = db) {
  // currentPeriodEnd is a recurring billing boundary, not access expiration:
  // active/past_due renewals must not lose modules before billing reconciliation.
  // startsAt/canceledAt and the existing effective-module validity policy apply.
  const planModules = await reader
    .select({
      code: billingModulesTable.code,
      status: billingPlanModulesTable.status,
      startsAt: billingPlanModulesTable.startsAt,
      endsAt: billingPlanModulesTable.endsAt,
    })
    .from(storeSubscriptionsTable)
    .innerJoin(
      billingPlanModulesTable,
      eq(billingPlanModulesTable.planId, storeSubscriptionsTable.planId)
    )
    .innerJoin(
      billingModulesTable,
      eq(billingModulesTable.id, billingPlanModulesTable.moduleId)
    )
    .where(
      and(
        eq(storeSubscriptionsTable.storeId, storeId),
        inArray(storeSubscriptionsTable.status, [
          'trialing',
          'active',
          'past_due',
        ]),
        sql`${storeSubscriptionsTable.startsAt} <= now()`,
        sql`(${storeSubscriptionsTable.canceledAt} is null or ${storeSubscriptionsTable.canceledAt} > now())`,
        eq(billingModulesTable.status, 'active')
      )
    )
  const storeEntitlements = await reader
    .select({
      code: billingModulesTable.code,
      origin: storeModuleEntitlementsTable.origin,
      status: storeModuleEntitlementsTable.status,
      isAdditional: storeModuleEntitlementsTable.isAdditional,
      startsAt: storeModuleEntitlementsTable.startsAt,
      endsAt: storeModuleEntitlementsTable.endsAt,
      revokedAt: storeModuleEntitlementsTable.revokedAt,
    })
    .from(storeModuleEntitlementsTable)
    .innerJoin(
      billingModulesTable,
      eq(billingModulesTable.id, storeModuleEntitlementsTable.moduleId)
    )
    .where(
      and(
        eq(storeModuleEntitlementsTable.storeId, storeId),
        eq(billingModulesTable.status, 'active')
      )
    )
  const codes = new Set(
    getEffectiveStoreModules({ planModules, storeEntitlements }).map(
      module => module.code
    )
  )
  return { cashback: codes.has('cashback'), loyalty: codes.has('loyalty') }
}

function configuration(row?: SelectStoreBenefitProgramVersion) {
  if (!row)
    return { version: 0, ...unconfiguredBenefitPrograms(), updatedAt: null }
  return {
    version: row.version,
    cashback: {
      enabled: row.cashbackEnabled,
      percentage: row.cashbackPercentage,
      expiresAfterDays: row.cashbackExpiresAfterDays,
      minimumOrderAmount: row.cashbackMinimumOrderAmount,
    },
    loyalty: {
      enabled: row.loyaltyEnabled,
      requiredOrders: row.loyaltyRequiredOrders,
      minimumOrderAmount: row.loyaltyMinimumOrderAmount,
      rewardType: row.loyaltyRewardType,
      rewardAmount: row.loyaltyRewardAmount,
      rewardItemId: row.loyaltyRewardItemId,
      rewardExpiresAfterDays: row.loyaltyRewardExpiresAfterDays,
    },
    updatedAt: row.createdAt.toISOString(),
  }
}

export async function readBenefitProgramsConfiguration(storeId: number) {
  const [row] = await db
    .select()
    .from(versions)
    .where(eq(versions.storeId, storeId))
    .orderBy(desc(versions.version))
    .limit(1)
  const modules = await getBenefitModules(storeId)
  const products = await db
    .select({ id: itemsTable.id, name: itemsTable.name })
    .from(itemsTable)
    .where(eq(itemsTable.storeId, storeId))
    .orderBy(asc(itemsTable.name), asc(itemsTable.id))
  return { ...configuration(row), modules, products }
}

// Optional transaction supports external PostgreSQL QA with rollback, without
// disabling immutable-history triggers or committing disposable fixtures.
export async function appendBenefitProgramsConfiguration(
  storeId: number,
  actorUserId: string,
  input: BenefitProgramsInput,
  transaction?: BenefitProgramsTransaction
) {
  const parsed = benefitProgramsInputSchema.safeParse(input)
  if (!parsed.success)
    throw new BenefitProgramsError(
      'Configuracao invalida. Confira os campos dos programas.'
    )
  const { cashback, loyalty, expectedVersion } = parsed.data
  const append = async (tx: Transaction) => {
    // The store exists before version 1: lock it, not the possibly absent latest row.
    const [store] = await tx
      .select({ id: storesTable.id })
      .from(storesTable)
      .where(eq(storesTable.id, storeId))
      .for('update')
    if (!store) throw new BenefitProgramsError('Loja indisponivel.')
    const [current] = await tx
      .select({ version: versions.version })
      .from(versions)
      .where(eq(versions.storeId, storeId))
      .orderBy(desc(versions.version))
      .limit(1)
    if ((current?.version ?? 0) !== expectedVersion) {
      throw new BenefitProgramsError(
        'A configuracao foi alterada por outra pessoa. Recarregue e tente novamente.'
      )
    }
    assertBenefitModules(parsed.data, await getBenefitModules(storeId, tx))
    if (loyalty.rewardItemId !== null) {
      const [item] = await tx
        .select({ id: itemsTable.id })
        .from(itemsTable)
        .where(
          and(
            eq(itemsTable.id, loyalty.rewardItemId),
            eq(itemsTable.storeId, storeId)
          )
        )
        .for('key share')
      if (!item)
        throw new BenefitProgramsError(
          'Escolha um produto do catalogo desta loja.'
        )
    }
    const version = expectedVersion + 1
    await tx
      .insert(versions)
      .values({
        storeId,
        version,
        actorUserId,
        cashbackEnabled: cashback.enabled,
        cashbackPercentage: cashback.percentage,
        cashbackExpiresAfterDays: cashback.expiresAfterDays,
        cashbackMinimumOrderAmount: cashback.minimumOrderAmount,
        loyaltyEnabled: loyalty.enabled,
        loyaltyRequiredOrders: loyalty.requiredOrders,
        loyaltyMinimumOrderAmount: loyalty.minimumOrderAmount,
        loyaltyRewardType: loyalty.rewardType,
        loyaltyRewardAmount: loyalty.rewardAmount,
        loyaltyRewardItemId: loyalty.rewardItemId,
        loyaltyRewardExpiresAfterDays: loyalty.rewardExpiresAfterDays,
      })
    return version
  }
  return transaction ? append(transaction) : db.transaction(append)
}
