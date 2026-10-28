// Dark mode: follows the device setting until the user picks, toggle (44px, saved, survives reload), theme set before
// first paint, browser theme-color, readable text on every tab + dialogs in dark (WCAG 4.5:1, 3:1 for large text),
// no invisible text in light, static Pokédex page follows the device, phone header fits. Usage: node tests/dark-mode.test.js
const { chromium } = require('playwright');
const { serve } = require('./serve');
const scan = require('./contrast-scan');
let failures = 0;
const check = (l, ok, x) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + l + (ok || x === undefined ? '' : '  ' + JSON.stringify(x))); if (!ok) failures++; };
const cors = { 'access-control-allow-origin': '*' };
const GIF = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const EVENTS = [
  { eventID: 'raids', name: 'Dialga in 5-star Raid Battles', eventType: 'raid-battles', start: day(-1) + 'T10:00:00.000', end: day(3) + 'T22:00:00.000', extraData: { raidbattles: { bosses: [{ name: 'Dialga', canBeShiny: true }] } } },
  { eventID: 'halloween-2026-part-1', name: 'Pokémon GO Halloween 2026 Part I', eventType: 'event', start: day(2) + 'T10:00:00.000', end: day(6) + 'T10:00:00.000', extraData: { generic: { hasSpawns: true } } },
  { eventID: 'cd', name: 'November Community Day', eventType: 'community-day', start: day(5) + 'T14:00:00.000', end: day(5) + 'T17:00:00.000', extraData: { communityday: { spawns: [{ name: 'Pawniard' }], shinies: [{ name: 'Pawniard' }], bonuses: [{ text: '3× Catch Stardust' }] } } },
];
const RAIDS = [{ name: 'Dialga', tier: '5-Star Raids', canBeShiny: true, types: [{ name: 'steel' }, { name: 'dragon' }], combatPower: { normal: { min: 2200, max: 2307 } }, boostedWeather: [{ name: 'snow' }] }];
const CARDS = [1, 2].map(n => ({ id: 'zz1-' + n, name: 'Card ' + n, number: String(n), rarity: n === 1 ? 'Special Illustration Rare' : 'Common', hp: '120', supertype: 'Pokémon', types: ['Fire'], artist: 'Someone', set: { printedTotal: 2 }, images: { small: `https://images.pokemontcg.io/zz1/${n}.png` }, tcgplayer: { updatedAt: '2026/10/20', prices: { normal: { market: n * 10 } } } }));
const EXEMPT = r => /tc-chip|whos-chip|evd-chip|type\b|today-types/.test(r.sel) || /^(water|fire|grass|electric|ice|fighting|poison|ground|flying|psychic|bug|rock|ghost|dragon|dark|steel|fairy|normal)$/i.test(r.text);

async function ctxFor(b, base, { scheme = 'light', saved = null } = {}) {
  const ctx = await b.newContext({ viewport: { width: 375, height: 900 }, colorScheme: scheme });
  await ctx.addInitScript(sv => { try { localStorage.setItem('td-cookie-consent', 'denied'); if (sv) localStorage.setItem('td-theme', sv); } catch (e) {} }, saved);
  await ctx.route('**/*', r => {
    const u = r.request().url();
    if (u.startsWith(base)) return r.continue();
    if (u.includes('events.json')) return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(EVENTS) });
    if (u.includes('raids.json')) return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(RAIDS) });
    if (u.startsWith('https://api.pokemontcg.io/v2/sets')) return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'zz1', name: 'Test Set', releaseDate: '2026/01/01' }] }) });
    if (u.startsWith('https://api.pokemontcg.io/v2/cards')) return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ data: CARDS }) });
    if (/images\.pokemontcg|sprites/.test(u)) return r.fulfill({ status: 200, contentType: 'image/gif', body: GIF });
    return r.abort();
  });
  return ctx;
}
const theme = page => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
async function scanAll(page, base, min, baseBg) {
  const bad = {};
  const run = async name => { const r = (await page.evaluate(`(${scan.toString()})(${min}, '${baseBg}')`)).filter(x => !EXEMPT(x)); if (r.length) bad[name] = r.slice(0, 6); };
  await page.goto(base + '/'); await page.waitForTimeout(1500); await run('today');
  await page.evaluate(() => window.__app.show('ios')); await run('today: install card');
  await page.goto(base + '/go'); await page.waitForFunction(() => document.querySelectorAll('#raid-box .raid, .ev-more').length > 2, null, { timeout: 15000 }); await run('go');
  await page.click('.ev-more[data-ev="halloween-2026-part-1"]'); await page.waitForTimeout(600); await run('go: event dialog'); await page.keyboard.press('Escape');
  await page.goto(base + '/tcg'); await page.waitForSelector('#card-grid .tcard', { timeout: 15000 }); await page.waitForTimeout(500);
  await page.click('#card-grid .tcard[data-id="zz1-2"]'); await page.waitForTimeout(700); await run('tcg: grid + card back');
  await page.click('#card-grid .tcard[data-id="zz1-1"] .tc-zoom'); await page.waitForTimeout(500); await run('tcg: card detail'); await page.keyboard.press('Escape');
  for (const v of ['binder', 'packs', 'movers']) { await page.click(`[data-tcgview="${v}"]`); await page.waitForTimeout(500); await run('tcg: ' + v); }
  await page.goto(base + '/pokedex'); await page.waitForTimeout(1200); await run('dex');
  await page.click('[data-dexview="collection"]'); await page.waitForFunction(() => document.querySelectorAll('#col-grid .col-tile').length > 100, null, { timeout: 15000 }); await run('dex: collection');
  await page.goto(base + '/arena'); await page.waitForSelector('#arena-start'); await run('arena');
  await page.click('#arena-start'); await page.waitForFunction(() => window.__arena.state && document.getElementById('arena-overlay').hidden, null, { timeout: 15000 });
  await page.evaluate(() => { for (let i = 0; i < 8000 && !window.__arena.state.over; i++) window.__arena.step(0.05); }); await page.waitForTimeout(400); await run('arena: result');
  return bad;
}

(async () => {
  const { base, close } = await serve();
  const b = await chromium.launch();
  // device setting
  let ctx = await ctxFor(b, base, { scheme: 'dark' }); let page = await ctx.newPage(); page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  check('dark device setting: dark theme already set when the page first parses (no white flash)', (await theme(page)) === 'dark');
  await page.waitForLoadState('load');
  check('browser bar colour follows the theme', (await page.getAttribute('meta[name="theme-color"]', 'content')) === '#0A1A11');
  const btn = await page.$eval('#theme-btn', e => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height, label: e.getAttribute('aria-label'), icon: e.textContent }; });
  check('toggle button: 44px, says what it does', btn.w >= 44 && btn.h >= 44 && /light mode/.test(btn.label) && btn.icon === '☀️', btn);
  await page.click('#theme-btn');
  check('toggle switches to light and saves the choice', (await theme(page)) === 'light' && (await page.evaluate(() => localStorage.getItem('td-theme'))) === 'light' && /dark mode/.test(await page.getAttribute('#theme-btn', 'aria-label')));
  await page.reload();
  check('saved choice beats the device setting after reload', (await theme(page)) === 'light');
  const errs1 = page.errors; await ctx.close();
  ctx = await ctxFor(b, base, { scheme: 'light' }); page = await ctx.newPage();
  await page.goto(base + '/');
  check('light device setting: light theme', (await theme(page)) === 'light');
  await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForTimeout(100);
  check('with no saved choice, a device switch is followed live', (await theme(page)) === 'dark');
  const lay = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
  await page.setViewportSize({ width: 320, height: 800 });
  const lay320 = await page.evaluate(() => { const b = document.getElementById('theme-btn').getBoundingClientRect(); return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, right: b.right, vw: innerWidth }; });
  check('header with toggle fits at 375 and 320px', lay.overflow <= 0 && lay320.overflow <= 0 && lay320.right <= lay320.vw, { lay, lay320 });
  await ctx.close();

  // readability scans
  ctx = await ctxFor(b, base, { saved: 'dark' }); page = await ctx.newPage(); page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
  const darkBad = await scanAll(page, base, 4.5, 'rgb(14,33,23)');
  check('dark: all text readable on every tab and dialog (4.5:1, 3:1 large)', !Object.keys(darkBad).length, darkBad);
  const errs2 = page.errors; await ctx.close();
  ctx = await ctxFor(b, base, { saved: 'light' }); page = await ctx.newPage();
  const lightBad = await scanAll(page, base, 1.6, 'rgb(45,106,79)');
  check('light: no invisible text anywhere', !Object.keys(lightBad).length, lightBad);
  await ctx.close();

  // static page follows the device
  ctx = await ctxFor(b, base, { scheme: 'dark' }); page = await ctx.newPage();
  await page.goto(base + '/pokedex/pikachu'); await page.waitForTimeout(300);
  const st = (await page.evaluate(`(${scan.toString()})(4.5, 'rgb(14,33,23)')`)).filter(x => !EXEMPT(x));
  const boxBg = await page.$eval('.box', e => getComputedStyle(e).backgroundColor);
  check('static Pokédex page goes dark with the device and stays readable', boxBg === 'rgb(28, 40, 34)' && !st.length, { boxBg, st: st.slice(0, 5) });
  await ctx.close();
  check('no uncaught JS errors', !errs1.length && !errs2.length, errs1.concat(errs2));
  await b.close(); close();
  console.log(failures ? `\n${failures} DARK MODE CHECK(S) FAILED` : '\nALL DARK MODE CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})();
