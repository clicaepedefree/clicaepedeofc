import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  whatsappBotAssistantConfigStatuses,
  whatsappBotContactSources,
  whatsappBotConversationModes,
  whatsappBotDeliveryAttemptStatuses,
  whatsappBotMessageStatuses,
  whatsappBotNumberStatuses,
  whatsappBotSessionStatuses,
  whatsappBotTransactionalEventStatuses,
  whatsappBotTransactionalEventTypes,
} from '@/services/db/schema'

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260901014743_kan81_whatsapp_bot_domain.sql'
  ),
  'utf8'
)

const documentation = readFileSync(
  join(process.cwd(), 'docs/kan81-whatsapp-bot-domain.md'),
  'utf8'
)

describe('whatsapp bot domain schema', () => {
  test('defines the core multi-store entities for KAN-81', () => {
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS "whatsapp_bot_numbers"'
    )
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS "whatsapp_bot_sessions"'
    )
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS "whatsapp_bot_assistant_configs"'
    )
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS "whatsapp_bot_contacts"'
    )
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS "whatsapp_bot_conversations"'
    )
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS "whatsapp_bot_messages"'
    )
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS "whatsapp_bot_transactional_events"'
    )
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS "whatsapp_bot_delivery_attempts"'
    )
  })

  test('keeps store boundaries enforced by composite foreign keys', () => {
    expect(migration).toContain('"whatsapp_bot_sessions_number_store_fk"')
    expect(migration).toContain('"whatsapp_bot_conversations_contact_store_fk"')
    expect(migration).toContain('"whatsapp_bot_conversations_session_store_fk"')
    expect(migration).toContain('"whatsapp_bot_messages_conversation_store_fk"')
    expect(migration).toContain(
      '"whatsapp_bot_transactional_events_order_store_fk"'
    )
    expect(migration).toContain(
      '"whatsapp_bot_delivery_attempts_event_store_fk"'
    )
  })

  test('allows the same phone in different stores but blocks duplicates per store', () => {
    expect(migration).toContain('"whatsapp_bot_contacts_store_phone_unique"')
    expect(migration).toContain('UNIQUE ("store_id", "phone_number")')
  })

  test('covers status and lookup indexes required by the checklist', () => {
    expect(migration).toContain('"whatsapp_bot_sessions_store_status_idx"')
    expect(migration).toContain(
      '"whatsapp_bot_contacts_store_last_contact_idx"'
    )
    expect(migration).toContain('"whatsapp_bot_conversations_store_status_idx"')
    expect(migration).toContain('"whatsapp_bot_messages_status_idx"')
    expect(migration).toContain(
      '"whatsapp_bot_transactional_events_store_status_idx"'
    )
    expect(migration).toContain(
      '"whatsapp_bot_delivery_attempts_store_status_idx"'
    )
  })

  test('documents the safe rollback strategy for the new domain tables', () => {
    expect(documentation).toContain('Estrategia de reversao')
    expect(documentation).toContain('ordem inversa de dependencia')
    expect(documentation).toContain('reversao deve ser logica')
  })

  test('exports Drizzle enums used by future WhatsApp bot tasks', () => {
    expect(whatsappBotNumberStatuses).toContain('active')
    expect(whatsappBotSessionStatuses).toContain('pending_qr')
    expect(whatsappBotAssistantConfigStatuses).toContain('active')
    expect(whatsappBotContactSources).toContain('whatsapp')
    expect(whatsappBotConversationModes).toContain('human')
    expect(whatsappBotMessageStatuses).toContain('delivered')
    expect(whatsappBotTransactionalEventTypes).toContain('order_status')
    expect(whatsappBotTransactionalEventStatuses).toContain('queued')
    expect(whatsappBotDeliveryAttemptStatuses).toContain('failed')
  })
})
