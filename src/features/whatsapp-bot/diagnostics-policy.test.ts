import { describe, expect, test } from 'bun:test'

import {
  buildWhatsappOperationalDiagnostics,
  sanitizeWhatsappDiagnosticText,
} from './diagnostics-policy'

describe('whatsapp bot diagnostics policy', () => {
  test('redacts sensitive customer and credential data from previews', () => {
    const text = sanitizeWhatsappDiagnosticText(
      'Cliente bruno@email.com telefone +55 (13) 99184-0862 CPF 123.456.789-10 token=abc123'
    )

    expect(text).toContain('[email]')
    expect(text).toContain('[telefone]')
    expect(text).toContain('[cpf]')
    expect(text).toContain('[credencial]')
    expect(text).not.toContain('bruno@email.com')
    expect(text).not.toContain('99184')
    expect(text).not.toContain('abc123')
  })

  test('builds operational metrics by assistant, handoff, CTA and notifications', () => {
    const diagnostics = buildWhatsappOperationalDiagnostics({
      generatedAt: new Date('2026-09-09T12:00:00.000Z'),
      session: {
        status: 'connected',
        provider: 'evolution',
        providerSessionId: 'store-9-number-1',
        lastHeartbeatAt: new Date('2026-09-09T11:59:00.000Z'),
      },
      conversations: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          mode: 'human',
          status: 'pending_human',
          lastMessageAt: new Date('2026-09-09T11:57:00.000Z'),
          metadata: {
            humanHandoff: {
              reason: 'payment_sensitive',
              reasonLabel: 'Pagamento sensivel',
            },
          },
        },
      ],
      messages: [
        {
          id: '22222222-2222-2222-2222-222222222222',
          conversationId: '11111111-1111-1111-1111-111111111111',
          direction: 'inbound',
          senderType: 'customer',
          messageType: 'text',
          status: 'received',
          body: 'Meu telefone e 13991840862',
          occurredAt: new Date('2026-09-09T11:55:00.000Z'),
          metadata: { source: 'whatsapp_inbound' },
        },
        {
          id: '33333333-3333-3333-3333-333333333333',
          conversationId: '11111111-1111-1111-1111-111111111111',
          direction: 'outbound',
          senderType: 'bot',
          messageType: 'text',
          status: 'sent',
          body: 'Veja o cardapio',
          occurredAt: new Date('2026-09-09T11:56:00.000Z'),
          metadata: {
            source: 'whatsapp_assistant_orchestrator',
            intent: 'menu',
            digitalMenuCta: { sent: true },
          },
        },
        {
          id: '44444444-4444-4444-4444-444444444444',
          conversationId: '11111111-1111-1111-1111-111111111111',
          direction: 'outbound',
          senderType: 'bot',
          messageType: 'text',
          status: 'failed',
          body: 'Fallback',
          occurredAt: new Date('2026-09-09T11:58:00.000Z'),
          metadata: {
            source: 'whatsapp_assistant_orchestrator',
            fallback: true,
            delivery: {
              failure: {
                message: 'provider timeout for +5513991840862',
              },
            },
          },
        },
      ],
      transactionalEvents: [
        {
          id: '55555555-5555-5555-5555-555555555555',
          eventType: 'order_status',
          status: 'sent',
          attempts: 1,
          maxAttempts: 3,
          orderId: 10,
          createdAt: new Date('2026-09-09T11:50:00.000Z'),
          sentAt: new Date('2026-09-09T11:51:00.000Z'),
        },
        {
          id: '66666666-6666-6666-6666-666666666666',
          eventType: 'cashback',
          status: 'failed',
          attempts: 3,
          maxAttempts: 3,
          orderId: 11,
          lastError: 'token=secret failed to send',
          createdAt: new Date('2026-09-09T11:52:00.000Z'),
          updatedAt: new Date('2026-09-09T11:53:00.000Z'),
        },
      ],
    })

    expect(diagnostics.metrics).toMatchObject({
      aiResponses: 1,
      handoffs: 1,
      fallbacks: 1,
      ctas: 1,
      notificationsSent: 1,
      notificationsFailed: 1,
      failedMessages: 1,
    })
    expect(diagnostics.lastInboundMessage?.preview).toBe(
      'Meu telefone [telefone]'
    )
    expect(diagnostics.logs.some(log => log.result === 'failed')).toBe(true)
    expect(JSON.stringify(diagnostics)).not.toContain('secret')
    expect(JSON.stringify(diagnostics)).not.toContain('99184')
  })
})
