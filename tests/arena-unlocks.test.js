// Pixel Arena unlockable fighters (stars per match, unlock order, locked options, back-filled stars for old records)
// and the longer matches (health scale). Usage: node tests/arena-unlocks.test.js
const { chromium } = require('playwright');
const { serve } = require('./serve');
let failures = 0;
const check = (l, ok, x) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + l + (ok || x === undefined ? '' : '  ' + JSON.stringify(x))); if (!ok) failures++; };
const cors = { 'access-control-allow-origin': '*' };
const STATS = () => [['hp', 80], ['attack', 70], ['defense', 50], ['special-attack', 55], ['special-defense', 50], ['speed', 60]].map(([k, v]) => ({ base_stat: v, stat: { name: k } }));
const mockPokemon = id => ({ id, name: 'mon' + id, species: { name: 'mon' + id }, height: 5, weight: 50, types: [{ slot: 1, type: { name: 'normal' } }], abilities: [], stats: STATS() });

(async () => {
  const { base, close } = await serve();
  const b = await chromium.launch();
  const open = async rec => {
    const ctx = await b.newContext({ viewport: { width: 375, height: 1000 } });
    await ctx.addInitScript(r => { if (r && !sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('td-arena-stats-v1', JSON.stringify(r)); } }, rec || null);
    const page = await ctx.newPage(); page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
    await page.route('**/*', r => {
      const u = r.request().url(); if (u.startsWith(base)) return r.continue();
      const m = u.match(/^https:\/\/pokeapi\.co\/api\/v2\/pokemon\/(\d+)$/);
      if (m) return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(mockPokemon(+m[1])) });
      return r.abort();
    });
    await page.goto(base + '/arena'); await page.waitForSelector('#arena-start');
    return { ctx, page };
  };
  const opts = page => page.$$eval('#arena-fighter option', o => o.map(x => ({ v: +x.value, dis: x.disabled, t: x.textContent })));
  const play = async (page, win) => {
    await page.click('#arena-start');
    await page.waitForFunction(() => window.__arena.state && document.getElementById('arena-overlay').hidden, null, { timeout: 15000 });
    await page.evaluate(w => { const F = window.__arena.fighters; F.forEach((f, i) => { if (w ? i > 0 : i === 0) f.hp = 0; }); window.__arena.step(0.01); if (!w) for (let i = 0; i < 4000 && !window.__arena.state.over; i++) { window.__arena.step(0.05); } }, win);
    await page.waitForFunction(() => window.__arena.state.over, null, { timeout: 10000 });
    return (await page.textContent('#arena-result')).replace(/\s+/g, ' ');
  };

  // new player
  let { ctx, page } = await open();
  let o = await opts(page);
  check('24 fighters listed: 8 open, 16 locked with a 🔒 and their star price', o.length === 24 && o.filter(x => !x.dis).length === 8 && o.filter(x => x.dis).every(x => /^🔒 .+ \(\d+ ★\)$/.test(x.t)), o.filter(x => x.dis).slice(0, 2));
  check('starters: Pikachu (picked), Bulbasaur, Charmander, Squirtle, Jigglypuff, Meowth, Psyduck, Eevee', JSON.stringify(o.filter(x => !x.dis).map(x => x.v).sort((a, b) => a - b)) === '[1,4,7,25,39,52,54,133]' && (await page.inputValue('#arena-fighter')) === '25');
  check('progress line: 0 stars, next unlock Gastly in 5', /★ 0 · 8\/24 fighters · next: Gastly in 5 ★/.test(await page.textContent('#arena-stars')), await page.textContent('#arena-stars'));
  const lb = await page.$eval('#arena-stars', e => getComputedStyle(e).fontSize);
  check('progress text readable size', parseFloat(lb) >= 12, lb);

  // health: 3x what it was (fighter with 80 HP base: (70 + 80*0.9) * 3 = 426)
  await page.click('#arena-start');
  await page.waitForFunction(() => window.__arena.state && document.getElementById('arena-overlay').hidden, null, { timeout: 15000 });
  const mh = await page.evaluate(() => window.__arena.fighters[0].maxhp);
  check('fighters have 3x the health (longer matches)', Math.abs(mh - 426) < 0.5, mh);
  await page.evaluate(() => { window.__arena.fighters.forEach((f, i) => { if (i) f.hp = 0; }); window.__arena.step(0.01); });
  await page.waitForFunction(() => window.__arena.state.over);
  let res = (await page.textContent('#arena-result')).replace(/\s+/g, ' ');
  check('a win earns 4 stars (1 + top 3 + win)', /\+4 ★/.test(res) && !/UNLOCKED/.test(res), res);
  res = await play(page, false);
  check('a 12th place earns 1 star; reaching 5 stars unlocks Gastly, announced on the result', /\+1 ★ · NEW FIGHTER UNLOCKED: Gastly!/.test(res), res);
  res = await play(page, true);
  check('next win: +4 ★, no new unlock yet', /\+4 ★/.test(res) && !/UNLOCKED/.test(res), res);
  o = await opts(page);
  check('Gastly is now selectable', o.find(x => x.v === 92) && !o.find(x => x.v === 92).dis && /9\/24 fighters · next: Venusaur in 1 ★/.test(await page.textContent('#arena-stars')), await page.textContent('#arena-stars'));
  check('stars saved with the record', (await page.evaluate(() => JSON.parse(localStorage.getItem('td-arena-stats-v1')).stars)) === 9);
  // a locked fighter can't be forced into a free match
  await page.evaluate(() => { const s = document.getElementById('arena-fighter'); s.querySelector('option[value="150"]').disabled = false; s.value = '150'; });
  await page.click('#arena-start');
  await page.waitForFunction(() => window.__arena.state && document.getElementById('arena-overlay').hidden, null, { timeout: 15000 });
  check('locked fighter picked by tampering → plays as Pikachu', (await page.evaluate(() => window.__arena.state.player.id)) === 25);
  let errs = page.errors; await ctx.close();

  // existing player from before stars: 10 matches, 3 wins → 19 stars → 3 unlocks
  ({ ctx, page } = await open({ played: 10, wins: 3, kos: 20, best: 1, streak: 0, bestStreak: 2, by: {}, dStreak: 0, dBest: 0, dLast: -1 }));
  o = await opts(page);
  check('older records get stars back-filled (matches + 3 per win)', o.filter(x => !x.dis).length === 11 && /★ 19 · 11\/24/.test(await page.textContent('#arena-stars')), await page.textContent('#arena-stars'));
  errs = errs.concat(page.errors); await ctx.close();

  ({ ctx, page } = await open({ played: 100, wins: 40, stars: 500 }));
  check('everything unlocked at 80+ stars', (await opts(page)).every(x => !x.dis) && /every fighter unlocked!/.test(await page.textContent('#arena-stars')));
  const wide = await page.evaluate(() => document.documentElement.scrollWidth);
  check('fits at 375px', wide <= 375, wide);
  errs = errs.concat(page.errors); await ctx.close();

  check('no uncaught JS errors', !errs.length, errs);
  await b.close(); close();
  console.log(failures ? `\n${failures} ARENA UNLOCK CHECK(S) FAILED` : '\nALL ARENA UNLOCK CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})();
