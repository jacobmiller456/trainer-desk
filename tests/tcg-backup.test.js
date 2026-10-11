// TCG failover: when pokemontcg.io fails, the page must switch to TCGdex and still show real card art.
// Usage: node tests/tcg-backup.test.js index.html
const { chromium } = require('playwright');
const path = require('path');
const url = 'file://' + path.resolve(process.argv[2]);
const cors = { 'access-control-allow-origin': '*' };
const GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
let failures = 0;
const check = (l, ok, x) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + l + (ok || x === undefined ? '' : '  ' + JSON.stringify(x))); if (!ok) failures++; };

async function scenario(name, ptcg) {
  const b = await chromium.launch(); const page = await b.newPage();
  const errors = []; const hits = { ptcg: 0, tcgdex: 0 }; const imgs = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', r => {
    const u = r.request().url();
    if (u.startsWith('file://')) return r.continue();
    if (u.startsWith('https://api.pokemontcg.io/')) { hits.ptcg++; return ptcg(r, u); }
    if (u === 'https://api.tcgdex.net/v2/en/sets') { hits.tcgdex++; return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify([{ id: 'old1', name: 'Old Set', cardCount: { total: 2 } }, { id: 'new1', name: 'New Set', cardCount: { total: 3 } }]) }); }
    if (u === 'https://api.tcgdex.net/v2/en/sets/new1') { hits.tcgdex++; return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ id: 'new1', name: 'New Set', cards: [{ id: 'new1-1', localId: '1', name: 'Dex Card A', image: 'https://assets.tcgdex.net/en/x/new1/1' }, { id: 'new1-2', localId: '2', name: 'Dex Card B' }] }) }); }
    if (u === 'https://api.tcgdex.net/v2/en/cards/new1-1') { hits.tcgdex++; return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ id: 'new1-1', pricing: { tcgplayer: { updated: '2026-10-10T00:00:00Z', unit: 'USD', 'reverse-holofoil': { lowPrice: 1, marketPrice: 3.2 } }, cardmarket: { trend: 2 } } }) }); }
    if (u === 'https://api.tcgdex.net/v2/en/cards/new1-2') { hits.tcgdex++; return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ id: 'new1-2' }) }); }
    if (u.startsWith('https://assets.tcgdex.net/')) { imgs.push(u); return r.fulfill({ status: 200, contentType: 'image/gif', body: Buffer.from('R0lGODlhAQABAAAAACw=', 'base64') }); }
    return r.abort();
  });
  await page.goto(url);
  await page.click('button[data-view="tcg"]');
  await page.waitForFunction(() => document.querySelectorAll('#card-grid .tcard').length === 2, null, { timeout: 15000 });
  const status = await page.textContent('#tcg-status');
  const names = await page.$$eval('#card-grid .nm', n => n.map(x => x.textContent));
  const srcs = await page.$$eval('#card-grid img', n => n.map(x => x.src));
  const firstSet = await page.$eval('#set-select', s => s.options[0].textContent);
  check(`${name}: falls back to TCGdex cards`, names.join() === 'Dex Card A,Dex Card B', names);
  check(`${name}: status credits TCGdex`, status.startsWith('2 cards · via TCGdex'), status);
  check(`${name}: real art URL built (low.webp), card without art gets placeholder`, srcs.length === 1 && srcs[0] === 'https://assets.tcgdex.net/en/x/new1/1/low.webp', srcs);
  // prices are looked up when a card is flipped, not up front
  const tdBefore = hits.tcgdex;
  await page.click('#card-grid .tcard[data-id="new1-1"]');
  await page.click('#card-grid .tcard[data-id="new1-2"]');
  await page.waitForFunction(() => /No price listed/.test(document.querySelector('#card-grid .tcard[data-id="new1-2"] .tb-body').textContent), null, { timeout: 8000 });
  const prices = await page.$$eval('#card-grid .tcard', n => n.map(x => x.querySelector('.tb-body').textContent));
  check(`${name}: flipping fetched exactly the two prices`, hits.tcgdex - tdBefore === 2, hits.tcgdex - tdBefore);
  check(`${name}: back of card shows the TCGdex price, or says none is listed`, /^\$3\.20TCGplayer market priceUpdated 2026-10-10$/.test(prices[0]) && prices[1] === 'No price listed', prices);
  await page.waitForFunction(() => /1 found, 1 not listed/.test(document.querySelector('#tcg-status').textContent), null, { timeout: 8000 });
  check(`${name}: status explains prices (1 found, 1 not listed)`, true);
  // bulk loader: one press prices the whole set; sort + set value then work; prices persist across reloads
  check(`${name}: LOAD ALL PRICES visible in backup mode`, await page.isVisible('#load-prices'));
  await page.click('#load-prices');
  await page.waitForFunction(() => /Set value: \$3\.20 · 1 of 2 cards priced/.test(document.getElementById('set-value').textContent), null, { timeout: 8000 });
  check(`${name}: set value shown after bulk load`, true);
  await page.selectOption('#card-sort', 'price-desc');
  const order = await page.$$eval('#card-grid .nm', n => n.map(x => x.textContent));
  check(`${name}: priced card sorts first`, order[0] === 'Dex Card A', order);
  const priceHitsBefore = hits.tcgdex;
  check(`${name}: newest set listed first`, firstSet === 'New Set', firstSet);
  check(`${name}: no uncaught JS errors`, !errors.length, errors);
  // the choice sticks for the session: a reload goes straight to the backup, no second wait on the dead primary
  const before = hits.ptcg;
  await page.reload(); await page.click('button[data-view="tcg"]');
  await page.waitForFunction(() => document.querySelectorAll('#card-grid .tcard').length === 2, null, { timeout: 15000 });
  await page.waitForFunction(() => /Set value: \$3\.20/.test(document.getElementById('set-value').textContent), null, { timeout: 8000 });
  check(`${name}: prices remembered across reload (no new lookups)`, hits.tcgdex === priceHitsBefore, { before: priceHitsBefore, after: hits.tcgdex });
  check(`${name}: reload skips the failed primary`, hits.ptcg === before, { before, after: hits.ptcg });
  await b.close();
}

(async () => {
  await scenario('primary unreachable', r => r.abort());
  await scenario('primary 504', r => r.fulfill({ status: 504, headers: cors, body: 'gateway timeout' }));
  // sets answer fine but the card request fails -> still switches over
  await scenario('sets ok, cards fail', (r, u) => u.includes('/sets')
    ? r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'liv1', name: 'Live Set', releaseDate: '2025/01/01' }] }) })
    : r.abort());
  console.log(failures ? `\n${failures} BACKUP CHECK(S) FAILED` : '\nALL BACKUP CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})();
