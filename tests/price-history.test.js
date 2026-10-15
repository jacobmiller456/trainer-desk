// Price history: the daily snapshot script (fake API, temp folder) and the sparkline on card backs (mocked API + price files).
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
  check('usdPrice: first variant with market, else mid', S.usdPrice({ tcgplayer: { prices: { normal: { mid: 0.5 }, holofoil: { market: 3 } } } }) === 0.5 && S.usdPrice({ tcgplayer: { prices: { holofoil: { market: 2.345 } } } }) === 2.35 && S.usdPrice({}) === null);
  const plan = S.planSets([{ id: 'old1', rel: '2001-01-01' }, { id: 'old2', rel: '2003-01-01' }, { id: 'new1', rel: '2026-03-01' }, { id: 'new2', rel: '2026-09-01' }, { id: 'done', rel: '2026-10-01' }, { id: 'bad id', rel: '' }],
    { day: '2026-10-15', last: id => ({ old1: '2026-10-14', old2: '', done: '2026-10-15', new1: '2026-10-14' })[id] || '' });
  check('planSets: skips saved-today, recent sets first, then stalest', JSON.stringify(plan) === '["new2","new1","old2","old1"]', plan);
  check('setOf keeps dashes inside set ids', S.setOf('sv3pt5-1') === 'sv3pt5' && S.setOf('swsh12pt5gg-GG01') === 'swsh12pt5gg');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'td-prices-'));
  const cards = Array.from({ length: 6 }, (_, i) => ({ id: (i < 4 ? 'sv1-' : 'me2-') + (i + 1), tcgplayer: i === 5 ? undefined : { prices: { normal: { market: i + 1 } } } }));
  // fake API: /sets lists sv1 + me2 + bad1; /cards?q=set.id:X pages 2 per page; bad1 always 502s; me2 fails once (then retried)
  let me2Fails = 0;
  const fake = (list, opts = {}) => async url => {
    const u = new URL(url), sp = u.searchParams;
    if (u.pathname.endsWith('/sets')) return { ok: true, json: async () => ({ data: [{ id: 'bad1' }, { id: 'me2' }, { id: 'sv1' }] }) };
    const set = sp.get('q').split(':')[1], page = +sp.get('page');
    if (set === 'bad1' || (set === 'me2' && opts.flaky && me2Fails++ < 5)) return { ok: false, status: 502 };
    const all = list.filter(c => c.id.startsWith(set + '-'));
    return { ok: true, json: async () => ({ data: all.slice((page - 1) * 250, page * 250), totalCount: all.length }) };
  };
  const logs = [];
  const run = (day, mult, list, opts) => S.snapshot({ dir, dataFile: path.join(dir, 'none.json'), now: new Date(day + 'T08:00:00Z'), fetchImpl: fake(list.map(c => c.tcgplayer ? { ...c, tcgplayer: { prices: { normal: { market: c.tcgplayer.prices.normal.market * mult } } } } : c), opts), delay: 0, fast: true, minCards: 3, log: m => logs.push(m) });
  const r1 = await run('2026-10-30', 1, cards, { flaky: true });
  check('a failing set is retried, then skipped without failing the run', JSON.stringify(r1.failed) === '["bad1"]' && r1.sets === 2 && logs.some(l => /me2 failed.*will retry/.test(l)) && logs.some(l => /bad1 failed.*skipped today/.test(l)), { r1, logs });
  await run('2026-10-31', 2, cards);
  const again = await run('2026-10-31', 3, cards); // same-day rerun: everything already saved today
  await run('2026-11-01', 1, cards.slice(1)); // sv1-1 no longer listed
  const oct = JSON.parse(fs.readFileSync(path.join(dir, '2026-10/sv1.json'), 'utf8'));
  const nov = JSON.parse(fs.readFileSync(path.join(dir, '2026-11/sv1.json'), 'utf8'));
  check('month file: one column per day; a second run the same day skips saved sets', again.sets === 0 && JSON.stringify(oct.days) === '["2026-10-30","2026-10-31"]' && JSON.stringify(oct.cards['sv1-2']) === '[2,4]', { again, oct });
  check('mergeDay replaces a column it already has', JSON.stringify(S.mergeDay({ days: ['d1'], cards: { a: [1], b: [2] } }, 'd1', { a: 5 }).cards) === '{"a":[5],"b":[null]}');
  check('new month starts a new file, past month untouched', JSON.stringify(nov.days) === '["2026-11-01"]' && !nov.cards['sv1-1'] && nov.cards['sv1-3'][0] === 3);
  const me2 = JSON.parse(fs.readFileSync(path.join(dir, '2026-10/me2.json'), 'utf8'));
  check('unpriced cards are skipped', !me2.cards['me2-6'] && me2.cards['me2-5'][0] === 5);
  const idx = JSON.parse(fs.readFileSync(path.join(dir, 'latest.json'), 'utf8'));
  check('latest.json lists sets per month', JSON.stringify(idx.months) === '{"2026-10":["me2","sv1"],"2026-11":["me2","sv1"]}', idx);
  let threw = false; try { await S.snapshot({ dir, dataFile: path.join(dir, 'none.json'), fetchImpl: async u => new URL(u).pathname.endsWith('/sets') ? { ok: true, json: async () => ({ data: [{ id: 'x1' }, { id: 'x2' }, { id: 'x3' }] }) } : { ok: false, status: 502 }, delay: 0, fast: true, log: () => {} }); } catch (e) { threw = /keeping the previous files/.test(e.message); }
  check('API trouble (most sets fail): refuses to write', threw && fs.readdirSync(dir).length === 3);
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
