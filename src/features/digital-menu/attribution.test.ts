import { describe, expect, test } from 'bun:test'

import {
  normalizeDigitalMenuAttribution,
  parseDigitalMenuAttributionSearchParams,
} from './attribution'

const conversationId = '6b9d2c6c-bda3-4b90-aab3-2081d80a23d9'

describe('digital menu attribution', () => {
  test('parses WhatsApp CTA attribution from public menu URL params', () => {
    const params = new URLSearchParams({
      utm_source: 'whatsapp_bot',
      utm_medium: 'assistant',
      utm_campaign: 'digital_menu_cta',
      wa_conversation: conversationId,
      wa_message: 'assistant:inbound-message-id',
    })

    expect(
      parseDigitalMenuAttributionSearchParams(
        params,
        `https://clicaepedeofc.vercel.app/cardapio/ccocobongo?${params}`
      )
    ).toEqual({
      source: 'whatsapp_bot',
      medium: 'assistant',
      campaign: 'digital_menu_cta',
      conversationId,
      messageId: 'assistant:inbound-message-id',
      entryUrl:
        'https://clicaepedeofc.vercel.app/cardapio/ccocobongo?utm_source=whatsapp_bot&utm_medium=assistant&utm_campaign=digital_menu_cta&wa_conversation=6b9d2c6c-bda3-4b90-aab3-2081d80a23d9&wa_message=assistant%3Ainbound-message-id',
    })
  })

  test('rejects attribution that is not from the WhatsApp assistant CTA', () => {
    expect(
      normalizeDigitalMenuAttribution({
        source: 'newsletter',
        medium: 'email',
        campaign: 'digital_menu_cta',
        conversationId,
      })
    ).toBeNull()

    expect(
      normalizeDigitalMenuAttribution({
        source: 'whatsapp_bot',
        medium: 'assistant',
        campaign: 'digital_menu_cta',
        conversationId: 'not-a-uuid',
      })
    ).toBeNull()
  })
})
