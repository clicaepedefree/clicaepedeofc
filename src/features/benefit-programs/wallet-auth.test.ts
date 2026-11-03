import { describe, expect, mock, test } from 'bun:test'
mock.module('server-only', () => ({}))
const values = new Map<string, string>()
mock.module('next/headers', () => ({
  cookies: async () => ({
    get: (key: string) =>
      values.has(key) ? { value: values.get(key) } : undefined,
  }),
}))
const calls: unknown[][] = []
let live = true
mock.module('./wallet-auth-db', () => ({
  readWalletIdentity: async (...args: unknown[]) => {
    calls.push(args)
    if (!live) throw new Error('WALLET_AUTH_REQUIRED')
    return { storeId: args[1], phone: args[2] }
  },
}))
const ownTx = { label: 'own-tx' }
mock.module('@/services/db', () => ({
  db: { transaction: async (run: (tx: unknown) => unknown) => run(ownTx) },
}))
const { requireWalletIdentity } = await import('./wallet-auth')
describe('checkout wallet authority', () => {
  test('input phone alone is never proof and no product OTP bypass exists', async () => {
    values.clear()
    await expect(requireWalletIdentity(9, '(11) 90000-0001')).rejects.toThrow(
      'WALLET_AUTH_REQUIRED'
    )
    expect(calls).toHaveLength(0)
  })
  test('reads fresh cookie and passes existing transaction and canonical phone to DB', async () => {
    values.set('__Host-wallet-9', 'a'.repeat(64))
    values.set('__Host-wallet-browser', 'b'.repeat(64))
    const tx = {} as Parameters<typeof requireWalletIdentity>[2]
    expect(await requireWalletIdentity(9, '(11) 90000-0001', tx)).toEqual({
      storeId: 9,
      phone: '5511900000001',
    })
    expect(calls.at(-1)?.[0]).toBe(tx)
    expect(calls.at(-1)?.[3]).not.toBe('a'.repeat(64))
    expect(calls.at(-1)?.[4]).not.toBe('b'.repeat(64))
    await expect(requireWalletIdentity(10, '(11) 90000-0001')).rejects.toThrow(
      'WALLET_AUTH_REQUIRED'
    )
  })
  test('rechecks DB even for same cookies; revoked/expired state is authoritative', async () => {
    live = false
    await expect(requireWalletIdentity(9, '5511900000001')).rejects.toThrow(
      'WALLET_AUTH_REQUIRED'
    )
    live = true
    expect(await requireWalletIdentity(9, '5511900000001')).toEqual({
      storeId: 9,
      phone: '5511900000001',
    })
    expect(calls.at(-1)?.[0]).toBe(ownTx)
  })
})
