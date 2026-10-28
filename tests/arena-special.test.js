// Pixel Arena special moves: charge button, ready state, each move's effect (burst, wave, dash, heal, phase, barrage),
// KO credit, keyboard trigger, rivals use theirs, phone layout. Usage: node tests/arena-special.test.js
const { chromium } = require('playwright');
const { serve } = require('./serve');
let failures = 0;
const check = (l, ok, x) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + l + (ok || x === undefined ? '' : '  ' + JSON.stringify(x))); if (!ok) failures++; };
const cors = { 'access-control-allow-origin': '*' };
const STATS = n => [['hp', 80], ['attack', 70], ['defense', 50], ['special-attack', 55], ['special-defense', 50], ['speed', 60]].map(([k, v]) => ({ base_stat: v, stat: { name: k } }));
const TYPES = ['fire', 'water', 'grass', 'electric', 'ghost', 'steel', 'fairy'];
const mockPokemon = id => ({ id, name: 'mon' + id, species: { name: 'mon' + id }, height: 5, weight: 50, types: [{ slot: 1, type: { name: TYPES[id % TYPES.length] } }], abilities: [], stats: STATS(id) });

(async () => {
  const { base, close } = await serve();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 375, height: 1000 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('td-cookie-consent', 'denied'); } catch (e) {} });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', r => {
    const u = r.request().url(); if (u.startsWith(base)) return r.continue();
    const m = u.match(/^https:\/\/pokeapi\.co\/api\/v2\/pokemon\/(\d+)$/);
    if (m) return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(mockPokemon(+m[1])) });
    return r.abort();
  });
  await page.goto(base + '/arena'); await page.waitForSelector('#arena-start');
  check('special button hidden before a match', await page.$eval('#arena-special', e => e.hidden));
  await page.selectOption('#arena-fighter', '7'); // mock type for #7 is fire -> burst
  await page.click('#arena-start');
  await page.waitForFunction(() => window.__arena.state && document.getElementById('arena-overlay').hidden, null, { timeout: 15000 });
  await page.waitForTimeout(300);
  const st = await page.evaluate(() => window.__arena.state);
  check('fire fighter gets BURST; starts charging', st.player.sp === 'burst' && st.player.spT > 0 && /BURST \ds/.test(await page.textContent('#arena-special')), st.player);
  check('special can\'t be used while charging', !(await page.evaluate(() => window.__arena.special())));
  // freeze the match so only our actions matter: park rivals far away, zone untouched
  const setup = (sp, near) => page.evaluate(([sp, near]) => {
    const F = window.__arena.fighters, p = F[0]; p.sp = sp; p.spT = 0; p.x = 240; p.y = 300; p.hp = p.maxhp * 0.5; p.phase = 0;
    F.slice(1).forEach((o, i) => { o.alive = true; o.hp = o.maxhp; o.phase = 0; o.spT = 99; o.t = 99; o.atk = null; o.speed = 0; o.slow = 0; o.x = 30 + (i % 6) * 80; o.y = 150; });
    if (near) { F[1].x = 240 + near; F[1].y = 300; }
    return { hp1: F[1].hp, d1: Math.hypot(F[1].x - p.x, F[1].y - p.y), hpFar: F[5].hp, php: p.hp, px: p.x };
  }, [sp, near]);
  const after = () => page.evaluate(() => { const F = window.__arena.fighters, p = F[0]; return { hp1: F[1].hp, d1: Math.hypot(F[1].x - p.x, F[1].y - p.y), hpFar: F[5].hp, php: p.hp, px: p.x, phase: p.phase, spT: p.spT, slow1: F[1].slow }; });

  let a = await setup('burst', 50); await page.waitForTimeout(150);
  check('button shows READY when charged', await page.$eval('#arena-special', e => e.classList.contains('ready')) && /TAP/.test(await page.textContent('#arena-special')));
  await page.click('#arena-special'); let z = await after();
  check('BURST hurts a nearby rival, not a far one; recharge restarts (8s)', a.hp1 - z.hp1 > 10 && a.hpFar - z.hpFar < 3 && z.spT > 7.5, { a, z }); // live loop may tick once; far rival may take a sliver of zone damage while the live loop runs
  a = await setup('wave', 50); await page.evaluate(() => window.__arena.special()); z = await after();
  check('WAVE pushes a nearby rival away and chips it', z.d1 > a.d1 + 30 && z.hp1 < a.hp1, { a, z });
  a = await setup('dash', 0); await page.evaluate(() => window.__arena.setInput(1, 0)); await page.evaluate(() => window.__arena.special()); z = await after(); await page.evaluate(() => window.__arena.setInput(null));
  check('DASH moves the fighter ~130px in the input direction', z.px - a.px > 120, { a, z });
  a = await setup('heal', 0); await page.evaluate(() => window.__arena.special()); z = await after();
  check('HEAL restores health', z.php > a.php, { a, z });
  a = await setup('phase', 30);
  await page.evaluate(() => { const F = window.__arena.fighters; F[1].t = 0; F[1].cool = 0.05; }); // rival next to us attacks constantly
  await page.evaluate(() => window.__arena.special());
  await page.evaluate(() => { for (let i = 0; i < 30; i++) window.__arena.step(0.05); }); z = await after();
  check('PHASE: untouchable while it lasts', z.php === a.php && z.phase > 0, { a, z });
  a = await setup('barrage', 70); await page.evaluate(() => window.__arena.special());
  await page.evaluate(() => { for (let i = 0; i < 8; i++) window.__arena.step(0.05); }); z = await after();
  check('BARRAGE shots hit a rival', z.hp1 < a.hp1, { a, z });
  a = await setup('burst', 40); await page.evaluate(() => { window.__arena.fighters[1].hp = 1; });
  const k0 = (await page.evaluate(() => window.__arena.state)).kos;
  await page.evaluate(() => { window.__arena.special(); window.__arena.step(0.05); });
  check('a special knockout counts as your KO', (await page.evaluate(() => window.__arena.state)).kos === k0 + 1);
  await setup('heal', 0); await page.focus('body'); await page.keyboard.press('Space'); z = await after();
  check('Space bar triggers the special', z.spT > 7.5);
  const btn = await page.$eval('#arena-special', e => { const r = e.getBoundingClientRect(); return { h: r.height, w: r.width, vw: innerWidth, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
  check('375px: special button is a big tap target, no sideways scroll', btn.h >= 56 && btn.w <= btn.vw && btn.overflow <= 0, btn);
  // rivals use specials during a normal match (finish this one first; START is disabled mid-match)
  await page.evaluate(() => { for (let i = 0; i < 8000 && !window.__arena.state.over; i++) window.__arena.step(0.05); });
  await page.click('#arena-again');
  await page.waitForFunction(() => window.__arena.state && !window.__arena.state.over && document.getElementById('arena-overlay').hidden, null, { timeout: 15000 });
  const end = await page.evaluate(() => { for (let i = 0; i < 8000 && !window.__arena.state.over; i++) window.__arena.step(0.05); return window.__arena.state; });
  check('rivals use their specials too; match still finishes', end.over && end.aiSp > 0, end);
  check('special button hides when the match is over', await page.$eval('#arena-special', e => e.hidden));
  check('no uncaught JS errors', !errors.length, errors);
  await b.close(); close();
  console.log(failures ? `\n${failures} ARENA SPECIAL CHECK(S) FAILED` : '\nALL ARENA SPECIAL CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})();
