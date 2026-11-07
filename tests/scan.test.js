// Scan / find a card (TCG tab): reading name + number from OCR text, typed search, photo scan (OCR faked: the real reader
// downloads from jsDelivr), pokemontcg.io query, TCGdex fallback, saved prices in results, opening a result, phone layout.
// Usage: node tests/scan.test.js
const { chromium } = require('playwright');
const { serve } = require('./serve');
let failures = 0;
const check = (l, ok, x) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + l + (ok || x === undefined ? '' : '  ' + JSON.stringify(x))); if (!ok) failures++; };
const cors = { 'access-control-allow-origin': '*' };
const GIF = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAEklEQVR42mP8z8Dwn4GBgYEBAA0bAf+5m9ZsAAAAAElFTkSuQmCC', 'base64');
const json = (r, body) => r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
const NAMES = [[6, 'Charizard', ['fire'], 1, 'charizard'], [5, 'Charmeleon', ['fire'], 1, 'charmeleon'], [122, 'Mr. Mime', ['psychic'], 1, 'mr-mime'], [25, 'Pikachu', ['electric'], 1, 'pikachu'], [26, 'Raichu', ['electric'], 1, 'raichu']];
const HITS = [
  { id: 'sv3pt5-199', name: 'Charizard ex', number: '199', images: { small: 'https://img.test/199.png' }, set: { id: 'sv3pt5', name: '151', printedTotal: 165 }, tcgplayer: { updatedAt: '2026/10/16', prices: { holofoil: { market: 323.37 } } } },
];

async function open(b, base, { ptcgDown = false, ocrText = null } = {}) {
  const ctx = await b.newContext({ viewport: { width: 375, height: 900 } });
  await ctx.addInitScript(t => { try { localStorage.setItem('td-cookie-consent', 'denied'); } catch (e) {} if (t !== null) { window.__ocrCalls = 0; window.__scanOCR = async () => { window.__ocrCalls++; return Array.isArray(t) ? t[Math.min(window.__ocrCalls - 1, t.length - 1)] : t; }; } }, ocrText);
  const page = await ctx.newPage(); page.errors = []; page.queries = []; page.on('pageerror', e => page.errors.push(e.message));
  await page.route('**/*', r => {
    const u = r.request().url(), p = new URL(u).pathname;
    if (u.startsWith(base) && p === '/assets/pokedex-names.json') return json(r, NAMES.concat(Array.from({ length: 120 }, (_, i) => [2000 + i, 'Zzfake' + i, ['normal'], 9, 'zzfake' + i]))); // the site wants a full-size list
    if (u.startsWith(base) && p === '/prices/latest.json') return json(r, { updated: '2026-11-07T08:00:00Z', source: 'tcgdex', sourceSince: '2026-11-05', months: { '2026-11': ['sv3pt5'] } });
    if (u.startsWith(base) && p === '/prices/2026-11/sv3pt5.json') return json(r, { days: ['2026-11-05', '2026-11-07'], cards: { 'sv3pt5-199': [298.38, 301.5] } });
    if (u.startsWith(base) && p.startsWith('/prices/')) return r.abort();
    if (u.startsWith(base)) return r.continue();
    if (u.startsWith('https://api.pokemontcg.io/v2/sets')) return ptcgDown ? r.fulfill({ status: 500 }) : json(r, { data: [{ id: 'sv3pt5', name: '151', releaseDate: '2023/09/22' }, { id: 'zz1', name: 'Other', releaseDate: '2026/01/01' }] });
    if (u.startsWith('https://api.pokemontcg.io/v2/cards?q=') && /pageSize=12/.test(u)) { page.queries.push(decodeURIComponent(new URL(u).searchParams.get('q'))); return ptcgDown ? r.fulfill({ status: 500 }) : json(r, { data: /charizard/i.test(u) ? HITS : [] }); }
    if (u.startsWith('https://api.pokemontcg.io/v2/cards')) return ptcgDown ? r.fulfill({ status: 500 }) : json(r, { data: /sv3pt5/.test(u) ? [{ id: 'sv3pt5-199', name: 'Charizard ex', number: '199', rarity: 'Special Illustration Rare', images: { small: 'https://img.test/199.png' }, tcgplayer: { prices: { holofoil: { market: 323.37 } } } }] : [{ id: 'zz1-1', name: 'Other Card', number: '1', images: { small: 'https://img.test/1.png' } }] });
    if (u.startsWith('https://api.tcgdex.net/v2/en/cards?name=')) return json(r, [{ id: 'sv03.5-006', localId: '006', name: 'Charizard ex' }, { id: 'sv03.5-199', localId: '199', name: 'Charizard ex', image: 'https://assets.tcgdex.net/en/sv/sv03.5/199' }]);
    if (u.startsWith('https://api.tcgdex.net/v2/en/sets')) return json(r, [{ id: 'sv03.5', name: '151' }]);
    if (u.startsWith('https://img.test/') || u.startsWith('https://assets.tcgdex.net/')) return r.fulfill({ status: 200, contentType: 'image/gif', body: GIF });
    return r.abort();
  });
  await page.goto(base + '/tcg'); await page.waitForSelector('#scan-box');
  return { ctx, page };
}

(async () => {
  const { base, close } = await serve();
  const b = await chromium.launch();
  let { ctx, page } = await open(b, base);
  // parsing
  const P = (t, typed) => page.evaluate(([t, typed, n]) => window.__scan.parse(t, n, typed), [t, typed, NAMES]);
  let r = await P('Charizard ex  HP330\nStage 2 Evolves from Charmeleon\nBurning Darkness 180\n199/165 ★ SV', false);
  check('OCR text: name (earliest Pokémon, with the ex suffix) and number/set size', r.name === 'Charizard ex' && r.number === '199' && r.total === '165', r);
  r = await P('BASIC Pikachu HP 60\n... Raichu ...\n025 | 198', false);
  check('OCR quirks: "|" for "/", leading zeros dropped', r.name === 'Pikachu' && r.number === '25' && r.total === '198', r);
  r = await P('Mr. Mime\nTG05/TG30', false);
  check('names with punctuation; trainer-gallery numbers kept as TG05', r.name === 'Mr. Mime' && r.number === 'TG05' && r.total === '', r);
  r = await P("Professor's Research\nSupporter\n189/198", false);
  check('trainer cards: no Pokémon name, number still read', r.name === '' && r.number === '189' && r.total === '198', r);
  r = await page.evaluate(([n]) => window.__scan.parse('Pokémon ex rule 6 MEW is Knocked Out', n, false, new Map([['MEW', 'sv3pt5']])), [NAMES]);
  check('number unreadable: the printed set code is picked up instead', r.code === 'MEW' && r.number === '', r);
  r = await P('charizard 199/165', true);
  check('typed query: name = the words, number split off', r.name === 'charizard' && r.number === '199' && r.total === '165', r);

  // typed search
  await page.fill('#scan-q', 'Charizard 199/165'); await page.click('#scan-form button');
  await page.waitForSelector('#scan-results .sc-row', { timeout: 8000 });
  check('search query: name prefix + number + printed set size', page.queries[0] === 'name:Charizard* number:199 set.printedTotal:165', page.queries);
  let row = (await page.textContent('#scan-results .sc-row')).replace(/\s+/g, ' ');
  check('result: name, set, number, latest saved price (not the frozen source price)', /Charizard ex/.test(row) && /151 · #199\/165/.test(row) && /\$301\.50/.test(row) && !/323/.test(row), row);
  check('status says how many matches', /1 match/.test(await page.textContent('#scan-status')));
  const lay = await page.evaluate(() => { const small = [...document.querySelectorAll('#scan-box a, #scan-box button, #scan-box label, #scan-box input[type=search]')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.height < 44 || r.width < 44); }).map(e => e.id || e.className); return { small, font: getComputedStyle(document.getElementById('scan-q')).fontSize, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
  check('375px: tap targets 44px+, 16px search field, no sideways scroll', !lay.small.length && lay.font === '16px' && lay.overflow <= 0, lay);
  await page.click('#scan-results .sc-row');
  await page.waitForFunction(() => document.getElementById('card-detail').open, null, { timeout: 10000 });
  check('tapping a result opens that set and the card detail', (await page.inputValue('#set-select')) === 'sv3pt5' && /Charizard ex/.test(await page.textContent('#cdd-name')));
  await page.keyboard.press('Escape');
  await page.fill('#scan-q', 'Nothingmon'); await page.click('#scan-form button');
  await page.waitForFunction(() => /No cards found/.test(document.getElementById('scan-status').textContent), null, { timeout: 8000 });
  check('no match: says so', true);
  let errs = page.errors; await ctx.close();

  // photo scan with a faked reader: first pass misses the number, the bottom-strip pass finds it
  ({ ctx, page } = await open(b, base, { ocrText: ['CHARIZARD ex HP330 Burning Darkness', 'Illus. 199/165'] }));
  await page.setInputFiles('#scan-file', { name: 'card.png', mimeType: 'image/png', buffer: PNG });
  await page.waitForSelector('#scan-results .sc-row', { timeout: 10000 }).catch(() => {});
  const st = await page.textContent('#scan-status');
  check('scan: reads the photo (2nd pass on the number strip), fills the box, shows results', (await page.evaluate(() => window.__ocrCalls)) === 2 && (await page.inputValue('#scan-q')) === 'Charizard ex 199/165' && /Read “Charizard ex 199\/165”/.test(st) && /Edit below/.test(st), st);
  errs = errs.concat(page.errors); await ctx.close();
  ({ ctx, page } = await open(b, base, { ocrText: 'blurry nothing here' }));
  await page.setInputFiles('#scan-file', { name: 'card.png', mimeType: 'image/png', buffer: PNG });
  await page.waitForFunction(() => /Couldn't read a card name or number/.test(document.getElementById('scan-status').textContent), null, { timeout: 8000 });
  check('unreadable photo: helpful message, no search', true);
  errs = errs.concat(page.errors); await ctx.close();

  // pokemontcg.io down: TCGdex search by name, filtered by number
  ({ ctx, page } = await open(b, base, { ptcgDown: true }));
  await page.fill('#scan-q', 'Charizard 199/165'); await page.click('#scan-form button');
  await page.waitForSelector('#scan-results .sc-row', { timeout: 10000 });
  const rows = await page.$$eval('#scan-results .sc-row', a => a.map(x => x.dataset.card));
  check('main source down: TCGdex search, only the matching number', JSON.stringify(rows) === '["sv03.5-199"]', rows);
  errs = errs.concat(page.errors); await ctx.close();

  check('no uncaught JS errors', !errs.length, errs);
  await b.close(); close();
  console.log(failures ? `\n${failures} SCAN CHECK(S) FAILED` : '\nALL SCAN CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})();
