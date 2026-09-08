import { describe, expect, test } from 'bun:test'

import {
  appendWhatsappDigitalMenuCta,
  buildWhatsappDigitalMenuAttributionUrl,
  decideWhatsappDigitalMenuCta,
} from './digital-menu-cta-policy'

const digitalMenuUrl = 'https://clicaepedeofc.vercel.app/cardapio/ccocobongo'

describe('whatsapp digital menu CTA policy', () => {
  test('builds an attributed URL scoped to the store menu URL', () => {
    const url = buildWhatsappDigitalMenuAttributionUrl({
      digitalMenuUrl,
      conversationId: 'conversation-1',
      messageId: 'assistant:message-1',
    })

    expect(url).toBe(
      'https://clicaepedeofc.vercel.app/cardapio/ccocobongo?utm_source=whatsapp_bot&utm_medium=assistant&utm_campaign=digital_menu_cta&wa_conversation=conversation-1&wa_message=assistant%3Amessage-1'
    )
  })

  test('sends the menu CTA on a new eligible conversation', () => {
    const decision = decideWhatsappDigitalMenuCta({
      intent: 'support',
      conversationId: 'conversation-1',
      messageId: 'assistant:message-1',
      digitalMenuUrl,
      tone: 'friendly',
      history: [
        {
          direction: 'inbound',
          senderType: 'customer',
          body: 'Oi',
        },
      ],
    })

    expect(decision.shouldSend).toBe(true)
    expect(decision.reason).toBe('new_conversation')
    expect(decision.text).toContain('cardapio completo')
    expect(decision.url).toContain('/cardapio/ccocobongo')
    expect(decision.attribution).toMatchObject({
      source: 'whatsapp_bot',
      medium: 'assistant',
      campaign: 'digital_menu_cta',
      conversationId: 'conversation-1',
    })
  })

  test('resends contextual CTA for purchase intent after a non-CTA reply', () => {
    const decision = decideWhatsappDigitalMenuCta({
      intent: 'price',
      conversationId: 'conversation-1',
      messageId: 'assistant:message-2',
      digitalMenuUrl,
      tone: 'professional',
      history: [
        {
          direction: 'outbound',
          senderType: 'bot',
          body: 'Posso te ajudar.',
          metadata: { digitalMenuCta: { sent: false } },
        },
      ],
    })

    expect(decision.shouldSend).toBe(true)
    expect(decision.reason).toBe('contextual_purchase_intent')
    expect(decision.text).toContain('registrar seu pedido')
  })

  test('does not repeat the CTA in consecutive bot replies', () => {
    const decision = decideWhatsappDigitalMenuCta({
      intent: 'order',
      conversationId: 'conversation-1',
      digitalMenuUrl,
      tone: 'casual',
      history: [
        {
          direction: 'outbound',
          senderType: 'bot',
          body: 'Veja o cardapio.',
          metadata: { digitalMenuCta: { sent: true } },
        },
      ],
    })

    expect(decision.shouldSend).toBe(false)
    expect(decision.reason).toBe('recently_sent')
  })

  test('uses the newest bot message when database history is newest first', () => {
    const decision = decideWhatsappDigitalMenuCta({
      intent: 'menu',
      conversationId: 'conversation-1',
      digitalMenuUrl,
      tone: 'casual',
      history: [
        {
          direction: 'outbound',
          senderType: 'bot',
          body: 'Veja o cardapio.',
          metadata: { digitalMenuCta: { sent: true } },
        },
        {
          direction: 'outbound',
          senderType: 'bot',
          body: 'Resposta antiga sem CTA.',
          metadata: { digitalMenuCta: { sent: false } },
        },
      ],
    })

    expect(decision.shouldSend).toBe(false)
    expect(decision.reason).toBe('recently_sent')
  })

  test('appends CTA without duplicating existing copy', () => {
    const ctaText = 'Cardapio: https://example.com/cardapio/loja'

    expect(
      appendWhatsappDigitalMenuCta({
        reply: 'Oi!',
        ctaText,
      })
    ).toBe(`Oi!\n\n${ctaText}`)

    expect(
      appendWhatsappDigitalMenuCta({
        reply: `Oi!\n\n${ctaText}`,
        ctaText,
      })
    ).toBe(`Oi!\n\n${ctaText}`)
  })
})
