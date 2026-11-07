// TCG tab, pokemontcg.io + TCGdex together (Nov 2026, before the full switch in docs/tcg-migration.md):
//  - the card source's frozen price is replaced by the latest saved TCGdex price from prices/ (card back, detail, set
//    value, sort); cards the daily saves don't cover keep the source's price
//  - sets only TCGdex has (assets/tcg-new-sets.json) join the set list, newest first, and load their cards from TCGdex
// Usage: node tests/tcg-hybrid.test.js
const { chromium } = require('playwright');
const { serve } = require('./serve');
let failures = 0;
const check = (l, ok, x) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + l + (ok || x === undefined ? '' : '  ' + JSON.stringify(x))); if (!ok) failures++; };
const cors = { 'access-control-allow-origin': '*' };
const GIF = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
const json = (r, body, headers = {}) => r.fulfill({ status: 200, headers: { ...cors, ...headers }, contentType: 'application/json', body: JSON.stringify(body) });

const CARDS = [ // pokemontcg.io: prices frozen in October
  { id: 'zz1-1', name: 'Frozen High', number: '1', rarity: 'Rare', images: { small: 'https://img.test/1.png' }, tcgplayer: { updatedAt: '2026/10/16', prices: { holofoil: { market: 100 } } } },
  { id: 'zz1-2', name: 'Riser', number: '2', rarity: 'Common', images: { small: 'https://img.test/2.png' }, tcgplayer: { updatedAt: '2026/10/16', prices: { normal: { market: 5 } } } },
  { id: 'zz1-3', name: 'Not Saved', number: '3', rarity: 'Common', images: { small: 'https://img.test/3.png' }, tcgplayer: { updatedAt: '2026/10/16', prices: { normal: { market: 7 } } } },
  { id: 'zz1-4', name: 'Old Source Only', number: '4', rarity: 'Common', images: { small: 'https://img.test/4.png' }, tcgplayer: { updatedAt: '2026/10/16', prices: { normal: { market: 9 } } } },
];
const FILES = {
  '/prices/latest.json': { updated: '2026-11-07T08:00:00Z', source: 'tcgdex', sourceSince: '2026-11-05', months: { '2026-10': ['zz1'], '2026-11': ['zz1', 'me06'] } },
  '/prices/2026-10/zz1.json': { days: ['2026-10-30'], cards: { 'zz1-1': [100], 'zz1-2': [5], 'zz1-4': [9] } },
  '/prices/2026-11/zz1.json': { days: ['2026-11-04', '2026-11-05', '2026-11-07'], cards: { 'zz1-1': [100, 80, 82.5], 'zz1-2': [5, 30, 31], 'zz1-4': [9, null, null] } },
  '/prices/2026-11/me06.json': { days: ['2026-11-07'], cards: { 'me06-001': [44] } },
  '/prices/ids/zz1.json': { 'zz1-2': 517045 },
  '/assets/tcg-new-sets.json': [{ id: 'me06', name: 'Delta Reign', releaseDate: '2026-11-06' }],
};

(async () => {
  const { base, close } = await serve();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 375, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('td-cookie-consent', 'denied'); } catch (e) {} });
  const page = await ctx.newPage(); const errors = [], hits = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', r => {
    const u = r.request().url(), p = new URL(u).pathname;
    if (u.startsWith(base) && FILES[p]) return json(r, FILES[p]);
    if (u.startsWith(base) && p.startsWith('/prices/')) return r.abort();
    if (u.startsWith(base)) return r.continue();
    if (u.startsWith('https://api.pokemontcg.io/v2/sets')) return json(r, { data: [{ id: 'zz1', name: 'Test Set', releaseDate: '2026/09/16' }, { id: 'zz0', name: 'Older Set', releaseDate: '2025/01/01' }] });
    if (u.startsWith('https://api.pokemontcg.io/v2/cards')) return json(r, { data: CARDS });
    if (u.startsWith('https://api.tcgdex.net/')) hits.push(p);
    if (u === 'https://api.tcgdex.net/v2/en/sets/me06') return json(r, { id: 'me06', name: 'Delta Reign', cards: [{ id: 'me06-001', localId: '001', name: 'Mega Rayquaza ex', image: 'https://assets.tcgdex.net/en/me/me06/001' }, { id: 'me06-002', localId: '002', name: 'Unpriced Card' }] });
    if (u === 'https://api.tcgdex.net/v2/en/cards/me06-002') return json(r, { id: 'me06-002' });
    if (u.startsWith('https://img.test/') || u.startsWith('https://assets.tcgdex.net/')) return r.fulfill({ status: 200, contentType: 'image/gif', body: GIF });
    return r.abort();
  });

  await page.goto(base + '/tcg');
  await page.waitForFunction(() => document.querySelectorAll('#card-grid .tcard').length > 0, null, { timeout: 15000 });
  const opts = await page.$$eval('#set-select option', o => o.map(x => x.value + ':' + x.textContent));
  check('a set only TCGdex has joins the list, newest first', JSON.stringify(opts) === '["me06:Delta Reign (2026)","zz1:Test Set (2026)","zz0:Older Set (2025)"]', opts);
  check('the newest set (the TCGdex-only one) opens by default', (await page.inputValue('#set-select')) === 'me06');
  { await page.selectOption('#set-select', 'zz1'); await page.waitForFunction(() => document.querySelectorAll('#card-grid .tcard').length === 4 && document.getElementById('set-select').value === 'zz1', null, { timeout: 15000 }); }
  await page.waitForFunction(() => /Set value: \$129\.50/.test(document.getElementById('set-value').textContent), null, { timeout: 8000 }).catch(() => {});
  const value = await page.textContent('#set-value');
  check('set value uses the saved prices (82.50 + 31 + 7 + 9 = 129.50), not the frozen ones', /Set value: \$129\.50 · 4 of 4 cards priced/.test(value), value);
  for (const id of ['zz1-1', 'zz1-2', 'zz1-3', 'zz1-4']) await page.click(`#card-grid .tcard[data-id="${id}"]`);
  await page.waitForTimeout(400);
  const back = id => page.$eval(`#card-grid .tcard[data-id="${id}"] .tb-body`, e => e.textContent.replace(/\s+/g, ' ').trim());
  const b1 = await back('zz1-1'), b3 = await back('zz1-3'), b4 = await back('zz1-4');
  check('card back: latest saved price; trend only since the switch (82.50 vs 80 = +3%, not -17% vs frozen October)', /^\$82\.50 ?TCGplayer market price/.test(b1) && /▲ \+3%/.test(b1) && !!(await page.$('#card-grid .tcard[data-id="zz1-1"] .tb-spark')), b1);
  check('card not in the daily saves keeps the source price', /^\$7\.00 ?TCGplayer market price/.test(b3), b3);
  check('card only saved before the switch keeps the source price (no stale saved value)', /^\$9\.00/.test(b4), b4);
  await page.selectOption('#card-sort', 'price-desc');
  const order = await page.$$eval('#card-grid .nm', n => n.map(x => x.textContent));
  check('sort by price uses the saved prices', JSON.stringify(order) === '["Frozen High","Riser","Old Source Only","Not Saved"]', order);
  await page.click('#card-grid .tcard[data-id="zz1-2"] .tc-zoom');
  await page.waitForFunction(() => document.getElementById('card-detail').open, null, { timeout: 8000 });
  const det = (await page.textContent('#cdd-body')).replace(/\s+/g, ' ');
  check('card detail: saved price with its date', /\$31\.00 ?TCGplayer market price · updated 2026-11-07/.test(det), det.slice(0, 200));
  const shop = await page.evaluate(() => [...document.querySelectorAll('#cdd-body .cdd-shop a')].map(a => ({ href: a.getAttribute('href'), rel: a.rel, t: a.target, txt: a.textContent, h: a.getBoundingClientRect().height })));
  check('card detail: BUY ON TCGPLAYER goes to the exact product (saved product ID); FIND ON EBAY searches name + set + number', shop.length === 2 && shop[0].href === 'https://www.tcgplayer.com/product/517045' && shop[1].href === 'https://www.ebay.com/sch/i.html?_nkw=Riser%20Test%20Set%202' && shop.every(x => /sponsored/.test(x.rel) && x.t === '_blank' && x.h >= 44), shop);
  check('card detail: affiliate disclosure next to the shop links', /Shop links are affiliate links: Trainer Desk may earn a small commission/.test(det));
  await page.click('#cdd-next'); await page.waitForTimeout(200);
  const shop2 = await page.$eval('#cdd-body .cdd-shop a', a => a.getAttribute('href'));
  check('card without a saved product ID: TCGplayer search by name instead', /^https:\/\/www\.tcgplayer\.com\/search\/pokemon\/product\?productLineName=pokemon&q=/.test(shop2), shop2);
  await page.keyboard.press('Escape');
  check('no per-card TCGdex lookups for a pokemontcg.io set', !hits.some(h => h.startsWith('/v2/en/cards/')), hits);

  // the TCGdex-only set loads from TCGdex; saved price used, the other looked up when flipped
  await page.selectOption('#set-select', 'me06');
  await page.waitForFunction(() => document.querySelectorAll('#card-grid .tcard').length === 2, null, { timeout: 15000 });
  const st = await page.textContent('#tcg-status');
  check('TCGdex-only set: cards load from TCGdex, status says so', /^2 cards · via TCGdex/.test(st) && hits.includes('/v2/en/sets/me06'), st);
  await page.waitForTimeout(500);
  await page.click('#card-grid .tcard[data-id="me06-001"]'); await page.click('#card-grid .tcard[data-id="me06-002"]');
  await page.waitForFunction(() => /No price listed/.test(document.querySelector('#card-grid .tcard[data-id="me06-002"] .tb-body').textContent), null, { timeout: 8000 });
  check('TCGdex-only set: saved price shown without a lookup; unpriced card looked up on flip', /^\$44\.00/.test(await back('me06-001')) && !hits.includes('/v2/en/cards/me06-001') && hits.includes('/v2/en/cards/me06-002'), hits);
  const img = await page.$eval('#card-grid .tcard[data-id="me06-001"] img', i => i.src);
  check('TCGdex-only set: card art hotlinked from TCGdex', img === 'https://assets.tcgdex.net/en/me/me06/001/low.webp', img);
  // deep link from a set page
  await page.goto(base + '/tcg?set=me06');
  await page.waitForFunction(() => document.getElementById('set-select').value === 'me06' && document.querySelectorAll('#card-grid .tcard').length === 2, null, { timeout: 15000 }).catch(() => {});
  check('/tcg?set=me06 opens the TCGdex-only set', (await page.inputValue('#set-select')) === 'me06');
  const footer = await page.textContent('footer');
  check('footer credits TCGdex for card prices', /card prices are TCGplayer market prices saved daily from TCGdex/.test(footer));
  check('no uncaught JS errors', !errors.length, errors);
  await b.close(); close();
  console.log(failures ? `\n${failures} TCG HYBRID CHECK(S) FAILED` : '\nALL TCG HYBRID CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})();
