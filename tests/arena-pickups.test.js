// Pixel Arena pickups (heal / speed boost / shield) and sound + vibration (toggle, what plays when, muted = silent).
// Usage: node tests/arena-pickups.test.js
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
  const ctx = await b.newContext({ viewport: { width: 375, height: 1000 } });
  await ctx.addInitScript(() => { window.__buzz = []; Object.defineProperty(navigator, 'vibrate', { value: p => { window.__buzz.push(p); return true; }, configurable: true }); });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', r => {
    const u = r.request().url(); if (u.startsWith(base)) return r.continue();
    const m = u.match(/^https:\/\/pokeapi\.co\/api\/v2\/pokemon\/(\d+)$/);
    if (m) return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(mockPokemon(+m[1])) });
    return r.abort();
  });
  await page.goto(base + '/arena'); await page.waitForSelector('#arena-start');
  const btn = () => page.$eval('#arena-sound', e => { const r = e.getBoundingClientRect(); return { text: e.textContent, pressed: e.getAttribute('aria-pressed'), w: r.width, h: r.height }; });
  let sb = await btn();
  check('sound toggle: on by default, 44px, says what it does', /SOUND ON/.test(sb.text) && sb.pressed === 'true' && sb.w >= 44 && sb.h >= 44, sb);
  check('intro explains the pickups', /green heals, yellow gives a speed boost, blue a shield/.test(await page.textContent('#view-arena .view-head p')));

  await page.click('#arena-start');
  await page.waitForFunction(() => window.__arena.state && document.getElementById('arena-overlay').hidden, null, { timeout: 15000 });
  // pause the real loop's influence: rivals frozen far away, player centred
  const setup = () => page.evaluate(() => { const f = window.__arena.fighters; f.forEach((x, i) => { if (i) { x.speed = 0; x.dmg = 0; x.x = 20 + i; x.y = 470; x.t = 99; x.spT = 99; } }); f[0].x = 240; f[0].y = 260; f[0].hp = f[0].maxhp; f[0].boost = 0; f[0].shield = 0; });
  await setup();

  // speed boost
  const moved = () => page.evaluate(() => { const A = window.__arena, p = A.fighters[0]; p.x = 150; const x0 = p.x; A.setInput(1, 0); for (let i = 0; i < 4; i++) A.step(0.05); A.setInput(0, 0); return p.x - x0; });
  const normal = await moved();
  await page.evaluate(() => { window.__arena.dropPickup('speed'); window.__arena.step(0.01); });
  let st = await page.evaluate(() => window.__arena.state);
  const fast = await moved();
  check('speed pickup: taken, 6s boost, ~45% faster', st.picks === 1 && st.player.boost > 5.9 && fast / normal > 1.4 && fast / normal < 1.5, { picks: st.picks, boost: st.player.boost, normal, fast });
  check('pickup plays a sound and a short vibration', (await page.evaluate(() => window.__arena.sounds)).includes('pickup') && (await page.evaluate(() => window.__buzz)).includes(15));
  await page.evaluate(() => { for (let i = 0; i < 130; i++) window.__arena.step(0.05); });
  check('boost wears off after 6s', (await page.evaluate(() => window.__arena.state.player.boost)) === 0);

  // shield: a rival's burst does half damage
  await setup();
  const burstDmg = () => page.evaluate(() => { const A = window.__arena, f = A.fighters, p = f[0], r = f[1]; p.hp = p.maxhp; r.x = p.x + 30; r.y = p.y; r.sp = 'burst'; r.spT = 0; r.dmg = 20; A.useSpecialFor(1); const d = p.maxhp - p.hp; r.dmg = 0; r.x = 21; r.y = 470; return d; });
  const plain = await burstDmg();
  await page.evaluate(() => { window.__arena.dropPickup('shield'); window.__arena.step(0.01); });
  st = await page.evaluate(() => window.__arena.state);
  const shielded = await burstDmg();
  check('shield pickup: 6s, halves damage', st.player.shield > 5.9 && plain > 0 && Math.abs(shielded / plain - 0.5) < 0.02, { shield: st.player.shield, plain, shielded });
  await page.evaluate(() => window.__arena.step(0.3)); // let the HUD refresh
  await page.waitForTimeout(400);
  check('HUD shows the shield timer', /SHIELD \ds/.test(await page.textContent('#arena-hud')), await page.textContent('#arena-hud'));
  check('getting hit: hurt sound + vibration', (await page.evaluate(() => window.__arena.sounds)).includes('hurt') && (await page.evaluate(() => window.__buzz)).includes(20));

  // heal
  await page.evaluate(() => { const p = window.__arena.fighters[0]; p.hp = p.maxhp * 0.2; window.__arena.dropPickup('heal'); window.__arena.step(0.01); });
  const hp = await page.evaluate(() => { const p = window.__arena.fighters[0]; return p.hp / p.maxhp; });
  check('heal pickup: +30% HP', Math.abs(hp - 0.5) < 0.02, hp);

  // player KO: special + knockout sounds and vibration
  await setup();
  const ko = await page.evaluate(() => { const A = window.__arena, f = A.fighters, p = f[0], r = f[2]; p.dmg = 30; p.sp = 'burst'; p.spT = 0; r.x = p.x + 25; r.y = p.y; r.hp = 1; A.special(); A.step(0.01); return { s: A.sounds, b: window.__buzz }; });
  check('player special and knockout: sounds + vibration', ko.s.includes('special') && ko.s.includes('ko') && ko.b.some(x => Array.isArray(x)), ko);

  // pickups appear on their own, every kind known
  await setup();
  const kinds = await page.evaluate(() => { const A = window.__arena, seen = new Set(); A.fighters[0].x = 60; A.fighters[0].y = 60; for (let i = 0; i < 400; i++) { A.step(0.05); A.fighters.forEach(f => { f.hp = f.maxhp; }); A.state.orbs.forEach(k => seen.add(k)); } return [...seen]; });
  check('pickups spawn by themselves (heal/speed/shield only)', kinds.length >= 1 && kinds.every(k => ['heal', 'speed', 'shield'].includes(k)), kinds);

  // mute: nothing plays or vibrates, choice saved
  await page.click('#arena-sound');
  sb = await btn();
  check('toggle turns sound off and saves it', /SOUND OFF/.test(sb.text) && sb.pressed === 'false' && (await page.evaluate(() => localStorage.getItem('td-arena-sound'))) === 'off', sb);
  const before = await page.evaluate(() => [window.__arena.sounds.length, window.__buzz.length]);
  await page.waitForTimeout(100);
  await page.evaluate(() => { window.__arena.dropPickup('heal'); window.__arena.step(0.01); });
  const after = await page.evaluate(() => [window.__arena.sounds.length, window.__buzz.length]);
  check('muted: pickups make no sound or vibration', JSON.stringify(before) === JSON.stringify(after), { before, after });
  await page.reload(); await page.waitForSelector('#arena-sound');
  check('muted choice remembered', /SOUND OFF/.test((await btn()).text));
  const wide = await page.evaluate(() => document.documentElement.scrollWidth);
  check('controls still fit at 375px', wide <= 375, wide);

  check('no uncaught JS errors', !errors.length, errors);
  await b.close(); close();
  console.log(failures ? `\n${failures} ARENA PICKUP CHECK(S) FAILED` : '\nALL ARENA PICKUP CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})();
