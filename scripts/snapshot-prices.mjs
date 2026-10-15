// Daily price snapshot for the card price-history sparklines. Reads every card's TCGplayer market price from the
// pokemontcg.io API (the same prices the TCG tab shows live) and appends today's value to one file per set per month:
//   prices/<YYYY-MM>/<setId>.json = {"days":["2026-10-15",...],"cards":{"<cardId>":[1.23,null,...]}}
//   prices/latest.json            = {"updated":"<ISO time>","months":{"<YYYY-MM>":["<setId>",...]}}
// Past months are never rewritten, so the repo only grows by one column a day. Prices only (numbers), no card text.
// Fetched one set at a time; a set that keeps failing is skipped for the day (a gap in its line, not a failed job).
// Run daily by .github/workflows/prices.yml, or: node scripts/snapshot-prices.mjs   (optional env: POKEMONTCG_API_KEY)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const API = 'https://api.pokemontcg.io/v2';
const pos = v => (typeof v === 'number' && isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null);

// Same rule as cardPrice() in index.html, USD only: first variant with a market (else mid) price.
export function usdPrice(c) {
  const tp = c && c.tcgplayer && c.tcgplayer.prices; if (!tp) return null;
  for (const v of Object.keys(tp)) { const n = tp[v] && (pos(tp[v].market) ?? pos(tp[v].mid)); if (n != null) return n; }
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

async function getJSON(url, { key, fetchImpl, tries = 3 }) {
  for (let a = 1; a <= tries; a++) {
    try {
      const r = await fetchImpl(url, { headers: key ? { 'X-Api-Key': key } : {}, signal: AbortSignal.timeout(60000) });
      if (!r.ok) throw new Error(r.status);
      return await r.json();
    } catch (e) { if (a === tries) throw e; await new Promise(res => setTimeout(res, Math.min(60000, 4000 * 2 ** (a - 1)) * backoffScale)); }
  }
}
let backoffScale = 1; // tests set this to 0

// Sets with release dates: from data/tcg.json (refreshed weekly) when present, else from the API (newest last).
async function setList(opts, dataFile) {
  try { const l = JSON.parse(fs.readFileSync(dataFile, 'utf8')).filter(s => s && s.id).map(s => ({ id: s.id, rel: s.releaseDate || '' })); if (l.length > 100) return l; } catch (e) {}
  const j = await getJSON(`${API}/sets?pageSize=250&select=id,releaseDate`, opts);
  return (j.data || []).map(s => ({ id: s.id, rel: (s.releaseDate || '').replace(/\//g, '-') }));
}
// Last day a set was saved (this month or last), '' if never.
function lastSaved(dir, id, month, prevMonth) {
  for (const m of [month, prevMonth]) { try { const d = JSON.parse(fs.readFileSync(path.join(dir, m, id + '.json'), 'utf8')).days; if (d && d.length) return d[d.length - 1]; } catch (e) {} }
  return '';
}
// Order for one run: skip sets already saved today; sets released in the last 2 years first (most looked at), then the
// rest by how long since they were last saved, so a few runs a day (see prices.yml) cover every set.
export function planSets(list, { day, last }) {
  const recentFrom = String(+day.slice(0, 4) - 2) + day.slice(4);
  return list.filter(s => /^[a-z0-9.]+$/i.test(s.id) && last(s.id) !== day)
    .map(s => ({ ...s, recent: s.rel >= recentFrom ? 1 : 0, last: last(s.id) }))
    .sort((a, b) => b.recent - a.recent || a.last.localeCompare(b.last) || b.rel.localeCompare(a.rel))
    .map(s => s.id);
}

// One set per request (like the site itself): a bad set is retried at the end and then skipped, not fatal.
export async function snapshot({ dir = path.join(root, 'prices'), dataFile = path.join(root, 'data/tcg.json'), now = new Date(), key = process.env.POKEMONTCG_API_KEY, fetchImpl = fetch, delay, minCards = 5000, log = console.log, fast = false, budgetMs = 40 * 60e3 } = {}) {
  const stopAt = Date.now() + budgetMs; // stop starting new sets after this, and save what we have
  backoffScale = fast ? 0 : 1;
  const wait = delay ?? (key ? 300 : 2100); // no key: the API allows ~30 requests a minute
  const opts = { key, fetchImpl };
  const day = now.toISOString().slice(0, 10), month = day.slice(0, 7);
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  const all = await setList(opts, dataFile);
  const ids = planSets(all, { day, last: id => lastSaved(dir, id, month, prev) });
  log(`${ids.length} of ${all.length} sets to fetch today`);
  if (!ids.length) { log('every set is already saved today'); return { priced: 0, sets: 0, failed: [] }; }
  const bySet = {};
  let priced = 0, failed = [];
  const fetchSet = async id => {
    const out = {};
    for (let page = 1; ; page++) {
      const j = await getJSON(`${API}/cards?q=set.id:${id}&page=${page}&pageSize=250&select=id,tcgplayer`, opts);
      const data = Array.isArray(j && j.data) ? j.data : [];
      for (const c of data) { const v = usdPrice(c); if (v != null && c.id) out[c.id] = v; }
      if (!data.length || page * 250 >= (j.totalCount || 0)) break;
      await new Promise(res => setTimeout(res, wait));
    }
    return out;
  };
  for (const round of [ids, null]) {
    const list = round || failed; if (!round) failed = [];
    for (const id of list) {
      if (Date.now() > stopAt) { log(`time budget used up; ${list.length - list.indexOf(id)} sets not fetched today`); break; }
      try { const p = await fetchSet(id); if (Object.keys(p).length) { bySet[id] = p; priced += Object.keys(p).length; } }
      catch (e) { failed.push(id); log(`set ${id} failed (${e.message})${round ? ', will retry' : ', skipped today'}`); }
      await new Promise(res => setTimeout(res, wait));
    }
    if (!failed.length) break;
  }
  // API trouble: most sets failed, or a big run came back nearly empty. Fail the job (visible in Actions) and write nothing.
  if ((failed.length > 1 && failed.length >= ids.length / 2) || (ids.length >= 50 && priced < minCards)) throw new Error(`only ${priced} priced cards (${failed.length} of ${ids.length} sets failed); keeping the previous files`);
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
  fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify({ updated: now.toISOString(), months }) + '\n');
  log(`prices ${day}: ${priced} priced cards in ${Object.keys(bySet).length} of ${ids.length} sets fetched this run${failed.length ? `, ${failed.length} skipped: ${failed.join(' ')}` : ''}`);
  return { priced, sets: Object.keys(bySet).length, failed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  snapshot().catch(e => { console.error(e.message); process.exit(1); });
}
