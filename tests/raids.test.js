// Raid bosses (GO tab): ScrapedDuck raids feed -> tiered boss cards, best attack types, COUNTERS fills the type checker,
// mirror fallback, offline note, phone layout. Usage: node tests/raids.test.js
const { chromium } = require('playwright');
const { serve } = require('./serve');
let failures = 0;
const check = (l, ok, x) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + l + (ok || x === undefined ? '' : '  ' + JSON.stringify(x))); if (!ok) failures++; };
const GIF = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
const t = n => ({ name: n, image: 'https://leekduck.com/x.png' });
const RAIDS = [
  { name: 'Pikachu', tier: '1-Star Raids', canBeShiny: true, types: [t('electric')], combatPower: { normal: { min: 500, max: 540 }, boosted: { min: 625, max: 675 } }, boostedWeather: [t('rainy')] },
  { name: 'Mega Charizard Y', tier: 'Mega Raids', canBeShiny: false, types: [t('fire'), t('flying')], combatPower: { normal: { min: 1800, max: 1900 } }, boostedWeather: [t('sunny'), t('windy')] },
  { name: 'Galarian Slowpoke', tier: '1-Star Raids', canBeShiny: true, types: [t('psychic')], combatPower: { normal: { min: 650, max: 700 } }, boostedWeather: [] },
  { name: 'Shadow Mewtwo (Armored)', tier: '5-Star Raids', types: [t('psychic')], combatPower: { normal: { min: 2300, max: 2387 } } },
  { name: '<b>bad</b>', tier: '1-Star Raids', types: [t('notatype')] },
];

async function open(b, base, mode) {
  const ctx = await b.newContext({ viewport: { width: 375, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('td-cookie-consent', 'denied'); } catch (e) {} });
  const page = await ctx.newPage(); page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
  await page.route('**/*', r => {
    const u = r.request().url();
    if (u.startsWith(base)) return r.continue();
    if (u.includes('raids.json')) {
      if (mode === 'offline' || (mode === 'mirror' && u.includes('raw.githubusercontent'))) return r.abort();
      return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(RAIDS) });
    }
    if (u.includes('/sprites/pokemon/')) return r.fulfill({ status: 200, contentType: 'image/gif', body: GIF });
    return r.abort();
  });
  await page.goto(base + '/go');
  await page.waitForFunction(() => !/Loading raid/.test(document.getElementById('raid-box').textContent), null, { timeout: 15000 });
  return { ctx, page };
}

(async () => {
  const { base, close } = await serve();
  const b = await chromium.launch();
  let { ctx, page } = await open(b, base);
  await page.waitForFunction(() => document.querySelectorAll('#raid-box .raid-art img').length >= 2, null, { timeout: 8000 });
  const tiers = await page.$$eval('#raid-box .raid-tier', d => d.map(x => x.querySelector('summary').textContent.trim() + (x.open ? ' open' : ' closed')));
  check('tiers in order, top tiers open, 1-star folded', JSON.stringify(tiers) === '["5-STAR (1) open","MEGA (1) open","1-STAR (2) closed"]', tiers);
  await page.click('#raid-box .raid-tier:nth-of-type(3) summary');
  check('tapping a folded tier opens it', await page.$eval('#raid-box .raid-tier:nth-of-type(3)', d => d.open));
  check('bad entries dropped, markup escaped', (await page.$$eval('#raid-box .raid', r => r.length)) === 4 && !(await page.$('#raid-box .raid-name b')));
  const zard = await page.textContent('#raid-box .raid[data-boss="Mega Charizard Y"]');
  check('boss card: types, CP, weather, best attack type', /fire/.test(zard) && /flying/.test(zard) && /CP 1800–1900/.test(zard) && /Boosted: Sunny, Windy/.test(zard) && /Use Rock attacks/.test(zard), zard.replace(/\s+/g, ' '));
  check('shiny marker only on shiny bosses', !!(await page.$('#raid-box .raid[data-boss="Pikachu"] .shiny')) && !(await page.$('#raid-box .raid[data-boss="Mega Charizard Y"] .shiny')));
  const arts = await page.$$eval('#raid-box .raid', r => Object.fromEntries(r.map(x => [x.dataset.boss, x.querySelector('img') ? x.querySelector('img').src.split('/').pop() : 'mono'])));
  check('sprites from PokéAPI for Pokédex names (Mega -> base form); regional forms get a letter tile', arts.Pikachu === '25.png' && arts['Mega Charizard Y'] === '6.png' && arts['Galarian Slowpoke'] === 'mono' && arts['Shadow Mewtwo (Armored)'] === '150.png', arts);
  await page.click('#raid-box [data-counters="Mega Charizard Y"]'); await page.waitForTimeout(600);
  const tc = await page.textContent('#tc-out');
  check('COUNTERS fills the type checker', (await page.inputValue('#tc-t1')) === 'fire' && (await page.inputValue('#tc-t2')) === 'flying' && /Mega Charizard Y/.test(tc) && (await page.getAttribute('.tc-link', 'href')) === '/pokedex/charizard', tc);
  check('type checker scrolled into view', await page.$eval('#type-checker', e => { const r = e.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }));
  await page.click('#raid-box [data-counters="Galarian Slowpoke"]'); await page.waitForTimeout(300);
  check('regional form uses its own types, no wrong Pokédex link', (await page.inputValue('#tc-t1')) === 'psychic' && !(await page.$('.tc-link')));
  const lay = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const small = [...document.querySelectorAll('#raid-box button, #raid-box summary')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height < 44; }).length;
    return { overflow: document.documentElement.scrollWidth - vw, small };
  });
  check('375px: no sideways scroll, buttons >= 44px', lay.overflow <= 0 && !lay.small, lay);
  const errs = page.errors; await ctx.close();

  ({ ctx, page } = await open(b, base, 'mirror'));
  check('main feed down: jsDelivr mirror used', (await page.$$eval('#raid-box .raid', r => r.length)) === 4);
  await ctx.close();
  ({ ctx, page } = await open(b, base, 'offline'));
  check('offline: note pointing to the type checker (never blank)', /couldn't load/.test(await page.textContent('#raid-box')) && !!(await page.$('#raid-box a[href="#type-checker"]')));
  check('no uncaught JS errors', !errs.length && !page.errors.length, errs.concat(page.errors));
  await b.close(); close();
  console.log(failures ? `\n${failures} RAID CHECK(S) FAILED` : '\nALL RAID CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})();
