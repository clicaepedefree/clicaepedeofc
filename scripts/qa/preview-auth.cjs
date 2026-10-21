// Chromium must own redirects and cookies. CDP overrides apply to one hop only.
async function authorizePreview(
  context,
  { page, baseUrl, oidcToken, bypassToken }
) {
  if (!oidcToken && !bypassToken) return
  if (!page)
    throw new Error('Preview authorization requires a page before navigation')
  const origin = new URL(baseUrl).origin
  const credentialHeaders = new Set([
    'x-vercel-protection-bypass',
    'x-vercel-trusted-oidc-idp-token',
  ])
  const session = await context.newCDPSession(page)
  session.on('Fetch.requestPaused', async ({ requestId, request }) => {
    try {
      const headers = Object.entries(request.headers)
        .filter(([name]) => !credentialHeaders.has(name.toLowerCase()))
        .map(([name, value]) => ({ name, value: String(value) }))
      if (new URL(request.url).origin === origin) {
        headers.push({
          name: bypassToken
            ? 'x-vercel-protection-bypass'
            : 'x-vercel-trusted-oidc-idp-token',
          value: bypassToken || oidcToken,
        })
      }
      await session.send('Fetch.continueRequest', { requestId, headers })
    } catch {
      // Fail closed without logging request headers or credentials.
      await session
        .send('Fetch.failRequest', {
          requestId,
          errorReason: 'BlockedByClient',
        })
        .catch(() => {})
    }
  })
  await session.send('Fetch.enable', {
    patterns: [{ urlPattern: '*', requestStage: 'Request' }],
  })
}

module.exports = { authorizePreview }
