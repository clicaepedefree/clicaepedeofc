const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const {chromium} = createRequire('D:/ProjetoIA/codex/clicaepede/node_modules/fallback.js')('playwright');
const output = path.join('D:/ProjetoIA/codex/clicaepede/qa-evidences/KAN-132',
  new Date().toISOString().replace(/[:.]/g, '-'));
const results = [];
const escape = value => String(value).replace(/[&<>"']/g,
  char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));

async function main() {
  fs.mkdirSync(output, {recursive:true});
  const browser = await chromium.launch({headless:true});
  const context = await browser.newContext({viewport:{width:1280,height:900}, recordVideo:{dir:output}});
  await context.tracing.start({screenshots:true, snapshots:true});
  try {
    const page = await context.newPage();
    for (const [name, url] of [
      ['evolution', 'https://evolution-staging.clicaepede.com.br/'],
      ['login', 'https://clicaepedeofc.vercel.app/login'],
      ['menu', 'https://clicaepedeofc.vercel.app/cardapio/ccocobongo'],
    ]) {
      try {
        const response = await page.goto(url, {waitUntil:'domcontentloaded'});
        if (response?.status() !== 200) throw new Error('Expected HTTP200');
        if (name === 'login') {
          const email = page.getByRole('textbox', {name:/e.?mail/i});
          await email.fill('qaclicapede+clerk_test@gmail.com');
          if (await email.inputValue() !== 'qaclicapede+clerk_test@gmail.com') throw new Error('Login field failed');
        } else if (name === 'menu') await page.getByText(/Ccocobongo/i).first().waitFor();
        else if ((await response.json()).version !== '2.3.7') throw new Error('Evolution version mismatch');
        if (/Application error|server-side exception/i.test(await page.locator('body').innerText())) throw new Error('Runtime error');
        results.push({name,url,status:'PASS'});
      } catch (error) { results.push({name,url,status:'FAIL',error:error.message}); }
      await page.screenshot({path:path.join(output, `${name}.png`), fullPage:true});
    }
  } finally {
    await context.tracing.stop({path:path.join(output, 'trace.zip')});
    await context.close();
    await browser.close();
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results,null,2));
    fs.writeFileSync(path.join(output, 'report.html'),
      '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>KAN-132</title><h1>KAN-132: smoke</h1>' +
      '<p>Sem login completo, pareamento, mensagem ou pedido. API e persistencia testadas separadamente.</p>' +
      results.map(row => `<h2>${escape(row.name)}: ${escape(row.status)}</h2><p>${escape(row.error || row.url)}</p>`).join('') + '</html>');
  }
  console.log(JSON.stringify({output,results},null,2));
  if (results.some(row => row.status !== 'PASS')) process.exitCode = 1;
}
main().catch(error => {console.error(error.message); process.exitCode=1;});
