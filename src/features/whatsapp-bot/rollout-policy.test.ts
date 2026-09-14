import { describe, expect, test } from 'bun:test'

import {
  canStoreReceiveWhatsappBotReplies,
  canStoreUseWhatsappBotRollout,
  parseWhatsappBotPilotStoreIds,
  parseWhatsappBotRolloutMode,
  resolveWhatsappBotRolloutConfig,
  whatsappBotRolloutModes,
} from './rollout-policy'

const activeConfig = {
  status: 'active',
  testModeEnabled: false,
} as const

const connectedSession = {
  status: 'connected',
} as const

describe('KAN-97 whatsapp bot rollout policy', () => {
  test('defines explicit rollout modes and defaults to current behavior', () => {
    expect(whatsappBotRolloutModes).toEqual(['off', 'pilot', 'all'])
    expect(parseWhatsappBotRolloutMode('off')).toBe('off')
    expect(parseWhatsappBotRolloutMode('pilot')).toBe('pilot')
    expect(parseWhatsappBotRolloutMode('all')).toBe('all')
    expect(parseWhatsappBotRolloutMode('unexpected')).toBe('all')
    expect(parseWhatsappBotRolloutMode(undefined)).toBe('all')
  })

  test('parses pilot store ids from environment safely', () => {
    expect([...parseWhatsappBotPilotStoreIds('9, 10, abc, -1, 0, 11')]).toEqual([
      9,
      10,
      11,
    ])
  })

  test('allows all stores only when rollout is all and the bot is ready', () => {
    expect(
      canStoreReceiveWhatsappBotReplies({
        storeId: 9,
        session: connectedSession,
        assistantConfig: activeConfig,
        rolloutConfig: { mode: 'all', pilotStoreIds: new Set() },
      })
    ).toEqual({ allowed: true, reason: null })
  })

  test('blocks new automated replies when rollout is off', () => {
    expect(
      canStoreReceiveWhatsappBotReplies({
        storeId: 9,
        session: connectedSession,
        assistantConfig: activeConfig,
        rolloutConfig: { mode: 'off', pilotStoreIds: new Set([9]) },
      })
    ).toEqual({ allowed: false, reason: 'rollout_off' })
  })

  test('allows only stores in the pilot group', () => {
    const rolloutConfig = { mode: 'pilot' as const, pilotStoreIds: new Set([9]) }

    expect(
      canStoreReceiveWhatsappBotReplies({
        storeId: 9,
        session: connectedSession,
        assistantConfig: activeConfig,
        rolloutConfig,
      })
    ).toEqual({ allowed: true, reason: null })

    expect(
      canStoreReceiveWhatsappBotReplies({
        storeId: 10,
        session: connectedSession,
        assistantConfig: activeConfig,
        rolloutConfig,
      })
    ).toEqual({ allowed: false, reason: 'store_not_in_pilot' })
  })

  test('reuses the store rollout gate for transactional queue processing', () => {
    const rolloutConfig = { mode: 'pilot' as const, pilotStoreIds: new Set([9]) }

    expect(
      canStoreUseWhatsappBotRollout({ storeId: 9, rolloutConfig })
    ).toEqual({ allowed: true, reason: null })
    expect(
      canStoreUseWhatsappBotRollout({ storeId: 10, rolloutConfig })
    ).toEqual({ allowed: false, reason: 'store_not_in_pilot' })
    expect(
      canStoreUseWhatsappBotRollout({
        storeId: 9,
        rolloutConfig: { mode: 'off', pilotStoreIds: new Set([9]) },
      })
    ).toEqual({ allowed: false, reason: 'rollout_off' })
  })

  test('blocks responses when the session is paused or disconnected', () => {
    for (const status of ['paused', 'disconnected', 'pending_qr'] as const) {
      expect(
        canStoreReceiveWhatsappBotReplies({
          storeId: 9,
          session: { status },
          assistantConfig: activeConfig,
          rolloutConfig: { mode: 'all', pilotStoreIds: new Set() },
        })
      ).toEqual({ allowed: false, reason: 'session_not_connected' })
    }
  })

  test('keeps draft and test-mode assistant configs from answering customers', () => {
    expect(
      canStoreReceiveWhatsappBotReplies({
        storeId: 9,
        session: connectedSession,
        assistantConfig: { status: 'draft', testModeEnabled: false },
        rolloutConfig: { mode: 'all', pilotStoreIds: new Set() },
      })
    ).toEqual({ allowed: false, reason: 'assistant_not_active' })

    expect(
      canStoreReceiveWhatsappBotReplies({
        storeId: 9,
        session: connectedSession,
        assistantConfig: { status: 'active', testModeEnabled: true },
        rolloutConfig: { mode: 'all', pilotStoreIds: new Set() },
      })
    ).toEqual({ allowed: false, reason: 'assistant_not_active' })
  })

  test('resolves environment configuration for QA pilot rollout', () => {
    expect(
      resolveWhatsappBotRolloutConfig({
        WHATSAPP_BOT_ROLLOUT_MODE: 'pilot',
        WHATSAPP_BOT_PILOT_STORE_IDS: '9,10',
      })
    ).toEqual({
      mode: 'pilot',
      pilotStoreIds: new Set([9, 10]),
    })
  })
})
