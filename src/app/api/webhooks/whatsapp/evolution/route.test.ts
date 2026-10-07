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

function expectNoSideEffects() {
  expect(applyEvolutionSessionEvent).not.toHaveBeenCalled()
  expect(processWhatsappInboundMessage).not.toHaveBeenCalled()
  expect(runWhatsappAssistantOrchestrator).not.toHaveBeenCalled()
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
        phoneNumberMasked: '***0862',
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
    expect(processWhatsappInboundMessage).toHaveBeenCalledTimes(1)
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
    expect(applyEvolutionSessionEvent).not.toHaveBeenCalled()
  })

  test.each([
    [
      'key.fromMe',
      { key: { remoteJid: '5513991840862@s.whatsapp.net', fromMe: true } },
    ],
    ['data.fromMe', { fromMe: true, sender: '5513991840862@s.whatsapp.net' }],
    ['group', { key: { remoteJid: '123456789@g.us', fromMe: false } }],
    ['broadcast', { key: { remoteJid: 'status@broadcast', fromMe: false } }],
    [
      'newsletter',
      { key: { remoteJid: '123456789@newsletter', fromMe: false } },
    ],
    ['missing sender', { message: { conversation: 'Oi' } }],
  ])(
    'ignores %s messages without mutating session or running the assistant',
    async (_name, data) => {
      const response = await route.POST(
        buildRequest({
          event: 'messages.upsert',
          instance: 'clica-store-9-wa-2',
          data: { ...data, state: 'close' },
        })
      )

      expect(response.status).toBe(200)
      expect(await readJson(response)).toEqual({
        accepted: true,
        ignored: true,
        reason: 'ignored_message',
      })
      expectNoSideEffects()
    }
  )

  test('ignores legacy top-level outgoing message shapes', async () => {
    const response = await route.POST(
      buildRequest({
        event: 'messages.upsert',
        instanceName: 'clica-store-9-wa-2',
        fromMe: true,
        sender: '5513991840862@s.whatsapp.net',
        messageText: 'Resposta do bot',
      })
    )

    expect(response.status).toBe(200)
    expect((await readJson(response)).ignored).toBe(true)
    expectNoSideEffects()
  })

  test.each([
    undefined,
    null,
    123,
    'MESSAGES_UPSERT',
    'messages.update',
    'messages.delete',
    'send.message',
    'contacts.upsert',
    'connection.updated',
  ])(
    'ignores unsupported event %s even with message and session fields',
    async event => {
      const response = await route.POST(
        buildRequest({
          event,
          instance: 'clica-store-9-wa-2',
          data: {
            key: { remoteJid: '5513991840862@s.whatsapp.net', fromMe: false },
            message: { conversation: 'Oi' },
            state: 'close',
            qrcode: { base64: 'qr-image' },
          },
        })
      )

      expect(response.status).toBe(200)
      expect(await readJson(response)).toEqual({
        accepted: true,
        ignored: true,
        reason: 'unsupported_event',
      })
      expectNoSideEffects()
    }
  )

  test.each(['open', 'close', 'connecting'])(
    'dispatches connection state %s only to session handling',
    async state => {
      const payload = {
        event: 'connection.update',
        instance: { instanceName: 'clica-store-9-wa-2' },
        data: {
          state,
          key: { remoteJid: '5513991840862@s.whatsapp.net', fromMe: false },
          message: { conversation: 'Not an inbound event' },
          qrcode: { base64: 'must-not-be-used' },
        },
      }
      const response = await route.POST(buildRequest(payload))

      expect(response.status).toBe(202)
      expect(applyEvolutionSessionEvent).toHaveBeenCalledTimes(1)
      expect(applyEvolutionSessionEvent).toHaveBeenCalledWith({
        instanceName: 'clica-store-9-wa-2',
        state,
        reason: null,
        qrCode: null,
        rawPayload: payload,
      })
      expect(processWhatsappInboundMessage).not.toHaveBeenCalled()
      expect(runWhatsappAssistantOrchestrator).not.toHaveBeenCalled()
    }
  )

  test.each([
    { data: { qrcode: { base64: 'qr-image', count: 2 } } },
    { qrcode: { base64: 'qr-image', count: 2 } },
    { qrCode: { code: 'qr-image', count: 2 } },
  ])('preserves supported QR envelope %j', async envelope => {
    const payload = {
      ...envelope,
      event: 'qrcode.updated',
      instance: 'clica-store-9-wa-2',
      sender: '5513991840862@s.whatsapp.net',
      state: 'close',
    }
    const response = await route.POST(buildRequest(payload))

    expect(response.status).toBe(202)
    expect(applyEvolutionSessionEvent).toHaveBeenCalledTimes(1)
    expect(applyEvolutionSessionEvent).toHaveBeenCalledWith({
      instanceName: 'clica-store-9-wa-2',
      state: null,
      reason: null,
      qrCode: { base64: 'qr-image', count: 2 },
      rawPayload: payload,
    })
    expect(processWhatsappInboundMessage).not.toHaveBeenCalled()
    expect(runWhatsappAssistantOrchestrator).not.toHaveBeenCalled()
  })

  test('preserves legacy top-level inbound fields when the event is explicit', async () => {
    const response = await route.POST(
      buildRequest({
        event: 'messages.upsert',
        instanceName: 'clica-store-9-wa-2',
        sender: '5513991840862@s.whatsapp.net',
        fromMe: false,
        messageText: 'Oi',
        id: 'legacy-message',
      })
    )

    expect(response.status).toBe(202)
    expect(processWhatsappInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        instanceName: 'clica-store-9-wa-2',
        providerMessageId: 'legacy-message',
        body: 'Oi',
      })
    )
    expect(applyEvolutionSessionEvent).not.toHaveBeenCalled()
  })

  test.each([
    { event: 'connection.update', data: {} },
    { event: 'connection.update', data: { state: '' } },
    { event: 'connection.update', data: { state: 42 } },
    { event: 'qrcode.updated', data: {} },
    { event: 'qrcode.updated', data: { qrcode: { base64: {} } } },
  ])(
    'rejects incomplete lifecycle payload %j without touching session',
    async payload => {
      const response = await route.POST(
        buildRequest({
          ...payload,
          instance: 'clica-store-9-wa-2',
        })
      )

      expect(response.status).toBe(400)
      expect(await readJson(response)).toEqual({
        accepted: false,
        reason: 'malformed_payload',
      })
      expectNoSideEffects()
    }
  )

  test.each([
    'messages.upsert',
    'connection.update',
    'qrcode.updated',
    'unknown',
  ])('authenticates %s before dispatch or parsing', async event => {
    for (const headers of [{}, { 'x-clica-webhook-secret': 'wrong-secret' }]) {
      const response = await route.POST(
        new Request('https://example.test/webhook', {
          method: 'POST',
          headers,
          body: JSON.stringify({ event }),
        })
      )
      expect(response.status).toBe(401)
      expect(await readJson(response)).toEqual({
        accepted: false,
        reason: 'invalid_signature',
      })
      expectNoSideEffects()
    }
  })

  test('accepts the configured Bearer token for lifecycle dispatch', async () => {
    const response = await route.POST(
      new Request('https://example.test/webhook', {
        method: 'POST',
        headers: { authorization: 'Bearer wa-secret' },
        body: JSON.stringify({
          event: 'connection.update',
          instance: 'clica-store-9-wa-2',
          data: { state: 'open' },
        }),
      })
    )
    expect(response.status).toBe(202)
    expect(applyEvolutionSessionEvent).toHaveBeenCalledTimes(1)
  })

  test('rejects malformed authenticated JSON before dispatch', async () => {
    const response = await route.POST(
      new Request('https://example.test/webhook', {
        method: 'POST',
        headers: { 'x-clica-webhook-secret': 'wa-secret' },
        body: '{',
      })
    )
    expect(response.status).toBe(400)
    expectNoSideEffects()
  })
})
