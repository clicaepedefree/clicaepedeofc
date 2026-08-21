import {
  buildRecurringBillingInvoiceDraft,
  buildRecurringBillingInvoiceNumber,
  calculateRecurringBillingGenerationCutoff,
  normalizeInvoiceLeadDays,
  recurringBillingEligibleStatuses,
  shouldGenerateRecurringBillingInvoice,
} from '@/features/billing/billing-policy'
import { db } from '@/services/db'
import { billingPlansTable } from '@/services/db/schema/billing-plans'
import { storeBillingEventsTable } from '@/services/db/schema/store-billing-events'
import {
  storeBillingInvoicesTable,
  type SelectStoreBillingInvoice,
} from '@/services/db/schema/store-billing-invoices'
import { storeSubscriptionsTable } from '@/services/db/schema/store-subscriptions'
import { and, asc, eq, inArray, lte } from 'drizzle-orm'

export type RecurringBillingCycleOptions = {
  now?: Date
  invoiceLeadDays?: number
  limit?: number
}

export type RecurringBillingCycleResult = {
  generated: number
  reused: number
  skipped: number
  failed: number
  processed: Array<{
    storeId: number
    subscriptionId: number
    invoiceId?: number
    invoiceNumber?: string
    status: 'generated' | 'reused' | 'skipped' | 'failed'
    reason?: string
  }>
}

const DEFAULT_RUN_LIMIT = 100

const normalizeRunLimit = (limit: number | undefined) =>
  Number.isFinite(limit) && Number(limit) > 0
    ? Math.min(Math.trunc(Number(limit)), 500)
    : DEFAULT_RUN_LIMIT

const toFailureMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Erro desconhecido'

const processRecurringSubscription = async ({
  subscriptionId,
  now,
  invoiceLeadDays,
}: {
  subscriptionId: number
  now: Date
  invoiceLeadDays: number
}) =>
  db.transaction(async tx => {
    const [row] = await tx
      .select({
        subscription: storeSubscriptionsTable,
        plan: billingPlansTable,
      })
      .from(storeSubscriptionsTable)
      .innerJoin(
        billingPlansTable,
        eq(billingPlansTable.id, storeSubscriptionsTable.planId)
      )
      .where(eq(storeSubscriptionsTable.id, subscriptionId))
      .limit(1)

    if (!row) {
      return {
        storeId: 0,
        subscriptionId,
        status: 'skipped' as const,
        reason: 'subscription_not_found',
      }
    }

    const { subscription, plan } = row

    if (
      plan.status !== 'active' ||
      !shouldGenerateRecurringBillingInvoice({
        status: subscription.status,
        nextBillingAt: subscription.nextBillingAt,
        now,
        invoiceLeadDays,
      })
    ) {
      return {
        storeId: subscription.storeId,
        subscriptionId: subscription.id,
        status: 'skipped' as const,
        reason: plan.status !== 'active' ? 'inactive_plan' : 'outside_window',
      }
    }

    const invoiceNumber = buildRecurringBillingInvoiceNumber({
      storeId: subscription.storeId,
      subscriptionId: subscription.id,
      periodStart: subscription.currentPeriodEnd,
    })
    const {
      invoice: invoiceDraft,
      nextPeriod,
      nextSubscriptionStatus,
    } = buildRecurringBillingInvoiceDraft({
      invoiceNumber,
      dueAt: subscription.nextBillingAt,
      plan,
      subscription,
    })

    const [createdInvoice] = await tx
      .insert(storeBillingInvoicesTable)
      .values({
        ...invoiceDraft,
        metadata: {
          ...(invoiceDraft.metadata as Record<string, unknown>),
          source: 'recurring_billing_cycle',
          generatedAt: now.toISOString(),
          invoiceLeadDays,
        },
        updatedAt: now,
      })
      .onConflictDoNothing({
        target: [
          storeBillingInvoicesTable.subscriptionId,
          storeBillingInvoicesTable.periodStart,
          storeBillingInvoicesTable.periodEnd,
        ],
      })
      .returning()

    let invoice: SelectStoreBillingInvoice | undefined = createdInvoice
    let status: 'generated' | 'reused' = 'generated'

    if (!invoice) {
      ;[invoice] = await tx
        .select()
        .from(storeBillingInvoicesTable)
        .where(
          and(
            eq(storeBillingInvoicesTable.subscriptionId, subscription.id),
            eq(storeBillingInvoicesTable.periodStart, nextPeriod.periodStart),
            eq(storeBillingInvoicesTable.periodEnd, nextPeriod.periodEnd)
          )
        )
        .limit(1)
      status = 'reused'
    }

    if (!invoice) {
      throw new Error('RECURRENT_INVOICE_NOT_CREATED')
    }

    const [updatedSubscription] = await tx
      .update(storeSubscriptionsTable)
      .set({
        status: nextSubscriptionStatus,
        currentPeriodStart: nextPeriod.periodStart,
        currentPeriodEnd: nextPeriod.periodEnd,
        nextBillingAt: nextPeriod.nextBillingAt,
        updatedAt: now,
      })
      .where(
        and(
          eq(storeSubscriptionsTable.id, subscription.id),
          eq(
            storeSubscriptionsTable.currentPeriodStart,
            subscription.currentPeriodStart
          ),
          eq(
            storeSubscriptionsTable.currentPeriodEnd,
            subscription.currentPeriodEnd
          ),
          eq(storeSubscriptionsTable.nextBillingAt, subscription.nextBillingAt)
        )
      )
      .returning({ id: storeSubscriptionsTable.id })

    if (!updatedSubscription) {
      return {
        storeId: subscription.storeId,
        subscriptionId: subscription.id,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        status: 'reused' as const,
        reason: 'subscription_already_advanced',
      }
    }

    if (createdInvoice) {
      await tx.insert(storeBillingEventsTable).values({
        storeId: subscription.storeId,
        subscriptionId: subscription.id,
        invoiceId: invoice.id,
        eventType: 'invoice_created',
        actorClerkId: null,
        actorEmail: null,
        reason: 'Geração recorrente automática',
        previousValues: {
          subscriptionStatus: subscription.status,
          currentPeriodStart: subscription.currentPeriodStart.toISOString(),
          currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
          nextBillingAt: subscription.nextBillingAt.toISOString(),
        },
        newValues: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          status: invoice.status,
          subscriptionStatus: nextSubscriptionStatus,
          totalAmount: invoice.totalAmount,
          dueAt: invoice.dueAt.toISOString(),
          nextPeriodStart: nextPeriod.periodStart.toISOString(),
          nextPeriodEnd: nextPeriod.periodEnd.toISOString(),
          nextBillingAt: nextPeriod.nextBillingAt.toISOString(),
        },
        metadata: { source: 'recurring_billing_cycle' },
      })
    }

    return {
      storeId: subscription.storeId,
      subscriptionId: subscription.id,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      status,
    }
  })

export const runRecurringBillingCycle = async ({
  now = new Date(),
  invoiceLeadDays: rawInvoiceLeadDays = 7,
  limit,
}: RecurringBillingCycleOptions = {}): Promise<RecurringBillingCycleResult> => {
  const invoiceLeadDays = normalizeInvoiceLeadDays(rawInvoiceLeadDays)
  const generationCutoff = calculateRecurringBillingGenerationCutoff({
    now,
    invoiceLeadDays,
  })

  const candidates = await db
    .select({
      subscriptionId: storeSubscriptionsTable.id,
    })
    .from(storeSubscriptionsTable)
    .innerJoin(
      billingPlansTable,
      eq(billingPlansTable.id, storeSubscriptionsTable.planId)
    )
    .where(
      and(
        inArray(
          storeSubscriptionsTable.status,
          recurringBillingEligibleStatuses
        ),
        eq(billingPlansTable.status, 'active'),
        lte(storeSubscriptionsTable.nextBillingAt, generationCutoff)
      )
    )
    .orderBy(
      asc(storeSubscriptionsTable.nextBillingAt),
      asc(storeSubscriptionsTable.id)
    )
    .limit(normalizeRunLimit(limit))

  const result: RecurringBillingCycleResult = {
    generated: 0,
    reused: 0,
    skipped: 0,
    failed: 0,
    processed: [],
  }

  for (const candidate of candidates) {
    try {
      const processed = await processRecurringSubscription({
        subscriptionId: candidate.subscriptionId,
        now,
        invoiceLeadDays,
      })
      result[processed.status] += 1
      result.processed.push(processed)
    } catch (error) {
      result.failed += 1
      result.processed.push({
        storeId: 0,
        subscriptionId: candidate.subscriptionId,
        status: 'failed',
        reason: toFailureMessage(error),
      })
    }
  }

  return result
}
