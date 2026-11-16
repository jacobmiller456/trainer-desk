// Japanese cards: scripts/fetch-japan.mjs (TCGdex Japanese card lists + TCGCSV/TCGplayer names, IDs and prices; fake APIs,
// temp folders, no network) and the TCG tab's card-language switch (mocked catalog and prices).
// Usage: node tests/japan.test.js
const { chromium } = require('playwright');
const { serve } = require('./serve');
const fs = require('fs'), os = require('os'), path = require('path');
let failures = 0;
const check = (l, ok, x) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + l + (ok || x === undefined ? '' : '  ' + JSON.stringify(x))); if (!ok) failures++; };
const GIF = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
const json = (r, body) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

(async () => {
  const J = await import('../scripts/fetch-japan.mjs');
  // ---- pure helpers
  check('site IDs: jp- + TCGdex ID, lower case (SV-P → jp-sv-p)', J.siteId('SV2a') === 'jp-sv2a' && J.siteId('SV-P') === 'jp-sv-p');
  check('set name from TCGplayer: code prefix dropped, Pokémon spelled right', J.groupName({ name: 'SV2a: Pokemon Card 151' }) === 'Pokémon Card 151');
  const groups = [{ groupId: 1, abbreviation: 'SV2a', name: 'SV2a: Pokemon Card 151' }, { groupId: 2, abbreviation: 'SV-P', name: 'SV-P Promotional Cards' }, { groupId: 3, abbreviation: '', name: 'Gym Challenge' }];
  const m = J.matchGroups([{ id: 'SV2a' }, { id: 'SV-P' }, { id: 'PMCG1' }, { id: 'neo1' }], groups, { neo1: 3 });
  check('sets matched to TCGplayer groups by code; hand fixes; no code → unmatched', m.SV2a.groupId === 1 && m['SV-P'].groupId === 2 && m.neo1.groupId === 3 && !m.PMCG1, Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.groupId])));
  const prods = J.productsByNumber([
    { productId: 30, name: 'Bulbasaur - 001/165 (Master Ball Pattern)', extendedData: [{ name: 'Number', value: '001/165' }, { name: 'Rarity', value: 'Common' }, { name: 'HP', value: '70' }, { name: 'CardType', value: 'Grass' }] },
    { productId: 20, name: 'Bulbasaur - 001/165', extendedData: [{ name: 'Number', value: '001/165' }, { name: 'Rarity', value: 'Common' }, { name: 'HP', value: '70' }, { name: 'CardType', value: 'Grass' }, { name: 'Attack 1', value: 'SECRET ATTACK TEXT' }] },
    { productId: 40, name: 'Rare Candy - 152/165', extendedData: [{ name: 'Number', value: '152/165' }, { name: 'Rarity', value: 'Uncommon' }, { name: 'CardType', value: 'Trainer - Item' }, { name: 'Description', value: 'SECRET RULES TEXT' }] },
    { productId: 50, name: 'Pokemon Card 151 Booster Box', extendedData: [] },
  ]);
  const b = prods.get('1'), rc = prods.get('152');
  check('products: the plain version per number (not a pattern variant); boxes skipped', prods.size === 2 && b.pid === 20 && b.name === 'Bulbasaur' && b.hp === '70' && b.types === 'Grass' && b.supertype === 'Pokémon', b);
  check('trainers typed from CardType; card text never kept', rc.supertype === 'Trainer' && rc.types === '' && !JSON.stringify([...prods.values()]).includes('SECRET'), rc);
  check('price: Normal first, then Holofoil; market, else mid', J.productPrice([{ subTypeName: 'Holofoil', marketPrice: 9 }, { subTypeName: 'Normal', marketPrice: null, midPrice: 2.5 }]) === 2.5 && J.productPrice([{ subTypeName: 'Holofoil', marketPrice: 0 }]) === null);

  // ---- full run against fake TCGdex + TCGCSV
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'td-japan-')), dataDir = path.join(tmp, 'data'), pricesDir = path.join(tmp, 'prices');
  fs.mkdirSync(dataDir); fs.mkdirSync(pricesDir);
  fs.writeFileSync(path.join(pricesDir, 'latest.json'), JSON.stringify({ updated: 'x', source: 'tcgdex', sourceSince: '2026-11-05', months: {} }));
  const jaSets = [...Array.from({ length: 60 }, (_, i) => ({ id: 'old' + i, name: '古い' + i, cardCount: { total: 0 } })), { id: 'SV2a', name: 'ポケモンカード151', cardCount: { total: 3 } }, { id: 'neo1', name: '金、銀、新世界へ...', cardCount: { total: 1 } }];
  const tcgdexSet = id => id === 'SV2a' ? { id, name: 'ポケモンカード151', releaseDate: '2023-06-16', cardCount: { official: 165, total: 3 }, cards: [{ id: 'SV2a-001', localId: '001', name: 'フシギダネ', image: 'https://assets.tcgdex.net/ja/SV/SV2a/001' }, { id: 'SV2a-006', localId: '006', name: 'リザードンex', image: 'https://assets.tcgdex.net/ja/SV/SV2a/006' }, { id: 'SV2a-152', localId: '152', name: 'ふしぎなアメ' }] }
    : id === 'neo1' ? { id, name: '金、銀、新世界へ...', releaseDate: '1999-12-01', cardCount: { official: 1, total: 1 }, cards: [{ id: 'neo1-1', localId: '1', name: 'チコリータ', image: 'https://assets.tcgdex.net/ja/neo/neo1/1' }] } : { id, cards: [] };
  const products = [
    { productId: 20, name: 'Bulbasaur - 001/165', extendedData: [{ name: 'Number', value: '001/165' }, { name: 'Rarity', value: 'Common' }, { name: 'HP', value: '70' }, { name: 'CardType', value: 'Grass' }] },
    { productId: 21, name: 'Charizard ex - 006/165', extendedData: [{ name: 'Number', value: '006/165' }, { name: 'Rarity', value: 'Double Rare' }, { name: 'HP', value: '330' }, { name: 'CardType', value: 'Fire' }, { name: 'Attack 1', value: 'SECRET' }] },
    { productId: 40, name: 'Rare Candy - 152/165', extendedData: [{ name: 'Number', value: '152/165' }, { name: 'Rarity', value: 'Uncommon' }, { name: 'CardType', value: 'Trainer - Item' }] },
  ];
  let stamp = '2026-11-15T20:00:00+0000', csvDown = false, dexDown = false; const calls = [];
  const fake = async (url, opt = {}) => {
    calls.push(url);
    const u = new URL(url), ok = body => ({ ok: true, status: 200, json: async () => body, text: async () => body });
    if (u.host === 'api.tcgdex.net') { if (dexDown) throw new Error('ECONNREFUSED'); const p = u.pathname.replace('/v2/ja/', ''); return ok(p === 'sets' ? jaSets : tcgdexSet(decodeURIComponent(p.slice(5)))); }
    if (u.host === 'tcgcsv.com') {
      if (csvDown) throw new Error('ECONNREFUSED');
      if (!/^TrainerDesk\//.test((opt.headers || {})['User-Agent'] || '')) return { ok: false, status: 403 };
      if (u.pathname === '/last-updated.txt') return ok(stamp);
      if (u.pathname === '/tcgplayer/85/groups') return ok({ results: [...Array.from({ length: 60 }, (_, i) => ({ groupId: 100 + i, abbreviation: 'X' + i, name: 'X' + i })), { groupId: 7, abbreviation: 'SV2a', name: 'SV2a: Pokemon Card 151' }] });
      if (u.pathname === '/tcgplayer/85/7/products') return ok({ results: products });
      if (u.pathname === '/tcgplayer/85/7/prices') return ok({ results: [{ productId: 20, subTypeName: 'Normal', marketPrice: 0.12 }, { productId: 21, subTypeName: 'Holofoil', marketPrice: 2.31 }, { productId: 40, subTypeName: 'Normal', marketPrice: null, midPrice: 0.2 }] });
    }
    return { ok: false, status: 404 };
  };
  const logs = [], opts = { dataDir, pricesDir, fetchImpl: fake, log: l => logs.push(l), now: new Date('2026-11-17T08:00:00Z'), pauseMs: 0, retryMs: 0 };
  const r = await J.run(opts);
  const data = JSON.parse(fs.readFileSync(path.join(dataDir, 'tcg-ja.json'), 'utf8'));
  const sv = data.sets.find(s => s.id === 'jp-sv2a'), neo = data.sets.find(s => s.id === 'jp-neo1');
  check('sets with cards kept, empty TCGdex sets skipped, newest first', data.sets.length === 2 && data.sets[0].id === 'jp-sv2a', data.sets.map(s => s.id));
  check('cards: English name, rarity, type, HP, Japanese name and TCGplayer ID', JSON.stringify(sv.cards[1]) === '["006","Charizard ex","Double Rare","Pokémon","Fire","330","リザードンex",21]' && sv.name === 'Pokémon Card 151' && sv.nameJa === 'ポケモンカード151', sv.cards[1]);
  check('picture folder from TCGdex; cards without a picture listed', sv.img === 'https://assets.tcgdex.net/ja/SV/SV2a/' && JSON.stringify(sv.nopic) === '["152"]', { img: sv.img, nopic: sv.nopic });
  check('set TCGplayer doesn\'t list: Japanese names, no prices', neo.group === 0 && neo.name === '金、銀、新世界へ...' && neo.cards[0][1] === 'チコリータ' && !neo.cards[0][7]);
  check('no card text stored', !fs.readFileSync(path.join(dataDir, 'tcg-ja.json'), 'utf8').includes('SECRET'));
  const pf = JSON.parse(fs.readFileSync(path.join(pricesDir, '2026-11', 'jp-sv2a.json'), 'utf8'));
  check('prices saved like the English ones (jp- card IDs, one column per day)', JSON.stringify(pf) === '{"days":["2026-11-17"],"cards":{"jp-sv2a-001":[0.12],"jp-sv2a-006":[2.31],"jp-sv2a-152":[0.2]}}', pf);
  const ids = JSON.parse(fs.readFileSync(path.join(pricesDir, 'ids', 'jp-sv2a.json'), 'utf8'));
  const idx = JSON.parse(fs.readFileSync(path.join(pricesDir, 'latest.json'), 'utf8'));
  check('TCGplayer product IDs for the buy links; latest.json lists the file and keeps the English fields', ids['jp-sv2a-006'] === 21 && JSON.stringify(idx.months['2026-11']) === '["jp-sv2a"]' && idx.sourceSince === '2026-11-05' && idx.source === 'tcgdex' && idx.updated !== 'x', { ids, idx });
  check('summary logged', r && r.priced === 3 && logs.some(l => /Japanese cards: 2 sets, 4 cards \(3 matched to TCGplayer in 1 sets\); prices 2026-11-17: 3 cards in 1 sets/.test(l)), logs);
  // same day, TCGCSV not rebuilt yet: no TCGCSV requests beyond the timestamp, and no TCGdex set re-reads
  calls.length = 0; await J.run(opts);
  check('re-run before TCGCSV\'s next build: only the timestamp and the set list are read', calls.length === 2 && calls.some(u => u.endsWith('/last-updated.txt')), calls);
  // next day: new build, products not re-read when TCGplayer lists the same products
  stamp = '2026-11-17T20:00:00+0000'; calls.length = 0; await J.run({ ...opts, now: new Date('2026-11-18T08:00:00Z') });
  check('next day: prices re-read, product list not (nothing new)', calls.some(u => u.endsWith('/85/7/prices')) && !calls.some(u => u.endsWith('/products')), calls);
  check('second day appended', JSON.parse(fs.readFileSync(path.join(pricesDir, '2026-11', 'jp-sv2a.json'), 'utf8')).days.join() === '2026-11-17,2026-11-18');
  calls.length = 0; await J.run({ ...opts, now: new Date('2026-11-23T08:00:00Z') }); // a Monday
  check('Mondays: sets TCGdex lists without cards are looked at again', calls.filter(u => /\/sets\/old\d+$/.test(u)).length === 60, calls.length);
  stamp = 'new'; csvDown = true; logs.length = 0; await J.run(opts);
  check('TCGCSV down: card lists kept, prices untouched, warning logged', JSON.parse(fs.readFileSync(path.join(dataDir, 'tcg-ja.json'), 'utf8')).sets.find(s => s.id === 'jp-sv2a').cards[1][1] === 'Charizard ex' && logs.some(l => /::warning::TCGCSV unavailable/.test(l)));
  csvDown = false; dexDown = true; const before = fs.readFileSync(path.join(dataDir, 'tcg-ja.json'), 'utf8'); logs.length = 0;
  check('TCGdex down: nothing rewritten, warning logged', (await J.run(opts)) === null && fs.readFileSync(path.join(dataDir, 'tcg-ja.json'), 'utf8') === before && logs.some(l => /::warning::TCGdex unavailable/.test(l)));
  fs.rmSync(tmp, { recursive: true });

  // ---- the TCG tab
  const JP_SETS = [{ id: 'jp-sv2a', name: 'Pokémon Card 151', nameJa: 'ポケモンカード151', releaseDate: '2023/06/16', printedTotal: 165, code: '' }, { id: 'jp-neo1', name: '金、銀、新世界へ...', nameJa: '金、銀、新世界へ...', releaseDate: '1999/12/01', printedTotal: 1, code: '' }];
  const JP_151 = { id: 'jp-sv2a', name: 'Pokémon Card 151', printedTotal: 165, img: '', cards: [['001', 'Bulbasaur', 'Common', 'Pokémon', 'Grass', '70', '', 'https://assets.tcgdex.net/ja/SV/SV2a/001/low.webp', '', 'フシギダネ'], ['006', 'Charizard ex', 'Double Rare', 'Pokémon', 'Fire', '330', '', 'https://assets.tcgdex.net/ja/SV/SV2a/006/low.webp', '', 'リザードンex'], ['152', 'Rare Candy', 'Uncommon', 'Trainer', '', '', '', '', '', 'ふしぎなアメ']] };
  const EN_SETS = [{ id: 'sv3pt5', name: '151', series: 'Scarlet & Violet', releaseDate: '2023/09/22', printedTotal: 165, code: 'MEW' }];
  const EN_151 = { id: 'sv3pt5', name: '151', printedTotal: 165, img: '', cards: [['1', 'Bulbasaur', 'Common', 'Pokémon', 'Grass', '70', 'A', '', '']] };
  const { base, close } = await serve();
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 375, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('td-cookie-consent', 'denied'); } catch (e) {} });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', r => {
    const u = r.request().url(), q = new URL(u).pathname;
    if (u.startsWith(base)) {
      const files = { '/tcgdata/sets.json': EN_SETS, '/tcgdata/sv3pt5.json': EN_151, '/tcgdata/jp-sets.json': JP_SETS, '/tcgdata/jp-sv2a.json': JP_151, '/tcgdata/jp-neo1.json': { id: 'jp-neo1', name: 'x', cards: [['1', 'チコリータ', '', '', '', '', '', '', '', '']] },
        '/prices/latest.json': { updated: '2026-11-16T08:00:00Z', source: 'tcgdex', sourceSince: '2026-11-05', months: { '2026-11': ['jp-sv2a', 'sv3pt5'] } },
        '/prices/2026-11/jp-sv2a.json': { days: ['2026-11-15', '2026-11-16'], cards: { 'jp-sv2a-001': [0.1, 0.12], 'jp-sv2a-006': [2.2, 2.31] } },
        '/prices/ids/jp-sv2a.json': { 'jp-sv2a-006': 566351 } };
      if (files[q]) return json(r, files[q]);
      if (q.startsWith('/tcgdata/') || q.startsWith('/prices/')) return r.fulfill({ status: 404 });
      return r.continue();
    }
    if (u.startsWith('https://assets.tcgdex.net/')) return r.fulfill({ status: 200, contentType: 'image/gif', body: GIF });
    return r.abort();
  });
  const cards = n => page.waitForFunction(n => document.querySelectorAll('#card-grid .tcard').length === n, n, { timeout: 15000 });
  await page.goto(base + '/tcg'); await cards(1);
  check('English cards by default', (await page.inputValue('#tcg-lang')) === 'en' && (await page.inputValue('#set-select')) === 'sv3pt5');
  await page.selectOption('#tcg-lang', 'ja'); await cards(3);
  const opts2 = await page.$$eval('#set-select option', o => o.map(x => x.value + '|' + x.textContent));
  check('Japanese cards: Japanese set list (English names where TCGplayer has them)', opts2.join() === 'jp-sv2a|Pokémon Card 151 (2023),jp-neo1|金、銀、新世界へ... (1999)', opts2);
  await page.waitForFunction(() => /\$2\.43/.test(document.getElementById('set-value').textContent), null, { timeout: 8000 }).catch(() => {});
  check('status says Japanese, prices in US$; set value from the saved prices', /Japanese, prices in US\$ from TCGplayer/.test(await page.textContent('#tcg-status')) && /\$2\.43 · 2 of 3 cards priced/.test(await page.textContent('#set-value')), [await page.textContent('#tcg-status'), await page.textContent('#set-value')]);
  check('TCGdex pictures (hotlinked)', (await page.$eval('#card-grid .tcard[data-id="jp-sv2a-006"] img', i => i.src)) === 'https://assets.tcgdex.net/ja/SV/SV2a/006/low.webp');
  await page.click('#card-grid .tcard[data-id="jp-sv2a-006"] .tc-zoom'); await page.waitForFunction(() => document.getElementById('card-detail').open);
  await page.waitForFunction(() => /\$2\.31/.test(document.getElementById('cdd-body').textContent), null, { timeout: 8000 }).catch(() => {});
  const det = (await page.textContent('#cdd-body')).replace(/\s+/g, ' ');
  const tcgp = await page.getAttribute('#cdd-tcgp', 'href').catch(() => ''), ebay = await page.getAttribute('#cdd-ebay', 'href').catch(() => '');
  check('card detail: English + Japanese name, price, exact TCGplayer product, eBay search says Japanese', /Charizard ex/.test(det) && /Japanese name ?リザードンex/.test(det) && /\$2\.31/.test(det) && /tcgplayer\.com\/product\/566351/.test(tcgp) && /Japanese/.test(decodeURIComponent(ebay)), { det: det.slice(0, 200), tcgp, ebay });
  await page.click('#cdd-own'); await page.keyboard.press('Escape');
  check('owned cards work with Japanese IDs', (await page.evaluate(() => JSON.parse(localStorage.getItem('td-owned-v1')))).hasOwnProperty('jp-sv2a'));
  const lay = await page.evaluate(() => { const r = document.getElementById('tcg-lang').getBoundingClientRect(); return { h: r.height, font: getComputedStyle(document.getElementById('tcg-lang')).fontSize, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
  check('375px: language picker 44px+, 16px, no sideways scroll', lay.h >= 44 && lay.font === '16px' && lay.overflow <= 0, lay);
  await page.reload(); await cards(3);
  check('the choice is remembered on this device', (await page.inputValue('#tcg-lang')) === 'ja' && (await page.inputValue('#set-select')) === 'jp-sv2a');
  await page.selectOption('#tcg-lang', 'en'); await cards(1);
  await page.click('#own-sets summary'); await page.click('#own-sets [data-set="jp-sv2a"]'); await cards(3);
  check('My set progress opens a Japanese set from the English list (switches language)', (await page.inputValue('#tcg-lang')) === 'ja' && (await page.inputValue('#set-select')) === 'jp-sv2a');
  await page.selectOption('#tcg-lang', 'en'); await cards(1);
  await page.goto(base + '/tcg?set=jp-sv2a&card=jp-sv2a-001'); await page.waitForFunction(() => document.getElementById('card-detail').open, null, { timeout: 15000 }).catch(() => {});
  check('a link to a Japanese card opens it (watchlist, shared links)', (await page.inputValue('#tcg-lang')) === 'ja' && /Bulbasaur/.test(await page.textContent('#cdd-name').catch(() => '')));
  check('no uncaught JS errors', !errors.length, errors);
  await br.close(); close();
  console.log(failures ? `\n${failures} JAPANESE CARD CHECK(S) FAILED` : '\nALL JAPANESE CARD CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})();
