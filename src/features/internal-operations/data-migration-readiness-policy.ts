export type MigrationReadinessStore = {
  id: number
  name: string
  subdomain: string
  status: string
}

export type MigrationReadinessPlan = {
  id: number
  code: string
  status: string
}

export type MigrationReadinessPlanModule = {
  id: number
  planId: number
  moduleId: number
  status: string
  endsAt: Date | null
}

export type MigrationReadinessModule = {
  id: number
  code: string
  status: string
}

export type MigrationReadinessSubscription = {
  id: number
  storeId: number
  planId: number
  status: string
  contractedAmount: string
  currency: string
  billingInterval: string
  billingIntervalCount: number
  currentPeriodStart: Date
  currentPeriodEnd: Date
  nextBillingAt: Date
}

export type MigrationReadinessInvoice = {
  id: number
  storeId: number
  subscriptionId: number
  planId: number | null
  status: string
  subtotalAmount: string
  discountAmount: string
  totalAmount: string
  amountPaid: string
  amountRefunded: string
  periodStart: Date
  periodEnd: Date
  dueAt: Date
}

export type MigrationReadinessEntitlement = {
  id: number
  storeId: number
  moduleId: number
  subscriptionId: number | null
  planId: number | null
  planModuleId: number | null
  origin: string
  status: string
  isAdditional: boolean
  additionalAmount: string
  endsAt: Date | null
  revokedAt: Date | null
}

export type DataMigrationReadinessInput = {
  generatedAt: Date
  stores: MigrationReadinessStore[]
  plans: MigrationReadinessPlan[]
  modules: MigrationReadinessModule[]
  planModules: MigrationReadinessPlanModule[]
  subscriptions: MigrationReadinessSubscription[]
  invoices: MigrationReadinessInvoice[]
  entitlements: MigrationReadinessEntitlement[]
}

export type MigrationAmbiguityReason =
  | 'STORE_WITHOUT_OPEN_SUBSCRIPTION'
  | 'STORE_WITH_MULTIPLE_OPEN_SUBSCRIPTIONS'
  | 'SUBSCRIPTION_WITHOUT_STORE'
  | 'SUBSCRIPTION_WITHOUT_PLAN'
  | 'SUBSCRIPTION_PERIOD_INVALID'
  | 'INVOICE_WITHOUT_STORE'
  | 'INVOICE_WITHOUT_SUBSCRIPTION'
  | 'INVOICE_STORE_SUBSCRIPTION_MISMATCH'
  | 'INVOICE_TOTAL_MISMATCH'
  | 'PLAN_ENTITLEMENT_MISSING'
  | 'ENTITLEMENT_WITHOUT_STORE'
  | 'ENTITLEMENT_WITHOUT_MODULE'
  | 'ENTITLEMENT_PLAN_MODULE_MISMATCH'
  | 'DUPLICATE_ACTIVE_ENTITLEMENT'
;

export type MigrationAmbiguityRecord = {
  reason: MigrationAmbiguityReason
  severity: 'warning' | 'blocking'
  entity: 'store' | 'subscription' | 'invoice' | 'entitlement'
  entityId: number
  storeId: number | null
  details: Record<string, string | number | boolean | null>
}

export type DataMigrationReadinessReport = {
  generatedAt: string
  canRunOnProductionCopy: true
  sourceMapping: {
    stores: string[]
    subscriptions: string[]
    modules: string[]
    invoices: string[]
  }
  totalsBefore: {
    stores: number
    storesByStatus: Record<string, number>
    subscriptions: number
    openSubscriptions: number
    invoices: number
    invoiceGrossTotal: number
    invoiceOutstandingTotal: number
    modules: number
    planModules: number
    entitlements: number
    activeEntitlements: number
  }
  backfillStrategy: {
    subscriptions: string
    modules: string
    invoices: string
  }
  projectedAfter: {
    subscriptions: number
    invoices: number
    entitlements: number
    missingPlanEntitlementsToBackfill: number
  }
  reconciliation: {
    subscriptionDelta: number
    invoiceDelta: number
    entitlementDelta: number
    invoiceOutstandingTotal: number
  }
  ambiguities: MigrationAmbiguityRecord[]
  manualReview: {
    blocking: number
    warning: number
    storeIds: number[]
    subscriptionIds: number[]
    invoiceIds: number[]
    entitlementIds: number[]
  }
}

const openSubscriptionStatuses = new Set([
  'trialing',
  'active',
  'past_due',
  'paused',
])

const activeEntitlementStatuses = new Set(['active'])
const storeStatusesExpectedToHaveOpenSubscription = new Set([
  'active',
  'implementing',
])

function toMoney(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function countBy<T extends string | number>(
  values: T[]
): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, value) => {
    const key = String(value)
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})
}

function isActiveEntitlement(entitlement: MigrationReadinessEntitlement) {
  return (
    activeEntitlementStatuses.has(entitlement.status) &&
    entitlement.endsAt === null &&
    entitlement.revokedAt === null
  )
}

function pushAmbiguity(
  ambiguities: MigrationAmbiguityRecord[],
  record: MigrationAmbiguityRecord
) {
  ambiguities.push(record)
}

export function buildDataMigrationReadinessReport({
  generatedAt,
  stores,
  plans,
  modules,
  planModules,
  subscriptions,
  invoices,
  entitlements,
}: DataMigrationReadinessInput): DataMigrationReadinessReport {
  const storeById = new Map(stores.map(store => [store.id, store]))
  const planById = new Map(plans.map(plan => [plan.id, plan]))
  const moduleById = new Map(modules.map(module => [module.id, module]))
  const subscriptionById = new Map(
    subscriptions.map(subscription => [subscription.id, subscription])
  )
  const activePlanModules = planModules.filter(
    planModule => planModule.status === 'active' && planModule.endsAt === null
  )
  const activePlanModuleByShape = new Map(
    activePlanModules.map(planModule => [
      `${planModule.id}:${planModule.planId}:${planModule.moduleId}`,
      planModule,
    ])
  )
  const activePlanModuleIdsByPlanId = activePlanModules.reduce<
    Map<number, MigrationReadinessPlanModule[]>
  >((acc, planModule) => {
    const current = acc.get(planModule.planId) ?? []
    current.push(planModule)
    acc.set(planModule.planId, current)
    return acc
  }, new Map())
  const openSubscriptions = subscriptions.filter(subscription =>
    openSubscriptionStatuses.has(subscription.status)
  )
  const openSubscriptionsByStoreId = openSubscriptions.reduce<
    Map<number, MigrationReadinessSubscription[]>
  >((acc, subscription) => {
    const current = acc.get(subscription.storeId) ?? []
    current.push(subscription)
    acc.set(subscription.storeId, current)
    return acc
  }, new Map())
  const activePlanEntitlementKeys = new Set(
    entitlements
      .filter(
        entitlement =>
          isActiveEntitlement(entitlement) &&
          entitlement.origin === 'plan' &&
          entitlement.subscriptionId !== null &&
          entitlement.planId !== null
      )
      .map(
        entitlement =>
          `${entitlement.storeId}:${entitlement.subscriptionId}:${entitlement.planId}:${entitlement.moduleId}`
      )
  )

  const ambiguities: MigrationAmbiguityRecord[] = []
  const billableStores = stores.filter(store =>
    storeStatusesExpectedToHaveOpenSubscription.has(store.status)
  )

  for (const store of billableStores) {
    const storeOpenSubscriptions = openSubscriptionsByStoreId.get(store.id) ?? []
    if (storeOpenSubscriptions.length === 0) {
      pushAmbiguity(ambiguities, {
        reason: 'STORE_WITHOUT_OPEN_SUBSCRIPTION',
        severity: 'blocking',
        entity: 'store',
        entityId: store.id,
        storeId: store.id,
        details: {
          storeName: store.name,
          subdomain: store.subdomain,
          status: store.status,
        },
      })
    }

    if (storeOpenSubscriptions.length > 1) {
      pushAmbiguity(ambiguities, {
        reason: 'STORE_WITH_MULTIPLE_OPEN_SUBSCRIPTIONS',
        severity: 'blocking',
        entity: 'store',
        entityId: store.id,
        storeId: store.id,
        details: {
          subscriptionIds: storeOpenSubscriptions
            .map(subscription => subscription.id)
            .join(','),
        },
      })
    }
  }

  for (const subscription of subscriptions) {
    if (!storeById.has(subscription.storeId)) {
      pushAmbiguity(ambiguities, {
        reason: 'SUBSCRIPTION_WITHOUT_STORE',
        severity: 'blocking',
        entity: 'subscription',
        entityId: subscription.id,
        storeId: subscription.storeId,
        details: { storeId: subscription.storeId },
      })
    }

    if (!planById.has(subscription.planId)) {
      pushAmbiguity(ambiguities, {
        reason: 'SUBSCRIPTION_WITHOUT_PLAN',
        severity: 'blocking',
        entity: 'subscription',
        entityId: subscription.id,
        storeId: subscription.storeId,
        details: { planId: subscription.planId },
      })
    }

    if (
      subscription.currentPeriodEnd <= subscription.currentPeriodStart ||
      subscription.nextBillingAt < subscription.currentPeriodEnd
    ) {
      pushAmbiguity(ambiguities, {
        reason: 'SUBSCRIPTION_PERIOD_INVALID',
        severity: 'blocking',
        entity: 'subscription',
        entityId: subscription.id,
        storeId: subscription.storeId,
        details: {
          currentPeriodStart: subscription.currentPeriodStart.toISOString(),
          currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
          nextBillingAt: subscription.nextBillingAt.toISOString(),
        },
      })
    }
  }

  for (const invoice of invoices) {
    const subscription = subscriptionById.get(invoice.subscriptionId)
    if (!storeById.has(invoice.storeId)) {
      pushAmbiguity(ambiguities, {
        reason: 'INVOICE_WITHOUT_STORE',
        severity: 'blocking',
        entity: 'invoice',
        entityId: invoice.id,
        storeId: invoice.storeId,
        details: { storeId: invoice.storeId },
      })
    }

    if (!subscription) {
      pushAmbiguity(ambiguities, {
        reason: 'INVOICE_WITHOUT_SUBSCRIPTION',
        severity: 'blocking',
        entity: 'invoice',
        entityId: invoice.id,
        storeId: invoice.storeId,
        details: { subscriptionId: invoice.subscriptionId },
      })
    } else if (subscription.storeId !== invoice.storeId) {
      pushAmbiguity(ambiguities, {
        reason: 'INVOICE_STORE_SUBSCRIPTION_MISMATCH',
        severity: 'blocking',
        entity: 'invoice',
        entityId: invoice.id,
        storeId: invoice.storeId,
        details: {
          invoiceStoreId: invoice.storeId,
          subscriptionStoreId: subscription.storeId,
          subscriptionId: subscription.id,
        },
      })
    }

    const expectedTotal =
      toMoney(invoice.subtotalAmount) - toMoney(invoice.discountAmount)
    if (Math.abs(expectedTotal - toMoney(invoice.totalAmount)) >= 0.01) {
      pushAmbiguity(ambiguities, {
        reason: 'INVOICE_TOTAL_MISMATCH',
        severity: 'warning',
        entity: 'invoice',
        entityId: invoice.id,
        storeId: invoice.storeId,
        details: {
          subtotalAmount: invoice.subtotalAmount,
          discountAmount: invoice.discountAmount,
          totalAmount: invoice.totalAmount,
        },
      })
    }
  }

  for (const entitlement of entitlements) {
    if (!storeById.has(entitlement.storeId)) {
      pushAmbiguity(ambiguities, {
        reason: 'ENTITLEMENT_WITHOUT_STORE',
        severity: 'blocking',
        entity: 'entitlement',
        entityId: entitlement.id,
        storeId: entitlement.storeId,
        details: { storeId: entitlement.storeId },
      })
    }

    if (!moduleById.has(entitlement.moduleId)) {
      pushAmbiguity(ambiguities, {
        reason: 'ENTITLEMENT_WITHOUT_MODULE',
        severity: 'blocking',
        entity: 'entitlement',
        entityId: entitlement.id,
        storeId: entitlement.storeId,
        details: { moduleId: entitlement.moduleId },
      })
    }

    if (
      entitlement.origin === 'plan' &&
      (entitlement.planModuleId === null ||
        entitlement.planId === null ||
        !activePlanModuleByShape.has(
          `${entitlement.planModuleId}:${entitlement.planId}:${entitlement.moduleId}`
        ))
    ) {
      pushAmbiguity(ambiguities, {
        reason: 'ENTITLEMENT_PLAN_MODULE_MISMATCH',
        severity: 'blocking',
        entity: 'entitlement',
        entityId: entitlement.id,
        storeId: entitlement.storeId,
        details: {
          planId: entitlement.planId,
          moduleId: entitlement.moduleId,
          planModuleId: entitlement.planModuleId,
        },
      })
    }
  }

  const duplicateEntitlementCounts = entitlements
    .filter(isActiveEntitlement)
    .reduce<Map<string, MigrationReadinessEntitlement[]>>((acc, entitlement) => {
      const key = `${entitlement.storeId}:${entitlement.moduleId}:${entitlement.origin}`
      const current = acc.get(key) ?? []
      current.push(entitlement)
      acc.set(key, current)
      return acc
    }, new Map())

  for (const duplicates of duplicateEntitlementCounts.values()) {
    if (duplicates.length <= 1) continue
    for (const entitlement of duplicates) {
      pushAmbiguity(ambiguities, {
        reason: 'DUPLICATE_ACTIVE_ENTITLEMENT',
        severity: 'blocking',
        entity: 'entitlement',
        entityId: entitlement.id,
        storeId: entitlement.storeId,
        details: {
          moduleId: entitlement.moduleId,
          origin: entitlement.origin,
          duplicateIds: duplicates.map(item => item.id).join(','),
        },
      })
    }
  }

  let missingPlanEntitlementsToBackfill = 0
  for (const subscription of openSubscriptions) {
    const expectedPlanModules =
      activePlanModuleIdsByPlanId.get(subscription.planId) ?? []

    for (const planModule of expectedPlanModules) {
      const key = `${subscription.storeId}:${subscription.id}:${subscription.planId}:${planModule.moduleId}`
      if (activePlanEntitlementKeys.has(key)) continue

      missingPlanEntitlementsToBackfill += 1
      pushAmbiguity(ambiguities, {
        reason: 'PLAN_ENTITLEMENT_MISSING',
        severity: 'warning',
        entity: 'subscription',
        entityId: subscription.id,
        storeId: subscription.storeId,
        details: {
          planId: subscription.planId,
          moduleId: planModule.moduleId,
          planModuleId: planModule.id,
        },
      })
    }
  }

  const invoiceOutstandingTotal = invoices.reduce(
    (total, invoice) =>
      total +
      Math.max(
        0,
        toMoney(invoice.totalAmount) -
          toMoney(invoice.amountPaid) +
          toMoney(invoice.amountRefunded)
      ),
    0
  )
  const invoiceGrossTotal = invoices.reduce(
    (total, invoice) => total + toMoney(invoice.totalAmount),
    0
  )
  const activeEntitlements = entitlements.filter(isActiveEntitlement)

  const manualReview = {
    blocking: ambiguities.filter(item => item.severity === 'blocking').length,
    warning: ambiguities.filter(item => item.severity === 'warning').length,
    storeIds: [
      ...new Set(
        ambiguities
          .map(item => item.storeId)
          .filter((storeId): storeId is number => storeId !== null)
      ),
    ].sort((a, b) => a - b),
    subscriptionIds: [
      ...new Set(
        ambiguities
          .filter(item => item.entity === 'subscription')
          .map(item => item.entityId)
      ),
    ].sort((a, b) => a - b),
    invoiceIds: [
      ...new Set(
        ambiguities
          .filter(item => item.entity === 'invoice')
          .map(item => item.entityId)
      ),
    ].sort((a, b) => a - b),
    entitlementIds: [
      ...new Set(
        ambiguities
          .filter(item => item.entity === 'entitlement')
          .map(item => item.entityId)
      ),
    ].sort((a, b) => a - b),
  }

  return {
    generatedAt: generatedAt.toISOString(),
    canRunOnProductionCopy: true,
    sourceMapping: {
      stores: ['stores.id', 'stores.status', 'stores.name', 'stores.subdomain'],
      subscriptions: [
        'store_subscriptions.store_id',
        'store_subscriptions.plan_id',
        'store_subscriptions.status',
        'store_subscriptions.contract_terms',
        'store_subscriptions.period_dates',
      ],
      modules: [
        'billing_modules.code',
        'billing_plan_modules.plan_id/module_id',
        'store_module_entitlements.origin/status',
      ],
      invoices: [
        'store_billing_invoices.subscription_id',
        'store_billing_invoices.status',
        'store_billing_invoices.amounts',
        'store_billing_invoices.period_dates',
      ],
    },
    totalsBefore: {
      stores: stores.length,
      storesByStatus: countBy(stores.map(store => store.status)),
      subscriptions: subscriptions.length,
      openSubscriptions: openSubscriptions.length,
      invoices: invoices.length,
      invoiceGrossTotal,
      invoiceOutstandingTotal,
      modules: modules.length,
      planModules: planModules.length,
      entitlements: entitlements.length,
      activeEntitlements: activeEntitlements.length,
    },
    backfillStrategy: {
      subscriptions:
        'Preservar assinaturas existentes por store_id/plan_id/status; revisar lojas sem assinatura aberta ou com mais de uma assinatura aberta antes de executar writes.',
      modules:
        'Derivar direitos de modulo do plano ativo; criar apenas direitos ausentes e manter addons/manuais como excecoes auditaveis.',
      invoices:
        'Conciliar faturas por subscription_id + periodo; qualquer divergencia de valor ou vinculo fica em revisao manual antes do backfill.',
    },
    projectedAfter: {
      subscriptions: subscriptions.length,
      invoices: invoices.length,
      entitlements: entitlements.length + missingPlanEntitlementsToBackfill,
      missingPlanEntitlementsToBackfill,
    },
    reconciliation: {
      subscriptionDelta: 0,
      invoiceDelta: 0,
      entitlementDelta: missingPlanEntitlementsToBackfill,
      invoiceOutstandingTotal,
    },
    ambiguities,
    manualReview,
  }
}
