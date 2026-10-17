// Pixel Arena controls: tap-to-move (default), hold-to-follow, joystick option (remembered), keyboard overrides a tap
// target, zone assist for an idle player. Usage: node tests/arena-controls.test.js
const { chromium } = require('playwright');
const { serve } = require('./serve');
let failures = 0;
const check = (l, ok, x) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + l + (ok || x === undefined ? '' : '  ' + JSON.stringify(x))); if (!ok) failures++; };

(async () => {
  const { base, close } = await serve();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 375, height: 1000 }, hasTouch: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('td-cookie-consent', 'denied'); } catch (e) {} });
  let page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', r => r.request().url().startsWith(base) ? r.continue() : r.abort()); // offline: sample fighters
  await page.goto(base + '/arena'); await page.waitForSelector('#arena-start');
  check('tap to move is the default', (await page.inputValue('#arena-ctrl')) === 'tap');
  await page.click('#arena-start');
  await page.waitForFunction(() => window.__arena.state && document.getElementById('arena-overlay').hidden, null, { timeout: 15000 });
  await page.waitForTimeout(800);
  check('START scrolls the arena and SPECIAL button into view', await page.evaluate(() => { const c = document.getElementById('arena-canvas').getBoundingClientRect(), s = document.getElementById('arena-special').getBoundingClientRect(); return s.bottom <= innerHeight + 1 && c.bottom > 0; }));
  // freeze rivals so they don't push us around
  const freeze = () => page.evaluate(() => { const F = window.__arena.fighters; F.slice(1).forEach((o, i) => { o.x = 40 + i * 30; o.y = 160; o.speed = 0; o.t = 99; o.spT = 99; o.atk = null; o.hp = o.maxhp; }); });
  const toCanvas = async (cx, cy) => { await page.locator('#arena-canvas').scrollIntoViewIfNeeded(); const bb = await page.locator('#arena-canvas').boundingBox(); return [bb.x + cx * bb.width / 480, bb.y + cy * bb.height / 480]; };
  await freeze();
  await page.evaluate(() => { const p = window.__arena.fighters[0]; p.x = 150; p.y = 300; });
  let [tx, ty] = await toCanvas(330, 330);
  await page.touchscreen.tap(tx, ty);
  const tgt = (await page.evaluate(() => window.__arena.state)).target;
  check('a tap sets a walk target where you tapped', tgt && Math.abs(tgt.x - 330) < 6 && Math.abs(tgt.y - 320) < 6, tgt);
  await page.evaluate(() => { for (let i = 0; i < 60; i++) window.__arena.step(0.05); });
  let st = await page.evaluate(() => window.__arena.state);
  check('fighter walks to the tapped spot by itself, then the target clears', Math.hypot(st.player.x - 330, st.player.y - 320) < 10 && !st.target, st.player);
  // hold and drag: the target follows the finger
  await freeze();
  let [ax, ay] = await toCanvas(200, 300), [bx, by] = await toCanvas(120, 380);
  await page.mouse.move(ax, ay); await page.mouse.down(); await page.mouse.move(bx, by, { steps: 4 });
  st = await page.evaluate(() => window.__arena.state);
  check('holding and dragging moves the target with the finger', st.target && Math.abs(st.target.x - 120) < 6 && Math.abs(st.target.y - 370) < 6, st.target);
  await page.mouse.up();
  // keyboard overrides a tap target
  await page.keyboard.down('ArrowUp'); await page.evaluate(() => window.__arena.step(0.05)); await page.keyboard.up('ArrowUp');
  check('a key press cancels the tap target', !(await page.evaluate(() => window.__arena.state)).target);
  // zone assist: an idle player outside the safe zone drifts back in
  await page.evaluate(() => { const p = window.__arena.fighters[0]; p.x = 470; p.y = 470; window.__arena.setInput(null); });
  await page.evaluate(() => { for (let i = 0; i < 400; i++) window.__arena.step(0.05); }); // zone has shrunk a lot by now
  st = await page.evaluate(() => window.__arena.state);
  const inZone = await page.evaluate(() => { const p = window.__arena.fighters[0]; return Math.hypot(p.x - 240, (p.y - 300) / 0.62); });
  check('zone assist walks an idle player back toward the centre', st.player.x < 400 && inZone < 200, { x: st.player.x, y: st.player.y, inZone });
  // joystick option persists
  await page.selectOption('#arena-ctrl', 'stick');
  await page.reload(); await page.waitForSelector('#arena-start');
  check('control choice is remembered', (await page.inputValue('#arena-ctrl')) === 'stick');
  const lay = await page.evaluate(() => { const r = document.getElementById('arena-ctrl').getBoundingClientRect(); return { h: r.height, font: getComputedStyle(document.getElementById('arena-ctrl')).fontSize, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
  check('375px: controls picker is 44px+, 16px text, no sideways scroll', lay.h >= 44 && lay.font === '16px' && lay.overflow <= 0, lay);
  check('no uncaught JS errors', !errors.length, errors);
  await b.close(); close();
  console.log(failures ? `\n${failures} ARENA CONTROL CHECK(S) FAILED` : '\nALL ARENA CONTROL CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})();
