import { afterEach, describe, expect, test } from 'bun:test'

import { createEvolutionClient, EvolutionApiError } from './evolution-client'

const originalFetch = globalThis.fetch
const originalBaseUrl = process.env.WHATSAPP_EVOLUTION_API_BASE_URL
const originalApiKey = process.env.WHATSAPP_EVOLUTION_API_KEY

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalBaseUrl === undefined) {
    delete process.env.WHATSAPP_EVOLUTION_API_BASE_URL
  } else {
    process.env.WHATSAPP_EVOLUTION_API_BASE_URL = originalBaseUrl
  }
  if (originalApiKey === undefined) {
    delete process.env.WHATSAPP_EVOLUTION_API_KEY
  } else {
    process.env.WHATSAPP_EVOLUTION_API_KEY = originalApiKey
  }
})

function configureEvolutionEnv() {
  process.env.WHATSAPP_EVOLUTION_API_BASE_URL = 'https://evolution.example.com/'
  process.env.WHATSAPP_EVOLUTION_API_KEY = 'global-key'
}

describe('Evolution client', () => {
  test('restarts the instance with POST as required by Evolution 2.3.7', async () => {
    configureEvolutionEnv()
    const calls: unknown[][] = []
    globalThis.fetch = (async (...args: unknown[]) => {
      calls.push(args)
      return new Response(JSON.stringify({ instance: { instanceName: 'qa-test', state: 'open' } }), { status: 200 })
    }) as unknown as typeof fetch

    await createEvolutionClient().restartInstance({ instanceName: 'qa-test', token: 'qa-token' })

    expect(calls).toHaveLength(1)
    const [url, init] = calls[0] as [string, RequestInit & { headers: Record<string, string> }]
    expect(url).toBe('https://evolution.example.com/instance/restart/qa-test')
    expect(init.method).toBe('POST')
    expect(init.headers.apikey).toBe('qa-token')
  })

  test('creates a Baileys instance with one authenticated webhook URL, exactly three events and QR preserved without media base64', async () => {
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
    expect(init.method).toBe('POST')
    expect(init.headers.apikey).toBe('global-key')
    expect(JSON.parse(init.body)).toEqual({
      instanceName: 'clica-store-9-wa-1',
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
      webhook: {
        enabled: true,
        url: 'https://app.example.com/api/webhooks/whatsapp/evolution',
        byEvents: false,
        base64: false,
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

  test.each([undefined, '', ' ', '\t\n'])(
    'rejects creation without a nonblank webhook secret (case %#) before fetching',
    async webhookSecret => {
      configureEvolutionEnv()
      const fetchCalls: unknown[][] = []
      globalThis.fetch = (async (...args: unknown[]) => {
        fetchCalls.push(args)
        return Response.json({})
      }) as unknown as typeof fetch

      const client = createEvolutionClient()
      await expect(
        client.createInstance({
          instanceName: 'clica-store-9-wa-1',
          webhookUrl: 'https://app.example.com/api/webhooks/whatsapp/evolution',
          webhookSecret,
        })
      ).rejects.toThrow('WHATSAPP_EVOLUTION_WEBHOOK_SECRET is not configured')
      expect(fetchCalls).toHaveLength(0)
    }
  )

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
      number: '+55 (11) 90000-0001',
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
      number: '5511900000001',
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

  for (const status of [408, 504]) {
    test(`preserves ambiguous HTTP ${status} even when the gateway returns HTML`, async () => {
      configureEvolutionEnv()
      globalThis.fetch = (async () => new Response('<html>Gateway timeout</html>', { status })) as typeof fetch
      try {
        const client = createEvolutionClient()
        await expect(client.sendTextMessage({ instanceName: 'fixture', number: '5511900000001', text: 'Fixed QA text' })).rejects.toMatchObject({ status })
      } finally { globalThis.fetch = originalFetch }
    })
  }
})
