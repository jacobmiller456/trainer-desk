// Saves a facts-only snapshot of the community ScrapedDuck GO event feed to data/events.json for the static event pages
// (go/<eventID>.html, built by scripts/build-pages.mjs). Keeps: id, name, type, start/end, raid boss and Spotlight names,
// the Spotlight bonus line. No article text, images or links. Run daily by .github/workflows/event-pages.yml, or:
//   node scripts/fetch-events.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URLS = ['https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.json', 'https://cdn.jsdelivr.net/gh/bigfoott/ScrapedDuck@data/events.json'];
const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const names = a => (Array.isArray(a) ? a : []).map(o => str(o && o.name, 60)).filter(Boolean).slice(0, 12);

let feed = null, err = null;
for (const u of URLS) {
  try { const r = await fetch(u, { signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error(r.status); const j = await r.json(); if (Array.isArray(j) && j.length) { feed = j; break; } }
  catch (e) { err = e; }
}
if (!feed) { console.error('event feed unavailable; keeping the previous data/events.json', err && err.message); process.exit(1); }

const events = feed.map(e => {
  const x = e.extraData || {}, sp = x.spotlight;
  return {
    id: str(e.eventID, 120).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, ''),
    name: str(e.name, 160), type: str(e.eventType, 40) || 'event',
    start: str(e.start, 30) || null, end: str(e.end, 30) || null,
    bosses: names(x.raidbattles && x.raidbattles.bosses),
    spotlight: sp && typeof sp === 'object' ? { mons: names(Array.isArray(sp.list) && sp.list.length ? sp.list : [sp]), bonus: str(sp.bonus, 80) } : null,
  };
}).filter(e => e.id && e.name && e.start && e.end).sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));

// keep events that ended in the last 30 days (the feed drops them at the end) so their guide pages stay up for a while
const out = path.join(root, 'data/events.json'), todayStr = new Date().toISOString().slice(0, 10);
try {
  const prev = JSON.parse(fs.readFileSync(out, 'utf8')).events || [], have = new Set(events.map(e => e.id));
  const cutoff = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  for (const e of prev) if (!have.has(e.id) && String(e.end).slice(0, 10) >= cutoff) events.push(e);
  events.sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
} catch (e) { /* first run */ }
fs.mkdirSync(path.join(root, 'data'), { recursive: true });
fs.writeFileSync(path.join(root, 'data/events.json'), JSON.stringify({ fetchedAt: todayStr, events }, null, 1) + '\n');
console.log(`wrote data/events.json: ${events.length} events`);
