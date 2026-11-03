import { describe, expect, mock, test } from 'bun:test'
mock.module('server-only', () => ({}))
const p = await import('./wallet-auth-policy')

describe('wallet cryptographic and request policy', () => {
  test('uses 256-bit random opaque tokens and six digit random codes', () => {
    const tokens = Array.from({ length: 1000 }, p.newWalletToken)
    expect(new Set(tokens).size).toBe(1000)
    for (const token of tokens) {
      expect(p.validWalletToken(token)).toBe(true)
      expect(p.walletHash(token)).not.toBe(token)
    }
    for (let n = 0; n < 1000; n++) expect(p.newWalletCode()).toMatch(/^\d{6}$/)
    for (const token of ['', 'a'.repeat(63), 'A'.repeat(64), undefined])
      expect(p.validWalletToken(token)).toBe(false)
  })
  test('HMAC binds store, canonical phone, challenge, browser and secret', () => {
    const args = [
      'a'.repeat(64),
      'b'.repeat(64),
      9,
      '5511900000001',
      'c'.repeat(64),
      '012345',
    ] as const
    const base = p.walletCodeHash(...args)
    expect(base).toMatch(/^[a-f0-9]{64}$/)
    expect(p.walletEqual(base, p.walletCodeHash(...args))).toBe(true)
    expect(p.walletEqual(base, 'wrong')).toBe(false)
    for (const index of [0, 1, 2, 3, 4, 5]) {
      const changed = [...args] as [
        string,
        string,
        number,
        string,
        string,
        string,
      ]
      if (index === 2) changed[2] = 10
      else changed[index as 0 | 1 | 3 | 4 | 5] += '1'
      expect(p.walletEqual(base, p.walletCodeHash(...changed))).toBe(false)
    }
  })
  test('normalizes ledger identity, validates bounded input and secure cookies', () => {
    expect(p.walletPhone('(11) 90000-0001')).toBe('5511900000001')
    expect(p.walletPhone('+55 11 90000-0001')).toBe('5511900000001')
    expect(p.walletPhone('x'.repeat(10000))).toBeNull()
    expect(p.walletPhone('+1 202 555 0100')).toBeNull()
    expect(p.walletSlug('../other')).toBeNull()
    expect(p.walletCookie(9)).not.toBe(p.walletCookie(10))
    expect(p.walletCookieOptions).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
    })
  })
  test('requires exact HTTPS same origin, never trusts cross-site or null origins', () => {
    expect(() =>
      p.assertWalletOrigin(
        'https://store.example',
        'store.example',
        'same-origin'
      )
    ).not.toThrow()
    for (const [origin, host, site] of [
      [null, 'store.example', null],
      ['https://evil.example', 'store.example', 'cross-site'],
      ['http://store.example', 'store.example', 'same-origin'],
      ['https://store.example', 'store.example', 'same-site'],
      ['https://store.example.evil', 'store.example', 'same-origin'],
    ])
      expect(() => p.assertWalletOrigin(origin, host, site)).toThrow()
  })
})
