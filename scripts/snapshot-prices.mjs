// Daily price snapshot for the card price-history sparklines. Reads every card's TCGplayer market price from the
// pokemontcg.io API (the same prices the TCG tab shows live) and appends today's value to one file per set per month:
//   prices/<YYYY-MM>/<setId>.json = {"days":["2026-10-15",...],"cards":{"<cardId>":[1.23,null,...]}}
//   prices/latest.json            = {"updated":"<ISO time>","months":{"<YYYY-MM>":["<setId>",...]}}
// Past months are never rewritten, so the repo only grows by one column a day. Prices only (numbers), no card text.
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

async function getPage(page, { key, fetchImpl }) {
  const url = `${API}/cards?page=${page}&pageSize=250&select=id,tcgplayer`;
  for (let a = 1; a <= 4; a++) {
    try {
      const r = await fetchImpl(url, { headers: key ? { 'X-Api-Key': key } : {}, signal: AbortSignal.timeout(60000) });
      if (!r.ok) throw new Error(r.status);
      return await r.json();
    } catch (e) { if (a === 4) throw new Error(`page ${page} failed (${e.message})`); await new Promise(res => setTimeout(res, 5000 * a)); }
  }
}

export async function snapshot({ dir = path.join(root, 'prices'), now = new Date(), key = process.env.POKEMONTCG_API_KEY, fetchImpl = fetch, delay, minCards = 5000, log = console.log } = {}) {
  const wait = delay ?? (key ? 300 : 2100); // no key: the API allows ~30 requests a minute
  const bySet = {};
  let total = Infinity, seen = 0, priced = 0;
  for (let page = 1; seen < total; page++) {
    const j = await getPage(page, { key, fetchImpl });
    if (!j || !Array.isArray(j.data) || !j.data.length) break;
    total = j.totalCount || 0; seen += j.data.length;
    for (const c of j.data) { const v = usdPrice(c); if (v == null || !c.id) continue; (bySet[setOf(c.id)] ||= {})[c.id] = v; priced++; }
    if (seen < total) await new Promise(res => setTimeout(res, wait));
  }
  if (priced < minCards) throw new Error(`only ${priced} priced cards (of ${seen}); keeping the previous files`);
  const day = now.toISOString().slice(0, 10), month = day.slice(0, 7);
  fs.mkdirSync(path.join(dir, month), { recursive: true });
  for (const [set, prices] of Object.entries(bySet)) {
    if (!/^[a-z0-9.]+$/i.test(set)) continue;
    const fp = path.join(dir, month, set + '.json');
    let old = null; try { old = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (e) {}
    fs.writeFileSync(fp, stringify(mergeDay(old, day, prices)));
  }
  const months = {};
  for (const m of fs.readdirSync(dir).filter(m => /^\d{4}-\d{2}$/.test(m)).sort())
    months[m] = fs.readdirSync(path.join(dir, m)).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).sort();
  fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify({ updated: now.toISOString(), months }) + '\n');
  log(`prices ${day}: ${priced} priced cards in ${Object.keys(bySet).length} sets (${seen} cards read)`);
  return { priced, sets: Object.keys(bySet).length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  snapshot().catch(e => { console.error(e.message); process.exit(1); });
}
