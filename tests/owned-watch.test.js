// Set completion (✓ I own this, progress, filter, My set progress) and the watchlist (★ watch, price change since the last
// visit and since added, remove, open), on the real card catalog (tcgdata/) with mocked saved prices.
// Usage: node tests/owned-watch.test.js
const { chromium } = require('playwright');
const { serve } = require('./serve');
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
let failures = 0;
const check = (l, ok, x) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + l + (ok || x === undefined ? '' : '  ' + JSON.stringify(x))); if (!ok) failures++; };
const GIF = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
const json = (r, body) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

(async () => {
  const { base, close } = await serve();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 375, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('td-cookie-consent', 'denied'); } catch (e) {} });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', r => {
    const u = r.request().url(), q = new URL(u).pathname;
    if (u.startsWith(base) && q.startsWith('/tcgdata/')) return r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync(path.join(root, q)) });
    if (u.startsWith(base) && q === '/prices/latest.json') return json(r, { updated: '2026-11-11T08:00:00Z', source: 'tcgdex', sourceSince: '2026-11-05', months: { '2026-11': ['sv3pt5'] } });
    if (u.startsWith(base) && q === '/prices/2026-11/sv3pt5.json') return json(r, { days: ['2026-11-05', '2026-11-11'], cards: { 'sv3pt5-199': [298.38, 305], 'sv3pt5-25': [0.7, 0.78] } });
    if (u.startsWith(base) && q.startsWith('/prices/')) return r.fulfill({ status: 404 });
    if (u.startsWith(base)) return r.continue();
    if (/^https:\/\/(images\.pokemontcg\.io|assets\.tcgdex\.net|images\.scrydex\.com)\//.test(u)) return r.fulfill({ status: 200, contentType: 'image/gif', body: GIF });
    return r.abort();
  });
  const open151 = async () => { await page.goto(base + '/tcg?set=sv3pt5'); await page.waitForFunction(() => document.querySelectorAll('#card-grid .tcard').length === 207, null, { timeout: 15000 }); await page.waitForTimeout(600); };
  await open151();

  // ---- set completion
  const ownBtn = id => `#card-grid .tc-own[data-own="${id}"]`;
  const bb = await page.$eval(ownBtn('sv3pt5-199'), e => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height }; });
  check('✓ button on each card, 44px', bb.w >= 44 && bb.h >= 44, bb);
  check('progress line invites tracking before anything is owned', /Tap ✓ on a card to track your set/.test(await page.textContent('#own-line')));
  await page.click(ownBtn('sv3pt5-199')); await page.click(ownBtn('sv3pt5-25'));
  const flipped = await page.$eval('#card-grid .tcard[data-id="sv3pt5-199"]', e => e.classList.contains('flipped'));
  check('tapping ✓ marks the card owned without flipping it', (await page.getAttribute(ownBtn('sv3pt5-199'), 'aria-pressed')) === 'true' && !flipped);
  const line = (await page.textContent('#own-line')).replace(/\s+/g, ' ');
  check('progress: 2 / 207 (1%) and the value of the owned cards ($305.78)', /You own 2 \/ 207 \(1%\)/.test(line) && /worth about \$305\.78/.test(line), line);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('td-owned-v1')));
  check('saved on this device: set, name, size, card numbers', stored.sv3pt5 && stored.sv3pt5.name === '151' && stored.sv3pt5.n === 207 && JSON.stringify(stored.sv3pt5.have.sort()) === '["199","25"]', stored);
  await page.selectOption('#own-filter', 'owned');
  check('filter: cards I own', (await page.$$eval('#card-grid .tcard', t => t.map(x => x.dataset.id).sort())).join() === 'sv3pt5-199,sv3pt5-25');
  await page.selectOption('#own-filter', 'missing');
  check('filter: cards I\'m missing', (await page.$$eval('#card-grid .tcard', t => t.length)) === 205);
  await page.selectOption('#own-filter', 'all');
  // card detail button stays in sync with the tile
  await page.click('#card-grid .tcard[data-id="sv3pt5-1"] .tc-zoom'); await page.waitForFunction(() => document.getElementById('card-detail').open);
  await page.click('#cdd-own');
  check('card detail: + I OWN THIS marks it owned (tile updates too)', (await page.textContent('#cdd-own')) === '✓ I OWN THIS' && (await page.getAttribute(ownBtn('sv3pt5-1'), 'aria-pressed')) === 'true');
  // ---- watchlist: star from the card detail
  await page.click('#cdd-next'); // card #2 (no saved price)
  await page.click('#cdd-prev');
  await page.click('#cdd-watch');
  check('card detail: ☆ WATCH PRICE → ★ WATCHING, count on the WATCHLIST button', (await page.textContent('#cdd-watch')) === '★ WATCHING' && /\(1\)/.test(await page.textContent('[data-tcgview="watch"]')));
  await page.keyboard.press('Escape');
  await page.click('#card-grid .tcard[data-id="sv3pt5-199"] .tc-zoom'); await page.waitForFunction(() => document.getElementById('card-detail').open);
  await page.waitForFunction(() => /\$305\.00/.test(document.getElementById('cdd-body').textContent), null, { timeout: 8000 });
  await page.click('#cdd-watch'); await page.keyboard.press('Escape');
  // pretend the visitor last looked on Nov 5 (price then 290) and added it at 250
  await page.evaluate(() => { const w = JSON.parse(localStorage.getItem('td-watch-v1')); Object.assign(w['sv3pt5-199'], { p0: 250, last: { p: 290, day: '2026-11-05' }, cmp: null }); localStorage.setItem('td-watch-v1', JSON.stringify(w)); });
  await page.reload(); await page.waitForFunction(() => document.querySelectorAll('#card-grid .tcard').length === 207, null, { timeout: 15000 });
  await page.click('[data-tcgview="watch"]');
  await page.waitForFunction(() => /watching/.test(document.getElementById('wl-intro').textContent), null, { timeout: 8000 });
  const row = (await page.textContent('#wl-list .wl-row:has([data-card="sv3pt5-199"])')).replace(/\s+/g, ' ');
  check('watchlist row: current price, change since the last visit (Nov 5) and since added', /\$305\.00/.test(row) && /▲ 5\.2% since Nov 5/.test(row) && /▲ 22% since you added it/.test(row), row);
  const row1 = (await page.textContent('#wl-list .wl-row:has([data-card="sv3pt5-1"])')).replace(/\s+/g, ' ');
  check('card without a saved price: says so', /no price yet/.test(row1), row1);
  await page.reload(); await page.waitForFunction(() => document.querySelectorAll('#card-grid .tcard').length === 207, null, { timeout: 15000 });
  await page.click('[data-tcgview="watch"]'); await page.waitForFunction(() => /watching/.test(document.getElementById('wl-intro').textContent));
  check('reopening the same day keeps showing the change since the last visit', /▲ 5\.2% since Nov 5/.test(await page.textContent('#wl-list')));
  const lay = await page.evaluate(() => { const small = [...document.querySelectorAll('#tcg-watch a, #tcg-watch button')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.height < 44 || r.width < 44); }).length; return { small, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
  check('375px: watchlist tap targets 44px+, no sideways scroll', !lay.small && lay.overflow <= 0, lay);
  await page.click('#wl-list [data-del="sv3pt5-1"]');
  check('✕ removes a card', (await page.$$eval('#wl-list .wl-row', r => r.length)) === 1 && /\(1\)/.test(await page.textContent('[data-tcgview="watch"]')));
  await page.click('#wl-list a[data-card="sv3pt5-199"]');
  await page.waitForFunction(() => document.getElementById('card-detail').open, null, { timeout: 10000 });
  check('tapping a watched card opens it in the set browser', /Charizard ex/.test(await page.textContent('#cdd-name')) && (await page.inputValue('#set-select')) === 'sv3pt5');
  await page.keyboard.press('Escape');

  // My set progress (after reload, from storage) opens the set
  await page.goto(base + '/tcg?set=me6'); await page.waitForFunction(() => document.querySelectorAll('#card-grid .tcard').length > 100, null, { timeout: 15000 });
  const sum = (await page.textContent('#own-sets')).replace(/\s+/g, ' ');
  check('My set progress lists 151 with 3 / 207', /MY SET PROGRESS \(1\)/.test(sum) && /151 3 \/ 207 · 1%/.test(sum), sum);
  await page.click('#own-sets summary'); await page.click('#own-sets [data-set="sv3pt5"]');
  await page.waitForFunction(() => document.getElementById('set-select').value === 'sv3pt5' && document.querySelectorAll('#card-grid .tcard').length === 207, null, { timeout: 15000 });
  check('tapping a set in My set progress opens it', true);
  await page.goto(base + '/tcg?view=watch'); await page.waitForFunction(() => !document.getElementById('tcg-watch').hidden, null, { timeout: 10000 }).catch(() => {});
  check('/tcg?view=watch opens the watchlist (home-screen shortcut style link)', !(await page.$eval('#tcg-watch', e => e.hidden)));

  check('no uncaught JS errors', !errors.length, errors);
  await b.close(); close();
  console.log(failures ? `\n${failures} OWNED/WATCHLIST CHECK(S) FAILED` : '\nALL OWNED/WATCHLIST CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})();
