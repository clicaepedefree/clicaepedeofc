import { describe, expect, test } from 'bun:test'

import { createEvolutionClient, EvolutionApiError } from './evolution-client'

const originalFetch = globalThis.fetch

function configureEvolutionEnv() {
  process.env.WHATSAPP_EVOLUTION_API_BASE_URL = 'https://evolution.example.com/'
  process.env.WHATSAPP_EVOLUTION_API_KEY = 'global-key'
}

describe('Evolution client', () => {
  test('creates a Baileys instance with webhook configuration and normalized QR response', async () => {
    configureEvolutionEnv()
    const fetchCalls: unknown[][] = []
    const fetchMock = async (...args: unknown[]) => {
      fetchCalls.push(args)
      return new Response(
        JSON.stringify({
          hash: 'instance-token',
          instance: {
            instanceName: 'clica-store-9-wa-1',
            instanceId: 'provider-id',
            status: 'connecting',
          },
          qrcode: {
            base64: 'data:image/png;base64,abc',
            count: 1,
          },
        }),
        { status: 201 }
      )
    }
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const client = createEvolutionClient()
    const result = await client.createInstance({
      instanceName: 'clica-store-9-wa-1',
      webhookUrl: 'https://app.example.com/api/webhooks/whatsapp/evolution',
      webhookSecret: 'webhook-secret',
    })

    expect(result.instanceName).toBe('clica-store-9-wa-1')
    expect(result.instanceId).toBe('provider-id')
    expect(result.token).toBe('instance-token')
    expect(result.state).toBe('connecting')
    expect(result.qrCode).toEqual({
      base64: 'data:image/png;base64,abc',
      count: 1,
    })
    expect(fetchCalls).toHaveLength(1)
    const [url, init] = fetchCalls[0] as [
      string,
      RequestInit & { headers: Record<string, string>; body: string },
    ]
    expect(url).toBe('https://evolution.example.com/instance/create')
    expect(init.headers.apikey).toBe('global-key')
    expect(JSON.parse(init.body)).toEqual({
      instanceName: 'clica-store-9-wa-1',
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
      webhook: {
        enabled: true,
        url: 'https://app.example.com/api/webhooks/whatsapp/evolution',
        byEvents: true,
        base64: true,
        events: ['CONNECTION_UPDATE', 'QRCODE_UPDATED', 'MESSAGES_UPSERT'],
        headers: {
          Authorization: 'Bearer webhook-secret',
        },
      },
      rejectCall: true,
      msgCall:
        'No momento nao conseguimos atender ligacoes. Envie uma mensagem de texto.',
      groupsIgnore: true,
      readMessages: false,
      readStatus: false,
    })
    globalThis.fetch = originalFetch
  })

  test('uses the instance token for scoped connection status requests', async () => {
    configureEvolutionEnv()
    const fetchCalls: unknown[][] = []
    const fetchMock = async (...args: unknown[]) => {
      fetchCalls.push(args)
      return Response.json({
        instance: { instanceName: 'clica-store-9-wa-1', state: 'open' },
      })
    }
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const client = createEvolutionClient()
    const result = await client.getConnectionState({
      instanceName: 'clica-store-9-wa-1',
      token: 'instance-token',
    })

    expect(result.instanceName).toBe('clica-store-9-wa-1')
    expect(result.state).toBe('open')
    const [, init] = fetchCalls[0] as [
      string,
      RequestInit & { headers: Record<string, string> },
    ]
    expect(init.headers.apikey).toBe('instance-token')
    globalThis.fetch = originalFetch
  })

  test('sends text messages through the instance-scoped Evolution endpoint', async () => {
    configureEvolutionEnv()
    const fetchCalls: unknown[][] = []
    const fetchMock = async (...args: unknown[]) => {
      fetchCalls.push(args)
      return Response.json({
        key: {
          id: 'WA-OUT-1',
        },
        status: 'PENDING',
      })
    }
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const client = createEvolutionClient()
    const result = await client.sendTextMessage({
      instanceName: 'clica-store-9-wa-1',
      token: 'instance-token',
      number: '+55 (13) 99184-0862',
      text: 'Oi! Posso ajudar?',
    })

    expect(result.providerMessageId).toBe('WA-OUT-1')
    expect(result.status).toBe('PENDING')
    const [url, init] = fetchCalls[0] as [
      string,
      RequestInit & { headers: Record<string, string>; body: string },
    ]
    expect(url).toBe(
      'https://evolution.example.com/message/sendText/clica-store-9-wa-1'
    )
    expect(init.headers.apikey).toBe('instance-token')
    expect(JSON.parse(init.body)).toEqual({
      number: '5513991840862',
      text: 'Oi! Posso ajudar?',
    })
    globalThis.fetch = originalFetch
  })

  test('throws a typed error with provider status and payload', async () => {
    configureEvolutionEnv()
    globalThis.fetch = (async () => {
      return new Response('{"message":"not found"}', { status: 404 })
    }) as unknown as typeof fetch

    const client = createEvolutionClient()
    try {
      await client.connectInstance({ instanceName: 'missing' })
      throw new Error('expected EvolutionApiError')
    } catch (error) {
      expect(error instanceof EvolutionApiError).toBe(true)
      expect((error as EvolutionApiError).status).toBe(404)
    }
    globalThis.fetch = originalFetch
  })
})
