import { beforeEach, describe, expect, mock, test } from 'bun:test'

const applyEvolutionSessionEvent = mock(async () => ({
  id: 10,
  storeId: 9,
  status: 'connected',
}))

const processWhatsappInboundMessage = mock(async () => ({
  contact: {
    id: 20,
    storeId: 9,
    phoneNumber: '+5513991840862',
    promotionalOptOutAt: null,
  },
  conversation: {
    id: 'conversation-1',
    status: 'open',
  },
  message: {
    id: 'message-1',
  },
  messageCreated: true,
}))

const runWhatsappAssistantOrchestrator = mock(async () => ({
  action: 'responded',
  reason: null,
  intent: 'menu',
  outboundMessageId: 'outbound-1',
  latencyMs: 350,
  deliveryStatus: 'sent',
}))

mock.module('@/features/whatsapp-bot/db', () => ({
  applyEvolutionSessionEvent,
  processWhatsappInboundMessage,
  runWhatsappAssistantOrchestrator,
}))

mock.module('@/features/whatsapp-bot/db.ts', () => ({
  applyEvolutionSessionEvent,
  processWhatsappInboundMessage,
  runWhatsappAssistantOrchestrator,
}))

const route = await import('./route')

function buildRequest(body: unknown, secret = 'wa-secret') {
  return new Request(
    'https://clicaepedeofc.vercel.app/api/webhooks/whatsapp/evolution',
    {
      method: 'POST',
      headers: {
        'x-clica-webhook-secret': secret,
      },
      body: JSON.stringify(body),
    }
  )
}

async function readJson(response: Response) {
  return (await response.json()) as Record<string, unknown>
}

describe('Evolution webhook route', () => {
  beforeEach(() => {
    process.env.WHATSAPP_EVOLUTION_WEBHOOK_SECRET = 'wa-secret'
    applyEvolutionSessionEvent.mockClear()
    processWhatsappInboundMessage.mockClear()
    runWhatsappAssistantOrchestrator.mockClear()
  })

  test('processes inbound customer messages as contact ingestion', async () => {
    const response = await route.POST(
      buildRequest({
        event: 'messages.upsert',
        instance: 'clica-store-9-wa-2',
        data: {
          key: {
            remoteJid: '5513991840862@s.whatsapp.net',
            id: 'MSG-KAN-85',
            fromMe: false,
          },
          pushName: 'Bruno',
          message: {
            conversation: 'Pode parar de mandar promocoes?',
          },
          messageTimestamp: 1_754_000_000,
        },
      })
    )

    expect(response.status).toBe(202)
    expect(await readJson(response)).toEqual({
      accepted: true,
      contact: {
        id: 20,
        storeId: 9,
        phoneNumber: '+5513991840862',
        promotionalOptOutAt: null,
      },
      conversation: {
        id: 'conversation-1',
        status: 'open',
      },
      messageCreated: true,
      assistant: {
        action: 'responded',
        reason: null,
        intent: 'menu',
        outboundMessageId: 'outbound-1',
        latencyMs: 350,
        deliveryStatus: 'sent',
      },
    })
    expect(processWhatsappInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        instanceName: 'clica-store-9-wa-2',
        senderPhone: '5513991840862@s.whatsapp.net',
        displayName: 'Bruno',
        providerMessageId: 'MSG-KAN-85',
        body: 'Pode parar de mandar promocoes?',
        messageType: 'text',
      })
    )
    expect(runWhatsappAssistantOrchestrator).toHaveBeenCalledWith({
      storeId: 9,
      conversationId: 'conversation-1',
      inboundMessageId: 'message-1',
    })
    expect(applyEvolutionSessionEvent).not.toHaveBeenCalled()
  })

  test('acknowledges duplicate inbound messages without reprocessing as session state', async () => {
    processWhatsappInboundMessage.mockImplementationOnce(async () => ({
      contact: {
        id: 20,
        storeId: 9,
        phoneNumber: '+5513991840862',
        promotionalOptOutAt: new Date('2026-09-05T12:00:00.000Z'),
      },
      conversation: {
        id: 'conversation-1',
        status: 'open',
      },
      message: null,
      messageCreated: false,
    }))

    const response = await route.POST(
      buildRequest({
        event: 'messages.upsert',
        instance: 'clica-store-9-wa-2',
        data: {
          key: {
            remoteJid: '5513991840862@s.whatsapp.net',
            id: 'MSG-KAN-85',
            fromMe: false,
          },
          message: {
            conversation: 'STOP',
          },
        },
      })
    )

    expect(response.status).toBe(200)
    expect((await readJson(response)).messageCreated).toBe(false)
    expect(runWhatsappAssistantOrchestrator).not.toHaveBeenCalled()
    expect(applyEvolutionSessionEvent).not.toHaveBeenCalled()
  })

  test('keeps session lifecycle payloads on the existing session event flow', async () => {
    const response = await route.POST(
      buildRequest({
        event: 'connection.update',
        instance: 'clica-store-9-wa-2',
        data: {
          state: 'open',
        },
      })
    )

    expect(response.status).toBe(202)
    expect(await readJson(response)).toEqual({
      accepted: true,
      session: {
        id: 10,
        storeId: 9,
        status: 'connected',
      },
    })
    expect(applyEvolutionSessionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        instanceName: 'clica-store-9-wa-2',
        state: 'open',
      })
    )
    expect(processWhatsappInboundMessage).not.toHaveBeenCalled()
    expect(runWhatsappAssistantOrchestrator).not.toHaveBeenCalled()
  })

  test('rejects inbound payloads without the configured webhook secret', async () => {
    const response = await route.POST(
      buildRequest(
        {
          event: 'messages.upsert',
          instance: 'clica-store-9-wa-2',
          data: {
            key: {
              remoteJid: '5513991840862@s.whatsapp.net',
              fromMe: false,
            },
            message: { conversation: 'Oi' },
          },
        },
        'wrong-secret'
      )
    )

    expect(response.status).toBe(401)
    expect(await readJson(response)).toEqual({
      accepted: false,
      reason: 'invalid_signature',
    })
    expect(processWhatsappInboundMessage).not.toHaveBeenCalled()
    expect(runWhatsappAssistantOrchestrator).not.toHaveBeenCalled()
  })
})
