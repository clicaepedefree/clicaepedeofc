import {
  canUseInternalPermission,
  type InternalOperator,
} from '@/features/internal-operations/access'
import { buildBillingInvoiceDraft } from '@/features/billing/billing-policy'
import {
  buildPaymentConfirmationDedupeKey,
  reconcileConfirmedPayment,
  shouldAutoUnblockBillingAccess,
} from '@/features/billing/payment-confirmation-policy'
import { isActiveStoreModuleEntitlement } from '@/features/billing/module-entitlements-policy'
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
  ordersTable,
  storeAccessInvitesTable,
  storeAccessBlocksTable,
  storeAddressesTable,
  storeBillingAdjustmentsTable,
  storeBillingEventsTable,
  storeBillingInvoicesTable,
  storeBillingReminderDeliveriesTable,
  storeCompanyProfilesTable,
  storeImplementationChecklistItemsTable,
  storeImplementationChecklistEventsTable,
  storeModuleEntitlementsTable,
  storeSubscriptionPlanChangesTable,
  storeSubscriptionsTable,
  storesTable,
  userStorePermissionsTable,
  usersTable,
  type SelectStore,
  type StoreImplementationChecklistItemKey,
} from '@/services/db/schema'
import { storeBillingPaymentsTable } from '@/services/db/schema/store-billing-payments'
import { createHash, randomUUID } from 'node:crypto'
import {
  and,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  inArray,
  lte,
  ne,
  or,
  sql,
} from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { InternalStoreCreationValues } from './internal-store-creation-policy'
import {
  normalizeCurrencyAmount,
  normalizeInternalCnpj,
  normalizeInternalCpf,
  normalizeInternalEmail,
  normalizeInternalPhone,
} from './internal-store-creation-policy'
import {
  buildInternalStoreProfileChangeSummary,
  hasSensitiveInternalStoreProfileChange,
  normalizeInternalProfileNullableEmail,
  normalizeInternalProfileNullableText,
  type InternalStoreProfileEditValues,
} from './store-profile-edit-policy'
import {
  getStoreImplementationChecklistProgress,
  storeImplementationChecklistDefinitions,
  type StoreImplementationChecklistProgress,
} from './implementation-checklist-policy'
import {
  getStoreLifecycleAuditAction,
  validateStoreLifecycleTransition,
  type StoreLifecycleAccessEffect,
  type StoreLifecycleSubscriptionEffect,
  type StoreLifecycleTargetStatus,
} from './store-lifecycle-policy'
import {
  isStoreAccessBlockActive,
  validateStoreAccessBlockSchedule,
  type StoreAccessBlockActionValues,
  type StoreAccessUnblockActionValues,
} from './store-access-block-policy'
import {
  getExpectedSubscriptionBlockAt,
  type StoreSubscriptionTermsValues,
} from './subscription-terms-policy'
import {
  calculatePlanChangeProration,
  getModuleTreatmentLabel,
  getPlanChangeTimingLabel,
  getProrationPolicyLabel,
  resolvePlanChangeContractedAmount,
  resolvePlanChangeEffectiveAt,
  type StoreSubscriptionPlanChangeValues,
} from './subscription-plan-change-policy'
import {
  getModuleEntitlementOriginLabel,
  getModuleEntitlementStatusLabel,
  normalizeModuleAdditionalAmount,
  type StoreModuleManagementValues,
} from './store-module-management-policy'
import {
  assertManualBillingActionAllowed,
  calculateManualInvoiceAdjustment,
  formatMoneyAmount,
  getManualInvoiceOutstandingAmount,
  getManualInvoiceRefundableAmount,
  parseMoneyAmount,
  type AdjustBillingInvoiceAmountValues,
  type CancelBillingInvoiceValues,
  type CreateManualBillingInvoiceValues,
  type MarkManualBillingInvoicePaymentValues,
  type RefundBillingInvoiceValues,
  type RescheduleBillingInvoiceDueDateValues,
} from './billing-manual-actions-policy'

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
  company: {
    responsibleName: string | null
    responsibleEmail: string | null
    responsiblePhone: string | null
    companyEmail: string | null
    companyPhone: string | null
    companyTaxNumber: string | null
    responsibleTaxNumber: string | null
    city: string | null
    stateCode: string | null
  }
  billing: {
    planId: number | null
    planName: string | null
    planCode: string | null
    contractedAmount: string | null
    currency: string | null
    subscriptionStatus: string | null
    nextBillingAt: Date | null
  }
  implementationChecklist: {
    progress: StoreImplementationChecklistProgress
    items: {
      id: number
      itemKey: StoreImplementationChecklistItemKey
      title: string
      status: 'pending' | 'completed'
      requiredForActivation: boolean
      completedAt: Date | null
      completedByEmail: string | null
      completedByName: string | null
      observation: string | null
      updatedAt: Date
    }[]
  }
  admins: {
    userId: string
    email: string
    name: string | null
    phone: string | null
    userStatus: string
    isPrimaryResponsible: boolean
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
  modules: {
    moduleId: number
    code: string
    name: string
  }[]
}

export type InternalStorePendingPlanChange = {
  id: number
  fromPlanId: number
  toPlanId: number
  toPlanName: string
  toPlanCode: string
  timing: string
  status: string
  moduleTreatment: string
  keepCustomAmount: boolean
  previousContractedAmount: string
  nextContractedAmount: string
  currency: string
  effectiveAt: Date
  reason: string
  proration: Record<string, unknown> | null
  actorEmail: string
  createdAt: Date
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

export type InternalStoreDashboardIndicators = {
  updatedAt: Date
  totalStores: number
  filteredBy: {
    status?: InternalStoreStatus
    search?: string
  }
  commercialStatusCounts: Record<InternalStoreStatus, number>
  subscriptionStatusCounts: Record<
    'trialing' | 'active' | 'past_due' | 'paused' | 'canceled',
    number
  >
  financial: {
    monthlyContractedRevenue: number
    openReceivables: number
    overdueReceivables: number
    openInvoices: number
    overdueInvoices: number
  }
  access: {
    storesWithActiveAdmin: number
    storesWithoutActiveAdmin: number
    activeAdminLinks: number
    revokedAdminLinks: number
  }
}

export type InternalStoreAccessFilter =
  | 'with_active_admin'
  | 'without_active_admin'
  | 'with_revoked_admin'

export type InternalStoreListFilters = {
  status?: InternalStoreStatus
  search?: string
  planId?: number
  access?: InternalStoreAccessFilter
  city?: string
  createdFrom?: Date
  createdTo?: Date
  page?: number
  perPage?: number
}

export type InternalStoreListResult = {
  items: InternalStoreListItem[]
  pagination: {
    page: number
    perPage: number
    totalItems: number
    totalPages: number
    hasPreviousPage: boolean
    hasNextPage: boolean
  }
}

export type InternalStoreCityFilterOption = {
  city: string
  stateCode: string | null
}

export type InternalStoreOverview = Pick<
  SelectStore,
  | 'id'
  | 'name'
  | 'subdomain'
  | 'status'
  | 'statusReason'
  | 'statusUpdatedAt'
  | 'cancelledAt'
  | 'cancellationReason'
  | 'createdAt'
  | 'updatedAt'
> & {
  company: {
    companyName: string | null
    companyTaxNumber: string | null
    email: string | null
    phone1: string | null
    phone2: string | null
    responsibleName: string | null
    responsibleTaxNumber: string | null
    responsiblePhone: string | null
    responsibleEmail: string | null
  }
  commercial: {
    acquisitionSource: string | null
    salesOwner: string | null
    internalNotes: string | null
  }
  address: {
    postalCode: string | null
    street: string | null
    number: string | null
    district: string | null
    city: string | null
    stateCode: string | null
  }
  billing: {
    subscriptionId: number | null
    subscriptionStatus: string | null
    planId: number | null
    planCode: string | null
    planName: string | null
    contractedAmount: string | null
    currency: string | null
    billingInterval: string | null
    billingIntervalCount: number | null
    planDefaultAmount: string | null
    planCurrency: string | null
    planBillingInterval: string | null
    planBillingIntervalCount: number | null
    trialDays: number | null
    discountType: string | null
    discountValue: string | null
    discountValidUntil: Date | null
    paymentGraceDays: number
    billingAccessExemptionKind: string | null
    billingAccessExemptUntil: Date | null
    billingAccessExemptionReason: string | null
    expectedBlockAt: Date | null
    nextBillingAt: Date | null
    currentPeriodStart: Date | null
    currentPeriodEnd: Date | null
  }
  pendingPlanChange: InternalStorePendingPlanChange | null
  accessBlock: {
    id: number
    source: string
    reasonCode: string | null
    subscriptionId: number | null
    invoiceId: number | null
    dedupeKey: string | null
    reason: string
    notifyStoreOwner: boolean
    notificationNote: string | null
    scheduledUnblockAt: Date | null
    blockedAt: Date
    blockedByEmail: string
    blockedByName: string | null
    unblockedAt: Date | null
    unblockReason: string | null
    isActive: boolean
  } | null
  invoiceSummary: {
    totalInvoices: number
    openInvoices: number
    overdueInvoices: number
    paidInvoices: number
    closedInvoices: number
    totalAmount: number
    openAmount: number
    overdueAmount: number
    paidAmount: number
  }
  invoices: {
    id: number
    invoiceNumber: string
    status: string
    subtotalAmount: string
    discountAmount: string
    totalAmount: string
    amountPaid: string
    amountRefunded: string
    currency: string
    periodStart: Date
    periodEnd: Date
    dueAt: Date
    paidAt: Date | null
    cancelledAt: Date | null
    refundedAt: Date | null
    paymentMethod: string | null
    paymentStatus: string | null
    paymentProvider: string | null
    paymentPaidAt: Date | null
    paymentLink: string | null
    outstandingAmount: number
    expectedBlockAt: Date | null
    reminderCount: number
    latestReminderAt: Date | null
    createdAt: Date
  }[]
  billingReminders: {
    id: number
    invoiceId: number
    channel: string
    daysAfterDue: number
    status: string
    recipient: string | null
    title: string
    sentAt: Date | null
    skippedAt: Date | null
    createdAt: Date
  }[]
  billingAdjustments: {
    id: number
    planChangeId: number
    adjustmentType: string
    status: string
    amount: string
    currency: string
    competenceStart: Date
    competenceEnd: Date
    calculationSnapshot: Record<string, unknown>
    reason: string
    actorEmail: string
    createdAt: Date
  }[]
  modules: {
    moduleId: number
    code: string
    name: string
    description: string | null
    catalogStatus: string
    entitlementId: number | null
    origin: string | null
    status: string
    statusLabel: string
    originLabel: string
    isAdditional: boolean
    additionalAmount: string
    currency: string
    startsAt: Date | null
    endsAt: Date | null
    revokedAt: Date | null
    reason: string | null
    canActivate: boolean
    canDeactivate: boolean
    deactivateBlockedReason: string | null
    historyCount: number
  }[]
  users: {
    userId: string
    email: string
    name: string | null
    phone: string | null
    status: string
    role: string
    isPrimaryResponsible: boolean
    lastLoginAt: Date | null
    permissionCreatedAt: Date
    permissionUpdatedAt: Date
    revokedAt: Date | null
    revokedReason: string | null
  }[]
  metrics: {
    totalOrders: number
    digitalMenuOrders: number
    posOrders: number
    grossRevenue: number
    lastOrderAt: Date | null
    lastAccessAt: Date | null
  }
  auditLogs: InternalAuditLog[]
  billingEvents: {
    id: number
    eventType: string
    actorEmail: string | null
    reason: string | null
    createdAt: Date
  }[]
}

type InternalStoreTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0]

const storeStatusValues: InternalStoreStatus[] = [
  'implementing',
  'active',
  'inactive',
  'pending_recovery',
  'archived',
]

const accessFilterValues: InternalStoreAccessFilter[] = [
  'with_active_admin',
  'without_active_admin',
  'with_revoked_admin',
]

export const internalStoreListDefaultPerPage = 25
export const internalStoreListMaxPerPage = 50

const subscriptionStatusValues = [
  'trialing',
  'active',
  'past_due',
  'paused',
  'canceled',
] as const

const revenueSubscriptionStatuses: readonly string[] = [
  'trialing',
  'active',
  'past_due',
  'paused',
] as const

const receivableInvoiceStatuses: readonly string[] = ['pending', 'overdue']

const intervalToMonths: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  yearly: 12,
  annual: 12,
}

const buildStoreImplementationChecklistRows = ({
  storeId,
  now,
}: {
  storeId: number
  now: Date
}) =>
  storeImplementationChecklistDefinitions.map(definition => ({
    storeId,
    itemKey: definition.key,
    title: definition.title,
    requiredForActivation: definition.requiredForActivation,
    updatedAt: now,
  }))

async function ensureStoreImplementationChecklistForStores(storeIds: number[]) {
  if (storeIds.length === 0) return

  const now = new Date()
  await db
    .insert(storeImplementationChecklistItemsTable)
    .values(
      storeIds.flatMap(storeId =>
        buildStoreImplementationChecklistRows({ storeId, now })
      )
    )
    .onConflictDoNothing({
      target: [
        storeImplementationChecklistItemsTable.storeId,
        storeImplementationChecklistItemsTable.itemKey,
      ],
    })
}

async function ensureStoreImplementationChecklistForStoreTransaction({
  tx,
  storeId,
  now,
}: {
  tx: InternalStoreTransaction
  storeId: number
  now: Date
}) {
  await tx
    .insert(storeImplementationChecklistItemsTable)
    .values(buildStoreImplementationChecklistRows({ storeId, now }))
    .onConflictDoNothing({
      target: [
        storeImplementationChecklistItemsTable.storeId,
        storeImplementationChecklistItemsTable.itemKey,
      ],
    })
}

export function parseStoreStatus(
  value: unknown
): InternalStoreStatus | undefined {
  if (typeof value !== 'string') return undefined
  if (!storeStatusValues.includes(value as InternalStoreStatus))
    return undefined

  return value as InternalStoreStatus
}

export function parseInternalStoreAccessFilter(
  value: unknown
): InternalStoreAccessFilter | undefined {
  if (typeof value !== 'string') return undefined
  if (!accessFilterValues.includes(value as InternalStoreAccessFilter))
    return undefined

  return value as InternalStoreAccessFilter
}

export function parseInternalStorePositiveInteger(value: unknown) {
  const parsed = typeof value === 'string' ? Number(value) : value
  if (typeof parsed !== 'number' || !Number.isInteger(parsed) || parsed <= 0) {
    return undefined
  }

  return parsed
}

export function parseInternalStoreDateFilter(
  value: unknown,
  boundary: 'start' | 'end'
) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined
  }

  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return undefined

  if (boundary === 'end') {
    date.setUTCHours(23, 59, 59, 999)
  }

  return date
}

function buildInternalStoreWhere({
  status,
  search,
  planId,
  access,
  city,
  createdFrom,
  createdTo,
}: InternalStoreListFilters): SQL | undefined {
  const trimmedSearch = search?.trim()
  const searchPattern = trimmedSearch
    ? `%${trimmedSearch.toLowerCase()}%`
    : null
  const searchDigits = trimmedSearch?.replace(/\D/g, '') ?? ''
  const searchDigitsPattern = searchDigits ? `%${searchDigits}%` : null
  const trimmedCity = city?.trim()

  return and(
    status ? eq(storesTable.status, status) : undefined,
    planId ? eq(storeSubscriptionsTable.planId, planId) : undefined,
    trimmedCity
      ? sql`lower(coalesce(${storeCompanyProfilesTable.city}, ${storeAddressesTable.city}, '')) = ${trimmedCity.toLowerCase()}`
      : undefined,
    createdFrom ? gte(storesTable.createdAt, createdFrom) : undefined,
    createdTo ? lte(storesTable.createdAt, createdTo) : undefined,
    access === 'with_active_admin'
      ? sql`exists (
          select 1
          from ${userStorePermissionsTable}
          where ${userStorePermissionsTable.storeId} = ${storesTable.id}
            and ${userStorePermissionsTable.role} = 'owner'
            and ${userStorePermissionsTable.revokedAt} is null
        )`
      : undefined,
    access === 'without_active_admin'
      ? sql`not exists (
          select 1
          from ${userStorePermissionsTable}
          where ${userStorePermissionsTable.storeId} = ${storesTable.id}
            and ${userStorePermissionsTable.role} = 'owner'
            and ${userStorePermissionsTable.revokedAt} is null
        )`
      : undefined,
    access === 'with_revoked_admin'
      ? sql`exists (
          select 1
          from ${userStorePermissionsTable}
          where ${userStorePermissionsTable.storeId} = ${storesTable.id}
            and ${userStorePermissionsTable.role} = 'owner'
            and ${userStorePermissionsTable.revokedAt} is not null
        )`
      : undefined,
    searchPattern
      ? sql`(
          lower(${storesTable.name}) like ${searchPattern}
          or lower(${storesTable.subdomain}) like ${searchPattern}
          or lower(coalesce(${storeCompanyProfilesTable.companyName}, '')) like ${searchPattern}
          or lower(coalesce(${storeCompanyProfilesTable.email}, '')) like ${searchPattern}
          or lower(coalesce(${storeCompanyProfilesTable.responsibleName}, '')) like ${searchPattern}
          or lower(coalesce(${storeCompanyProfilesTable.responsibleEmail}, '')) like ${searchPattern}
          or ${storesTable.id}::text = ${trimmedSearch}
          or exists (
            select 1
            from ${userStorePermissionsTable}
            join ${usersTable} on ${usersTable.id} = ${userStorePermissionsTable.userId}
            where ${userStorePermissionsTable.storeId} = ${storesTable.id}
              and (
                lower(${usersTable.email}) like ${searchPattern}
                or lower(coalesce(${usersTable.name}, '')) like ${searchPattern}
              )
          )
        )`
      : undefined,
    searchDigitsPattern
      ? sql`(
          regexp_replace(coalesce(${storeCompanyProfilesTable.companyTaxNumber}, ''), '\D', '', 'g') like ${searchDigitsPattern}
          or regexp_replace(coalesce(${storeCompanyProfilesTable.responsibleTaxNumber}, ''), '\D', '', 'g') like ${searchDigitsPattern}
          or regexp_replace(coalesce(${storeCompanyProfilesTable.phone1}, ''), '\D', '', 'g') like ${searchDigitsPattern}
          or regexp_replace(coalesce(${storeCompanyProfilesTable.phone2}, ''), '\D', '', 'g') like ${searchDigitsPattern}
          or regexp_replace(coalesce(${storeCompanyProfilesTable.responsiblePhone}, ''), '\D', '', 'g') like ${searchDigitsPattern}
          or exists (
            select 1
            from ${userStorePermissionsTable}
            join ${usersTable} on ${usersTable.id} = ${userStorePermissionsTable.userId}
            where ${userStorePermissionsTable.storeId} = ${storesTable.id}
              and regexp_replace(coalesce(${usersTable.phone}, ''), '\D', '', 'g') like ${searchDigitsPattern}
          )
        )`
      : undefined
  )
}

export function parseInternalDashboardAmount(value: string | number | null) {
  if (value === null) return 0

  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return 0

  return parsed
}

export function getMonthlyContractedRevenue({
  contractedAmount,
  billingInterval,
  billingIntervalCount,
}: {
  contractedAmount: string | number | null
  billingInterval: string
  billingIntervalCount: number
}) {
  const months =
    (intervalToMonths[billingInterval] ?? 1) * Math.max(1, billingIntervalCount)

  return parseInternalDashboardAmount(contractedAmount) / months
}

export function getInvoiceReceivableAmount({
  totalAmount,
  amountPaid,
}: {
  totalAmount: string | number | null
  amountPaid: string | number | null
}) {
  return Math.max(
    0,
    parseInternalDashboardAmount(totalAmount) -
      parseInternalDashboardAmount(amountPaid)
  )
}

const asRecordMetadata = (metadata: unknown): Record<string, unknown> =>
  metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {}

const getInvoiceFinancialSnapshot = (
  invoice: Pick<
    typeof storeBillingInvoicesTable.$inferSelect,
    | 'status'
    | 'subtotalAmount'
    | 'discountAmount'
    | 'totalAmount'
    | 'amountPaid'
    | 'amountRefunded'
    | 'dueAt'
    | 'paidAt'
    | 'cancelledAt'
    | 'refundedAt'
  >
) => ({
  status: invoice.status,
  subtotalAmount: invoice.subtotalAmount,
  discountAmount: invoice.discountAmount,
  totalAmount: invoice.totalAmount,
  amountPaid: invoice.amountPaid,
  amountRefunded: invoice.amountRefunded,
  dueAt: invoice.dueAt.toISOString(),
  paidAt: invoice.paidAt?.toISOString() ?? null,
  cancelledAt: invoice.cancelledAt?.toISOString() ?? null,
  refundedAt: invoice.refundedAt?.toISOString() ?? null,
})

const withManualBillingMetadata = ({
  metadata,
  action,
  operator,
  reason,
  now,
}: {
  metadata: unknown
  action: string
  operator: InternalOperator
  reason: string
  now: Date
}) => ({
  ...asRecordMetadata(metadata),
  lastManualAction: {
    action,
    actorEmail: operator.email,
    actorClerkId: operator.clerkId,
    reason,
    at: now.toISOString(),
  },
})

const insertManualBillingAuditLog = async ({
  tx,
  action,
  operator,
  store,
  reason,
}: {
  tx: InternalStoreTransaction
  action: (typeof internalOperationAuditLogsTable.$inferInsert)['action']
  operator: InternalOperator
  store: Pick<SelectStore, 'id' | 'status'>
  reason: string
}) => {
  await tx.insert(internalOperationAuditLogsTable).values({
    action,
    actorClerkId: operator.clerkId,
    actorEmail: operator.email,
    actorName: operator.name,
    storeId: store.id,
    targetUserEmail: null,
    previousStoreStatus: store.status,
    newStoreStatus: store.status,
    reason,
  })
}

function getMetadataString(metadata: unknown, keys: string[]): string | null {
  if (!metadata || typeof metadata !== 'object') return null

  const record = metadata as Record<string, unknown>

  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }

  return null
}

function getBillingPaymentLink({
  invoiceMetadata,
  paymentMetadata,
}: {
  invoiceMetadata: unknown
  paymentMetadata: unknown
}) {
  const linkKeys = [
    'paymentLink',
    'paymentLinkUrl',
    'paymentUrl',
    'checkoutUrl',
    'invoiceUrl',
    'hostedInvoiceUrl',
  ]

  return (
    getMetadataString(paymentMetadata, linkKeys) ??
    getMetadataString(invoiceMetadata, linkKeys)
  )
}

function getInvoiceStatusWhereClause(
  storeId: number,
  invoiceStatusFilter: string | undefined
) {
  const storeWhereClause = eq(storeBillingInvoicesTable.storeId, storeId)

  if (invoiceStatusFilter === 'open') {
    return and(
      storeWhereClause,
      eq(storeBillingInvoicesTable.status, 'pending'),
      gte(storeBillingInvoicesTable.dueAt, new Date())
    )
  }

  if (invoiceStatusFilter === 'overdue') {
    return and(
      storeWhereClause,
      or(
        eq(storeBillingInvoicesTable.status, 'overdue'),
        and(
          eq(storeBillingInvoicesTable.status, 'pending'),
          lte(storeBillingInvoicesTable.dueAt, new Date())
        )
      )
    )
  }

  if (invoiceStatusFilter === 'paid') {
    return and(storeWhereClause, eq(storeBillingInvoicesTable.status, 'paid'))
  }

  if (invoiceStatusFilter === 'closed') {
    return and(
      storeWhereClause,
      inArray(storeBillingInvoicesTable.status, ['cancelled', 'refunded'])
    )
  }

  return storeWhereClause
}

function emptyInternalDashboardIndicators({
  status,
  search,
}: {
  status?: InternalStoreStatus
  search?: string
}): InternalStoreDashboardIndicators {
  return {
    updatedAt: new Date(),
    totalStores: 0,
    filteredBy: {
      status,
      search: search?.trim() || undefined,
    },
    commercialStatusCounts: Object.fromEntries(
      storeStatusValues.map(statusValue => [statusValue, 0])
    ) as Record<InternalStoreStatus, number>,
    subscriptionStatusCounts: Object.fromEntries(
      subscriptionStatusValues.map(statusValue => [statusValue, 0])
    ) as InternalStoreDashboardIndicators['subscriptionStatusCounts'],
    financial: {
      monthlyContractedRevenue: 0,
      openReceivables: 0,
      overdueReceivables: 0,
      openInvoices: 0,
      overdueInvoices: 0,
    },
    access: {
      storesWithActiveAdmin: 0,
      storesWithoutActiveAdmin: 0,
      activeAdminLinks: 0,
      revokedAdminLinks: 0,
    },
  }
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

export async function getInternalStoreDashboardIndicators({
  status,
  search,
  planId,
  access,
  city,
  createdFrom,
  createdTo,
}: InternalStoreListFilters): Promise<InternalStoreDashboardIndicators> {
  const indicators = emptyInternalDashboardIndicators({ status, search })

  const filteredStores = await db
    .select({
      id: storesTable.id,
      status: storesTable.status,
    })
    .from(storesTable)
    .leftJoin(
      storeCompanyProfilesTable,
      eq(storeCompanyProfilesTable.storeId, storesTable.id)
    )
    .leftJoin(
      storeAddressesTable,
      and(
        eq(storeAddressesTable.storeId, storesTable.id),
        eq(storeAddressesTable.addressType, 'business'),
        eq(storeAddressesTable.isPrimary, true)
      )
    )
    .leftJoin(
      storeSubscriptionsTable,
      and(
        eq(storeSubscriptionsTable.storeId, storesTable.id),
        sql`${storeSubscriptionsTable.status} in ('trialing', 'active', 'past_due', 'paused')`
      )
    )
    .where(
      buildInternalStoreWhere({
        status,
        search,
        planId,
        access,
        city,
        createdFrom,
        createdTo,
      })
    )

  if (filteredStores.length === 0) return indicators

  const storeIds = filteredStores.map(store => store.id)
  indicators.totalStores = filteredStores.length

  for (const store of filteredStores) {
    indicators.commercialStatusCounts[store.status] += 1
  }

  const [subscriptionRows, invoiceRows, permissionRows] = await Promise.all([
    db
      .select({
        status: storeSubscriptionsTable.status,
        contractedAmount: storeSubscriptionsTable.contractedAmount,
        billingInterval: storeSubscriptionsTable.billingInterval,
        billingIntervalCount: storeSubscriptionsTable.billingIntervalCount,
      })
      .from(storeSubscriptionsTable)
      .where(inArray(storeSubscriptionsTable.storeId, storeIds)),
    db
      .select({
        status: storeBillingInvoicesTable.status,
        totalAmount: storeBillingInvoicesTable.totalAmount,
        amountPaid: storeBillingInvoicesTable.amountPaid,
        dueAt: storeBillingInvoicesTable.dueAt,
      })
      .from(storeBillingInvoicesTable)
      .where(inArray(storeBillingInvoicesTable.storeId, storeIds)),
    db
      .select({
        storeId: userStorePermissionsTable.storeId,
        revokedAt: userStorePermissionsTable.revokedAt,
      })
      .from(userStorePermissionsTable)
      .where(
        and(
          inArray(userStorePermissionsTable.storeId, storeIds),
          eq(userStorePermissionsTable.role, 'owner')
        )
      ),
  ])

  for (const subscription of subscriptionRows) {
    indicators.subscriptionStatusCounts[subscription.status] += 1

    if (revenueSubscriptionStatuses.includes(subscription.status)) {
      indicators.financial.monthlyContractedRevenue +=
        getMonthlyContractedRevenue(subscription)
    }
  }

  const now = indicators.updatedAt.getTime()

  for (const invoice of invoiceRows) {
    if (!receivableInvoiceStatuses.includes(invoice.status)) continue

    const receivableAmount = getInvoiceReceivableAmount(invoice)
    indicators.financial.openReceivables += receivableAmount
    indicators.financial.openInvoices += 1

    if (invoice.status === 'overdue' || invoice.dueAt.getTime() < now) {
      indicators.financial.overdueReceivables += receivableAmount
      indicators.financial.overdueInvoices += 1
    }
  }

  const storesWithActiveAdmin = new Set<number>()

  for (const permission of permissionRows) {
    if (permission.revokedAt) {
      indicators.access.revokedAdminLinks += 1
      continue
    }

    indicators.access.activeAdminLinks += 1
    storesWithActiveAdmin.add(permission.storeId)
  }

  indicators.access.storesWithActiveAdmin = storesWithActiveAdmin.size
  indicators.access.storesWithoutActiveAdmin =
    indicators.totalStores - storesWithActiveAdmin.size

  return indicators
}

export async function listInternalStores({
  status,
  search,
  planId,
  access,
  city,
  createdFrom,
  createdTo,
  page = 1,
  perPage = internalStoreListDefaultPerPage,
}: InternalStoreListFilters): Promise<InternalStoreListResult> {
  const safePage = Math.max(1, page)
  const safePerPage = Math.min(
    internalStoreListMaxPerPage,
    Math.max(1, perPage)
  )
  const where = buildInternalStoreWhere({
    status,
    search,
    planId,
    access,
    city,
    createdFrom,
    createdTo,
  })

  const [{ totalItems }] = await db
    .select({
      totalItems: countDistinct(storesTable.id),
    })
    .from(storesTable)
    .leftJoin(
      storeCompanyProfilesTable,
      eq(storeCompanyProfilesTable.storeId, storesTable.id)
    )
    .leftJoin(
      storeAddressesTable,
      and(
        eq(storeAddressesTable.storeId, storesTable.id),
        eq(storeAddressesTable.addressType, 'business'),
        eq(storeAddressesTable.isPrimary, true)
      )
    )
    .leftJoin(
      storeSubscriptionsTable,
      and(
        eq(storeSubscriptionsTable.storeId, storesTable.id),
        sql`${storeSubscriptionsTable.status} in ('trialing', 'active', 'past_due', 'paused')`
      )
    )
    .where(where)

  const totalPages = Math.max(1, Math.ceil(totalItems / safePerPage))
  const currentPage = Math.min(safePage, totalPages)

  const stores = await db
    .select({
      id: storesTable.id,
      name: storesTable.name,
      subdomain: storesTable.subdomain,
      status: storesTable.status,
      statusReason: storesTable.statusReason,
      statusUpdatedAt: storesTable.statusUpdatedAt,
      cancelledAt: storesTable.cancelledAt,
      cancellationReason: storesTable.cancellationReason,
      createdAt: storesTable.createdAt,
      updatedAt: storesTable.updatedAt,
      responsibleName: storeCompanyProfilesTable.responsibleName,
      responsibleEmail: storeCompanyProfilesTable.responsibleEmail,
      responsiblePhone: storeCompanyProfilesTable.responsiblePhone,
      companyEmail: storeCompanyProfilesTable.email,
      companyPhone: storeCompanyProfilesTable.phone1,
      companyTaxNumber: storeCompanyProfilesTable.companyTaxNumber,
      responsibleTaxNumber: storeCompanyProfilesTable.responsibleTaxNumber,
      companyCity: storeCompanyProfilesTable.city,
      companyStateCode: storeCompanyProfilesTable.stateCode,
      addressCity: storeAddressesTable.city,
      addressStateCode: storeAddressesTable.stateCode,
      planId: billingPlansTable.id,
      planName: billingPlansTable.name,
      planCode: billingPlansTable.code,
      contractedAmount: storeSubscriptionsTable.contractedAmount,
      currency: storeSubscriptionsTable.currency,
      subscriptionStatus: storeSubscriptionsTable.status,
      nextBillingAt: storeSubscriptionsTable.nextBillingAt,
    })
    .from(storesTable)
    .leftJoin(
      storeCompanyProfilesTable,
      eq(storeCompanyProfilesTable.storeId, storesTable.id)
    )
    .leftJoin(
      storeAddressesTable,
      and(
        eq(storeAddressesTable.storeId, storesTable.id),
        eq(storeAddressesTable.addressType, 'business'),
        eq(storeAddressesTable.isPrimary, true)
      )
    )
    .leftJoin(
      storeSubscriptionsTable,
      and(
        eq(storeSubscriptionsTable.storeId, storesTable.id),
        sql`${storeSubscriptionsTable.status} in ('trialing', 'active', 'past_due', 'paused')`
      )
    )
    .leftJoin(
      billingPlansTable,
      eq(billingPlansTable.id, storeSubscriptionsTable.planId)
    )
    .where(where)
    .orderBy(desc(storesTable.statusUpdatedAt), desc(storesTable.id))
    .limit(safePerPage)
    .offset((currentPage - 1) * safePerPage)

  if (stores.length === 0) {
    return {
      items: [],
      pagination: {
        page: currentPage,
        perPage: safePerPage,
        totalItems,
        totalPages,
        hasPreviousPage: currentPage > 1,
        hasNextPage: currentPage < totalPages,
      },
    }
  }

  const storeIds = stores.map(store => store.id)
  await ensureStoreImplementationChecklistForStores(storeIds)

  const checklistRows = await db
    .select({
      id: storeImplementationChecklistItemsTable.id,
      storeId: storeImplementationChecklistItemsTable.storeId,
      itemKey: storeImplementationChecklistItemsTable.itemKey,
      title: storeImplementationChecklistItemsTable.title,
      status: storeImplementationChecklistItemsTable.status,
      requiredForActivation:
        storeImplementationChecklistItemsTable.requiredForActivation,
      completedAt: storeImplementationChecklistItemsTable.completedAt,
      completedByEmail: storeImplementationChecklistItemsTable.completedByEmail,
      completedByName: storeImplementationChecklistItemsTable.completedByName,
      observation: storeImplementationChecklistItemsTable.observation,
      updatedAt: storeImplementationChecklistItemsTable.updatedAt,
    })
    .from(storeImplementationChecklistItemsTable)
    .where(inArray(storeImplementationChecklistItemsTable.storeId, storeIds))
    .orderBy(
      storeImplementationChecklistItemsTable.storeId,
      storeImplementationChecklistItemsTable.itemKey
    )

  const checklistByStoreId = new Map<
    number,
    InternalStoreListItem['implementationChecklist']['items']
  >()

  for (const item of checklistRows) {
    const items = checklistByStoreId.get(item.storeId) ?? []
    items.push({
      id: item.id,
      itemKey: item.itemKey,
      title: item.title,
      status: item.status,
      requiredForActivation: item.requiredForActivation,
      completedAt: item.completedAt,
      completedByEmail: item.completedByEmail,
      completedByName: item.completedByName,
      observation: item.observation,
      updatedAt: item.updatedAt,
    })
    checklistByStoreId.set(item.storeId, items)
  }

  const adminRows = await db
    .select({
      storeId: userStorePermissionsTable.storeId,
      userId: usersTable.id,
      email: usersTable.email,
      phone: usersTable.phone,
      name: usersTable.name,
      userStatus: usersTable.status,
      isPrimaryResponsible: userStorePermissionsTable.isPrimaryResponsible,
      revokedAt: userStorePermissionsTable.revokedAt,
      revokedReason: userStorePermissionsTable.revokedReason,
    })
    .from(userStorePermissionsTable)
    .innerJoin(usersTable, eq(usersTable.id, userStorePermissionsTable.userId))
    .where(
      and(
        inArray(userStorePermissionsTable.storeId, storeIds),
        eq(userStorePermissionsTable.role, 'owner')
      )
    )

  const adminsByStoreId = new Map<number, InternalStoreListItem['admins']>()

  for (const admin of adminRows) {
    const admins = adminsByStoreId.get(admin.storeId) ?? []
    admins.push({
      userId: admin.userId,
      email: admin.email,
      phone: admin.phone,
      name: admin.name,
      userStatus: admin.userStatus,
      isPrimaryResponsible: admin.isPrimaryResponsible,
      revokedAt: admin.revokedAt,
      revokedReason: admin.revokedReason,
    })
    adminsByStoreId.set(admin.storeId, admins)
  }

  return {
    items: stores.map(store => ({
      id: store.id,
      name: store.name,
      subdomain: store.subdomain,
      status: store.status,
      statusReason: store.statusReason,
      statusUpdatedAt: store.statusUpdatedAt,
      createdAt: store.createdAt,
      updatedAt: store.updatedAt,
      company: {
        responsibleName: store.responsibleName,
        responsibleEmail: store.responsibleEmail,
        responsiblePhone: store.responsiblePhone,
        companyEmail: store.companyEmail,
        companyPhone: store.companyPhone,
        companyTaxNumber: maskInternalStoreSensitiveDigits(
          store.companyTaxNumber ?? '',
          'CNPJ nao informado'
        ),
        responsibleTaxNumber: maskInternalStoreSensitiveDigits(
          store.responsibleTaxNumber ?? '',
          'CPF nao informado'
        ),
        city: store.companyCity ?? store.addressCity,
        stateCode: store.companyStateCode ?? store.addressStateCode,
      },
      billing: {
        planId: store.planId,
        planName: store.planName,
        planCode: store.planCode,
        contractedAmount: store.contractedAmount,
        currency: store.currency,
        subscriptionStatus: store.subscriptionStatus,
        nextBillingAt: store.nextBillingAt,
      },
      implementationChecklist: {
        items: checklistByStoreId.get(store.id) ?? [],
        progress: getStoreImplementationChecklistProgress(
          checklistByStoreId.get(store.id) ?? []
        ),
      },
      admins: adminsByStoreId.get(store.id) ?? [],
    })),
    pagination: {
      page: currentPage,
      perPage: safePerPage,
      totalItems,
      totalPages,
      hasPreviousPage: currentPage > 1,
      hasNextPage: currentPage < totalPages,
    },
  }
}

export async function getInternalStoreOverview(
  storeId: number,
  options: { includeBillingInvoices?: boolean; invoiceStatus?: string } = {}
): Promise<InternalStoreOverview | null> {
  const includeBillingInvoices = options.includeBillingInvoices ?? true
  const invoiceStatusFilter = options.invoiceStatus
  const [store] = await db
    .select({
      id: storesTable.id,
      name: storesTable.name,
      subdomain: storesTable.subdomain,
      status: storesTable.status,
      statusReason: storesTable.statusReason,
      statusUpdatedAt: storesTable.statusUpdatedAt,
      cancelledAt: storesTable.cancelledAt,
      cancellationReason: storesTable.cancellationReason,
      createdAt: storesTable.createdAt,
      updatedAt: storesTable.updatedAt,
      companyName: storeCompanyProfilesTable.companyName,
      companyTaxNumber: storeCompanyProfilesTable.companyTaxNumber,
      companyEmail: storeCompanyProfilesTable.email,
      companyPhone1: storeCompanyProfilesTable.phone1,
      companyPhone2: storeCompanyProfilesTable.phone2,
      responsibleName: storeCompanyProfilesTable.responsibleName,
      responsibleTaxNumber: storeCompanyProfilesTable.responsibleTaxNumber,
      responsiblePhone: storeCompanyProfilesTable.responsiblePhone,
      responsibleEmail: storeCompanyProfilesTable.responsibleEmail,
      acquisitionSource: storeCompanyProfilesTable.acquisitionSource,
      salesOwner: storeCompanyProfilesTable.salesOwner,
      internalNotes: storeCompanyProfilesTable.internalNotes,
      companyPostalCode: storeCompanyProfilesTable.postalCode,
      companyStreet: storeCompanyProfilesTable.street,
      companyNumber: storeCompanyProfilesTable.number,
      companyDistrict: storeCompanyProfilesTable.district,
      companyCity: storeCompanyProfilesTable.city,
      companyStateCode: storeCompanyProfilesTable.stateCode,
      addressPostalCode: storeAddressesTable.postalCode,
      addressStreet: storeAddressesTable.street,
      addressNumber: storeAddressesTable.number,
      addressDistrict: storeAddressesTable.district,
      addressCity: storeAddressesTable.city,
      addressStateCode: storeAddressesTable.stateCode,
      subscriptionId: storeSubscriptionsTable.id,
      subscriptionStatus: storeSubscriptionsTable.status,
      contractedAmount: storeSubscriptionsTable.contractedAmount,
      currency: storeSubscriptionsTable.currency,
      billingInterval: storeSubscriptionsTable.billingInterval,
      billingIntervalCount: storeSubscriptionsTable.billingIntervalCount,
      discountType: storeSubscriptionsTable.discountType,
      discountValue: storeSubscriptionsTable.discountValue,
      discountValidUntil: storeSubscriptionsTable.discountValidUntil,
      paymentGraceDays: storeSubscriptionsTable.paymentGraceDays,
      billingAccessExemptionKind:
        storeSubscriptionsTable.billingAccessExemptionKind,
      billingAccessExemptUntil:
        storeSubscriptionsTable.billingAccessExemptUntil,
      billingAccessExemptionReason:
        storeSubscriptionsTable.billingAccessExemptionReason,
      nextBillingAt: storeSubscriptionsTable.nextBillingAt,
      currentPeriodStart: storeSubscriptionsTable.currentPeriodStart,
      currentPeriodEnd: storeSubscriptionsTable.currentPeriodEnd,
      planId: billingPlansTable.id,
      planCode: billingPlansTable.code,
      planName: billingPlansTable.name,
      planDefaultAmount: billingPlansTable.defaultAmount,
      planCurrency: billingPlansTable.currency,
      planBillingInterval: billingPlansTable.billingInterval,
      planBillingIntervalCount: billingPlansTable.billingIntervalCount,
      trialDays: billingPlansTable.trialDays,
    })
    .from(storesTable)
    .leftJoin(
      storeCompanyProfilesTable,
      eq(storeCompanyProfilesTable.storeId, storesTable.id)
    )
    .leftJoin(
      storeAddressesTable,
      and(
        eq(storeAddressesTable.storeId, storesTable.id),
        eq(storeAddressesTable.addressType, 'business'),
        eq(storeAddressesTable.isPrimary, true)
      )
    )
    .leftJoin(
      storeSubscriptionsTable,
      and(
        eq(storeSubscriptionsTable.storeId, storesTable.id),
        sql`${storeSubscriptionsTable.status} in ('trialing', 'active', 'past_due', 'paused')`
      )
    )
    .leftJoin(
      billingPlansTable,
      eq(billingPlansTable.id, storeSubscriptionsTable.planId)
    )
    .where(eq(storesTable.id, storeId))
    .limit(1)

  if (!store) return null

  await ensureStoreImplementationChecklistForStores([store.id])

  const [
    invoiceRows,
    invoiceSummaryRows,
    moduleCatalogRows,
    moduleEntitlementRows,
    userRows,
    metricsRows,
    auditLogs,
    billingEvents,
    accessBlockRows,
    pendingPlanChangeRows,
    billingAdjustmentRows,
  ] = await Promise.all([
    includeBillingInvoices
      ? db
          .select({
            id: storeBillingInvoicesTable.id,
            invoiceNumber: storeBillingInvoicesTable.invoiceNumber,
            status: storeBillingInvoicesTable.status,
            subtotalAmount: storeBillingInvoicesTable.subtotalAmount,
            discountAmount: storeBillingInvoicesTable.discountAmount,
            totalAmount: storeBillingInvoicesTable.totalAmount,
            amountPaid: storeBillingInvoicesTable.amountPaid,
            amountRefunded: storeBillingInvoicesTable.amountRefunded,
            currency: storeBillingInvoicesTable.currency,
            periodStart: storeBillingInvoicesTable.periodStart,
            periodEnd: storeBillingInvoicesTable.periodEnd,
            dueAt: storeBillingInvoicesTable.dueAt,
            paidAt: storeBillingInvoicesTable.paidAt,
            cancelledAt: storeBillingInvoicesTable.cancelledAt,
            refundedAt: storeBillingInvoicesTable.refundedAt,
            metadata: storeBillingInvoicesTable.metadata,
            createdAt: storeBillingInvoicesTable.createdAt,
          })
          .from(storeBillingInvoicesTable)
          .where(getInvoiceStatusWhereClause(storeId, invoiceStatusFilter))
          .orderBy(desc(storeBillingInvoicesTable.dueAt))
          .limit(50)
      : Promise.resolve([]),
    includeBillingInvoices
      ? db
          .select({
            status: storeBillingInvoicesTable.status,
            totalAmount: storeBillingInvoicesTable.totalAmount,
            amountPaid: storeBillingInvoicesTable.amountPaid,
            dueAt: storeBillingInvoicesTable.dueAt,
          })
          .from(storeBillingInvoicesTable)
          .where(eq(storeBillingInvoicesTable.storeId, storeId))
      : Promise.resolve([]),
    db
      .select({
        id: billingModulesTable.id,
        code: billingModulesTable.code,
        name: billingModulesTable.name,
        description: billingModulesTable.description,
        status: billingModulesTable.status,
      })
      .from(billingModulesTable)
      .where(eq(billingModulesTable.status, 'active'))
      .orderBy(billingModulesTable.name),
    db
      .select({
        id: storeModuleEntitlementsTable.id,
        moduleId: storeModuleEntitlementsTable.moduleId,
        code: billingModulesTable.code,
        name: billingModulesTable.name,
        description: billingModulesTable.description,
        origin: storeModuleEntitlementsTable.origin,
        status: storeModuleEntitlementsTable.status,
        isAdditional: storeModuleEntitlementsTable.isAdditional,
        additionalAmount: storeModuleEntitlementsTable.additionalAmount,
        currency: storeModuleEntitlementsTable.currency,
        startsAt: storeModuleEntitlementsTable.startsAt,
        endsAt: storeModuleEntitlementsTable.endsAt,
        revokedAt: storeModuleEntitlementsTable.revokedAt,
        reason: storeModuleEntitlementsTable.reason,
        createdAt: storeModuleEntitlementsTable.createdAt,
      })
      .from(storeModuleEntitlementsTable)
      .innerJoin(
        billingModulesTable,
        eq(billingModulesTable.id, storeModuleEntitlementsTable.moduleId)
      )
      .where(eq(storeModuleEntitlementsTable.storeId, storeId))
      .orderBy(
        billingModulesTable.name,
        desc(storeModuleEntitlementsTable.createdAt)
      ),
    db
      .select({
        userId: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
        phone: usersTable.phone,
        status: usersTable.status,
        role: userStorePermissionsTable.role,
        isPrimaryResponsible: userStorePermissionsTable.isPrimaryResponsible,
        lastLoginAt: usersTable.lastLoginAt,
        permissionCreatedAt: userStorePermissionsTable.createdAt,
        permissionUpdatedAt: userStorePermissionsTable.updatedAt,
        revokedAt: userStorePermissionsTable.revokedAt,
        revokedReason: userStorePermissionsTable.revokedReason,
      })
      .from(userStorePermissionsTable)
      .innerJoin(
        usersTable,
        eq(usersTable.id, userStorePermissionsTable.userId)
      )
      .where(eq(userStorePermissionsTable.storeId, storeId))
      .orderBy(
        userStorePermissionsTable.revokedAt,
        desc(userStorePermissionsTable.isPrimaryResponsible),
        usersTable.email
      ),
    db
      .select({
        totalOrders: count(ordersTable.id),
        digitalMenuOrders: sql<number>`count(*) filter (where ${ordersTable.salesChannel} = 'DIGITAL_MENU')::integer`,
        posOrders: sql<number>`count(*) filter (where ${ordersTable.salesChannel} = 'POS')::integer`,
        grossRevenue: sql<string>`coalesce(sum(${ordersTable.totalPrice}), 0)::text`,
        lastOrderAt: sql<Date | null>`max(${ordersTable.createdAt})`,
      })
      .from(ordersTable)
      .where(eq(ordersTable.storeId, storeId)),
    db
      .select()
      .from(internalOperationAuditLogsTable)
      .where(eq(internalOperationAuditLogsTable.storeId, storeId))
      .orderBy(desc(internalOperationAuditLogsTable.createdAt))
      .limit(12),
    db
      .select({
        id: storeBillingEventsTable.id,
        eventType: storeBillingEventsTable.eventType,
        actorEmail: storeBillingEventsTable.actorEmail,
        reason: storeBillingEventsTable.reason,
        createdAt: storeBillingEventsTable.createdAt,
      })
      .from(storeBillingEventsTable)
      .where(eq(storeBillingEventsTable.storeId, storeId))
      .orderBy(desc(storeBillingEventsTable.createdAt))
      .limit(12),
    db
      .select({
        id: storeAccessBlocksTable.id,
        source: storeAccessBlocksTable.source,
        reasonCode: storeAccessBlocksTable.reasonCode,
        subscriptionId: storeAccessBlocksTable.subscriptionId,
        invoiceId: storeAccessBlocksTable.invoiceId,
        dedupeKey: storeAccessBlocksTable.dedupeKey,
        reason: storeAccessBlocksTable.reason,
        notifyStoreOwner: storeAccessBlocksTable.notifyStoreOwner,
        notificationNote: storeAccessBlocksTable.notificationNote,
        scheduledUnblockAt: storeAccessBlocksTable.scheduledUnblockAt,
        blockedAt: storeAccessBlocksTable.blockedAt,
        blockedByEmail: storeAccessBlocksTable.blockedByEmail,
        blockedByName: storeAccessBlocksTable.blockedByName,
        unblockedAt: storeAccessBlocksTable.unblockedAt,
        unblockReason: storeAccessBlocksTable.unblockReason,
      })
      .from(storeAccessBlocksTable)
      .where(eq(storeAccessBlocksTable.storeId, storeId))
      .orderBy(desc(storeAccessBlocksTable.blockedAt))
      .limit(1),
    db
      .select({
        id: storeSubscriptionPlanChangesTable.id,
        fromPlanId: storeSubscriptionPlanChangesTable.fromPlanId,
        toPlanId: storeSubscriptionPlanChangesTable.toPlanId,
        toPlanName: billingPlansTable.name,
        toPlanCode: billingPlansTable.code,
        timing: storeSubscriptionPlanChangesTable.timing,
        status: storeSubscriptionPlanChangesTable.status,
        moduleTreatment: storeSubscriptionPlanChangesTable.moduleTreatment,
        keepCustomAmount: storeSubscriptionPlanChangesTable.keepCustomAmount,
        previousContractedAmount:
          storeSubscriptionPlanChangesTable.previousContractedAmount,
        nextContractedAmount:
          storeSubscriptionPlanChangesTable.nextContractedAmount,
        currency: storeSubscriptionPlanChangesTable.currency,
        effectiveAt: storeSubscriptionPlanChangesTable.effectiveAt,
        reason: storeSubscriptionPlanChangesTable.reason,
        metadata: storeSubscriptionPlanChangesTable.metadata,
        actorEmail: storeSubscriptionPlanChangesTable.actorEmail,
        createdAt: storeSubscriptionPlanChangesTable.createdAt,
      })
      .from(storeSubscriptionPlanChangesTable)
      .innerJoin(
        billingPlansTable,
        eq(billingPlansTable.id, storeSubscriptionPlanChangesTable.toPlanId)
      )
      .where(
        and(
          eq(storeSubscriptionPlanChangesTable.storeId, storeId),
          eq(storeSubscriptionPlanChangesTable.status, 'scheduled')
        )
      )
      .orderBy(desc(storeSubscriptionPlanChangesTable.createdAt))
      .limit(1),
    db
      .select({
        id: storeBillingAdjustmentsTable.id,
        planChangeId: storeBillingAdjustmentsTable.planChangeId,
        adjustmentType: storeBillingAdjustmentsTable.adjustmentType,
        status: storeBillingAdjustmentsTable.status,
        amount: storeBillingAdjustmentsTable.amount,
        currency: storeBillingAdjustmentsTable.currency,
        competenceStart: storeBillingAdjustmentsTable.competenceStart,
        competenceEnd: storeBillingAdjustmentsTable.competenceEnd,
        calculationSnapshot: storeBillingAdjustmentsTable.calculationSnapshot,
        reason: storeBillingAdjustmentsTable.reason,
        actorEmail: storeBillingAdjustmentsTable.actorEmail,
        createdAt: storeBillingAdjustmentsTable.createdAt,
      })
      .from(storeBillingAdjustmentsTable)
      .where(eq(storeBillingAdjustmentsTable.storeId, storeId))
      .orderBy(desc(storeBillingAdjustmentsTable.createdAt))
      .limit(6),
  ])

  const invoiceIds = invoiceRows.map(invoice => invoice.id)
  const [invoicePaymentRows, billingReminderRows] =
    invoiceIds.length > 0
      ? await Promise.all([
          db
            .select({
              invoiceId: storeBillingPaymentsTable.invoiceId,
              status: storeBillingPaymentsTable.status,
              method: storeBillingPaymentsTable.method,
              provider: storeBillingPaymentsTable.provider,
              paidAt: storeBillingPaymentsTable.paidAt,
              metadata: storeBillingPaymentsTable.metadata,
              createdAt: storeBillingPaymentsTable.createdAt,
            })
            .from(storeBillingPaymentsTable)
            .where(inArray(storeBillingPaymentsTable.invoiceId, invoiceIds))
            .orderBy(
              storeBillingPaymentsTable.invoiceId,
              sql`case ${storeBillingPaymentsTable.status} when 'confirmed' then 0 when 'pending' then 1 else 2 end`,
              desc(storeBillingPaymentsTable.createdAt)
            ),
          db
            .select({
              id: storeBillingReminderDeliveriesTable.id,
              invoiceId: storeBillingReminderDeliveriesTable.invoiceId,
              channel: storeBillingReminderDeliveriesTable.channel,
              daysAfterDue: storeBillingReminderDeliveriesTable.daysAfterDue,
              status: storeBillingReminderDeliveriesTable.status,
              recipient: storeBillingReminderDeliveriesTable.recipient,
              title: storeBillingReminderDeliveriesTable.title,
              sentAt: storeBillingReminderDeliveriesTable.sentAt,
              skippedAt: storeBillingReminderDeliveriesTable.skippedAt,
              createdAt: storeBillingReminderDeliveriesTable.createdAt,
            })
            .from(storeBillingReminderDeliveriesTable)
            .where(
              inArray(storeBillingReminderDeliveriesTable.invoiceId, invoiceIds)
            )
            .orderBy(
              storeBillingReminderDeliveriesTable.invoiceId,
              desc(storeBillingReminderDeliveriesTable.createdAt)
            ),
        ])
      : [[], []]
  const paymentsByInvoiceId = new Map<
    number,
    (typeof invoicePaymentRows)[number]
  >()

  for (const payment of invoicePaymentRows) {
    if (!paymentsByInvoiceId.has(payment.invoiceId)) {
      paymentsByInvoiceId.set(payment.invoiceId, payment)
    }
  }

  const remindersByInvoiceId = new Map<
    number,
    (typeof billingReminderRows)[number][]
  >()

  for (const reminder of billingReminderRows) {
    const current = remindersByInvoiceId.get(reminder.invoiceId) ?? []
    current.push(reminder)
    remindersByInvoiceId.set(reminder.invoiceId, current)
  }

  const invoices = invoiceRows.map(invoice => {
    const payment = paymentsByInvoiceId.get(invoice.id) ?? null
    const reminders = remindersByInvoiceId.get(invoice.id) ?? []

    return {
      ...invoice,
      paymentMethod: payment?.method ?? null,
      paymentStatus: payment?.status ?? null,
      paymentProvider: payment?.provider ?? null,
      paymentPaidAt: payment?.paidAt ?? null,
      paymentLink: getBillingPaymentLink({
        invoiceMetadata: invoice.metadata,
        paymentMetadata: payment?.metadata,
      }),
      outstandingAmount: getInvoiceReceivableAmount(invoice),
      expectedBlockAt: getExpectedSubscriptionBlockAt({
        nextBillingAt: invoice.dueAt,
        paymentGraceDays: store.paymentGraceDays ?? 0,
      }),
      reminderCount: reminders.length,
      latestReminderAt: reminders[0]?.createdAt ?? null,
    }
  })

  const invoiceSummary = invoiceSummaryRows.reduce(
    (summary, invoice) => {
      const receivableAmount = getInvoiceReceivableAmount(invoice)

      summary.totalInvoices += 1
      summary.totalAmount += parseInternalDashboardAmount(invoice.totalAmount)
      summary.paidAmount += parseInternalDashboardAmount(invoice.amountPaid)

      if (invoice.status === 'pending' || invoice.status === 'overdue') {
        summary.openInvoices += 1
        summary.openAmount += receivableAmount
      }

      if (
        invoice.status === 'overdue' ||
        (invoice.status === 'pending' && invoice.dueAt.getTime() < Date.now())
      ) {
        summary.overdueInvoices += 1
        summary.overdueAmount += receivableAmount
      }

      if (invoice.status === 'paid') {
        summary.paidInvoices += 1
      }

      if (invoice.status === 'cancelled' || invoice.status === 'refunded') {
        summary.closedInvoices += 1
      }

      return summary
    },
    {
      totalInvoices: 0,
      openInvoices: 0,
      overdueInvoices: 0,
      paidInvoices: 0,
      closedInvoices: 0,
      totalAmount: 0,
      openAmount: 0,
      overdueAmount: 0,
      paidAmount: 0,
    }
  )

  const lastAccessAt =
    userRows
      .map(user => user.lastLoginAt)
      .filter((date): date is Date => date instanceof Date)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null
  const metrics = metricsRows[0]
  const accessBlock = accessBlockRows[0] ?? null
  const pendingPlanChange = pendingPlanChangeRows[0] ?? null
  const pendingPlanChangeMetadata =
    (pendingPlanChange?.metadata as Record<string, unknown> | undefined) ?? {}
  const moduleEntitlementsByModuleId = new Map<
    number,
    typeof moduleEntitlementRows
  >()

  for (const entitlement of moduleEntitlementRows) {
    const current = moduleEntitlementsByModuleId.get(entitlement.moduleId) ?? []
    current.push(entitlement)
    moduleEntitlementsByModuleId.set(entitlement.moduleId, current)
  }

  const now = new Date()
  const moduleOverviewRows = moduleCatalogRows.map(module => {
    const entitlements = moduleEntitlementsByModuleId.get(module.id) ?? []
    const reservedEntitlement = entitlements.find(
      entitlement =>
        entitlement.status === 'active' &&
        !entitlement.revokedAt &&
        (!entitlement.endsAt || entitlement.endsAt.getTime() > now.getTime())
    )
    const activeEntitlement = entitlements.find(entitlement =>
      isActiveStoreModuleEntitlement(entitlement, now)
    )
    const latestEntitlement =
      activeEntitlement ?? reservedEntitlement ?? entitlements[0] ?? null
    const status = activeEntitlement
      ? activeEntitlement.status
      : latestEntitlement?.status === 'active' &&
          latestEntitlement.endsAt &&
          latestEntitlement.endsAt.getTime() <= now.getTime()
        ? 'expired'
        : latestEntitlement?.status === 'active'
          ? 'inactive'
          : (latestEntitlement?.status ?? 'not_enabled')
    const origin = latestEntitlement?.origin ?? null
    const canDeactivate =
      Boolean(reservedEntitlement) && reservedEntitlement?.origin !== 'plan'
    const deactivateBlockedReason =
      reservedEntitlement?.origin === 'plan'
        ? 'Modulo incluido no plano atual. Use mudanca de plano para remover.'
        : reservedEntitlement
          ? null
          : 'Modulo nao esta liberado para esta loja.'

    return {
      moduleId: module.id,
      code: module.code,
      name: module.name,
      description: module.description,
      catalogStatus: module.status,
      entitlementId: reservedEntitlement?.id ?? latestEntitlement?.id ?? null,
      origin,
      status,
      statusLabel: getModuleEntitlementStatusLabel(status),
      originLabel: origin
        ? getModuleEntitlementOriginLabel(origin)
        : 'Nao liberado',
      isAdditional: latestEntitlement?.isAdditional ?? false,
      additionalAmount: latestEntitlement?.additionalAmount ?? '0',
      currency: latestEntitlement?.currency ?? store.currency ?? 'BRL',
      startsAt: latestEntitlement?.startsAt ?? null,
      endsAt: latestEntitlement?.endsAt ?? null,
      revokedAt: latestEntitlement?.revokedAt ?? null,
      reason: latestEntitlement?.reason ?? null,
      canActivate: !reservedEntitlement,
      canDeactivate,
      deactivateBlockedReason,
      historyCount: entitlements.length,
    }
  })

  return {
    id: store.id,
    name: store.name,
    subdomain: store.subdomain,
    status: store.status,
    statusReason: store.statusReason,
    statusUpdatedAt: store.statusUpdatedAt,
    cancelledAt: store.cancelledAt,
    cancellationReason: store.cancellationReason,
    createdAt: store.createdAt,
    updatedAt: store.updatedAt,
    company: {
      companyName: store.companyName,
      companyTaxNumber: maskInternalStoreSensitiveDigits(
        store.companyTaxNumber ?? '',
        'CNPJ nao informado'
      ),
      email: store.companyEmail,
      phone1: store.companyPhone1,
      phone2: store.companyPhone2,
      responsibleName: store.responsibleName,
      responsibleTaxNumber: maskInternalStoreSensitiveDigits(
        store.responsibleTaxNumber ?? '',
        'CPF nao informado'
      ),
      responsiblePhone: store.responsiblePhone,
      responsibleEmail: store.responsibleEmail,
    },
    commercial: {
      acquisitionSource: store.acquisitionSource,
      salesOwner: store.salesOwner,
      internalNotes: store.internalNotes,
    },
    address: {
      postalCode: store.companyPostalCode ?? store.addressPostalCode,
      street: store.companyStreet ?? store.addressStreet,
      number: store.companyNumber ?? store.addressNumber,
      district: store.companyDistrict ?? store.addressDistrict,
      city: store.companyCity ?? store.addressCity,
      stateCode: store.companyStateCode ?? store.addressStateCode,
    },
    billing: {
      subscriptionId: store.subscriptionId,
      subscriptionStatus: store.subscriptionStatus,
      planId: store.planId,
      planCode: store.planCode,
      planName: store.planName,
      contractedAmount: store.contractedAmount,
      currency: store.currency,
      billingInterval: store.billingInterval,
      billingIntervalCount: store.billingIntervalCount,
      planDefaultAmount: store.planDefaultAmount,
      planCurrency: store.planCurrency,
      planBillingInterval: store.planBillingInterval,
      planBillingIntervalCount: store.planBillingIntervalCount,
      trialDays: store.trialDays,
      discountType: store.discountType,
      discountValue: store.discountValue,
      discountValidUntil: store.discountValidUntil,
      paymentGraceDays: store.paymentGraceDays ?? 0,
      billingAccessExemptionKind: store.billingAccessExemptionKind,
      billingAccessExemptUntil: store.billingAccessExemptUntil,
      billingAccessExemptionReason: store.billingAccessExemptionReason,
      expectedBlockAt: getExpectedSubscriptionBlockAt({
        nextBillingAt: store.nextBillingAt,
        paymentGraceDays: store.paymentGraceDays ?? 0,
      }),
      nextBillingAt: store.nextBillingAt,
      currentPeriodStart: store.currentPeriodStart,
      currentPeriodEnd: store.currentPeriodEnd,
    },
    pendingPlanChange: pendingPlanChange
      ? {
          ...pendingPlanChange,
          proration:
            (pendingPlanChangeMetadata.proration as Record<string, unknown>) ??
            null,
        }
      : null,
    accessBlock: accessBlock
      ? {
          ...accessBlock,
          isActive: isStoreAccessBlockActive(accessBlock),
        }
      : null,
    invoiceSummary,
    invoices,
    billingReminders: billingReminderRows,
    billingAdjustments: billingAdjustmentRows.map(adjustment => ({
      ...adjustment,
      calculationSnapshot:
        (adjustment.calculationSnapshot as Record<string, unknown>) ?? {},
    })),
    modules: moduleOverviewRows,
    users: userRows,
    metrics: {
      totalOrders: metrics?.totalOrders ?? 0,
      digitalMenuOrders: metrics?.digitalMenuOrders ?? 0,
      posOrders: metrics?.posOrders ?? 0,
      grossRevenue: parseInternalDashboardAmount(metrics?.grossRevenue ?? null),
      lastOrderAt: metrics?.lastOrderAt ?? null,
      lastAccessAt,
    },
    auditLogs,
    billingEvents,
  }
}

const getManualBillingStore = async (
  tx: InternalStoreTransaction,
  storeId: number
) => {
  const [store] = await tx
    .select({
      id: storesTable.id,
      status: storesTable.status,
    })
    .from(storesTable)
    .where(eq(storesTable.id, storeId))
    .limit(1)

  if (!store) throw new Error('STORE_NOT_FOUND')
  if (store.status === 'archived') throw new Error('STORE_ARCHIVED')

  return store
}

const getManualBillingInvoice = async ({
  tx,
  storeId,
  invoiceId,
}: {
  tx: InternalStoreTransaction
  storeId: number
  invoiceId: number
}) => {
  const [invoice] = await tx
    .select()
    .from(storeBillingInvoicesTable)
    .where(
      and(
        eq(storeBillingInvoicesTable.id, invoiceId),
        eq(storeBillingInvoicesTable.storeId, storeId)
      )
    )
    .limit(1)

  if (!invoice) throw new Error('STORE_BILLING_INVOICE_NOT_FOUND')

  return invoice
}

export async function createManualBillingInvoice({
  values,
  operator,
}: {
  values: CreateManualBillingInvoiceValues
  operator: InternalOperator
}) {
  const now = new Date()
  const amount = normalizeCurrencyAmount(values.amount)

  return await db.transaction(async tx => {
    const store = await getManualBillingStore(tx, values.storeId)
    const [subscription] = await tx
      .select({
        id: storeSubscriptionsTable.id,
        planId: storeSubscriptionsTable.planId,
        status: storeSubscriptionsTable.status,
        contractedAmount: storeSubscriptionsTable.contractedAmount,
        currency: storeSubscriptionsTable.currency,
        billingInterval: storeSubscriptionsTable.billingInterval,
        billingIntervalCount: storeSubscriptionsTable.billingIntervalCount,
        currentPeriodStart: storeSubscriptionsTable.currentPeriodStart,
        currentPeriodEnd: storeSubscriptionsTable.currentPeriodEnd,
        planCode: billingPlansTable.code,
        planName: billingPlansTable.name,
      })
      .from(storeSubscriptionsTable)
      .innerJoin(
        billingPlansTable,
        eq(billingPlansTable.id, storeSubscriptionsTable.planId)
      )
      .where(
        and(
          eq(storeSubscriptionsTable.storeId, values.storeId),
          inArray(storeSubscriptionsTable.status, [
            'trialing',
            'active',
            'past_due',
            'paused',
          ])
        )
      )
      .limit(1)

    if (!subscription) throw new Error('STORE_SUBSCRIPTION_NOT_FOUND')

    const invoiceNumber = `CP-${values.storeId}-MAN-${now
      .toISOString()
      .replace(/\D/g, '')
      .slice(0, 14)}-${randomUUID().slice(0, 8).toUpperCase()}`
    const periodStart = now
    const periodEnd = new Date(now.getTime() + 1)
    const metadata = {
      source: 'internal_manual_invoice',
      description: values.description,
      createdByEmail: operator.email,
      reason: values.reason,
    }

    const [invoice] = await tx
      .insert(storeBillingInvoicesTable)
      .values({
        storeId: values.storeId,
        subscriptionId: subscription.id,
        planId: subscription.planId,
        invoiceNumber,
        status: 'pending',
        currency: subscription.currency,
        subtotalAmount: amount,
        discountAmount: '0.0000',
        totalAmount: amount,
        amountPaid: '0.0000',
        amountRefunded: '0.0000',
        planSnapshot: {
          id: subscription.planId,
          code: subscription.planCode,
          name: subscription.planName,
        },
        contractSnapshot: {
          contractedAmount: subscription.contractedAmount,
          currency: subscription.currency,
          billingInterval: subscription.billingInterval,
          billingIntervalCount: subscription.billingIntervalCount,
          currentPeriodStart: subscription.currentPeriodStart.toISOString(),
          currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
          manualInvoiceDescription: values.description,
        },
        periodStart,
        periodEnd,
        dueAt: values.dueAt,
        metadata,
        updatedAt: now,
      })
      .returning()

    await tx.insert(storeBillingEventsTable).values({
      storeId: values.storeId,
      subscriptionId: subscription.id,
      invoiceId: invoice.id,
      eventType: 'invoice_created',
      actorClerkId: operator.clerkId,
      actorEmail: operator.email,
      reason: values.reason,
      previousValues: null,
      newValues: getInvoiceFinancialSnapshot(invoice),
      metadata,
    })

    await insertManualBillingAuditLog({
      tx,
      action: 'create_manual_billing_invoice',
      operator,
      store,
      reason: `${values.reason} | fatura=${invoice.invoiceNumber}; valor=${amount}`,
    })

    return invoice
  })
}

export async function markManualBillingInvoicePayment({
  values,
  operator,
}: {
  values: MarkManualBillingInvoicePaymentValues
  operator: InternalOperator
}) {
  const now = new Date()
  const amount = normalizeCurrencyAmount(values.amount)
  const confirmationKey = buildPaymentConfirmationDedupeKey({
    invoiceId: values.invoiceId,
    provider: 'internal_manual_payment',
    amount,
    paidAt: values.paidAt,
    manualReference: values.paymentReference,
  })

  return await db.transaction(async tx => {
    const store = await getManualBillingStore(tx, values.storeId)
    const invoice = await getManualBillingInvoice({
      tx,
      storeId: values.storeId,
      invoiceId: values.invoiceId,
    })

    const [existingPayment] = await tx
      .select()
      .from(storeBillingPaymentsTable)
      .where(eq(storeBillingPaymentsTable.confirmationKey, confirmationKey))
      .limit(1)

    if (existingPayment) {
      return { invoice, payment: existingPayment, duplicate: true }
    }

    assertManualBillingActionAllowed({ action: 'mark_payment', invoice })

    let reconciliation: ReturnType<typeof reconcileConfirmedPayment>
    try {
      reconciliation = reconcileConfirmedPayment({
        invoice,
        amount,
        paidAt: values.paidAt,
      })
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'PAYMENT_EXCEEDS_OUTSTANDING'
      ) {
        throw new Error('MANUAL_BILLING_PAYMENT_EXCEEDS_OUTSTANDING')
      }

      throw error
    }

    if (reconciliation.outstandingBeforePayment <= 0) {
      throw new Error('MANUAL_BILLING_PAYMENT_EXCEEDS_OUTSTANDING')
    }

    const previousValues = getInvoiceFinancialSnapshot(invoice)
    const metadata = {
      source: 'internal_manual_payment',
      paymentReference: values.paymentReference || null,
      reason: values.reason,
      confirmationKey,
    }

    const [payment] = await tx
      .insert(storeBillingPaymentsTable)
      .values({
        storeId: values.storeId,
        invoiceId: invoice.id,
        status: 'confirmed',
        method: 'manual',
        amount,
        currency: invoice.currency,
        provider: 'internal_manual_payment',
        providerPaymentId: null,
        confirmationKey,
        paidAt: values.paidAt,
        metadata,
        updatedAt: now,
      })
      .onConflictDoNothing({
        target: storeBillingPaymentsTable.confirmationKey,
        where: sql`${storeBillingPaymentsTable.confirmationKey} is not null`,
      })
      .returning()

    if (!payment) {
      const [duplicatedPayment] = await tx
        .select()
        .from(storeBillingPaymentsTable)
        .where(eq(storeBillingPaymentsTable.confirmationKey, confirmationKey))
        .limit(1)

      if (duplicatedPayment) {
        return { invoice, payment: duplicatedPayment, duplicate: true }
      }

      throw new Error('PAYMENT_CONFIRMATION_CONFLICT')
    }

    const [updatedInvoice] = await tx
      .update(storeBillingInvoicesTable)
      .set({
        status: reconciliation.nextStatus,
        amountPaid: reconciliation.nextAmountPaid,
        paidAt: reconciliation.nextPaidAt,
        metadata: withManualBillingMetadata({
          metadata: invoice.metadata,
          action: 'mark_payment',
          operator,
          reason: values.reason,
          now,
        }),
        updatedAt: now,
      })
      .where(eq(storeBillingInvoicesTable.id, invoice.id))
      .returning()

    await tx.insert(storeBillingEventsTable).values({
      storeId: values.storeId,
      subscriptionId: invoice.subscriptionId,
      invoiceId: invoice.id,
      paymentId: payment.id,
      eventType: 'payment_confirmed',
      actorClerkId: operator.clerkId,
      actorEmail: operator.email,
      reason: values.reason,
      previousValues,
      newValues: getInvoiceFinancialSnapshot(updatedInvoice),
      metadata,
    })

    const [activeBillingBlock] = await tx
      .select()
      .from(storeAccessBlocksTable)
      .where(
        and(
          eq(storeAccessBlocksTable.storeId, values.storeId),
          eq(storeAccessBlocksTable.source, 'billing_delinquency'),
          eq(storeAccessBlocksTable.invoiceId, invoice.id),
          sql`${storeAccessBlocksTable.unblockedAt} is null`,
          sql`(${storeAccessBlocksTable.scheduledUnblockAt} is null or ${storeAccessBlocksTable.scheduledUnblockAt} > ${now})`
        )
      )
      .orderBy(desc(storeAccessBlocksTable.blockedAt))
      .limit(1)

    if (
      shouldAutoUnblockBillingAccess({
        block: activeBillingBlock ?? null,
        invoiceId: invoice.id,
        invoiceStatus: updatedInvoice.status,
      })
    ) {
      const unblockReason = `Desbloqueio automatico por pagamento confirmado da fatura ${invoice.invoiceNumber}.`

      const [unblockedBlock] = await tx
        .update(storeAccessBlocksTable)
        .set({
          unblockedAt: now,
          unblockedByClerkId: operator.clerkId,
          unblockedByEmail: operator.email,
          unblockedByName: operator.name,
          unblockReason,
          updatedAt: now,
        })
        .where(eq(storeAccessBlocksTable.id, activeBillingBlock.id))
        .returning()

      await tx.insert(storeBillingEventsTable).values({
        storeId: values.storeId,
        subscriptionId: invoice.subscriptionId,
        invoiceId: invoice.id,
        paymentId: payment.id,
        eventType: 'billing_access_unblocked',
        actorClerkId: operator.clerkId,
        actorEmail: operator.email,
        reason: unblockReason,
        previousValues: {
          accessBlockId: activeBillingBlock.id,
          unblockedAt: null,
        },
        newValues: {
          accessBlockId: unblockedBlock.id,
          unblockedAt: unblockedBlock.unblockedAt?.toISOString() ?? null,
        },
        metadata,
      })

      await insertManualBillingAuditLog({
        tx,
        action: 'auto_unblock_billing_access',
        operator,
        store,
        reason: `${unblockReason} | fatura=${invoice.invoiceNumber}; pagamento=${payment.id}`,
      })
    }

    await insertManualBillingAuditLog({
      tx,
      action: 'mark_manual_billing_invoice_payment',
      operator,
      store,
      reason: `${values.reason} | fatura=${invoice.invoiceNumber}; valor=${amount}`,
    })

    return { invoice: updatedInvoice, payment }
  })
}

export async function rescheduleBillingInvoiceDueDate({
  values,
  operator,
}: {
  values: RescheduleBillingInvoiceDueDateValues
  operator: InternalOperator
}) {
  const now = new Date()

  return await db.transaction(async tx => {
    const store = await getManualBillingStore(tx, values.storeId)
    const invoice = await getManualBillingInvoice({
      tx,
      storeId: values.storeId,
      invoiceId: values.invoiceId,
    })

    assertManualBillingActionAllowed({ action: 'reschedule_due_date', invoice })

    const previousValues = getInvoiceFinancialSnapshot(invoice)
    const [updatedInvoice] = await tx
      .update(storeBillingInvoicesTable)
      .set({
        status: 'pending',
        dueAt: values.dueAt,
        metadata: withManualBillingMetadata({
          metadata: invoice.metadata,
          action: 'reschedule_due_date',
          operator,
          reason: values.reason,
          now,
        }),
        updatedAt: now,
      })
      .where(eq(storeBillingInvoicesTable.id, invoice.id))
      .returning()

    await tx.insert(storeBillingEventsTable).values({
      storeId: values.storeId,
      subscriptionId: invoice.subscriptionId,
      invoiceId: invoice.id,
      eventType: 'invoice_status_changed',
      actorClerkId: operator.clerkId,
      actorEmail: operator.email,
      reason: values.reason,
      previousValues,
      newValues: getInvoiceFinancialSnapshot(updatedInvoice),
      metadata: { source: 'internal_manual_due_date_change' },
    })

    await insertManualBillingAuditLog({
      tx,
      action: 'reschedule_billing_invoice_due_date',
      operator,
      store,
      reason: `${values.reason} | fatura=${invoice.invoiceNumber}; vencimento=${values.dueAt.toISOString()}`,
    })

    return updatedInvoice
  })
}

export async function adjustBillingInvoiceAmount({
  values,
  operator,
}: {
  values: AdjustBillingInvoiceAmountValues
  operator: InternalOperator
}) {
  const now = new Date()

  return await db.transaction(async tx => {
    const store = await getManualBillingStore(tx, values.storeId)
    const invoice = await getManualBillingInvoice({
      tx,
      storeId: values.storeId,
      invoiceId: values.invoiceId,
    })

    assertManualBillingActionAllowed({ action: 'apply_adjustment', invoice })

    const adjustment = calculateManualInvoiceAdjustment({
      invoice,
      adjustmentType: values.adjustmentType,
      amount: values.amount,
    })
    const normalizedAmount = normalizeCurrencyAmount(values.amount)
    const [updatedInvoice] = await tx
      .update(storeBillingInvoicesTable)
      .set({
        subtotalAmount: adjustment.subtotalAmount,
        discountAmount: adjustment.discountAmount,
        totalAmount: adjustment.totalAmount,
        metadata: {
          ...withManualBillingMetadata({
            metadata: invoice.metadata,
            action: 'apply_adjustment',
            operator,
            reason: values.reason,
            now,
          }),
          manualAdjustment: {
            type: values.adjustmentType,
            amount: normalizedAmount,
            previousValues: adjustment.previousValues,
            newValues: adjustment.newValues,
          },
        },
        updatedAt: now,
      })
      .where(eq(storeBillingInvoicesTable.id, invoice.id))
      .returning()

    await tx.insert(storeBillingEventsTable).values({
      storeId: values.storeId,
      subscriptionId: invoice.subscriptionId,
      invoiceId: invoice.id,
      eventType: 'billing_adjustment_created',
      actorClerkId: operator.clerkId,
      actorEmail: operator.email,
      reason: values.reason,
      previousValues: adjustment.previousValues,
      newValues: adjustment.newValues,
      metadata: {
        source: 'internal_manual_invoice_adjustment',
        adjustmentType: values.adjustmentType,
        amount: normalizedAmount,
      },
    })

    await insertManualBillingAuditLog({
      tx,
      action: 'adjust_billing_invoice_amount',
      operator,
      store,
      reason: `${values.reason} | fatura=${invoice.invoiceNumber}; tipo=${values.adjustmentType}; valor=${normalizedAmount}`,
    })

    return updatedInvoice
  })
}

export async function cancelBillingInvoice({
  values,
  operator,
}: {
  values: CancelBillingInvoiceValues
  operator: InternalOperator
}) {
  if (values.confirmation !== 'CANCELAR') {
    throw new Error('MANUAL_BILLING_CONFIRMATION_INVALID')
  }

  const now = new Date()

  return await db.transaction(async tx => {
    const store = await getManualBillingStore(tx, values.storeId)
    const invoice = await getManualBillingInvoice({
      tx,
      storeId: values.storeId,
      invoiceId: values.invoiceId,
    })

    assertManualBillingActionAllowed({ action: 'cancel_invoice', invoice })

    const previousValues = getInvoiceFinancialSnapshot(invoice)
    const [updatedInvoice] = await tx
      .update(storeBillingInvoicesTable)
      .set({
        status: 'cancelled',
        cancelledAt: now,
        metadata: withManualBillingMetadata({
          metadata: invoice.metadata,
          action: 'cancel_invoice',
          operator,
          reason: values.reason,
          now,
        }),
        updatedAt: now,
      })
      .where(eq(storeBillingInvoicesTable.id, invoice.id))
      .returning()

    await tx.insert(storeBillingEventsTable).values({
      storeId: values.storeId,
      subscriptionId: invoice.subscriptionId,
      invoiceId: invoice.id,
      eventType: 'invoice_status_changed',
      actorClerkId: operator.clerkId,
      actorEmail: operator.email,
      reason: values.reason,
      previousValues,
      newValues: getInvoiceFinancialSnapshot(updatedInvoice),
      metadata: { source: 'internal_manual_invoice_cancel' },
    })

    await insertManualBillingAuditLog({
      tx,
      action: 'cancel_billing_invoice',
      operator,
      store,
      reason: `${values.reason} | fatura=${invoice.invoiceNumber}`,
    })

    return updatedInvoice
  })
}

export async function refundBillingInvoice({
  values,
  operator,
}: {
  values: RefundBillingInvoiceValues
  operator: InternalOperator
}) {
  const now = new Date()
  const amountNumber = parseMoneyAmount(values.amount)
  const amount = normalizeCurrencyAmount(values.amount)

  return await db.transaction(async tx => {
    const store = await getManualBillingStore(tx, values.storeId)
    const invoice = await getManualBillingInvoice({
      tx,
      storeId: values.storeId,
      invoiceId: values.invoiceId,
    })

    assertManualBillingActionAllowed({ action: 'refund_invoice', invoice })

    const refundableAmount = getManualInvoiceRefundableAmount(invoice)
    if (amountNumber > refundableAmount) {
      throw new Error('MANUAL_BILLING_REFUND_EXCEEDS_PAID')
    }

    const previousValues = getInvoiceFinancialSnapshot(invoice)
    const nextAmountRefunded =
      parseMoneyAmount(invoice.amountRefunded) + amountNumber
    const isFullyRefunded =
      nextAmountRefunded >= parseMoneyAmount(invoice.amountPaid)

    const [updatedInvoice] = await tx
      .update(storeBillingInvoicesTable)
      .set({
        status: isFullyRefunded ? 'refunded' : invoice.status,
        amountRefunded: formatMoneyAmount(nextAmountRefunded),
        refundedAt: isFullyRefunded ? now : invoice.refundedAt,
        metadata: withManualBillingMetadata({
          metadata: invoice.metadata,
          action: 'refund_invoice',
          operator,
          reason: values.reason,
          now,
        }),
        updatedAt: now,
      })
      .where(eq(storeBillingInvoicesTable.id, invoice.id))
      .returning()

    await tx.insert(storeBillingEventsTable).values({
      storeId: values.storeId,
      subscriptionId: invoice.subscriptionId,
      invoiceId: invoice.id,
      eventType: 'refund_registered',
      actorClerkId: operator.clerkId,
      actorEmail: operator.email,
      reason: values.reason,
      previousValues,
      newValues: getInvoiceFinancialSnapshot(updatedInvoice),
      metadata: {
        source: 'internal_manual_invoice_refund',
        amount,
        paymentReference: values.paymentReference || null,
      },
    })

    await insertManualBillingAuditLog({
      tx,
      action: 'refund_billing_invoice',
      operator,
      store,
      reason: `${values.reason} | fatura=${invoice.invoiceNumber}; valor=${amount}`,
    })

    return updatedInvoice
  })
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
  const planRows = await db
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

  if (planRows.length === 0) return []

  const moduleRows = await db
    .select({
      planId: billingPlanModulesTable.planId,
      moduleId: billingModulesTable.id,
      code: billingModulesTable.code,
      name: billingModulesTable.name,
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
        inArray(
          billingPlanModulesTable.planId,
          planRows.map(plan => plan.id)
        ),
        eq(billingPlanModulesTable.status, 'active'),
        sql`${billingPlanModulesTable.endsAt} is null`
      )
    )
    .orderBy(billingModulesTable.name)

  const modulesByPlanId = new Map<
    number,
    InternalBillingPlanOption['modules']
  >()

  for (const planModule of moduleRows) {
    const modules = modulesByPlanId.get(planModule.planId) ?? []
    modules.push({
      moduleId: planModule.moduleId,
      code: planModule.code,
      name: planModule.name,
    })
    modulesByPlanId.set(planModule.planId, modules)
  }

  return planRows.map(plan => ({
    ...plan,
    modules: modulesByPlanId.get(plan.id) ?? [],
  }))
}

export async function listInternalStoreCityFilterOptions(): Promise<
  InternalStoreCityFilterOption[]
> {
  const rows = await db
    .selectDistinct({
      city: sql<string>`coalesce(${storeCompanyProfilesTable.city}, ${storeAddressesTable.city})`,
      stateCode: sql<
        string | null
      >`coalesce(${storeCompanyProfilesTable.stateCode}, ${storeAddressesTable.stateCode})`,
    })
    .from(storesTable)
    .leftJoin(
      storeCompanyProfilesTable,
      eq(storeCompanyProfilesTable.storeId, storesTable.id)
    )
    .leftJoin(
      storeAddressesTable,
      and(
        eq(storeAddressesTable.storeId, storesTable.id),
        eq(storeAddressesTable.addressType, 'business'),
        eq(storeAddressesTable.isPrimary, true)
      )
    )
    .where(
      sql`coalesce(${storeCompanyProfilesTable.city}, ${storeAddressesTable.city}) is not null`
    )
    .orderBy(
      sql`coalesce(${storeCompanyProfilesTable.city}, ${storeAddressesTable.city})`
    )

  return rows
    .filter(row => row.city?.trim())
    .map(row => ({
      city: row.city,
      stateCode: row.stateCode,
    }))
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

export const maskInternalStoreSensitiveDigits = (
  value: string,
  fallback: string
) => {
  const digits = value.replace(/\D/g, '')
  if (!digits) return fallback

  return `***${digits.slice(-4)}`
}

const maskLast4 = maskInternalStoreSensitiveDigits

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

export async function findInternalStoreProfileUpdateDuplicates(
  values: InternalStoreProfileEditValues
): Promise<InternalStoreDuplicateMatch[]> {
  const duplicateInputs = {
    subdomain: values.subdomain,
    companyTaxNumber: normalizeInternalCnpj(values.companyTaxNumberReplacement),
    responsibleTaxNumber: normalizeInternalCpf(
      values.responsibleTaxNumberReplacement
    ),
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
    .where(and(ne(storesTable.id, values.storeId), or(...conditions)))
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
      role: 'owner',
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

export const buildInternalStoreProrationInvoiceNumber = ({
  storeId,
  planChangeId,
}: {
  storeId: number
  planChangeId: number
}) => `CP-${storeId}-PROR-${planChangeId}`

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
        status: 'implementing',
        statusReason: values.reason,
        statusUpdatedAt: now,
        updatedAt: now,
      })
      .returning()

    await ensureStoreImplementationChecklistForStoreTransaction({
      tx,
      storeId: store.id,
      now,
    })

    await tx.insert(userStorePermissionsTable).values({
      userId: responsibleUser.id,
      storeId: store.id,
      role: 'owner',
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

const formatNullableAuditValue = (value: string | null | undefined) =>
  normalizeInternalProfileNullableText(value) ?? 'nao informado'

type StoreProfileAuditSnapshot = {
  storeName: string
  subdomain: string
  companyName: string | null
  companyTaxNumber: string | null
  companyEmail: string | null
  phone1: string | null
  phone2: string | null
  responsibleName: string | null
  responsibleTaxNumber: string | null
  responsibleEmail: string | null
  responsiblePhone: string | null
  postalCode: string | null
  street: string | null
  number: string | null
  district: string | null
  city: string | null
  stateCode: string | null
  acquisitionSource: string | null
  salesOwner: string | null
  internalNotes: string | null
}

const buildStoreProfileAuditRecords = ({
  before,
  after,
}: {
  before: StoreProfileAuditSnapshot
  after: StoreProfileAuditSnapshot
}) => {
  const records: {
    label: string
    before: string | null
    after: string | null
  }[] = [
    { label: 'Loja', before: before.storeName, after: after.storeName },
    {
      label: 'Endereco publico',
      before: before.subdomain,
      after: after.subdomain,
    },
    { label: 'Empresa', before: before.companyName, after: after.companyName },
    {
      label: 'CNPJ',
      before: maskLast4(before.companyTaxNumber ?? '', 'nao informado'),
      after: maskLast4(after.companyTaxNumber ?? '', 'nao informado'),
    },
    {
      label: 'E-mail da loja',
      before: before.companyEmail ? maskEmail(before.companyEmail) : null,
      after: after.companyEmail ? maskEmail(after.companyEmail) : null,
    },
    { label: 'Telefone 1', before: before.phone1, after: after.phone1 },
    { label: 'Telefone 2', before: before.phone2, after: after.phone2 },
    {
      label: 'Responsavel',
      before: before.responsibleName,
      after: after.responsibleName,
    },
    {
      label: 'CPF do responsavel',
      before: maskLast4(before.responsibleTaxNumber ?? '', 'nao informado'),
      after: maskLast4(after.responsibleTaxNumber ?? '', 'nao informado'),
    },
    {
      label: 'E-mail do responsavel',
      before: before.responsibleEmail
        ? maskEmail(before.responsibleEmail)
        : null,
      after: after.responsibleEmail ? maskEmail(after.responsibleEmail) : null,
    },
    {
      label: 'Telefone do responsavel',
      before: before.responsiblePhone,
      after: after.responsiblePhone,
    },
    { label: 'CEP', before: before.postalCode, after: after.postalCode },
    { label: 'Endereco', before: before.street, after: after.street },
    { label: 'Numero', before: before.number, after: after.number },
    { label: 'Bairro', before: before.district, after: after.district },
    { label: 'Cidade', before: before.city, after: after.city },
    { label: 'UF', before: before.stateCode, after: after.stateCode },
    {
      label: 'Origem',
      before: before.acquisitionSource,
      after: after.acquisitionSource,
    },
    {
      label: 'Vendedor',
      before: before.salesOwner,
      after: after.salesOwner,
    },
    {
      label: 'Observacoes internas',
      before: before.internalNotes,
      after: after.internalNotes,
    },
  ]

  return records.filter(
    record =>
      formatNullableAuditValue(record.before) !==
      formatNullableAuditValue(record.after)
  )
}

export async function updateInternalStoreProfile({
  values,
  operator,
}: {
  values: InternalStoreProfileEditValues
  operator: InternalOperator
}) {
  const now = new Date()

  return await db.transaction(async tx => {
    const [store] = await tx
      .select({
        id: storesTable.id,
        name: storesTable.name,
        subdomain: storesTable.subdomain,
        status: storesTable.status,
      })
      .from(storesTable)
      .where(eq(storesTable.id, values.storeId))
      .limit(1)

    if (!store) throw new Error('STORE_NOT_FOUND')
    if (store.status === 'archived') throw new Error('STORE_ARCHIVED')

    const [profile] = await tx
      .select()
      .from(storeCompanyProfilesTable)
      .where(eq(storeCompanyProfilesTable.storeId, values.storeId))
      .limit(1)

    const [businessAddress] = await tx
      .select()
      .from(storeAddressesTable)
      .where(
        and(
          eq(storeAddressesTable.storeId, values.storeId),
          eq(storeAddressesTable.addressType, 'business'),
          eq(storeAddressesTable.isPrimary, true)
        )
      )
      .limit(1)

    const before: StoreProfileAuditSnapshot = {
      storeName: store.name,
      subdomain: store.subdomain,
      companyName: profile?.companyName ?? null,
      companyTaxNumber: profile?.companyTaxNumber ?? null,
      companyEmail: profile?.email ?? null,
      phone1: profile?.phone1 ?? null,
      phone2: profile?.phone2 ?? null,
      responsibleName: profile?.responsibleName ?? null,
      responsibleTaxNumber: profile?.responsibleTaxNumber ?? null,
      responsibleEmail: profile?.responsibleEmail ?? null,
      responsiblePhone: profile?.responsiblePhone ?? null,
      postalCode: profile?.postalCode ?? businessAddress?.postalCode ?? null,
      street: profile?.street ?? businessAddress?.street ?? null,
      number: profile?.number ?? businessAddress?.number ?? null,
      district: profile?.district ?? businessAddress?.district ?? null,
      city: profile?.city ?? businessAddress?.city ?? null,
      stateCode: profile?.stateCode ?? businessAddress?.stateCode ?? null,
      acquisitionSource: profile?.acquisitionSource ?? null,
      salesOwner: profile?.salesOwner ?? null,
      internalNotes: profile?.internalNotes ?? null,
    }

    const after: StoreProfileAuditSnapshot = {
      storeName: values.storeName,
      subdomain: values.subdomain,
      companyName: normalizeInternalProfileNullableText(values.companyName),
      companyTaxNumber:
        values.companyTaxNumberReplacement ||
        normalizeInternalCnpj(before.companyTaxNumber) ||
        null,
      companyEmail: normalizeInternalProfileNullableEmail(values.companyEmail),
      phone1: values.phone1 || null,
      phone2: values.phone2 || null,
      responsibleName: normalizeInternalProfileNullableText(
        values.responsibleName
      ),
      responsibleTaxNumber:
        values.responsibleTaxNumberReplacement ||
        normalizeInternalCpf(before.responsibleTaxNumber) ||
        null,
      responsibleEmail: normalizeInternalProfileNullableEmail(
        values.responsibleEmail
      ),
      responsiblePhone: values.responsiblePhone || null,
      postalCode: values.postalCode,
      street: values.street,
      number: values.number,
      district: values.district,
      city: values.city,
      stateCode: values.stateCode,
      acquisitionSource: normalizeInternalProfileNullableText(
        values.acquisitionSource
      ),
      salesOwner: normalizeInternalProfileNullableText(values.salesOwner),
      internalNotes: normalizeInternalProfileNullableText(values.internalNotes),
    }

    const changedRecords = buildStoreProfileAuditRecords({ before, after })
    if (changedRecords.length === 0) {
      throw new Error('STORE_PROFILE_NO_CHANGES')
    }

    const sensitiveChanged = hasSensitiveInternalStoreProfileChange({
      current: {
        storeName: before.storeName,
        subdomain: before.subdomain,
        companyTaxNumber: before.companyTaxNumber,
        responsibleTaxNumber: before.responsibleTaxNumber,
        responsibleEmail: before.responsibleEmail,
      },
      values,
    })

    if (sensitiveChanged && !values.sensitiveConfirmation) {
      throw new Error('SENSITIVE_CONFIRMATION_REQUIRED')
    }

    await tx
      .update(storesTable)
      .set({
        name: after.storeName,
        subdomain: after.subdomain,
        updatedAt: now,
      })
      .where(eq(storesTable.id, values.storeId))

    await tx
      .insert(storeCompanyProfilesTable)
      .values({
        storeId: values.storeId,
        companyTaxNumber: after.companyTaxNumber,
        companyName: after.companyName,
        phone1: after.phone1,
        phone2: after.phone2,
        email: after.companyEmail,
        responsibleName: after.responsibleName,
        responsibleTaxNumber: after.responsibleTaxNumber,
        responsiblePhone: after.responsiblePhone,
        responsibleEmail: after.responsibleEmail,
        postalCode: after.postalCode,
        street: after.street,
        number: after.number,
        district: after.district,
        city: after.city,
        stateCode: after.stateCode,
        acquisitionSource: after.acquisitionSource,
        salesOwner: after.salesOwner,
        internalNotes: after.internalNotes,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: storeCompanyProfilesTable.storeId,
        set: {
          companyTaxNumber: after.companyTaxNumber,
          companyName: after.companyName,
          phone1: after.phone1,
          phone2: after.phone2,
          email: after.companyEmail,
          responsibleName: after.responsibleName,
          responsibleTaxNumber: after.responsibleTaxNumber,
          responsiblePhone: after.responsiblePhone,
          responsibleEmail: after.responsibleEmail,
          postalCode: after.postalCode,
          street: after.street,
          number: after.number,
          district: after.district,
          city: after.city,
          stateCode: after.stateCode,
          acquisitionSource: after.acquisitionSource,
          salesOwner: after.salesOwner,
          internalNotes: after.internalNotes,
          updatedAt: now,
        },
      })

    await tx
      .insert(storeAddressesTable)
      .values({
        storeId: values.storeId,
        addressType: 'business',
        label: 'Endereco comercial',
        postalCode: after.postalCode,
        street: after.street,
        number: after.number,
        district: after.district,
        city: after.city,
        stateCode: after.stateCode,
        isPrimary: true,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [storeAddressesTable.storeId, storeAddressesTable.addressType],
        targetWhere: sql`${storeAddressesTable.isPrimary} = true`,
        set: {
          label: 'Endereco comercial',
          postalCode: after.postalCode,
          street: after.street,
          number: after.number,
          district: after.district,
          city: after.city,
          stateCode: after.stateCode,
          isPrimary: true,
          updatedAt: now,
        },
      })

    const changedLabels = buildInternalStoreProfileChangeSummary({
      before: Object.fromEntries(
        changedRecords.map(record => [
          record.label,
          formatNullableAuditValue(record.before),
        ])
      ),
      after: Object.fromEntries(
        changedRecords.map(record => [
          record.label,
          formatNullableAuditValue(record.after),
        ])
      ),
    })
    const diff = changedRecords
      .map(
        record =>
          `${record.label}: ${formatNullableAuditValue(record.before)} -> ${formatNullableAuditValue(record.after)}`
      )
      .join('; ')

    await tx.insert(internalOperationAuditLogsTable).values({
      action: 'update_store_profile',
      actorClerkId: operator.clerkId,
      actorEmail: operator.email,
      actorName: operator.name,
      storeId: values.storeId,
      targetUserEmail: after.responsibleEmail,
      previousStoreStatus: store.status,
      newStoreStatus: store.status,
      reason: `Campos alterados: ${changedLabels}. Motivo: ${values.reason}. Antes/depois: ${diff}`,
    })

    return {
      storeId: values.storeId,
      changedFields: changedRecords.map(record => record.label),
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

export async function updateStoreImplementationChecklistItem({
  storeId,
  itemKey,
  completed,
  observation,
  operator,
}: {
  storeId: number
  itemKey: StoreImplementationChecklistItemKey
  completed: boolean
  observation: string
  operator: InternalOperator
}) {
  const now = new Date()
  const trimmedObservation = observation.trim()

  return await db.transaction(async tx => {
    const [store] = await tx
      .select()
      .from(storesTable)
      .where(eq(storesTable.id, storeId))
      .limit(1)

    if (!store) throw new Error('STORE_NOT_FOUND')
    if (store.status === 'archived') throw new Error('STORE_ARCHIVED')

    await ensureStoreImplementationChecklistForStoreTransaction({
      tx,
      storeId,
      now,
    })

    const [currentItem] = await tx
      .select()
      .from(storeImplementationChecklistItemsTable)
      .where(
        and(
          eq(storeImplementationChecklistItemsTable.storeId, storeId),
          eq(storeImplementationChecklistItemsTable.itemKey, itemKey)
        )
      )
      .limit(1)

    if (!currentItem) throw new Error('CHECKLIST_ITEM_NOT_FOUND')

    const newStatus = completed ? 'completed' : 'pending'

    const [updatedItem] = await tx
      .update(storeImplementationChecklistItemsTable)
      .set({
        status: newStatus,
        completedAt: completed ? now : null,
        completedByClerkId: completed ? operator.clerkId : null,
        completedByEmail: completed ? operator.email : null,
        completedByName: completed ? operator.name : null,
        observation: trimmedObservation || null,
        updatedAt: now,
      })
      .where(eq(storeImplementationChecklistItemsTable.id, currentItem.id))
      .returning()

    await tx.insert(storeImplementationChecklistEventsTable).values({
      storeId,
      checklistItemId: currentItem.id,
      itemKey,
      previousStatus: currentItem.status,
      newStatus,
      actorClerkId: operator.clerkId,
      actorEmail: operator.email,
      actorName: operator.name,
      observation: trimmedObservation || null,
    })

    await tx.insert(internalOperationAuditLogsTable).values({
      action: 'update_store_implementation_checklist',
      actorClerkId: operator.clerkId,
      actorEmail: operator.email,
      actorName: operator.name,
      storeId,
      targetUserEmail: null,
      previousStoreStatus: store.status,
      newStoreStatus: store.status,
      reason: `${updatedItem.title}: ${completed ? 'concluido' : 'reaberto'}${
        trimmedObservation ? ` - ${trimmedObservation}` : ''
      }`,
    })

    return updatedItem
  })
}

export async function activateStoreAfterImplementation({
  storeId,
  reason,
  operator,
}: {
  storeId: number
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
    if (store.status !== 'implementing') {
      throw new Error('STORE_STATUS_NOT_IMPLEMENTING')
    }

    await ensureStoreImplementationChecklistForStoreTransaction({
      tx,
      storeId,
      now,
    })

    const checklistItems = await tx
      .select({
        status: storeImplementationChecklistItemsTable.status,
        requiredForActivation:
          storeImplementationChecklistItemsTable.requiredForActivation,
      })
      .from(storeImplementationChecklistItemsTable)
      .where(eq(storeImplementationChecklistItemsTable.storeId, storeId))

    const progress = getStoreImplementationChecklistProgress(checklistItems)
    if (!progress.canActivate) {
      throw new Error('STORE_IMPLEMENTATION_CHECKLIST_INCOMPLETE')
    }

    const [updatedStore] = await tx
      .update(storesTable)
      .set({
        status: 'active',
        statusReason: reason,
        statusUpdatedAt: now,
        updatedAt: now,
      })
      .where(
        and(eq(storesTable.id, storeId), eq(storesTable.status, 'implementing'))
      )
      .returning()

    if (!updatedStore) throw new Error('STORE_STATUS_NOT_IMPLEMENTING')

    await tx.insert(internalOperationAuditLogsTable).values({
      action: 'activate_store_after_implementation',
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
        role: 'owner',
        revokedAt: null,
        revokedReason: null,
      })
      .onConflictDoUpdate({
        target: [
          userStorePermissionsTable.userId,
          userStorePermissionsTable.storeId,
        ],
        set: {
          role: 'owner',
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

export async function updateStoreSubscriptionTerms({
  values,
  operator,
}: {
  values: StoreSubscriptionTermsValues
  operator: InternalOperator
}) {
  const now = new Date()
  const nextContractedAmount = normalizeCurrencyAmount(values.contractedAmount)
  const nextDiscountType =
    values.discountType === 'none' ? null : values.discountType
  const nextDiscountValue =
    values.discountType === 'none' || !values.discountValue
      ? null
      : normalizeCurrencyAmount(values.discountValue)
  const nextBillingAccessExemptionKind =
    values.billingAccessExemptionKind === 'none'
      ? null
      : values.billingAccessExemptionKind
  const nextBillingAccessExemptUntil =
    values.billingAccessExemptionKind === 'none'
      ? null
      : values.billingAccessExemptUntil
  const nextBillingAccessExemptionReason =
    values.billingAccessExemptionKind === 'none'
      ? null
      : values.billingAccessExemptionReason.trim()
  const canManageFinancialValues = canUseInternalPermission({
    currentRole: operator.role,
    permission: 'manage_billing_values',
  })

  return await db.transaction(async tx => {
    const [store] = await tx
      .select({
        id: storesTable.id,
        status: storesTable.status,
      })
      .from(storesTable)
      .where(eq(storesTable.id, values.storeId))
      .limit(1)

    if (!store) throw new Error('STORE_NOT_FOUND')
    if (store.status === 'archived') throw new Error('STORE_ARCHIVED')

    const [subscription] = await tx
      .select({
        id: storeSubscriptionsTable.id,
        storeId: storeSubscriptionsTable.storeId,
        status: storeSubscriptionsTable.status,
        planId: storeSubscriptionsTable.planId,
        contractedAmount: storeSubscriptionsTable.contractedAmount,
        currency: storeSubscriptionsTable.currency,
        billingInterval: storeSubscriptionsTable.billingInterval,
        billingIntervalCount: storeSubscriptionsTable.billingIntervalCount,
        discountType: storeSubscriptionsTable.discountType,
        discountValue: storeSubscriptionsTable.discountValue,
        discountValidUntil: storeSubscriptionsTable.discountValidUntil,
        paymentGraceDays: storeSubscriptionsTable.paymentGraceDays,
        billingAccessExemptionKind:
          storeSubscriptionsTable.billingAccessExemptionKind,
        billingAccessExemptUntil:
          storeSubscriptionsTable.billingAccessExemptUntil,
        billingAccessExemptionReason:
          storeSubscriptionsTable.billingAccessExemptionReason,
        nextBillingAt: storeSubscriptionsTable.nextBillingAt,
      })
      .from(storeSubscriptionsTable)
      .where(
        and(
          eq(storeSubscriptionsTable.id, values.subscriptionId),
          eq(storeSubscriptionsTable.storeId, values.storeId),
          inArray(storeSubscriptionsTable.status, [
            'trialing',
            'active',
            'past_due',
            'paused',
          ])
        )
      )
      .limit(1)

    if (!subscription) throw new Error('STORE_SUBSCRIPTION_NOT_FOUND')

    if (
      !canManageFinancialValues &&
      (subscription.contractedAmount !== nextContractedAmount ||
        subscription.paymentGraceDays !== values.paymentGraceDays ||
        subscription.billingAccessExemptionKind !==
          nextBillingAccessExemptionKind ||
        subscription.billingAccessExemptUntil?.toISOString() !==
          nextBillingAccessExemptUntil?.toISOString() ||
        subscription.billingAccessExemptionReason !==
          nextBillingAccessExemptionReason)
    ) {
      throw new Error('STORE_SUBSCRIPTION_FINANCE_PERMISSION_REQUIRED')
    }

    const previousValues = {
      contractedAmount: subscription.contractedAmount,
      discountType: subscription.discountType,
      discountValue: subscription.discountValue,
      discountValidUntil:
        subscription.discountValidUntil?.toISOString() ?? null,
      paymentGraceDays: subscription.paymentGraceDays,
      billingAccessExemptionKind: subscription.billingAccessExemptionKind,
      billingAccessExemptUntil:
        subscription.billingAccessExemptUntil?.toISOString() ?? null,
      billingAccessExemptionReason:
        subscription.billingAccessExemptionReason ?? null,
      expectedBlockAt:
        getExpectedSubscriptionBlockAt({
          nextBillingAt: subscription.nextBillingAt,
          paymentGraceDays: subscription.paymentGraceDays,
        })?.toISOString() ?? null,
    }
    const newValues = {
      contractedAmount: nextContractedAmount,
      discountType: nextDiscountType,
      discountValue: nextDiscountValue,
      discountValidUntil: values.discountValidUntil?.toISOString() ?? null,
      paymentGraceDays: values.paymentGraceDays,
      billingAccessExemptionKind: nextBillingAccessExemptionKind,
      billingAccessExemptUntil:
        nextBillingAccessExemptUntil?.toISOString() ?? null,
      billingAccessExemptionReason: nextBillingAccessExemptionReason,
      expectedBlockAt:
        getExpectedSubscriptionBlockAt({
          nextBillingAt: subscription.nextBillingAt,
          paymentGraceDays: values.paymentGraceDays,
        })?.toISOString() ?? null,
    }

    const [updatedSubscription] = await tx
      .update(storeSubscriptionsTable)
      .set({
        contractedAmount: nextContractedAmount,
        discountType: nextDiscountType,
        discountValue: nextDiscountValue,
        discountValidUntil: values.discountValidUntil,
        paymentGraceDays: values.paymentGraceDays,
        billingAccessExemptionKind: nextBillingAccessExemptionKind,
        billingAccessExemptUntil: nextBillingAccessExemptUntil,
        billingAccessExemptionReason: nextBillingAccessExemptionReason,
        updatedAt: now,
      })
      .where(eq(storeSubscriptionsTable.id, subscription.id))
      .returning()

    await tx.insert(storeBillingEventsTable).values({
      storeId: values.storeId,
      subscriptionId: subscription.id,
      eventType: 'subscription_changed',
      actorClerkId: operator.clerkId,
      actorEmail: operator.email,
      reason: values.reason,
      previousValues,
      newValues,
      metadata: {
        source: 'internal_subscription_terms',
      },
    })

    await tx.insert(internalOperationAuditLogsTable).values({
      action: 'update_store_subscription_terms',
      actorClerkId: operator.clerkId,
      actorEmail: operator.email,
      actorName: operator.name,
      storeId: values.storeId,
      targetUserEmail: null,
      previousStoreStatus: store.status,
      newStoreStatus: store.status,
      reason: `${values.reason} | valor=${nextContractedAmount}; desconto=${
        nextDiscountType ?? 'none'
      }; tolerancia=${values.paymentGraceDays}d; bloqueio_previsto=${
        newValues.expectedBlockAt ?? 'sem data'
      }; excecao_bloqueio=${
        nextBillingAccessExemptionKind
          ? `${nextBillingAccessExemptionKind} ate ${
              newValues.billingAccessExemptUntil ?? 'sem data'
            }`
          : 'none'
      }`,
    })

    return updatedSubscription
  })
}

export async function manageStoreModuleEntitlement({
  values,
  operator,
}: {
  values: StoreModuleManagementValues
  operator: InternalOperator
}) {
  const now = new Date()

  return await db.transaction(async tx => {
    const [store] = await tx
      .select({
        id: storesTable.id,
        status: storesTable.status,
      })
      .from(storesTable)
      .where(eq(storesTable.id, values.storeId))
      .limit(1)

    if (!store) throw new Error('STORE_NOT_FOUND')
    if (store.status === 'archived') throw new Error('STORE_ARCHIVED')

    const [module] = await tx
      .select({
        id: billingModulesTable.id,
        code: billingModulesTable.code,
        name: billingModulesTable.name,
        status: billingModulesTable.status,
      })
      .from(billingModulesTable)
      .where(eq(billingModulesTable.id, values.moduleId))
      .limit(1)

    if (!module || module.status !== 'active') {
      throw new Error('BILLING_MODULE_NOT_FOUND')
    }

    await tx.execute(
      sql`select pg_advisory_xact_lock(${values.storeId}, ${values.moduleId})`
    )

    if (values.action === 'activate') {
      if (
        values.origin === 'addon' &&
        !canUseInternalPermission({
          currentRole: operator.role,
          permission: 'manage_billing_values',
        })
      ) {
        throw new Error('STORE_MODULE_FINANCE_PERMISSION_REQUIRED')
      }

      const activeEntitlements = await tx
        .select({ id: storeModuleEntitlementsTable.id })
        .from(storeModuleEntitlementsTable)
        .where(
          and(
            eq(storeModuleEntitlementsTable.storeId, values.storeId),
            eq(storeModuleEntitlementsTable.moduleId, values.moduleId),
            eq(storeModuleEntitlementsTable.status, 'active'),
            sql`${storeModuleEntitlementsTable.revokedAt} is null`,
            sql`(${storeModuleEntitlementsTable.endsAt} is null or ${storeModuleEntitlementsTable.endsAt} > ${now})`
          )
        )
        .limit(1)

      if (activeEntitlements.length > 0) {
        throw new Error('STORE_MODULE_ALREADY_ACTIVE')
      }

      const endsAt = values.endsAt ? new Date(values.endsAt) : null

      if (endsAt && (!Number.isFinite(endsAt.getTime()) || endsAt <= now)) {
        throw new Error('INVALID_MODULE_END_DATE')
      }

      const [entitlement] = await tx
        .insert(storeModuleEntitlementsTable)
        .values({
          storeId: values.storeId,
          moduleId: values.moduleId,
          origin: values.origin,
          status: 'active',
          isAdditional: values.origin === 'addon',
          additionalAmount: normalizeModuleAdditionalAmount({
            origin: values.origin,
            amount: values.additionalAmount,
          }),
          currency: 'BRL',
          startsAt: now,
          endsAt,
          reason: values.reason,
          actorClerkId: operator.clerkId,
          metadata: {
            source: 'kan53_internal_module_management',
            action: values.action,
            actorEmail: operator.email,
          },
          updatedAt: now,
        })
        .returning()

      await tx.insert(internalOperationAuditLogsTable).values({
        action: 'manage_store_module_entitlement',
        actorClerkId: operator.clerkId,
        actorEmail: operator.email,
        actorName: operator.name,
        storeId: values.storeId,
        previousStoreStatus: `module:${module.code}:not_enabled`,
        newStoreStatus: `module:${module.code}:active:${values.origin}`,
        reason: values.reason,
      })

      return { action: 'activated' as const, entitlement }
    }

    const [entitlement] = await tx
      .select()
      .from(storeModuleEntitlementsTable)
      .where(
        and(
          eq(storeModuleEntitlementsTable.id, values.entitlementId ?? 0),
          eq(storeModuleEntitlementsTable.storeId, values.storeId),
          eq(storeModuleEntitlementsTable.moduleId, values.moduleId)
        )
      )
      .limit(1)

    if (!entitlement || entitlement.status !== 'active') {
      throw new Error('STORE_MODULE_ENTITLEMENT_NOT_ACTIVE')
    }

    if (entitlement.origin === 'plan') {
      throw new Error('STORE_MODULE_INCLUDED_IN_PLAN')
    }

    const [updatedEntitlement] = await tx
      .update(storeModuleEntitlementsTable)
      .set({
        status: 'revoked',
        revokedAt: now,
        endsAt: sql`greatest(${now}, ${storeModuleEntitlementsTable.startsAt} + interval '1 millisecond')`,
        reason: values.reason,
        actorClerkId: operator.clerkId,
        metadata: sql`${storeModuleEntitlementsTable.metadata} || ${JSON.stringify(
          {
            source: 'kan53_internal_module_management',
            action: values.action,
            actorEmail: operator.email,
          }
        )}::jsonb`,
        updatedAt: now,
      })
      .where(eq(storeModuleEntitlementsTable.id, entitlement.id))
      .returning()

    await tx.insert(internalOperationAuditLogsTable).values({
      action: 'manage_store_module_entitlement',
      actorClerkId: operator.clerkId,
      actorEmail: operator.email,
      actorName: operator.name,
      storeId: values.storeId,
      previousStoreStatus: `module:${module.code}:active:${entitlement.origin}`,
      newStoreStatus: `module:${module.code}:revoked:${entitlement.origin}`,
      reason: values.reason,
    })

    return { action: 'deactivated' as const, entitlement: updatedEntitlement }
  })
}

export async function changeStoreSubscriptionPlan({
  values,
  operator,
}: {
  values: StoreSubscriptionPlanChangeValues
  operator: InternalOperator
}) {
  const now = new Date()

  return await db.transaction(async tx => {
    const [store] = await tx
      .select({
        id: storesTable.id,
        status: storesTable.status,
      })
      .from(storesTable)
      .where(eq(storesTable.id, values.storeId))
      .limit(1)

    if (!store) throw new Error('STORE_NOT_FOUND')
    if (store.status === 'archived') throw new Error('STORE_ARCHIVED')

    const [subscription] = await tx
      .select({
        id: storeSubscriptionsTable.id,
        storeId: storeSubscriptionsTable.storeId,
        status: storeSubscriptionsTable.status,
        planId: storeSubscriptionsTable.planId,
        contractedAmount: storeSubscriptionsTable.contractedAmount,
        currency: storeSubscriptionsTable.currency,
        billingInterval: storeSubscriptionsTable.billingInterval,
        billingIntervalCount: storeSubscriptionsTable.billingIntervalCount,
        discountType: storeSubscriptionsTable.discountType,
        discountValue: storeSubscriptionsTable.discountValue,
        discountValidUntil: storeSubscriptionsTable.discountValidUntil,
        paymentGraceDays: storeSubscriptionsTable.paymentGraceDays,
        startsAt: storeSubscriptionsTable.startsAt,
        currentPeriodStart: storeSubscriptionsTable.currentPeriodStart,
        currentPeriodEnd: storeSubscriptionsTable.currentPeriodEnd,
        nextBillingAt: storeSubscriptionsTable.nextBillingAt,
      })
      .from(storeSubscriptionsTable)
      .where(
        and(
          eq(storeSubscriptionsTable.id, values.subscriptionId),
          eq(storeSubscriptionsTable.storeId, values.storeId),
          inArray(storeSubscriptionsTable.status, [
            'trialing',
            'active',
            'past_due',
            'paused',
          ])
        )
      )
      .limit(1)

    if (!subscription) throw new Error('STORE_SUBSCRIPTION_NOT_FOUND')
    if (subscription.planId === values.targetPlanId) {
      throw new Error('STORE_SUBSCRIPTION_PLAN_UNCHANGED')
    }

    const [pendingPlanChange] = await tx
      .select({ id: storeSubscriptionPlanChangesTable.id })
      .from(storeSubscriptionPlanChangesTable)
      .where(
        and(
          eq(storeSubscriptionPlanChangesTable.subscriptionId, subscription.id),
          eq(storeSubscriptionPlanChangesTable.status, 'scheduled')
        )
      )
      .limit(1)

    if (pendingPlanChange) {
      throw new Error('STORE_SUBSCRIPTION_PLAN_CHANGE_PENDING')
    }

    const [targetPlan] = await tx
      .select()
      .from(billingPlansTable)
      .where(
        and(
          eq(billingPlansTable.id, values.targetPlanId),
          eq(billingPlansTable.status, 'active')
        )
      )
      .limit(1)

    if (!targetPlan) throw new Error('BILLING_PLAN_NOT_FOUND')

    const [currentPlan] = await tx
      .select()
      .from(billingPlansTable)
      .where(eq(billingPlansTable.id, subscription.planId))
      .limit(1)

    const nextContractedAmount = normalizeCurrencyAmount(
      resolvePlanChangeContractedAmount({
        valueMode: values.valueMode,
        currentContractedAmount: subscription.contractedAmount,
        planDefaultAmount: targetPlan.defaultAmount,
        customContractedAmount: values.customContractedAmount,
      })
    )
    const effectiveAt = resolvePlanChangeEffectiveAt({
      timing: values.timing,
      now,
      nextBillingAt: subscription.nextBillingAt,
    })
    const keepCustomAmount = values.valueMode !== 'use_plan_default'
    const proration = calculatePlanChangeProration({
      timing: values.timing,
      policy: values.prorationPolicy,
      currentContractedAmount: subscription.contractedAmount,
      nextContractedAmount,
      currency: targetPlan.currency,
      periodStart: subscription.currentPeriodStart,
      periodEnd: subscription.currentPeriodEnd,
      effectiveAt,
    })

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
          eq(billingPlanModulesTable.planId, targetPlan.id),
          eq(billingPlanModulesTable.status, 'active'),
          sql`${billingPlanModulesTable.endsAt} is null`
        )
      )

    const currentPlanEntitlements = await tx
      .select({
        moduleId: storeModuleEntitlementsTable.moduleId,
        startsAt: storeModuleEntitlementsTable.startsAt,
      })
      .from(storeModuleEntitlementsTable)
      .where(
        and(
          eq(storeModuleEntitlementsTable.storeId, values.storeId),
          eq(storeModuleEntitlementsTable.subscriptionId, subscription.id),
          eq(storeModuleEntitlementsTable.origin, 'plan'),
          eq(storeModuleEntitlementsTable.status, 'active'),
          sql`${storeModuleEntitlementsTable.endsAt} is null`
        )
      )

    const targetPlanModuleIds = new Set(
      planModules.map(module => module.moduleId)
    )
    const previousPlanModuleIds = [
      ...new Set(currentPlanEntitlements.map(module => module.moduleId)),
    ]
    const removedModuleIds = previousPlanModuleIds.filter(
      moduleId => !targetPlanModuleIds.has(moduleId)
    )
    const previousValues = {
      subscriptionId: subscription.id,
      plan: currentPlan
        ? {
            id: currentPlan.id,
            code: currentPlan.code,
            name: currentPlan.name,
            defaultAmount: currentPlan.defaultAmount,
            billingInterval: currentPlan.billingInterval,
            billingIntervalCount: currentPlan.billingIntervalCount,
          }
        : { id: subscription.planId },
      contractedAmount: subscription.contractedAmount,
      currency: subscription.currency,
      billingInterval: subscription.billingInterval,
      billingIntervalCount: subscription.billingIntervalCount,
      currentPeriodStart: subscription.currentPeriodStart.toISOString(),
      currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
      nextBillingAt: subscription.nextBillingAt.toISOString(),
      moduleIds: previousPlanModuleIds,
    }
    const newValues = {
      plan: {
        id: targetPlan.id,
        code: targetPlan.code,
        name: targetPlan.name,
        defaultAmount: targetPlan.defaultAmount,
        billingInterval: targetPlan.billingInterval,
        billingIntervalCount: targetPlan.billingIntervalCount,
      },
      contractedAmount: nextContractedAmount,
      currency: targetPlan.currency,
      timing: values.timing,
      effectiveAt: effectiveAt.toISOString(),
      keepCustomAmount,
      moduleTreatment: values.moduleTreatment,
      prorationPolicy: values.prorationPolicy,
      proration,
      moduleIds: [...targetPlanModuleIds],
      removedModuleIds,
    }

    if (values.timing === 'next_renewal') {
      const [scheduledPlanChange] = await tx
        .insert(storeSubscriptionPlanChangesTable)
        .values({
          storeId: values.storeId,
          subscriptionId: subscription.id,
          fromPlanId: subscription.planId,
          toPlanId: targetPlan.id,
          timing: values.timing,
          status: 'scheduled',
          moduleTreatment: values.moduleTreatment,
          keepCustomAmount,
          previousContractedAmount: subscription.contractedAmount,
          nextContractedAmount,
          currency: targetPlan.currency,
          effectiveAt,
          actorClerkId: operator.clerkId,
          actorEmail: operator.email,
          reason: values.reason,
          previousValues,
          newValues,
          metadata: {
            source: 'internal_plan_change',
            stage: 'scheduled',
            timingLabel: getPlanChangeTimingLabel(values.timing),
            moduleTreatmentLabel: getModuleTreatmentLabel(
              values.moduleTreatment
            ),
            prorationPolicyLabel: getProrationPolicyLabel(
              values.prorationPolicy
            ),
            proration,
          },
          updatedAt: now,
        })
        .returning()

      await tx.insert(storeBillingEventsTable).values({
        storeId: values.storeId,
        subscriptionId: subscription.id,
        eventType: 'subscription_changed',
        actorClerkId: operator.clerkId,
        actorEmail: operator.email,
        reason: values.reason,
        previousValues,
        newValues,
        metadata: {
          source: 'internal_plan_change',
          stage: 'scheduled',
          planChangeId: scheduledPlanChange.id,
          proration,
        },
      })

      await tx.insert(internalOperationAuditLogsTable).values({
        action: 'change_store_subscription_plan',
        actorClerkId: operator.clerkId,
        actorEmail: operator.email,
        actorName: operator.name,
        storeId: values.storeId,
        targetUserEmail: null,
        previousStoreStatus: store.status,
        newStoreStatus: store.status,
        reason: `${values.reason} | plano=${subscription.planId}->${targetPlan.id}; vigencia=proxima_renovacao; valor=${nextContractedAmount}`,
      })

      return {
        planChange: scheduledPlanChange,
        appliedSubscription: null,
      }
    }

    await tx
      .update(storeSubscriptionsTable)
      .set({
        status: 'canceled',
        canceledAt: now,
        cancellationReason: `Mudanca imediata para plano ${targetPlan.code}: ${values.reason}`,
        updatedAt: now,
      })
      .where(eq(storeSubscriptionsTable.id, subscription.id))

    await tx
      .update(storeModuleEntitlementsTable)
      .set({
        status: 'expired',
        endsAt: sql`greatest(${now}, ${storeModuleEntitlementsTable.startsAt} + interval '1 millisecond')`,
        reason: `Plano substituido por ${targetPlan.code}: ${values.reason}`,
        actorClerkId: operator.clerkId,
        updatedAt: now,
      })
      .where(
        and(
          eq(storeModuleEntitlementsTable.storeId, values.storeId),
          eq(storeModuleEntitlementsTable.subscriptionId, subscription.id),
          eq(storeModuleEntitlementsTable.origin, 'plan'),
          eq(storeModuleEntitlementsTable.status, 'active')
        )
      )

    const period =
      subscription.currentPeriodEnd.getTime() > now.getTime()
        ? {
            status: 'active' as const,
            periodStart: now,
            periodEnd: subscription.currentPeriodEnd,
            nextBillingAt: subscription.currentPeriodEnd,
          }
        : getSubscriptionPeriod({
            startsAt: now,
            billingInterval: targetPlan.billingInterval,
            billingIntervalCount: targetPlan.billingIntervalCount,
            trialDays: 0,
          })

    const [newSubscription] = await tx
      .insert(storeSubscriptionsTable)
      .values({
        storeId: values.storeId,
        planId: targetPlan.id,
        status: period.status,
        contractedAmount: nextContractedAmount,
        currency: targetPlan.currency,
        billingInterval: targetPlan.billingInterval,
        billingIntervalCount: targetPlan.billingIntervalCount,
        discountType: subscription.discountType,
        discountValue: subscription.discountValue,
        discountValidUntil: subscription.discountValidUntil,
        paymentGraceDays: subscription.paymentGraceDays,
        startsAt: now,
        currentPeriodStart: period.periodStart,
        currentPeriodEnd: period.periodEnd,
        nextBillingAt: period.nextBillingAt,
        metadata: {
          source: 'internal_plan_change',
          previousSubscriptionId: subscription.id,
          previousPlanId: subscription.planId,
          changedBy: operator.email,
          valueMode: values.valueMode,
        },
        updatedAt: now,
      })
      .returning()

    if (planModules.length > 0) {
      await tx.insert(storeModuleEntitlementsTable).values(
        planModules.map(module => ({
          storeId: values.storeId,
          moduleId: module.moduleId,
          subscriptionId: newSubscription.id,
          planId: targetPlan.id,
          planModuleId: module.id,
          origin: 'plan' as const,
          status: 'active' as const,
          isAdditional: false,
          additionalAmount: '0',
          currency: targetPlan.currency,
          startsAt: now,
          reason: values.reason,
          actorClerkId: operator.clerkId,
          metadata: { source: 'internal_plan_change' },
          updatedAt: now,
        }))
      )
    }

    if (
      values.moduleTreatment !== 'sync_to_new_plan' &&
      removedModuleIds.length > 0
    ) {
      const existingManualEntitlements = await tx
        .select({ moduleId: storeModuleEntitlementsTable.moduleId })
        .from(storeModuleEntitlementsTable)
        .where(
          and(
            eq(storeModuleEntitlementsTable.storeId, values.storeId),
            eq(storeModuleEntitlementsTable.origin, 'manual'),
            eq(storeModuleEntitlementsTable.status, 'active'),
            sql`${storeModuleEntitlementsTable.endsAt} is null`,
            inArray(storeModuleEntitlementsTable.moduleId, removedModuleIds)
          )
        )
      const existingManualModuleIds = new Set(
        existingManualEntitlements.map(entitlement => entitlement.moduleId)
      )
      const manualModuleIds = removedModuleIds.filter(
        moduleId => !existingManualModuleIds.has(moduleId)
      )

      if (manualModuleIds.length > 0) {
        await tx.insert(storeModuleEntitlementsTable).values(
          manualModuleIds.map(moduleId => ({
            storeId: values.storeId,
            moduleId,
            origin: 'manual' as const,
            status: 'active' as const,
            isAdditional: false,
            additionalAmount: '0',
            currency: targetPlan.currency,
            startsAt: now,
            reason: `Mantido apos mudanca de plano: ${values.reason}`,
            actorClerkId: operator.clerkId,
            metadata: {
              source: 'internal_plan_change',
              treatment: values.moduleTreatment,
              requiresReview: values.moduleTreatment === 'manual_review',
              previousSubscriptionId: subscription.id,
            },
            updatedAt: now,
          }))
        )
      }
    }

    const [appliedPlanChange] = await tx
      .insert(storeSubscriptionPlanChangesTable)
      .values({
        storeId: values.storeId,
        subscriptionId: subscription.id,
        appliedSubscriptionId: newSubscription.id,
        fromPlanId: subscription.planId,
        toPlanId: targetPlan.id,
        timing: values.timing,
        status: 'applied',
        moduleTreatment: values.moduleTreatment,
        keepCustomAmount,
        previousContractedAmount: subscription.contractedAmount,
        nextContractedAmount,
        currency: targetPlan.currency,
        effectiveAt,
        appliedAt: now,
        actorClerkId: operator.clerkId,
        actorEmail: operator.email,
        reason: values.reason,
        previousValues,
        newValues: {
          ...newValues,
          appliedSubscriptionId: newSubscription.id,
          nextBillingAt: newSubscription.nextBillingAt.toISOString(),
        },
        metadata: {
          source: 'internal_plan_change',
          stage: 'applied',
          timingLabel: getPlanChangeTimingLabel(values.timing),
          moduleTreatmentLabel: getModuleTreatmentLabel(values.moduleTreatment),
          prorationPolicyLabel: getProrationPolicyLabel(values.prorationPolicy),
          proration,
        },
        updatedAt: now,
      })
      .returning()

    const shouldCreateProrationInvoice =
      proration.adjustmentType === 'debit' &&
      values.prorationPolicy === 'create_adjustment' &&
      Number(proration.amount) > 0
    const adjustmentStatus =
      proration.adjustmentType === 'none'
        ? 'applied'
        : values.prorationPolicy === 'waive'
          ? 'waived'
          : proration.adjustmentType === 'credit'
            ? 'recorded'
            : values.prorationPolicy === 'record_only'
              ? 'recorded'
              : shouldCreateProrationInvoice
                ? 'invoiced'
                : 'open'
    const [billingAdjustment] = await tx
      .insert(storeBillingAdjustmentsTable)
      .values({
        storeId: values.storeId,
        planChangeId: appliedPlanChange.id,
        sourceSubscriptionId: subscription.id,
        targetSubscriptionId: newSubscription.id,
        adjustmentType: proration.adjustmentType,
        status: adjustmentStatus,
        amount: proration.amount,
        currency: proration.currency,
        competenceStart: new Date(proration.effectiveAt),
        competenceEnd: new Date(proration.periodEnd),
        calculationSnapshot: proration,
        reason: values.reason,
        actorClerkId: operator.clerkId,
        actorEmail: operator.email,
        metadata: {
          source: 'internal_plan_change',
          policy: values.prorationPolicy,
          policyLabel: getProrationPolicyLabel(values.prorationPolicy),
        },
        updatedAt: now,
      })
      .returning()

    const [prorationInvoice] = shouldCreateProrationInvoice
      ? await tx
          .insert(storeBillingInvoicesTable)
          .values({
            storeId: values.storeId,
            subscriptionId: newSubscription.id,
            planId: targetPlan.id,
            invoiceNumber: buildInternalStoreProrationInvoiceNumber({
              storeId: values.storeId,
              planChangeId: appliedPlanChange.id,
            }),
            status: 'pending',
            currency: targetPlan.currency,
            subtotalAmount: proration.amount,
            discountAmount: '0',
            totalAmount: proration.amount,
            amountPaid: '0',
            amountRefunded: '0',
            planSnapshot: {
              id: targetPlan.id,
              code: targetPlan.code,
              name: targetPlan.name,
              defaultAmount: targetPlan.defaultAmount,
              currency: targetPlan.currency,
              billingInterval: targetPlan.billingInterval,
              billingIntervalCount: targetPlan.billingIntervalCount,
            },
            contractSnapshot: {
              kind: 'plan_change_proration',
              planChangeId: appliedPlanChange.id,
              billingAdjustmentId: billingAdjustment.id,
              previousSubscriptionId: subscription.id,
              newSubscriptionId: newSubscription.id,
              contractedAmount: nextContractedAmount,
              currency: targetPlan.currency,
            },
            periodStart: new Date(proration.effectiveAt),
            periodEnd: new Date(proration.periodEnd),
            dueAt: now,
            metadata: {
              kind: 'plan_change_proration',
              planChangeId: appliedPlanChange.id,
              billingAdjustmentId: billingAdjustment.id,
              calculation: proration,
            },
            updatedAt: now,
          })
          .returning()
      : [null]

    if (prorationInvoice) {
      await tx
        .update(storeBillingAdjustmentsTable)
        .set({
          invoiceId: prorationInvoice.id,
          updatedAt: now,
        })
        .where(eq(storeBillingAdjustmentsTable.id, billingAdjustment.id))
    }

    await tx.insert(storeBillingEventsTable).values({
      storeId: values.storeId,
      subscriptionId: subscription.id,
      eventType: 'subscription_cancelled',
      actorClerkId: operator.clerkId,
      actorEmail: operator.email,
      reason: values.reason,
      previousValues: {
        status: subscription.status,
        planId: subscription.planId,
      },
      newValues: {
        status: 'canceled',
        replacementSubscriptionId: newSubscription.id,
        planChangeId: appliedPlanChange.id,
      },
      metadata: { source: 'internal_plan_change' },
    })

    await tx.insert(storeBillingEventsTable).values({
      storeId: values.storeId,
      subscriptionId: newSubscription.id,
      invoiceId: prorationInvoice?.id ?? null,
      eventType: 'billing_adjustment_created',
      actorClerkId: operator.clerkId,
      actorEmail: operator.email,
      reason: values.reason,
      previousValues: null,
      newValues: {
        billingAdjustmentId: billingAdjustment.id,
        planChangeId: appliedPlanChange.id,
        ...proration,
      },
      metadata: {
        source: 'internal_plan_change',
        policy: values.prorationPolicy,
      },
    })

    if (prorationInvoice) {
      await tx.insert(storeBillingEventsTable).values({
        storeId: values.storeId,
        subscriptionId: newSubscription.id,
        invoiceId: prorationInvoice.id,
        eventType: 'invoice_created',
        actorClerkId: operator.clerkId,
        actorEmail: operator.email,
        reason: values.reason,
        previousValues: null,
        newValues: {
          invoiceNumber: prorationInvoice.invoiceNumber,
          totalAmount: prorationInvoice.totalAmount,
          billingAdjustmentId: billingAdjustment.id,
          planChangeId: appliedPlanChange.id,
        },
        metadata: {
          source: 'internal_plan_change',
          kind: 'plan_change_proration',
        },
      })
    }

    await tx.insert(storeBillingEventsTable).values({
      storeId: values.storeId,
      subscriptionId: newSubscription.id,
      eventType: 'subscription_changed',
      actorClerkId: operator.clerkId,
      actorEmail: operator.email,
      reason: values.reason,
      previousValues,
      newValues: {
        ...newValues,
        previousSubscriptionId: subscription.id,
        subscriptionId: newSubscription.id,
      },
      metadata: {
        source: 'internal_plan_change',
        stage: 'applied',
        planChangeId: appliedPlanChange.id,
      },
    })

    await tx.insert(internalOperationAuditLogsTable).values({
      action: 'change_store_subscription_plan',
      actorClerkId: operator.clerkId,
      actorEmail: operator.email,
      actorName: operator.name,
      storeId: values.storeId,
      targetUserEmail: null,
      previousStoreStatus: store.status,
      newStoreStatus: store.status,
      reason: `${values.reason} | plano=${subscription.planId}->${targetPlan.id}; vigencia=imediata; assinatura=${subscription.id}->${newSubscription.id}; valor=${nextContractedAmount}`,
    })

    return {
      planChange: appliedPlanChange,
      appliedSubscription: newSubscription,
    }
  })
}

export async function applyDueStoreSubscriptionPlanChanges({
  now = new Date(),
  limit = 25,
}: {
  now?: Date
  limit?: number
} = {}) {
  const duePlanChanges = await db
    .select({ id: storeSubscriptionPlanChangesTable.id })
    .from(storeSubscriptionPlanChangesTable)
    .where(
      and(
        eq(storeSubscriptionPlanChangesTable.status, 'scheduled'),
        lte(storeSubscriptionPlanChangesTable.effectiveAt, now)
      )
    )
    .orderBy(storeSubscriptionPlanChangesTable.effectiveAt)
    .limit(Math.max(1, Math.min(100, limit)))

  const results = []

  for (const planChange of duePlanChanges) {
    results.push(
      await applyScheduledStoreSubscriptionPlanChange({
        planChangeId: planChange.id,
        now,
      })
    )
  }

  return results
}

export async function applyScheduledStoreSubscriptionPlanChange({
  planChangeId,
  now = new Date(),
}: {
  planChangeId: number
  now?: Date
}) {
  return await db.transaction(async tx => {
    const [planChange] = await tx
      .select()
      .from(storeSubscriptionPlanChangesTable)
      .where(
        and(
          eq(storeSubscriptionPlanChangesTable.id, planChangeId),
          eq(storeSubscriptionPlanChangesTable.status, 'scheduled'),
          lte(storeSubscriptionPlanChangesTable.effectiveAt, now)
        )
      )
      .limit(1)

    if (!planChange) {
      throw new Error('STORE_SUBSCRIPTION_PLAN_CHANGE_NOT_DUE')
    }

    const [store] = await tx
      .select({
        id: storesTable.id,
        status: storesTable.status,
      })
      .from(storesTable)
      .where(eq(storesTable.id, planChange.storeId))
      .limit(1)

    if (!store) throw new Error('STORE_NOT_FOUND')
    if (store.status === 'archived') throw new Error('STORE_ARCHIVED')

    const [subscription] = await tx
      .select()
      .from(storeSubscriptionsTable)
      .where(
        and(
          eq(storeSubscriptionsTable.id, planChange.subscriptionId),
          eq(storeSubscriptionsTable.storeId, planChange.storeId),
          eq(storeSubscriptionsTable.planId, planChange.fromPlanId),
          inArray(storeSubscriptionsTable.status, [
            'trialing',
            'active',
            'past_due',
            'paused',
          ])
        )
      )
      .limit(1)

    if (!subscription) throw new Error('STORE_SUBSCRIPTION_NOT_FOUND')

    const [targetPlan] = await tx
      .select()
      .from(billingPlansTable)
      .where(
        and(
          eq(billingPlansTable.id, planChange.toPlanId),
          eq(billingPlansTable.status, 'active')
        )
      )
      .limit(1)

    if (!targetPlan) throw new Error('BILLING_PLAN_NOT_FOUND')

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
          eq(billingPlanModulesTable.planId, targetPlan.id),
          eq(billingPlanModulesTable.status, 'active'),
          sql`${billingPlanModulesTable.endsAt} is null`
        )
      )

    const currentPlanEntitlements = await tx
      .select({
        moduleId: storeModuleEntitlementsTable.moduleId,
      })
      .from(storeModuleEntitlementsTable)
      .where(
        and(
          eq(storeModuleEntitlementsTable.storeId, planChange.storeId),
          eq(storeModuleEntitlementsTable.subscriptionId, subscription.id),
          eq(storeModuleEntitlementsTable.origin, 'plan'),
          eq(storeModuleEntitlementsTable.status, 'active'),
          sql`${storeModuleEntitlementsTable.endsAt} is null`
        )
      )

    const targetPlanModuleIds = new Set(
      planModules.map(module => module.moduleId)
    )
    const previousPlanModuleIds = [
      ...new Set(currentPlanEntitlements.map(module => module.moduleId)),
    ]
    const removedModuleIds = previousPlanModuleIds.filter(
      moduleId => !targetPlanModuleIds.has(moduleId)
    )

    await tx
      .update(storeSubscriptionsTable)
      .set({
        status: 'canceled',
        canceledAt: now,
        cancellationReason: `Mudanca programada aplicada para plano ${targetPlan.code}: ${planChange.reason}`,
        updatedAt: now,
      })
      .where(eq(storeSubscriptionsTable.id, subscription.id))

    await tx
      .update(storeModuleEntitlementsTable)
      .set({
        status: 'expired',
        endsAt: sql`greatest(${now}, ${storeModuleEntitlementsTable.startsAt} + interval '1 millisecond')`,
        reason: `Plano substituido por ${targetPlan.code}: ${planChange.reason}`,
        actorClerkId: planChange.actorClerkId,
        updatedAt: now,
      })
      .where(
        and(
          eq(storeModuleEntitlementsTable.storeId, planChange.storeId),
          eq(storeModuleEntitlementsTable.subscriptionId, subscription.id),
          eq(storeModuleEntitlementsTable.origin, 'plan'),
          eq(storeModuleEntitlementsTable.status, 'active')
        )
      )

    const period = getSubscriptionPeriod({
      startsAt: now,
      billingInterval: targetPlan.billingInterval,
      billingIntervalCount: targetPlan.billingIntervalCount,
      trialDays: 0,
    })

    const [newSubscription] = await tx
      .insert(storeSubscriptionsTable)
      .values({
        storeId: planChange.storeId,
        planId: targetPlan.id,
        status: period.status,
        contractedAmount: planChange.nextContractedAmount,
        currency: targetPlan.currency,
        billingInterval: targetPlan.billingInterval,
        billingIntervalCount: targetPlan.billingIntervalCount,
        discountType: subscription.discountType,
        discountValue: subscription.discountValue,
        discountValidUntil: subscription.discountValidUntil,
        paymentGraceDays: subscription.paymentGraceDays,
        startsAt: now,
        currentPeriodStart: period.periodStart,
        currentPeriodEnd: period.periodEnd,
        nextBillingAt: period.nextBillingAt,
        metadata: {
          source: 'scheduled_plan_change',
          planChangeId: planChange.id,
          previousSubscriptionId: subscription.id,
          previousPlanId: subscription.planId,
          changedBy: planChange.actorEmail,
        },
        updatedAt: now,
      })
      .returning()

    if (planModules.length > 0) {
      await tx.insert(storeModuleEntitlementsTable).values(
        planModules.map(module => ({
          storeId: planChange.storeId,
          moduleId: module.moduleId,
          subscriptionId: newSubscription.id,
          planId: targetPlan.id,
          planModuleId: module.id,
          origin: 'plan' as const,
          status: 'active' as const,
          isAdditional: false,
          additionalAmount: '0',
          currency: targetPlan.currency,
          startsAt: now,
          reason: planChange.reason,
          actorClerkId: planChange.actorClerkId,
          metadata: { source: 'scheduled_plan_change' },
          updatedAt: now,
        }))
      )
    }

    if (
      planChange.moduleTreatment !== 'sync_to_new_plan' &&
      removedModuleIds.length > 0
    ) {
      const existingManualEntitlements = await tx
        .select({ moduleId: storeModuleEntitlementsTable.moduleId })
        .from(storeModuleEntitlementsTable)
        .where(
          and(
            eq(storeModuleEntitlementsTable.storeId, planChange.storeId),
            eq(storeModuleEntitlementsTable.origin, 'manual'),
            eq(storeModuleEntitlementsTable.status, 'active'),
            sql`${storeModuleEntitlementsTable.endsAt} is null`,
            inArray(storeModuleEntitlementsTable.moduleId, removedModuleIds)
          )
        )
      const existingManualModuleIds = new Set(
        existingManualEntitlements.map(entitlement => entitlement.moduleId)
      )
      const manualModuleIds = removedModuleIds.filter(
        moduleId => !existingManualModuleIds.has(moduleId)
      )

      if (manualModuleIds.length > 0) {
        await tx.insert(storeModuleEntitlementsTable).values(
          manualModuleIds.map(moduleId => ({
            storeId: planChange.storeId,
            moduleId,
            origin: 'manual' as const,
            status: 'active' as const,
            isAdditional: false,
            additionalAmount: '0',
            currency: targetPlan.currency,
            startsAt: now,
            reason: `Mantido apos mudanca programada: ${planChange.reason}`,
            actorClerkId: planChange.actorClerkId,
            metadata: {
              source: 'scheduled_plan_change',
              treatment: planChange.moduleTreatment,
              requiresReview: planChange.moduleTreatment === 'manual_review',
              previousSubscriptionId: subscription.id,
            },
            updatedAt: now,
          }))
        )
      }
    }

    const appliedNewValues = {
      ...(planChange.newValues as Record<string, unknown>),
      appliedSubscriptionId: newSubscription.id,
      previousSubscriptionId: subscription.id,
      nextBillingAt: newSubscription.nextBillingAt.toISOString(),
      appliedAt: now.toISOString(),
    }

    const [updatedPlanChange] = await tx
      .update(storeSubscriptionPlanChangesTable)
      .set({
        status: 'applied',
        appliedAt: now,
        appliedSubscriptionId: newSubscription.id,
        newValues: appliedNewValues,
        metadata: {
          ...(planChange.metadata as Record<string, unknown>),
          stage: 'applied',
          appliedBy: 'scheduled_plan_change_runner',
        },
        updatedAt: now,
      })
      .where(eq(storeSubscriptionPlanChangesTable.id, planChange.id))
      .returning()

    await tx.insert(storeBillingEventsTable).values({
      storeId: planChange.storeId,
      subscriptionId: subscription.id,
      eventType: 'subscription_cancelled',
      actorClerkId: planChange.actorClerkId,
      actorEmail: planChange.actorEmail,
      reason: planChange.reason,
      previousValues: {
        status: subscription.status,
        planId: subscription.planId,
      },
      newValues: {
        status: 'canceled',
        replacementSubscriptionId: newSubscription.id,
        planChangeId: planChange.id,
      },
      metadata: { source: 'scheduled_plan_change' },
    })

    await tx.insert(storeBillingEventsTable).values({
      storeId: planChange.storeId,
      subscriptionId: newSubscription.id,
      eventType: 'subscription_changed',
      actorClerkId: planChange.actorClerkId,
      actorEmail: planChange.actorEmail,
      reason: planChange.reason,
      previousValues: planChange.previousValues,
      newValues: appliedNewValues,
      metadata: {
        source: 'scheduled_plan_change',
        stage: 'applied',
        planChangeId: planChange.id,
      },
    })

    await tx.insert(internalOperationAuditLogsTable).values({
      action: 'change_store_subscription_plan',
      actorClerkId: planChange.actorClerkId,
      actorEmail: planChange.actorEmail,
      actorName: null,
      storeId: planChange.storeId,
      targetUserEmail: null,
      previousStoreStatus: store.status,
      newStoreStatus: store.status,
      reason: `${planChange.reason} | plano=${subscription.planId}->${targetPlan.id}; vigencia=programada_aplicada; assinatura=${subscription.id}->${newSubscription.id}; valor=${planChange.nextContractedAmount}`,
    })

    return {
      planChange: updatedPlanChange,
      appliedSubscription: newSubscription,
    }
  })
}

export async function blockStoreAccess({
  values,
  operator,
}: {
  values: StoreAccessBlockActionValues
  operator: InternalOperator
}) {
  const now = new Date()
  const scheduleError = validateStoreAccessBlockSchedule({
    scheduledUnblockAt: values.scheduledUnblockAt,
    now,
  })

  if (scheduleError) throw new Error(scheduleError)

  return await db.transaction(async tx => {
    const [store] = await tx
      .select()
      .from(storesTable)
      .where(eq(storesTable.id, values.storeId))
      .limit(1)

    if (!store) throw new Error('STORE_NOT_FOUND')
    if (store.status === 'archived') throw new Error('STORE_ARCHIVED')

    const [activeBlock] = await tx
      .select({ id: storeAccessBlocksTable.id })
      .from(storeAccessBlocksTable)
      .where(
        and(
          eq(storeAccessBlocksTable.storeId, values.storeId),
          sql`${storeAccessBlocksTable.unblockedAt} is null`,
          sql`(${storeAccessBlocksTable.scheduledUnblockAt} is null or ${storeAccessBlocksTable.scheduledUnblockAt} > ${now})`
        )
      )
      .limit(1)

    if (activeBlock) throw new Error('STORE_ACCESS_BLOCK_ALREADY_ACTIVE')

    const [block] = await tx
      .insert(storeAccessBlocksTable)
      .values({
        storeId: values.storeId,
        reason: values.reason,
        notifyStoreOwner: values.notifyStoreOwner,
        notificationNote: values.notificationNote.trim() || null,
        scheduledUnblockAt: values.scheduledUnblockAt,
        blockedAt: now,
        blockedByClerkId: operator.clerkId,
        blockedByEmail: operator.email,
        blockedByName: operator.name,
        updatedAt: now,
      })
      .returning()

    await tx.insert(internalOperationAuditLogsTable).values({
      action: 'block_store_access',
      actorClerkId: operator.clerkId,
      actorEmail: operator.email,
      actorName: operator.name,
      storeId: values.storeId,
      targetUserEmail: null,
      previousStoreStatus: store.status,
      newStoreStatus: store.status,
      reason: `${values.reason} | notificar=${
        values.notifyStoreOwner ? 'sim' : 'nao'
      }${
        values.scheduledUnblockAt
          ? `; desbloqueio_programado=${values.scheduledUnblockAt.toISOString()}`
          : ''
      }${
        values.notificationNote.trim()
          ? `; observacao=${values.notificationNote.trim()}`
          : ''
      }`,
    })

    return block
  })
}

export async function unblockStoreAccess({
  values,
  operator,
}: {
  values: StoreAccessUnblockActionValues
  operator: InternalOperator
}) {
  const now = new Date()

  return await db.transaction(async tx => {
    const [store] = await tx
      .select()
      .from(storesTable)
      .where(eq(storesTable.id, values.storeId))
      .limit(1)

    if (!store) throw new Error('STORE_NOT_FOUND')

    const [activeBlock] = await tx
      .select()
      .from(storeAccessBlocksTable)
      .where(
        and(
          eq(storeAccessBlocksTable.storeId, values.storeId),
          sql`${storeAccessBlocksTable.unblockedAt} is null`,
          sql`(${storeAccessBlocksTable.scheduledUnblockAt} is null or ${storeAccessBlocksTable.scheduledUnblockAt} > ${now})`
        )
      )
      .orderBy(desc(storeAccessBlocksTable.blockedAt))
      .limit(1)

    if (!activeBlock) throw new Error('STORE_ACCESS_BLOCK_NOT_ACTIVE')

    const [block] = await tx
      .update(storeAccessBlocksTable)
      .set({
        unblockedAt: now,
        unblockedByClerkId: operator.clerkId,
        unblockedByEmail: operator.email,
        unblockedByName: operator.name,
        unblockReason: values.reason,
        updatedAt: now,
      })
      .where(eq(storeAccessBlocksTable.id, activeBlock.id))
      .returning()

    await tx.insert(internalOperationAuditLogsTable).values({
      action: 'unblock_store_access',
      actorClerkId: operator.clerkId,
      actorEmail: operator.email,
      actorName: operator.name,
      storeId: values.storeId,
      targetUserEmail: null,
      previousStoreStatus: store.status,
      newStoreStatus: store.status,
      reason: values.reason,
    })

    return block
  })
}

export async function updateStoreCommercialLifecycle({
  storeId,
  targetStatus,
  reason,
  subscriptionEffect,
  accessEffect,
  confirmation,
  operator,
}: {
  storeId: number
  targetStatus: StoreLifecycleTargetStatus
  reason: string
  subscriptionEffect: StoreLifecycleSubscriptionEffect
  accessEffect: StoreLifecycleAccessEffect
  confirmation: string
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

    const [subscription] = await tx
      .select({
        id: storeSubscriptionsTable.id,
        status: storeSubscriptionsTable.status,
        planId: storeSubscriptionsTable.planId,
        contractedAmount: storeSubscriptionsTable.contractedAmount,
        currency: storeSubscriptionsTable.currency,
        currentPeriodStart: storeSubscriptionsTable.currentPeriodStart,
        currentPeriodEnd: storeSubscriptionsTable.currentPeriodEnd,
        nextBillingAt: storeSubscriptionsTable.nextBillingAt,
      })
      .from(storeSubscriptionsTable)
      .where(
        and(
          eq(storeSubscriptionsTable.storeId, storeId),
          inArray(storeSubscriptionsTable.status, [
            'trialing',
            'active',
            'past_due',
            'paused',
          ])
        )
      )
      .orderBy(desc(storeSubscriptionsTable.updatedAt))
      .limit(1)

    const transitionError = validateStoreLifecycleTransition({
      currentStatus: store.status,
      targetStatus,
      subscription: subscription ?? null,
      confirmation,
      expectedConfirmation: store.subdomain,
    })

    if (transitionError) throw new Error(transitionError)

    if (
      targetStatus === 'active' &&
      !['keep_subscription', 'resume_subscription'].includes(subscriptionEffect)
    ) {
      throw new Error('STORE_LIFECYCLE_SUBSCRIPTION_EFFECT_INVALID')
    }

    if (
      targetStatus === 'inactive' &&
      !['keep_subscription', 'pause_subscription'].includes(subscriptionEffect)
    ) {
      throw new Error('STORE_LIFECYCLE_SUBSCRIPTION_EFFECT_INVALID')
    }

    if (targetStatus === 'active' && accessEffect !== 'keep_access') {
      throw new Error('STORE_LIFECYCLE_ACCESS_EFFECT_INVALID')
    }

    if (targetStatus === 'active' && store.status === 'implementing') {
      await ensureStoreImplementationChecklistForStoreTransaction({
        tx,
        storeId,
        now,
      })

      const checklistItems = await tx
        .select({
          status: storeImplementationChecklistItemsTable.status,
          requiredForActivation:
            storeImplementationChecklistItemsTable.requiredForActivation,
        })
        .from(storeImplementationChecklistItemsTable)
        .where(eq(storeImplementationChecklistItemsTable.storeId, storeId))

      const progress = getStoreImplementationChecklistProgress(checklistItems)
      if (!progress.canActivate) {
        throw new Error('STORE_IMPLEMENTATION_CHECKLIST_INCOMPLETE')
      }
    }

    if (accessEffect === 'revoke_access') {
      await tx
        .update(userStorePermissionsTable)
        .set({
          revokedAt: now,
          revokedReason:
            targetStatus === 'archived'
              ? 'store_commercial_cancelled'
              : 'store_commercial_inactivated',
          updatedAt: now,
        })
        .where(
          and(
            eq(userStorePermissionsTable.storeId, storeId),
            sql`${userStorePermissionsTable.revokedAt} is null`
          )
        )
    }

    if (subscription && subscriptionEffect !== 'keep_subscription') {
      const nextSubscriptionStatus =
        subscriptionEffect === 'cancel_subscription'
          ? 'canceled'
          : subscriptionEffect === 'pause_subscription'
            ? 'paused'
            : 'active'

      if (subscription.status !== nextSubscriptionStatus) {
        await tx
          .update(storeSubscriptionsTable)
          .set({
            status: nextSubscriptionStatus,
            canceledAt:
              subscriptionEffect === 'cancel_subscription' ? now : null,
            cancellationReason:
              subscriptionEffect === 'cancel_subscription' ? reason : null,
            updatedAt: now,
          })
          .where(eq(storeSubscriptionsTable.id, subscription.id))

        await tx.insert(storeBillingEventsTable).values({
          storeId,
          subscriptionId: subscription.id,
          eventType:
            subscriptionEffect === 'cancel_subscription'
              ? 'subscription_cancelled'
              : 'subscription_changed',
          actorClerkId: operator.clerkId,
          actorEmail: operator.email,
          reason,
          previousValues: {
            status: subscription.status,
          },
          newValues: {
            status: nextSubscriptionStatus,
            effect: subscriptionEffect,
          },
          metadata: {
            source: 'internal_store_commercial_lifecycle',
            targetStoreStatus: targetStatus,
          },
        })
      }
    }

    const [updatedStore] = await tx
      .update(storesTable)
      .set({
        status: targetStatus,
        statusReason: reason,
        statusUpdatedAt: now,
        cancelledAt: targetStatus === 'archived' ? now : null,
        cancellationReason: targetStatus === 'archived' ? reason : null,
        updatedAt: now,
      })
      .where(eq(storesTable.id, storeId))
      .returning()

    if (!updatedStore) throw new Error('STORE_NOT_FOUND')

    await tx.insert(internalOperationAuditLogsTable).values({
      action: getStoreLifecycleAuditAction(store.status, targetStatus),
      actorClerkId: operator.clerkId,
      actorEmail: operator.email,
      actorName: operator.name,
      storeId,
      targetUserEmail: null,
      previousStoreStatus: store.status,
      newStoreStatus: updatedStore.status,
      reason: `${reason} | assinatura=${subscriptionEffect}; acesso=${accessEffect}`,
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
