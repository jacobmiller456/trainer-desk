// GO type checker (GO tab): GO multipliers, Pokémon name lookup, manual types, offline fallback, phone layout.
// Usage: node tests/types.test.js
const { chromium } = require('playwright');
const { serve } = require('./serve');
let failures = 0;
const check = (l, ok, x) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + l + (ok || x === undefined ? '' : '  ' + JSON.stringify(x))); if (!ok) failures++; };

async function open(b, base, { names = true } = {}) {
  const ctx = await b.newContext({ viewport: { width: 375, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('td-cookie-consent', 'denied'); } catch (e) {} });
  const page = await ctx.newPage(); page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
  await page.route('**/*', r => { const u = r.request().url(); if (!names && u.includes('pokedex-names.json')) return r.abort(); return u.startsWith(base) ? r.continue() : r.abort(); });
  await page.goto(base + '/go'); await page.waitForSelector('#tc-t1');
  return { ctx, page };
}
const rows = page => page.$$eval('#tc-out .tc-row', rs => Object.fromEntries(rs.map(r => [r.dataset.mult, [...r.querySelectorAll('.tc-chip')].map(c => c.textContent).sort().join(',')])));

(async () => {
  const { base, close } = await serve();
  const b = await chromium.launch();
  let { ctx, page } = await open(b, base);
  const m = (a, d) => page.evaluate(([a, d]) => window.__types.mult(a, d), [a, d]);
  check('GO multipliers: 1.6 / 0.625 / 0.39 / 2.56', (await m('water', ['fire'])) === 1.6 && (await m('fire', ['water'])) === 0.625 && (await m('ground', ['flying'])) === 0.3906 && (await m('rock', ['fire', 'flying'])) === 2.56);
  check('every type has a full row in the chart', await page.evaluate(() => TYPE_LIST.every(t => TYPE_CHART[t] && TYPE_CHART[t].length === 3)));
  await page.waitForFunction(() => document.querySelectorAll('#tc-names option').length > 1000, null, { timeout: 8000 });
  await page.fill('#tc-name', 'charizard');
  const r = await rows(page);
  check('name lookup fills types (Charizard = Fire/Flying)', (await page.inputValue('#tc-t1')) === 'fire' && (await page.inputValue('#tc-t2')) === 'flying');
  check('Charizard: rock ×2.56, water/electric ×1.6', r['2.56'] === 'rock' && r['1.6'] === 'electric,water', r);
  check('Charizard resists: grass/bug ×0.39, fire/fighting/fairy/steel/ground ×0.625', r['0.3906'] === 'bug,grass' && r['0.625'] === 'fairy,fighting,fire,ground,steel', r);
  const out = await page.textContent('#tc-out');
  check('summary names the best attack type and links the Pokédex page', /weakest to Rock/.test(out) && (await page.getAttribute('.tc-link', 'href')) === '/pokedex/charizard', out);
  await page.selectOption('#tc-t1', 'ghost'); await page.selectOption('#tc-t2', '');
  const g = await rows(page);
  check('manual types: Ghost weak to ghost/dark, double-resists normal/fighting', g['1.6'] === 'dark,ghost' && g['0.3906'] === 'fighting,normal' && (await page.inputValue('#tc-name')) === '', g);
  const lay = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const small = [...document.querySelectorAll('#type-checker input, #type-checker select, #type-checker a')].filter(e => { const r = e.getBoundingClientRect(); return r.height < 44; }).map(e => e.id || e.className);
    return { overflow: document.documentElement.scrollWidth - vw, small, font: getComputedStyle(document.getElementById('tc-name')).fontSize };
  });
  check('375px: no sideways scroll, controls >= 44px, 16px input', lay.overflow <= 0 && !lay.small.length && lay.font === '16px', lay);
  const errs = page.errors; await ctx.close();

  ({ ctx, page } = await open(b, base, { names: false }));
  await page.waitForFunction(() => /offline/.test(document.getElementById('tc-name').placeholder), null, { timeout: 8000 });
  await page.selectOption('#tc-t1', 'dragon');
  check('names offline: types still work', (await rows(page))['1.6'] === 'dragon,fairy,ice');
  check('no uncaught JS errors', !errs.length && !page.errors.length, errs.concat(page.errors));
  await b.close(); close();
  console.log(failures ? `\n${failures} TYPE CHECKER CHECK(S) FAILED` : '\nALL TYPE CHECKER CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})();
