// Phase 1–2 of the pokemontcg.io replacement (docs/tcg-migration.md), run weekly after fetch-tcg-data.mjs:
//  1. data/tcg-id-map.json: every pokemontcg.io set/card ID in data/tcg.json matched to its TCGdex ID, so binders, price
//     history and links can be carried over when the site switches to TCGdex. Unmatched sets/cards are listed for hand-fixing
//     (add them to SET_FIXES below).
//  2. Sets released after the newest set in the (now historical) pokemon-tcg-data snapshot are added to data/tcg.json from
//     TCGdex (src:"tcgdex", TCGdex IDs), so new sets keep getting pages. Same compact facts-only card rows; no card text.
//     They are also kept in data/tcgdex-sets.json so a TCGdex outage doesn't drop them, and cards are only re-fetched
//     when a set's card count changes.
// TCGdex (api.tcgdex.net) is free with no key and no published rate limit, so requests go 4 at a time.
// Usage: node scripts/fetch-tcgdex.mjs   (an outage keeps the previous files and exits 0 with a warning)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TCGDEX = 'https://api.tcgdex.net/v2/en';
// Hand fixes when automatic matching gets a set wrong or misses it: pokemontcg.io set ID -> TCGdex set ID
export const SET_FIXES = {};
const DAY = 864e5;

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
// Card numbers: "001" == "1", "SV001" == "SV1", "TG01" == "TG1" (case-insensitive)
export const normNum = n => String(n || '').toLowerCase().replace(/\d+/g, d => String(parseInt(d, 10))).replace(/\s+/g, '');
const days = (a, b) => (a && b ? Math.abs(Date.parse(a) - Date.parse(b)) / DAY : Infinity);
const GALLERY = /\s*(trainer gallery|galarian gallery|shiny vault)$/i;

// ours: [{id,name,releaseDate,ptcgoCode,printedTotal}], theirs: [{id,name,releaseDate,tcgOnline,abbreviation,cardCount,serie}]
// Returns {pairs:{oursId: theirsId}, unmatched:[oursId]}. Gallery subsets (e.g. "Crown Zenith Galarian Gallery") map to the
// main TCGdex set, which holds those cards under their GG/TG/SV numbers.
export function matchSets(ours, theirs, fixes = SET_FIXES) {
  const pairs = {}, used = new Set(), byId = new Map(theirs.map(t => [t.id, t]));
  for (const [o, t] of Object.entries(fixes)) if (byId.has(t)) { pairs[o] = t; used.add(t); }
  const score = (o, t, name) => {
    if (days(o.releaseDate, t.releaseDate) > 45) return 0;
    const a = norm(name), b = norm(t.name), code = (t.tcgOnline || (t.abbreviation && t.abbreviation.official) || '').toLowerCase();
    let s = a === b ? 3 : (a && b && (a.includes(b) || b.includes(a)) ? 2 : 0);
    if (o.ptcgoCode && code && o.ptcgoCode.toLowerCase() === code) s += 2;
    if (o.printedTotal && t.cardCount && o.printedTotal === t.cardCount.official) s += 1;
    if (days(o.releaseDate, t.releaseDate) < 1) s += 1;
    return s;
  };
  const cands = [];
  for (const o of ours) if (!pairs[o.id] && !GALLERY.test(o.name)) for (const t of theirs) { const s = score(o, t, o.name); if (s >= 3) cands.push([s, o.id, t.id]); }
  cands.sort((x, y) => y[0] - x[0]);
  for (const [, o, t] of cands) if (!pairs[o] && !used.has(t)) { pairs[o] = t; used.add(t); }
  for (const o of ours) {                               // galleries: a separate TCGdex set if there is one, else the main set
    if (pairs[o.id] || !GALLERY.test(o.name)) continue;
    let best = null, bs = 2;
    for (const t of theirs) { const s = score(o, t, o.name); if (s > bs && !used.has(t.id)) { best = t; bs = s; } }
    if (best) { pairs[o.id] = best.id; used.add(best.id); continue; }
    const parent = o.name.replace(GALLERY, '');
    for (const t of theirs) { const s = score(o, t, parent); if (s > bs) { best = t; bs = s; } }
    if (best) pairs[o.id] = best.id;
  }
  return { pairs, unmatched: ours.filter(o => !pairs[o.id]).map(o => o.id) };
}

// nums: our card numbers; theirs: TCGdex CardResume [{id, localId}]. Returns {map:{num: tcgdexCardId}, unmatched:[num]}
export function matchCards(nums, theirs) {
  const idx = new Map();
  for (const c of theirs) { const k = normNum(c.localId); if (!idx.has(k)) idx.set(k, c.id); }
  const map = {}, unmatched = [];
  for (const n of nums) { const id = idx.get(normNum(n)); if (id) map[n] = id; else unmatched.push(n); }
  return { map, unmatched };
}

// One TCGdex card -> our compact row [number, name, rarity, supertype, types, dex no., small image, artist]
const SUPER = { Pokemon: 'Pokémon', Trainer: 'Trainer', Energy: 'Energy' };
export function cardRow(c) {
  return [c.localId || '', c.name || '', c.rarity && c.rarity !== 'None' ? c.rarity : '', SUPER[c.category] || c.category || '',
    (c.types || []).join('/'), (c.dexId || [])[0] || 0, c.image ? c.image + '/low.webp' : '', c.illustrator || ''];
}
const byNum = (a, b) => (parseInt(a[0], 10) || 1e9) - (parseInt(b[0], 10) || 1e9) || a[0].localeCompare(b[0]);
export function setEntry(t, cards) {
  return {
    id: t.id, name: t.name, series: (t.serie && t.serie.name) || '', printedTotal: (t.cardCount && t.cardCount.official) || 0,
    total: (t.cardCount && t.cardCount.total) || cards.length, releaseDate: String(t.releaseDate || '').slice(0, 10),
    ptcgoCode: t.tcgOnline || (t.abbreviation && t.abbreviation.official) || '',
    standard: !!(t.legal && t.legal.standard), expanded: !!(t.legal && t.legal.expanded),
    logo: t.logo ? t.logo + '.png' : '', symbol: t.symbol ? t.symbol + '.png' : '',
    cards: cards.map(cardRow).sort(byNum), src: 'tcgdex',
  };
}
// TCGdex sets to add: newer than everything in our snapshot, not matched to one of ours, not TCG Pocket (a different game)
export const newSets = (theirs, pairs, newest) => {
  const taken = new Set(Object.values(pairs));
  return theirs.filter(t => !taken.has(t.id) && t.releaseDate && String(t.releaseDate).slice(0, 10) > newest && !(t.serie && t.serie.id === 'tcgp'));
};

async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}

export async function run({ dir = path.join(root, 'data'), fetchImpl = fetch, log = console.log, retryMs = 3000 } = {}) {
  const getJSON = async url => {
    for (let a = 1; ; a++) {
      try { const r = await fetchImpl(url, { signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error(r.status); return await r.json(); }
      catch (e) { if (a >= 3) throw new Error(`${url}: ${e.message}`); await new Promise(res => setTimeout(res, retryMs * a)); }
    }
  };
  const read = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { return d; } };
  const ours = read('tcg.json', []).filter(s => s.src !== 'tcgdex');   // the pokemon-tcg-data snapshot (re-runs are idempotent)
  const cached = read('tcgdex-sets.json', []);
  const write = (f, v) => fs.writeFileSync(path.join(dir, f), JSON.stringify(v) + '\n');
  const merge = extra => { write('tcg.json', [...ours, ...extra.filter(e => !ours.some(o => o.id === e.id))]); };
  if (!ours.length) throw new Error('data/tcg.json is missing; run fetch-tcg-data.mjs first');

  let theirs;
  try {
    const list = await getJSON(`${TCGDEX}/sets`);
    if (!Array.isArray(list) || list.length < 100) throw new Error('set list looks incomplete');
    theirs = (await pool(list, 4, s => getJSON(`${TCGDEX}/sets/${encodeURIComponent(s.id)}`).catch(e => { log(`skipped set ${s.id}: ${e.message}`); return null; }))).filter(Boolean);
  } catch (e) {
    log(`::warning::TCGdex unavailable (${e.message}); keeping the previous ID map and new sets`);
    merge(cached); return null;
  }

  const { pairs, unmatched } = matchSets(ours, theirs);
  const byId = new Map(theirs.map(t => [t.id, t]));
  const sets = {}, missingCards = {};
  for (const o of ours) {
    const t = pairs[o.id] && byId.get(pairs[o.id]); if (!t) continue;
    const { map, unmatched: miss } = matchCards(o.cards.map(c => c[0]), t.cards || []);
    sets[o.id] = { id: t.id, cards: map };
    if (miss.length) missingCards[o.id] = miss;
  }
  const nCards = ours.reduce((n, s) => n + s.cards.length, 0), nMatched = Object.values(sets).reduce((n, s) => n + Object.keys(s.cards).length, 0);
  if (Object.keys(sets).length < ours.length * 0.8) { log(`::warning::only ${Object.keys(sets).length} of ${ours.length} sets matched; keeping the previous ID map`); }
  else write('tcg-id-map.json', { updated: new Date().toISOString().slice(0, 10), sets, unmatchedSets: unmatched, unmatchedCards: missingCards });

  // new sets: reuse cached card rows unless the set's card count changed
  const newest = ours.reduce((m, s) => (s.releaseDate > m ? s.releaseDate : m), '');
  const extra = [];
  for (const t of newSets(theirs, pairs, newest)) {
    const old = cached.find(c => c.id === t.id);
    if (old && old.cards.length === (t.cards || []).length) { extra.push({ ...setEntry(t, []), cards: old.cards }); continue; }
    const cards = (await pool(t.cards || [], 4, c => getJSON(`${TCGDEX}/cards/${encodeURIComponent(c.id)}`).catch(() => ({ ...c })))).filter(Boolean);
    extra.push(setEntry(t, cards));
  }
  write('tcgdex-sets.json', extra);
  merge(extra);
  log(`TCGdex: ${Object.keys(sets).length}/${ours.length} sets and ${nMatched}/${nCards} cards matched; ${unmatched.length} sets unmatched${unmatched.length ? ' (' + unmatched.join(' ') + ')' : ''}; ${extra.length} newer sets added${extra.length ? ' (' + extra.map(e => e.id).join(' ') + ')' : ''}`);
  for (const [s, miss] of Object.entries(missingCards)) log(`  ${s}: ${miss.length} card(s) unmatched: ${miss.slice(0, 12).join(' ')}${miss.length > 12 ? ' …' : ''}`);
  return { sets, unmatched, missingCards, extra };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch(e => { console.error(e.message); process.exit(1); });
}
