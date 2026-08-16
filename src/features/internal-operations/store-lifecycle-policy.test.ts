import { describe, expect, test } from 'bun:test'
import {
  getAllowedStoreLifecycleTargets,
  getDefaultStoreLifecycleSubscriptionEffect,
  getStoreLifecycleAuditAction,
  isFinanciallyValidForStoreActivation,
  isStoreLifecycleTransitionAllowed,
  storeLifecycleTransitionSchema,
  validateStoreLifecycleTransition,
} from './store-lifecycle-policy'

const validSubscription = {
  id: 10,
  status: 'active',
  planId: 2,
  contractedAmount: '199.90',
  currency: 'BRL',
  currentPeriodStart: new Date('2026-08-01T00:00:00.000Z'),
  currentPeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
  nextBillingAt: new Date('2026-09-01T00:00:00.000Z'),
}

describe('store commercial lifecycle policy', () => {
  test('allows only valid commercial status transitions', () => {
    expect(getAllowedStoreLifecycleTargets('active')).toEqual([
      'inactive',
      'archived',
    ])
    expect(getAllowedStoreLifecycleTargets('inactive')).toEqual([
      'active',
      'archived',
    ])
    expect(getAllowedStoreLifecycleTargets('pending_recovery')).toEqual([
      'active',
      'archived',
    ])
    expect(getAllowedStoreLifecycleTargets('implementing')).toEqual([
      'active',
      'archived',
    ])
    expect(getAllowedStoreLifecycleTargets('archived')).toEqual([])
    expect(
      isStoreLifecycleTransitionAllowed({
        currentStatus: 'archived',
        targetStatus: 'active',
      })
    ).toBe(false)
  })

  test('requires valid financial setup before activation or reactivation', () => {
    expect(isFinanciallyValidForStoreActivation(validSubscription)).toBe(true)
    expect(
      isFinanciallyValidForStoreActivation({
        ...validSubscription,
        planId: null,
      })
    ).toBe(false)
    expect(
      isFinanciallyValidForStoreActivation({
        ...validSubscription,
        status: 'canceled',
      })
    ).toBe(false)
    expect(
      validateStoreLifecycleTransition({
        currentStatus: 'inactive',
        targetStatus: 'active',
        subscription: null,
      })
    ).toBe('STORE_LIFECYCLE_FINANCIAL_CONFIG_INVALID')
  })

  test('requires explicit subdomain confirmation for cancellation', () => {
    expect(
      validateStoreLifecycleTransition({
        currentStatus: 'active',
        targetStatus: 'archived',
        subscription: validSubscription,
        confirmation: 'errado',
        expectedConfirmation: 'loja-certa',
      })
    ).toBe('STORE_LIFECYCLE_CONFIRMATION_MISMATCH')
    expect(
      validateStoreLifecycleTransition({
        currentStatus: 'active',
        targetStatus: 'archived',
        subscription: validSubscription,
        confirmation: 'loja-certa',
        expectedConfirmation: 'loja-certa',
      })
    ).toBe(null)
  })

  test('normalizes form payload and maps defaults for lifecycle actions', () => {
    const parsed = storeLifecycleTransitionSchema.parse({
      storeId: '12',
      targetStatus: 'inactive',
      reason: 'Cliente solicitou pausa operacional.',
      subscriptionEffect: 'pause_subscription',
      accessEffect: 'keep_access',
      confirmation: '',
    })

    expect(parsed.storeId).toBe(12)
    expect(getDefaultStoreLifecycleSubscriptionEffect({
      targetStatus: 'archived',
      subscriptionStatus: 'active',
    })).toBe('cancel_subscription')
    expect(getDefaultStoreLifecycleSubscriptionEffect({
      targetStatus: 'active',
      subscriptionStatus: 'paused',
    })).toBe('resume_subscription')
    expect(getStoreLifecycleAuditAction('implementing', 'active')).toBe(
      'activate_store_commercial'
    )
    expect(getStoreLifecycleAuditAction('inactive', 'active')).toBe(
      'reactivate_store_commercial'
    )
  })
})
