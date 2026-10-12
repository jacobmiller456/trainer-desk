// Downloads the open Pokémon TCG data (github.com/PokemonTCG/pokemon-tcg-data, the dataset behind pokemontcg.io) and
// writes data/tcg.json: English sets with a compact card list (facts + hotlinkable image URLs only; no flavor text,
// no attack text). Run weekly by .github/workflows/refresh-data.yml, or: node scripts/fetch-tcg-data.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/';
async function getJSON(rel) {
  for (let a = 1; a <= 3; a++) {
    try { const r = await fetch(BASE + rel); if (!r.ok) throw new Error(r.status); return await r.json(); }
    catch (e) { if (a === 3) throw new Error(`download failed: ${rel} (${e.message})`); await new Promise(res => setTimeout(res, 2000 * a)); }
  }
}
const sets = (await getJSON('sets/en.json')).sort((a, b) => a.releaseDate.localeCompare(b.releaseDate) || a.id.localeCompare(b.id));
const out = [];
for (let i = 0; i < sets.length; i += 6) {           // a few at a time, politely
  const batch = await Promise.all(sets.slice(i, i + 6).map(async s => {
    const cards = await getJSON(`cards/en/${s.id}.json`).catch(() => []);
    return {
      id: s.id, name: s.name, series: s.series, printedTotal: s.printedTotal || 0, total: s.total || cards.length,
      releaseDate: s.releaseDate.replace(/\//g, '-'), ptcgoCode: s.ptcgoCode || '',
      standard: s.legalities?.standard === 'Legal', expanded: s.legalities?.expanded === 'Legal',
      logo: s.images?.logo || '', symbol: s.images?.symbol || '',
      // [number, name, rarity, supertype, types, national dex no., small image, artist]
      cards: cards.map(c => [c.number || '', c.name || '', c.rarity || '', c.supertype || '', (c.types || []).join('/'),
        (c.nationalPokedexNumbers || [])[0] || 0, c.images?.small || '', c.artist || ''])
        .sort((a, b) => (parseInt(a[0], 10) || 1e9) - (parseInt(b[0], 10) || 1e9) || a[0].localeCompare(b[0]))
    };
  }));
  out.push(...batch);
}
if (out.length < 150 || out.filter(s => s.cards.length).length < 140) throw new Error('data looks incomplete; keeping the previous data/tcg.json');
fs.mkdirSync(path.join(root, 'data'), { recursive: true });
fs.writeFileSync(path.join(root, 'data/tcg.json'), JSON.stringify(out));
console.log(`wrote data/tcg.json: ${out.length} sets, ${out.reduce((n, s) => n + s.cards.length, 0)} cards`);
