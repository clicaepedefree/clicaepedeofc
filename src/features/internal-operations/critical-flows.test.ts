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

type ControlledAuditEntry = {
  action: string
  step: string
  before: unknown
  after: unknown
}

type ControlledEvidenceEntry = {
  step: string
  storeId: number
  result: 'passed' | 'failed'
  detail: string
  planChangeId?: number
}

class ControlledCriticalFlowHarness {
  readonly audits: ControlledAuditEntry[] = []
  readonly evidence: ControlledEvidenceEntry[] = []
  private store = {
    id: 73_001,
    name: `Loja QA ${runId}`,
    status: 'implementing' as const,
  }
  private subscription = { ...activeSubscription }
  private activeBlock: {
    id: number
    invoiceId: number
    source: 'billing_delinquency'
    unblockedAt: Date | null
  } | null = null
  private activeModules = ['digital_menu', 'pos']
  private nextPlanChangeId = 73_201

  get snapshot() {
    return {
      store: this.store,
      subscription: this.subscription,
      activeModules: [...this.activeModules],
      activeBlock: this.activeBlock,
      audits: [...this.audits],
      evidence: [...this.evidence],
    }
  }

  completeImplementationChecklist() {
    const checklist = storeImplementationChecklistDefinitions.map(
      definition => ({
        itemKey: definition.key,
        requiredForActivation: definition.requiredForActivation,
        status: 'completed' as const,
      })
    )
    const progress = getStoreImplementationChecklistProgress(checklist)

    this.recordEvidence({
      step: 'cadastro ate ativacao: checklist isolado',
      result: progress.canActivate ? 'passed' : 'failed',
      detail: `${progress.requiredCompleted}/${progress.required} obrigatorios concluidos`,
    })

    return progress
  }

  activateStore() {
    const before = { ...this.store }
    const validationError = validateStoreLifecycleTransition({
      currentStatus: this.store.status,
      targetStatus: 'active',
      subscription: this.subscription,
    })

    if (validationError) {
      this.recordEvidence({
        step: 'cadastro ate ativacao: transicao comercial',
        result: 'failed',
        detail: validationError,
      })
      throw new Error(validationError)
    }

    this.store = { ...this.store, status: 'active' }
    const action = getStoreLifecycleAuditAction(
      before.status,
      this.store.status
    )

    this.recordAudit({
      action,
      step: 'cadastro ate ativacao',
      before,
      after: this.store,
    })
    this.recordEvidence({
      step: 'cadastro ate ativacao: transicao comercial',
      result: 'passed',
      detail: action,
    })

    return this.store
  }

  applyImmediatePlanChangeWithAddon() {
    const before = {
      subscription: { ...this.subscription },
      activeModules: [...this.activeModules],
    }
    const now = new Date('2026-08-15T12:00:00.000Z')
    const planChangeId = this.nextPlanChangeId++
    const effectiveAt = resolvePlanChangeEffectiveAt({
      timing: 'immediate',
      now,
      nextBillingAt: this.subscription.nextBillingAt,
    })
    const nextContractedAmount = resolvePlanChangeContractedAmount({
      valueMode: 'use_plan_default',
      currentContractedAmount: this.subscription.contractedAmount ?? '0',
      planDefaultAmount: '299.9000',
    })
    const proration = calculatePlanChangeProration({
      timing: 'immediate',
      policy: 'create_adjustment',
      currentContractedAmount: this.subscription.contractedAmount ?? '0',
      nextContractedAmount,
      currency: this.subscription.currency ?? 'BRL',
      periodStart: this.subscription.currentPeriodStart ?? now,
      periodEnd: this.subscription.currentPeriodEnd ?? now,
      effectiveAt,
    })
    const moduleImpact = buildPlanChangeModuleImpactPreview({
      moduleTreatment: 'sync_to_new_plan',
      currentModules: [
        {
          moduleId: 1,
          name: 'Cardapio digital',
          origin: 'plan',
          status: 'active',
        },
        { moduleId: 2, name: 'PDV', origin: 'plan', status: 'active' },
      ],
      targetModules: [
        { moduleId: 1, name: 'Cardapio digital' },
        { moduleId: 2, name: 'PDV' },
        { moduleId: 3, name: 'Atendimento automatico' },
      ],
    })
    const addonValues = storeModuleManagementSchema.parse({
      storeId: this.store.id,
      moduleId: 4,
      action: 'activate',
      origin: 'addon',
      additionalAmount: '49,90',
      reason: 'Cliente contratou modulo adicional.',
    })
    const addonAmount = normalizeModuleAdditionalAmount({
      origin: addonValues.origin,
      amount: addonValues.additionalAmount,
    })

    this.subscription = {
      ...this.subscription,
      planId: 2,
      contractedAmount: nextContractedAmount,
    }
    this.activeModules = getEffectiveStoreModules({
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

    this.recordAudit({
      action: 'apply_store_subscription_plan_change',
      step: 'mudanca de plano e modulos',
      before,
      after: {
        subscription: this.subscription,
        activeModules: this.activeModules,
        addonAmount,
      },
    })
    this.recordEvidence({
      step: 'mudanca de plano e modulos: planChange aplicado',
      storeId: this.store.id,
      result: 'passed',
      detail: `ajuste ${proration.adjustmentType} ${proration.amount}; modulos adicionados ${moduleImpact.addedModuleNames.join(', ')}`,
      planChangeId,
    })

    return {
      planChangeId,
      proration,
      moduleImpact,
      addonAmount,
      activeModules: this.activeModules,
    }
  }

  blockByDelinquencyAndUnblockByPayment() {
    const now = new Date('2026-08-21T12:00:00.000Z')
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
    const subscription = {
      id: this.subscription.id ?? 0,
      status: 'past_due',
      paymentGraceDays: 5,
      billingAccessExemptionKind: null,
      billingAccessExemptUntil: null,
      billingAccessExemptionReason: null,
    } satisfies BillingDelinquencySubscriptionSnapshot
    const delinquencyDecision = decideBillingDelinquencyAccessBlock({
      invoice,
      subscription,
      store: this.store,
      hasActiveAccessBlock: false,
      now,
    })

    if (delinquencyDecision.action !== 'block') {
      this.recordEvidence({
        step: 'inadimplencia: bloqueio',
        result: 'failed',
        detail: delinquencyDecision.reason,
      })
      throw new Error(delinquencyDecision.reason)
    }

    this.activeBlock = {
      id: 73_501,
      invoiceId: invoice.id,
      source: 'billing_delinquency',
      unblockedAt: null,
    }
    this.recordAudit({
      action: 'block_store_access_by_billing_delinquency',
      step: 'vencimento e bloqueio',
      before: null,
      after: this.activeBlock,
    })
    this.recordEvidence({
      step: 'vencimento e bloqueio: acesso bloqueado',
      result: 'passed',
      detail: delinquencyDecision.dedupeKey,
    })

    const paidAt = new Date('2026-08-21T12:05:00.000Z')
    const payment = reconcileConfirmedPayment({
      invoice,
      amount: invoice.totalAmount,
      paidAt,
    })
    const shouldUnblock = shouldAutoUnblockBillingAccess({
      invoiceId: invoice.id,
      invoiceStatus: payment.nextStatus,
      block: this.activeBlock,
    })

    if (!shouldUnblock) {
      this.recordEvidence({
        step: 'pagamento e desbloqueio: desbloqueio automatico',
        result: 'failed',
        detail: 'payment did not qualify for auto unblock',
      })
      throw new Error('payment did not qualify for auto unblock')
    }

    const beforeBlock = { ...this.activeBlock }
    this.activeBlock = { ...this.activeBlock, unblockedAt: paidAt }
    this.recordAudit({
      action: 'unblock_store_access_after_payment',
      step: 'pagamento e desbloqueio',
      before: beforeBlock,
      after: this.activeBlock,
    })
    this.recordEvidence({
      step: 'pagamento e desbloqueio: fatura paga',
      result: 'passed',
      detail: buildPaymentConfirmationDedupeKey({
        invoiceId: invoice.id,
        provider: 'validapay',
        providerPaymentId: `${runId}-payment`,
        amount: invoice.totalAmount,
        paidAt,
      }),
    })

    return { delinquencyDecision, payment, shouldUnblock }
  }

  private recordAudit(
    entry: Omit<ControlledAuditEntry, 'step'> & { step: string }
  ) {
    this.audits.push(entry)
  }

  private recordEvidence(
    entry: Omit<ControlledEvidenceEntry, 'storeId'> & {
      storeId?: number
    }
  ) {
    this.evidence.push({
      storeId: this.store.id,
      ...entry,
    })
  }
}

describe('critical internal operation flows', () => {
  test('runs a controlled stateful end-to-end journey with isolated evidence', () => {
    const flow = new ControlledCriticalFlowHarness()

    const checklistProgress = flow.completeImplementationChecklist()
    const activatedStore = flow.activateStore()
    const planChange = flow.applyImmediatePlanChangeWithAddon()
    const paymentCycle = flow.blockByDelinquencyAndUnblockByPayment()
    const snapshot = flow.snapshot

    expectStep('ambiente controlado usa dados isolados', () => {
      expect(snapshot.store.name).toContain(runId)
      expect(snapshot.store.id).toBe(73_001)
      expect(snapshot.evidence.every(item => item.storeId === 73_001)).toBe(
        true
      )
    })

    expectStep('cadastro ate ativacao persiste estado e auditoria', () => {
      expect(checklistProgress.canActivate).toBe(true)
      expect(activatedStore.status).toBe('active')
      expect(snapshot.audits.map(audit => audit.action)).toContain(
        'activate_store_commercial'
      )
    })

    expectStep('mudanca de plano e modulos persiste efeito integrado', () => {
      expect(snapshot.subscription.planId).toBe(2)
      expect(snapshot.subscription.contractedAmount).toBe('299.9000')
      expect(planChange.planChangeId).toBe(73_201)
      expect(planChange.addonAmount).toBe('49.9000')
      expect(snapshot.activeModules).toEqual([
        'ai_service',
        'digital_menu',
        'loyalty',
        'pos',
      ])
      expect(
        snapshot.evidence.some(
          evidence => evidence.planChangeId === planChange.planChangeId
        )
      ).toBe(true)
    })

    expectStep(
      'vencimento pagamento e desbloqueio persistem ciclo completo',
      () => {
        expect(paymentCycle.delinquencyDecision.action).toBe('block')
        expect(paymentCycle.payment.nextStatus).toBe('paid')
        expect(paymentCycle.shouldUnblock).toBe(true)
        expect(snapshot.activeBlock?.unblockedAt).toEqual(
          new Date('2026-08-21T12:05:00.000Z')
        )
        expect(snapshot.audits.map(audit => audit.action)).toEqual([
          'activate_store_commercial',
          'apply_store_subscription_plan_change',
          'block_store_access_by_billing_delinquency',
          'unblock_store_access_after_payment',
        ])
      }
    )

    expectStep('falhas indicam etapa e evidencias relevantes', () => {
      expect(snapshot.evidence).toHaveLength(5)
      expect(snapshot.evidence.every(item => item.result === 'passed')).toBe(
        true
      )
      expect(snapshot.evidence.map(item => item.step)).toEqual([
        'cadastro ate ativacao: checklist isolado',
        'cadastro ate ativacao: transicao comercial',
        'mudanca de plano e modulos: planChange aplicado',
        'vencimento e bloqueio: acesso bloqueado',
        'pagamento e desbloqueio: fatura paga',
      ])
    })
  })

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
      expect(checklist).toHaveLength(
        storeImplementationChecklistDefinitions.length
      )
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
        {
          moduleId: 1,
          name: 'Cardapio digital',
          origin: 'plan',
          status: 'active',
        },
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

    expectStep(
      'pagamento de fatura inadimplente libera bloqueio automatico',
      () => {
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
      }
    )
  })
})
