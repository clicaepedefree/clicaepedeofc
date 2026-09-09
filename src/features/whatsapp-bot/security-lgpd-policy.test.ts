import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  canSendWhatsappNotificationToContact,
  classifyWhatsappNotificationCategory,
  getWhatsappRetentionCutoffs,
  redactWhatsappSensitiveMetadata,
  whatsappBotLgpdRetentionSummary,
} from './security-lgpd-policy'

const apiSource = readFileSync(
  join(process.cwd(), 'src/features/whatsapp-bot/api.ts'),
  'utf8'
)

const dbSource = readFileSync(
  join(process.cwd(), 'src/features/whatsapp-bot/db.ts'),
  'utf8'
)

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260909024500_kan95_whatsapp_security_lgpd.sql'
  ),
  'utf8'
)

const documentation = readFileSync(
  join(process.cwd(), 'docs/kan95-whatsapp-security-lgpd.md'),
  'utf8'
)

describe('whatsapp bot security and LGPD policy', () => {
  test('blocks promotional notifications for opted-out contacts only', () => {
    expect(
      classifyWhatsappNotificationCategory({
        eventType: 'manual',
        payload: { notificationCategory: 'promotional' },
      })
    ).toBe('promotional')
    expect(
      classifyWhatsappNotificationCategory({
        eventType: 'order_status',
        payload: { notificationCategory: 'transactional' },
      })
    ).toBe('transactional')

    expect(
      canSendWhatsappNotificationToContact({
        category: 'promotional',
        promotionalOptOutAt: new Date('2026-09-09T12:00:00.000Z'),
      })
    ).toBe(false)
    expect(
      canSendWhatsappNotificationToContact({
        category: 'transactional',
        promotionalOptOutAt: new Date('2026-09-09T12:00:00.000Z'),
      })
    ).toBe(true)
  })

  test('redacts sensitive provider metadata recursively', () => {
    const redacted = redactWhatsappSensitiveMetadata({
      token: 'plain-token',
      provider: 'evolution',
      nested: {
        qrCodeBase64: 'qr-base64',
        safeState: 'connected',
        authorizationHeader: 'Bearer secret',
      },
    })

    expect(redacted).toEqual({
      token: '[redacted]',
      provider: 'evolution',
      nested: {
        qrCodeBase64: '[redacted]',
        safeState: 'connected',
        authorizationHeader: '[redacted]',
      },
    })
  })

  test('defines deterministic retention windows and documents the policy', () => {
    const cutoffs = getWhatsappRetentionCutoffs(
      new Date('2026-09-09T12:00:00.000Z')
    )

    expect(cutoffs.closedConversationBefore.toISOString()).toBe(
      '2026-08-10T12:00:00.000Z'
    )
    expect(cutoffs.expiredQrCodeBefore.toISOString()).toBe(
      '2026-09-09T11:45:00.000Z'
    )
    expect(whatsappBotLgpdRetentionSummary.join('\n')).toContain('Opt-out')
    expect(documentation).toContain('Retencao')
    expect(documentation).toContain('Opt-out')
  })

  test('keeps store actions authorized and auditable', () => {
    for (const actionName of [
      'startWhatsappConnection',
      'renewWhatsappConnectionQrCode',
      'pauseWhatsappConnection',
      'disconnectWhatsappConnection',
      'saveWhatsappAssistantConfig',
      'returnWhatsappConversationToBot',
      'getWhatsappOperationalDiagnostics',
    ]) {
      expect(apiSource).toContain(`export async function ${actionName}`)
    }

    expect(
      apiSource.match(/validateUserPermissionsForStore/g)?.length ?? 0
    ).toBeGreaterThanOrEqual(9)
    expect(dbSource).toContain('recordWhatsappBotAuditLog')
    expect(dbSource).toContain('pruneWhatsappBotRetainedHistory')
    expect(dbSource).toContain('canSendWhatsappNotificationToContact')
  })

  test('adds database support for whatsapp audit actions without public grants', () => {
    for (const action of [
      'connect_whatsapp_bot',
      'renew_whatsapp_bot_qr',
      'pause_whatsapp_bot',
      'disconnect_whatsapp_bot',
      'update_whatsapp_assistant_config',
      'return_whatsapp_conversation_to_bot',
      'prune_whatsapp_bot_history',
    ]) {
      expect(migration).toContain(`'${action}'`)
    }

    expect(migration).toContain('internal_operation_audit_logs_action_check')
    expect(migration).not.toContain('GRANT SELECT')
  })
})
