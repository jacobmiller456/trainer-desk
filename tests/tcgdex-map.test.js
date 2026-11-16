// TCGdex migration groundwork (scripts/fetch-tcgdex.mjs): set/card ID matching, new sets added from TCGdex, outage
// handling. Fake TCGdex API, temp folder; no network. Usage: node tests/tcgdex-map.test.js
const fs = require('fs'), os = require('os'), path = require('path');
let failures = 0;
const check = (l, ok, x) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + l + (ok || x === undefined ? '' : '  ' + JSON.stringify(x))); if (!ok) failures++; };

(async () => {
  const T = await import('../scripts/fetch-tcgdex.mjs');
  check('card numbers: 001 = 1, SV001 = SV1, TG01 = tg1', T.normNum('001') === T.normNum('1') && T.normNum('SV001') === T.normNum('SV1') && T.normNum('TG01') === T.normNum('tg1') && T.normNum('10') !== T.normNum('1'));

  const ours = [
    { id: 'sv3pt5', name: '151', releaseDate: '2023-09-22', ptcgoCode: 'MEW', printedTotal: 165 },
    { id: 'swsh12pt5', name: 'Crown Zenith', releaseDate: '2023-01-20', ptcgoCode: 'CRZ', printedTotal: 159 },
    { id: 'swsh12pt5gg', name: 'Crown Zenith Galarian Gallery', releaseDate: '2023-01-20', ptcgoCode: 'CRZ', printedTotal: 70 },
    { id: 'base1', name: 'Base', releaseDate: '1999-01-09', ptcgoCode: 'BS', printedTotal: 102 },
    { id: 'base2', name: 'Jungle', releaseDate: '1999-06-16', ptcgoCode: 'JU', printedTotal: 64 },
    { id: 'odd1', name: 'Nowhere Set', releaseDate: '2010-01-01', ptcgoCode: '', printedTotal: 10 },
  ];
  const theirs = [
    { id: 'sv03.5', name: '151', releaseDate: '2023-09-22', abbreviation: { official: 'MEW' }, cardCount: { official: 165, total: 207 } },
    { id: 'swsh12.5', name: 'Crown Zenith', releaseDate: '2023-01-20', tcgOnline: 'CRZ', cardCount: { official: 159, total: 230 } },
    { id: 'base1', name: 'Base Set', releaseDate: '1999-01-09', cardCount: { official: 102, total: 102 } },
    { id: 'base2', name: 'Jungle', releaseDate: '1999-06-16', cardCount: { official: 64, total: 64 } },
    { id: 'sv01', name: '151', releaseDate: '2023-03-31', cardCount: { official: 198 } },  // same name, wrong date: must not match
  ];
  const m = T.matchSets(ours, theirs);
  check('sets matched by name + date + code', m.pairs.sv3pt5 === 'sv03.5' && m.pairs.base2 === 'base2' && m.pairs.swsh12pt5 === 'swsh12.5', m.pairs);
  check('close names match too ("Base" ~ "Base Set")', m.pairs.base1 === 'base1', m.pairs);
  check('gallery subset maps to the main TCGdex set', m.pairs.swsh12pt5gg === 'swsh12.5', m.pairs);
  check('no match → listed as unmatched', JSON.stringify(m.unmatched) === '["odd1"]', m.unmatched);
  check('hand fixes win', T.matchSets(ours, theirs, { odd1: 'base2' }).pairs.odd1 === 'base2');

  const c = T.matchCards(['1', '2', 'GG01', '999'], [{ id: 'swsh12.5-001', localId: '001' }, { id: 'swsh12.5-002', localId: '002' }, { id: 'swsh12.5-GG01', localId: 'GG01' }]);
  check('cards matched by number; missing ones reported', c.map['1'] === 'swsh12.5-001' && c.map.GG01 === 'swsh12.5-GG01' && JSON.stringify(c.unmatched) === '["999"]', c);

  const row = T.cardRow({ localId: '004', name: 'Charizard', rarity: 'Rare', category: 'Pokemon', types: ['Fire'], dexId: [6], image: 'https://assets.tcgdex.net/en/me/me06/004', illustrator: 'A', attacks: [{ name: 'X', effect: 'secret text' }], description: 'flavor' });
  check('new-set card row: facts + hotlinked image, never attack/flavor text', JSON.stringify(row) === '["004","Charizard","Rare","Pokémon","Fire",6,"https://assets.tcgdex.net/en/me/me06/004/low.webp","A",""]', row);

  // full run against a fake API
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'td-tcgdex-'));
  const snap = Array.from({ length: 120 }, (_, i) => ({ id: 'old' + i, name: 'Old Set ' + i, series: 'Old', releaseDate: `2000-01-${String(1 + (i % 28)).padStart(2, '0')}`, ptcgoCode: '', printedTotal: 2, cards: [['1', 'A', '', '', '', 0, '', ''], ['2', 'B', '', '', '', 0, '', '']] }));
  snap.push({ id: 'me5', name: 'Newest Ours', series: 'Mega Evolution', releaseDate: '2026-08-01', ptcgoCode: 'NO', printedTotal: 2, cards: [['1', 'A', '', '', '', 0, '', '']] });
  fs.writeFileSync(path.join(dir, 'tcg.json'), JSON.stringify(snap));
  const api = {
    sets: [...snap.map((s, i) => ({ id: 'x' + i })), { id: 'me06' }, { id: 'tcgp-a1' }],
    detail: id => {
      if (id === 'me06') return { id, name: 'Brand New', releaseDate: '2026-11-14', serie: { id: 'me', name: 'Mega Evolution' }, tcgOnline: 'BN', legal: { standard: true, expanded: true }, logo: 'https://assets.tcgdex.net/en/me/me06/logo', cardCount: { official: 2, total: 2 }, cards: [{ id: 'me06-001', localId: '001' }, { id: 'me06-002', localId: '002' }] };
      if (id === 'tcgp-a1') return { id, name: 'Pocket Set', releaseDate: '2026-12-01', serie: { id: 'tcgp' }, cards: [] };
      const s = snap[+id.slice(1)];
      return { id, name: s.name, releaseDate: s.releaseDate, cardCount: { official: s.printedTotal }, cards: s.cards.map(c => ({ id: id + '-00' + c[0], localId: '00' + c[0] })) };
    },
  };
  let cardCalls = 0, ptcgCalls = 0, down = false;
  const fake = async url => {
    if (down) throw new Error('ECONNREFUSED');
    if (url.startsWith('https://assets.tcgdex.net/')) return { ok: false, status: 404 };
    if (url.startsWith('https://api.pokemontcg.io/')) { ptcgCalls++; const q = new URL(url).searchParams.get('q');
      const json = /^name:/.test(q) ? { data: [{ id: 'me6', name: 'Brand New' }] } : { data: [{ number: '1', images: { small: 'https://images.scrydex.com/pokemon/me6-1/small' } }] };
      return { ok: true, json: async () => json }; }
    const p = new URL(url).pathname.replace('/v2/en/', '');
    const json = p === 'sets' ? api.sets : p.startsWith('sets/') ? api.detail(decodeURIComponent(p.slice(5))) : (cardCalls++, { id: p.slice(6), localId: p.slice(6).split('-')[1], name: 'New ' + p.slice(-1), category: 'Trainer', rarity: 'None' });
    return { ok: true, json: async () => json };
  };
  const logs = [], opts = { dir, fetchImpl: fake, log: l => logs.push(l), retryMs: 0 };
  const r = await T.run(opts);
  const map = JSON.parse(fs.readFileSync(path.join(dir, 'tcg-id-map.json'), 'utf8'));
  check('ID map written: every set and card matched', Object.keys(map.sets).length === 121 && map.sets.old3.id === 'x3' && map.sets.old3.cards['2'] === 'x3-002' && !map.unmatchedSets.length, { n: Object.keys(map.sets).length, un: map.unmatchedSets });
  let tcg = JSON.parse(fs.readFileSync(path.join(dir, 'tcg.json'), 'utf8'));
  const added = tcg.filter(s => s.src === 'tcgdex');
  check('newer TCGdex set added (TCG Pocket skipped)', added.length === 1 && added[0].id === 'me06' && added[0].cards.length === 2 && added[0].cards[0][3] === 'Trainer' && added[0].logo.endsWith('/logo.png') && added[0].standard, added);
  check('new set that pokemontcg.io lists too: its IDs recorded (ptcgId + card numbers), so prices match the TCG tab', added[0].ptcgId === 'me6' && JSON.stringify(added[0].ptcgNums) === '{"001":"1"}', { ptcgId: added[0].ptcgId, nums: added[0].ptcgNums });
  check('new set without TCGdex pictures: pokemontcg.io pictures of the same set linked by number (hotlinked)', added[0].cards[0][6] === 'https://images.scrydex.com/pokemon/me6-1/small' && added[0].cards[1][6] === '' && ptcgCalls === 2, added[0].cards);
  check('snapshot sets kept unchanged', tcg.length === 122 && tcg[0].id === 'old0');
  await T.run(opts);
  tcg = JSON.parse(fs.readFileSync(path.join(dir, 'tcg.json'), 'utf8'));
  check('re-run: no duplicates, cached cards not fetched again', tcg.length === 122 && cardCalls === 2, { len: tcg.length, cardCalls });
  // weekly order: fetch-tcg-data rewrites tcg.json without the TCGdex sets, then TCGdex is down
  fs.writeFileSync(path.join(dir, 'tcg.json'), JSON.stringify(snap)); down = true;
  const r3 = await T.run(opts);
  tcg = JSON.parse(fs.readFileSync(path.join(dir, 'tcg.json'), 'utf8'));
  check('TCGdex down: new sets restored from the cache, map kept, warning logged', r3 === null && tcg.some(s => s.id === 'me06') && fs.existsSync(path.join(dir, 'tcg-id-map.json')) && logs.some(l => /::warning::TCGdex unavailable/.test(l)));
  check('summary logged', logs.some(l => /121\/121 sets and 241\/241 cards matched/.test(l)), logs[0]);
  fs.rmSync(dir, { recursive: true });

  // promo sets: pinned by hand, newer promos topped up, an older-dated new promo set added
  check('SVP and BW promos pinned to TCGdex (names/dates too far apart to match)', T.SET_FIXES.svp === 'svp' && T.SET_FIXES.bwp === 'bwp');
  const pdir = fs.mkdtempSync(path.join(os.tmpdir(), 'td-tcgdex-'));
  const psnap = snap.map(x => ({ ...x, cards: x.cards.map(c => c.slice()) }));
  psnap.push({ id: 'svp', name: 'Scarlet & Violet Black Star Promos', series: 'Scarlet & Violet', releaseDate: '2023-01-01', ptcgoCode: 'PR-SV', printedTotal: 2, cards: [['1', 'Sprigatito', 'Promo', 'Pokémon', 'Grass', 906, 'https://images.pokemontcg.io/svp/1.png', 'A', '70'], ['2', 'Fuecoco', 'Promo', 'Pokémon', 'Fire', 909, '', 'B', '70']] });
  fs.writeFileSync(path.join(pdir, 'tcg.json'), JSON.stringify(psnap));
  const papi = {
    sets: [...api.sets, { id: 'svp' }, { id: 'mep' }],
    detail: id => id === 'svp' ? { id, name: 'SVP Black Star Promos', serie: { id: 'sv' }, releaseDate: '2023-03-31', cardCount: { official: 4, total: 4 }, cards: ['001', '002', '003', '004'].map(n => ({ id: 'svp-' + n, localId: n })) }
      : id === 'mep' ? { id, name: 'MEP Black Star Promos', releaseDate: '2025-09-26', serie: { id: 'me', name: 'Mega Evolution' }, cardCount: { official: 1, total: 1 }, cards: [{ id: 'mep-001', localId: '001' }] }
      : api.detail(id),
  };
  let pcalls = [], pheads = []; down = false;
  const pfake = async url => {
    if (down) throw new Error('ECONNREFUSED');
    if (url.startsWith('https://api.pokemontcg.io/')) return { ok: true, json: async () => ({ data: [] }) };
    if (url.startsWith('https://assets.tcgdex.net/')) { pheads.push(url); const img = url === 'https://assets.tcgdex.net/en/me/mep/001/low.webp' || url === 'https://assets.tcgdex.net/en/sv/svp/004/low.webp';
      return { ok: img, status: img ? 200 : 404, headers: { get: () => (img ? 'image/webp' : 'text/html') } }; }
    const q = new URL(url).pathname.replace('/v2/en/', '');
    const json = q === 'sets' ? papi.sets : q.startsWith('sets/') ? papi.detail(decodeURIComponent(q.slice(5))) : (pcalls.push(q.slice(6)), { id: q.slice(6), localId: q.slice(6).split('-')[1], name: 'Promo ' + q.slice(-1), category: 'Pokemon', rarity: 'Promo', types: ['Water'], dexId: [7], image: q.endsWith('004') || q.startsWith('cards/mep') ? undefined : 'https://assets.tcgdex.net/en/sv/svp/' + q.slice(-3), illustrator: 'C', hp: 60 });
    return { ok: true, json: async () => json };
  };
  const plogs = [], popts = { dir: pdir, fetchImpl: pfake, log: l => plogs.push(l), retryMs: 0 };
  await T.run(popts);
  let ptcg = JSON.parse(fs.readFileSync(path.join(pdir, 'tcg.json'), 'utf8')), pmap = JSON.parse(fs.readFileSync(path.join(pdir, 'tcg-id-map.json'), 'utf8'));
  let svp = ptcg.find(x => x.id === 'svp');
  check('newer promos TCGdex has are added to our promo set (facts + TCGdex picture), old cards untouched', svp.cards.length === 4 && svp.cards[2][0] === '003' && svp.cards[2][1] === 'Promo 3' && svp.cards[2][6] === 'https://assets.tcgdex.net/en/sv/svp/003/low.webp' && svp.cards[0][6] === 'https://images.pokemontcg.io/svp/1.png' && !svp.src, svp.cards);
  check('…and are in the ID map, so they get prices', pmap.sets.svp && pmap.sets.svp.cards['003'] === 'svp-003' && pmap.sets.svp.cards['1'] === 'svp-001', pmap.sets.svp);
  const mep = ptcg.find(x => x.id === 'mep');
  check('a TCGdex promo set we lack is added even though it is older than our newest set', mep && mep.src === 'tcgdex' && mep.cards.length === 1, mep && mep.id);
  check('cards without a picture link: TCGdex picture used only when it really exists (hotlinked)', svp.cards[3][6] === 'https://assets.tcgdex.net/en/sv/svp/004/low.webp' && mep.cards[0][6] === 'https://assets.tcgdex.net/en/me/mep/001/low.webp' && svp.cards[1][6] === '' && !pheads.some(u => /\/svp\/2\//.test(u)) /* snapshot cards aren't probed */, { svp: svp.cards.map(c => c[6]), mep: mep.cards[0][6] });
  check('TCGdex short name replaced ("MEP" → Mega Evolution)', mep.name === 'Mega Evolution Black Star Promos', mep.name);
  check('promo summary logged', plogs.some(l => /newer promos in promo sets: svp \+2/.test(l)), plogs);
  const n1 = pcalls.length; await T.run(popts);
  check('re-run: promos not fetched again, no duplicates', pcalls.length === n1 && JSON.parse(fs.readFileSync(path.join(pdir, 'tcg.json'), 'utf8')).find(x => x.id === 'svp').cards.length === 4, { before: n1, after: pcalls.length });
  fs.writeFileSync(path.join(pdir, 'tcg.json'), JSON.stringify(psnap)); await T.run(popts); // weekly snapshot rewrite drops them
  check('after the weekly snapshot rewrite: promos come back from the cache', pcalls.length === n1 && JSON.parse(fs.readFileSync(path.join(pdir, 'tcg.json'), 'utf8')).find(x => x.id === 'svp').cards.length === 4);
  fs.writeFileSync(path.join(pdir, 'tcg.json'), JSON.stringify(psnap)); down = true; await T.run(popts);
  check('TCGdex down: cached promos kept too', JSON.parse(fs.readFileSync(path.join(pdir, 'tcg.json'), 'utf8')).find(x => x.id === 'svp').cards.length === 4);
  fs.rmSync(pdir, { recursive: true });

  console.log(failures ? `\n${failures} TCGDEX MAP CHECK(S) FAILED` : '\nALL TCGDEX MAP CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})();
