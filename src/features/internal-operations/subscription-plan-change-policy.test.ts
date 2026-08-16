import { describe, expect, test } from 'bun:test'
import {
  getModuleTreatmentLabel,
  getPlanChangeTimingLabel,
  resolvePlanChangeContractedAmount,
  resolvePlanChangeEffectiveAt,
  storeSubscriptionPlanChangeSchema,
} from './subscription-plan-change-policy'

describe('internal subscription plan change policy', () => {
  test('validates an immediate plan change with plan default amount', () => {
    const parsed = storeSubscriptionPlanChangeSchema.parse({
      storeId: '10',
      subscriptionId: '20',
      targetPlanId: '30',
      timing: 'immediate',
      valueMode: 'use_plan_default',
      moduleTreatment: 'sync_to_new_plan',
      reason: 'Upgrade comercial aprovado pela loja.',
    })

    expect(parsed.storeId).toBe(10)
    expect(parsed.subscriptionId).toBe(20)
    expect(parsed.targetPlanId).toBe(30)
  })

  test('requires a valid custom amount when custom value mode is selected', () => {
    const result = storeSubscriptionPlanChangeSchema.safeParse({
      storeId: 10,
      subscriptionId: 20,
      targetPlanId: 30,
      timing: 'next_renewal',
      valueMode: 'custom',
      customContractedAmount: '',
      moduleTreatment: 'manual_review',
      reason: 'Downgrade negociado para a proxima renovacao.',
    })

    expect(result.success).toBe(false)
  })

  test('keeps scheduled changes effective only at next billing date', () => {
    const now = new Date('2026-08-16T10:00:00.000Z')
    const nextBillingAt = new Date('2026-09-01T00:00:00.000Z')

    expect(
      resolvePlanChangeEffectiveAt({
        timing: 'immediate',
        now,
        nextBillingAt,
      }).toISOString()
    ).toBe('2026-08-16T10:00:00.000Z')

    expect(
      resolvePlanChangeEffectiveAt({
        timing: 'next_renewal',
        now,
        nextBillingAt,
      }).toISOString()
    ).toBe('2026-09-01T00:00:00.000Z')
  })

  test('resolves amount modes and labels for the internal UI', () => {
    expect(
      resolvePlanChangeContractedAmount({
        valueMode: 'keep_current',
        currentContractedAmount: '199.90',
        planDefaultAmount: '299.90',
      })
    ).toBe('199.90')
    expect(
      resolvePlanChangeContractedAmount({
        valueMode: 'use_plan_default',
        currentContractedAmount: '199.90',
        planDefaultAmount: '299.90',
      })
    ).toBe('299.90')
    expect(
      resolvePlanChangeContractedAmount({
        valueMode: 'custom',
        currentContractedAmount: '199.90',
        planDefaultAmount: '299.90',
        customContractedAmount: '249,90',
      })
    ).toBe('249.9')

    expect(getPlanChangeTimingLabel('next_renewal')).toBe(
      'Aplicar na proxima renovacao'
    )
    expect(getModuleTreatmentLabel('sync_to_new_plan')).toBe(
      'Sincronizar modulos do novo plano'
    )
  })
})
