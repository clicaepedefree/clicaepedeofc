import { describe, expect, test } from 'bun:test'
import {
  buildDataMigrationReadinessReport,
  type DataMigrationReadinessInput,
} from './data-migration-readiness-policy'

const date = (value: string) => new Date(value)

function buildBaseInput(): DataMigrationReadinessInput {
  return {
    generatedAt: date('2026-08-21T12:00:00.000Z'),
    stores: [
      {
        id: 1,
        name: 'QA Centro',
        subdomain: 'qa-centro',
        status: 'active',
      },
    ],
    plans: [{ id: 10, code: 'starter', status: 'active' }],
    modules: [
      { id: 100, code: 'digital_menu', status: 'active' },
      { id: 101, code: 'pos', status: 'active' },
    ],
    planModules: [
      {
        id: 1000,
        planId: 10,
        moduleId: 100,
        status: 'active',
        endsAt: null,
      },
      {
        id: 1001,
        planId: 10,
        moduleId: 101,
        status: 'active',
        endsAt: null,
      },
    ],
    subscriptions: [
      {
        id: 500,
        storeId: 1,
        planId: 10,
        status: 'active',
        contractedAmount: '199.90',
        currency: 'BRL',
        billingInterval: 'monthly',
        billingIntervalCount: 1,
        currentPeriodStart: date('2026-08-01T00:00:00.000Z'),
        currentPeriodEnd: date('2026-09-01T00:00:00.000Z'),
        nextBillingAt: date('2026-09-01T00:00:00.000Z'),
      },
    ],
    invoices: [
      {
        id: 900,
        storeId: 1,
        subscriptionId: 500,
        planId: 10,
        status: 'pending',
        subtotalAmount: '199.90',
        discountAmount: '19.90',
        totalAmount: '180.00',
        amountPaid: '80.00',
        amountRefunded: '10.00',
        periodStart: date('2026-08-01T00:00:00.000Z'),
        periodEnd: date('2026-09-01T00:00:00.000Z'),
        dueAt: date('2026-08-05T00:00:00.000Z'),
      },
    ],
    entitlements: [
      {
        id: 700,
        storeId: 1,
        moduleId: 100,
        subscriptionId: 500,
        planId: 10,
        planModuleId: 1000,
        origin: 'plan',
        status: 'active',
        isAdditional: false,
        additionalAmount: '0',
        endsAt: null,
        revokedAt: null,
      },
      {
        id: 701,
        storeId: 1,
        moduleId: 101,
        subscriptionId: 500,
        planId: 10,
        planModuleId: 1001,
        origin: 'plan',
        status: 'active',
        isAdditional: false,
        additionalAmount: '0',
        endsAt: null,
        revokedAt: null,
      },
    ],
  }
}

describe('data migration readiness policy', () => {
  test('builds a dry-run report that reconciles clean billing data', () => {
    const report = buildDataMigrationReadinessReport(buildBaseInput())

    expect(report.canRunOnProductionCopy).toBe(true)
    expect(report.totalsBefore).toMatchObject({
      stores: 1,
      subscriptions: 1,
      openSubscriptions: 1,
      invoices: 1,
      modules: 2,
      planModules: 2,
      entitlements: 2,
      activeEntitlements: 2,
    })
    expect(report.totalsBefore.invoiceGrossTotal).toBe(180)
    expect(report.totalsBefore.invoiceOutstandingTotal).toBe(110)
    expect(report.projectedAfter).toMatchObject({
      subscriptions: 1,
      invoices: 1,
      entitlements: 2,
      missingPlanEntitlementsToBackfill: 0,
    })
    expect(report.reconciliation).toMatchObject({
      subscriptionDelta: 0,
      invoiceDelta: 0,
      entitlementDelta: 0,
      invoiceOutstandingTotal: 110,
    })
    expect(report.ambiguities).toHaveLength(0)
    expect(report.manualReview.blocking).toBe(0)
  })

  test('isolates ambiguous stores and orphan billing records for manual decision', () => {
    const input = buildBaseInput()
    input.stores.push({
      id: 2,
      name: 'Sem Contrato',
      subdomain: 'sem-contrato',
      status: 'active',
    })
    input.subscriptions.push(
      {
        ...input.subscriptions[0],
        id: 501,
        storeId: 3,
      },
      {
        ...input.subscriptions[0],
        id: 502,
        currentPeriodEnd: date('2026-07-01T00:00:00.000Z'),
      }
    )
    input.invoices.push(
      {
        ...input.invoices[0],
        id: 901,
        storeId: 1,
        subscriptionId: 501,
      },
      {
        ...input.invoices[0],
        id: 902,
        subtotalAmount: '100.00',
        discountAmount: '10.00',
        totalAmount: '100.00',
      }
    )
    input.entitlements.push(
      {
        ...input.entitlements[0],
        id: 702,
        moduleId: 999,
      },
      {
        ...input.entitlements[0],
        id: 703,
      }
    )

    const report = buildDataMigrationReadinessReport(input)
    const reasons = report.ambiguities.map(item => item.reason)

    expect(reasons).toContain('STORE_WITHOUT_OPEN_SUBSCRIPTION')
    expect(reasons).toContain('STORE_WITH_MULTIPLE_OPEN_SUBSCRIPTIONS')
    expect(reasons).toContain('SUBSCRIPTION_WITHOUT_STORE')
    expect(reasons).toContain('SUBSCRIPTION_PERIOD_INVALID')
    expect(reasons).toContain('INVOICE_STORE_SUBSCRIPTION_MISMATCH')
    expect(reasons).toContain('INVOICE_TOTAL_MISMATCH')
    expect(reasons).toContain('ENTITLEMENT_WITHOUT_MODULE')
    expect(reasons).toContain('DUPLICATE_ACTIVE_ENTITLEMENT')
    expect(report.manualReview.blocking).toBeGreaterThan(0)
    expect(report.manualReview.warning).toBeGreaterThan(0)
    expect(report.manualReview.storeIds).toEqual([1, 2, 3])
    expect(report.manualReview.invoiceIds).toContain(902)
    expect(report.manualReview.entitlementIds).toEqual([700, 702, 703])
  })

  test('requires open subscriptions only for operationally billable store statuses', () => {
    const input = buildBaseInput()
    input.stores.push(
      {
        id: 2,
        name: 'Implementando Sem Contrato',
        subdomain: 'implementando-sem-contrato',
        status: 'implementing',
      },
      {
        id: 3,
        name: 'Inativa Sem Contrato',
        subdomain: 'inativa-sem-contrato',
        status: 'inactive',
      },
      {
        id: 4,
        name: 'Recuperacao Sem Contrato',
        subdomain: 'recuperacao-sem-contrato',
        status: 'pending_recovery',
      }
    )

    const report = buildDataMigrationReadinessReport(input)

    expect(
      report.ambiguities.filter(
        item => item.reason === 'STORE_WITHOUT_OPEN_SUBSCRIPTION'
      )
    ).toEqual([
      expect.objectContaining({
        entityId: 2,
        storeId: 2,
      }),
    ])
  })

  test('blocks subscriptions whose next billing date is inside the current period', () => {
    const input = buildBaseInput()
    input.subscriptions[0] = {
      ...input.subscriptions[0],
      nextBillingAt: date('2026-08-15T00:00:00.000Z'),
    }

    const report = buildDataMigrationReadinessReport(input)

    expect(report.ambiguities).toContainEqual(
      expect.objectContaining({
        reason: 'SUBSCRIPTION_PERIOD_INVALID',
        entity: 'subscription',
        entityId: 500,
        storeId: 1,
      })
    )
  })

  test('projects plan entitlement backfill without mutating source totals', () => {
    const input = buildBaseInput()
    input.entitlements = input.entitlements.slice(0, 1)

    const report = buildDataMigrationReadinessReport(input)

    expect(report.totalsBefore.entitlements).toBe(1)
    expect(report.projectedAfter.entitlements).toBe(2)
    expect(report.projectedAfter.missingPlanEntitlementsToBackfill).toBe(1)
    expect(report.reconciliation.entitlementDelta).toBe(1)
    expect(report.ambiguities).toEqual([
      expect.objectContaining({
        reason: 'PLAN_ENTITLEMENT_MISSING',
        severity: 'warning',
        entity: 'subscription',
        entityId: 500,
        storeId: 1,
      }),
    ])
  })
})
