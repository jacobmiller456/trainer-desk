// TCG tab on the site's own card catalog (tcgdata/, built by scripts/build-pages.mjs): the real generated files, with
// every live card API blocked. Set list, card list, facts (HP, illustrator), TCGdex picture fallback, saved prices,
// binder IDs, deep links, the card finder, and the fallback to pokemontcg.io when the catalog can't load.
// Usage: node tests/tcg-site.test.js
const { chromium } = require('playwright');
const { serve } = require('./serve');
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
let failures = 0;
const check = (l, ok, x) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + l + (ok || x === undefined ? '' : '  ' + JSON.stringify(x))); if (!ok) failures++; };
const cors = { 'access-control-allow-origin': '*' };
const GIF = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
const json = (r, body) => r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });

async function open(b, base, { catalog = true, path: p = '/tcg' } = {}) {
  const ctx = await b.newContext({ viewport: { width: 375, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('td-cookie-consent', 'denied'); } catch (e) {} });
  const page = await ctx.newPage(); page.errors = []; page.apis = []; page.on('pageerror', e => page.errors.push(e.message));
  await page.route('**/*', r => {
    const u = r.request().url(), q = new URL(u).pathname;
    if (u.startsWith(base) && q.startsWith('/tcgdata/')) { const f = path.join(root, q); return catalog && fs.existsSync(f) ? r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync(f) }) : r.fulfill({ status: 404 }); }
    if (u.startsWith(base) && q === '/prices/latest.json') return json(r, { updated: '2026-11-11T08:00:00Z', source: 'tcgdex', sourceSince: '2026-11-05', months: { '2026-11': ['sv3pt5'] } });
    if (u.startsWith(base) && q === '/prices/2026-11/sv3pt5.json') return json(r, { days: ['2026-11-05', '2026-11-11'], cards: { 'sv3pt5-199': [298.38, 305] } });
    if (u.startsWith(base) && q.startsWith('/prices/')) return r.fulfill({ status: 404 });
    if (u.startsWith(base)) return r.continue();
    if (u.startsWith('https://api.pokemontcg.io/') || u.startsWith('https://api.tcgdex.net/')) { page.apis.push(u); if (!catalog && u.startsWith('https://api.pokemontcg.io/v2/sets')) return json(r, { data: [{ id: 'zz1', name: 'Live Set', releaseDate: '2026/01/01' }] }); if (!catalog && u.startsWith('https://api.pokemontcg.io/v2/cards')) return json(r, { data: [{ id: 'zz1-1', name: 'Live Card', number: '1' }] }); return r.abort(); }
    if (u.startsWith('https://images.pokemontcg.io/')) return r.abort(); // main picture server gone: TCGdex copy must be used
    if (u.startsWith('https://assets.tcgdex.net/') || u.startsWith('https://images.scrydex.com/')) return r.fulfill({ status: 200, contentType: 'image/gif', body: GIF });
    return r.abort();
  });
  await page.goto(base + p);
  return { ctx, page };
}

(async () => {
  const { base, close } = await serve();
  const b = await chromium.launch();
  const sets = JSON.parse(fs.readFileSync(path.join(root, 'tcgdata/sets.json'), 'utf8'));
  let { ctx, page } = await open(b, base);
  await page.waitForFunction(() => document.querySelectorAll('#card-grid .tcard').length > 0, null, { timeout: 15000 });
  const opts = await page.$$eval('#set-select option', o => o.map(x => x.value));
  check('set list comes from the catalog, newest first', opts.length === sets.length && opts[0] === sets[0].id && opts.includes('sv3pt5'), { n: opts.length, first: opts[0] });
  await page.selectOption('#set-select', 'sv3pt5');
  await page.waitForFunction(() => document.querySelectorAll('#card-grid .tcard').length === 207, null, { timeout: 15000 });
  check('151: all 207 cards from the catalog, status without a backup tag', /^207 cards$/.test((await page.textContent('#tcg-status')).trim()), await page.textContent('#tcg-status'));
  check('no live card API was called', !page.apis.length, page.apis.slice(0, 3));
  await page.waitForTimeout(1200);
  const src = await page.$eval('#card-grid .tcard[data-id="sv3pt5-1"] img', i => i.src).catch(() => '');
  check('main picture server down: the card shows its TCGdex picture instead (hotlinked)', src === 'https://assets.tcgdex.net/en/sv/sv03.5/001/low.webp', src);
  await page.click('#card-grid .tcard[data-id="sv3pt5-199"] .tc-zoom');
  await page.waitForFunction(() => document.getElementById('card-detail').open, null, { timeout: 8000 });
  await page.waitForFunction(() => /\$305\.00/.test(document.getElementById('cdd-body').textContent), null, { timeout: 8000 }).catch(() => {});
  const det = (await page.textContent('#cdd-body')).replace(/\s+/g, ' ');
  check('card detail: facts from the catalog (set, number, rarity, HP, illustrator) and the saved price', /Charizard ex/.test(det) && /151/.test(det) && /#199 of 165/.test(det) && /Special Illustration Rare/.test(det) && /HP ?330/.test(det) && /miki kudo/.test(det) && /\$305\.00/.test(det), det.slice(0, 300));
  await page.click('#cdd-binder');
  const binder = await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('td-binders-v1') || '{}')));
  check('binder saves the same card ID as before the switch (sv3pt5-199)', binder.includes('"sv3pt5-199"'), binder.slice(0, 200));
  await page.keyboard.press('Escape');
  // card finder on the catalog
  await page.fill('#scan-q', 'Charizard 199/165'); await page.click('#scan-form button');
  await page.waitForSelector('#scan-results .sc-row', { timeout: 15000 });
  const rows = await page.$$eval('#scan-results .sc-row', a => a.map(x => x.dataset.card));
  check('finder searches the catalog: Charizard 199/165 = 151 #199, no live API', rows[0] === 'sv3pt5-199' && !page.apis.length, { rows, apis: page.apis.slice(0, 2) });
  let errs = page.errors; await ctx.close();

  // deep link into the newest set
  ({ ctx, page } = await open(b, base, { path: '/tcg?set=me6&card=me6-1' }));
  await page.waitForFunction(() => document.getElementById('card-detail').open, null, { timeout: 15000 }).catch(() => {});
  check('/tcg?set=me6&card=me6-1 opens Delta Reign #1', (await page.inputValue('#set-select')) === 'me6' && /Heracross/.test(await page.textContent('#cdd-name').catch(() => '')));
  errs = errs.concat(page.errors); await ctx.close();

  // catalog unreachable: pokemontcg.io as before
  ({ ctx, page } = await open(b, base, { catalog: false }));
  await page.waitForFunction(() => document.querySelectorAll('#card-grid .tcard').length === 1, null, { timeout: 15000 }).catch(() => {});
  check('catalog unavailable: falls back to pokemontcg.io', (await page.inputValue('#set-select')) === 'zz1' && /Live Card/.test(await page.textContent('#card-grid')));
  errs = errs.concat(page.errors); await ctx.close();

  check('no uncaught JS errors', !errs.length, errs);
  await b.close(); close();
  console.log(failures ? `\n${failures} TCG CATALOG CHECK(S) FAILED` : '\nALL TCG CATALOG CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})();
