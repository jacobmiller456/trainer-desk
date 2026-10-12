// Digital binder (stage 1, saved in this browser): add from card backs, pages of 9, move/remove, multiple binders,
// persistence, export/import, read-only share link, and a phone-width layout check.
// Usage: node tests/binder.test.js index.html
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const url = 'file://' + path.resolve(process.argv[2]);
const cors = { 'access-control-allow-origin': '*' };
const GIF = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
let failures = 0;
const check = (l, ok, x) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + l + (ok || x === undefined ? '' : '  ' + JSON.stringify(x))); if (!ok) failures++; };
const CARDS = Array.from({ length: 12 }, (_, i) => ({ id: 'c' + i, name: 'Card ' + i, number: String(i + 1), rarity: 'Rare',
  images: { small: `https://img.test/c${i}.png` }, tcgplayer: i < 6 ? { updatedAt: '2026/10/10', prices: { normal: { market: i + 1 } } } : undefined }));

async function setup(ctx) {
  const page = await ctx.newPage();
  page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
  await page.route('**/*', r => {
    const u = r.request().url();
    if (u.startsWith('file://')) return r.continue();
    if (u.startsWith('https://api.pokemontcg.io/v2/sets')) return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 's1', name: 'Live Set One', releaseDate: '2025/01/01' }] }) });
    if (u.startsWith('https://api.pokemontcg.io/v2/cards')) return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ data: CARDS }) });
    if (u.startsWith('https://img.test/')) return r.fulfill({ status: 200, contentType: 'image/gif', body: GIF });
    return r.abort();
  });
  return page;
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 375, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('td-cookie-consent', 'denied'); } catch (e) {} });
  let page = await setup(ctx);
  await page.goto(url);
  await page.click('button[data-view="tcg"]');
  await page.waitForFunction(() => document.querySelectorAll('#card-grid .tcard').length === 12, null, { timeout: 10000 });

  // add from the back of a flipped card
  const card0 = page.locator('#card-grid .tcard[data-id="c0"]');
  await card0.click();
  await page.waitForTimeout(650);
  await card0.locator('[data-add]').click();
  check('add button marks the card as in binder', (await card0.locator('[data-add]').textContent()) === '✓ IN BINDER');
  check('card stays flipped after tapping the button', (await card0.getAttribute('class')).includes('flipped'));
  check('toast confirms', /Added to My Binder \(1\)/.test(await page.textContent('#toast')));
  for (let i = 1; i < 11; i++) { const c = page.locator(`#card-grid .tcard[data-id="c${i}"]`); await c.click(); await page.waitForTimeout(650); await c.locator("[data-add]").click(); }
  check('toggle shows binder count', /\(11\)/.test(await page.textContent('[data-tcgview="binder"]')));

  // binder view
  await page.click('[data-tcgview="binder"]');
  check('own binder: no shared banner, name form and details closed', !(await page.isVisible('#binder-shared')) && !(await page.isVisible('#binder-name-form')) && !(await page.isVisible('#binder-detail')));
  check('binder view shown, browse hidden', (await page.isVisible('#tcg-binder')) && !(await page.isVisible('#card-grid')));
  check('page 1 holds 9 cards', (await page.$$eval('#binder-page .pocket[data-i]', n => n.length)) === 9);
  check('pager says page 1 of 2', /PAGE 1 \/ 2/.test(await page.textContent('#binder-pageno')));
  const stats = await page.textContent('#binder-stats');
  check('stats: count, pages, value of priced cards', /11 cards · 2 pages · value \$21\.00 \(6 priced/.test(stats), stats);
  check('set completion shown', /Live Set One: 11 \/ 12/.test(await page.textContent('#binder-sets')));
  await page.click('#binder-next');
  check('page 2: 2 cards + 7 empty pockets', (await page.$$eval('#binder-page .pocket[data-i]', n => n.length)) === 2 && (await page.$$eval('#binder-page .pocket.empty', n => n.length)) === 7);

  // move + remove
  await page.click('#binder-page .pocket[data-i="9"]');
  check('tapping a pocket opens its details', /Card 9/.test(await page.textContent('#binder-detail')));
  await page.click('#binder-detail [data-act="right"]');
  check('MOVE ▶ swaps order', (await page.evaluate(() => window.__binder.store.binders[0].cards.slice(9).map(c => c.id).join())) === 'c10,c9');
  await page.click('#binder-detail [data-act="remove"]');
  check('REMOVE drops the card', (await page.evaluate(() => window.__binder.store.binders[0].cards.length)) === 10);

  // second binder + move between binders
  await page.click('#binder-new'); await page.fill('#binder-name', 'Trades'); await page.click('#binder-name-form button[type=submit]');
  check('new binder created and selected', (await page.$eval('#binder-select', s => s.options[s.selectedIndex].textContent)) === 'Trades (0)');
  await page.selectOption('#binder-select', { index: 0 });
  await page.click('#binder-page .pocket[data-i="0"]');
  await page.selectOption('#binder-move-to', { label: 'Move to Trades' });
  await page.click('#binder-detail [data-act="moveto"]');
  const counts = await page.evaluate(() => window.__binder.store.binders.map(x => x.cards.length).join());
  check('card moved to the other binder', counts === '9,1', counts);

  // persistence
  await page.reload();
  await page.click('button[data-view="tcg"]'); await page.click('[data-tcgview="binder"]');
  check('binders survive a reload', (await page.$$eval('#binder-select option', o => o.map(x => x.textContent).join('|'))) === 'My Binder (9)|Trades (1)');

  // export / import
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#binder-export')]);
  const file = path.join(path.dirname(await dl.path()), 'binder-export.json');
  await dl.saveAs(file);
  const exported = JSON.parse(fs.readFileSync(file, 'utf8'));
  check('export is a Trainer Desk binder file', exported.app === 'trainer-desk' && exported.binders[0].cards.length === 9, { app: exported.app });
  await page.setInputFiles('#binder-import', file);
  await page.waitForFunction(() => window.__binder.store.binders.length === 3);
  check('import adds a renamed copy', (await page.$eval('#binder-select', s => s.options[s.selectedIndex].textContent)) === 'My Binder (imported) (9)');
  fs.writeFileSync(file, '{"not":"a binder"}');
  await page.setInputFiles('#binder-import', file);
  await page.waitForTimeout(200);
  check('bad file rejected with a message', /isn't a Trainer Desk binder/.test(await page.textContent('#toast')) && (await page.evaluate(() => window.__binder.store.binders.length)) === 3);

  // share link -> read-only view -> save a copy
  await page.selectOption('#binder-select', { index: 1 }); // Trades (1 card)
  await page.click('#binder-share');
  const link = await page.inputValue('#binder-share-url');
  check('share link generated', /#binder=[A-Za-z0-9_-]+$/.test(link));
  const viewer = await setup(ctx);
  await viewer.goto(link);
  await viewer.waitForSelector('#binder-shared:not([hidden])', { timeout: 5000 });
  check('shared link opens a read-only binder', (await viewer.isVisible('#binder-save-copy')) && !(await viewer.isVisible('#binder-new')) && (await viewer.$$eval('#binder-page .pocket[data-i]', n => n.length)) === 1);
  await viewer.click('#binder-save-copy');
  check('save a copy adds it and clears the link', (await viewer.evaluate(() => window.__binder.store.binders.some(x => x.name.startsWith('Trades')) && !location.hash)));

  // delete needs a second tap
  await page.click('#binder-delete');
  check('first delete tap only arms it', (await page.textContent('#binder-delete')) === 'TAP AGAIN TO DELETE' && (await page.evaluate(() => window.__binder.store.binders.length)) >= 3);
  await page.click('#binder-delete');
  check('second tap deletes', !(await page.$$eval('#binder-select option', o => o.map(x => x.textContent).join('|'))).includes('Trades (1)'));

  // phone layout (320px): no sideways scroll, controls are 44px tap targets
  await page.setViewportSize({ width: 320, height: 800 });
  await page.waitForTimeout(200);
  const lay = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const small = [...document.querySelectorAll('#tcg-binder button, #tcg-binder select, [data-tcgview]')].filter(el => { const r = el.getBoundingClientRect(); return r.width && r.height && (r.width < 44 || r.height < 44); }).map(el => el.id || el.className);
    return { overflow: document.documentElement.scrollWidth - vw, small };
  });
  check('320px: no horizontal scroll, all binder controls >= 44px', lay.overflow <= 0 && !lay.small.length, lay);
  check('no uncaught JS errors', !page.errors.length && !viewer.errors.length, page.errors.concat(viewer.errors));
  await b.close();
  console.log(failures ? `\n${failures} BINDER CHECK(S) FAILED` : '\nALL BINDER CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})();
