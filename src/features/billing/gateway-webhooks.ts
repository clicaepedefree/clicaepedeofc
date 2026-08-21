import {
  calculateBillingGatewayPayloadHash,
  normalizeBillingGatewayEvent,
  resolveBillingGatewayEventProcessing,
  type NormalizedBillingGatewayEvent,
} from '@/features/billing/gateway-webhooks-policy'
import {
  buildPaymentConfirmationDedupeKey,
  reconcileConfirmedPayment,
} from '@/features/billing/payment-confirmation-policy'
import { db } from '@/services/db'
import { storeAccessBlocksTable } from '@/services/db/schema/store-access-blocks'
import { storeBillingEventsTable } from '@/services/db/schema/store-billing-events'
import { storeBillingGatewayEventsTable } from '@/services/db/schema/store-billing-gateway-events'
import {
  storeBillingInvoicesTable,
  type SelectStoreBillingInvoice,
} from '@/services/db/schema/store-billing-invoices'
import { storeBillingPaymentsTable } from '@/services/db/schema/store-billing-payments'
import { storeBillingReconciliationIssuesTable } from '@/services/db/schema/store-billing-reconciliation-issues'
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  lte,
  or,
  sql,
} from 'drizzle-orm'

export type BillingGatewayWebhookResult = {
  accepted: boolean
  duplicate?: boolean
  eventId?: number
  reason?: string
}

export type BillingGatewayQueueResult = {
  processed: number
  failed: number
  ignored: number
}

type BillingGatewayProcessingStatus = keyof BillingGatewayQueueResult

const DEFAULT_QUEUE_LIMIT = 25
const MAX_QUEUE_LIMIT = 100
const SYSTEM_ACTOR_EMAIL = 'billing-gateway@clicaepede.internal'

const normalizeLimit = (limit: number | undefined) =>
  Number.isFinite(limit) && Number(limit) > 0
    ? Math.min(Math.trunc(Number(limit)), MAX_QUEUE_LIMIT)
    : DEFAULT_QUEUE_LIMIT

const toFailureMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Erro desconhecido'

const toMoneyNumber = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return 0
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const formatMoney = (value: number) => value.toFixed(4)

const getRetryDate = ({ now, attempts }: { now: Date; attempts: number }) => {
  const minutes = Math.min(60, Math.max(1, attempts) * 5)
  return new Date(now.getTime() + minutes * 60_000)
}

const getSafeHeadersMetadata = (headers: Headers) => ({
  provider: headers.get('x-billing-provider'),
  signatureHeaderPresent: Boolean(headers.get('x-clica-signature')),
  timestampHeaderPresent: Boolean(headers.get('x-clica-timestamp')),
  userAgent: headers.get('user-agent'),
})

async function insertReconciliationIssue({
  storeId,
  invoiceId,
  paymentId,
  gatewayEventId,
  provider,
  providerEventId,
  issueType,
  severity = 'warning',
  reason,
  expectedValues,
  observedValues,
}: {
  storeId?: number | null
  invoiceId?: number | null
  paymentId?: number | null
  gatewayEventId?: number | null
  provider: string
  providerEventId?: string | null
  issueType:
    | 'invalid_signature'
    | 'invalid_origin'
    | 'unsupported_event'
    | 'invoice_not_found'
    | 'amount_mismatch'
    | 'payment_exceeds_outstanding'
    | 'refund_exceeds_paid'
    | 'out_of_order_event'
    | 'invoice_payment_total_mismatch'
    | 'processing_error'
  severity?: 'info' | 'warning' | 'critical'
  reason: string
  expectedValues?: Record<string, unknown> | null
  observedValues?: Record<string, unknown> | null
}) {
  await db.insert(storeBillingReconciliationIssuesTable).values({
    storeId: storeId ?? null,
    invoiceId: invoiceId ?? null,
    paymentId: paymentId ?? null,
    gatewayEventId: gatewayEventId ?? null,
    provider,
    providerEventId: providerEventId ?? null,
    issueType,
    severity,
    reason,
    expectedValues: expectedValues ?? null,
    observedValues: observedValues ?? null,
    updatedAt: new Date(),
  })
}

async function findInvoiceForGatewayEvent(
  event: NormalizedBillingGatewayEvent
) {
  const conditions = []
  if (event.invoiceId) {
    conditions.push(eq(storeBillingInvoicesTable.id, event.invoiceId))
  }
  if (event.invoiceNumber) {
    conditions.push(
      eq(storeBillingInvoicesTable.invoiceNumber, event.invoiceNumber)
    )
  }

  if (conditions.length === 0) return null

  const [invoice] = await db
    .select()
    .from(storeBillingInvoicesTable)
    .where(conditions.length === 1 ? conditions[0] : or(...conditions))
    .limit(1)

  return invoice ?? null
}

export async function recordInvalidBillingGatewayWebhook({
  rawBody,
  headers,
  provider,
  reason,
  signatureStatus = 'invalid',
  issueType = 'invalid_signature',
}: {
  rawBody: string
  headers: Headers
  provider: string
  reason: string
  signatureStatus?: 'valid' | 'invalid'
  issueType?: 'invalid_signature' | 'invalid_origin'
}): Promise<BillingGatewayWebhookResult> {
  const now = new Date()
  const payloadHash = calculateBillingGatewayPayloadHash(rawBody)
  const providerEventId = `invalid:${payloadHash.slice(0, 48)}`

  const [event] = await db
    .insert(storeBillingGatewayEventsTable)
    .values({
      provider,
      providerEventId,
      eventType: 'unknown',
      status: 'ignored',
      signatureStatus,
      payloadHash,
      payload: {},
      headersMetadata: getSafeHeadersMetadata(headers),
      attempts: 1,
      nextAttemptAt: now,
      lastError: reason,
      processedAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [
        storeBillingGatewayEventsTable.provider,
        storeBillingGatewayEventsTable.providerEventId,
      ],
    })
    .returning()

  if (event) {
    await insertReconciliationIssue({
      gatewayEventId: event.id,
      provider,
      providerEventId,
      issueType,
      severity: 'critical',
      reason,
      observedValues: { payloadHash },
    })
  }

  return {
    accepted: false,
    duplicate: !event,
    eventId: event?.id,
    reason,
  }
}

export async function enqueueBillingGatewayWebhook({
  rawBody,
  headers,
}: {
  rawBody: string
  headers: Headers
}): Promise<BillingGatewayWebhookResult> {
  const now = new Date()
  const normalizedEvent = normalizeBillingGatewayEvent({
    rawBody,
    providerFromHeader: headers.get('x-billing-provider'),
  })
  const invoice = await findInvoiceForGatewayEvent(normalizedEvent)
  const payloadHash = calculateBillingGatewayPayloadHash(rawBody)

  const [event] = await db
    .insert(storeBillingGatewayEventsTable)
    .values({
      provider: normalizedEvent.provider,
      providerEventId: normalizedEvent.providerEventId,
      eventType: normalizedEvent.eventType,
      status: 'queued',
      signatureStatus: 'valid',
      storeId: invoice?.storeId ?? null,
      subscriptionId: invoice?.subscriptionId ?? null,
      invoiceId: invoice?.id ?? null,
      invoiceNumber: invoice?.invoiceNumber ?? normalizedEvent.invoiceNumber,
      providerPaymentId: normalizedEvent.providerPaymentId,
      amount: normalizedEvent.amount,
      currency: normalizedEvent.currency,
      payloadHash,
      payload: normalizedEvent.payload,
      headersMetadata: getSafeHeadersMetadata(headers),
      attempts: 0,
      nextAttemptAt: now,
      occurredAt: normalizedEvent.occurredAt,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [
        storeBillingGatewayEventsTable.provider,
        storeBillingGatewayEventsTable.providerEventId,
      ],
    })
    .returning()

  return {
    accepted: true,
    duplicate: !event,
    eventId: event?.id,
  }
}

async function markGatewayEvent({
  id,
  status,
  now,
  lastError,
  paymentId,
  nextAttemptAt,
}: {
  id: number
  status: 'processed' | 'failed' | 'ignored'
  now: Date
  lastError?: string | null
  paymentId?: number | null
  nextAttemptAt?: Date | null
}) {
  await db
    .update(storeBillingGatewayEventsTable)
    .set({
      status,
      paymentId: paymentId ?? undefined,
      lastError: lastError ?? null,
      nextAttemptAt: nextAttemptAt ?? now,
      processedAt: status === 'processed' || status === 'ignored' ? now : null,
      updatedAt: now,
    })
    .where(eq(storeBillingGatewayEventsTable.id, id))
}

async function processSucceededPayment({
  gatewayEvent,
  invoice,
  now,
}: {
  gatewayEvent: typeof storeBillingGatewayEventsTable.$inferSelect
  invoice: SelectStoreBillingInvoice
  now: Date
}): Promise<Exclude<BillingGatewayProcessingStatus, 'ignored'>> {
  const paymentAmount = gatewayEvent.amount

  if (!paymentAmount) {
    await insertReconciliationIssue({
      storeId: invoice.storeId,
      invoiceId: invoice.id,
      gatewayEventId: gatewayEvent.id,
      provider: gatewayEvent.provider,
      providerEventId: gatewayEvent.providerEventId,
      issueType: 'amount_mismatch',
      severity: 'critical',
      reason: 'Evento pago chegou sem valor.',
      expectedValues: { invoiceTotal: invoice.totalAmount },
      observedValues: { amount: null },
    })
    await markGatewayEvent({
      id: gatewayEvent.id,
      status: 'failed',
      now,
      lastError: 'missing_amount',
      nextAttemptAt: getRetryDate({
        now,
        attempts: gatewayEvent.attempts + 1,
      }),
    })
    return 'failed'
  }

  const paidAt = gatewayEvent.occurredAt ?? now
  const confirmationKey = buildPaymentConfirmationDedupeKey({
    invoiceId: invoice.id,
    provider: gatewayEvent.provider,
    providerPaymentId: gatewayEvent.providerPaymentId,
    amount: paymentAmount,
    paidAt,
  })

  const [existingPayment] = await db
    .select()
    .from(storeBillingPaymentsTable)
    .where(eq(storeBillingPaymentsTable.confirmationKey, confirmationKey))
    .limit(1)

  if (existingPayment) {
    await markGatewayEvent({
      id: gatewayEvent.id,
      status: 'processed',
      now,
      paymentId: existingPayment.id,
    })
    return 'processed'
  }

  let reconciliation: ReturnType<typeof reconcileConfirmedPayment>
  try {
    reconciliation = reconcileConfirmedPayment({
      invoice,
      amount: paymentAmount,
      paidAt,
    })
  } catch (error) {
    const reason = toFailureMessage(error)
    await insertReconciliationIssue({
      storeId: invoice.storeId,
      invoiceId: invoice.id,
      gatewayEventId: gatewayEvent.id,
      provider: gatewayEvent.provider,
      providerEventId: gatewayEvent.providerEventId,
      issueType:
        reason === 'PAYMENT_EXCEEDS_OUTSTANDING'
          ? 'payment_exceeds_outstanding'
          : 'amount_mismatch',
      severity: 'critical',
      reason,
      expectedValues: {
        invoiceTotal: invoice.totalAmount,
        amountPaid: invoice.amountPaid,
        amountRefunded: invoice.amountRefunded,
      },
      observedValues: { amount: paymentAmount },
    })
    await markGatewayEvent({
      id: gatewayEvent.id,
      status: 'failed',
      now,
      lastError: reason,
      nextAttemptAt: now,
    })
    return 'failed'
  }

  await db.transaction(async tx => {
    const metadata = {
      source: 'billing_gateway_webhook',
      gatewayEventId: gatewayEvent.id,
      providerEventId: gatewayEvent.providerEventId,
      payloadHash: gatewayEvent.payloadHash,
    }
    const [payment] = await tx
      .insert(storeBillingPaymentsTable)
      .values({
        storeId: invoice.storeId,
        invoiceId: invoice.id,
        status: 'confirmed',
        method: 'external',
        amount: paymentAmount,
        currency: invoice.currency,
        provider: gatewayEvent.provider,
        providerPaymentId: gatewayEvent.providerPaymentId,
        confirmationKey,
        paidAt,
        metadata,
        updatedAt: now,
      })
      .onConflictDoNothing({
        target: storeBillingPaymentsTable.confirmationKey,
        where: sql`${storeBillingPaymentsTable.confirmationKey} is not null`,
      })
      .returning()

    if (!payment) throw new Error('PAYMENT_CONFIRMATION_CONFLICT')

    const [updatedInvoice] = await tx
      .update(storeBillingInvoicesTable)
      .set({
        status: reconciliation.nextStatus,
        amountPaid: reconciliation.nextAmountPaid,
        paidAt: reconciliation.nextPaidAt,
        metadata: {
          ...(invoice.metadata as Record<string, unknown>),
          lastGatewayPaymentEventId: gatewayEvent.id,
        },
        updatedAt: now,
      })
      .where(eq(storeBillingInvoicesTable.id, invoice.id))
      .returning()

    await tx.insert(storeBillingEventsTable).values({
      storeId: invoice.storeId,
      subscriptionId: invoice.subscriptionId,
      invoiceId: invoice.id,
      paymentId: payment.id,
      eventType: 'payment_confirmed',
      actorClerkId: null,
      actorEmail: SYSTEM_ACTOR_EMAIL,
      reason: 'Pagamento confirmado por webhook do gateway.',
      previousValues: {
        status: invoice.status,
        amountPaid: invoice.amountPaid,
        paidAt: invoice.paidAt?.toISOString() ?? null,
      },
      newValues: {
        status: updatedInvoice.status,
        amountPaid: updatedInvoice.amountPaid,
        paidAt: updatedInvoice.paidAt?.toISOString() ?? null,
      },
      metadata,
    })

    const [activeBillingBlock] = await tx
      .select()
      .from(storeAccessBlocksTable)
      .where(
        and(
          eq(storeAccessBlocksTable.storeId, invoice.storeId),
          eq(storeAccessBlocksTable.source, 'billing_delinquency'),
          eq(storeAccessBlocksTable.invoiceId, invoice.id),
          sql`${storeAccessBlocksTable.unblockedAt} is null`
        )
      )
      .orderBy(desc(storeAccessBlocksTable.blockedAt))
      .limit(1)

    if (activeBillingBlock && updatedInvoice.status === 'paid') {
      const unblockReason = `Desbloqueio automatico por webhook de pagamento confirmado da fatura ${invoice.invoiceNumber}.`

      await tx
        .update(storeAccessBlocksTable)
        .set({
          unblockedAt: now,
          unblockedByClerkId: 'billing_gateway',
          unblockedByEmail: SYSTEM_ACTOR_EMAIL,
          unblockedByName: 'Gateway de pagamento',
          unblockReason,
          updatedAt: now,
        })
        .where(eq(storeAccessBlocksTable.id, activeBillingBlock.id))

      await tx.insert(storeBillingEventsTable).values({
        storeId: invoice.storeId,
        subscriptionId: invoice.subscriptionId,
        invoiceId: invoice.id,
        paymentId: payment.id,
        eventType: 'billing_access_unblocked',
        actorClerkId: 'billing_gateway',
        actorEmail: SYSTEM_ACTOR_EMAIL,
        reason: unblockReason,
        previousValues: { accessBlockId: activeBillingBlock.id },
        newValues: { unblockedAt: now.toISOString() },
        metadata,
      })
    }

    await tx
      .update(storeBillingGatewayEventsTable)
      .set({
        status: 'processed',
        paymentId: payment.id,
        lastError: null,
        nextAttemptAt: now,
        processedAt: now,
        updatedAt: now,
      })
      .where(eq(storeBillingGatewayEventsTable.id, gatewayEvent.id))
  })

  return 'processed'
}

async function processFailedOrCancelledPayment({
  gatewayEvent,
  invoice,
  now,
}: {
  gatewayEvent: typeof storeBillingGatewayEventsTable.$inferSelect
  invoice: SelectStoreBillingInvoice
  now: Date
}): Promise<Exclude<BillingGatewayProcessingStatus, 'ignored'>> {
  await db.transaction(async tx => {
    let paymentId: number | null = null
    if (gatewayEvent.providerPaymentId && gatewayEvent.amount) {
      const [payment] = await tx
        .insert(storeBillingPaymentsTable)
        .values({
          storeId: invoice.storeId,
          invoiceId: invoice.id,
          status:
            gatewayEvent.eventType === 'payment_cancelled'
              ? 'cancelled'
              : 'failed',
          method: 'external',
          amount: gatewayEvent.amount,
          currency: invoice.currency,
          provider: gatewayEvent.provider,
          providerPaymentId: gatewayEvent.providerPaymentId,
          confirmationKey: null,
          failedAt:
            gatewayEvent.eventType === 'payment_failed'
              ? (gatewayEvent.occurredAt ?? now)
              : null,
          metadata: {
            source: 'billing_gateway_webhook',
            gatewayEventId: gatewayEvent.id,
            providerEventId: gatewayEvent.providerEventId,
          },
          updatedAt: now,
        })
        .onConflictDoNothing({
          target: [
            storeBillingPaymentsTable.provider,
            storeBillingPaymentsTable.providerPaymentId,
          ],
          where: sql`${storeBillingPaymentsTable.providerPaymentId} is not null`,
        })
        .returning()

      paymentId = payment?.id ?? null
    }

    await tx.insert(storeBillingEventsTable).values({
      storeId: invoice.storeId,
      subscriptionId: invoice.subscriptionId,
      invoiceId: invoice.id,
      paymentId,
      eventType:
        gatewayEvent.eventType === 'payment_cancelled'
          ? 'payment_cancelled'
          : 'payment_failed',
      actorClerkId: null,
      actorEmail: SYSTEM_ACTOR_EMAIL,
      reason:
        gatewayEvent.eventType === 'payment_cancelled'
          ? 'Pagamento cancelado pelo gateway.'
          : 'Pagamento recusado ou falhou no gateway.',
      previousValues: null,
      newValues: {
        provider: gatewayEvent.provider,
        providerPaymentId: gatewayEvent.providerPaymentId,
      },
      metadata: { gatewayEventId: gatewayEvent.id },
    })

    await tx
      .update(storeBillingGatewayEventsTable)
      .set({
        status: 'processed',
        paymentId,
        lastError: null,
        nextAttemptAt: now,
        processedAt: now,
        updatedAt: now,
      })
      .where(eq(storeBillingGatewayEventsTable.id, gatewayEvent.id))
  })

  return 'processed'
}

async function processRefundPayment({
  gatewayEvent,
  invoice,
  now,
}: {
  gatewayEvent: typeof storeBillingGatewayEventsTable.$inferSelect
  invoice: SelectStoreBillingInvoice
  now: Date
}): Promise<Exclude<BillingGatewayProcessingStatus, 'ignored'>> {
  const refundAmount = toMoneyNumber(gatewayEvent.amount)
  const refundableAmount =
    toMoneyNumber(invoice.amountPaid) - toMoneyNumber(invoice.amountRefunded)

  if (refundAmount <= 0 || refundAmount > refundableAmount) {
    await insertReconciliationIssue({
      storeId: invoice.storeId,
      invoiceId: invoice.id,
      gatewayEventId: gatewayEvent.id,
      provider: gatewayEvent.provider,
      providerEventId: gatewayEvent.providerEventId,
      issueType: 'refund_exceeds_paid',
      severity: 'critical',
      reason: 'Estorno recebido nao cabe no valor pago da fatura.',
      expectedValues: { refundableAmount: formatMoney(refundableAmount) },
      observedValues: { refundAmount: gatewayEvent.amount },
    })
    await markGatewayEvent({
      id: gatewayEvent.id,
      status: 'failed',
      now,
      lastError: 'refund_exceeds_paid',
      nextAttemptAt: now,
    })
    return 'failed'
  }

  await db.transaction(async tx => {
    const [payment] = gatewayEvent.providerPaymentId
      ? await tx
          .select()
          .from(storeBillingPaymentsTable)
          .where(
            and(
              eq(storeBillingPaymentsTable.provider, gatewayEvent.provider),
              eq(
                storeBillingPaymentsTable.providerPaymentId,
                gatewayEvent.providerPaymentId
              )
            )
          )
          .limit(1)
      : []

    const nextAmountRefunded = formatMoney(
      toMoneyNumber(invoice.amountRefunded) + refundAmount
    )
    const fullyRefunded =
      toMoneyNumber(nextAmountRefunded) >= toMoneyNumber(invoice.amountPaid)

    const [updatedInvoice] = await tx
      .update(storeBillingInvoicesTable)
      .set({
        status: fullyRefunded ? 'refunded' : invoice.status,
        amountRefunded: nextAmountRefunded,
        refundedAt: fullyRefunded ? (gatewayEvent.occurredAt ?? now) : null,
        metadata: {
          ...(invoice.metadata as Record<string, unknown>),
          lastGatewayRefundEventId: gatewayEvent.id,
        },
        updatedAt: now,
      })
      .where(eq(storeBillingInvoicesTable.id, invoice.id))
      .returning()

    if (payment) {
      await tx
        .update(storeBillingPaymentsTable)
        .set({
          status: 'refunded',
          refundedAt: gatewayEvent.occurredAt ?? now,
          updatedAt: now,
        })
        .where(eq(storeBillingPaymentsTable.id, payment.id))
    }

    await tx.insert(storeBillingEventsTable).values({
      storeId: invoice.storeId,
      subscriptionId: invoice.subscriptionId,
      invoiceId: invoice.id,
      paymentId: payment?.id ?? null,
      eventType: 'refund_registered',
      actorClerkId: null,
      actorEmail: SYSTEM_ACTOR_EMAIL,
      reason: 'Estorno registrado por webhook do gateway.',
      previousValues: {
        status: invoice.status,
        amountRefunded: invoice.amountRefunded,
      },
      newValues: {
        status: updatedInvoice.status,
        amountRefunded: updatedInvoice.amountRefunded,
      },
      metadata: { gatewayEventId: gatewayEvent.id },
    })

    await tx
      .update(storeBillingGatewayEventsTable)
      .set({
        status: 'processed',
        paymentId: payment?.id ?? null,
        lastError: null,
        nextAttemptAt: now,
        processedAt: now,
        updatedAt: now,
      })
      .where(eq(storeBillingGatewayEventsTable.id, gatewayEvent.id))
  })

  return 'processed'
}

async function processGatewayEvent(
  gatewayEvent: typeof storeBillingGatewayEventsTable.$inferSelect
) {
  const now = new Date()
  const invoice = gatewayEvent.invoiceId
    ? (
        await db
          .select()
          .from(storeBillingInvoicesTable)
          .where(eq(storeBillingInvoicesTable.id, gatewayEvent.invoiceId))
          .limit(1)
      )[0]
    : gatewayEvent.invoiceNumber
      ? (
          await db
            .select()
            .from(storeBillingInvoicesTable)
            .where(
              eq(
                storeBillingInvoicesTable.invoiceNumber,
                gatewayEvent.invoiceNumber
              )
            )
            .limit(1)
        )[0]
      : null

  if (!invoice) {
    await insertReconciliationIssue({
      gatewayEventId: gatewayEvent.id,
      provider: gatewayEvent.provider,
      providerEventId: gatewayEvent.providerEventId,
      issueType: 'invoice_not_found',
      severity: 'critical',
      reason: 'Evento do gateway nao encontrou fatura correspondente.',
      observedValues: {
        invoiceId: gatewayEvent.invoiceId,
        invoiceNumber: gatewayEvent.invoiceNumber,
      },
    })
    await markGatewayEvent({
      id: gatewayEvent.id,
      status: 'failed',
      now,
      lastError: 'invoice_not_found',
      nextAttemptAt: getRetryDate({
        now,
        attempts: gatewayEvent.attempts + 1,
      }),
    })
    return 'failed' as const
  }

  const decision = resolveBillingGatewayEventProcessing({
    invoiceStatus: invoice.status,
    eventType: gatewayEvent.eventType,
  })

  if (decision.action === 'ignore') {
    await insertReconciliationIssue({
      storeId: invoice.storeId,
      invoiceId: invoice.id,
      gatewayEventId: gatewayEvent.id,
      provider: gatewayEvent.provider,
      providerEventId: gatewayEvent.providerEventId,
      issueType: decision.issueType,
      severity: decision.issueType === 'unsupported_event' ? 'info' : 'warning',
      reason: decision.reason,
      observedValues: {
        invoiceStatus: invoice.status,
        eventType: gatewayEvent.eventType,
      },
    })
    await markGatewayEvent({
      id: gatewayEvent.id,
      status: 'ignored',
      now,
      lastError: decision.reason,
    })
    return 'ignored' as const
  }

  if (gatewayEvent.eventType === 'payment_succeeded') {
    return await processSucceededPayment({ gatewayEvent, invoice, now })
  } else if (
    gatewayEvent.eventType === 'payment_failed' ||
    gatewayEvent.eventType === 'payment_cancelled'
  ) {
    return await processFailedOrCancelledPayment({ gatewayEvent, invoice, now })
  } else if (gatewayEvent.eventType === 'payment_refunded') {
    return await processRefundPayment({ gatewayEvent, invoice, now })
  }

  return 'processed' as const
}

export async function processBillingGatewayWebhookQueue({
  limit,
}: {
  limit?: number
} = {}): Promise<BillingGatewayQueueResult> {
  const now = new Date()
  const events = await db
    .select()
    .from(storeBillingGatewayEventsTable)
    .where(
      and(
        inArray(storeBillingGatewayEventsTable.status, ['queued', 'failed']),
        lte(storeBillingGatewayEventsTable.nextAttemptAt, now)
      )
    )
    .orderBy(
      asc(storeBillingGatewayEventsTable.nextAttemptAt),
      asc(storeBillingGatewayEventsTable.id)
    )
    .limit(normalizeLimit(limit))

  const result: BillingGatewayQueueResult = {
    processed: 0,
    failed: 0,
    ignored: 0,
  }

  for (const event of events) {
    await db
      .update(storeBillingGatewayEventsTable)
      .set({
        status: 'processing',
        attempts: event.attempts + 1,
        updatedAt: now,
      })
      .where(eq(storeBillingGatewayEventsTable.id, event.id))

    try {
      const status = await processGatewayEvent({
        ...event,
        attempts: event.attempts + 1,
      })
      result[status] += 1
    } catch (error) {
      result.failed += 1
      await markGatewayEvent({
        id: event.id,
        status: 'failed',
        now: new Date(),
        lastError: toFailureMessage(error),
        nextAttemptAt: getRetryDate({
          now: new Date(),
          attempts: event.attempts + 1,
        }),
      })
      await insertReconciliationIssue({
        storeId: event.storeId,
        invoiceId: event.invoiceId,
        paymentId: event.paymentId,
        gatewayEventId: event.id,
        provider: event.provider,
        providerEventId: event.providerEventId,
        issueType: 'processing_error',
        severity: 'critical',
        reason: toFailureMessage(error),
      })
    }
  }

  return result
}

export async function runBillingGatewayReconciliationCycle({
  limit,
}: {
  limit?: number
} = {}) {
  const events = await db
    .select()
    .from(storeBillingGatewayEventsTable)
    .where(
      and(
        eq(storeBillingGatewayEventsTable.status, 'processed'),
        isNotNull(storeBillingGatewayEventsTable.invoiceId)
      )
    )
    .orderBy(desc(storeBillingGatewayEventsTable.processedAt))
    .limit(normalizeLimit(limit))

  let checked = 0
  let divergences = 0

  for (const event of events) {
    const [invoice] = await db
      .select()
      .from(storeBillingInvoicesTable)
      .where(eq(storeBillingInvoicesTable.id, event.invoiceId as number))
      .limit(1)

    if (!invoice) continue

    const payments = await db
      .select()
      .from(storeBillingPaymentsTable)
      .where(eq(storeBillingPaymentsTable.invoiceId, invoice.id))

    checked += 1
    const confirmedTotal = payments
      .filter(payment => payment.status === 'confirmed')
      .reduce((total, payment) => total + toMoneyNumber(payment.amount), 0)
    const refundedTotal = payments
      .filter(payment => payment.status === 'refunded')
      .reduce((total, payment) => total + toMoneyNumber(payment.amount), 0)

    if (
      formatMoney(confirmedTotal) !==
        formatMoney(toMoneyNumber(invoice.amountPaid)) ||
      formatMoney(refundedTotal) !==
        formatMoney(toMoneyNumber(invoice.amountRefunded))
    ) {
      divergences += 1
      await insertReconciliationIssue({
        storeId: invoice.storeId,
        invoiceId: invoice.id,
        gatewayEventId: event.id,
        provider: event.provider,
        providerEventId: event.providerEventId,
        issueType: 'invoice_payment_total_mismatch',
        severity: 'critical',
        reason: 'Soma dos pagamentos difere dos totais salvos na fatura.',
        expectedValues: {
          invoiceAmountPaid: invoice.amountPaid,
          invoiceAmountRefunded: invoice.amountRefunded,
        },
        observedValues: {
          confirmedPaymentsTotal: formatMoney(confirmedTotal),
          refundedPaymentsTotal: formatMoney(refundedTotal),
        },
      })
    }
  }

  return { checked, divergences }
}
