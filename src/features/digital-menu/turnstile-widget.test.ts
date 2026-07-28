import { describe, expect, test } from 'bun:test'
import { buildDigitalMenuTurnstileOptions } from './turnstile-widget'

describe('buildDigitalMenuTurnstileOptions', () => {
  test('uses a visible managed widget for suspicious checkout challenges', () => {
    const options = buildDigitalMenuTurnstileOptions({
      siteKey: 'site-key',
      onToken: () => undefined,
      onError: () => undefined,
    })

    expect(options.sitekey).toBe('site-key')
    expect(options.action).toBe('digital_menu_checkout')
    expect(options.theme).toBe('auto')
    expect(options.appearance).toBe('always')
    expect('execution' in options).toBe(false)
  })

  test('clears the token when the challenge expires, fails or is unsupported', () => {
    const tokens: Array<string | null> = []
    const messages: string[] = []
    const options = buildDigitalMenuTurnstileOptions({
      siteKey: 'site-key',
      onToken: token => tokens.push(token),
      onError: message => messages.push(message),
    })

    options['expired-callback']()
    options['error-callback']()
    options['unsupported-callback']()

    expect(tokens).toEqual([null, null, null])
    expect(messages).toHaveLength(3)
  })
})
