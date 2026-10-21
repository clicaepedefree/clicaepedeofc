import { describe, expect, test } from 'bun:test'
import { authorizePreview } from './preview-auth.cjs'

function fixture() {
  let handler: any
  const calls: { method: string; params: any }[] = []
  const page = {}
  const context = {
    async newCDPSession(target: unknown) {
      expect(target).toBe(page)
      return {
        on(event: string, callback: unknown) {
          expect(event).toBe('Fetch.requestPaused')
          handler = callback
        },
        async send(method: string, params: unknown) {
          calls.push({ method, params })
        },
      }
    },
  }
  return { page, context, calls, pause: (event: unknown) => handler(event) }
}

describe('preview credential isolation', () => {
  test.each(['oidcToken', 'bypassToken'] as const)(
    'attaches %s to exact-origin requests, rechecking every redirect hop',
    async key => {
      const f = fixture()
      await authorizePreview(f.context, {
        page: f.page,
        baseUrl: 'https://preview.vercel.app',
        [key]: 'synthetic-preview-credential',
      })
      expect(f.calls[0]).toEqual({
        method: 'Fetch.enable',
        params: { patterns: [{ urlPattern: '*', requestStage: 'Request' }] },
      })
      for (const url of [
        'https://preview.vercel.app/start',
        'https://preview.vercel.app/redirect-target',
        'https://other.vercel.app/',
        'https://preview.vercel.app.evil.test/',
        'http://preview.vercel.app/',
      ]) {
        const original = {
          Cookie: 'fixture=session',
          'Content-Type': 'text/plain',
          'X-Vercel-Protection-Bypass': 'must-not-forward',
          'x-vercel-trusted-oidc-idp-token': 'must-not-forward',
        }
        await f.pause({ requestId: url, request: { url, headers: original } })
        const { method, params } = f.calls.at(-1)!
        expect(method).toBe('Fetch.continueRequest')
        expect(params.requestId).toBe(url)
        expect(Object.keys(params).sort()).toEqual(['headers', 'requestId'])
        const headers = Object.fromEntries(
          params.headers.map((h: any) => [h.name.toLowerCase(), h.value])
        )
        expect(headers.cookie).toBe('fixture=session')
        expect(headers['content-type']).toBe('text/plain')
        const sameOrigin = new URL(url).origin === 'https://preview.vercel.app'
        expect(headers['x-vercel-protection-bypass']).toBe(
          sameOrigin && key === 'bypassToken'
            ? 'synthetic-preview-credential'
            : undefined
        )
        expect(headers['x-vercel-trusted-oidc-idp-token']).toBe(
          sameOrigin && key === 'oidcToken'
            ? 'synthetic-preview-credential'
            : undefined
        )
        expect(original['X-Vercel-Protection-Bypass']).toBe('must-not-forward')
      }
    }
  )

  test('without credentials no CDP session or page is required', async () => {
    await authorizePreview({}, { baseUrl: 'https://preview.vercel.app' })
  })

  test('credentials require explicit page setup before navigation', async () => {
    await expect(
      authorizePreview(
        {},
        {
          baseUrl: 'https://preview.vercel.app',
          oidcToken: 'synthetic',
        }
      )
    ).rejects.toThrow('requires a page')
  })

  test('invalid URLs fail closed rather than continuing a request', async () => {
    const f = fixture()
    await authorizePreview(f.context, {
      page: f.page,
      baseUrl: 'https://preview.vercel.app',
      oidcToken: 'synthetic',
    })
    await f.pause({
      requestId: 'invalid',
      request: { url: 'invalid', headers: {} },
    })
    expect(f.calls.at(-1)).toEqual({
      method: 'Fetch.failRequest',
      params: { requestId: 'invalid', errorReason: 'BlockedByClient' },
    })
  })
})
