import {
  getBillingReminderChannelLabel,
  selectDueBillingReminderDrafts,
  type BillingReminderChannel,
} from '@/features/billing/billing-reminders-policy'
import { db } from '@/services/db'
import {
  billingReminderRulesTable,
  storeBillingEventsTable,
  storeBillingInvoicesTable,
  storeBillingReminderDeliveriesTable,
  storeCompanyProfilesTable,
  storeSubscriptionsTable,
} from '@/services/db/schema'
import { and, asc, eq, inArray, isNull, lte, or } from 'drizzle-orm'

export type BillingReminderCycleOptions = {
  now?: Date
  limit?: number
}

export type BillingReminderCycleResult = {
  processedInvoices: number
  created: number
  skipped: number
  failed: number
  processed: Array<{
    invoiceId: number
    storeId: number
    status: 'created' | 'skipped' | 'failed'
    created?: number
    skipped?: number
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

const resolveReminderRecipient = ({
  channel,
  profile,
}: {
  channel: BillingReminderChannel
  profile: {
    companyEmail: string | null
    responsibleEmail: string | null
    phone1: string | null
    phone2: string | null
    responsiblePhone: string | null
  }
}) => {
  if (channel === 'email') {
    return profile.responsibleEmail ?? profile.companyEmail
  }

  if (channel === 'whatsapp') {
    return profile.responsiblePhone ?? profile.phone1 ?? profile.phone2
  }

  return null
}

const getDeliveryStatus = ({
  channel,
  recipient,
}: {
  channel: BillingReminderChannel
  recipient: string | null
}) => {
  if (channel === 'system') return 'sent' as const
  if (!recipient) return 'skipped' as const

  return 'queued' as const
}

const getDeliveryFailureReason = ({
  channel,
  recipient,
}: {
  channel: BillingReminderChannel
  recipient: string | null
}) => {
  if (channel === 'system' || recipient) return null

  return `Sem destinatario de ${getBillingReminderChannelLabel(channel)} configurado`
}

const processBillingReminderInvoice = async ({
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
          paymentGraceDays: storeSubscriptionsTable.paymentGraceDays,
        },
        profile: {
          companyEmail: storeCompanyProfilesTable.email,
          responsibleEmail: storeCompanyProfilesTable.responsibleEmail,
          phone1: storeCompanyProfilesTable.phone1,
          phone2: storeCompanyProfilesTable.phone2,
          responsiblePhone: storeCompanyProfilesTable.responsiblePhone,
        },
      })
      .from(storeBillingInvoicesTable)
      .innerJoin(
        storeSubscriptionsTable,
        eq(storeSubscriptionsTable.id, storeBillingInvoicesTable.subscriptionId)
      )
      .leftJoin(
        storeCompanyProfilesTable,
        eq(storeCompanyProfilesTable.storeId, storeBillingInvoicesTable.storeId)
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

    const storeRules = await tx
      .select()
      .from(billingReminderRulesTable)
      .where(eq(billingReminderRulesTable.storeId, row.invoice.storeId))
      .orderBy(
        asc(billingReminderRulesTable.daysAfterDue),
        asc(billingReminderRulesTable.channel)
      )

    const globalRules = await tx
      .select()
      .from(billingReminderRulesTable)
      .where(isNull(billingReminderRulesTable.storeId))
      .orderBy(
        asc(billingReminderRulesTable.daysAfterDue),
        asc(billingReminderRulesTable.channel)
      )

    const rules = (storeRules.length > 0 ? storeRules : globalRules).filter(
      rule => rule.status === 'active'
    )

    if (rules.length === 0) {
      return {
        invoiceId,
        storeId: row.invoice.storeId,
        status: 'skipped' as const,
        reason: 'no_active_rules',
      }
    }

    const existingDeliveries = await tx
      .select({
        dedupeKey: storeBillingReminderDeliveriesTable.dedupeKey,
      })
      .from(storeBillingReminderDeliveriesTable)
      .where(eq(storeBillingReminderDeliveriesTable.invoiceId, row.invoice.id))

    const drafts = selectDueBillingReminderDrafts({
      invoice: row.invoice,
      rules,
      existingDedupeKeys: new Set(
        existingDeliveries.map(delivery => delivery.dedupeKey)
      ),
      now,
      paymentGraceDays: row.subscription.paymentGraceDays,
    })

    if (drafts.length === 0) {
      return {
        invoiceId: row.invoice.id,
        storeId: row.invoice.storeId,
        status: 'skipped' as const,
        reason: 'nothing_due',
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

    const deliveryValues = drafts.map(draft => {
      const recipient = resolveReminderRecipient({
        channel: draft.channel,
        profile: row.profile ?? {
          companyEmail: null,
          responsibleEmail: null,
          phone1: null,
          phone2: null,
          responsiblePhone: null,
        },
      })
      const status = getDeliveryStatus({
        channel: draft.channel,
        recipient,
      })

      return {
        storeId: row.invoice.storeId,
        subscriptionId: row.subscription.id,
        invoiceId: row.invoice.id,
        ruleId: draft.ruleId,
        channel: draft.channel,
        daysAfterDue: draft.daysAfterDue,
        status,
        recipient,
        title: draft.title,
        message: draft.message,
        dedupeKey: draft.dedupeKey,
        scheduledFor: now,
        sentAt: status === 'sent' ? now : null,
        skippedAt: status === 'skipped' ? now : null,
        failureReason: getDeliveryFailureReason({
          channel: draft.channel,
          recipient,
        }),
        metadata: {
          source: 'billing_reminder_cycle',
          expectedBlockAt: draft.expectedBlockAt.toISOString(),
        },
        updatedAt: now,
      }
    })

    const createdDeliveries = await tx
      .insert(storeBillingReminderDeliveriesTable)
      .values(deliveryValues)
      .onConflictDoNothing({
        target: storeBillingReminderDeliveriesTable.dedupeKey,
      })
      .returning({
        id: storeBillingReminderDeliveriesTable.id,
        channel: storeBillingReminderDeliveriesTable.channel,
        daysAfterDue: storeBillingReminderDeliveriesTable.daysAfterDue,
        status: storeBillingReminderDeliveriesTable.status,
      })

    if (createdDeliveries.length > 0) {
      await tx.insert(storeBillingEventsTable).values({
        storeId: row.invoice.storeId,
        subscriptionId: row.subscription.id,
        invoiceId: row.invoice.id,
        eventType: 'billing_reminder_sent',
        actorClerkId: null,
        actorEmail: null,
        reason: 'Lembretes de cobranca gerados automaticamente',
        previousValues: {
          invoiceStatus: row.invoice.status,
        },
        newValues: {
          invoiceStatus:
            row.invoice.status === 'pending' ? 'overdue' : row.invoice.status,
          reminders: createdDeliveries,
        },
        metadata: { source: 'billing_reminder_cycle' },
      })
    }

    const skipped = deliveryValues.length - createdDeliveries.length

    return {
      invoiceId: row.invoice.id,
      storeId: row.invoice.storeId,
      status:
        createdDeliveries.length > 0
          ? ('created' as const)
          : ('skipped' as const),
      created: createdDeliveries.length,
      skipped,
      reason: createdDeliveries.length > 0 ? undefined : 'dedupe_conflict',
    }
  })

export const runBillingReminderCycle = async ({
  now = new Date(),
  limit,
}: BillingReminderCycleOptions = {}): Promise<BillingReminderCycleResult> => {
  const candidates = await db
    .select({
      invoiceId: storeBillingInvoicesTable.id,
    })
    .from(storeBillingInvoicesTable)
    .where(
      and(
        inArray(storeBillingInvoicesTable.status, ['pending', 'overdue']),
        lte(storeBillingInvoicesTable.dueAt, now),
        or(
          eq(storeBillingInvoicesTable.status, 'overdue'),
          eq(storeBillingInvoicesTable.status, 'pending')
        )
      )
    )
    .orderBy(
      asc(storeBillingInvoicesTable.dueAt),
      asc(storeBillingInvoicesTable.id)
    )
    .limit(normalizeRunLimit(limit))

  const result: BillingReminderCycleResult = {
    processedInvoices: 0,
    created: 0,
    skipped: 0,
    failed: 0,
    processed: [],
  }

  for (const candidate of candidates) {
    try {
      const processed = await processBillingReminderInvoice({
        invoiceId: candidate.invoiceId,
        now,
      })

      result.processedInvoices += 1
      result.created += processed.created ?? 0
      result.skipped += processed.skipped ?? 0
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
