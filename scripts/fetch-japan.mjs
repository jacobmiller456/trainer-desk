// Japanese cards for the TCG tab (owner-approved Nov 2026): card lists from TCGdex's Japanese data (api.tcgdex.net/v2/ja,
// pictures hotlinked from assets.tcgdex.net) and daily TCGplayer prices (USD, the US market for imported Japanese cards)
// from TCGCSV (tcgcsv.com: a free daily copy of TCGplayer's catalog and prices; "Pokemon Japan" is category 85).
//   data/tcg-ja.json   {updated, tcgcsv, sets:[{id "jp-<tcgdex id>", tcgdex, group, name (English, from TCGplayer, else
//                      Japanese), nameJa, code, releaseDate, printedTotal, total, img, seen,
//                      cards:[[num, name, rarity, supertype, types, hp, nameJa, tcgplayerProductId]]}]}
//   prices/<YYYY-MM>/jp-<id>.json, prices/ids/jp-<id>.json and prices/latest.json: same files as the English prices
//   (scripts/snapshot-prices.mjs), so price history, the card finder's prices and "Buy on TCGplayer" links just work.
// Facts only: TCGplayer's data includes card text (attacks, abilities); only names, numbers, rarity, type, HP and prices
// are kept. TCGCSV's rules (tcgcsv.com/docs): one sync a day, saved here (visitors never call it), a named User-Agent,
// a short pause between requests, under 10,000 requests a day (this uses ~140; set lists are re-read only when they change).
// TCGdex sets are matched to TCGplayer groups by set code (SV2a = "SV2a: Pokemon Card 151"); hand fixes in SET_FIXES.
// An outage of either source keeps the previous files (warning, exit 0). Run by .github/workflows/prices.yml, or:
//   node scripts/fetch-japan.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mergeDay, stringify } from './snapshot-prices.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TCGDEX_JA = 'https://api.tcgdex.net/v2/ja';
export const TCGCSV = 'https://tcgcsv.com';
export const CATEGORY = 85; // TCGplayer "Pokemon Japan"
const UA = 'TrainerDesk/1.0 (+https://www.trainerdesk.net)';
// TCGdex Japanese set ID -> TCGplayer group ID, when the set codes don't match
export const SET_FIXES = {};

export const siteId = tcgdexId => 'jp-' + String(tcgdexId).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const normCode = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
export const normNum = n => String(n || '').toLowerCase().replace(/\d+/g, d => String(parseInt(d, 10))).replace(/\s+/g, '');
const pos = v => (typeof v === 'number' && isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null);
const ext = (p, k) => { const e = (p.extendedData || []).find(x => x.name === k); return e ? String(e.value || '') : ''; };

// "SV2a: Pokemon Card 151" -> "Pokémon Card 151"
export const groupName = g => String(g.name || '').replace(/^[^:]{1,12}:\s*/, '').replace(/\bPokemon\b/g, 'Pokémon').trim();
// TCGdex sets -> TCGplayer groups by set code (case/punctuation-insensitive), plus hand fixes. Returns {tcgdexId: group}.
export function matchGroups(sets, groups, fixes = SET_FIXES) {
  const byCode = new Map(), byId = new Map(groups.map(g => [g.groupId, g]));
  for (const g of groups) { const c = normCode(g.abbreviation); if (c && !byCode.has(c)) byCode.set(c, g); }
  const out = {};
  for (const s of sets) { const g = fixes[s.id] ? byId.get(fixes[s.id]) : byCode.get(normCode(s.id)); if (g) out[s.id] = g; }
  return out;
}
// One card number's TCGplayer product: the plain version ("Bulbasaur - 001/165"), not "(Poke Ball Pattern)" and the like.
// products: TCGCSV products of one group. Returns Map normNum -> {pid, name, rarity, supertype, types, hp}.
export function productsByNumber(products) {
  const out = new Map();
  for (const p of products) {
    const num = ext(p, 'Number').split('/')[0].trim(); if (!num || !Number.isInteger(p.productId)) continue;
    const plain = !/\)\s*$/.test(p.name || ''), k = normNum(num), old = out.get(k);
    if (old && (old.plain && !plain || old.plain === plain && old.pid < p.productId)) continue; // plain first, then the oldest listing
    const kind = ext(p, 'CardType'), hp = ext(p, 'HP').replace(/\D/g, '');
    const supertype = hp ? 'Pokémon' : /trainer/i.test(kind) ? 'Trainer' : /energy/i.test(kind) ? 'Energy' : '';
    out.set(k, { pid: p.productId, plain, name: String(p.name || '').replace(/\s+-\s+[^-]*\d[^-]*$/, '').replace(/\s*\([^)]*\)\s*$/, '').trim().slice(0, 80),
      rarity: ext(p, 'Rarity').slice(0, 40), supertype, types: supertype === 'Pokémon' ? kind.replace(/\s*\/\s*/g, '/').slice(0, 40) : '', hp });
  }
  return out;
}
// TCGCSV price rows of one product -> USD: Normal first, then Holofoil, then any; market price, else mid.
export function productPrice(rows) {
  const order = r => (r.subTypeName === 'Normal' ? 0 : r.subTypeName === 'Holofoil' ? 1 : 2);
  for (const r of [...rows].sort((a, b) => order(a) - order(b))) { const v = pos(r.marketPrice) ?? pos(r.midPrice); if (v != null) return v; }
  return null;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function run({ dataDir = path.join(root, 'data'), pricesDir = path.join(root, 'prices'), fetchImpl = fetch, log = console.log,
  now = new Date(), pauseMs = 120, retryMs = 3000 } = {}) {
  const getJSON = async (url, headers = {}) => {
    for (let a = 1; ; a++) {
      try { const r = await fetchImpl(url, { headers, signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error(r.status); return await r.json(); }
      catch (e) { if (a >= 3) throw new Error(`${url}: ${e.message}`); await sleep(retryMs * a); }
    }
  };
  const csv = async rel => { await sleep(pauseMs); return getJSON(`${TCGCSV}/${rel}`, { 'User-Agent': UA }); };
  const file = path.join(dataDir, 'tcg-ja.json');
  let prev = { sets: [] }; try { prev = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {}
  const prevBy = new Map((prev.sets || []).map(s => [s.tcgdex, s]));

  // 1. TCGdex: the Japanese sets and their card lists (a set is re-read only when its card count changes)
  let list;
  try { list = await getJSON(`${TCGDEX_JA}/sets`); if (!Array.isArray(list) || list.length < 50) throw new Error('set list looks incomplete'); }
  catch (e) { log(`::warning::TCGdex unavailable (${e.message}); keeping the previous Japanese card lists and prices`); return null; }
  // sets TCGdex lists without cards (most of the BW/XY era so far): remembered, looked at again on Mondays
  const sets = [], empty = {}, recheck = now.getUTCDay() === 1;
  for (const s of list) {
    const old = prevBy.get(s.id), total = (s.cardCount && s.cardCount.total) || 0;
    if (old && old.total === total && old.cards.length) { sets.push({ ...old, cards: old.cards.map(c => c.slice()) }); continue; }
    if (!old && !recheck && (prev.empty || {})[s.id] === total) { empty[s.id] = total; continue; }
    try {
      const d = await getJSON(`${TCGDEX_JA}/sets/${encodeURIComponent(s.id)}`);
      const cards = (d.cards || []).filter(c => c && c.localId);
      if (!cards.length) { empty[s.id] = total; continue; }
      const one = cards.find(c => c.image);
      sets.push({ id: siteId(s.id), tcgdex: s.id, group: 0, name: d.name || s.name || s.id, nameJa: d.name || s.name || '', code: s.id,
        releaseDate: String(d.releaseDate || '').slice(0, 10), printedTotal: (d.cardCount && d.cardCount.official) || 0, total,
        img: one ? one.image.slice(0, one.image.length - String(one.localId).length) : '', seen: 0, nopic: cards.filter(c => !c.image).map(c => c.localId),
        cards: cards.map(c => [c.localId, c.name || '', '', '', '', '', c.name || '', 0]) });
    } catch (e) { log(`  skipped ${s.id}: ${e.message}`); if (old) sets.push(old); }
  }

  // 2. TCGCSV: match sets to TCGplayer groups, add English names/rarity/type/HP and product IDs, read today's prices
  const prices = {}, pids = {};
  let stamp = prev.tcgcsv || '', tcgcsvOk = true;
  try {
    await sleep(pauseMs);
    const r = await fetchImpl(`${TCGCSV}/last-updated.txt`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(r.status); stamp = (await r.text()).trim().slice(0, 40);
    if (stamp && stamp === prev.tcgcsv && sets.every(s => prevBy.has(s.tcgdex))) throw Object.assign(new Error('unchanged'), { same: true }); // TCGCSV builds once a day
    const groups = (await csv(`tcgplayer/${CATEGORY}/groups`)).results || [];
    if (groups.length < 50) throw new Error('group list looks incomplete');
    const match = matchGroups(sets.map(s => ({ id: s.tcgdex })), groups);
    for (const s of sets) {
      const g = match[s.tcgdex]; if (!g) { s.group = 0; continue; }
      const rows = (await csv(`tcgplayer/${CATEGORY}/${g.groupId}/prices`)).results || [];
      const byPid = new Map(); for (const row of rows) { if (!byPid.has(row.productId)) byPid.set(row.productId, []); byPid.get(row.productId).push(row); }
      // card names/rarity/IDs: re-read when the group is new or TCGplayer lists more products than last time
      if (s.group !== g.groupId || byPid.size > (s.seen || 0) || !s.cards.some(c => c[7])) {
        const prods = productsByNumber((await csv(`tcgplayer/${CATEGORY}/${g.groupId}/products`)).results || []);
        for (const c of s.cards) { const p = prods.get(normNum(c[0]));
          if (p) { c[1] = p.name || c[6]; c[2] = p.rarity; c[3] = p.supertype; c[4] = p.types; c[5] = p.hp; c[7] = p.pid; } else { c[1] = c[6]; c[2] = c[3] = c[4] = c[5] = ''; c[7] = 0; } }
        s.group = g.groupId; s.name = groupName(g) || s.nameJa; s.seen = byPid.size;
      }
      const out = {}, ids = {};
      for (const c of s.cards) { if (!c[7]) continue; const v = productPrice(byPid.get(c[7]) || []); if (v != null) out[`${s.id}-${c[0]}`] = v; ids[`${s.id}-${c[0]}`] = c[7]; }
      if (Object.keys(out).length) prices[s.id] = out;
      if (Object.keys(ids).length) pids[s.id] = ids;
    }
  } catch (e) { tcgcsvOk = false; log(e.same ? `TCGCSV unchanged since the last run (${stamp}); Japanese prices already saved` : `::warning::TCGCSV unavailable (${e.message}); Japanese prices not updated this run`); }

  sets.sort((a, b) => b.releaseDate.localeCompare(a.releaseDate) || a.id.localeCompare(b.id));
  const nCards = sets.reduce((n, s) => n + s.cards.length, 0), nNamed = sets.reduce((n, s) => n + s.cards.filter(c => c[7]).length, 0);
  fs.writeFileSync(file, JSON.stringify({ updated: now.toISOString().slice(0, 10), tcgcsv: stamp, empty, sets }) + '\n');
  if (!tcgcsvOk) return { sets: sets.length, cards: nCards, priced: 0 };

  // 3. prices: same files as the English daily prices (one column per day; today's column replaced on a re-run)
  const day = now.toISOString().slice(0, 10), month = day.slice(0, 7);
  fs.mkdirSync(path.join(pricesDir, month), { recursive: true }); fs.mkdirSync(path.join(pricesDir, 'ids'), { recursive: true });
  let priced = 0;
  for (const [id, p] of Object.entries(prices)) {
    const fp = path.join(pricesDir, month, id + '.json'); let old = null; try { old = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (e) {}
    fs.writeFileSync(fp, stringify(mergeDay(old, day, p))); priced += Object.keys(p).length;
  }
  for (const [id, m] of Object.entries(pids)) {
    const fp = path.join(pricesDir, 'ids', id + '.json');
    const txt = '{\n' + Object.keys(m).sort().map(k => JSON.stringify(k) + ':' + m[k]).join(',\n') + '\n}\n';
    let cur = ''; try { cur = fs.readFileSync(fp, 'utf8'); } catch (e) {}
    if (txt !== cur) fs.writeFileSync(fp, txt);
  }
  // latest.json: list the new files too (the English price job keeps its own fields)
  let idx = {}; try { idx = JSON.parse(fs.readFileSync(path.join(pricesDir, 'latest.json'), 'utf8')); } catch (e) {}
  const months = {};
  for (const m of fs.readdirSync(pricesDir).filter(m => /^\d{4}-\d{2}$/.test(m)).sort())
    months[m] = fs.readdirSync(path.join(pricesDir, m)).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).sort();
  fs.writeFileSync(path.join(pricesDir, 'latest.json'), JSON.stringify({ ...idx, updated: now.toISOString(), months }) + '\n');
  log(`Japanese cards: ${sets.length} sets, ${nCards} cards (${nNamed} matched to TCGplayer in ${sets.filter(s => s.group).length} sets); prices ${day}: ${priced} cards in ${Object.keys(prices).length} sets`);
  return { sets: sets.length, cards: nCards, priced };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch(e => { console.error(e.message); process.exit(1); });
}
