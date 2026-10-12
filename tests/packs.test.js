// Pack opener (TCG tab → OPEN PACKS) + holo shine on rare cards.
// Usage: node tests/packs.test.js
const { chromium } = require('playwright');
const { serve } = require('./serve');
let failures = 0;
const check = (l, ok, x) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + l + (ok || x === undefined ? '' : '  ' + JSON.stringify(x))); if (!ok) failures++; };
const cors = { 'access-control-allow-origin': '*' };
const GIF = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
const R = [['Common', 12], ['Uncommon', 6], ['Rare', 4], ['Double Rare', 2], ['Ultra Rare', 1], ['Special Illustration Rare', 1]];
const CARDS = []; R.forEach(([r, n]) => { for (let i = 0; i < n; i++) CARDS.push({ id: 'p' + CARDS.length, name: r + ' ' + i, number: String(CARDS.length + 1), rarity: r, images: { small: `https://img.test/p${CARDS.length}.png` }, tcgplayer: { prices: { normal: { market: 1 + CARDS.length } } } }); });

(async () => {
  const { base, close } = await serve();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 375, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('td-cookie-consent', 'denied'); } catch (e) {} });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', r => {
    const u = r.request().url();
    if (u.startsWith(base)) return r.continue();
    if (u.startsWith('https://api.pokemontcg.io/v2/sets')) return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'tst', name: 'Test Set', releaseDate: '2026/07/17' }] }) });
    if (u.startsWith('https://api.pokemontcg.io/v2/cards')) return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ data: CARDS }) });
    if (u.startsWith('https://img.test/')) return r.fulfill({ status: 200, contentType: 'image/gif', body: GIF });
    return r.abort();
  });
  await page.goto(base + '/tcg');
  await page.waitForFunction(() => document.querySelectorAll('#card-grid .tcard').length === 26, null, { timeout: 10000 });
  check('holo shine on rare card fronts only', (await page.$$eval('#card-grid .imgwrap.holo', n => n.length)) === 4 && !(await page.$eval('#card-grid .tcard[data-id="p0"] .imgwrap', e => e.classList.contains('holo'))));

  await page.click('[data-tcgview="packs"]');
  check('OPEN PACKS view shows a pack for the chosen set', (await page.isVisible('#pack-btn')) && /Test Set/.test(await page.textContent('#pack-btn')));
  await page.click('#pack-btn', { force: true }); // the pack gently bobs, so it's never 'stable'
  await page.waitForSelector('#pack-reveal:not([hidden]) .pull', { timeout: 5000 });
  let flips = 0, rareShown = false;
  for (let i = 0; i < 30 && !(await page.isVisible('#pack-summary')); i++) {
    await page.click('#pack-reveal .pull'); flips++;
    if (await page.$('#pack-reveal .pull.flipped .holo')) rareShown = true;
  }
  check('tapping flips each of 10 cards, then shows the pack', flips === 20 && (await page.$$eval('#pack-summary .pack-mini', n => n.length)) === 10, flips);
  const tiers = await page.evaluate(() => window.__packs.pack.map(p => window.__packs.tier(p.c.rarity)));
  check('pack order: 5 commons, 3 uncommons, reverse slot, rare slot last', tiers.slice(0, 5).every(t => t === 0) && tiers.slice(5, 8).every(t => t === 1) && tiers[8] <= 2 && tiers[9] >= 2, tiers);
  check('reverse-holo slot shines', rareShown);
  check('summary names the best pull and pack value', /Best pull: .+ · Pack value about \$\d/.test(await page.textContent('#pack-summary')));
  await page.click('#pack-add-all');
  check('ADD ALL TO BINDER adds the 10 cards', /Added 10 cards to My Binder/.test(await page.textContent('#toast')) && /\(10\)/.test(await page.textContent('[data-tcgview="binder"]')));
  check('stats count packs opened', /Packs opened: 1 · Best pull:/.test(await page.textContent('#pack-stats')));
  await page.click('#pack-again');
  await page.waitForSelector('#pack-reveal:not([hidden]) .pull', { timeout: 5000 });
  await page.click('#pack-skip');
  check('skip jumps to the full pack; stats remembered', (await page.isVisible('#pack-summary')) && /Packs opened: 2/.test(await page.textContent('#pack-stats')));

  const sim = await page.evaluate(() => { const c = { 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }; let ok = true; for (let i = 0; i < 400; i++) { const p = window.__packs.generate(); if (p.length !== 10 || new Set(p.map(x => x.c.id)).size !== 10) ok = false; c[window.__packs.tier(p[9].c.rarity)]++; } return { ok, c }; });
  check('400 packs: always 10 distinct cards, rare slot mostly plain Rare', sim.ok && sim.c[2] > sim.c[3] && sim.c[3] > 0 && sim.c[6] < 60, sim);

  await page.setViewportSize({ width: 320, height: 800 });
  await page.waitForTimeout(150);
  const lay = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    small: [...document.querySelectorAll('#tcg-packs button')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.width < 44 || r.height < 44); }).map(e => e.id || e.className) }));
  check('320px: no sideways scroll, buttons >= 44px', lay.overflow <= 0 && !lay.small.length, lay);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.click('#pack-again');
  await page.waitForSelector('#pack-reveal:not([hidden]) .pull', { timeout: 2000 });
  check('works with reduced motion (opens instantly)', true);
  check('no uncaught JS errors', !errors.length, errors);
  await b.close(); close();
  console.log(failures ? `\n${failures} PACK CHECK(S) FAILED` : '\nALL PACK CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})();
