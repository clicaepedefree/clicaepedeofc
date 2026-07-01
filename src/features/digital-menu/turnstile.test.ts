import { describe, expect, test } from 'bun:test'
import { verifyTurnstileToken } from './turnstile'

const originalSecret = process.env.TURNSTILE_SECRET_KEY
const originalHosts = process.env.TURNSTILE_ALLOWED_HOSTNAMES
const originalFetch = globalThis.fetch

describe('verifyTurnstileToken', () => {
  test('fails closed when the server secret is absent', async () => {
    delete process.env.TURNSTILE_SECRET_KEY
    expect(await verifyTurnstileToken({ token: 'token-value' })).toEqual({
      ok: false,
      reason: 'not_configured',
    })
    process.env.TURNSTILE_SECRET_KEY = originalSecret
  })

  test('accepts only the checkout action and an allowed hostname', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'secret'
    process.env.TURNSTILE_ALLOWED_HOSTNAMES = 'menu.example.com'
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          success: true,
          action: 'digital_menu_checkout',
          hostname: 'menu.example.com',
        }),
        { status: 200 }
      )) as typeof fetch

    expect(await verifyTurnstileToken({ token: 'token-value' })).toEqual({
      ok: true,
    })
    globalThis.fetch = originalFetch
    process.env.TURNSTILE_SECRET_KEY = originalSecret
    process.env.TURNSTILE_ALLOWED_HOSTNAMES = originalHosts
  })

  test('rejects a successful token issued for another action', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'secret'
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ success: true, action: 'login', hostname: 'x' })
      )) as typeof fetch

    expect(await verifyTurnstileToken({ token: 'token-value' })).toEqual({
      ok: false,
      reason: 'invalid',
    })
    globalThis.fetch = originalFetch
    process.env.TURNSTILE_SECRET_KEY = originalSecret
  })
})
