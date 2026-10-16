// Card detail view (TCG tab): zoom button opens a dialog with big image, facts, price, history chart with hover tooltip,
// price table, binder toggle, share link, prev/next + arrow keys + swipe order, deep link, close, phone layout.
// Usage: node tests/card-detail.test.js
const { chromium } = require('playwright');
const { serve } = require('./serve');
let failures = 0;
const check = (l, ok, x) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + l + (ok || x === undefined ? '' : '  ' + JSON.stringify(x))); if (!ok) failures++; };
const cors = { 'access-control-allow-origin': '*' };
const GIF = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
const CARDS = [
  { id: 'zz1-1', name: 'Blazer ex', number: '1', rarity: 'Special Illustration Rare', hp: '230', supertype: 'Pokémon', types: ['Fire'], artist: 'Some Artist', set: { printedTotal: 3 },
    flavorText: 'SHOULD NEVER APPEAR', attacks: [{ name: 'Secret Attack', text: 'NOPE' }],
    images: { small: 'https://images.pokemontcg.io/zz1/1.png', large: 'https://images.pokemontcg.io/zz1/1_hires.png' }, tcgplayer: { updatedAt: '2026/10/14', prices: { holofoil: { market: 12 } } } },
  { id: 'zz1-2', name: 'Plain Card', number: '2', rarity: 'Common', supertype: 'Trainer', set: { printedTotal: 3 }, images: { small: 'https://images.pokemontcg.io/zz1/2.png' }, tcgplayer: { prices: { normal: { market: 0.5 } } } },
  { id: 'zz1-3', name: 'Third Card', number: '3', rarity: 'Rare', set: { printedTotal: 3 }, images: { small: 'https://images.pokemontcg.io/zz1/3.png' } },
];
const files = {
  '/prices/latest.json': { updated: 'x', months: { '2026-10': ['zz1'] } },
  '/prices/2026-10/zz1.json': { days: ['2026-10-01', '2026-10-07', '2026-10-14'], cards: { 'zz1-1': [10, 9, 12], 'zz1-2': [null, null, 0.5] } },
};

async function open(b, base, path = '/tcg') {
  const ctx = await b.newContext({ viewport: { width: 375, height: 800 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('td-cookie-consent', 'denied'); } catch (e) {} });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await ctx.newPage(); page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
  page.imgs = [];
  await page.route('**/*', r => {
    const u = r.request().url(), p = new URL(u).pathname;
    if (u.startsWith(base) && p.startsWith('/prices/')) return files[p] ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(files[p]) }) : r.abort();
    if (u.startsWith(base)) return r.continue();
    if (u.startsWith('https://api.pokemontcg.io/v2/sets')) return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'zz1', name: 'Test Set', releaseDate: '2026/01/01' }] }) });
    if (u.startsWith('https://api.pokemontcg.io/v2/cards')) return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ data: CARDS }) });
    if (u.startsWith('https://images.pokemontcg.io/')) { page.imgs.push(p); return r.fulfill({ status: 200, contentType: 'image/gif', body: GIF }); }
    return r.abort();
  });
  await page.goto(base + path);
  await page.waitForFunction(() => document.querySelectorAll('#card-grid .tcard').length === 3, null, { timeout: 10000 });
  await page.waitForTimeout(400);
  return { ctx, page };
}
const body = page => page.textContent('#cdd-body');

(async () => {
  const { base, close } = await serve();
  const b = await chromium.launch();
  let { ctx, page } = await open(b, base);
  const zoom = await page.$eval('#card-grid .tcard[data-id="zz1-1"] .tc-zoom', e => { const r = e.getBoundingClientRect(); return [r.width, r.height]; });
  check('zoom button on card fronts is a 44px tap target', zoom[0] >= 44 && zoom[1] >= 44, zoom);
  await page.click('#card-grid .tcard[data-id="zz1-1"] .tc-zoom'); await page.waitForTimeout(300);
  check('zoom opens the detail dialog without flipping the card', await page.$eval('#card-detail', d => d.open) && !(await page.$eval('#card-grid .tcard[data-id="zz1-1"]', e => e.classList.contains('flipped'))));
  const t = await body(page);
  check('facts: set, number of total, rarity, card type, HP, illustrator', /Test Set/.test(t) && /#1 of 3/.test(t) && /Special Illustration Rare/.test(t) && /Pokémon · Fire/.test(t) && /230/.test(t) && /Some Artist/.test(t), t.replace(/\s+/g, ' '));
  check('no attack or flavor text', !/SHOULD NEVER APPEAR|Secret Attack|NOPE/.test(t));
  check('large image requested; rare card gets the holo shine', page.imgs.includes('/zz1/1_hires.png') && await page.$eval('.cdd-art', e => e.classList.contains('holo')), page.imgs);
  check('price shown', /\$12\.00/.test(t) && /TCGplayer market price/.test(t));
  check('history chart: 3 points, summary with change, low/high', (await page.$eval('.cdd-chart', e => e.dataset.n)) === '3' && /\$10\.00 → \$12\.00/.test(t) && /\+20%/.test(t) && /low \$9\.00/.test(t) && /high \$12\.00/.test(t), t.replace(/\s+/g, ' '));
  const svg = await page.$('.cdd-chart svg'); const bb = await svg.boundingBox();
  await page.mouse.move(bb.x + bb.width * 0.55, bb.y + bb.height / 2); await page.waitForTimeout(100);
  check('hovering the chart shows a tooltip with date and price', /\$9\.00/.test(await page.textContent('.cdd-tip')) && !(await page.$eval('.cdd-tip', e => e.hidden)), await page.textContent('.cdd-tip'));
  await page.click('.cdd-chart summary');
  check('price table view (newest first)', (await page.$$eval('.cdd-chart tr', r => r.map(x => x.textContent))).length === 3 && /\$12\.00/.test(await page.textContent('.cdd-chart tr')));
  await page.click('#cdd-binder');
  check('ADD TO BINDER from the dialog updates the grid button too', /IN BINDER/.test(await page.textContent('#cdd-binder')) && /IN BINDER/.test(await page.textContent('#card-grid [data-add="zz1-1"]')));
  await page.evaluate(() => { navigator.share = undefined; });
  await page.click('#cdd-share'); await page.waitForTimeout(150);
  const link = await page.evaluate(() => navigator.clipboard.readText());
  check('SHARE copies a deep link', /\/tcg\?set=zz1&card=zz1-1$/.test(link), link);
  check('position and prev disabled on first card', (await page.textContent('#cdd-pos')) === '1 / 3' && await page.$eval('#cdd-prev', e => e.disabled));
  await page.click('#cdd-next'); await page.waitForTimeout(100);
  check('next card; one-day history shows the note instead of a chart', /Plain Card/.test(await body(page)) && !(await page.$('.cdd-chart')) && /two or more days/.test(await body(page)));
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(100);
  check('arrow key moves on; card with no price says so', /Third Card/.test(await body(page)) && /No price listed/.test(await body(page)) && await page.$eval('#cdd-next', e => e.disabled));
  const bx = await page.$eval('#cdd-body', e => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + 200]; });
  await page.mouse.move(bx[0] - 100, bx[1]); await page.mouse.down(); await page.mouse.move(bx[0] + 60, bx[1]); await page.mouse.up(); await page.waitForTimeout(100);
  check('swipe right goes back', /Plain Card/.test(await body(page)));
  const lay = await page.evaluate(() => { const d = document.getElementById('card-detail').getBoundingClientRect(); const small = [...document.querySelectorAll('#card-detail button')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.width < 44 || r.height < 44); }).length; return { w: d.width, vw: innerWidth, small, overflow: document.getElementById('cdd-body').scrollWidth - document.getElementById('cdd-body').clientWidth }; });
  check('375px: dialog fills the screen, no sideways scroll, buttons >= 44px', lay.w === lay.vw && lay.overflow <= 0 && !lay.small, lay);
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  check('Escape closes it', !(await page.$eval('#card-detail', d => d.open)));
  await page.click('#card-grid .tcard[data-id="zz1-2"] .tc-zoom'); await page.click('#cdd-close'); await page.waitForTimeout(100);
  check('close button closes it', !(await page.$eval('#card-detail', d => d.open)));
  const errs = page.errors; await ctx.close();

  ({ ctx, page } = await open(b, base, '/tcg?set=zz1&card=zz1-3'));
  await page.waitForTimeout(300);
  check('deep link opens that card', await page.$eval('#card-detail', d => d.open) && /Third Card/.test(await body(page)));
  check('no uncaught JS errors', !errs.length && !page.errors.length, errs.concat(page.errors));
  await b.close(); close();
  console.log(failures ? `\n${failures} CARD DETAIL CHECK(S) FAILED` : '\nALL CARD DETAIL CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})();
