// My Collection (Pokédex tab): marking caught/shiny/lucky/hundo, progress overall + per gen, filters (search, gen, type,
// missing/have, raid bosses now), two-tap bulk mark/unmark, persistence, export/import, offline message, phone layout.
// Usage: node tests/collection.test.js
const { chromium } = require('playwright');
const { serve } = require('./serve');
const fs = require('fs'), path = require('path');
let failures = 0;
const check = (l, ok, x) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + l + (ok || x === undefined ? '' : '  ' + JSON.stringify(x))); if (!ok) failures++; };
const GIF = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
const names = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets/pokedex-names.json'), 'utf8'));
const RAIDS = [{ name: 'Mega Charizard Y', tier: 'Mega Raids', types: [{ name: 'fire' }, { name: 'flying' }] }, { name: 'Dialga', tier: '5-Star Raids', types: [{ name: 'steel' }, { name: 'dragon' }] }, { name: 'Galarian Slowpoke', tier: '1-Star Raids', types: [{ name: 'psychic' }] }];

async function open(ctx, base, { namesOk = true } = {}) {
  const page = await ctx.newPage(); page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
  await page.route('**/*', r => {
    const u = r.request().url();
    if (u.startsWith(base) && u.includes('pokedex-names.json') && !namesOk) return r.abort();
    if (u.startsWith(base)) return r.continue();
    if (u.includes('raids.json')) return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(RAIDS) });
    if (u.includes('/sprites/')) return r.fulfill({ status: 200, contentType: 'image/gif', body: GIF });
    return r.abort();
  });
  await page.goto(base + '/pokedex'); await page.waitForSelector('[data-dexview="collection"]');
  await page.click('[data-dexview="collection"]');
  if (namesOk) await page.waitForFunction(() => document.querySelectorAll('#col-grid .col-tile').length > 1000, null, { timeout: 15000 });
  else await page.waitForTimeout(1500);
  return page;
}
const tile = (page, id) => page.$eval(`#col-grid .col-tile[data-id="${id}"]`, e => ({ on: e.classList.contains('on'), marks: e.querySelector('.marks').textContent }));
const total = page => page.textContent('#col-total');

(async () => {
  const { base, close } = await serve();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 375, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('td-cookie-consent', 'denied'); } catch (e) {} });
  let page = await open(ctx, base);
  check('all Pokémon listed, POKÉDEX browse view hidden', (await page.$$eval('#col-grid .col-tile', t => t.length)) === names.length && await page.$eval('#dex-browse', e => e.hidden));
  check('starts at 0 caught', new RegExp(`0 / ${names.length.toLocaleString()} caught`).test(await total(page)), await total(page));
  await page.click('#col-grid .col-tile[data-id="1"]'); await page.click('#col-grid .col-tile[data-id="4"]');
  check('tapping marks caught (tile lit, ✓ badge), count goes up, tab badge shows it', (await tile(page, 1)).on && (await tile(page, 1)).marks === '✓' && /^✓ 2 \//.test(await total(page)) && (await page.textContent('#col-count')) === ' (2)');
  await page.click('#col-grid .col-tile[data-id="4"]');
  check('tapping again unmarks', !(await tile(page, 4)).on && /^✓ 1 \//.test(await total(page)));
  await page.click('[data-colmode="s"]'); await page.click('#col-grid .col-tile[data-id="25"]');
  check('shiny mode: marking shiny also marks caught', (await tile(page, 25)).on && (await tile(page, 25)).marks === '✓✨' && /Caught 2 · ✨ Shiny 1/.test(await total(page)), await tile(page, 25));
  await page.click('[data-colmode="c"]'); await page.click('#col-grid .col-tile[data-id="25"]');
  check('unmarking caught also clears shiny', (await tile(page, 25)).marks === '' && /Caught 1 · ✨ Shiny 0/.test(await total(page)));
  const g1 = await page.textContent('#col-gens .col-gen');
  check('per-generation progress', /Gen 1\s*1\/151/.test(g1), g1);
  await page.fill('#col-search', 'pika'); await page.waitForTimeout(300);
  check('search filters by name', (await page.$$eval('#col-grid .col-tile', t => t.map(x => x.dataset.id))).includes('25') && (await page.$$eval('#col-grid .col-tile', t => t.length)) < 10);
  await page.fill('#col-search', '#150'); await page.waitForTimeout(300);
  check('search by #number', JSON.stringify(await page.$$eval('#col-grid .col-tile', t => t.map(x => x.dataset.id))) === '["150"]');
  await page.fill('#col-search', ''); await page.selectOption('#col-gen', '1'); await page.selectOption('#col-type', 'dragon'); await page.waitForTimeout(200);
  check('gen + type filters (Gen 1 Dragon = Dratini line)', JSON.stringify(await page.$$eval('#col-grid .col-tile', t => t.map(x => x.dataset.id))) === '["147","148","149"]');
  await page.click('#col-markall');
  check('bulk mark needs a second tap', /TAP AGAIN: MARK 3/.test(await page.textContent('#col-markall')) && !(await tile(page, 147)).on);
  await page.click('#col-markall');
  check('second tap marks all shown', (await tile(page, 147)).on && (await tile(page, 149)).on && /^✓ 4 \//.test(await total(page)));
  await page.selectOption('#col-type', ''); await page.selectOption('#col-show', 'missing'); await page.waitForTimeout(200);
  check('show missing hides marked ones', (await page.$$eval('#col-grid .col-tile', t => t.length)) === 151 - 4);
  await page.selectOption('#col-gen', '0'); await page.selectOption('#col-show', 'raids'); await page.waitForTimeout(200);
  const raidIds = await page.$$eval('#col-grid .col-tile', t => t.map(x => x.dataset.id).sort());
  check('show raid bosses now (Mega/forms map to base; regional forms skipped)', JSON.stringify(raidIds) === '["483","6"]', raidIds);
  await page.selectOption('#col-show', 'all');
  const lay = await page.evaluate(() => { const small = [...document.querySelectorAll('#dex-collection button, #dex-collection select, #dex-collection input:not([type=file]), #dex-collection label.arena-btn')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.height < 44 || r.width < 44); }).length; return { small, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, font: getComputedStyle(document.getElementById('col-search')).fontSize }; });
  check('375px: tap targets >= 44px, 16px search, no sideways scroll', !lay.small && lay.overflow <= 0 && lay.font === '16px', lay);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#col-export')]);
  const file = path.join(path.dirname(await dl.path()), 'col.json'); await dl.saveAs(file);
  const exp = JSON.parse(fs.readFileSync(file, 'utf8'));
  check('export file has the marks', exp.type === 'collection' && JSON.stringify(exp.c) === '[1,147,148,149]', exp);
  const errs = page.errors; await page.close();

  page = await open(ctx, base);
  check('marks survive a reload', (await tile(page, 1)).on && /^✓ 4 \//.test(await total(page)));
  await page.evaluate(() => localStorage.removeItem('td-collection-v1')); await page.close();
  page = await open(ctx, base);
  check('cleared storage starts empty', /^✓ 0 \//.test(await total(page)));
  fs.writeFileSync(file, JSON.stringify({ app: 'trainer-desk', type: 'collection', v: 1, c: [7, 8], s: [7], l: [], h: [] }));
  await page.setInputFiles('#col-import', file); await page.waitForTimeout(300);
  check('import merges marks in', (await tile(page, 7)).marks === '✓✨' && /Caught 2 · ✨ Shiny 1/.test(await total(page)));
  const errs2 = page.errors; await page.close();

  page = await open(ctx, base, { namesOk: false });
  check('offline: friendly message, marks kept safe', /couldn't load/.test(await page.textContent('#col-grid')));
  check('no uncaught JS errors', !errs.length && !errs2.length && !page.errors.length, errs.concat(errs2, page.errors));
  await b.close(); close();
  console.log(failures ? `\n${failures} COLLECTION CHECK(S) FAILED` : '\nALL COLLECTION CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})();
