// Price movers: the script (history across months, 7-day window, $ floor, ranking, card info) and the TCG tab view
// (risers/fallers toggle, $ filter, sparkline, tap opens the card detail, offline message, phone layout).
// Usage: node tests/price-movers.test.js
const { chromium } = require('playwright');
const { serve } = require('./serve');
const fs = require('fs'), os = require('os'), path = require('path');
let failures = 0;
const check = (l, ok, x) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + l + (ok || x === undefined ? '' : '  ' + JSON.stringify(x))); if (!ok) failures++; };
const cors = { 'access-control-allow-origin': '*' };
const GIF = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');

async function scriptChecks() {
  const M = await import('../scripts/price-movers.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'td-movers-'));
  fs.mkdirSync(path.join(dir, '2026-10')); fs.mkdirSync(path.join(dir, '2026-11'));
  fs.writeFileSync(path.join(dir, '2026-10/zz1.json'), JSON.stringify({ days: ['2026-10-25', '2026-10-28', '2026-10-31'], cards: { 'zz1-1': [10, 12, 14], 'zz1-2': [50, 45, 40], 'zz1-3': [0.5, 0.9, 1.2], 'zz1-4': [5, 5, 5], 'zz1-5': [3, null, 4] } }));
  fs.writeFileSync(path.join(dir, '2026-11/zz1.json'), JSON.stringify({ days: ['2026-11-01'], cards: { 'zz1-1': [15], 'zz1-2': [35], 'zz1-3': [1.5], 'zz1-4': [5] } }));
  const data = path.join(dir, 'tcg.json');
  fs.writeFileSync(data, JSON.stringify([{ id: 'zz1', name: 'Test Set', cards: [1, 2, 3, 4, 5].map(n => [String(n), 'Card ' + n, 'Rare', 'Pokémon', 'Fire', 0, `https://images.pokemontcg.io/zz1/${n}.png`, 'Artist']) }]));
  const m = M.run({ dir, dataFile: data, log: () => {} });
  check('history joins two months; window measured from 7 days before the latest day', m.updated === '2026-11-01' && m.risers[0].id === 'zz1-1' && m.risers[0].from === 10 && m.risers[0].to === 15 && m.risers[0].pct === 50 && m.risers[0].pts.length === 4, m.risers[0]);
  check('fallers ranked; flat and cheap (<$2) cards left out; cards not priced today left out', m.fallers[0].id === 'zz1-2' && m.fallers[0].pct === -30 && !m.risers.concat(m.fallers).some(r => ['zz1-3', 'zz1-4', 'zz1-5'].includes(r.id)), m);
  check('rows carry name, set name, number, rarity and the hotlinked image URL', m.risers[0].name === 'Card 1' && m.risers[0].setName === 'Test Set' && m.risers[0].num === '1' && m.risers[0].img === 'https://images.pokemontcg.io/zz1/1.png');
  check('movers.json written', fs.existsSync(path.join(dir, 'movers.json')));
  fs.rmSync(dir, { recursive: true });
}

const MOVERS = { updated: '2026-10-21', window: 7, minPrice: 2, considered: 1713,
  risers: [{ id: 'zz1-1', name: 'Big Riser', set: 'zz1', setName: 'Test Set', num: '1', rarity: 'Rare', img: 'https://images.pokemontcg.io/zz1/1.png', from: 60, to: 120, pct: 100, since: '2026-10-15', pts: [60, 80, 120] },
    { id: 'zz1-2', name: 'Small Riser', set: 'zz1', setName: 'Test Set', num: '2', rarity: 'Common', img: 'https://images.pokemontcg.io/zz1/2.png', from: 2.5, to: 3, pct: 20, since: '2026-10-15', pts: [2.5, 3] }],
  fallers: [{ id: 'zz1-3', name: 'Faller <b>x</b>', set: 'zz1', setName: 'Test Set', num: '3', rarity: '', img: '', from: 30, to: 15, pct: -50, since: '2026-10-15', pts: [30, 15] }] };
const CARDS = [1, 2, 3].map(n => ({ id: 'zz1-' + n, name: 'Card ' + n, number: String(n), rarity: 'Rare', images: { small: `https://images.pokemontcg.io/zz1/${n}.png` }, tcgplayer: { prices: { normal: { market: n * 10 } } } }));

async function open(b, base, movers = true) {
  const ctx = await b.newContext({ viewport: { width: 375, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('td-cookie-consent', 'denied'); } catch (e) {} });
  const page = await ctx.newPage(); page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
  await page.route('**/*', r => {
    const u = r.request().url(), p = new URL(u).pathname;
    if (u.startsWith(base) && p === '/prices/movers.json') return movers ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOVERS) }) : r.abort();
    if (u.startsWith(base) && p.startsWith('/prices/')) return r.abort();
    if (u.startsWith(base)) return r.continue();
    if (u.startsWith('https://api.pokemontcg.io/v2/sets')) return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'other', name: 'Other Set', releaseDate: '2026/02/01' }, { id: 'zz1', name: 'Test Set', releaseDate: '2026/01/01' }] }) });
    if (u.startsWith('https://api.pokemontcg.io/v2/cards')) return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ data: u.includes('zz1') ? CARDS : [] }) });
    if (u.startsWith('https://images.pokemontcg.io/')) return r.fulfill({ status: 200, contentType: 'image/gif', body: GIF });
    return r.abort();
  });
  await page.goto(base + '/tcg'); await page.waitForSelector('[data-tcgview="movers"]');
  await page.click('[data-tcgview="movers"]'); await page.waitForTimeout(400);
  return { ctx, page };
}

(async () => {
  await scriptChecks();
  const { base, close } = await serve();
  const b = await chromium.launch();
  let { ctx, page } = await open(b, base);
  const rows = () => page.$$eval('#mv-list .mv-row', r => r.map(x => x.querySelector('b').textContent));
  check('PRICE MOVERS tab shows risers by default, ranked', JSON.stringify(await rows()) === '["Big Riser","Small Riser"]' && /rises over the last week/.test(await page.textContent('#mv-intro')));
  const first = await page.textContent('#mv-list .mv-row');
  check('row: price now, % change, from-price, set and number, sparkline', /\$120/.test(first) && /▲ \+100%/.test(first) && /from \$60\.00/.test(first) && /Test Set · #1/.test(first) && !!(await page.$('#mv-list .mv-row svg polyline')), first.replace(/\s+/g, ' '));
  await page.selectOption('#mv-min', '10');
  check('$10+ filter hides cheaper cards', JSON.stringify(await rows()) === '["Big Riser"]');
  await page.click('[data-mv="fallers"]');
  check('fallers view, escaped names, red style', (await page.$$eval('#mv-list .mv-row.down', r => r.length)) === 1 && /Faller <b>x<\/b>/.test(await page.textContent('#mv-list')) && !(await page.$('#mv-list .mv-info b b')));
  const lay = await page.evaluate(() => { const small = [...document.querySelectorAll('#tcg-movers button, #tcg-movers select, #mv-list a')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height < 44; }).length; return { small, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
  check('375px: tap targets >= 44px, no sideways scroll', !lay.small && lay.overflow <= 0, lay);
  await page.click('[data-mv="risers"]'); await page.selectOption('#mv-min', '2');
  await page.click('#mv-list .mv-row[data-card="zz1-2"]');
  await page.waitForFunction(() => document.getElementById('card-detail').open, null, { timeout: 10000 });
  check('tapping a mover switches to that set and opens the card detail', /Card 2/.test(await page.textContent('#cdd-body')) && (await page.inputValue('#set-select')) === 'zz1' && !(await page.$eval('#tcg-browse', e => e.hidden)));
  const errs = page.errors; await ctx.close();
  ({ ctx, page } = await open(b, base, false));
  check('offline: friendly message, not a blank list', /couldn't load/.test(await page.textContent('#mv-intro')));
  check('no uncaught JS errors', !errs.length && !page.errors.length, errs.concat(page.errors));
  await b.close(); close();
  console.log(failures ? `\n${failures} PRICE MOVERS CHECK(S) FAILED` : '\nALL PRICE MOVERS CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})();
