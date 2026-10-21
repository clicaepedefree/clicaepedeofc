import { describe, expect, mock, test } from 'bun:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import {
  whatsappBotContactsTable as contacts,
  whatsappBotConversationsTable as conversations,
  whatsappBotMessagesTable as messages,
  whatsappBotSessionsTable as sessions,
} from '@/services/db/schema'

const mockDb = {}
mock.module('@/services/db', () => ({ db: mockDb }))
const { processWhatsappInboundMessage } = await import('./db')
const dialect = new PgDialect()
const latest = new Date('2026-10-20T15:00:00Z')
const contact = {
  id: 7,
  storeId: 9,
  displayName: 'Current',
  lastContactAt: latest,
}
const conversation = {
  id: 'conversation',
  storeId: 9,
  contactId: 7,
  lastMessageAt: latest,
}

function fixture(duplicate: boolean) {
  const writes: {
    table: unknown
    values: Record<string, unknown>
    conflict?: { set: Record<string, unknown> }
  }[] = []
  const predicates: {
    table: unknown
    query: ReturnType<PgDialect['sqlToQuery']>
  }[] = []
  const execute = mock(async (_query: SQL) => [])
  const tx = {
    execute,
    select: () => ({
      from: (table: unknown) => {
        const query = {
          innerJoin: () => query,
          where: (predicate: SQL) => {
            predicates.push({ table, query: dialect.sqlToQuery(predicate) })
            return query
          },
          orderBy: () => query,
          limit: async () => {
            if (table === sessions) return [{ id: 1, storeId: 9, numberId: 1 }]
            if (table === messages)
              return duplicate ? [{ conversationId: conversation.id }] : []
            if (table === contacts) return [contact]
            if (table === conversations)
              return duplicate ? [{ contact, conversation }] : [conversation]
            throw new Error('Unexpected select')
          },
        }
        return query
      },
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        const write = {
          table,
          values,
          conflict: undefined as { set: Record<string, unknown> } | undefined,
        }
        writes.push(write)
        const query = {
          onConflictDoUpdate: (conflict: { set: Record<string, unknown> }) => {
            write.conflict = conflict
            return query
          },
          onConflictDoNothing: () => query,
          returning: async () =>
            table === contacts ? [contact] : [{ id: 'message', ...values }],
        }
        return query
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => {
        writes.push({ table, values })
        return { where: () => ({ returning: async () => [conversation] }) }
      },
    }),
  }
  Object.assign(mockDb, {
    transaction: async (callback: (tx: unknown) => unknown) => callback(tx),
  })
  return { writes, predicates, execute }
}

const input = {
  instanceName: 'instance',
  senderPhone: '+5511900000001',
  displayName: 'New name',
  body: 'Hello',
  providerMessageId: 'provider-id',
}

describe('contact ingestion database contract', () => {
  test('replay returns persisted context without any contact/conversation upsert', async () => {
    const contract = fixture(true)
    const result = await processWhatsappInboundMessage({
      ...input,
      occurredAt: new Date('2026-10-19T12:00:00Z'),
    })
    expect(result).toEqual({
      contact,
      conversation,
      message: null,
      messageCreated: false,
    })
    expect(contract.writes).toEqual([])
    expect(contract.execute).toHaveBeenCalledTimes(1)
    expect(dialect.sqlToQuery(contract.execute.mock.calls[0][0])).toMatchObject(
      {
        sql: 'select pg_advisory_xact_lock(hashtextextended($1, 0))',
        params: ['9:provider-id'],
      }
    )
    expect(
      contract.predicates.find(item => item.table === messages)?.query
    ).toMatchObject({
      sql: '("whatsapp_bot_messages"."store_id" = $1 and "whatsapp_bot_messages"."provider_message_id" = $2)',
      params: [9, 'provider-id'],
    })
  })

  test.each([
    new Date('2026-10-19T12:00:00Z'),
    new Date('2026-10-21T12:00:00Z'),
  ])(
    'persists legitimate messages with atomic temporal guards: %s',
    async occurredAt => {
      const contract = fixture(false)
      const result = await processWhatsappInboundMessage({
        ...input,
        occurredAt,
      })
      expect(result.messageCreated).toBe(true)
      const write = contract.writes.find(item => item.table === contacts)!
      expect(write.values).toMatchObject({
        displayName: 'New name',
        lastContactAt: occurredAt,
        storeId: 9,
      })
      const set = write.conflict!.set
      const sqlFor = (key: string) => dialect.sqlToQuery(set[key] as SQL).sql
      expect(sqlFor('lastContactAt')).toBe(
        'greatest("whatsapp_bot_contacts"."last_contact_at", excluded.last_contact_at)'
      )
      expect(sqlFor('displayName')).toContain(
        'case when excluded.last_contact_at >= "whatsapp_bot_contacts"."last_contact_at"'
      )
      expect(sqlFor('displayName')).toContain(
        'then coalesce(excluded.display_name, "whatsapp_bot_contacts"."display_name")'
      )
      expect(sqlFor('metadata')).toContain(
        "- 'lastMessageAt' - 'lastMessageType' - 'displayNameSource' - 'capturedData'"
      )
      expect(
        contract.writes.find(item => item.table === messages)?.values
      ).toMatchObject({
        occurredAt,
        providerMessageId: 'provider-id',
        storeId: 9,
      })
      const conversationWrite = contract.writes.find(
        item => item.table === conversations
      )!.values
      const lastMessageQuery = dialect.sqlToQuery(
        conversationWrite.lastMessageAt as SQL
      )
      expect(lastMessageQuery.sql).toContain('greatest(')
      expect(lastMessageQuery.sql).toContain('$1::timestamptz')
      expect(lastMessageQuery.params).toEqual([occurredAt.toISOString()])
      const metadataQuery = dialect.sqlToQuery(
        conversationWrite.metadata as SQL
      )
      expect(metadataQuery.params[0]).toBe(occurredAt.toISOString())
    }
  )

  test('an older legitimate opt-out is still captured without reverting profile time', async () => {
    const contract = fixture(false)
    await processWhatsappInboundMessage({
      ...input,
      body: 'parar',
      occurredAt: new Date('2026-10-19T12:00:00Z'),
    })
    const set = contract.writes.find(item => item.table === contacts)!.conflict!
      .set
    expect(dialect.sqlToQuery(set.promotionalOptOutAt as SQL).sql).toBe(
      'coalesce("whatsapp_bot_contacts"."promotional_opt_out_at", excluded.promotional_opt_out_at)'
    )
    expect(
      contract.writes.find(item => item.table === messages)?.values.metadata
    ).toMatchObject({ optOutRequested: true })
  })
})
