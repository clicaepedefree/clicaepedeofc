import type { InternalOperator } from '@/features/internal-operations/access'
import { buildBillingInvoiceDraft } from '@/features/billing/billing-policy'
import {
  buildStoreAccessInviteUrl,
  createStoreAccessInviteToken,
  getStoreAccessInviteExpiresAt,
  getStoreAccessInviteSecret,
  hashStoreAccessInviteToken,
} from '@/features/store-access-invites/invite-policy'
import { normalizeUserEmail } from '@/features/user/user-policy'
import { db } from '@/services/db'
import {
  billingModulesTable,
  billingPlanModulesTable,
  billingPlansTable,
  internalStoreProvisioningRequestsTable,
  internalOperationAuditLogsTable,
  storeAccessInvitesTable,
  storeAddressesTable,
  storeBillingEventsTable,
  storeBillingInvoicesTable,
  storeCompanyProfilesTable,
  storeModuleEntitlementsTable,
  storeSubscriptionsTable,
  storesTable,
  userStorePermissionsTable,
  usersTable,
  type SelectStore,
} from '@/services/db/schema'
import { createHash } from 'node:crypto'
import { and, count, desc, eq, inArray, ne, or, sql } from 'drizzle-orm'
import type { InternalStoreCreationValues } from './internal-store-creation-policy'
import {
  normalizeCurrencyAmount,
  normalizeInternalCnpj,
  normalizeInternalCpf,
  normalizeInternalEmail,
  normalizeInternalPhone,
} from './internal-store-creation-policy'

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

export type InternalAuditLog =
  typeof internalOperationAuditLogsTable.$inferSelect

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

export type InternalStoreDuplicateMatch = {
  storeId: number
  storeName: string
  subdomain: string
  status: InternalStoreStatus
  matchedFields: {
    field: string
    label: string
    value: string
  }[]
}

export type InternalStoreAccessInviteResult = {
  inviteId: number
  inviteUrl: string
  targetEmail: string
  expiresAt: Date
}

type InternalStoreTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0]

const storeStatusValues: InternalStoreStatus[] = [
  'active',
  'inactive',
  'pending_recovery',
  'archived',
]

export function parseStoreStatus(
  value: unknown
): InternalStoreStatus | undefined {
  if (typeof value !== 'string') return undefined
  if (!storeStatusValues.includes(value as InternalStoreStatus))
    return undefined

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
  const searchPattern = trimmedSearch
    ? `%${trimmedSearch.toLowerCase()}%`
    : null

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

const maskEmail = (email: string) => {
  const [localPart = '', domain = ''] = email.split('@')
  if (!localPart || !domain) return 'e-mail informado'

  return `${localPart.slice(0, 2)}***@${domain}`
}

const maskLast4 = (value: string, fallback: string) => {
  const digits = value.replace(/\D/g, '')
  if (!digits) return fallback

  return `***${digits.slice(-4)}`
}

export async function findInternalStoreCreationDuplicates(
  values: InternalStoreCreationValues
): Promise<InternalStoreDuplicateMatch[]> {
  const duplicateInputs = {
    subdomain: values.subdomain,
    companyTaxNumber: normalizeInternalCnpj(values.companyTaxNumber),
    responsibleTaxNumber: normalizeInternalCpf(values.responsibleTaxNumber),
    companyEmail: normalizeInternalEmail(values.companyEmail),
    responsibleEmail: normalizeInternalEmail(values.responsibleEmail),
    phone1: normalizeInternalPhone(values.phone1),
    responsiblePhone: normalizeInternalPhone(values.responsiblePhone),
  }
  const conditions = [
    duplicateInputs.subdomain
      ? eq(storesTable.subdomain, duplicateInputs.subdomain)
      : undefined,
    duplicateInputs.companyTaxNumber
      ? sql`regexp_replace(coalesce(${storeCompanyProfilesTable.companyTaxNumber}, ''), '\D', '', 'g') = ${duplicateInputs.companyTaxNumber}`
      : undefined,
    duplicateInputs.responsibleTaxNumber
      ? sql`regexp_replace(coalesce(${storeCompanyProfilesTable.responsibleTaxNumber}, ''), '\D', '', 'g') = ${duplicateInputs.responsibleTaxNumber}`
      : undefined,
    duplicateInputs.companyEmail
      ? sql`lower(coalesce(${storeCompanyProfilesTable.email}, '')) = ${duplicateInputs.companyEmail}`
      : undefined,
    duplicateInputs.responsibleEmail
      ? sql`lower(coalesce(${storeCompanyProfilesTable.responsibleEmail}, '')) = ${duplicateInputs.responsibleEmail}`
      : undefined,
    duplicateInputs.phone1
      ? sql`regexp_replace(coalesce(${storeCompanyProfilesTable.phone1}, ''), '\D', '', 'g') = ${duplicateInputs.phone1}`
      : undefined,
    duplicateInputs.responsiblePhone
      ? sql`regexp_replace(coalesce(${storeCompanyProfilesTable.responsiblePhone}, ''), '\D', '', 'g') = ${duplicateInputs.responsiblePhone}`
      : undefined,
  ].filter(Boolean)

  if (conditions.length === 0) return []

  const rows = await db
    .select({
      storeId: storesTable.id,
      storeName: storesTable.name,
      subdomain: storesTable.subdomain,
      status: storesTable.status,
      companyTaxNumber: storeCompanyProfilesTable.companyTaxNumber,
      responsibleTaxNumber: storeCompanyProfilesTable.responsibleTaxNumber,
      companyEmail: storeCompanyProfilesTable.email,
      responsibleEmail: storeCompanyProfilesTable.responsibleEmail,
      phone1: storeCompanyProfilesTable.phone1,
      responsiblePhone: storeCompanyProfilesTable.responsiblePhone,
    })
    .from(storesTable)
    .leftJoin(
      storeCompanyProfilesTable,
      eq(storeCompanyProfilesTable.storeId, storesTable.id)
    )
    .where(or(...conditions))
    .orderBy(desc(storesTable.statusUpdatedAt), desc(storesTable.id))
    .limit(5)

  return rows.map(row => {
    const matchedFields: InternalStoreDuplicateMatch['matchedFields'] = []

    if (row.subdomain === duplicateInputs.subdomain) {
      matchedFields.push({
        field: 'subdomain',
        label: 'Endereco publico',
        value: row.subdomain,
      })
    }

    if (
      duplicateInputs.companyTaxNumber &&
      normalizeInternalCnpj(row.companyTaxNumber) ===
        duplicateInputs.companyTaxNumber
    ) {
      matchedFields.push({
        field: 'companyTaxNumber',
        label: 'CNPJ',
        value: maskLast4(row.companyTaxNumber ?? '', 'CNPJ informado'),
      })
    }

    if (
      duplicateInputs.responsibleTaxNumber &&
      normalizeInternalCpf(row.responsibleTaxNumber) ===
        duplicateInputs.responsibleTaxNumber
    ) {
      matchedFields.push({
        field: 'responsibleTaxNumber',
        label: 'CPF do responsavel',
        value: maskLast4(row.responsibleTaxNumber ?? '', 'CPF informado'),
      })
    }

    if (
      duplicateInputs.companyEmail &&
      normalizeInternalEmail(row.companyEmail) === duplicateInputs.companyEmail
    ) {
      matchedFields.push({
        field: 'companyEmail',
        label: 'E-mail da loja',
        value: maskEmail(row.companyEmail ?? ''),
      })
    }

    if (
      duplicateInputs.responsibleEmail &&
      normalizeInternalEmail(row.responsibleEmail) ===
        duplicateInputs.responsibleEmail
    ) {
      matchedFields.push({
        field: 'responsibleEmail',
        label: 'E-mail do responsavel',
        value: maskEmail(row.responsibleEmail ?? ''),
      })
    }

    if (
      duplicateInputs.phone1 &&
      normalizeInternalPhone(row.phone1) === duplicateInputs.phone1
    ) {
      matchedFields.push({
        field: 'phone1',
        label: 'Telefone da loja',
        value: maskLast4(row.phone1 ?? '', 'telefone informado'),
      })
    }

    if (
      duplicateInputs.responsiblePhone &&
      normalizeInternalPhone(row.responsiblePhone) ===
        duplicateInputs.responsiblePhone
    ) {
      matchedFields.push({
        field: 'responsiblePhone',
        label: 'Telefone do responsavel',
        value: maskLast4(row.responsiblePhone ?? '', 'telefone informado'),
      })
    }

    return {
      storeId: row.storeId,
      storeName: row.storeName,
      subdomain: row.subdomain,
      status: row.status,
      matchedFields,
    }
  })
}

const addDays = (date: Date, days: number) => {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

const getInternalInviteBaseUrl = () => {
  const explicitUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)

  if (explicitUrl) return explicitUrl

  const domain = process.env.NEXT_PUBLIC_APP_DOMAIN ?? 'localhost:3000'
  const protocol =
    domain.includes('localhost') || domain.includes('127.0.0.1')
      ? 'http'
      : 'https'

  return `${protocol}://${domain}`
}

async function createStoreAccessInvite({
  tx,
  storeId,
  targetUserId,
  targetEmail,
  operator,
  now,
  deliveryChannel = 'manual',
}: {
  tx: InternalStoreTransaction
  storeId: number
  targetUserId: string
  targetEmail: string
  operator: InternalOperator
  now: Date
  deliveryChannel?: 'manual' | 'email' | 'whatsapp'
}): Promise<InternalStoreAccessInviteResult> {
  const normalizedEmail = normalizeUserEmail(targetEmail)
  const token = createStoreAccessInviteToken()
  const tokenHash = hashStoreAccessInviteToken(
    token,
    getStoreAccessInviteSecret()
  )
  const expiresAt = getStoreAccessInviteExpiresAt(now)

  await tx
    .update(storeAccessInvitesTable)
    .set({
      status: 'revoked',
      revokedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(storeAccessInvitesTable.storeId, storeId),
        sql`lower(${storeAccessInvitesTable.targetEmail}) = ${normalizedEmail}`,
        eq(storeAccessInvitesTable.status, 'pending'),
        sql`${storeAccessInvitesTable.usedAt} is null`,
        sql`${storeAccessInvitesTable.revokedAt} is null`
      )
    )

  const [invite] = await tx
    .insert(storeAccessInvitesTable)
    .values({
      storeId,
      targetUserId,
      targetEmail: normalizedEmail,
      role: 'admin',
      tokenHash,
      status: 'pending',
      deliveryChannel,
      deliveryStatus: deliveryChannel === 'manual' ? 'ready' : 'pending',
      expiresAt,
      createdByClerkId: operator.clerkId,
      createdByEmail: operator.email,
      updatedAt: now,
    })
    .returning()

  await tx.insert(internalOperationAuditLogsTable).values({
    action: 'create_store_access_invite',
    actorClerkId: operator.clerkId,
    actorEmail: operator.email,
    actorName: operator.name,
    storeId,
    targetUserId,
    targetUserEmail: normalizedEmail,
    previousStoreStatus: 'invite_pending',
    newStoreStatus: 'invite_created',
    reason: 'Convite seguro gerado para o responsavel definir a propria senha.',
  })

  return {
    inviteId: invite.id,
    inviteUrl: buildStoreAccessInviteUrl({
      token,
      baseUrl: getInternalInviteBaseUrl(),
    }),
    targetEmail: normalizedEmail,
    expiresAt,
  }
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

export const getInternalStoreProvisioningPayloadHash = (
  values: InternalStoreCreationValues
) =>
  createHash('sha256')
    .update(
      JSON.stringify({
        ...values,
        duplicateOverrideConfirmed: undefined,
        duplicateReviewToken: undefined,
        reviewConfirmed: undefined,
        reviewFingerprint: undefined,
      })
    )
    .digest('hex')

export const buildInternalStoreInitialInvoiceNumber = ({
  storeId,
  subscriptionId,
}: {
  storeId: number
  subscriptionId: number
}) => `CP-${storeId}-${subscriptionId}-001`

export const shouldCreateInternalStoreInitialInvoice = (
  subscriptionStatus: ReturnType<typeof getSubscriptionPeriod>['status']
) => subscriptionStatus === 'active'

export async function createInternalStore({
  values,
  operator,
}: {
  values: InternalStoreCreationValues
  operator: InternalOperator
}) {
  const responsibleEmail = normalizeUserEmail(values.responsibleEmail)
  const payloadHash = getInternalStoreProvisioningPayloadHash(values)
  const now = new Date()

  return await db.transaction(async tx => {
    const [provisioningRequest] = await tx
      .insert(internalStoreProvisioningRequestsTable)
      .values({
        idempotencyKey: values.provisioningIdempotencyKey,
        status: 'processing',
        actorClerkId: operator.clerkId,
        actorEmail: operator.email,
        payloadHash,
        updatedAt: now,
      })
      .onConflictDoNothing({
        target: internalStoreProvisioningRequestsTable.idempotencyKey,
      })
      .returning()

    if (!provisioningRequest) {
      const [existingRequest] = await tx
        .select({
          payloadHash: internalStoreProvisioningRequestsTable.payloadHash,
          status: internalStoreProvisioningRequestsTable.status,
          storeId: internalStoreProvisioningRequestsTable.storeId,
          subscriptionId: internalStoreProvisioningRequestsTable.subscriptionId,
          invoiceId: internalStoreProvisioningRequestsTable.invoiceId,
        })
        .from(internalStoreProvisioningRequestsTable)
        .where(
          eq(
            internalStoreProvisioningRequestsTable.idempotencyKey,
            values.provisioningIdempotencyKey
          )
        )
        .limit(1)

      if (!existingRequest) throw new Error('PROVISIONING_REQUEST_NOT_FOUND')
      if (existingRequest.payloadHash !== payloadHash) {
        throw new Error('IDEMPOTENCY_KEY_REUSED')
      }
      if (
        existingRequest.status !== 'succeeded' ||
        !existingRequest.storeId ||
        !existingRequest.subscriptionId
      ) {
        throw new Error('PROVISIONING_REQUEST_IN_PROGRESS')
      }

      const [existingStore] = await tx
        .select()
        .from(storesTable)
        .where(eq(storesTable.id, existingRequest.storeId))
        .limit(1)
      const [existingSubscription] = await tx
        .select()
        .from(storeSubscriptionsTable)
        .where(eq(storeSubscriptionsTable.id, existingRequest.subscriptionId))
        .limit(1)
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
      const [existingInvoice] = existingRequest.invoiceId
        ? await tx
            .select()
            .from(storeBillingInvoicesTable)
            .where(eq(storeBillingInvoicesTable.id, existingRequest.invoiceId))
            .limit(1)
        : [null]

      if (!existingStore || !existingSubscription || !responsibleUser) {
        throw new Error('PROVISIONING_REQUEST_INCOMPLETE')
      }

      return {
        store: existingStore,
        subscription: existingSubscription,
        invoice: existingInvoice,
        responsibleUser,
        accessInvite: null,
        idempotentReplay: true,
      }
    }

    let [responsibleUser] = await tx
      .select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.status, 'active'),
          sql`lower(${usersTable.email}) = ${responsibleEmail}`
        )
      )
      .limit(1)

    if (!responsibleUser) {
      const [createdResponsibleUser] = await tx
        .insert(usersTable)
        .values({
          email: responsibleEmail,
          name: values.responsibleName,
          phone: values.responsiblePhone || null,
          status: 'active',
          lastLoginAt: null,
          updatedAt: now,
        })
        .returning()

      responsibleUser = createdResponsibleUser
    }

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
          accessDelivery: values.sendAccessImmediately
            ? 'send_immediately'
            : 'manual_later',
        },
        updatedAt: now,
      })
      .returning()

    const [initialInvoice] = shouldCreateInternalStoreInitialInvoice(
      period.status
    )
      ? await tx
          .insert(storeBillingInvoicesTable)
          .values(
            buildBillingInvoiceDraft({
              invoiceNumber: buildInternalStoreInitialInvoiceNumber({
                storeId: store.id,
                subscriptionId: subscription.id,
              }),
              dueAt: now,
              plan,
              subscription,
            })
          )
          .returning()
      : [null]

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

    const accessInvite = values.sendAccessImmediately
      ? await createStoreAccessInvite({
          tx,
          storeId: store.id,
          targetUserId: responsibleUser.id,
          targetEmail: responsibleUser.email,
          operator,
          now,
          deliveryChannel: 'manual',
        })
      : null

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
        invoiceId: initialInvoice?.id ?? null,
        planModuleCount: planModules.length,
        additionalModuleIds,
        sendAccessImmediately: values.sendAccessImmediately,
        accessInviteId: accessInvite?.inviteId ?? null,
        accessInviteExpiresAt: accessInvite?.expiresAt ?? null,
      },
      metadata: { source: 'internal_store_creation' },
    })

    if (initialInvoice) {
      await tx.insert(storeBillingEventsTable).values({
        storeId: store.id,
        subscriptionId: subscription.id,
        invoiceId: initialInvoice.id,
        eventType: 'invoice_created',
        actorClerkId: operator.clerkId,
        actorEmail: operator.email,
        reason: values.reason,
        previousValues: null,
        newValues: {
          invoiceId: initialInvoice.id,
          invoiceNumber: initialInvoice.invoiceNumber,
          status: initialInvoice.status,
          totalAmount: initialInvoice.totalAmount,
          dueAt: initialInvoice.dueAt,
        },
        metadata: { source: 'internal_store_creation' },
      })
    }

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

    await tx
      .update(internalStoreProvisioningRequestsTable)
      .set({
        status: 'succeeded',
        storeId: store.id,
        subscriptionId: subscription.id,
        invoiceId: initialInvoice?.id ?? null,
        updatedAt: now,
      })
      .where(
        eq(internalStoreProvisioningRequestsTable.id, provisioningRequest.id)
      )

    return {
      store,
      subscription,
      invoice: initialInvoice,
      responsibleUser,
      accessInvite,
      idempotentReplay: false,
    }
  })
}

export async function resendStoreAccessInvite({
  storeId,
  targetEmail,
  operator,
}: {
  storeId: number
  targetEmail: string
  operator: InternalOperator
}): Promise<InternalStoreAccessInviteResult> {
  const normalizedEmail = normalizeUserEmail(targetEmail)
  const now = new Date()

  return await db.transaction(async tx => {
    const [store] = await tx
      .select()
      .from(storesTable)
      .where(eq(storesTable.id, storeId))
      .limit(1)

    if (!store) throw new Error('STORE_NOT_FOUND')
    if (store.status === 'archived') throw new Error('STORE_ARCHIVED')

    let [targetUser] = await tx
      .select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.status, 'active'),
          sql`lower(${usersTable.email}) = ${normalizedEmail}`
        )
      )
      .limit(1)

    if (!targetUser) {
      const [createdUser] = await tx
        .insert(usersTable)
        .values({
          email: normalizedEmail,
          status: 'active',
          updatedAt: now,
        })
        .returning()

      targetUser = createdUser
    }

    return await createStoreAccessInvite({
      tx,
      storeId,
      targetUserId: targetUser.id,
      targetEmail: normalizedEmail,
      operator,
      now,
      deliveryChannel: 'manual',
    })
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
      .where(
        and(eq(storesTable.id, storeId), ne(storesTable.status, 'archived'))
      )
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
