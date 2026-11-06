import 'server-only'
import { randomUUID } from 'node:crypto'
import { and, eq, inArray, lt, or, sql } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { db } from '@/services/db'
import {
  whatsappBotContactsTable as contacts,
  whatsappBotConversationsTable as conversations,
  whatsappBotDeliveryAttemptsTable as attempts,
  whatsappBotMessagesTable as messages,
  whatsappBotSessionsTable as sessions,
  whatsappBotTransactionalEventsTable as events,
  whatsappRetentionRunsTable as runs,
  digitalMenuAttributionAccessesTable as attributionAccesses,
} from '@/services/db/schema'
import {
  getWhatsappRetentionCutoffs,
  WHATSAPP_BOT_RETENTION_POLICY,
} from './security-lgpd-policy'
import {
  emptyRetentionCounts,
  retentionScope,
  retentionUuid,
  type RetentionCounts,
} from './retention-policy'

type Run = typeof runs.$inferSelect
export type RetentionOptions = {
  now?: Date
  storeIds?: number[]
  runId?: string
  correlationId?: string
  database?: Pick<typeof db, 'insert' | 'select' | 'transaction'>
}
const failed = () =>
  new Error('WhatsApp retention failed; inspect the private execution audit')

function completed(row: Run): RetentionCounts {
  if (row.status === 'failed') throw failed()
  if (row.status === 'running' || !row.counts)
    throw new Error('Retention outcome is not confirmed')
  return { ...emptyRetentionCounts(), ...(row.counts as RetentionCounts) }
}

/** No network, human actor or raw error metadata; audit and deletion share a commit. */
export async function pruneWhatsappBotRetainedHistory(
  options: RetentionOptions = {}
): Promise<RetentionCounts> {
  const database = options.database ?? db
  const runId = retentionUuid(options.runId ?? randomUUID())
  const correlationId = retentionUuid(options.correlationId ?? runId)
  const storeIds = retentionScope(options.storeIds)
  const now = options.now ?? new Date()
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid retention time')
  // Durable intent precedes cleanup. A crash cannot silently appear as success.
  await database
    .insert(runs)
    .values({
      id: runId,
      correlationId,
      storeIds,
      actorId: 'system:whatsapp-retention',
      jobName: 'whatsapp-transactional-retention',
      policyVersion: '2026-11-04.v2',
      effectiveAt: now,
      policySnapshot: { ...WHATSAPP_BOT_RETENTION_POLICY },
    })
    .onConflictDoNothing()
  const [original] = await database
    .select()
    .from(runs)
    .where(eq(runs.id, runId))
  if (
    !original ||
    original.correlationId !== correlationId ||
    JSON.stringify(original.storeIds) !== JSON.stringify(storeIds) ||
    (options.now && original.effectiveAt.getTime() !== now.getTime())
  )
    throw new Error('Retention execution context mismatch')

  if (original.status !== 'running') return completed(original)
  try {
    return await database.transaction(async tx => {
      await tx.execute(sql`set local lock_timeout = '10s'`)
      await tx.execute(sql`set local statement_timeout = '30s'`)
      // All scopes can overlap. One transaction lock also works through the shared pooler.
      await tx.execute(sql`select pg_advisory_xact_lock(154, 1)`)
      const [current] = await tx
        .select()
        .from(runs)
        .where(eq(runs.id, runId))
        .for('update')
      if (current.status !== 'running') return completed(current)
      const at = current.effectiveAt
      const cutoffs = getWhatsappRetentionCutoffs(at)
      const scope = (column: AnyPgColumn) =>
        storeIds === null ? undefined : inArray(column, storeIds)
      const counts = emptyRetentionCounts()
      if (storeIds === null || storeIds.length > 0) {
        // FK inserts take KEY SHARE. Lock candidate parents before a fresh
        // DELETE snapshot, and never delete an ID outside those locked sets.
        const contactIds = (
          await tx
            .select({ id: contacts.id })
            .from(contacts)
            .where(
              and(
                scope(contacts.storeId),
                lt(contacts.lastContactAt, cutoffs.inactiveContactBefore),
                sql`${contacts.promotionalOptOutAt} is null`
              )
            )
            .orderBy(contacts.id)
            .for('update')
        ).map(row => row.id)
        const conversationIds = (
          await tx
            .select({ id: conversations.id })
            .from(conversations)
            .where(
              and(
                scope(conversations.storeId),
                inArray(conversations.status, ['closed', 'blocked']),
                lt(conversations.updatedAt, cutoffs.closedConversationBefore)
              )
            )
            .orderBy(conversations.id)
            .for('update')
        ).map(row => row.id)
        const eventIds = (
          await tx
            .select({ id: events.id })
            .from(events)
            .where(
              and(
                scope(events.storeId),
                inArray(events.status, ['sent', 'discarded']),
                or(
                  lt(events.updatedAt, cutoffs.transactionalEventBefore),
                  sql`exists (select 1 from ${attempts}
              where ${attempts.eventId}=${events.id} and ${attempts.storeId}=${events.storeId}
              and ${lt(attempts.attemptedAt, cutoffs.deliveryAttemptBefore)})`
                )
              )
            )
            .orderBy(events.id)
            .for('update')
        ).map(row => row.id)
        counts.expiredQrSessions = (
          await tx
            .update(sessions)
            .set({
              qrCodeExpiresAt: null,
              metadata: sql`${sessions.metadata} - 'qrCode'`,
              updatedAt: at,
            })
            .where(
              and(
                scope(sessions.storeId),
                lt(sessions.qrCodeExpiresAt, cutoffs.expiredQrCodeBefore),
                sql`${sessions.status} <> 'connected'`
              )
            )
            .returning({ id: sessions.id })
        ).length
        counts.deletedDeliveryAttempts = (
          await tx
            .delete(attempts)
            .where(
              and(
                scope(attempts.storeId),
                lt(attempts.attemptedAt, cutoffs.deliveryAttemptBefore),
                inArray(attempts.eventId, eventIds),
                sql`exists (select 1 from ${events}
            where ${events.id}=${attempts.eventId} and ${events.storeId}=${attempts.storeId}
            and ${events.status} in ('sent','discarded'))`
              )
            )
            .returning({ id: attempts.id })
        ).length
        counts.deletedTransactionalEvents = (
          await tx
            .delete(events)
            .where(
              and(
                scope(events.storeId),
                inArray(events.status, ['sent', 'discarded']),
                lt(events.updatedAt, cutoffs.transactionalEventBefore),
                inArray(events.id, eventIds),
                sql`not exists (select 1 from ${attempts} where ${attempts.eventId}=${events.id} and ${attempts.storeId}=${events.storeId})`
              )
            )
            .returning({ id: events.id })
        ).length
        counts.deletedAttributionAccesses = (
          await tx
            .delete(attributionAccesses)
            .where(
              and(
                scope(attributionAccesses.storeId),
                lt(
                  attributionAccesses.createdAt,
                  new Date(
                    at.getTime() -
                      WHATSAPP_BOT_RETENTION_POLICY.digitalMenuAttributionDays *
                        86400_000
                  )
                )
              )
            )
            .returning({ id: attributionAccesses.id })
        ).length
        counts.deletedMessages = (
          await tx
            .delete(messages)
            .where(
              and(
                scope(messages.storeId),
                lt(messages.occurredAt, cutoffs.openConversationBefore),
                sql`${messages.status} <> 'queued'`
              )
            )
            .returning({ id: messages.id })
        ).length
        counts.deletedConversations = (
          await tx
            .delete(conversations)
            .where(
              and(
                scope(conversations.storeId),
                inArray(conversations.status, ['closed', 'blocked']),
                lt(conversations.updatedAt, cutoffs.closedConversationBefore),
                inArray(conversations.id, conversationIds),
                sql`not exists (select 1 from ${messages} where ${messages.conversationId}=${conversations.id} and ${messages.storeId}=${conversations.storeId})`,
                sql`not exists (select 1 from ${events} where ${events.conversationId}=${conversations.id} and ${events.storeId}=${conversations.storeId})`
              )
            )
            .returning({ id: conversations.id })
        ).length
        counts.deletedContacts = (
          await tx
            .delete(contacts)
            .where(
              and(
                scope(contacts.storeId),
                lt(contacts.lastContactAt, cutoffs.inactiveContactBefore),
                inArray(contacts.id, contactIds),
                sql`${contacts.promotionalOptOutAt} is null`,
                sql`not exists (select 1 from ${conversations} where ${conversations.contactId}=${contacts.id} and ${conversations.storeId}=${contacts.storeId})`,
                sql`not exists (select 1 from ${events} where ${events.contactId}=${contacts.id} and ${events.storeId}=${contacts.storeId})`,
                sql`not exists (select 1 from ${messages} where ${messages.contactId}=${contacts.id} and ${messages.storeId}=${contacts.storeId})`
              )
            )
            .returning({ id: contacts.id })
        ).length
      }
      await tx
        .update(runs)
        .set({
          status: Object.values(counts).some(Boolean) ? 'succeeded' : 'noop',
          counts,
          finishedAt: sql`clock_timestamp()`,
        })
        .where(and(eq(runs.id, runId), eq(runs.status, 'running')))
      return counts
    })
  } catch {
    // Re-read under the same lock: a lost commit ACK may already be a confirmed
    // success. Never overwrite that result with a misleading failure record.
    const outcome = await database
      .transaction(async tx => {
        await tx.execute(sql`set local lock_timeout = '10s'`)
        await tx.execute(sql`set local statement_timeout = '30s'`)
        await tx.execute(sql`select pg_advisory_xact_lock(154, 1)`)
        const [current] = await tx
          .select()
          .from(runs)
          .where(eq(runs.id, runId))
          .for('update')
        if (current.status !== 'running') return current
        const [result] = await tx
          .update(runs)
          .set({
            status: 'failed',
            counts: emptyRetentionCounts(),
            errorCode: 'prune_failed',
            finishedAt: sql`clock_timestamp()`,
          })
          .where(and(eq(runs.id, runId), eq(runs.status, 'running')))
          .returning()
        return result
      })
      .catch(() => null)
    if (outcome && outcome.status !== 'running' && outcome.status !== 'failed')
      return completed(outcome)
    // If even the recovery audit is unavailable, leave intent unresolved and
    // stop the worker; no raw SQL/PII or fabricated success is emitted.
    throw failed()
  }
}
