import { describe, expect, test } from 'bun:test'
import {
  decideBillingDelinquencyAccessBlock,
  type BillingDelinquencyInvoiceSnapshot,
  type BillingDelinquencyStoreSnapshot,
  type BillingDelinquencySubscriptionSnapshot,
} from '@/features/billing/billing-delinquency-policy'
import { getEffectiveStoreModules } from '@/features/billing/module-entitlements-policy'
import {
  buildPaymentConfirmationDedupeKey,
  reconcileConfirmedPayment,
  shouldAutoUnblockBillingAccess,
} from '@/features/billing/payment-confirmation-policy'
import {
  getStoreImplementationChecklistProgress,
  storeImplementationChecklistDefinitions,
} from './implementation-checklist-policy'
import {
  calculatePlanChangeProration,
  buildPlanChangeModuleImpactPreview,
  resolvePlanChangeContractedAmount,
  resolvePlanChangeEffectiveAt,
} from './subscription-plan-change-policy'
import {
  getDefaultStoreLifecycleSubscriptionEffect,
  getStoreLifecycleAuditAction,
  validateStoreLifecycleTransition,
  type StoreLifecycleSubscriptionSnapshot,
} from './store-lifecycle-policy'
import {
  normalizeModuleAdditionalAmount,
  storeModuleManagementSchema,
} from './store-module-management-policy'

const expectStep = (step: string, assertion: () => void) => {
  try {
    assertion()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Falha no fluxo critico [${step}]: ${message}`)
  }
}

const runId = 'kan-73-controlled'

const activeSubscription = {
  id: 7301,
  status: 'active',
  planId: 1,
  contractedAmount: '199.9000',
  currency: 'BRL',
  currentPeriodStart: new Date('2026-08-01T00:00:00.000Z'),
  currentPeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
  nextBillingAt: new Date('2026-09-01T00:00:00.000Z'),
} satisfies StoreLifecycleSubscriptionSnapshot

describe('critical internal operation flows', () => {
  test('covers isolated store creation readiness through activation', () => {
    const store = {
      id: 73_001,
      name: `Loja QA ${runId}`,
      status: 'implementing' as const,
    }
    const checklist = storeImplementationChecklistDefinitions.map(
      definition => ({
        itemKey: definition.key,
        requiredForActivation: definition.requiredForActivation,
        status: 'completed' as const,
      })
    )

    expectStep('cadastro controlado cria dados isolados', () => {
      expect(store.name).toContain(runId)
      expect(checklist).toHaveLength(storeImplementationChecklistDefinitions.length)
    })

    const progress = getStoreImplementationChecklistProgress(checklist)

    expectStep('checklist obrigatorio libera ativacao', () => {
      expect(progress).toMatchObject({
        completed: 5,
        requiredCompleted: 5,
        percent: 100,
        canActivate: true,
      })
    })

    expectStep('validacao financeira permite ativacao comercial', () => {
      expect(
        validateStoreLifecycleTransition({
          currentStatus: store.status,
          targetStatus: 'active',
          subscription: activeSubscription,
        })
      ).toBe(null)
      expect(getStoreLifecycleAuditAction(store.status, 'active')).toBe(
        'activate_store_commercial'
      )
      expect(
        getDefaultStoreLifecycleSubscriptionEffect({
          targetStatus: 'active',
          subscriptionStatus: activeSubscription.status,
        })
      ).toBe('keep_subscription')
    })
  })

  test('covers plan change with module impact and addon activation', () => {
    const now = new Date('2026-08-15T12:00:00.000Z')
    const effectiveAt = resolvePlanChangeEffectiveAt({
      timing: 'immediate',
      now,
      nextBillingAt: activeSubscription.nextBillingAt,
    })
    const nextContractedAmount = resolvePlanChangeContractedAmount({
      valueMode: 'use_plan_default',
      currentContractedAmount: activeSubscription.contractedAmount ?? '0',
      planDefaultAmount: '299.9000',
    })
    const proration = calculatePlanChangeProration({
      timing: 'immediate',
      policy: 'create_adjustment',
      currentContractedAmount: activeSubscription.contractedAmount ?? '0',
      nextContractedAmount,
      currency: activeSubscription.currency ?? 'BRL',
      periodStart: activeSubscription.currentPeriodStart ?? now,
      periodEnd: activeSubscription.currentPeriodEnd ?? now,
      effectiveAt,
    })
    const moduleImpact = buildPlanChangeModuleImpactPreview({
      moduleTreatment: 'sync_to_new_plan',
      currentModules: [
        { moduleId: 1, name: 'Cardapio digital', origin: 'plan', status: 'active' },
        { moduleId: 2, name: 'PDV', origin: 'plan', status: 'active' },
      ],
      targetModules: [
        { moduleId: 1, name: 'Cardapio digital' },
        { moduleId: 2, name: 'PDV' },
        { moduleId: 3, name: 'Atendimento automatico' },
      ],
    })
    const addonValues = storeModuleManagementSchema.parse({
      storeId: 73_001,
      moduleId: 4,
      action: 'activate',
      origin: 'addon',
      additionalAmount: '49,90',
      reason: 'Cliente contratou modulo adicional.',
    })

    expectStep('mudanca de plano calcula data, valor e ajuste', () => {
      expect(effectiveAt).toEqual(now)
      expect(nextContractedAmount).toBe('299.9000')
      expect(proration.adjustmentType).toBe('debit')
      expect(proration.status).toBe('open')
      expect(Number(proration.amount)).toBeGreaterThan(0)
    })

    expectStep('impacto de modulos explica entradas e preserva plano', () => {
      expect(moduleImpact.addedModuleNames).toEqual(['Atendimento automatico'])
      expect(moduleImpact.removedPlanModuleNames).toEqual([])
      expect(moduleImpact.reviewRequiredModuleNames).toEqual([])
    })

    expectStep('modulo adicional normaliza valor e vira modulo efetivo', () => {
      expect(
        normalizeModuleAdditionalAmount({
          origin: addonValues.origin,
          amount: addonValues.additionalAmount,
        })
      ).toBe('49.9000')
      expect(
        getEffectiveStoreModules({
          planModules: [
            { code: 'digital_menu', status: 'active' },
            { code: 'pos', status: 'active' },
            { code: 'ai_service', status: 'active' },
          ],
          storeEntitlements: [
            {
              code: 'loyalty',
              origin: 'addon',
              status: 'active',
              isAdditional: true,
            },
          ],
          at: now,
        }).map(module => module.code)
      ).toEqual(['ai_service', 'digital_menu', 'loyalty', 'pos'])
    })
  })

  test('covers overdue invoice, access block, payment and unblock', () => {
    const now = new Date('2026-08-21T12:00:00.000Z')
    const store = {
      id: 73_001,
      status: 'active',
    } satisfies BillingDelinquencyStoreSnapshot
    const subscription = {
      id: activeSubscription.id ?? 0,
      status: 'past_due',
      paymentGraceDays: 5,
      billingAccessExemptionKind: null,
      billingAccessExemptUntil: null,
      billingAccessExemptionReason: null,
    } satisfies BillingDelinquencySubscriptionSnapshot
    const invoice = {
      id: 73_901,
      invoiceNumber: 'KAN-73-001',
      status: 'overdue',
      dueAt: new Date('2026-08-10T00:00:00.000Z'),
      totalAmount: '299.9000',
      amountPaid: '0.0000',
      amountRefunded: '0.0000',
      paidAt: null,
    } satisfies BillingDelinquencyInvoiceSnapshot & {
      amountRefunded: string
      paidAt: null
    }

    const delinquencyDecision = decideBillingDelinquencyAccessBlock({
      invoice,
      subscription,
      store,
      hasActiveAccessBlock: false,
      now,
    })

    expectStep('vencimento gera bloqueio com dedupe isolado', () => {
      expect(delinquencyDecision).toMatchObject({
        action: 'block',
        dedupeKey: 'billing-delinquency:invoice:73901',
        outstandingAmount: 299.9,
      })
    })

    const paidAt = new Date('2026-08-21T12:05:00.000Z')
    const payment = reconcileConfirmedPayment({
      invoice,
      amount: '299.9000',
      paidAt,
    })

    expectStep('pagamento liquida a fatura sem saldo pendente', () => {
      expect(payment).toMatchObject({
        nextAmountPaid: '299.9000',
        nextStatus: 'paid',
        nextPaidAt: paidAt,
        outstandingBeforePayment: 299.9,
      })
      expect(
        buildPaymentConfirmationDedupeKey({
          invoiceId: invoice.id,
          provider: 'validapay',
          providerPaymentId: `${runId}-payment`,
          amount: invoice.totalAmount,
          paidAt,
        })
      ).toBe(`validapay:${runId}-payment`)
    })

    expectStep('pagamento de fatura inadimplente libera bloqueio automatico', () => {
      expect(
        shouldAutoUnblockBillingAccess({
          invoiceId: invoice.id,
          invoiceStatus: payment.nextStatus,
          block: {
            id: 73_501,
            source: 'billing_delinquency',
            invoiceId: invoice.id,
            unblockedAt: null,
          },
        })
      ).toBe(true)
    })
  })
})
