// Daily price snapshot for the card price-history sparklines, price movers and the set pages' most valuable cards.
// Reads each card's TCGplayer market price from TCGdex (api.tcgdex.net; free, no key) and appends it to one file per set
// per month, keyed by the site's card IDs (pokemontcg.io IDs, translated with data/tcg-id-map.json; sets added from
// TCGdex use their own IDs):
//   prices/<YYYY-MM>/<setId>.json = {"days":["2026-10-15",...],"cards":{"<cardId>":[1.23,null,...]}}
//   prices/latest.json            = {"updated":"<ISO time>","months":{"<YYYY-MM>":["<setId>",...]}}
// Sets released in the last 2 years are priced daily, older sets weekly (about 5,000 card lookups a day, 4 at a time,
// since TCGdex has no bulk price endpoint and no published rate limit). Until Nov 2026 this read pokemontcg.io, which
// stopped refreshing prices on Oct 16, 2026 (docs/tcg-migration.md); the files and IDs are unchanged, so history continues.
// Past months are never rewritten. Prices only (numbers), no card text. A set that keeps failing is skipped for the day.
// Run by .github/workflows/prices.yml, or: node scripts/snapshot-prices.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TCGDEX = 'https://api.tcgdex.net/v2/en';
const pos = v => (typeof v === 'number' && isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null);

// Same rule as the TCG tab's TCGdex prices (index.html): first TCGplayer variant with a market (else mid) price, USD.
export function usdPrice(card) {
  const tp = card && card.pricing && card.pricing.tcgplayer; if (!tp || typeof tp !== 'object') return null;
  for (const k of Object.keys(tp)) { const v = tp[k]; const n = v && typeof v === 'object' ? (pos(v.marketPrice) ?? pos(v.midPrice)) : null; if (n != null) return n; }
  return null;
}
export const setOf = id => id.slice(0, id.lastIndexOf('-'));

// Put today's prices into one month file (replacing today's column if the job already ran today).
export function mergeDay(file, day, prices) {
  const f = file && Array.isArray(file.days) && file.cards ? file : { days: [], cards: {} };
  let col = f.days.indexOf(day);
  if (col < 0) { f.days.push(day); col = f.days.length - 1; }
  const len = f.days.length;
  for (const id of Object.keys(f.cards)) { while (f.cards[id].length < len) f.cards[id].push(null); f.cards[id][col] = null; }
  for (const [id, v] of Object.entries(prices)) {
    if (!f.cards[id]) f.cards[id] = new Array(len).fill(null);
    f.cards[id][col] = v;
  }
  return f;
}
// One card per line: small daily diffs, readable files.
export const stringify = f => '{"days":' + JSON.stringify(f.days) + ',"cards":{\n' +
  Object.keys(f.cards).sort().map(id => JSON.stringify(id) + ':' + JSON.stringify(f.cards[id])).join(',\n') + '\n}}\n';

// Which sets to price this run: sets released in the last 2 years if not saved today; older sets once a week (not saved in
// the last 6 days). Recent first, then the longest-unsaved, so the three runs a day (prices.yml) share out the work.
export function planSets(list, { day, last }) {
  const recentFrom = String(+day.slice(0, 4) - 2) + day.slice(4);
  const weekAgo = new Date(Date.parse(day + 'T00:00:00Z') - 6 * 864e5).toISOString().slice(0, 10);
  return list.filter(s => /^[a-z0-9.]+$/i.test(s.id))
    .map(s => ({ ...s, recent: s.rel >= recentFrom ? 1 : 0, last: last(s.id) }))
    .filter(s => s.recent ? s.last !== day : s.last <= weekAgo)
    .sort((a, b) => b.recent - a.recent || a.last.localeCompare(b.last) || b.rel.localeCompare(a.rel))
    .map(s => s.id);
}
// Our card ID -> TCGdex card ID for one set: from the ID map (pokemontcg.io sets), or the set's own IDs (sets added from TCGdex).
export function cardIds(set, idMap) {
  const out = {};
  if (set.src === 'tcgdex') for (const c of set.cards || []) out[`${set.id}-${c[0]}`] = `${set.id}-${c[0]}`;
  else { const m = idMap && idMap.sets && idMap.sets[set.id]; if (m) for (const [num, tid] of Object.entries(m.cards || {})) out[`${set.id}-${num}`] = tid; }
  return out;
}

// Last day a set was saved (this month or last), '' if never.
function lastSaved(dir, id, month, prevMonth) {
  for (const m of [month, prevMonth]) { try { const d = JSON.parse(fs.readFileSync(path.join(dir, m, id + '.json'), 'utf8')).days; if (d && d.length) return d[d.length - 1]; } catch (e) {} }
  return '';
}
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}

export async function snapshot({ dir = path.join(root, 'prices'), dataFile = path.join(root, 'data/tcg.json'), mapFile = path.join(root, 'data/tcg-id-map.json'),
  now = new Date(), fetchImpl = fetch, log = console.log, retryMs = 3000, concurrency = 4, budgetMs = 40 * 60e3, minCards = 1000 } = {}) {
  const stopAt = Date.now() + budgetMs; // stop starting new sets after this, and save what we have
  const getJSON = async url => {
    for (let a = 1; ; a++) {
      try { const r = await fetchImpl(url, { signal: AbortSignal.timeout(30000) }); if (r.status === 404) return null; if (!r.ok) throw new Error(r.status); return await r.json(); }
      catch (e) { if (a >= 3) throw e; await new Promise(res => setTimeout(res, retryMs * a)); }
    }
  };
  const sets = JSON.parse(fs.readFileSync(dataFile, 'utf8')).filter(s => s && s.id);
  let idMap = null; try { idMap = JSON.parse(fs.readFileSync(mapFile, 'utf8')); } catch (e) {}
  if (!idMap) log('::warning::data/tcg-id-map.json missing; only sets added from TCGdex can be priced');
  const day = now.toISOString().slice(0, 10), month = day.slice(0, 7);
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  const byId = new Map(sets.map(s => [s.id, s]));
  // First run after the switch from pokemontcg.io: every set is due once (today's frozen pokemontcg.io column gets replaced).
  let prevIdx = {}; try { prevIdx = JSON.parse(fs.readFileSync(path.join(dir, 'latest.json'), 'utf8')); } catch (e) {}
  const switching = prevIdx.source !== 'tcgdex';
  const ids = planSets(sets.filter(s => Object.keys(cardIds(s, idMap)).length).map(s => ({ id: s.id, rel: s.releaseDate || '' })), { day, last: id => (switching ? '' : lastSaved(dir, id, month, prev)) });
  if (switching) log('first TCGdex run: pricing every set once');
  log(`${ids.length} of ${sets.length} sets to price this run`);
  if (!ids.length) { log('every set is up to date'); return { priced: 0, sets: 0, failed: [] }; }

  const fetchSet = async id => {
    const want = Object.entries(cardIds(byId.get(id), idMap)), out = {}; let errors = 0;
    await pool(want, concurrency, async ([ours, theirs]) => {
      try { const j = await getJSON(`${TCGDEX}/cards/${encodeURIComponent(theirs)}`); const v = usdPrice(j); if (v != null) out[ours] = v; }
      catch (e) { errors++; }
    });
    if (errors > want.length / 2) throw new Error(`${errors} of ${want.length} lookups failed`);
    return out;
  };
  const bySet = {}; let priced = 0, failed = [], tried = 0;
  for (const round of [ids, null]) {
    const list = round || failed; if (!round) failed = [];
    for (const id of list) {
      if (Date.now() > stopAt) { log(`time budget used up; ${list.length - list.indexOf(id)} sets left for the next run`); break; }
      if (round) tried++;
      try { const p = await fetchSet(id); if (Object.keys(p).length) { bySet[id] = p; priced += Object.keys(p).length; } }
      catch (e) { failed.push(id); log(`set ${id} failed (${e.message})${round ? ', will retry' : ', skipped this run'}`); }
    }
    if (!failed.length) break;
  }
  // TCGdex trouble: most sets failed, or a big run came back nearly empty. Fail the job (visible in Actions) and write nothing.
  if ((failed.length > 1 && failed.length >= tried / 2) || (tried >= 20 && priced < minCards)) throw new Error(`only ${priced} priced cards (${failed.length} of ${tried} sets failed); keeping the previous files`);
  if (!priced) { log(`no prices fetched this run${failed.length ? ` (${failed.join(' ')} failed)` : ''}`); return { priced: 0, sets: 0, failed }; }
  fs.mkdirSync(path.join(dir, month), { recursive: true });
  for (const [set, prices] of Object.entries(bySet)) {
    const fp = path.join(dir, month, set + '.json');
    let old = null; try { old = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (e) {}
    fs.writeFileSync(fp, stringify(mergeDay(old, day, prices)));
  }
  const months = {};
  for (const m of fs.readdirSync(dir).filter(m => /^\d{4}-\d{2}$/.test(m)).sort())
    months[m] = fs.readdirSync(path.join(dir, m)).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).sort();
  // sourceSince: first day saved from TCGdex. Weekly changes (movers, set pages) are only measured from then on, so the switch
  // from pokemontcg.io's frozen October prices doesn't show up as one week's movement.
  const sourceSince = prevIdx.source === 'tcgdex' && prevIdx.sourceSince ? prevIdx.sourceSince : day;
  fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify({ updated: now.toISOString(), source: 'tcgdex', sourceSince, months }) + '\n');
  log(`prices ${day}: ${priced} priced cards in ${Object.keys(bySet).length} of ${tried} sets this run${failed.length ? `, ${failed.length} skipped: ${failed.join(' ')}` : ''}`);
  return { priced, sets: Object.keys(bySet).length, failed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  snapshot().catch(e => { console.error(e.message); process.exit(1); });
}
