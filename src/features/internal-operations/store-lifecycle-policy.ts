import { z } from 'zod'
import type { InternalStoreStatus } from './db'

export const storeLifecycleTargetStatuses = [
  'active',
  'inactive',
  'archived',
] as const

export const storeLifecycleSubscriptionEffects = [
  'keep_subscription',
  'pause_subscription',
  'resume_subscription',
  'cancel_subscription',
] as const

export const storeLifecycleAccessEffects = [
  'keep_access',
  'revoke_access',
] as const

export type StoreLifecycleTargetStatus =
  (typeof storeLifecycleTargetStatuses)[number]

export type StoreLifecycleSubscriptionEffect =
  (typeof storeLifecycleSubscriptionEffects)[number]

export type StoreLifecycleAccessEffect =
  (typeof storeLifecycleAccessEffects)[number]

export type StoreLifecycleSubscriptionSnapshot = {
  id: number | null
  status: string | null
  planId: number | null
  contractedAmount: string | null
  currency: string | null
  currentPeriodStart: Date | null
  currentPeriodEnd: Date | null
  nextBillingAt: Date | null
}

export const archivedStoreDataRetentionPolicy = {
  status: 'archived',
  retention: 'retain_for_legal_billing_and_audit_history',
  access: 'internal_operations_only',
  mutability: 'read_only',
  personalDataVisibility: 'masked_unless_role_can_view_personal_data',
} as const

export const storeLifecycleTransitionSchema = z.object({
  storeId: z.coerce.number().int().positive(),
  targetStatus: z.enum(storeLifecycleTargetStatuses),
  reason: z.string().trim().min(8).max(500),
  subscriptionEffect: z.enum(storeLifecycleSubscriptionEffects),
  accessEffect: z.enum(storeLifecycleAccessEffects),
  confirmation: z
    .preprocess(value => value ?? '', z.string().trim().max(120))
    .default(''),
})

export type StoreLifecycleTransitionValues = z.infer<
  typeof storeLifecycleTransitionSchema
>

export function getAllowedStoreLifecycleTargets(
  currentStatus: InternalStoreStatus
): StoreLifecycleTargetStatus[] {
  if (currentStatus === 'archived') return []
  if (currentStatus === 'active') return ['inactive', 'archived']
  if (currentStatus === 'inactive' || currentStatus === 'pending_recovery') {
    return ['active', 'archived']
  }
  if (currentStatus === 'implementing') return ['active', 'archived']

  return []
}

export function isStoreLifecycleTransitionAllowed({
  currentStatus,
  targetStatus,
}: {
  currentStatus: InternalStoreStatus
  targetStatus: StoreLifecycleTargetStatus
}) {
  return getAllowedStoreLifecycleTargets(currentStatus).includes(targetStatus)
}

export function getStoreDataRetentionPolicy(status: InternalStoreStatus) {
  if (status === 'archived') return archivedStoreDataRetentionPolicy

  return null
}

export function isFinanciallyValidForStoreActivation(
  subscription: StoreLifecycleSubscriptionSnapshot | null
) {
  if (!subscription) return false
  if (!subscription.id || !subscription.planId) return false
  if (
    !['trialing', 'active', 'past_due', 'paused'].includes(
      subscription.status ?? ''
    )
  ) {
    return false
  }

  const contractedAmount = Number(subscription.contractedAmount)
  if (!Number.isFinite(contractedAmount) || contractedAmount < 0) return false
  if (!subscription.currency) return false
  if (!subscription.currentPeriodStart || !subscription.currentPeriodEnd) {
    return false
  }
  if (!subscription.nextBillingAt) return false

  return (
    subscription.currentPeriodEnd.getTime() >
    subscription.currentPeriodStart.getTime()
  )
}

export function validateStoreLifecycleTransition({
  currentStatus,
  targetStatus,
  subscription,
  confirmation,
  expectedConfirmation,
}: {
  currentStatus: InternalStoreStatus
  targetStatus: StoreLifecycleTargetStatus
  subscription: StoreLifecycleSubscriptionSnapshot | null
  confirmation?: string
  expectedConfirmation?: string
}) {
  if (!isStoreLifecycleTransitionAllowed({ currentStatus, targetStatus })) {
    return 'STORE_LIFECYCLE_TRANSITION_INVALID'
  }

  if (targetStatus === 'archived' && confirmation !== expectedConfirmation) {
    return 'STORE_LIFECYCLE_CONFIRMATION_MISMATCH'
  }

  if (
    targetStatus === 'active' &&
    !isFinanciallyValidForStoreActivation(subscription)
  ) {
    return 'STORE_LIFECYCLE_FINANCIAL_CONFIG_INVALID'
  }

  return null
}

export function getDefaultStoreLifecycleSubscriptionEffect({
  targetStatus,
  subscriptionStatus,
}: {
  targetStatus: StoreLifecycleTargetStatus
  subscriptionStatus: string | null
}): StoreLifecycleSubscriptionEffect {
  if (targetStatus === 'archived') return 'cancel_subscription'
  if (targetStatus === 'inactive') return 'pause_subscription'
  if (subscriptionStatus === 'paused') return 'resume_subscription'

  return 'keep_subscription'
}

export function getStoreLifecycleAuditAction(
  currentStatus: InternalStoreStatus,
  targetStatus: StoreLifecycleTargetStatus
) {
  if (targetStatus === 'active') {
    return currentStatus === 'implementing'
      ? ('activate_store_commercial' as const)
      : ('reactivate_store_commercial' as const)
  }
  if (targetStatus === 'inactive') return 'inactivate_store_commercial' as const

  return 'cancel_store_commercial' as const
}
