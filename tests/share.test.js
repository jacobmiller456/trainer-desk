// Share picture (card detail → SHARE): a 1080×1350 PNG with the card picture, name, price and site address, saved on
// computers (no share sheet) with the link copied; falls back to a plain card shape if the picture can't load.
// Mocked catalog, prices and picture. Usage: node tests/share.test.js
const { chromium } = require('playwright');
const { serve } = require('./serve');
let failures = 0;
const check = (l, ok, x) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + l + (ok || x === undefined ? '' : '  ' + JSON.stringify(x))); if (!ok) failures++; };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const json = (r, body) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

(async () => {
  const { base, close } = await serve();
  const b = await chromium.launch();
  const run = async (picture) => {
    const ctx = await b.newContext({ viewport: { width: 375, height: 900 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
    await ctx.addInitScript(() => { try { localStorage.setItem('td-cookie-consent', 'denied'); } catch (e) {} });
    const page = await ctx.newPage(); page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
    await page.route('**/*', r => {
      const u = r.request().url(), q = new URL(u).pathname;
      if (u.startsWith(base)) {
        const f = { '/tcgdata/sets.json': [{ id: 'sv3pt5', name: '151', releaseDate: '2023/09/22', printedTotal: 165, code: 'MEW' }],
          '/tcgdata/sv3pt5.json': { id: 'sv3pt5', name: '151', printedTotal: 165, img: '', cards: [['199', 'Charizard ex', 'Special Illustration Rare', 'Pokémon', 'Fire', '330', 'A', 'https://assets.tcgdex.net/en/sv/sv03.5/199/low.webp', '']] },
          '/prices/latest.json': { updated: '2026-11-20T08:00:00Z', source: 'tcgdex', sourceSince: '2026-11-05', months: { '2026-11': ['sv3pt5'] } },
          '/prices/2026-11/sv3pt5.json': { days: ['2026-11-05', '2026-11-12', '2026-11-20'], cards: { 'sv3pt5-199': [298.38, 290, 285.96] } } }[q];
        if (f) return json(r, f);
        if (q.startsWith('/tcgdata/') || q.startsWith('/prices/')) return r.fulfill({ status: 404 });
        return r.continue();
      }
      if (u.startsWith('https://assets.tcgdex.net/')) return picture ? r.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: PNG }) : r.fulfill({ status: 404 });
      return r.abort();
    });
    await page.goto(base + '/tcg?set=sv3pt5&card=sv3pt5-199');
    await page.waitForFunction(() => document.getElementById('card-detail').open, null, { timeout: 15000 });
    await page.waitForFunction(() => /\$285\.96/.test(document.getElementById('cdd-body').textContent), null, { timeout: 8000 });
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('#cdd-share')]);
    const buf = require('fs').readFileSync(await dl.path());
    const size = { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    const toast = await page.waitForFunction(() => { const t = [...document.querySelectorAll('.toast,[role=status]')].map(x => x.textContent).join(' '); return /Picture saved/.test(t) && t; }, null, { timeout: 5000 }).then(h => h.jsonValue()).catch(() => '');
    const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    const btn = await page.$eval('#cdd-share', e => ({ text: e.textContent, h: e.getBoundingClientRect().height }));
    const out = { name: dl.suggestedFilename(), size, png: buf.slice(1, 4).toString() === 'PNG', toast, clip, btn, errors: page.errors };
    await ctx.close(); return out;
  };
  const a = await run(true);
  check('SHARE saves a 1080×1350 PNG named after the card', a.png && a.size.w === 1080 && a.size.h === 1350 && a.name === 'trainer-desk-sv3pt5-199.png', a);
  check('…copies the card\'s link and says so; button back to SHARE, 44px', /\/tcg\?set=sv3pt5&card=sv3pt5-199$/.test(a.clip) && /Picture saved and link copied/.test(a.toast) && a.btn.text === 'SHARE' && a.btn.h >= 44, a);
  const z = await run(false);
  check('picture unavailable: the share picture is still made (plain card shape)', z.png && z.size.w === 1080, z);
  check('no uncaught JS errors', !a.errors.length && !z.errors.length, a.errors.concat(z.errors));
  await b.close(); close();
  console.log(failures ? `\n${failures} SHARE CHECK(S) FAILED` : '\nALL SHARE CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})();
