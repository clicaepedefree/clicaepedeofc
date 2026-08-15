import type { InternalOperator } from '@/features/internal-operations/access'
import { normalizeUserEmail } from '@/features/user/user-policy'
import { db } from '@/services/db'
import {
  billingModulesTable,
  billingPlanModulesTable,
  billingPlansTable,
  internalOperationAuditLogsTable,
  storeAddressesTable,
  storeBillingEventsTable,
  storeCompanyProfilesTable,
  storeModuleEntitlementsTable,
  storeSubscriptionsTable,
  storesTable,
  userStorePermissionsTable,
  usersTable,
  type SelectStore,
} from '@/services/db/schema'
import { and, count, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import type { InternalStoreCreationValues } from './internal-store-creation-policy'
import { normalizeCurrencyAmount } from './internal-store-creation-policy'

export type InternalStoreStatus = SelectStore['status']

export type InternalStoreListItem = Pick<
  SelectStore,
  | 'id'
  | 'name'
  | 'subdomain'
  | 'status'
  | 'statusReason'
  | 'statusUpdatedAt'
  | 'createdAt'
  | 'updatedAt'
> & {
  admins: {
    userId: string
    email: string
    name: string | null
    userStatus: string
    revokedAt: Date | null
    revokedReason: string | null
  }[]
}

export type InternalAuditLog = typeof internalOperationAuditLogsTable.$inferSelect

export type InternalBillingPlanOption = {
  id: number
  code: string
  name: string
  description: string | null
  defaultAmount: string
  currency: string
  billingInterval: string
  billingIntervalCount: number
  trialDays: number
}

export type InternalBillingModuleOption = {
  id: number
  code: string
  name: string
  description: string | null
  includedPlanIds: number[]
}

const storeStatusValues: InternalStoreStatus[] = [
  'active',
  'inactive',
  'pending_recovery',
  'archived',
]

export function parseStoreStatus(value: unknown): InternalStoreStatus | undefined {
  if (typeof value !== 'string') return undefined
  if (!storeStatusValues.includes(value as InternalStoreStatus)) return undefined

  return value as InternalStoreStatus
}

export async function getInternalStoreStatusCounts() {
  const rows = await db
    .select({
      status: storesTable.status,
      total: count(storesTable.id),
    })
    .from(storesTable)
    .groupBy(storesTable.status)

  const counts = Object.fromEntries(
    storeStatusValues.map(status => [status, 0])
  ) as Record<InternalStoreStatus, number>

  for (const row of rows) {
    counts[row.status] = row.total
  }

  return counts
}

export async function listInternalStores({
  status,
  search,
}: {
  status?: InternalStoreStatus
  search?: string
}): Promise<InternalStoreListItem[]> {
  const trimmedSearch = search?.trim()
  const searchPattern = trimmedSearch ? `%${trimmedSearch.toLowerCase()}%` : null

  const stores = await db
    .select({
      id: storesTable.id,
      name: storesTable.name,
      subdomain: storesTable.subdomain,
      status: storesTable.status,
      statusReason: storesTable.statusReason,
      statusUpdatedAt: storesTable.statusUpdatedAt,
      createdAt: storesTable.createdAt,
      updatedAt: storesTable.updatedAt,
    })
    .from(storesTable)
    .where(
      and(
        status ? eq(storesTable.status, status) : undefined,
        searchPattern
          ? sql`(
              lower(${storesTable.name}) like ${searchPattern}
              or lower(${storesTable.subdomain}) like ${searchPattern}
              or ${storesTable.id}::text = ${trimmedSearch}
              or exists (
                select 1
                from ${userStorePermissionsTable}
                join ${usersTable} on ${usersTable.id} = ${userStorePermissionsTable.userId}
                where ${userStorePermissionsTable.storeId} = ${storesTable.id}
                  and lower(${usersTable.email}) like ${searchPattern}
              )
            )`
          : undefined
      )
    )
    .orderBy(desc(storesTable.statusUpdatedAt), desc(storesTable.id))
    .limit(100)

  if (stores.length === 0) return []

  const storeIds = stores.map(store => store.id)
  const adminRows = await db
    .select({
      storeId: userStorePermissionsTable.storeId,
      userId: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      userStatus: usersTable.status,
      revokedAt: userStorePermissionsTable.revokedAt,
      revokedReason: userStorePermissionsTable.revokedReason,
    })
    .from(userStorePermissionsTable)
    .innerJoin(usersTable, eq(usersTable.id, userStorePermissionsTable.userId))
    .where(
      and(
        inArray(userStorePermissionsTable.storeId, storeIds),
        eq(userStorePermissionsTable.role, 'admin')
      )
    )

  const adminsByStoreId = new Map<number, InternalStoreListItem['admins']>()

  for (const admin of adminRows) {
    const admins = adminsByStoreId.get(admin.storeId) ?? []
    admins.push({
      userId: admin.userId,
      email: admin.email,
      name: admin.name,
      userStatus: admin.userStatus,
      revokedAt: admin.revokedAt,
      revokedReason: admin.revokedReason,
    })
    adminsByStoreId.set(admin.storeId, admins)
  }

  return stores.map(store => ({
    ...store,
    admins: adminsByStoreId.get(store.id) ?? [],
  }))
}

export async function getRecentInternalAuditLogs(limit = 25) {
  return await db
    .select()
    .from(internalOperationAuditLogsTable)
    .orderBy(desc(internalOperationAuditLogsTable.createdAt))
    .limit(limit)
}

export async function listActiveBillingPlansForInternalCreation(): Promise<
  InternalBillingPlanOption[]
> {
  return await db
    .select({
      id: billingPlansTable.id,
      code: billingPlansTable.code,
      name: billingPlansTable.name,
      description: billingPlansTable.description,
      defaultAmount: billingPlansTable.defaultAmount,
      currency: billingPlansTable.currency,
      billingInterval: billingPlansTable.billingInterval,
      billingIntervalCount: billingPlansTable.billingIntervalCount,
      trialDays: billingPlansTable.trialDays,
    })
    .from(billingPlansTable)
    .where(eq(billingPlansTable.status, 'active'))
    .orderBy(billingPlansTable.name)
}

export async function listBillingModulesForInternalCreation(): Promise<
  InternalBillingModuleOption[]
> {
  const rows = await db
    .select({
      id: billingModulesTable.id,
      code: billingModulesTable.code,
      name: billingModulesTable.name,
      description: billingModulesTable.description,
      planId: billingPlanModulesTable.planId,
    })
    .from(billingModulesTable)
    .leftJoin(
      billingPlanModulesTable,
      and(
        eq(billingPlanModulesTable.moduleId, billingModulesTable.id),
        eq(billingPlanModulesTable.status, 'active'),
        sql`${billingPlanModulesTable.endsAt} is null`
      )
    )
    .where(eq(billingModulesTable.status, 'active'))
    .orderBy(billingModulesTable.name)

  const modulesById = new Map<number, InternalBillingModuleOption>()

  for (const row of rows) {
    const current = modulesById.get(row.id) ?? {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      includedPlanIds: [],
    }

    if (row.planId && !current.includedPlanIds.includes(row.planId)) {
      current.includedPlanIds.push(row.planId)
    }

    modulesById.set(row.id, current)
  }

  return [...modulesById.values()]
}

const addDays = (date: Date, days: number) => {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

const lastDayOfMonth = (year: number, monthIndex: number) =>
  new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()

const addMonthsClamped = (date: Date, months: number) => {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const day = date.getUTCDate()
  const result = new Date(
    Date.UTC(
      year,
      month + months,
      1,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds()
    )
  )
  result.setUTCDate(
    Math.min(day, lastDayOfMonth(result.getUTCFullYear(), result.getUTCMonth()))
  )
  return result
}

const intervalToMonths: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
}

const getSubscriptionPeriod = ({
  startsAt,
  billingInterval,
  billingIntervalCount,
  trialDays,
}: {
  startsAt: Date
  billingInterval: string
  billingIntervalCount: number
  trialDays: number
}) => {
  if (trialDays > 0) {
    const periodEnd = addDays(startsAt, trialDays)
    return {
      status: 'trialing' as const,
      periodStart: startsAt,
      periodEnd,
      nextBillingAt: periodEnd,
    }
  }

  const periodEnd = addMonthsClamped(
    startsAt,
    (intervalToMonths[billingInterval] ?? 1) * billingIntervalCount
  )

  return {
    status: 'active' as const,
    periodStart: startsAt,
    periodEnd,
    nextBillingAt: periodEnd,
  }
}

export async function createInternalStore({
  values,
  operator,
}: {
  values: InternalStoreCreationValues
  operator: InternalOperator
}) {
  const responsibleEmail = normalizeUserEmail(values.responsibleEmail)
  const now = new Date()

  return await db.transaction(async tx => {
    const [responsibleUser] = await tx
      .select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.status, 'active'),
          sql`lower(${usersTable.email}) = ${responsibleEmail}`
        )
      )
      .limit(1)

    if (!responsibleUser) throw new Error('RESPONSIBLE_USER_NOT_FOUND')

    const [plan] = await tx
      .select()
      .from(billingPlansTable)
      .where(
        and(
          eq(billingPlansTable.id, values.planId),
          eq(billingPlansTable.status, 'active')
        )
      )
      .limit(1)

    if (!plan) throw new Error('BILLING_PLAN_NOT_FOUND')

    const [store] = await tx
      .insert(storesTable)
      .values({
        name: values.storeName,
        subdomain: values.subdomain,
        status: 'active',
        statusReason: values.reason,
        statusUpdatedAt: now,
        updatedAt: now,
      })
      .returning()

    await tx.insert(userStorePermissionsTable).values({
      userId: responsibleUser.id,
      storeId: store.id,
      role: 'admin',
      isPrimaryResponsible: true,
      assignedPrimaryAt: now,
      updatedAt: now,
    })

    await tx.insert(storeCompanyProfilesTable).values({
      storeId: store.id,
      companyTaxNumber: values.companyTaxNumber || null,
      companyName: values.companyName || values.storeName,
      phone1: values.phone1 || values.responsiblePhone || null,
      email: values.companyEmail || values.responsibleEmail,
      responsibleName: values.responsibleName,
      responsibleTaxNumber: values.responsibleTaxNumber || null,
      responsiblePhone: values.responsiblePhone || null,
      responsibleEmail: values.responsibleEmail,
      postalCode: values.postalCode,
      street: values.street,
      number: values.number,
      district: values.district,
      city: values.city,
      stateCode: values.stateCode,
      updatedAt: now,
    })

    await tx.insert(storeAddressesTable).values({
      storeId: store.id,
      addressType: 'business',
      label: 'Endereco principal',
      postalCode: values.postalCode,
      street: values.street,
      number: values.number,
      district: values.district,
      city: values.city,
      stateCode: values.stateCode,
      isPrimary: true,
      updatedAt: now,
    })

    const period = getSubscriptionPeriod({
      startsAt: now,
      billingInterval: plan.billingInterval,
      billingIntervalCount: plan.billingIntervalCount,
      trialDays: plan.trialDays,
    })
    const discountType =
      values.discountType === 'none' ? null : values.discountType
    const discountValue =
      values.discountType === 'none' || !values.discountValue
        ? null
        : normalizeCurrencyAmount(values.discountValue)

    const [subscription] = await tx
      .insert(storeSubscriptionsTable)
      .values({
        storeId: store.id,
        planId: plan.id,
        status: period.status,
        contractedAmount: normalizeCurrencyAmount(values.contractedAmount),
        currency: plan.currency,
        billingInterval: plan.billingInterval,
        billingIntervalCount: plan.billingIntervalCount,
        discountType,
        discountValue,
        startsAt: now,
        currentPeriodStart: period.periodStart,
        currentPeriodEnd: period.periodEnd,
        nextBillingAt: period.nextBillingAt,
        metadata: {
          source: 'internal_store_creation',
          createdBy: operator.email,
        },
        updatedAt: now,
      })
      .returning()

    const planModules = await tx
      .select({
        id: billingPlanModulesTable.id,
        moduleId: billingPlanModulesTable.moduleId,
      })
      .from(billingPlanModulesTable)
      .innerJoin(
        billingModulesTable,
        and(
          eq(billingModulesTable.id, billingPlanModulesTable.moduleId),
          eq(billingModulesTable.status, 'active')
        )
      )
      .where(
        and(
          eq(billingPlanModulesTable.planId, plan.id),
          eq(billingPlanModulesTable.status, 'active'),
          sql`${billingPlanModulesTable.endsAt} is null`
        )
      )

    const selectedModuleIds = new Set(values.selectedModuleIds)
    const selectedActiveModules =
      selectedModuleIds.size === 0
        ? []
        : await tx
            .select({ id: billingModulesTable.id })
            .from(billingModulesTable)
            .where(
              and(
                inArray(billingModulesTable.id, [...selectedModuleIds]),
                eq(billingModulesTable.status, 'active')
              )
            )

    if (selectedActiveModules.length !== selectedModuleIds.size) {
      throw new Error('INVALID_MODULE_SELECTION')
    }

    const planModuleIds = new Set(planModules.map(module => module.moduleId))
    const additionalModuleIds = [...selectedModuleIds].filter(
      moduleId => !planModuleIds.has(moduleId)
    )

    if (planModules.length > 0) {
      await tx.insert(storeModuleEntitlementsTable).values(
        planModules.map(module => ({
          storeId: store.id,
          moduleId: module.moduleId,
          subscriptionId: subscription.id,
          planId: plan.id,
          planModuleId: module.id,
          origin: 'plan' as const,
          status: 'active' as const,
          isAdditional: false,
          additionalAmount: '0',
          currency: plan.currency,
          startsAt: now,
          reason: values.reason,
          actorClerkId: operator.clerkId,
          metadata: { source: 'internal_store_creation' },
          updatedAt: now,
        }))
      )
    }

    if (additionalModuleIds.length > 0) {
      await tx.insert(storeModuleEntitlementsTable).values(
        additionalModuleIds.map(moduleId => ({
          storeId: store.id,
          moduleId,
          origin: 'manual' as const,
          status: 'active' as const,
          isAdditional: false,
          additionalAmount: '0',
          currency: plan.currency,
          startsAt: now,
          reason: values.reason,
          actorClerkId: operator.clerkId,
          metadata: { source: 'internal_store_creation' },
          updatedAt: now,
        }))
      )
    }

    await tx.insert(storeBillingEventsTable).values({
      storeId: store.id,
      subscriptionId: subscription.id,
      eventType: 'subscription_created',
      actorClerkId: operator.clerkId,
      actorEmail: operator.email,
      reason: values.reason,
      previousValues: null,
      newValues: {
        storeId: store.id,
        responsibleUserId: responsibleUser.id,
        planId: plan.id,
        subscriptionId: subscription.id,
        planModuleCount: planModules.length,
        additionalModuleIds,
      },
      metadata: { source: 'internal_store_creation' },
    })

    await tx.insert(internalOperationAuditLogsTable).values({
      action: 'create_store',
      actorClerkId: operator.clerkId,
      actorEmail: operator.email,
      actorName: operator.name,
      storeId: store.id,
      targetUserId: responsibleUser.id,
      targetUserEmail: responsibleUser.email,
      previousStoreStatus: 'none',
      newStoreStatus: store.status,
      reason: values.reason,
    })

    return {
      store,
      subscription,
      responsibleUser,
    }
  })
}

export async function reactivateStoreWithAdmin({
  storeId,
  adminEmail,
  reason,
  operator,
}: {
  storeId: number
  adminEmail: string
  reason: string
  operator: InternalOperator
}) {
  const normalizedAdminEmail = normalizeUserEmail(adminEmail)
  const now = new Date()

  return await db.transaction(async tx => {
    const [store] = await tx
      .select()
      .from(storesTable)
      .where(eq(storesTable.id, storeId))
      .limit(1)

    if (!store) throw new Error('STORE_NOT_FOUND')
    if (!['pending_recovery', 'inactive'].includes(store.status)) {
      throw new Error('STORE_STATUS_NOT_REACTIVATABLE')
    }

    const [targetUser] = await tx
      .select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.status, 'active'),
          sql`lower(${usersTable.email}) = ${normalizedAdminEmail}`
        )
      )
      .limit(1)

    if (!targetUser) throw new Error('TARGET_USER_NOT_FOUND')

    await tx
      .insert(userStorePermissionsTable)
      .values({
        userId: targetUser.id,
        storeId,
        role: 'admin',
        revokedAt: null,
        revokedReason: null,
      })
      .onConflictDoUpdate({
        target: [
          userStorePermissionsTable.userId,
          userStorePermissionsTable.storeId,
        ],
        set: {
          role: 'admin',
          revokedAt: null,
          revokedReason: null,
          updatedAt: now,
        },
      })

    const [updatedStore] = await tx
      .update(storesTable)
      .set({
        status: 'active',
        statusReason: reason,
        statusUpdatedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(storesTable.id, storeId),
          inArray(storesTable.status, ['pending_recovery', 'inactive'])
        )
      )
      .returning()

    if (!updatedStore) throw new Error('STORE_STATUS_NOT_REACTIVATABLE')

    await tx.insert(internalOperationAuditLogsTable).values({
      action: 'reactivate_store',
      actorClerkId: operator.clerkId,
      actorEmail: operator.email,
      actorName: operator.name,
      storeId,
      targetUserId: targetUser.id,
      targetUserEmail: targetUser.email,
      previousStoreStatus: store.status,
      newStoreStatus: updatedStore.status,
      reason,
    })

    return updatedStore
  })
}

export async function archiveStore({
  storeId,
  confirmationSubdomain,
  reason,
  operator,
}: {
  storeId: number
  confirmationSubdomain: string
  reason: string
  operator: InternalOperator
}) {
  const now = new Date()

  return await db.transaction(async tx => {
    const [store] = await tx
      .select()
      .from(storesTable)
      .where(eq(storesTable.id, storeId))
      .limit(1)

    if (!store) throw new Error('STORE_NOT_FOUND')
    if (store.status === 'archived') throw new Error('STORE_ALREADY_ARCHIVED')
    if (confirmationSubdomain !== store.subdomain) {
      throw new Error('STORE_CONFIRMATION_MISMATCH')
    }

    await tx
      .update(userStorePermissionsTable)
      .set({
        revokedAt: now,
        revokedReason: 'store_archived',
        updatedAt: now,
      })
      .where(
        and(
          eq(userStorePermissionsTable.storeId, storeId),
          sql`${userStorePermissionsTable.revokedAt} is null`
        )
      )

    const [updatedStore] = await tx
      .update(storesTable)
      .set({
        status: 'archived',
        statusReason: reason,
        statusUpdatedAt: now,
        updatedAt: now,
      })
      .where(and(eq(storesTable.id, storeId), ne(storesTable.status, 'archived')))
      .returning()

    if (!updatedStore) throw new Error('STORE_ALREADY_ARCHIVED')

    await tx.insert(internalOperationAuditLogsTable).values({
      action: 'archive_store',
      actorClerkId: operator.clerkId,
      actorEmail: operator.email,
      actorName: operator.name,
      storeId,
      targetUserEmail: null,
      previousStoreStatus: store.status,
      newStoreStatus: updatedStore.status,
      reason,
    })

    return updatedStore
  })
}
