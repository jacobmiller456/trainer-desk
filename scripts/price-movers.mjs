// Weekly price movers for the TCG tab: compares each card's latest saved TCGplayer price with its price about 7 days
// earlier (from prices/<month>/<set>.json) and writes prices/movers.json with the top risers and fallers. Card names,
// numbers, rarity and image URLs (hotlinked, never rehosted) come from data/tcg.json; nothing else is stored.
// Run by .github/workflows/prices.yml after each snapshot, or: node scripts/price-movers.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DAY = 864e5;

// All saved points per card across every month folder: {cardId: [[day, price], ...]} (oldest first)
export function loadHistory(dir) {
  const hist = {};
  const months = fs.readdirSync(dir).filter(m => /^\d{4}-\d{2}$/.test(m)).sort();
  for (const m of months) for (const f of fs.readdirSync(path.join(dir, m)).filter(f => f.endsWith('.json'))) {
    let j; try { j = JSON.parse(fs.readFileSync(path.join(dir, m, f), 'utf8')); } catch (e) { continue; }
    if (!Array.isArray(j.days) || !j.cards) continue;
    for (const [id, vals] of Object.entries(j.cards)) {
      if (!Array.isArray(vals)) continue;
      j.days.forEach((d, i) => { const v = vals[i]; if (typeof v === 'number' && v > 0) (hist[id] ||= []).push([d, v]); });
    }
  }
  for (const id in hist) hist[id].sort((a, b) => a[0].localeCompare(b[0]));
  return hist;
}

// minPrice: ignore cards under this at both ends (cheap cards swing wildly in % terms). window: days to look back.
export function computeMovers(hist, cardInfo, { window = 7, minPrice = 2, top = 40, minDays = 3 } = {}) {
  let latest = '';
  for (const pts of Object.values(hist)) if (pts.length && pts[pts.length - 1][0] > latest) latest = pts[pts.length - 1][0];
  if (!latest) return null;
  const from = new Date(Date.parse(latest + 'T00:00:00Z') - window * DAY).toISOString().slice(0, 10);
  const rows = [];
  for (const [id, pts] of Object.entries(hist)) {
    const end = pts[pts.length - 1]; if (end[0] !== latest) continue;          // must be priced today
    const start = pts.find(p => p[0] >= from); if (!start || start[0] === latest) continue;
    const span = Math.round((Date.parse(latest) - Date.parse(start[0])) / DAY); if (span < minDays) continue;
    if (Math.max(start[1], end[1]) < minPrice || Math.min(start[1], end[1]) <= 0) continue;
    const info = cardInfo[id]; if (!info) continue;
    const pct = (end[1] - start[1]) / start[1] * 100;
    if (!isFinite(pct) || Math.abs(pct) < 1) continue;
    rows.push({ id, ...info, from: start[1], to: end[1], pct: Math.round(pct * 10) / 10, since: start[0], pts: pts.filter(p => p[0] >= from).map(p => p[1]) });
  }
  const risers = rows.filter(r => r.pct > 0).sort((a, b) => b.pct - a.pct || b.to - a.to).slice(0, top);
  const fallers = rows.filter(r => r.pct < 0).sort((a, b) => a.pct - b.pct || b.from - a.from).slice(0, top);
  return { updated: latest, window, minPrice, considered: rows.length, risers, fallers };
}

// cardId -> {name, set, setName, num, rarity, img} from data/tcg.json (facts + hotlinkable image URL only)
export function cardInfoFrom(tcg) {
  const out = {};
  for (const s of tcg) for (const c of s.cards || []) {
    const [num, name, rarity, , , , img] = c;
    out[`${s.id}-${num}`] = { name, set: s.id, setName: s.name, num, rarity: rarity || '', img: img || '' };
  }
  return out;
}

export function run({ dir = path.join(root, 'prices'), dataFile = path.join(root, 'data/tcg.json'), log = console.log } = {}) {
  const hist = loadHistory(dir);
  const info = cardInfoFrom(JSON.parse(fs.readFileSync(dataFile, 'utf8')));
  const m = computeMovers(hist, info);
  if (!m || !m.considered) { log('not enough price history for movers yet'); return null; }
  fs.writeFileSync(path.join(dir, 'movers.json'), JSON.stringify(m) + '\n');
  log(`movers ${m.updated}: ${m.risers.length} risers, ${m.fallers.length} fallers from ${m.considered} cards`);
  return m;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run();
