const assert = require('node:assert/strict')
const http = require('node:http')
const { createRequire } = require('node:module')
const { test } = require('node:test')
const requireQa = createRequire(
  process.env.QA_PLAYWRIGHT_PACKAGE ||
    'D:/ProjetoIA/codex/clicaepede/package.json'
)
const { chromium } = requireQa('playwright')
const { authorizePreview } = require('./preview-auth.cjs')

const listen = server =>
  new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const close = server => new Promise(resolve => server.close(resolve))

test('native redirects preserve login, cookies and methods without leaking preview credentials', async () => {
  const hits = []
  let browser
  const external = http.createServer((req, res) => {
    hits.push({ external: true, headers: req.headers })
    res.end('external fixture')
  })
  const local = http.createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    hits.push({ path: req.url, method: req.method, body, headers: req.headers })
    const url = new URL(req.url, 'http://fixture')
    const redirect = (status, location, cookie) => {
      res.writeHead(status, {
        location,
        ...(cookie ? { 'set-cookie': cookie } : {}),
      })
      res.end()
    }
    if (
      url.pathname === '/dashboard' &&
      !req.headers.cookie?.includes('session=ok')
    )
      return redirect(
        302,
        '/login',
        'csrf=fixture; Path=/; HttpOnly; SameSite=Lax'
      )
    if (url.pathname === '/login') {
      res.setHeader('content-type', 'text/html')
      return res.end(
        '<form method="POST" action="/session"><input name="code" value="synthetic"><button>Continuar</button></form>'
      )
    }
    if (url.pathname === '/session') {
      if (!req.headers.cookie?.includes('csrf=fixture')) {
        res.writeHead(403)
        return res.end('missing csrf cookie')
      }
      return redirect(
        303,
        '/dashboard',
        'session=ok; Path=/; HttpOnly; SameSite=Lax'
      )
    }
    if (url.pathname === '/chain') return redirect(302, '/cross')
    if (url.pathname === '/cross')
      return redirect(
        302,
        `http://127.0.0.1:${external.address().port}/external`
      )
    if (url.pathname === '/post')
      return redirect(Number(url.searchParams.get('status')), '/post-target')
    res.setHeader('content-type', 'text/html')
    res.end('<h1>fixture success</h1>')
  })
  try {
    await listen(external)
    await listen(local)
    const baseUrl = `http://127.0.0.1:${local.address().port}`
    browser = await chromium.launch({ headless: true })
    for (const key of ['oidcToken', 'bypassToken']) {
      const header =
        key === 'oidcToken'
          ? 'x-vercel-trusted-oidc-idp-token'
          : 'x-vercel-protection-bypass'
      let storageState
      // A fresh login and a restored session must both navigate to the real URL.
      for (let iteration = 0; iteration < 2; iteration++) {
        const context = await browser.newContext({
          storageState,
          serviceWorkers: 'block',
        })
        try {
          const page = await context.newPage()
          await authorizePreview(context, {
            page,
            baseUrl,
            [key]: 'SYNTHETIC_ONLY',
          })
          hits.length = 0
          await page.goto(`${baseUrl}/dashboard`)
          if (iteration === 0) {
            assert.equal(page.url(), `${baseUrl}/login`)
            await Promise.all([
              page.waitForURL(`${baseUrl}/dashboard`),
              page.getByRole('button', { name: 'Continuar' }).click(),
            ])
          }
          assert.equal(page.url(), `${baseUrl}/dashboard`)
          assert.match(await page.textContent('h1'), /fixture success/)
          assert(
            hits
              .filter(hit => !hit.external)
              .every(hit => hit.headers[header] === 'SYNTHETIC_ONLY')
          )
          storageState = await context.storageState()
          for (const path of ['/cross', '/chain']) {
            hits.length = 0
            await page.goto(`${baseUrl}${path}`)
            assert.equal(new URL(page.url()).pathname, '/external')
            assert(
              hits
                .filter(hit => !hit.external)
                .every(hit => hit.headers[header] === 'SYNTHETIC_ONLY')
            )
            const destination = hits.find(hit => hit.external)
            assert(destination)
            assert.equal(
              destination.headers['x-vercel-protection-bypass'],
              undefined
            )
            assert.equal(
              destination.headers['x-vercel-trusted-oidc-idp-token'],
              undefined
            )
          }
          for (const status of [301, 302, 303, 307, 308]) {
            await page.goto(`${baseUrl}/blank`)
            await page.setContent(
              `<form method="POST" action="${baseUrl}/post?status=${status}"><input name="payload" value="synthetic"></form>`
            )
            hits.length = 0
            await Promise.all([
              page.waitForURL(`${baseUrl}/post-target`),
              page.evaluate(() => document.querySelector('form').submit()),
            ])
            const target = hits.find(hit => hit.path === '/post-target')
            assert.equal(target.headers[header], 'SYNTHETIC_ONLY')
            assert.equal(target.method, status <= 303 ? 'GET' : 'POST')
            assert.equal(target.body, status <= 303 ? '' : 'payload=synthetic')
            if (status <= 303)
              assert.equal(target.headers['content-type'], undefined)
          }
        } finally {
          await context.close()
        }
      }
    }
  } finally {
    try {
      if (browser) await browser.close()
    } finally {
      await close(local)
      await close(external)
    }
  }
})
