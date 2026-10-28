// Pixel Arena controls: thumb pad under the arena (default; dead zone + gentle curve), tap-to-move (also works in pad mode),
// hold-to-follow, follow-the-mouse on computers (default there), in-arena joystick (bigger), choice remembered, keyboard overrides a tap target, zone assist, +20% speed. Usage: node tests/arena-controls.test.js
const { chromium } = require('playwright');
const { serve } = require('./serve');
let failures = 0;
const check = (l, ok, x) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + l + (ok || x === undefined ? '' : '  ' + JSON.stringify(x))); if (!ok) failures++; };

(async () => {
  const { base, close } = await serve();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 375, height: 740 }, hasTouch: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('td-cookie-consent', 'denied'); } catch (e) {} });
  let page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', r => r.request().url().startsWith(base) ? r.continue() : r.abort()); // offline: sample fighters
  await page.goto(base + '/arena'); await page.waitForSelector('#arena-start');
  check('thumb pad is the default', (await page.inputValue('#arena-ctrl')) === 'pad');
  check('pad hidden before a match', await page.$eval('#arena-pad', e => e.hidden));
  await page.click('#arena-start');
  await page.waitForFunction(() => window.__arena.state && document.getElementById('arena-overlay').hidden, null, { timeout: 15000 });
  await page.waitForTimeout(800);
  check('START scrolls the arena, thumb pad and SPECIAL button into view', await page.evaluate(() => { const c = document.getElementById('arena-canvas').getBoundingClientRect(), s = document.getElementById('arena-special').getBoundingClientRect(), p = document.getElementById('arena-pad').getBoundingClientRect(); return s.bottom <= innerHeight + 1 && p.bottom <= innerHeight + 1 && c.bottom > 0; }));
  // freeze rivals so they don't push us around
  const freeze = () => page.evaluate(() => { const F = window.__arena.fighters; F.slice(1).forEach((o, i) => { o.x = 40 + i * 30; o.y = 160; o.speed = 0; o.t = 99; o.spT = 99; o.atk = null; o.hp = o.maxhp; }); });
  const toCanvas = async (cx, cy) => { await page.locator('#arena-canvas').scrollIntoViewIfNeeded(); const bb = await page.locator('#arena-canvas').boundingBox(); return [bb.x + cx * bb.width / 480, bb.y + cy * bb.height / 480]; };
  await freeze();
  await page.evaluate(() => { const p = window.__arena.fighters[0]; p.x = 150; p.y = 300; });
  let [tx, ty] = await toCanvas(330, 330);
  await page.touchscreen.tap(tx, ty);
  const tgt = (await page.evaluate(() => window.__arena.state)).target;
  check('a tap sets a walk target where you tapped', tgt && Math.abs(tgt.x - 330) < 6 && Math.abs(tgt.y - 312) < 6, tgt);
  await page.evaluate(() => { for (let i = 0; i < 60; i++) window.__arena.step(0.05); });
  let st = await page.evaluate(() => window.__arena.state);
  check('fighter walks to the tapped spot by itself, then the target clears', Math.hypot(st.player.x - 330, st.player.y - 312) < 10 && !st.target, st.player);
  // thumb pad: beside SPECIAL, big enough, on screen with the arena
  const padBox = await page.evaluate(() => { const p = document.getElementById('arena-pad').getBoundingClientRect(), s = document.getElementById('arena-special').getBoundingClientRect(); return { w: p.width, h: p.height, top: p.top, bottom: p.bottom, sLeft: s.left, pRight: p.right, sw: s.width, vw: innerHeight, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
  check('pad shows during a match: 136px, left of a still-wide SPECIAL button, fits 375px', padBox.w === 136 && padBox.h === 136 && padBox.pRight <= padBox.sLeft && padBox.sw >= 150 && padBox.overflow <= 0, padBox);
  const padDrag = async (fx, fy) => { const bb = await page.locator('#arena-pad').boundingBox(); const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
    await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + fx * 42, cy + fy * 42, { steps: 3 });
    const moved = await page.evaluate(() => { const A = window.__arena, p = A.fighters[0]; p.x = 120; p.y = 320; const x0 = p.x, y0 = p.y; for (let i = 0; i < 10; i++) A.step(0.05); return { dx: p.x - x0, dy: p.y - y0, full: p.speed * 0.5 }; });
    await page.mouse.up(); return moved; };
  await freeze();
  const full = await padDrag(1.3, 0), half = await padDrag(0.5, 0), tiny = await padDrag(0.08, 0), up = await padDrag(0, -1.3);
  check('pad pushed to the edge: full speed in that direction', Math.abs(full.dx - full.full) < 1 && Math.abs(full.dy) < 1, full);
  check('pad halfway: gentle (well under half speed)', half.dx > 0 && half.dx < full.dx * 0.45, { half: half.dx, full: full.dx });
  check('pad dead zone: a tiny wobble does nothing', Math.abs(tiny.dx) < 0.01, tiny);
  check('pad works in every direction (up)', up.dy < -full.full * 0.9, up);
  check('letting go stops the fighter and recentres the knob', (await page.evaluate(() => window.__arena.pad)) === null && (await page.$eval('#arena-pad-knob', e => e.style.transform)) === '');
  const spd = await page.evaluate(() => { const p = window.__arena.fighters[0]; return p.speed; });
  check('walking is 20% faster than before (speed >= 72 for any fighter)', spd >= 72, spd);
  // hold and drag: the target follows the finger
  await freeze();
  let [ax, ay] = await toCanvas(200, 300), [bx, by] = await toCanvas(120, 380);
  await page.mouse.move(ax, ay); await page.mouse.down(); await page.mouse.move(bx, by, { steps: 4 });
  st = await page.evaluate(() => window.__arena.state);
  check('holding and dragging moves the target with the finger', st.target && Math.abs(st.target.x - 120) < 6 && Math.abs(st.target.y - 362) < 6, st.target);
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
  // switching to tap hides the pad; the in-arena joystick is bigger now (56 screen px)
  await page.selectOption('#arena-ctrl', 'tap');
  check('Tap to move: no pad', await page.$eval('#arena-pad', e => e.hidden));
  await page.selectOption('#arena-ctrl', 'stick');
  if (!(await page.$eval('#arena-overlay', e => e.hidden))) { await page.click('#arena-start'); await page.waitForFunction(() => window.__arena.state && document.getElementById('arena-overlay').hidden, null, { timeout: 15000 }); }
  { const [sx, sy] = await toCanvas(240, 300); await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(sx + 10, sy, { steps: 2 });
    const r = await page.evaluate(() => window.__arena.stickR), w = (await page.locator('#arena-canvas').boundingBox()).width; await page.mouse.up();
    check('in-arena joystick reaches full speed at 56px, not 24px', Math.abs(r - 56 * 480 / w) < 1, { r, w }); }
  // joystick option persists
  await page.reload(); await page.waitForSelector('#arena-start');
  check('control choice is remembered', (await page.inputValue('#arena-ctrl')) === 'stick');
  const lay = await page.evaluate(() => { const r = document.getElementById('arena-ctrl').getBoundingClientRect(); return { h: r.height, font: getComputedStyle(document.getElementById('arena-ctrl')).fontSize, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
  check('375px: controls picker is 44px+, 16px text, no sideways scroll', lay.h >= 44 && lay.font === '16px' && lay.overflow <= 0, lay);
  // desktop with a mouse: "Follow mouse" is the default; the fighter walks toward the cursor without clicking
  const dctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const dp = await dctx.newPage(); dp.on('pageerror', e => errors.push(e.message));
  await dp.route('**/*', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
  await dp.goto(base + '/arena'); await dp.waitForSelector('#arena-start');
  check('computer with a mouse: Follow mouse is the default', (await dp.inputValue('#arena-ctrl')) === 'mouse');
  const cbox = async () => { await dp.locator('#arena-canvas').scrollIntoViewIfNeeded(); return dp.locator('#arena-canvas').boundingBox(); };
  let cb = await cbox();
  await dp.mouse.move(cb.x + cb.width * 0.7, cb.y + cb.height * 0.7);
  check('hovering before a match does nothing', !(await dp.evaluate(() => window.__arena.state)));
  await dp.click('#arena-start');
  await dp.waitForFunction(() => window.__arena.state && document.getElementById('arena-overlay').hidden, null, { timeout: 15000 });
  check('no thumb pad in mouse mode; crosshair cursor', (await dp.$eval('#arena-pad', e => e.hidden)) && (await dp.$eval('#arena-canvas', e => getComputedStyle(e).cursor)) === 'crosshair');
  await dp.evaluate(() => { const F = window.__arena.fighters; F.slice(1).forEach((o, i) => { o.x = 40 + i * 30; o.y = 160; o.speed = 0; o.t = 99; o.spT = 99; o.atk = null; }); F[0].x = 120; F[0].y = 300; });
  cb = await cbox();
  const at = (cx, cy) => [cb.x + cx * cb.width / 480, cb.y + cy * cb.height / 480];
  await dp.mouse.move(...at(360, 400), { steps: 4 });
  let ms = await dp.evaluate(() => window.__arena.state);
  check('moving the mouse over the arena sets where to walk (no click)', ms.target && Math.abs(ms.target.x - 360) < 6 && Math.abs(ms.target.y - 382) < 6, ms.target);
  await dp.evaluate(() => { for (let i = 0; i < 80; i++) window.__arena.step(0.05); });
  ms = await dp.evaluate(() => window.__arena.state);
  check('fighter walks to the cursor and waits there', Math.hypot(ms.player.x - 360, ms.player.y - 382) < 8 && ms.target, ms.player);
  await dp.mouse.move(...at(150, 330), { steps: 4 });
  await dp.evaluate(() => { for (let i = 0; i < 80; i++) window.__arena.step(0.05); });
  ms = await dp.evaluate(() => window.__arena.state);
  check('...and follows when the cursor moves', Math.hypot(ms.player.x - 150, ms.player.y - 312) < 8, ms.player);
  await dp.mouse.move(...at(400, 330)); await dp.mouse.move(cb.x + cb.width + 60, cb.y + 10, { steps: 3 });
  const x0 = (await dp.evaluate(() => window.__arena.state)).player.x;
  await dp.evaluate(() => { for (let i = 0; i < 20; i++) window.__arena.step(0.05); });
  ms = await dp.evaluate(() => window.__arena.state);
  check('cursor leaves the arena: fighter stops', !ms.target && Math.abs(ms.player.x - x0) < 1, { x0, x: ms.player.x });
  await dctx.close();
  check('no uncaught JS errors', !errors.length, errors);
  await b.close(); close();
  console.log(failures ? `\n${failures} ARENA CONTROL CHECK(S) FAILED` : '\nALL ARENA CONTROL CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})();
