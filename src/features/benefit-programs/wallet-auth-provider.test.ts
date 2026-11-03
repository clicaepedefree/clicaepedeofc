import { afterEach, describe, expect, mock, test } from 'bun:test'
mock.module('server-only', () => ({}))
let configured: unknown[] = []
mock.module('@/services/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({ orderBy: () => ({ limit: async () => configured }) }),
        }),
      }),
    }),
  },
}))
mock.module('@/lib/encryption', () => ({
  decrypt: (value: string) => {
    if (value !== 'encrypted-fixture') throw new Error('Invalid credentials')
    return 'decrypted-fixture'
  },
}))
const { prepareWalletOtpSender } = await import('./wallet-auth-provider')
const originalEnv = {
  enabled: process.env.WALLET_AUTH_ENABLED,
  url: process.env.WHATSAPP_EVOLUTION_API_BASE_URL,
  key: process.env.WHATSAPP_EVOLUTION_API_KEY,
}
afterEach(() => {
  for (const [key, value] of Object.entries({
    WALLET_AUTH_ENABLED: originalEnv.enabled,
    WHATSAPP_EVOLUTION_API_BASE_URL: originalEnv.url,
    'WHATSAPP_EVOLUTION_API_KEY': originalEnv.key,
  })) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})
function setup() {
  process.env.WALLET_AUTH_ENABLED = 'true'
  process.env.WHATSAPP_EVOLUTION_API_BASE_URL = 'https://provider.example'
  process.env.WHATSAPP_EVOLUTION_API_KEY = 'fixture-key'
  const session = {
    id: 1,
    storeId: 9,
    numberId: 1,
    status: 'paused',
    providerSessionId: 'clica-store-9-wa-1',
    metadata: { instanceTokenCiphertext: 'encrypted-fixture' },
  }
  configured = [{ session, number: { id: 1, storeId: 9, status: 'inactive' } }]
  const getConnectionState = mock(async () => ({
    state: 'open',
    instanceName: session.providerSessionId,
    raw: {},
  }))
  const sendTextMessage = mock(async () => ({
    providerMessageId: 'fixture-ack',
    status: 'PENDING',
    raw: {},
  }))
  return { session, getConnectionState, sendTextMessage }
}
describe('wallet direct transactional provider (mock transport only)', () => {
  test('paused bot + inactive number do not block explicitly requested OTP', async () => {
    const f = setup()
    const send = await prepareWalletOtpSender(9, f)
    expect(f.sendTextMessage).not.toHaveBeenCalled()
    expect(await send('5511900000001', '012345')).toBe(true)
    expect(f.sendTextMessage).toHaveBeenCalledTimes(1)
    expect(f.sendTextMessage.mock.calls[0]).toEqual([
      {
        instanceName: 'clica-store-9-wa-1',
        token: 'decrypted-fixture',
        number: '5511900000001',
        text: 'Seu codigo de acesso a carteira e 012345. Valido por 5 minutos. Nao compartilhe este codigo.',
      },
    ])
    expect(f.session.status).toBe('paused')
  })
  test('fails closed on offline provider, invalid ownership/config or credentials', async () => {
    for (const failure of [
      'offline',
      'instance',
      'credentials',
      'missing',
      'disabled',
      'http',
    ]) {
      const f = setup()
      if (failure === 'offline')
        f.getConnectionState.mockImplementation(async () => ({
          state: 'close',
          instanceName: f.session.providerSessionId,
          raw: {},
        }))
      if (failure === 'instance')
        f.session.providerSessionId = 'foreign-instance'
      if (failure === 'credentials')
        f.session.metadata.instanceTokenCiphertext = 'invalid'
      if (failure === 'missing') configured = []
      if (failure === 'disabled') process.env.WALLET_AUTH_ENABLED = 'false'
      if (failure === 'http')
        process.env.WHATSAPP_EVOLUTION_API_BASE_URL = 'http://provider.example'
      await expect(prepareWalletOtpSender(9, f)).rejects.toThrow()
      expect(f.sendTextMessage).not.toHaveBeenCalled()
    }
  })
  test('incomplete ACK stays unacknowledged, timeout is never retried', async () => {
    const f = setup()
    f.sendTextMessage.mockImplementation(async () => ({
      providerMessageId: '',
      status: 'PENDING',
      raw: {},
    }))
    const send = await prepareWalletOtpSender(9, f)
    expect(await send('5511900000001', '012345')).toBe(false)
    f.sendTextMessage.mockImplementation(async () => {
      throw new Error('DeliveryOutcomeUnknownError')
    })
    await expect(send('5511900000001', '012345')).rejects.toThrow()
    expect(f.sendTextMessage).toHaveBeenCalledTimes(2)
  })
})
