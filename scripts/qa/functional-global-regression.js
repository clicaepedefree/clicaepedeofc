/* eslint-disable no-console */
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')

require('dotenv').config({ path: path.join(process.cwd(), '.env.local') })
require('dotenv').config()

const APP_ROOT = process.cwd()
const DEFAULT_ARTIFACT_ROOT = 'D:\\ProjetoIA\\codex\\clicaepede\\qa-evidences'
const PLAYWRIGHT_FALLBACK_ROOT = 'D:\\ProjetoIA\\codex\\clicaepede\\node_modules'

const BASE_URL = process.env.QA_BASE_URL || process.env.BASE_URL || 'https://clicaepedeofc.vercel.app'
const ARTIFACT_ROOT = process.env.QA_ARTIFACT_ROOT || DEFAULT_ARTIFACT_ROOT
const QA_EMAIL = process.env.QA_EMAIL || 'qaclicapede+clerk_test@gmail.com'
const QA_CODE = process.env.QA_CODE || '424242'
const QA_PASSWORD = process.env.QA_PASSWORD || ''
const QA_AUTH_STORAGE =
  process.env.QA_AUTH_STORAGE ||
  'D:\\ProjetoIA\\codex\\clicaepede\\global-regression-20260831-205348\\qa-auth-storage.json'
const STORE_ID = Number(process.env.QA_STORE_ID || 9)
const STORE_SLUG = process.env.QA_STORE_SLUG || 'ccocobongo'
const STORE_NAME = process.env.QA_STORE_NAME || 'Ccocobongo'
const RUN_ID = `KAN-124-global-regression-${new Date().toISOString().replace(/[:.]/g, '-')}`
const RUN_DIR = path.join(ARTIFACT_ROOT, RUN_ID)
const DB_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL

const dirs = {
  screenshots: path.join(RUN_DIR, 'screenshots'),
  videos: path.join(RUN_DIR, 'videos'),
  traces: path.join(RUN_DIR, 'traces'),
}

for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true })

function requireFromFallback(packageName) {
  try {
    return require(packageName)
  } catch (localError) {
    const fallbackRequire = createRequire(path.join(PLAYWRIGHT_FALLBACK_ROOT, 'fallback.js'))
    try {
      return fallbackRequire(packageName)
    } catch {
      throw localError
    }
  }
}

const { chromium } = requireFromFallback('playwright')
const postgres = require('postgres')

const sql = DB_URL
  ? postgres(DB_URL, { max: 2, idle_timeout: 5, connect_timeout: 15 })
  : null

const results = []
const bugCandidates = []
const createdOrders = []

function slugify(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 90)
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function redacted(value) {
  if (!value) return value
  return String(value).replace(QA_PASSWORD, '[QA_PASSWORD_REDACTED]')
}

async function screenshot(page, entry, name) {
  const file = path.join(dirs.screenshots, `${String(entry.steps.length + 1).padStart(2, '0')}-${entry.id}-${slugify(name)}.png`)
  try {
    await page.screenshot({ path: file, fullPage: true })
    entry.artifacts.screenshots.push(file)
    return file
  } catch (error) {
    entry.notes.push(`Screenshot failed: ${error.message}`)
    return null
  }
}

async function collectState(page) {
  const state = {
    url: page.url(),
    title: '',
    text: '',
    metrics: null,
    console: page.__consoleMessages || [],
    network: page.__networkFailures || [],
  }
  try {
    state.title = await page.title()
    state.text = (await page.locator('body').innerText({ timeout: 5000 })).slice(0, 3000)
    state.metrics = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      darkClass: document.documentElement.classList.contains('dark'),
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      bodyColor: getComputedStyle(document.body).color,
    }))
  } catch (error) {
    state.text = `STATE_CAPTURE_FAILED: ${error.message}`
  }
  return state
}

function attachDiagnostics(page) {
  page.__consoleMessages = []
  page.__networkFailures = []
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) {
      page.__consoleMessages.push({
        type: message.type(),
        text: redacted(message.text()).slice(0, 1200),
      })
    }
  })
  page.on('requestfailed', request => {
    page.__networkFailures.push({
      method: request.method(),
      url: request.url(),
      failure: request.failure()?.errorText,
    })
  })
  page.on('response', response => {
    if (response.status() >= 500) {
      page.__networkFailures.push({
        method: response.request().method(),
        url: response.url(),
        status: response.status(),
      })
    }
  })
}

async function newContext(browser, entry, options = {}) {
  const viewport = options.viewport || { width: 1440, height: 900 }
  const context = await browser.newContext({
    storageState: options.storageState,
    viewport,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    recordVideo: { dir: dirs.videos, size: viewport },
  })
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true })
  const page = await context.newPage()
  attachDiagnostics(page)
  return { context, page }
}

async function closeContext(context, entry) {
  const trace = path.join(dirs.traces, `${entry.id}-${slugify(entry.title)}.zip`)
  try {
    await context.tracing.stop({ path: trace })
    entry.artifacts.trace = trace
  } catch (error) {
    entry.notes.push(`Trace stop failed: ${error.message}`)
  }
  await context.close().catch(() => {})
}

async function navigate(page, route) {
  const url = route.startsWith('http') ? route : `${BASE_URL}${route}`
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
}

async function setTheme(page, theme) {
  await page.addInitScript(selectedTheme => {
    localStorage.setItem('theme', selectedTheme)
    document.documentElement.classList.toggle('dark', selectedTheme === 'dark')
  }, theme)
}

async function assertNoHardFailure(page, label) {
  const state = await collectState(page)
  const hardFailure = /Application error|server-side exception|Nao foi possivel atualizar|Não foi possível atualizar|Pedido nao encontrado|Pedido não encontrado|Internal Server Error/i.test(state.text)
  if (hardFailure) throw new Error(`${label}: falha critica visivel. URL=${state.url}. Texto=${state.text.slice(0, 1000)}`)
  if (state.metrics && state.metrics.scrollWidth > state.metrics.clientWidth + 6) {
    throw new Error(`${label}: overflow horizontal ${state.metrics.scrollWidth} > ${state.metrics.clientWidth}`)
  }
  return state
}

async function step(entry, name, fn) {
  const startedAt = Date.now()
  try {
    const details = await fn()
    entry.steps.push({ name, status: 'passed', durationMs: Date.now() - startedAt, details })
    return details
  } catch (error) {
    entry.steps.push({ name, status: 'failed', durationMs: Date.now() - startedAt, error: redacted(error.stack || error.message) })
    throw error
  }
}

async function scenario(id, title, kind, fn) {
  const entry = {
    id,
    title,
    kind,
    status: 'passed',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    durationMs: 0,
    steps: [],
    notes: [],
    artifacts: { screenshots: [], video: null, trace: null },
    error: null,
  }
  const started = Date.now()
  results.push(entry)
  try {
    await fn(entry)
  } catch (error) {
    entry.status = 'failed'
    entry.error = redacted(error.stack || error.message)
    bugCandidates.push({
      summary: `[REGRESSAO GLOBAL] ${title}`,
      kind,
      scenarioId: id,
      url: entry.steps.at(-1)?.details?.url || null,
      evidence: entry.artifacts.screenshots.at(-1) || entry.artifacts.trace,
      steps: entry.steps.map(item => item.name),
      technicalError: entry.error,
    })
  } finally {
    entry.finishedAt = new Date().toISOString()
    entry.durationMs = Date.now() - started
  }
}

async function clickFirst(page, patterns, timeout = 12000) {
  for (const pattern of patterns) {
    const visibleButtons = page.locator('button:visible')
    const buttonCount = await visibleButtons.count().catch(() => 0)
    for (let index = buttonCount - 1; index >= 0; index -= 1) {
      const button = visibleButtons.nth(index)
      const text = await button.innerText().catch(() => '')
      if (!pattern.test(text)) continue
      await button.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {})
      await button.click({ timeout }).catch(async () => {
        await button.click({ timeout, force: true })
      })
      return true
    }

    const byRole = page.getByRole('button', { name: pattern }).first()
    if (await byRole.isVisible({ timeout: 800 }).catch(() => false)) {
      await byRole.click({ timeout })
      return true
    }
    const byText = page.getByText(pattern).first()
    if (await byText.isVisible({ timeout: 800 }).catch(() => false)) {
      await byText.click({ timeout })
      return true
    }
  }
  return false
}

async function clickPrimaryAuthButton(page, timeout = 15000) {
  const buttons = page.locator('button:visible')
  const count = await buttons.count().catch(() => 0)
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index)
    const text = await button.innerText().catch(() => '')
    if (/google|github|facebook|apple/i.test(text)) continue
    if (/continuar|continue|entrar|sign in|login|verificar|verify|avancar|avançar/i.test(text)) {
      await button.click({ timeout })
      return true
    }
  }
  return false
}

async function fillByLabelOrText(page, labelPattern, value) {
  const byLabel = page.getByLabel(labelPattern).first()
  if (await byLabel.isVisible({ timeout: 1000 }).catch(() => false)) {
    await byLabel.fill(value)
    return true
  }

  const labels = page.locator('label').filter({ hasText: labelPattern }).first()
  if (await labels.isVisible({ timeout: 1000 }).catch(() => false)) {
    const controlId = await labels.getAttribute('for').catch(() => null)
    if (controlId) {
      const byId = page.locator(`#${controlId}`)
      if (await byId.isVisible({ timeout: 1000 }).catch(() => false)) {
        await byId.fill(value)
        return true
      }
    }
    const input = labels.locator('input, textarea').first()
    if (await input.isVisible({ timeout: 1000 }).catch(() => false)) {
      await input.fill(value)
      return true
    }
  }
  return false
}

async function fillVisibleInputsByHeuristic(page, marker, type) {
  const inputs = page.locator('input:visible, textarea:visible')
  const count = await inputs.count()
  for (let index = 0; index < count; index += 1) {
    const field = inputs.nth(index)
    const descriptor = [
      await field.getAttribute('name').catch(() => ''),
      await field.getAttribute('placeholder').catch(() => ''),
      await field.getAttribute('aria-label').catch(() => ''),
      await field.getAttribute('id').catch(() => ''),
    ].join(' ').toLowerCase()
    if (/cupom|coupon|pix|search|busca|code|verification/.test(descriptor)) continue
    const tagName = await field.evaluate(node => node.tagName.toLowerCase()).catch(() => '')
    const current = await field.inputValue().catch(() => '')
    if (current && tagName !== 'textarea') continue
    if (/nome|name|cliente/.test(descriptor)) await field.fill(`Cliente ${marker}`)
    else if (/whats|telefone|phone|celular/.test(descriptor)) await field.fill('11999999999')
    else if (/cep|postal/.test(descriptor)) await field.fill(type === 'delivery' ? '01001000' : '')
    else if (/bairro|district|neighborhood/.test(descriptor)) await field.fill('Centro')
    else if (/rua|street|endereco|endereço|address/.test(descriptor)) await field.fill('Rua QA KAN-1')
    else if (/numero|número|number/.test(descriptor)) await field.fill('100')
    else if (/cidade|city/.test(descriptor)) await field.fill('Sao Paulo')
    else if (/estado|uf|state/.test(descriptor)) await field.fill('SP')
    else if (/observ|coment|note/.test(descriptor) || tagName === 'textarea') await field.fill(`${marker} observacao funcional`)
  }
}

async function loginWithQa(page, entry) {
  await navigate(page, '/dashboard')
  await screenshot(page, entry, 'login-start')
  let state = await collectState(page)
  const pathname = new URL(page.url()).pathname
  if (
    !pathname.startsWith('/login') &&
    !/accounts\.google\.com|Fazer Login com o Google/i.test(state.url) &&
    /Dashboard|Ccocobongo|Pedidos|Cardapio|Cardápio|Loja|qaclicapede\+clerk_test@gmail\.com/i.test(state.text)
  ) {
    return
  }

  const emailInput = page.locator('input:visible[type="email"], input:visible[name*="identifier"], input:visible[name*="email"], input:visible').first()
  await emailInput.fill(QA_EMAIL, { timeout: 20000 })
  const submittedEmail = await clickPrimaryAuthButton(page, 15000).catch(() => false)
  if (!submittedEmail) await page.keyboard.press('Enter').catch(() => {})
  await page.waitForTimeout(1500)

  const password = page.locator('input:visible[type="password"]').first()
  if (await password.isVisible({ timeout: 5000 }).catch(() => false)) {
    if (!QA_PASSWORD) {
      throw new Error('Clerk pediu senha, mas QA_PASSWORD nao foi informado no ambiente.')
    }
    await password.fill(QA_PASSWORD)
    const submittedPassword = await clickPrimaryAuthButton(page, 15000).catch(() => false)
    if (!submittedPassword) await page.keyboard.press('Enter').catch(() => {})
    await page.waitForTimeout(2500)
  }

  if (/\/login/.test(new URL(page.url()).pathname)) {
    const codeInputs = page.locator('input:visible[inputmode="numeric"], input:visible[autocomplete="one-time-code"], input:visible[name*="code"], input:visible')
    const count = await codeInputs.count()
    if (count >= 6) {
      for (let index = 0; index < 6; index += 1) await codeInputs.nth(index).fill(QA_CODE[index])
    } else {
      await codeInputs.first().fill(QA_CODE)
    }
    const submittedCode = await clickPrimaryAuthButton(page, 15000).catch(() => false)
    if (!submittedCode) await page.keyboard.press('Enter').catch(() => {})
  }

  await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 60000 }).catch(() => {})
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  await screenshot(page, entry, 'login-end')
  state = await assertNoHardFailure(page, 'login QA')
  if (!/Dashboard|Ccocobongo|Pedidos|Cardapio|Cardápio|Loja|admin-onboarding/i.test(state.text)) {
    throw new Error(`Login QA nao chegou ao app. URL=${state.url}. Texto=${state.text.slice(0, 900)}`)
  }
}

async function openCheckout(page, entry) {
  await navigate(page, `/cardapio/${STORE_SLUG}`)
  await assertNoHardFailure(page, 'cardapio publico')
  await screenshot(page, entry, 'public-menu')

  const exactQaProduct = page.getByText('QA KAN-1 Produto', { exact: true }).last()
  if (await exactQaProduct.isVisible({ timeout: 10000 }).catch(() => false)) {
    await exactQaProduct.scrollIntoViewIfNeeded({ timeout: 20000 }).catch(() => {})
    await exactQaProduct.click({ timeout: 20000 })
  } else {
    const product = page.getByText(/QA KAN-1 Produto|KAN-7 QA Burger/i).last()
    await product.scrollIntoViewIfNeeded({ timeout: 20000 }).catch(() => {})
    await product.click({ timeout: 20000 })
  }
  await page.waitForTimeout(1000)

  await clickFirst(page, [/Adicionar ao carrinho/i, /Salvar alterações/i, /Salvar alteracoes/i], 12000)
  await page.waitForTimeout(800)
  await screenshot(page, entry, 'cart-item')

  await clickFirst(page, [/Finalizar/i, /Continuar para checkout/i, /Carrinho/i], 12000)
  await page.waitForTimeout(1000)
}

async function createPublicOrder(browser, type, viewport) {
  const id = `ORDER-${type.toUpperCase()}-${viewport.name}`
  let created = null
  await scenario(id, `Criar pedido publico ${type} ${viewport.name}`, 'product', async entry => {
    const { context, page } = await newContext(browser, entry, { viewport })
    try {
      await step(entry, 'Abrir cardapio, adicionar item e abrir checkout', async () => {
        await openCheckout(page, entry)
        return collectState(page)
      })

      const marker = `KAN124 ${type} ${Date.now()}`
      await step(entry, `Preencher checkout ${type}`, async () => {
        await clickFirst(page, [type === 'takeout' ? /Retirada/i : /Entrega/i], 10000)
        await fillByLabelOrText(page, /Nome completo/i, `Cliente ${marker}`)
        await fillByLabelOrText(page, /WhatsApp|Telefone/i, '11999999999')
        if (type === 'delivery') {
          await fillByLabelOrText(page, /CEP/i, '01001000')
          await fillByLabelOrText(page, /Rua|Endereco|Endereço/i, 'Rua QA KAN-1')
          await fillByLabelOrText(page, /Numero|Número/i, '100')
          await fillByLabelOrText(page, /Bairro/i, 'Centro')
        }
        await fillByLabelOrText(page, /Observacao geral|Observação geral|Observacao|Observação/i, `${marker} observacao funcional`)
        await fillVisibleInputsByHeuristic(page, marker, type)
        await clickFirst(page, [/Pix/i, /Dinheiro/i], 10000)
        await page.locator('input[type="checkbox"]').first().check({ timeout: 5000 }).catch(() => {})
        await page.waitForTimeout(12000)
        await screenshot(page, entry, 'checkout-before-submit')
        return { marker, url: page.url() }
      })

      await step(entry, 'Enviar pedido e capturar token publico', async () => {
        const sent = await clickFirst(page, [/Confirmar e enviar/i, /Enviar pedido/i], 20000)
        if (!sent) {
          const buttons = await page.locator('button:visible').evaluateAll(nodes =>
            nodes.map(node => ({
              text: node.innerText,
              disabled: node.disabled,
              ariaDisabled: node.getAttribute('aria-disabled'),
            }))
          ).catch(error => [{ error: error.message }])
          throw new Error(`Botao de envio do pedido nao encontrado. Botoes visiveis=${JSON.stringify(buttons).slice(0, 1500)}`)
        }
        await page.waitForTimeout(8000)
        await screenshot(page, entry, 'checkout-after-submit')
        const state = await collectState(page)
        if (!/Pedido recebido|Acompanhar pedido|Protocolo/i.test(state.text)) {
          throw new Error(`Pedido nao confirmou. URL=${state.url}. Texto=${state.text.slice(0, 1200)}`)
        }
        await clickFirst(page, [/Acompanhar pedido/i], 10000).catch(() => {})
        await page.waitForURL(url => url.pathname.startsWith('/pedido/'), { timeout: 15000 }).catch(() => {})
        const tokenMatch = page.url().match(/\/pedido\/([^/?#]+)/)
        const markerStep = entry.steps.find(item => item.name.startsWith('Preencher checkout'))?.details
        created = { type, marker: markerStep.marker, token: tokenMatch?.[1] || null, trackingUrl: tokenMatch ? page.url() : null }
        return { ...created, url: page.url() }
      })

      await closeContext(context, entry)
    } catch (error) {
      await screenshot(page, entry, 'failure')
      await closeContext(context, entry)
      throw error
    }
  })
  if (created) createdOrders.push(created)
  return created
}

async function queryOrderByMarker(marker) {
  if (!sql) throw new Error('POSTGRES_URL/DATABASE_URL ausente; nao da para validar Supabase.')
  const rows = await sql`
    select
      o.id,
      o.display_id,
      o.store_id,
      o.type,
      o.sales_channel,
      o.status,
      o.total_price,
      o.customer_name,
      o.customer_phone,
      o.order_notes,
      o.delivery_address,
      o.delivery_neighborhood,
      o.delivery_fee,
      o.public_tracking_expires_at,
      o.created_at,
      pos.id as public_order_id,
      pos.status as public_status,
      pos.order_type,
      pos.cart_snapshot,
      pos.totals_snapshot,
      pos.customer_snapshot,
      pos.address_snapshot,
      pos.payment_snapshot,
      count(distinct oi.id)::int as item_count,
      count(distinct op.id)::int as payment_count,
      count(distinct oae.id)::int as audit_event_count,
      count(distinct poe.id)::int as public_event_count
    from orders o
    left join public_order_submissions pos
      on pos.order_id = o.id and pos.store_id = o.store_id
    left join order_items oi
      on oi.order_id = o.id
    left join order_payments op
      on op.order_id = o.id
    left join order_audit_events oae
      on oae.order_id = o.id and oae.store_id = o.store_id
    left join public_order_events poe
      on poe.public_order_id = pos.id and poe.store_id = pos.store_id
    where o.store_id = ${STORE_ID}
      and (
        o.customer_name ilike ${`%${marker}%`}
        or o.order_notes ilike ${`%${marker}%`}
      )
    group by o.id, pos.id
    order by o.created_at desc
    limit 1
  `
  return rows[0] || null
}

async function validatePersistedOrder(orderInfo, expectedType) {
  const row = await queryOrderByMarker(orderInfo.marker)
  if (!row) throw new Error(`Pedido ${expectedType} com marcador ${orderInfo.marker} nao encontrado no Supabase.`)
  if (Number(row.store_id) !== STORE_ID) throw new Error(`store_id incorreto: ${row.store_id}`)
  if (row.type !== (expectedType === 'delivery' ? 'DELIVERY' : 'TAKEOUT')) throw new Error(`type incorreto: ${row.type}`)
  if (row.sales_channel !== 'DIGITAL_MENU') throw new Error(`sales_channel incorreto: ${row.sales_channel}`)
  if (!['PENDING', 'RECEIVED', 'CREATED', 'SENT_TO_STORE'].includes(row.status)) throw new Error(`status inicial inesperado: ${row.status}`)
  if (!row.public_order_id) throw new Error('public_order_submissions nao foi vinculado ao pedido.')
  if (Number(row.total_price) <= 0) throw new Error(`total_price invalido: ${row.total_price}`)
  if (Number(row.item_count) < 1) throw new Error('Pedido sem itens persistidos.')
  if (Number(row.payment_count) < 1) throw new Error('Pedido sem pagamento persistido.')
  if (Number(row.audit_event_count) < 1) throw new Error('Pedido sem auditoria interna.')
  if (Number(row.public_event_count) < 1) throw new Error('Pedido sem evento publico.')
  return row
}

async function validateOrdersInSupabase() {
  await scenario('DB-ORDERS-P0', 'Pedidos publicos persistem corretamente no Supabase', 'product', async entry => {
    await step(entry, 'Validar pedido retirada no banco', async () => {
      const takeout = createdOrders.find(item => item.type === 'takeout')
      if (!takeout) throw new Error('Pedido retirada nao foi criado antes da validacao.')
      return validatePersistedOrder(takeout, 'takeout')
    })
    await step(entry, 'Validar pedido delivery no banco', async () => {
      const delivery = createdOrders.find(item => item.type === 'delivery')
      if (!delivery) throw new Error('Pedido delivery nao foi criado antes da validacao.')
      return validatePersistedOrder(delivery, 'delivery')
    })
  })
}

async function openOrderDetails(page, displayId) {
  await navigate(page, '/orders')
  await assertNoHardFailure(page, 'painel de pedidos')
  const search = page.locator('input:visible').first()
  await search.fill(String(displayId)).catch(() => {})
  await page.waitForTimeout(2000)
  const queueTabs = [/Novos/i, /Aceitos/i, /Em preparo/i, /Saiu para entrega/i, /Finalizados/i, /Recusados\/cancelados/i]

  for (const tab of [null, ...queueTabs]) {
    if (tab) {
      await clickFirst(page, [tab], 5000).catch(() => {})
      await page.waitForTimeout(1000)
      await search.fill(String(displayId)).catch(() => {})
      await page.waitForTimeout(1000)
    }
    const rowButton = page.getByLabel(new RegExp(`Ver detalhes do pedido ${displayId}`)).first()
    if (await rowButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await rowButton.click()
      return
    }
    const rowText = page.getByText(`#${displayId}`, { exact: false }).first()
    if (await rowText.isVisible({ timeout: 1000 }).catch(() => false)) {
      await rowText.click({ timeout: 5000 })
      return
    }
  }

  throw new Error(`Pedido #${displayId} nao encontrado em nenhuma aba da fila.`)
}

async function validateDashboardAndTracking(browser, storageState) {
  const target = createdOrders.find(item => item.type === 'delivery') || createdOrders[0]
  await scenario('DASHBOARD-TRACKING-P0', 'Pedido aparece no dashboard, muda status e reflete no tracking publico', 'product', async entry => {
    if (!target) throw new Error('Nenhum pedido publico criado para validar dashboard/tracking.')
    const row = await validatePersistedOrder(target, target.type)
    target.db = row

    const { context, page } = await newContext(browser, entry, { storageState, viewport: { width: 1440, height: 900 } })
    try {
      await step(entry, 'Abrir pedido no painel da loja', async () => {
        await openOrderDetails(page, row.display_id)
        await page.waitForTimeout(1000)
        await screenshot(page, entry, 'dashboard-order-details')
        const state = await assertNoHardFailure(page, 'detalhes do pedido')
        if (!new RegExp(`Pedido #${row.display_id}`).test(state.text)) throw new Error(`Detalhes do pedido #${row.display_id} nao abriram.`)
        return state
      })

      await step(entry, 'Aceitar pedido pelo painel', async () => {
        await clickFirst(page, [/Aceitar/i], 10000)
        const minutes = page.locator('#order-estimated-minutes, input[type="number"]:visible').first()
        if (await minutes.isVisible({ timeout: 5000 }).catch(() => false)) await minutes.fill('20')
        await clickFirst(page, [/Aceitar/i], 10000)
        await page.waitForTimeout(5000)
        await screenshot(page, entry, 'dashboard-after-accept')
        const accepted = await queryOrderByMarker(target.marker)
        if (accepted.status !== 'ACCEPTED' || accepted.public_status !== 'ACCEPTED') {
          throw new Error(`Status nao foi para ACCEPTED. order=${accepted.status}, public=${accepted.public_status}`)
        }
        return accepted
      })

      await step(entry, 'Validar tracking publico aceito sem dados sensiveis', async () => {
        if (!target.trackingUrl) throw new Error('Tracking URL nao capturada no checkout.')
        const publicPage = await context.newPage()
        attachDiagnostics(publicPage)
        await navigate(publicPage, target.trackingUrl)
        await publicPage.waitForTimeout(2000)
        await screenshot(publicPage, entry, 'tracking-accepted')
        const state = await assertNoHardFailure(publicPage, 'tracking aceito')
        if (!/Aceito|recebido|preparo|Pedido/i.test(state.text)) throw new Error(`Tracking nao exibiu status publico esperado. Texto=${state.text.slice(0, 900)}`)
        const sensitive = [/11999999999/, /9999-9999/, /Cliente KAN124/i, /qa-kan-1-pix/i, /public_tracking/i, /tracking_token/i, /cpf/i]
        const leak = sensitive.find(pattern => pattern.test(state.text))
        if (leak) throw new Error(`Tracking publico expôs dado sensivel ou interno: ${leak}`)
        return state
      })

      await step(entry, 'Finalizar pedido e validar status terminal publico', async () => {
        await openOrderDetails(page, row.display_id)
        await clickFirst(page, [/Finalizar/i, /Marcar pronto/i, /Iniciar preparo/i], 10000)
        await page.waitForTimeout(3500)
        await openOrderDetails(page, row.display_id)
        await clickFirst(page, [/Finalizar/i, /Marcar pronto/i], 10000).catch(() => {})
        await page.waitForTimeout(3500)
        await openOrderDetails(page, row.display_id)
        await clickFirst(page, [/Finalizar/i], 10000).catch(() => {})
        await page.waitForTimeout(5000)
        const refreshed = await queryOrderByMarker(target.marker)
        if (!['COMPLETED', 'READY', 'IN_PREPARATION'].includes(refreshed.status)) {
          throw new Error(`Status terminal/progresso esperado nao foi persistido. Status=${refreshed.status}`)
        }
        if (target.trackingUrl) {
          const publicPage = await context.newPage()
          attachDiagnostics(publicPage)
          await navigate(publicPage, target.trackingUrl)
          await screenshot(publicPage, entry, 'tracking-final-status')
          await assertNoHardFailure(publicPage, 'tracking status terminal')
        }
        return refreshed
      })

      await closeContext(context, entry)
    } catch (error) {
      await screenshot(page, entry, 'failure')
      await closeContext(context, entry)
      throw error
    }
  })
}

async function dbSnapshotForOwnerActions() {
  if (!sql) throw new Error('POSTGRES_URL/DATABASE_URL ausente; nao da para validar owner actions.')
  const [item] = await sql`
    select id, name, description, inventory, updated_at
    from items
    where store_id = ${STORE_ID}
    order by updated_at desc nulls last, id asc
    limit 1
  `
  const [settings] = await sql`
    select store_id, average_preparation_minutes, allow_item_observations, updated_at
    from store_digital_menu_settings
    where store_id = ${STORE_ID}
    limit 1
  `
  return { item, settings }
}

async function validateOwnerControlledPersistence() {
  await scenario('DB-OWNER-ACTIONS-P1', 'Acoes controladas de dono persistem e sao reversiveis no Supabase', 'harness', async entry => {
    let snapshot
    await step(entry, 'Ler estado inicial de produto e configuracao', async () => {
      snapshot = await dbSnapshotForOwnerActions()
      if (!snapshot.item) throw new Error('Nenhum produto da loja QA encontrado.')
      if (!snapshot.settings) throw new Error('Configuracao de cardapio digital da loja QA nao encontrada.')
      return snapshot
    })
    await step(entry, 'Atualizar produto de forma reversivel e confirmar persistencia', async () => {
      const marker = `QA-KAN124-${Date.now()}`
      await sql`update items set description = ${marker}, updated_at = now() where id = ${snapshot.item.id} and store_id = ${STORE_ID}`
      const [updated] = await sql`select id, description from items where id = ${snapshot.item.id} and store_id = ${STORE_ID}`
      if (updated.description !== marker) throw new Error('Descricao do produto nao persistiu no banco.')
      await sql`update items set description = ${snapshot.item.description}, updated_at = now() where id = ${snapshot.item.id} and store_id = ${STORE_ID}`
      return updated
    })
    await step(entry, 'Atualizar configuracao critica de forma reversivel e confirmar persistencia', async () => {
      const nextMinutes = Number(snapshot.settings.average_preparation_minutes || 30) === 31 ? 32 : 31
      await sql`
        update store_digital_menu_settings
        set average_preparation_minutes = ${nextMinutes}, updated_at = now()
        where store_id = ${STORE_ID}
      `
      const [updated] = await sql`select average_preparation_minutes from store_digital_menu_settings where store_id = ${STORE_ID}`
      if (Number(updated.average_preparation_minutes) !== nextMinutes) throw new Error('Configuracao critica nao persistiu no banco.')
      await sql`
        update store_digital_menu_settings
        set average_preparation_minutes = ${snapshot.settings.average_preparation_minutes}, updated_at = now()
        where store_id = ${STORE_ID}
      `
      return updated
    })
  })
}

async function scanRoutes(browser, storageState) {
  const adminRoutes = [
    '/dashboard',
    '/menu',
    '/orders',
    '/settings/store',
    '/settings/company',
    '/settings/fiscal',
    '/settings/integracoes',
    '/digital-menu',
    `/digital-menu/preview/${STORE_SLUG}`,
    '/internal',
    '/internal/stores',
    `/internal/stores/${STORE_ID}`,
  ]
  const publicRoutes = [`/cardapio/${STORE_SLUG}`]
  const viewports = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ]

  for (const theme of ['light', 'dark']) {
    for (const viewport of viewports) {
      await scenario(`UI-AUTH-${theme}-${viewport.name}`, `Varredura autenticada ${theme} ${viewport.name}`, 'product', async entry => {
        const { context, page } = await newContext(browser, entry, { storageState, viewport })
        try {
          await setTheme(page, theme)
          for (const route of adminRoutes) {
            await step(entry, `Abrir ${route}`, async () => {
              await navigate(page, route)
              await page.waitForTimeout(600)
              const state = await assertNoHardFailure(page, route)
              await screenshot(page, entry, route)
              if (theme === 'dark' && !state.metrics.darkClass) {
                entry.notes.push(`${route}: sem classe dark no html; validar visualmente no screenshot.`)
              }
              return { url: state.url, metrics: state.metrics }
            })
          }
          await closeContext(context, entry)
        } catch (error) {
          await screenshot(page, entry, 'failure')
          await closeContext(context, entry)
          throw error
        }
      })

      await scenario(`UI-PUBLIC-${theme}-${viewport.name}`, `Varredura publica ${theme} ${viewport.name}`, 'product', async entry => {
        const { context, page } = await newContext(browser, entry, { viewport })
        try {
          await setTheme(page, theme)
          for (const route of publicRoutes) {
            await step(entry, `Abrir ${route}`, async () => {
              await navigate(page, route)
              const state = await assertNoHardFailure(page, route)
              if (!new RegExp(STORE_NAME, 'i').test(state.text)) throw new Error(`Nome da loja ${STORE_NAME} nao apareceu.`)
              await screenshot(page, entry, route)
              return { url: state.url, metrics: state.metrics }
            })
          }
          await closeContext(context, entry)
        } catch (error) {
          await screenshot(page, entry, 'failure')
          await closeContext(context, entry)
          throw error
        }
      })
    }
  }
}

async function validateInternalAccess(browser, storageState) {
  await scenario('AUTHZ-INTERNAL-P0', 'Rotas internas exigem autenticacao e perfil autorizado', 'product', async entry => {
    const anonymous = await newContext(browser, entry, { viewport: { width: 1366, height: 768 } })
    try {
      await step(entry, 'Anonimo nao acessa /internal', async () => {
        await navigate(anonymous.page, '/internal')
        await screenshot(anonymous.page, entry, 'anonymous-internal')
        const state = await collectState(anonymous.page)
        if (/Operacao interna|Painel interno|Criar loja|Solicitacoes/i.test(state.text)) {
          throw new Error('Usuario anonimo conseguiu visualizar conteudo interno.')
        }
        return state
      })
      await closeContext(anonymous.context, entry)

      const authenticated = await newContext(browser, entry, { storageState, viewport: { width: 1366, height: 768 } })
      await step(entry, 'QA ops_admin acessa /internal', async () => {
        await navigate(authenticated.page, '/internal')
        await screenshot(authenticated.page, entry, 'authenticated-internal')
        const state = await assertNoHardFailure(authenticated.page, 'internal autenticado')
        if (!/Intern|loja|admin|oper/i.test(state.text)) throw new Error(`Ops admin nao visualizou area interna. Texto=${state.text.slice(0, 900)}`)
        return state
      })
      await closeContext(authenticated.context, entry)
    } catch (error) {
      await closeContext(anonymous.context, entry).catch(() => {})
      throw error
    }
  })
}

async function writeReport() {
  const summary = {
    runId: RUN_ID,
    startedAt: results[0]?.startedAt || new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    appRoot: APP_ROOT,
    artifactRoot: ARTIFACT_ROOT,
    runDir: RUN_DIR,
    qaEmail: QA_EMAIL,
    store: { id: STORE_ID, name: STORE_NAME, slug: STORE_SLUG },
    totals: {
      scenarios: results.length,
      passed: results.filter(item => item.status === 'passed').length,
      failed: results.filter(item => item.status === 'failed').length,
      productBugCandidates: bugCandidates.filter(item => item.kind === 'product').length,
      harnessFailures: bugCandidates.filter(item => item.kind === 'harness').length,
    },
    createdOrders,
    bugCandidates,
    results,
  }

  fs.writeFileSync(path.join(RUN_DIR, 'regression-results.json'), JSON.stringify(summary, null, 2))

  const rows = results.map(result => `
    <tr class="${result.status}">
      <td>${escapeHtml(result.id)}</td>
      <td>${escapeHtml(result.title)}</td>
      <td>${escapeHtml(result.kind)}</td>
      <td>${escapeHtml(result.status)}</td>
      <td>${Math.round(result.durationMs / 1000)}s</td>
      <td>${result.artifacts.screenshots.map(file => `<a href="${path.relative(RUN_DIR, file).replace(/\\/g, '/')}">print</a>`).join(' ')}</td>
      <td>${result.artifacts.trace ? `<a href="${path.relative(RUN_DIR, result.artifacts.trace).replace(/\\/g, '/')}">trace</a>` : ''}</td>
      <td><pre>${escapeHtml(redacted(result.error || result.notes.join('\n') || JSON.stringify(result.steps, null, 2)).slice(0, 6000))}</pre></td>
    </tr>`).join('\n')

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>KAN-124 Regressao Global Funcional</title>
  <style>
    body{font-family:Arial,sans-serif;margin:24px;color:#111827;background:#f8fafc}
    h1,h2{color:#0f172a}
    table{border-collapse:collapse;width:100%;font-size:13px;background:white}
    th,td{border:1px solid #cbd5e1;padding:8px;vertical-align:top}
    th{background:#e2e8f0;text-align:left}
    tr.failed{background:#fee2e2}
    tr.passed{background:#ecfdf5}
    pre{white-space:pre-wrap;margin:0;max-width:620px}
    .metric{display:inline-block;margin:0 12px 12px 0;padding:8px 10px;background:white;border:1px solid #cbd5e1;border-radius:6px}
  </style>
</head>
<body>
  <h1>KAN-124 Regressao Global Funcional</h1>
  <p>Base: ${escapeHtml(BASE_URL)} | Loja: ${escapeHtml(STORE_NAME)} (#${STORE_ID}) | QA: ${escapeHtml(QA_EMAIL)}</p>
  <p>Diretorio: ${escapeHtml(RUN_DIR)}</p>
  <div>
    <span class="metric">Cenarios: ${summary.totals.scenarios}</span>
    <span class="metric">Passou: ${summary.totals.passed}</span>
    <span class="metric">Falhou: ${summary.totals.failed}</span>
    <span class="metric">Bugs produto: ${summary.totals.productBugCandidates}</span>
    <span class="metric">Falhas harness: ${summary.totals.harnessFailures}</span>
  </div>
  <h2>Pedidos Criados</h2>
  <pre>${escapeHtml(JSON.stringify(createdOrders, null, 2))}</pre>
  <h2>Bugs Candidatos</h2>
  <pre>${escapeHtml(JSON.stringify(bugCandidates, null, 2))}</pre>
  <h2>Resultados</h2>
  <table>
    <thead><tr><th>ID</th><th>Cenario</th><th>Tipo</th><th>Status</th><th>Tempo</th><th>Screenshots</th><th>Trace</th><th>Detalhes</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`
  fs.writeFileSync(path.join(RUN_DIR, 'regression-report.html'), html)
  fs.writeFileSync(path.join(RUN_DIR, 'REGRESSION_SUMMARY.md'), `# KAN-124 Regressao Global Funcional

- Base: ${BASE_URL}
- Loja: ${STORE_NAME} (#${STORE_ID})
- QA: ${QA_EMAIL}
- Diretorio: ${RUN_DIR}
- Cenarios: ${summary.totals.scenarios}
- Passou: ${summary.totals.passed}
- Falhou: ${summary.totals.failed}
- Bugs produto: ${summary.totals.productBugCandidates}
- Falhas harness: ${summary.totals.harnessFailures}

## Pedidos criados

\`\`\`json
${JSON.stringify(createdOrders, null, 2)}
\`\`\`

## Bugs candidatos

\`\`\`json
${JSON.stringify(bugCandidates, null, 2)}
\`\`\`
`)

  return summary
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const authFile = path.join(RUN_DIR, 'qa-auth-storage.json')

  try {
    await scenario('AUTH-QA-P0', 'Login QA com senha e token Clerk conhecido', 'harness', async entry => {
      const storageState = fs.existsSync(QA_AUTH_STORAGE) ? QA_AUTH_STORAGE : undefined
      const { context, page } = await newContext(browser, entry, { storageState })
      try {
        await step(entry, 'Autenticar usuario QA', async () => {
          await loginWithQa(page, entry)
          return collectState(page)
        })
        await step(entry, 'Salvar storage state autenticado', async () => {
          await context.storageState({ path: authFile })
          return { authFile }
        })
        await closeContext(context, entry)
      } catch (error) {
        await screenshot(page, entry, 'failure')
        await closeContext(context, entry)
        throw error
      }
    })

    const hasAuth = fs.existsSync(authFile)
    await createPublicOrder(browser, 'takeout', { name: 'mobile', width: 390, height: 844 })
    await createPublicOrder(browser, 'delivery', { name: 'desktop', width: 1366, height: 768 })
    await validateOrdersInSupabase()
    if (hasAuth) {
      await validateDashboardAndTracking(browser, authFile)
      await validateInternalAccess(browser, authFile)
      await scanRoutes(browser, authFile)
    } else {
      throw new Error('Storage autenticado ausente; nao da para validar dashboard/admin.')
    }
    await validateOwnerControlledPersistence()
  } finally {
    await browser.close().catch(() => {})
    if (sql) await sql.end({ timeout: 5 }).catch(() => {})
  }

  const summary = await writeReport()
  console.log(JSON.stringify({
    runDir: summary.runDir,
    report: path.join(RUN_DIR, 'regression-report.html'),
    totals: summary.totals,
    bugCandidates: summary.bugCandidates.map(item => ({
      summary: item.summary,
      kind: item.kind,
      scenarioId: item.scenarioId,
    })),
  }, null, 2))
  process.exit(summary.totals.failed ? 1 : 0)
}

main().catch(async error => {
  bugCandidates.push({
    summary: '[REGRESSAO GLOBAL] Falha fatal do harness KAN-124',
    kind: 'harness',
    scenarioId: 'FATAL',
    technicalError: redacted(error.stack || error.message),
  })
  const summary = await writeReport()
  console.error(redacted(error.stack || error.message))
  console.error(`Relatorio parcial: ${path.join(summary.runDir, 'regression-report.html')}`)
  process.exit(1)
})
