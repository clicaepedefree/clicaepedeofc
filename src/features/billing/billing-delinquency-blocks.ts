import { decideBillingDelinquencyAccessBlock } from '@/features/billing/billing-delinquency-policy'
import { db } from '@/services/db'
import {
  storeAccessBlocksTable,
  storeBillingEventsTable,
  storeBillingInvoicesTable,
  storeSubscriptionsTable,
  storesTable,
} from '@/services/db/schema'
import { and, asc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm'

export type BillingDelinquencyAccessBlockCycleOptions = {
  now?: Date
  limit?: number
}

export type BillingDelinquencyAccessBlockCycleResult = {
  processedInvoices: number
  blocked: number
  skipped: number
  failed: number
  processed: Array<{
    invoiceId: number
    storeId: number
    status: 'blocked' | 'skipped' | 'failed'
    reason?: string
    blockId?: number
  }>
}

const DEFAULT_RUN_LIMIT = 100
const SYSTEM_ACTOR_CLERK_ID = 'system:billing-delinquency'
const SYSTEM_ACTOR_EMAIL = 'sistema@clicaepede.com.br'
const SYSTEM_ACTOR_NAME = 'Rotina automatica de cobranca'

const normalizeRunLimit = (limit: number | undefined) =>
  Number.isFinite(limit) && Number(limit) > 0
    ? Math.min(Math.trunc(Number(limit)), 500)
    : DEFAULT_RUN_LIMIT

const toFailureMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Erro desconhecido'

const formatMoney = (value: number, currency: string) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
  }).format(value)

const processDelinquencyInvoice = async ({
  invoiceId,
  now,
}: {
  invoiceId: number
  now: Date
}) =>
  db.transaction(async tx => {
    const [row] = await tx
      .select({
        invoice: storeBillingInvoicesTable,
        subscription: {
          id: storeSubscriptionsTable.id,
          status: storeSubscriptionsTable.status,
          paymentGraceDays: storeSubscriptionsTable.paymentGraceDays,
          billingAccessExemptionKind:
            storeSubscriptionsTable.billingAccessExemptionKind,
          billingAccessExemptUntil:
            storeSubscriptionsTable.billingAccessExemptUntil,
          billingAccessExemptionReason:
            storeSubscriptionsTable.billingAccessExemptionReason,
        },
        store: {
          id: storesTable.id,
          status: storesTable.status,
        },
      })
      .from(storeBillingInvoicesTable)
      .innerJoin(
        storeSubscriptionsTable,
        eq(storeSubscriptionsTable.id, storeBillingInvoicesTable.subscriptionId)
      )
      .innerJoin(
        storesTable,
        eq(storesTable.id, storeBillingInvoicesTable.storeId)
      )
      .where(eq(storeBillingInvoicesTable.id, invoiceId))
      .limit(1)

    if (!row) {
      return {
        invoiceId,
        storeId: 0,
        status: 'skipped' as const,
        reason: 'invoice_not_found',
      }
    }

    const [activeBlock] = await tx
      .select({ id: storeAccessBlocksTable.id })
      .from(storeAccessBlocksTable)
      .where(
        and(
          eq(storeAccessBlocksTable.storeId, row.store.id),
          isNull(storeAccessBlocksTable.unblockedAt),
          or(
            isNull(storeAccessBlocksTable.scheduledUnblockAt),
            sql`${storeAccessBlocksTable.scheduledUnblockAt} > ${now}`
          )
        )
      )
      .limit(1)

    const decision = decideBillingDelinquencyAccessBlock({
      invoice: row.invoice,
      subscription: row.subscription,
      store: row.store,
      hasActiveAccessBlock: Boolean(activeBlock),
      now,
    })

    if (decision.action === 'skip') {
      return {
        invoiceId: row.invoice.id,
        storeId: row.store.id,
        status: 'skipped' as const,
        reason: decision.reason,
      }
    }

    if (row.invoice.status === 'pending') {
      await tx
        .update(storeBillingInvoicesTable)
        .set({
          status: 'overdue',
          updatedAt: now,
        })
        .where(eq(storeBillingInvoicesTable.id, row.invoice.id))
    }

    const reason = `Bloqueio automatico por inadimplencia: fatura ${
      row.invoice.invoiceNumber
    } vencida em ${row.invoice.dueAt.toISOString()}; tolerancia ${
      row.subscription.paymentGraceDays
    } dia(s); saldo em aberto ${formatMoney(
      decision.outstandingAmount,
      row.invoice.currency
    )}.`

    const [block] = await tx
      .insert(storeAccessBlocksTable)
      .values({
        storeId: row.store.id,
        source: 'billing_delinquency',
        reasonCode: decision.reasonCode,
        subscriptionId: row.subscription.id,
        invoiceId: row.invoice.id,
        dedupeKey: decision.dedupeKey,
        reason,
        notifyStoreOwner: true,
        notificationNote:
          'Acesso bloqueado automaticamente por fatura vencida apos o periodo de tolerancia. Regularize a pendencia com o suporte da Clica e Pede.',
        blockedAt: now,
        blockedByClerkId: SYSTEM_ACTOR_CLERK_ID,
        blockedByEmail: SYSTEM_ACTOR_EMAIL,
        blockedByName: SYSTEM_ACTOR_NAME,
        updatedAt: now,
      })
      .onConflictDoNothing({
        target: storeAccessBlocksTable.dedupeKey,
      })
      .returning({ id: storeAccessBlocksTable.id })

    if (!block) {
      return {
        invoiceId: row.invoice.id,
        storeId: row.store.id,
        status: 'skipped' as const,
        reason: 'dedupe_conflict',
      }
    }

    await tx.insert(storeBillingEventsTable).values({
      storeId: row.store.id,
      subscriptionId: row.subscription.id,
      invoiceId: row.invoice.id,
      eventType: 'billing_access_blocked',
      actorClerkId: SYSTEM_ACTOR_CLERK_ID,
      actorEmail: SYSTEM_ACTOR_EMAIL,
      reason,
      previousValues: {
        invoiceStatus: row.invoice.status,
        storeStatus: row.store.status,
      },
      newValues: {
        invoiceStatus:
          row.invoice.status === 'pending' ? 'overdue' : row.invoice.status,
        storeStatus: row.store.status,
        accessBlockId: block.id,
      },
      metadata: {
        source: 'billing_delinquency_cycle',
        blockAt: decision.blockAt.toISOString(),
        dedupeKey: decision.dedupeKey,
      },
    })

    return {
      invoiceId: row.invoice.id,
      storeId: row.store.id,
      status: 'blocked' as const,
      blockId: block.id,
    }
  })

export const runBillingDelinquencyAccessBlockCycle = async ({
  now = new Date(),
  limit,
}: BillingDelinquencyAccessBlockCycleOptions = {}): Promise<BillingDelinquencyAccessBlockCycleResult> => {
  const candidates = await db
    .select({
      invoiceId: storeBillingInvoicesTable.id,
    })
    .from(storeBillingInvoicesTable)
    .where(
      and(
        inArray(storeBillingInvoicesTable.status, ['pending', 'overdue']),
        lte(storeBillingInvoicesTable.dueAt, now)
      )
    )
    .orderBy(
      asc(storeBillingInvoicesTable.dueAt),
      asc(storeBillingInvoicesTable.id)
    )
    .limit(normalizeRunLimit(limit))

  const result: BillingDelinquencyAccessBlockCycleResult = {
    processedInvoices: 0,
    blocked: 0,
    skipped: 0,
    failed: 0,
    processed: [],
  }

  for (const candidate of candidates) {
    try {
      const processed = await processDelinquencyInvoice({
        invoiceId: candidate.invoiceId,
        now,
      })

      result.processedInvoices += 1
      if (processed.status === 'blocked') result.blocked += 1
      if (processed.status === 'skipped') result.skipped += 1
      result.processed.push(processed)
    } catch (error) {
      result.processedInvoices += 1
      result.failed += 1
      result.processed.push({
        invoiceId: candidate.invoiceId,
        storeId: 0,
        status: 'failed',
        reason: toFailureMessage(error),
      })
    }
  }

  return result
}
