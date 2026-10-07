const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const requireQA = createRequire('D:/ProjetoIA/codex/clicaepede/node_modules/fallback.js');
const { chromium } = requireQA('playwright');
const output = path.join('D:/ProjetoIA/codex/clicaepede/qa-evidences/KAN-131',
  new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(output, { recursive: true });
const results = [];
const escape = (text) => String(text).replace(/[&<>"']/g,
  (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 }, recordVideo: { dir: output },
  });
  await context.tracing.start({ screenshots: true, snapshots: true });
  try {
    const page = await context.newPage();
    for (const [name, url] of [
      ['login', 'https://clicaepedeofc.vercel.app/login'],
      ['menu-qa', 'https://clicaepedeofc.vercel.app/cardapio/ccocobongo'],
    ]) {
      try {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
        if (!response || response.status() !== 200) throw new Error(`HTTP ${response?.status()}`);
        if (name === 'login') {
          const email = page.getByRole('textbox', { name: /e.?mail/i });
          await email.waitFor({ state: 'visible' });
          await email.fill('qaclicapede+clerk_test@gmail.com');
          if (await email.inputValue() !== 'qaclicapede+clerk_test@gmail.com') {
            throw new Error('Email field did not respond');
          }
        } else {
          await page.getByText(/Ccocobongo/i).first().waitFor({ state: 'visible' });
        }
        const body = await page.locator('body').innerText();
        if (/Application error|server-side exception/i.test(body)) throw new Error('Runtime error page');
        await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
        results.push({ name, url, status: 'PASS', detail: body.slice(0, 500) });
      } catch (error) {
        results.push({ name, url, status: 'FAIL', detail: error.message });
        await page.screenshot({ path: path.join(output, `${name}-failed.png`), fullPage: true });
      }
    }
  } finally {
    await context.tracing.stop({ path: path.join(output, 'trace.zip') });
    await context.close();
    await browser.close();
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
    fs.writeFileSync(path.join(output, 'report.html'),
      '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>KAN-131 smoke</title>' +
      '<h1>KAN-131: disponibilidade Vercel</h1><p>Smoke limitado: sem login autenticado ou envio de pedido.</p>' +
      results.map((r) => `<section><h2>${escape(r.name)}: ${r.status}</h2><pre>${escape(r.detail)}</pre></section>`).join('') + '</html>');
  }
  console.log(JSON.stringify({ output, results }, null, 2));
  if (results.some((r) => r.status !== 'PASS')) process.exitCode = 1;
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
