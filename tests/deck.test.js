// Deck price calculator (TCG → DECK PRICE): parsing deck lists, matching on set code + number (gallery subsets share a
// code) or name, saved prices, totals, unmatched lines, remembered list, opening a card, phone layout. Real catalog
// (tcgdata/), mocked prices. Usage: node tests/deck.test.js
const { chromium } = require('playwright');
const { serve } = require('./serve');
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
let failures = 0;
const check = (l, ok, x) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + l + (ok || x === undefined ? '' : '  ' + JSON.stringify(x))); if (!ok) failures++; };
const GIF = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
const json = (r, body) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
const PRICES = { sv8: { 'sv8-57': 3.5 }, sv1: { 'sv1-196': 0.4, 'sv1-181': 0.25 }, sv2: { 'sv2-185': 1.1 }, sve: { 'sve-4': 0.05 } };

(async () => {
  const ix = JSON.parse(fs.readFileSync(path.join(root, 'tcgdata/search.json'), 'utf8'));
  const tg = ix.cards.find(c => c[0].startsWith('swsh9tg-')); // a Brilliant Stars Trainer Gallery card: code BRS like the main set
  const { base, close } = await serve();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 375, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('td-cookie-consent', 'denied'); } catch (e) {} });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', r => {
    const u = r.request().url(), q = new URL(u).pathname;
    if (u.startsWith(base) && q.startsWith('/tcgdata/')) return r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync(path.join(root, q)) });
    if (u.startsWith(base) && q === '/prices/latest.json') return json(r, { updated: '2026-11-13T08:00:00Z', source: 'tcgdex', sourceSince: '2026-11-05', months: { '2026-11': Object.keys(PRICES) } });
    const m = q.match(/^\/prices\/2026-11\/([a-z0-9]+)\.json$/);
    if (u.startsWith(base) && m && PRICES[m[1]]) return json(r, { days: ['2026-11-13'], cards: Object.fromEntries(Object.entries(PRICES[m[1]]).map(([k, v]) => [k, [v]])) });
    if (u.startsWith(base) && q.startsWith('/prices/')) return r.fulfill({ status: 404 });
    if (u.startsWith(base)) return r.continue();
    if (/^https:\/\/(images\.pokemontcg\.io|assets\.tcgdex\.net|images\.scrydex\.com)\//.test(u)) return r.fulfill({ status: 200, contentType: 'image/gif', body: GIF });
    return r.abort();
  });
  await page.goto(base + '/tcg?view=deck');
  await page.waitForFunction(() => !document.getElementById('tcg-deck').hidden, null, { timeout: 10000 });

  const P = t => page.evaluate(t => window.__deck.parse(t), t);
  let p = await P('Pokémon: 12\n4 Pikachu ex SSP 57\n\nTrainer - 36\n8 Basic {L} Energy SVE 004\n2 Rare Candy\n1 Iono PAL 185\nTotal Cards: 60\nhello world');
  check('parse: headers skipped; qty, name, set code, number; {L} = Lightning; leading zeros dropped; junk flagged',
    p.length === 5 && p[0].qty === 4 && p[0].name === 'Pikachu ex' && p[0].code === 'SSP' && p[0].num === '57' && p[1].name === 'Basic Lightning Energy' && p[1].num === '4' && p[2].name === 'Rare Candy' && !p[2].code && p[4].bad, p);

  await page.click('#deck-example');
  await page.waitForFunction(() => /Deck total/.test(document.getElementById('deck-total').textContent), null, { timeout: 15000 });
  const total = (await page.textContent('#deck-total')).replace(/\s+/g, ' ');
  // 4×3.50 + 4×0.40 + 4×0.25 + 4×1.10 + 8×0.05 = 14 + 1.6 + 1 + 4.4 + 0.4 = 21.40 ; Rare Candy (newest printing) unpriced here
  check('example deck: total from saved prices, card count, 60-card note', /Deck total: \$21\.40 · 26 cards \(2 without a price\) · standard decks have 60 cards/.test(total), total);
  const rows = await page.$$eval('#deck-list .deck-row a', a => a.map(x => x.dataset.card + '|' + x.textContent.replace(/\s+/g, ' ').trim()));
  check('rows: matched by set code + number', /^sv8-57\|4× ?Pikachu ex/.test(rows[0]) && /\$14\.00/.test(rows[0]) && /\$3\.50 each/.test(rows[0]) && rows.some(r => r.startsWith('sve-4|8×')), rows.slice(0, 2));
  check('line without set/number: newest printing by name, labelled', rows.some(r => /Rare Candy/.test(r) && /newest printing/.test(r)), rows);

  await page.fill('#deck-in', `1 ${tg[1]} BRS ${tg[2]}\n3 Notacard XYZ 999\n4 Pikachu ex SSP 57`);
  await page.click('#deck-go');
  await page.waitForFunction(() => /Deck total/.test(document.getElementById('deck-total').textContent), null, { timeout: 15000 });
  const r2 = await page.$$eval('#deck-list .deck-row a', a => a.map(x => x.dataset.card));
  check('a set code shared by a main set and its Trainer Gallery resolves by number', r2[0] === tg[0], { r2, tg });
  check('unmatched lines are listed', !(await page.$eval('#deck-miss', e => e.hidden)) && /Couldn't match 1 line/.test(await page.textContent('#deck-miss')) && /Notacard/.test(await page.textContent('#deck-miss')));
  await page.reload(); await page.waitForSelector('#deck-in');
  check('the last deck list is remembered on this device', /Notacard XYZ 999/.test(await page.inputValue('#deck-in')));
  await page.click('[data-tcgview="deck"]'); await page.click('#deck-go');
  await page.waitForSelector('#deck-list .deck-row a[data-card="sv8-57"]', { timeout: 15000 });
  const lay = await page.evaluate(() => { const small = [...document.querySelectorAll('#tcg-deck a, #tcg-deck button')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.height < 44 || r.width < 44); }).map(e => e.id || e.textContent.slice(0, 20)); return { small, font: getComputedStyle(document.getElementById('deck-in')).fontSize, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
  check('375px: tap targets 44px+, 16px text box, no sideways scroll', !lay.small.length && lay.font === '16px' && lay.overflow <= 0, lay);
  await page.click('#deck-list a[data-card="sv8-57"]');
  await page.waitForFunction(() => document.getElementById('card-detail').open, null, { timeout: 15000 });
  check('tapping a row opens that card (with its buy links)', /Pikachu ex/.test(await page.textContent('#cdd-name')) && !!(await page.$('#cdd-tcgp')));
  await page.keyboard.press('Escape');
  await page.click('[data-tcgview="deck"]'); await page.click('#deck-clear');
  check('CLEAR empties the list and forgets it', (await page.inputValue('#deck-in')) === '' && (await page.evaluate(() => localStorage.getItem('td-deck-v1'))) === null);

  check('no uncaught JS errors', !errors.length, errors);
  await b.close(); close();
  console.log(failures ? `\n${failures} DECK CHECK(S) FAILED` : '\nALL DECK CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})();
