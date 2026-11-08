// Price history: the daily snapshot script (fake TCGdex, temp folder) and the sparkline on card backs (mocked API + price files).
// Usage: node tests/price-history.test.js
const { chromium } = require('playwright');
const { serve } = require('./serve');
const fs = require('fs'), os = require('os'), path = require('path');
let failures = 0;
const check = (l, ok, x) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + l + (ok || x === undefined ? '' : '  ' + JSON.stringify(x))); if (!ok) failures++; };
const cors = { 'access-control-allow-origin': '*' };
const GIF = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');

async function scriptChecks() {
  const S = await import('../scripts/snapshot-prices.mjs');
  const tp = (o) => ({ pricing: { tcgplayer: { updated: '2026-11-05', unit: 'USD', ...o } } });
  check('usdPrice (TCGdex): first variant with market, else mid; ignores non-variant fields', S.usdPrice(tp({ normal: { midPrice: 0.5 }, holofoil: { marketPrice: 3 } })) === 0.5 && S.usdPrice(tp({ holofoil: { marketPrice: 2.345 } })) === 2.35 && S.usdPrice(tp({ normal: { marketPrice: 0, midPrice: null } })) === null && S.usdPrice({}) === null && S.usdPrice(null) === null);
  const plan = S.planSets([{ id: 'old1', rel: '2001-01-01' }, { id: 'old2', rel: '2003-01-01' }, { id: 'oldwk', rel: '2004-01-01' }, { id: 'new1', rel: '2026-03-01' }, { id: 'new2', rel: '2026-09-01' }, { id: 'done', rel: '2026-10-01' }, { id: 'bad id', rel: '' }],
    { day: '2026-10-15', last: id => ({ old1: '2026-10-08', old2: '', oldwk: '2026-10-10', done: '2026-10-15', new1: '2026-10-14' })[id] || '' });
  check('planSets: recent sets daily (skip saved today), older sets weekly, recent first then stalest', JSON.stringify(plan) === '["new2","new1","old2","old1"]', plan);
  check('setOf keeps dashes inside set ids', S.setOf('sv3pt5-1') === 'sv3pt5' && S.setOf('swsh12pt5gg-GG01') === 'swsh12pt5gg');
  check('cardIds: pokemontcg.io sets via the ID map, TCGdex-added sets by their own IDs', JSON.stringify(S.cardIds({ id: 'sv1', cards: [['1']] }, { sets: { sv1: { id: 'sv01', cards: { 1: 'sv01-001' } } } })) === '{"sv1-1":"sv01-001"}' && JSON.stringify(S.cardIds({ id: 'me06', src: 'tcgdex', cards: [['004']] }, null)) === '{"me06-004":"me06-004"}');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'td-prices-'));
  // our data: sv1 (4 cards, recent), me2 (2 cards, recent), bad1 (always fails), tdx1 (added from TCGdex)
  fs.writeFileSync(path.join(dir, 'tcg.json'), JSON.stringify([
    { id: 'sv1', releaseDate: '2026-01-01', cards: [['1'], ['2'], ['3'], ['4']] }, { id: 'me2', releaseDate: '2026-02-01', cards: [['5'], ['6']] },
    { id: 'bad1', releaseDate: '2026-03-01', cards: [['1']] }, { id: 'tdx1', src: 'tcgdex', releaseDate: '2026-10-01', cards: [['007']] }, { id: 'nomap', releaseDate: '2026-04-01', cards: [['1']] }]));
  fs.writeFileSync(path.join(dir, 'map.json'), JSON.stringify({ sets: { sv1: { id: 'sv01', cards: { 1: 'sv01-001', 2: 'sv01-002', 3: 'sv01-003', 4: 'sv01-004' } }, me2: { id: 'me02', cards: { 5: 'me02-005', 6: 'me02-006' } }, bad1: { id: 'bad01', cards: { 1: 'bad01-001' } } } }));
  let me2Fails = 0, calls = [];
  const fake = (mult, opts = {}) => async url => {
    const id = decodeURIComponent(new URL(url).pathname.split('/').pop()); calls.push(id);
    if (id.startsWith('bad01') || (opts.flaky && id.startsWith('me02') && me2Fails++ < 6)) return { ok: false, status: 502 };
    if (id === 'me02-006') return { ok: true, status: 200, json: async () => ({ id, pricing: { cardmarket: { trend: 3 } } }) }; // no TCGplayer price
    if (id === 'sv01-004' && opts.gone) return { ok: false, status: 404 };
    const n = parseInt(id.split('-')[1], 10);
    return { ok: true, status: 200, json: async () => ({ id, pricing: { tcgplayer: { normal: { productId: 9000 + n, marketPrice: n * mult } } } }) };
  };
  const logs = [];
  const run = (day, mult, opts) => S.snapshot({ dir, dataFile: path.join(dir, 'tcg.json'), mapFile: path.join(dir, 'map.json'), now: new Date(day + 'T08:00:00Z'), fetchImpl: fake(mult, opts), retryMs: 0, minCards: 3, log: m => logs.push(m) });
  const r1 = await run('2026-10-30', 1, { flaky: true });
  check('a failing set is retried, then skipped without failing the run', JSON.stringify(r1.failed) === '["bad1"]' && r1.sets === 3 && logs.some(l => /me2 failed.*will retry/.test(l)) && logs.some(l => /bad1 failed.*skipped this run/.test(l)), { r1, logs });
  check('sets with no ID map entry are left out', !calls.some(c => /nomap/.test(c)) && !fs.existsSync(path.join(dir, '2026-10/nomap.json')));
  await run('2026-10-31', 2);
  calls = []; const again = await run('2026-10-31', 3); const againCalls = calls.slice(); // same-day rerun: everything already saved today
  await run('2026-11-01', 1, { gone: true }); // sv01-004 no longer on TCGdex
  const oct = JSON.parse(fs.readFileSync(path.join(dir, '2026-10/sv1.json'), 'utf8'));
  const nov = JSON.parse(fs.readFileSync(path.join(dir, '2026-11/sv1.json'), 'utf8'));
  check('month file keyed by our card IDs: one column per day; a second run the same day only retries the set that failed', again.sets === 0 && againCalls.length && againCalls.every(c => c.startsWith('bad01')) && JSON.stringify(oct.days) === '["2026-10-30","2026-10-31"]' && JSON.stringify(oct.cards['sv1-2']) === '[2,4]', { again, againCalls, oct });
  check('mergeDay replaces a column it already has', JSON.stringify(S.mergeDay({ days: ['d1'], cards: { a: [1], b: [2] } }, 'd1', { a: 5 }).cards) === '{"a":[5],"b":[null]}');
  check('new month starts a new file, past month untouched; a card gone from TCGdex is simply unpriced', JSON.stringify(nov.days) === '["2026-11-01"]' && !nov.cards['sv1-4'] && nov.cards['sv1-3'][0] === 3);
  const me2 = JSON.parse(fs.readFileSync(path.join(dir, '2026-10/me2.json'), 'utf8')), tdx = JSON.parse(fs.readFileSync(path.join(dir, '2026-10/tdx1.json'), 'utf8'));
  check('cards without a TCGplayer price are skipped; TCGdex-added sets priced by their own IDs', !me2.cards['me2-6'] && me2.cards['me2-5'][0] === 5 && tdx.cards['tdx1-007'][0] === 7, { me2, tdx });
  const pid = JSON.parse(fs.readFileSync(path.join(dir, 'ids/sv1.json'), 'utf8'));
  check('TCGplayer product IDs saved per set for buy links (kept after a card disappears)', pid['sv1-1'] === 9001 && pid['sv1-4'] === 9004 && fs.existsSync(path.join(dir, 'ids/me2.json')), pid);
  check('tcgplayerId: priced variant first, else variants_detailed', S.tcgplayerId({ pricing: { tcgplayer: { normal: { productId: 5, marketPrice: 0 }, holofoil: { productId: 6, marketPrice: 2 } } } }) === 6 && S.tcgplayerId({ variants_detailed: [{ thirdParty: { tcgplayer: 7 } }] }) === 7 && S.tcgplayerId({}) === null);
  check('a TCGdex-added set that pokemontcg.io lists too is saved under its pokemontcg.io IDs (what the TCG tab shows)', JSON.stringify(S.cardIds({ id: 'me06', src: 'tcgdex', ptcgId: 'me6', ptcgNums: { '001': '1' }, cards: [['001'], ['002']] }, null)) === '{"me6-1":"me06-001","me6-002":"me06-002"}' && S.fileId({ id: 'me06', ptcgId: 'me6' }) === 'me6');
  const idx = JSON.parse(fs.readFileSync(path.join(dir, 'latest.json'), 'utf8'));
  check('latest.json lists sets per month and names the source', idx.source === 'tcgdex' && JSON.stringify(idx.months) === '{"2026-10":["me2","sv1","tdx1"],"2026-11":["me2","sv1","tdx1"]}', idx);
  let threw = false; try { await S.snapshot({ dir, dataFile: path.join(dir, 'tcg.json'), mapFile: path.join(dir, 'map.json'), now: new Date('2026-11-02T08:00:00Z'), fetchImpl: async () => ({ ok: false, status: 502 }), retryMs: 0, log: () => {} }); } catch (e) { threw = /keeping the previous files/.test(e.message); }
  check('TCGdex trouble (most sets fail): refuses to write', threw && !fs.existsSync(path.join(dir, '2026-11', 'x')) && JSON.parse(fs.readFileSync(path.join(dir, '2026-11/sv1.json'), 'utf8')).days.length === 1);
  fs.rmSync(dir, { recursive: true });
}

async function siteChecks(b, base, { hist = true } = {}) {
  const CARDS = [
    { id: 'zz1-1', name: 'Riser', number: '1', rarity: 'Rare', images: { small: 'https://img.test/1.png' }, tcgplayer: { updatedAt: '2026/10/14', prices: { holofoil: { market: 12 } } } },
    { id: 'zz1-2', name: 'Faller', number: '2', rarity: 'Common', images: { small: 'https://img.test/2.png' }, tcgplayer: { updatedAt: '2026/10/14', prices: { normal: { market: 1 } } } },
    { id: 'zz1-3', name: 'Newbie', number: '3', rarity: 'Common', images: { small: 'https://img.test/3.png' }, tcgplayer: { updatedAt: '2026/10/14', prices: { normal: { market: 2 } } } },
  ];
  const files = {
    '/prices/latest.json': { updated: '2026-10-14T08:00:00Z', months: { '2026-09': ['zz1'], '2026-10': ['zz1', 'other'] } },
    '/prices/2026-09/zz1.json': { days: ['2026-09-28', '2026-09-29'], cards: { 'zz1-1': [8, 9], 'zz1-2': [2, 2] } },
    '/prices/2026-10/zz1.json': { days: ['2026-10-01', '2026-10-14'], cards: { 'zz1-1': [10, 12], 'zz1-2': [1.5, 1], 'zz1-3': [null, 2] } },
  };
  const ctx = await b.newContext({ viewport: { width: 375, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('td-cookie-consent', 'denied'); } catch (e) {} });
  const page = await ctx.newPage(); page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
  await page.route('**/*', r => {
    const u = r.request().url(), p = new URL(u).pathname;
    if (u.startsWith(base) && p.startsWith('/prices/')) return hist && files[p] ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(files[p]) }) : r.abort();
    if (u.startsWith(base)) return r.continue();
    if (u.startsWith('https://api.pokemontcg.io/v2/sets')) return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'zz1', name: 'Test Set', releaseDate: '2026/01/01' }] }) });
    if (u.startsWith('https://api.pokemontcg.io/v2/cards')) return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ data: CARDS }) });
    if (u.startsWith('https://img.test/')) return r.fulfill({ status: 200, contentType: 'image/gif', body: GIF });
    return r.abort();
  });
  await page.goto(base + '/tcg');
  await page.waitForFunction(() => document.querySelectorAll('#card-grid .tcard').length === 3, null, { timeout: 10000 });
  await page.waitForTimeout(400);
  for (const id of ['zz1-1', 'zz1-2', 'zz1-3']) await page.click(`#card-grid .tcard[data-id="${id}"]`);
  await page.waitForTimeout(700);
  const back = id => page.$eval(`#card-grid .tcard[data-id="${id}"] .tb-body`, e => ({ text: e.textContent.replace(/\s+/g, ' ').trim(), pts: e.querySelector('polyline') ? e.querySelector('polyline').getAttribute('points').split(' ').length : 0, cls: e.querySelector('.tb-spark') ? e.querySelector('.tb-spark').className : '', label: e.querySelector('.tb-spark') ? e.querySelector('.tb-spark').getAttribute('aria-label') : '' }));
  if (!hist) {
    const r = await back('zz1-1');
    check('no history files: card back shows the price, no sparkline', /\$12\.00/.test(r.text) && !r.pts && /Updated/.test(r.text), r);
  } else {
    const up = await back('zz1-1'), down = await back('zz1-2'), one = await back('zz1-3');
    check('sparkline joins two months of history (4 points)', up.pts === 4, up);
    check('rising card: green, ▲ +50% over 16 days', /tb-spark up/.test(up.cls) && /16d ▲ \+50%/.test(up.text) && /\$8\.00 to \$12\.00/.test(up.label), up);
    check('falling card: red ▼ -50%', /tb-spark down/.test(down.cls) && /▼ -50%/.test(down.text), down);
    check('one day of history: no sparkline yet, date shown instead', !one.pts && /Updated/.test(one.text), one);
    const fit = await page.$eval('#card-grid .tcard[data-id="zz1-1"] .tback', e => e.scrollHeight <= e.clientHeight + 1);
    check('sparkline fits on the card back at 375px', fit);
    await page.selectOption('#card-sort', 'price-desc'); await page.waitForTimeout(200);
    await page.click('#card-grid .tcard[data-id="zz1-1"]'); await page.waitForTimeout(700);
    check('sparkline survives re-sorting the grid', (await back('zz1-1')).pts === 4);
  }
  const errs = page.errors; await ctx.close(); return errs;
}

(async () => {
  await scriptChecks();
  const { base, close } = await serve();
  const b = await chromium.launch();
  const errs = (await siteChecks(b, base)).concat(await siteChecks(b, base, { hist: false }));
  check('no uncaught JS errors', !errs.length, errs);
  await b.close(); close();
  console.log(failures ? `\n${failures} PRICE HISTORY CHECK(S) FAILED` : '\nALL PRICE HISTORY CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})();
