import { describe, expect, test } from 'bun:test'

import {
  buildContactIngestionMetadata,
  buildWhatsappGreeting,
  detectPromotionalOptOut,
  extractPermittedContactData,
  normalizeWhatsappPhoneNumber,
  parseEvolutionInboundMessagePayload,
} from './contact-ingestion-policy'

describe('whatsapp contact ingestion policy', () => {
  test('normalizes WhatsApp JIDs to one canonical phone number', () => {
    expect(normalizeWhatsappPhoneNumber('5511999999999@s.whatsapp.net')).toBe(
      '+5511999999999'
    )
    expect(normalizeWhatsappPhoneNumber('+55 (11) 99999-9999')).toBe(
      '+5511999999999'
    )
    expect(normalizeWhatsappPhoneNumber('5511999999999:12@c.us')).toBe(
      '+5511999999999'
    )
  })

  test('rejects phone values that cannot identify a customer', () => {
    expect(normalizeWhatsappPhoneNumber('abc@s.whatsapp.net')).toBeNull()
    expect(normalizeWhatsappPhoneNumber('123')).toBeNull()
  })

  test('detects promotional opt-out requests with and without accents', () => {
    expect(detectPromotionalOptOut('Pode parar de mandar promocoes')).toBe(true)
    expect(detectPromotionalOptOut('Nao quero receber mensagens')).toBe(true)
    expect(detectPromotionalOptOut('Quero ver a promocao de hoje')).toBe(false)
  })

  test('captures additional contact data only when the store policy allows it', () => {
    const message = 'Meu nome e Marina e meu email e marina@example.com'

    expect(
      extractPermittedContactData({
        message,
        displayName: 'Mari',
        additionalDataAllowed: false,
      })
    ).toBeNull()

    expect(
      extractPermittedContactData({
        message,
        displayName: 'Mari',
        additionalDataAllowed: true,
      })
    ).toEqual({
      email: 'marina@example.com',
      name: 'Marina',
    })
  })

  test('uses the available name when building a greeting', () => {
    expect(
      buildWhatsappGreeting({
        assistantName: 'Lia',
        storeName: 'Ccocobongo',
        displayName: 'Bruno',
      })
    ).toBe('Oi, Bruno! Eu sou Lia, assistente virtual da Ccocobongo.')
  })

  test('parses Evolution inbound text payloads without trusting store data from the provider', () => {
    const parsed = parseEvolutionInboundMessagePayload({
      event: 'messages.upsert',
      instance: 'clica-store-9-wa-2',
      data: {
        key: {
          remoteJid: '5513991840862@s.whatsapp.net',
          id: 'MSG-1',
          fromMe: false,
        },
        pushName: 'Bruno',
        message: {
          conversation: 'Oi, tem cupom?',
        },
        messageTimestamp: 1_754_000_000,
        metadata: {
          allowContactDataCapture: true,
        },
      },
    })

    expect(parsed).toEqual({
      senderPhone: '5513991840862@s.whatsapp.net',
      displayName: 'Bruno',
      providerMessageId: 'MSG-1',
      body: 'Oi, tem cupom?',
      messageType: 'text',
      occurredAt: new Date(1_754_000_000 * 1000),
      additionalDataAllowed: true,
    })
  })

  test('ignores outbound messages from the connected store number', () => {
    expect(
      parseEvolutionInboundMessagePayload({
        event: 'messages.upsert',
        data: {
          key: {
            remoteJid: '5513991840862@s.whatsapp.net',
            fromMe: true,
          },
          message: { conversation: 'Mensagem enviada pela loja' },
        },
      })
    ).toBeNull()
  })

  test('marks first-contact metadata separately from later messages', () => {
    const first = buildContactIngestionMetadata({
      body: 'parar',
      displayName: 'Cliente',
      providerMessageId: 'MSG-2',
      messageType: 'text',
      occurredAt: new Date('2026-09-05T12:00:00.000Z'),
      additionalDataAllowed: true,
      isFirstContact: true,
    })

    const next = buildContactIngestionMetadata({
      body: 'voltei',
      displayName: null,
      providerMessageId: 'MSG-3',
      messageType: 'text',
      occurredAt: new Date('2026-09-05T12:05:00.000Z'),
      additionalDataAllowed: false,
      isFirstContact: false,
    })

    expect(first.firstMessageAt).toBe('2026-09-05T12:00:00.000Z')
    expect(first.promotionalOptOut?.requestedAt).toBe(
      '2026-09-05T12:00:00.000Z'
    )
    expect(next.firstMessageAt).toBeUndefined()
  })
})
