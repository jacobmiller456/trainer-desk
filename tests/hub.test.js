// Daily hub (Today tab "YOUR DAY"): daily checklist (puzzle + Arena Daily), combined streak (incl. seeding from the
// puzzle streak), shiny raid bosses you still need, top price riser, collection progress, buttons, live updates,
// phone layout. Usage: node tests/hub.test.js
const { chromium } = require('playwright');
const { serve } = require('./serve');
let failures = 0;
const check = (l, ok, x) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + l + (ok || x === undefined ? '' : '  ' + JSON.stringify(x))); if (!ok) failures++; };
const cors = { 'access-control-allow-origin': '*' };
const GIF = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
const RAIDS = [{ name: 'Dialga', tier: '5-Star Raids', canBeShiny: true, types: [{ name: 'steel' }, { name: 'dragon' }] }, { name: 'Palkia', tier: '5-Star Raids', canBeShiny: true, types: [{ name: 'water' }, { name: 'dragon' }] }, { name: 'Mega Charizard X', tier: 'Mega Raids', canBeShiny: true, types: [{ name: 'fire' }, { name: 'dragon' }] }, { name: 'Unshinyable', tier: '1-Star Raids', canBeShiny: false, types: [{ name: 'normal' }] }];
const MOVERS = { updated: '2026-10-21', window: 7, minPrice: 2, considered: 100, risers: [{ id: 'hgss1-4', name: 'Gyarados', set: 'hgss1', setName: 'HeartGold & SoulSilver', num: '4', rarity: 'Rare Holo', img: '', from: 60.67, to: 192.78, pct: 217.8, since: '2026-10-15', pts: [60, 192] }], fallers: [] };

async function open(b, base, store = {}) {
  const ctx = await b.newContext({ viewport: { width: 375, height: 900 } });
  await ctx.addInitScript(st => { try { localStorage.setItem('td-cookie-consent', 'denied'); for (const [k, v] of Object.entries(st)) localStorage.setItem(k, JSON.stringify(typeof v === 'function' ? null : v)); } catch (e) {} }, store);
  const page = await ctx.newPage(); page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
  await page.route('**/*', r => {
    const u = r.request().url(), p = new URL(u).pathname;
    if (u.startsWith(base) && p === '/prices/movers.json') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOVERS) });
    if (u.startsWith(base)) return r.continue();
    if (u.includes('raids.json')) return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(RAIDS) });
    if (/sprites/.test(u)) return r.fulfill({ status: 200, contentType: 'image/gif', body: GIF });
    return r.abort();
  });
  await page.goto(base + '/'); await page.waitForSelector('#today-hub .hub-row');
  await page.waitForFunction(() => /Top riser/.test(document.getElementById('today-hub').textContent), null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(500);
  return { ctx, page };
}
const hub = page => page.evaluate(() => document.getElementById('today-hub').innerText.replace(/\s+/g, ' '));

(async () => {
  const { base, close } = await serve();
  const b = await chromium.launch();
  const day = Math.floor(Date.now() / 864e5);
  // fresh visitor
  let { ctx, page } = await open(b, base);
  let t = await hub(page);
  check('hub is the first card on Today', await page.$eval('.today-grid', g => g.firstElementChild.id === 'today-hub'));
  check('fresh: both dailies unchecked with PLAY buttons, streak 0', /⬜ Who's That Pokémon\? #\d+/.test(t) && /⬜ Arena Daily Challenge #\d+/.test(t) && (await page.$$eval('#today-hub .hub-btn', b => b.filter(x => x.textContent === 'PLAY').length)) === 2 && /🔥 0-day streak/.test(t), t);
  check('fresh: Arena row names today\'s fighter', /You're \S+.* today/.test(t), t);
  check('fresh: shiny row invites you to start your collection', /Mark your shinies in My Collection/.test(t));
  check('top riser this week, linking to the card', /Top riser: Gyarados/.test(t) && /▲ \+217\.8%/.test(t) && (await page.getAttribute('#today-hub a.hub-btn', 'href')) === '/tcg?set=hgss1&card=hgss1-4', t);
  await page.click('#today-hub [data-hub="puzzle"]'); await page.waitForTimeout(700);
  check('PLAY scrolls to the puzzle', await page.$eval('#today-puzzle', e => { const r = e.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }));
  // solve the puzzle live
  const ans = await page.evaluate(() => window.__whos.answer[1]);
  await page.fill('#whos-input', ans); await page.click('#whos-form button[type=submit]'); await page.waitForTimeout(300);
  t = await hub(page);
  check('solving the puzzle updates the hub right away (✅, streak 1)', /✅ Who's That Pokémon\? #\d+ Solved in 1\/5/.test(t) && /🔥 1-day streak/.test(t), t);
  const lay = await page.evaluate(() => { const small = [...document.querySelectorAll('#today-hub button, #today-hub a')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.height < 44 || r.width < 44); }).length; return { small, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
  check('375px: buttons >= 44px, no sideways scroll', !lay.small && lay.overflow <= 0, lay);
  const errs1 = page.errors; await ctx.close();

  // returning player with history
  ({ ctx, page } = await open(b, base, {
    'td-whos-v1': { day, guesses: [1, 2, 3], done: true, won: true },
    'td-arena-daily-v1': { day, place: 2, of: 12, kos: 3, time: 50, win: false, fighter: 'Pikachu' },
    'td-hub-days-v1': [day - 2, day - 1],
    'td-collection-v1': { c: [1, 4, 483, 484, 6], s: [483], l: [], h: [] },
  }));
  t = await hub(page);
  check('done dailies show results; both done message', /✅ Who's That Pokémon\? #\d+ Solved in 3\/5/.test(t) && /✅ Arena Daily Challenge #\d+ 🥈 of 12 · 3 KOs/.test(t) && /Both dailies done/.test(t) && !(await page.$('#today-hub [data-hub="puzzle"]')), t);
  check('streak counts consecutive days (3)', /🔥 3-day streak/.test(t), t);
  check('shiny raid bosses still needed (Dialga owned shiny; unshinyable skipped)', /2 raid bosses you still need shiny/.test(t) && /Palkia, Mega Charizard X/.test(t) && !/Unshinyable/.test(t), t);
  check('collection progress row', /Your collection ✓ 5 \/ 1,025 caught · ✨ 1 shiny/.test(t), t);
  await page.click('#today-hub [data-hub="collection"]'); await page.waitForTimeout(800);
  check('OPEN goes to My Collection', await page.$eval('#view-dex', e => e.classList.contains('active')) && !(await page.$eval('#dex-collection', e => e.hidden)));
  await page.click('.tab[data-view="today"]'); await page.click('#today-hub [data-goto="go"]'); await page.waitForTimeout(300);
  check('RAIDS goes to the GO tab', await page.$eval('#view-go', e => e.classList.contains('active')));
  const errs2 = page.errors; await ctx.close();

  // streak seeded from an existing puzzle streak; yesterday counts until today is played
  ({ ctx, page } = await open(b, base, { 'td-whos-stats-v1': { played: 4, won: 4, streak: 4, max: 4, last: day - 1 } }));
  t = await hub(page);
  check('first visit seeds the streak from the puzzle streak (4, still alive today)', /🔥 4-day streak/.test(t), t);
  check('no uncaught JS errors', !errs1.length && !errs2.length && !page.errors.length, errs1.concat(errs2, page.errors));
  await ctx.close();
  await b.close(); close();
  console.log(failures ? `\n${failures} HUB CHECK(S) FAILED` : '\nALL HUB CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})();
