import { describe, expect, test } from 'bun:test'

const integrationDatabaseUrl = process.env.KAN116_INTEGRATION_DATABASE_URL
const integrationTest = integrationDatabaseUrl ? test : test.skip

function assertSafeIntegrationDatabaseUrl(url: string) {
  const normalized = url.toLowerCase()
  const allowNonLocal = process.env.KAN116_ALLOW_NONLOCAL_DATABASE === 'true'

  if (normalized.includes('kktmjjmkbbtbibzbpcqj')) {
    throw new Error(
      'KAN116_INTEGRATION_DATABASE_URL cannot point to production.'
    )
  }

  if (
    !allowNonLocal &&
    !normalized.includes('localhost') &&
    !normalized.includes('127.0.0.1') &&
    !normalized.includes('kan116') &&
    !normalized.includes('test')
  ) {
    throw new Error(
      'KAN116_INTEGRATION_DATABASE_URL must point to a local/test database, or set KAN116_ALLOW_NONLOCAL_DATABASE=true for a dedicated non-production database.'
    )
  }
}

describe('critical internal operation flows integration', () => {
  integrationTest(
    'runs the real controlled store activation, plan/module and billing access journey',
    async () => {
      assertSafeIntegrationDatabaseUrl(integrationDatabaseUrl!)
      process.env.POSTGRES_URL = integrationDatabaseUrl
      process.env.DATABASE_URL = integrationDatabaseUrl

      const runId = `kan116-${Date.now()}`
      const operator = {
        clerkId: `${runId}-operator`,
        email: `${runId}@qa.clicaepede.test`,
        name: 'QA KAN-116',
        role: 'superadmin',
      } as const
      const responsibleEmail = `${runId}-owner@qa.clicaepede.test`
      const subdomain = runId

      const { eq, inArray } = await import('drizzle-orm')
      const { db } = await import('@/services/db')
      const schema = await import('@/services/db/schema')
      const internalDb = await import('./db')
      const { runBillingDelinquencyAccessBlockCycle } = await import(
        '@/features/billing/billing-delinquency-blocks'
      )
      const { storeImplementationChecklistDefinitions } = await import(
        './implementation-checklist-policy'
      )

      const createdPlanIds: number[] = []
      const createdModuleIds: number[] = []
      let createdStoreId: number | null = null

      const tryCleanup = async (operation: () => Promise<unknown>) => {
        try {
          await operation()
        } catch {
          // Integration runs use unique runIds and may target append-only audit schemas.
        }
      }

      const cleanup = async () => {
        if (createdStoreId) {
          await tryCleanup(() =>
            db
              .delete(schema.internalOperationAuditLogsTable)
              .where(
                eq(
                  schema.internalOperationAuditLogsTable.storeId,
                  createdStoreId!
                )
              )
          )
          await tryCleanup(() =>
            db
              .delete(schema.internalStoreProvisioningRequestsTable)
              .where(
                eq(
                  schema.internalStoreProvisioningRequestsTable.idempotencyKey,
                  runId
                )
              )
          )
          await tryCleanup(() =>
            db
              .delete(schema.storesTable)
              .where(eq(schema.storesTable.id, createdStoreId!))
          )
        }

        await tryCleanup(() =>
          db
            .delete(schema.usersTable)
            .where(eq(schema.usersTable.email, responsibleEmail))
        )

        if (createdPlanIds.length > 0) {
          await tryCleanup(() =>
            db
              .delete(schema.billingPlanModulesTable)
              .where(
                inArray(schema.billingPlanModulesTable.planId, createdPlanIds)
              )
          )
          await tryCleanup(() =>
            db
              .delete(schema.billingPlansTable)
              .where(inArray(schema.billingPlansTable.id, createdPlanIds))
          )
        }

        if (createdModuleIds.length > 0) {
          await tryCleanup(() =>
            db
              .delete(schema.billingModulesTable)
              .where(inArray(schema.billingModulesTable.id, createdModuleIds))
          )
        }
      }

      await cleanup()

      try {
        const now = new Date('2026-08-31T12:00:00.000Z')
        const [digitalMenuModule, posModule, aiModule, loyaltyModule] = await db
          .insert(schema.billingModulesTable)
          .values([
            {
              code: `${runId}-digital-menu`,
              name: 'Cardapio digital QA',
              description: 'KAN-116 integration module',
              status: 'active',
              metadata: { runId },
              updatedAt: now,
            },
            {
              code: `${runId}-pos`,
              name: 'PDV QA',
              description: 'KAN-116 integration module',
              status: 'active',
              metadata: { runId },
              updatedAt: now,
            },
            {
              code: `${runId}-ai`,
              name: 'Atendimento automatico QA',
              description: 'KAN-116 integration module',
              status: 'active',
              metadata: { runId },
              updatedAt: now,
            },
            {
              code: `${runId}-loyalty`,
              name: 'Fidelidade QA',
              description: 'KAN-116 integration module',
              status: 'active',
              metadata: { runId },
              updatedAt: now,
            },
          ])
          .returning()
        createdModuleIds.push(
          digitalMenuModule.id,
          posModule.id,
          aiModule.id,
          loyaltyModule.id
        )

        const [basePlan, upgradedPlan] = await db
          .insert(schema.billingPlansTable)
          .values([
            {
              code: `${runId}-base`,
              name: 'Plano Base QA',
              description: 'KAN-116 base plan',
              status: 'active',
              defaultAmount: '199.9000',
              currency: 'BRL',
              billingInterval: 'monthly',
              billingIntervalCount: 1,
              trialDays: 0,
              updatedAt: now,
            },
            {
              code: `${runId}-growth`,
              name: 'Plano Growth QA',
              description: 'KAN-116 upgraded plan',
              status: 'active',
              defaultAmount: '299.9000',
              currency: 'BRL',
              billingInterval: 'monthly',
              billingIntervalCount: 1,
              trialDays: 0,
              updatedAt: now,
            },
          ])
          .returning()
        createdPlanIds.push(basePlan.id, upgradedPlan.id)

        await db.insert(schema.billingPlanModulesTable).values([
          {
            planId: basePlan.id,
            moduleId: digitalMenuModule.id,
            status: 'active',
            startsAt: now,
            metadata: { runId },
            updatedAt: now,
          },
          {
            planId: basePlan.id,
            moduleId: posModule.id,
            status: 'active',
            startsAt: now,
            metadata: { runId },
            updatedAt: now,
          },
          {
            planId: upgradedPlan.id,
            moduleId: digitalMenuModule.id,
            status: 'active',
            startsAt: now,
            metadata: { runId },
            updatedAt: now,
          },
          {
            planId: upgradedPlan.id,
            moduleId: posModule.id,
            status: 'active',
            startsAt: now,
            metadata: { runId },
            updatedAt: now,
          },
          {
            planId: upgradedPlan.id,
            moduleId: aiModule.id,
            status: 'active',
            startsAt: now,
            metadata: { runId },
            updatedAt: now,
          },
        ])

        const provisioned = await internalDb.createInternalStore({
          values: {
            responsibleName: 'QA KAN-116 Owner',
            responsibleEmail,
            responsiblePhone: '11999999999',
            responsibleTaxNumber: '52998224725',
            storeName: `Loja ${runId}`,
            subdomain,
            companyTaxNumber: '04252011000110',
            companyName: `Loja ${runId}`,
            phone1: '1133333333',
            companyEmail: responsibleEmail,
            postalCode: '01001000',
            street: 'Praca da Se',
            number: '100',
            district: 'Se',
            city: 'Sao Paulo',
            stateCode: 'SP',
            planId: basePlan.id,
            contractedAmount: '199.90',
            discountType: 'none',
            discountValue: '',
            selectedModuleIds: [digitalMenuModule.id, posModule.id],
            sendAccessImmediately: false,
            duplicateOverrideConfirmed: false,
            duplicateReviewToken: '',
            provisioningIdempotencyKey: runId,
            reviewConfirmed: true,
            reviewFingerprint: '',
            reason: 'KAN-116 teste integrado de criacao controlada.',
          },
          operator,
        })
        createdStoreId = provisioned.store.id

        for (const definition of storeImplementationChecklistDefinitions) {
          await internalDb.updateStoreImplementationChecklistItem({
            storeId: provisioned.store.id,
            itemKey: definition.key,
            completed: true,
            observation: `KAN-116 ${definition.key}`,
            operator,
          })
        }

        const activatedStore =
          await internalDb.activateStoreAfterImplementation({
            storeId: provisioned.store.id,
            reason: 'KAN-116 ativacao apos checklist completo.',
            operator,
          })

        const changedSubscription =
          await internalDb.changeStoreSubscriptionPlan({
            values: {
              storeId: provisioned.store.id,
              subscriptionId: provisioned.subscription.id,
              targetPlanId: upgradedPlan.id,
              timing: 'immediate',
              valueMode: 'use_plan_default',
              customContractedAmount: '',
              moduleTreatment: 'sync_to_new_plan',
              prorationPolicy: 'create_adjustment',
              confirmation: '',
              reason: 'KAN-116 mudanca de plano integrada.',
            },
            operator,
          })

        const addon = await internalDb.manageStoreModuleEntitlement({
          values: {
            storeId: provisioned.store.id,
            moduleId: loyaltyModule.id,
            action: 'activate',
            origin: 'addon',
            additionalAmount: '49,90',
            endsAt: '',
            entitlementId: undefined,
            confirmation: '',
            reason: 'KAN-116 modulo adicional integrado.',
          },
          operator,
        })

        const invoice = await internalDb.createManualBillingInvoice({
          values: {
            storeId: provisioned.store.id,
            amount: '299.90',
            dueAt: new Date('2026-08-01T12:00:00.000Z'),
            description: 'KAN-116 fatura vencida controlada',
            reason: 'KAN-116 cria fatura vencida para bloqueio.',
          },
          operator,
        })

        const delinquency = await runBillingDelinquencyAccessBlockCycle({
          now: new Date('2026-08-31T12:00:00.000Z'),
          limit: 10,
        })

        const payment = await internalDb.markManualBillingInvoicePayment({
          values: {
            storeId: provisioned.store.id,
            invoiceId: invoice.id,
            amount: '299.90',
            paidAt: new Date('2026-08-31T12:05:00.000Z'),
            paymentReference: `KAN-116-${invoice.id}`,
            reason: 'KAN-116 pagamento manual desbloqueia acesso.',
          },
          operator,
        })

        const [activeBlock] = await db
          .select()
          .from(schema.storeAccessBlocksTable)
          .where(eq(schema.storeAccessBlocksTable.invoiceId, invoice.id))
          .limit(1)
        const auditRows = await db
          .select({
            action: schema.internalOperationAuditLogsTable.action,
            storeId: schema.internalOperationAuditLogsTable.storeId,
          })
          .from(schema.internalOperationAuditLogsTable)
          .where(
            eq(
              schema.internalOperationAuditLogsTable.storeId,
              provisioned.store.id
            )
          )

        expect(activatedStore.status).toBe('active')
        expect(changedSubscription.planId).toBe(upgradedPlan.id)
        expect(addon.action).toBe('activated')
        expect(delinquency.blocked).toBe(1)
        expect(
          delinquency.processed.some(
            item => item.invoiceId === invoice.id && item.status === 'blocked'
          )
        ).toBe(true)
        expect(payment.invoice.status).toBe('paid')
        expect(activeBlock?.unblockedAt).toBeInstanceOf(Date)
        expect(auditRows.map(row => row.action)).toEqual(
          expect.arrayContaining([
            'create_store',
            'activate_store_after_implementation',
            'manage_store_module_entitlement',
            'create_manual_billing_invoice',
            'mark_manual_billing_invoice_payment',
            'auto_unblock_billing_access',
          ])
        )
        expect(
          auditRows.every(row => row.storeId === provisioned.store.id)
        ).toBe(true)
      } finally {
        await cleanup()
      }
    }
  )
})
