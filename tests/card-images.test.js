// Card images: page-managed lazy loading (no native loading="lazy" inside the 3D flip card, which iPhone Safari
// can fail to load), WebP -> PNG fallback, and placeholder art when an image is broken.
// Usage: node tests/card-images.test.js index.html
const { chromium, devices } = require('playwright');
const path = require('path');
const url = 'file://' + path.resolve(process.argv[2]);
const cors = { 'access-control-allow-origin': '*' };
const GIF = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
let failures = 0;
const check = (l, ok, x) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + l + (ok || x === undefined ? '' : '  ' + JSON.stringify(x))); if (!ok) failures++; };

const cards = Array.from({ length: 40 }, (_, i) => ({ id: 'c' + i, name: 'Card ' + i, number: String(i + 1), rarity: 'Common',
  images: { small: i === 0 ? 'https://img.test/broken.png' : i === 1 ? 'https://img.test/only-png/low.webp' : `https://img.test/c${i}.png` } }));

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const imgHits = new Set();
  await page.route('**/*', r => {
    const u = r.request().url();
    if (u.startsWith('file://')) return r.continue();
    if (u.startsWith('https://api.pokemontcg.io/v2/sets')) return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 's1', name: 'Set One', releaseDate: '2025/01/01' }] }) });
    if (u.startsWith('https://api.pokemontcg.io/v2/cards')) return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ data: cards }) });
    if (u.startsWith('https://img.test/')) {
      imgHits.add(u);
      if (u.endsWith('broken.png') || u.endsWith('only-png/low.webp')) return r.fulfill({ status: 404, body: '' });
      return r.fulfill({ status: 200, contentType: u.endsWith('.webp') ? 'image/webp' : 'image/png', body: GIF });
    }
    return r.abort();
  });
  await page.goto(url);
  await page.evaluate(() => { try { localStorage.setItem('td-cookie-consent', 'denied'); } catch (e) {} });
  await page.tap('button[data-view="tcg"]');
  await page.waitForFunction(() => document.querySelectorAll('#card-grid .tcard').length === 40, null, { timeout: 10000 });
  await page.waitForTimeout(400);
  check('no native loading="lazy" on card images', (await page.$$eval('#card-grid img[loading="lazy"]', n => n.length)) === 0);
  const started = await page.$$eval('#card-grid img.card-img', n => n.filter(i => i.getAttribute('src')).length);
  check('first rows load right away, far cards wait', started >= 10 && started < 39, started);
  // scroll to the bottom: everything gets requested
  for (let y = 0; y < 30; y++) { await page.mouse.wheel(0, 900); await page.waitForTimeout(40); }
  await page.waitForTimeout(400);
  const all = await page.$$eval('#card-grid img.card-img', n => ({ total: n.length, withSrc: n.filter(i => i.getAttribute('src')).length }));
  check('scrolling loads every remaining card image', all.total === all.withSrc && all.total >= 38, all);
  const firstHasSvg = await page.$eval('#card-grid .tcard[data-id="c0"] .imgwrap', w => !!w.querySelector('svg') && !w.querySelector('img'));
  check('broken image is replaced by placeholder art', firstHasSvg);
  const pngSrc = await page.$eval('#card-grid .tcard[data-id="c1"] img', i => i.getAttribute('src')).catch(() => null);
  check('WebP that fails falls back to PNG', pngSrc === 'https://img.test/only-png/low.png', pngSrc);
  const box = await page.$eval('#card-grid .tcard[data-id="c5"] .imgwrap', w => { const r = w.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
  check('image box keeps card shape', box.h > box.w * 1.3, box);
  check('no uncaught JS errors', !errors.length, errors);
  await b.close();
  console.log(failures ? `\n${failures} CARD IMAGE CHECK(S) FAILED` : '\nALL CARD IMAGE CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})();
