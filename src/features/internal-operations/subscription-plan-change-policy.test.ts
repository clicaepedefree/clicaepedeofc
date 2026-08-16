import { describe, expect, test } from 'bun:test'
import {
  calculatePlanChangeProration,
  getModuleTreatmentLabel,
  getPlanChangeTimingLabel,
  getProrationPolicyLabel,
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
      prorationPolicy: 'create_adjustment',
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
    expect(getProrationPolicyLabel('create_adjustment')).toBe(
      'Gerar ajuste financeiro'
    )
  })

  test('calculates deterministic debit proration for an immediate upgrade', () => {
    const result = calculatePlanChangeProration({
      timing: 'immediate',
      policy: 'create_adjustment',
      currentContractedAmount: '100',
      nextContractedAmount: '200',
      currency: 'BRL',
      periodStart: new Date('2026-08-01T00:00:00.000Z'),
      periodEnd: new Date('2026-08-31T00:00:00.000Z'),
      effectiveAt: new Date('2026-08-16T00:00:00.000Z'),
    })

    expect(result.adjustmentType).toBe('debit')
    expect(result.status).toBe('open')
    expect(result.amount).toBe('50.0000')
    expect(result.previousRemainingAmount).toBe('50.0000')
    expect(result.nextRemainingAmount).toBe('100.0000')
    expect(result.remainingDays).toBe(15)
  })

  test('calculates deterministic credit proration for an immediate downgrade', () => {
    const result = calculatePlanChangeProration({
      timing: 'immediate',
      policy: 'create_adjustment',
      currentContractedAmount: '200',
      nextContractedAmount: '100',
      currency: 'BRL',
      periodStart: new Date('2026-08-01T00:00:00.000Z'),
      periodEnd: new Date('2026-08-31T00:00:00.000Z'),
      effectiveAt: new Date('2026-08-16T00:00:00.000Z'),
    })

    expect(result.adjustmentType).toBe('credit')
    expect(result.amount).toBe('50.0000')
    expect(result.signedAmount).toBe('-50.0000')
  })

  test('handles date boundaries and next renewal without current cycle charge', () => {
    const periodStart = new Date('2026-08-01T00:00:00.000Z')
    const periodEnd = new Date('2026-08-31T00:00:00.000Z')

    expect(
      calculatePlanChangeProration({
        timing: 'immediate',
        policy: 'create_adjustment',
        currentContractedAmount: '100',
        nextContractedAmount: '150',
        currency: 'BRL',
        periodStart,
        periodEnd,
        effectiveAt: periodStart,
      }).amount
    ).toBe('50.0000')

    expect(
      calculatePlanChangeProration({
        timing: 'immediate',
        policy: 'create_adjustment',
        currentContractedAmount: '100',
        nextContractedAmount: '150',
        currency: 'BRL',
        periodStart,
        periodEnd,
        effectiveAt: periodEnd,
      }).amount
    ).toBe('0.0000')

    expect(
      calculatePlanChangeProration({
        timing: 'next_renewal',
        policy: 'create_adjustment',
        currentContractedAmount: '100',
        nextContractedAmount: '150',
        currency: 'BRL',
        periodStart,
        periodEnd,
        effectiveAt: periodEnd,
      }).adjustmentType
    ).toBe('none')
  })

  test('rounds monetary proration to four decimal places at the end', () => {
    const result = calculatePlanChangeProration({
      timing: 'immediate',
      policy: 'record_only',
      currentContractedAmount: '99.99',
      nextContractedAmount: '149.99',
      currency: 'BRL',
      periodStart: new Date('2026-08-01T00:00:00.000Z'),
      periodEnd: new Date('2026-09-01T00:00:00.000Z'),
      effectiveAt: new Date('2026-08-21T00:00:00.000Z'),
    })

    expect(/^\d+\.\d{4}$/.test(result.amount)).toBe(true)
    expect(result.status).toBe('open')
  })
})
