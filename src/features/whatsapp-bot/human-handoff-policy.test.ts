import { describe, expect, test } from 'bun:test'

import {
  buildWhatsappHumanHandoffContextSummary,
  buildWhatsappHumanHandoffInternalNote,
  detectWhatsappHumanHandoff,
  getWhatsappHumanHandoffReasonLabel,
} from './human-handoff-policy'

describe('whatsapp human handoff policy', () => {
  test('detects explicit human requests with high confidence', () => {
    expect(
      detectWhatsappHumanHandoff({
        intent: 'human_support',
        message: 'Quero falar com um atendente',
      })
    ).toEqual({
      shouldHandoff: true,
      reason: 'explicit_human_request',
      confidence: 'high',
    })
  })

  test('detects complaint, cancellation and payment-sensitive messages', () => {
    expect(
      detectWhatsappHumanHandoff({
        intent: 'support',
        message: 'Meu pedido nao chegou e estou insatisfeito',
      }).reason
    ).toBe('customer_complaint')

    expect(
      detectWhatsappHumanHandoff({
        intent: 'order',
        message: 'Quero cancelar meu pedido',
      }).reason
    ).toBe('cancellation_request')

    expect(
      detectWhatsappHumanHandoff({
        intent: 'payment',
        message: 'Ja paguei no pix e enviei o comprovante',
      }).reason
    ).toBe('payment_attention')
  })

  test('keeps routine payment questions in the bot flow', () => {
    expect(
      detectWhatsappHumanHandoff({
        intent: 'payment',
        message: 'Aceita pix?',
      }).shouldHandoff
    ).toBe(false)

    expect(
      detectWhatsappHumanHandoff({
        intent: 'payment',
        message: 'Quais formas de pagamento?',
      }).shouldHandoff
    ).toBe(false)
  })

  test('detects low confidence after provider failure or repeated fallback', () => {
    expect(
      detectWhatsappHumanHandoff({
        intent: 'menu',
        message: 'Tem pizza hoje?',
        providerFailed: true,
      }).shouldHandoff
    ).toBe(false)

    expect(
      detectWhatsappHumanHandoff({
        intent: 'unknown',
        message: 'Nao entendi nada',
        providerFailed: true,
      }).reason
    ).toBe('low_confidence')

    expect(
      detectWhatsappHumanHandoff({
        intent: 'unknown',
        message: 'Ainda nao resolveu',
        history: [
          {
            direction: 'outbound',
            senderType: 'bot',
            body: 'Vou chamar ajuda se precisar.',
            metadata: { fallback: true },
          },
        ],
      }).reason
    ).toBe('low_confidence')
  })

  test('does not handoff normal menu or price questions by default', () => {
    expect(
      detectWhatsappHumanHandoff({
        intent: 'menu',
        message: 'Tem pizza hoje?',
      }).shouldHandoff
    ).toBe(false)

    expect(
      detectWhatsappHumanHandoff({
        intent: 'price',
        message: 'Quanto custa o combo?',
      }).shouldHandoff
    ).toBe(false)
  })

  test('builds context and internal note for the attendant', () => {
    expect(getWhatsappHumanHandoffReasonLabel('payment_attention')).toBe(
      'Pagamento'
    )
    expect(
      buildWhatsappHumanHandoffContextSummary({
        reason: 'payment_attention',
        intent: 'payment',
        currentMessage: 'Paguei no pix',
      })
    ).toContain('Encaminhado para humano: Pagamento.')

    expect(
      buildWhatsappHumanHandoffInternalNote({
        reason: 'explicit_human_request',
        contactName: 'Bruno',
        currentMessage: 'Chama atendente',
      })
    ).toContain('Bruno precisa de atendimento humano.')
  })
})
