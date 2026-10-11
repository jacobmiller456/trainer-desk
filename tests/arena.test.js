// Pixel Arena: starts, takes input, plays to a result, works offline and with mocked PokéAPI.
// Usage: node tests/arena.test.js index.html
const { chromium } = require('playwright');
const path = require('path');
const url = 'file://' + path.resolve(process.argv[2]);
const cors = { 'access-control-allow-origin': '*' };
let failures = 0;
const check = (l, ok, x) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + l + (ok || x === undefined ? '' : '  ' + JSON.stringify(x))); if (!ok) failures++; };

const STATS = n => [['hp', 60 + n % 40], ['attack', 50 + n % 50], ['defense', 50], ['special-attack', 55], ['special-defense', 50], ['speed', 40 + n % 70]].map(([k, v]) => ({ base_stat: v, stat: { name: k } }));
const TYPES = ['fire', 'water', 'grass', 'electric', 'ghost', 'steel', 'fairy'];
const mockPokemon = id => ({ id, name: 'mon' + id, species: { name: 'mon' + id }, height: 5, weight: 50, types: [{ slot: 1, type: { name: TYPES[id % TYPES.length] } }], abilities: [], stats: STATS(id) });

async function run(mode) {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 400, height: 900 }, hasTouch: false });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', r => {
    const u = r.request().url();
    if (u.startsWith('file://')) return r.continue();
    const m = u.match(/^https:\/\/pokeapi\.co\/api\/v2\/pokemon\/(\d+)$/);
    if (mode === 'mock' && m) return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(mockPokemon(+m[1])) });
    return r.abort();
  });
  await page.goto(url);
  await page.click('button[data-view="arena"]');
  check(`${mode}: arena view shown with overlay hint`, (await page.isVisible('#view-arena')) && (await page.isVisible('#arena-overlay')));
  const opts = await page.$$eval('#arena-fighter option', o => o.length);
  check(`${mode}: fighter picker populated`, opts >= 20, opts);

  await page.click('#arena-start');
  await page.waitForFunction(() => window.__arena.state && !document.querySelector('#arena-overlay:not([hidden])'), null, { timeout: 15000 });
  const s0 = await page.evaluate(() => window.__arena.state);
  check(`${mode}: game started with several fighters`, s0.total >= 5 && s0.alive === s0.total, s0);
  if (mode === 'mock') check('mock: full 12-fighter lobby', s0.total === 12, s0.total);

  // canvas actually draws something (not blank)
  const painted = await page.evaluate(() => { const c = document.getElementById('arena-canvas').getContext('2d'); const d = c.getImageData(0, 0, 480, 480).data; const seen = new Set(); for (let i = 0; i < d.length; i += 4) seen.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]); return seen.size; });
  check(`${mode}: canvas painted`, painted > 3, painted);

  // keyboard moves the player
  await page.evaluate(() => window.__arena.setInput(null));
  const x0 = (await page.evaluate(() => window.__arena.state)).player.x;
  await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(400); await page.keyboard.up('ArrowLeft');
  const x1 = (await page.evaluate(() => window.__arena.state)).player.x;
  check(`${mode}: arrow key moves the player`, x1 < x0 - 5, { x0, x1 });

  // drag on the canvas (touch/mouse joystick) moves the player
  const box = await page.locator('#arena-canvas').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const y0 = (await page.evaluate(() => window.__arena.state)).player.y;
  await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx, cy + 90, { steps: 5 }); await page.waitForTimeout(400); await page.mouse.up();
  const y1 = (await page.evaluate(() => window.__arena.state)).player.y;
  check(`${mode}: dragging the arena moves the player`, y1 > y0 + 5, { y0, y1 });

  // fast-forward: the shrinking zone guarantees a result
  const end = await page.evaluate(() => { for (let i = 0; i < 6000 && !window.__arena.state.over; i++) window.__arena.step(0.05); return window.__arena.state; });
  check(`${mode}: game reaches a result`, end.over === true && end.place >= 1 && end.place <= end.total, end);
  check(`${mode}: result overlay with PLAY AGAIN`, (await page.isVisible('#arena-overlay')) && (await page.isVisible('#arena-again')));

  // play again works, leaving the tab stops the game
  await page.click('#arena-again');
  await page.waitForFunction(() => window.__arena.state && !window.__arena.state.over, null, { timeout: 15000 });
  check(`${mode}: play again starts a fresh game`, true);
  await page.click('button[data-view="go"]');
  check(`${mode}: leaving the tab stops the game`, (await page.evaluate(() => window.__arena.state)) === null);
  check(`${mode}: no uncaught JS errors`, !errors.length, errors);
  await b.close();
}

(async () => {
  await run('offline');
  await run('mock');
  console.log(failures ? `\n${failures} ARENA CHECK(S) FAILED` : '\nALL ARENA CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})();
