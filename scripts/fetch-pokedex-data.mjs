// Downloads PokéAPI's open data files (CSV, from github.com/PokeAPI/pokeapi) and writes data/pokedex.json:
// one record of facts per species (default form). Run weekly by .github/workflows/refresh-data.yml, or by hand:
//   node scripts/fetch-pokedex-data.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/';
const EN = '9';

function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter(r => r.length > 1 || r[0]);
  return body.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}
async function get(name) {
  for (let a = 1; a <= 3; a++) {
    try {
      const r = await fetch(BASE + name + '.csv');
      if (!r.ok) throw new Error(r.status);
      return parseCSV(await r.text());
    } catch (e) { if (a === 3) throw new Error(`download failed: ${name}.csv (${e.message})`); await new Promise(res => setTimeout(res, 2000 * a)); }
  }
}

const [species, pokemon, ptypes, types, pstats, stats, pabil, abilNames, spNames, colors, habitats] = await Promise.all(
  ['pokemon_species', 'pokemon', 'pokemon_types', 'types', 'pokemon_stats', 'stats', 'pokemon_abilities', 'ability_names', 'pokemon_species_names', 'pokemon_colors', 'pokemon_habitats'].map(get));

const byId = (rows, key = 'id') => new Map(rows.map(r => [r[key], r]));
const typeName = byId(types), statName = byId(stats), colorName = byId(colors), habitatName = byId(habitats);
const abilityName = new Map(abilNames.filter(r => r.local_language_id === EN).map(r => [r.ability_id, r.name]));
const enNames = new Map(spNames.filter(r => r.local_language_id === EN).map(r => [r.pokemon_species_id, r]));
const defaultForm = new Map(pokemon.filter(p => p.is_default === '1').map(p => [p.species_id, p]));
const group = (rows, key) => rows.reduce((m, r) => (m.get(r[key]) || m.set(r[key], []).get(r[key])).push(r) && m, new Map());
const typesOf = group(ptypes, 'pokemon_id'), statsOf = group(pstats, 'pokemon_id'), abilOf = group(pabil, 'pokemon_id');

const out = species.map(s => {
  const p = defaultForm.get(s.id); if (!p) return null;
  const n = enNames.get(s.id) || {};
  const st = {}; (statsOf.get(p.id) || []).forEach(x => { st[statName.get(x.stat_id).identifier] = +x.base_stat; });
  return {
    id: +s.id, slug: s.identifier, name: n.name || s.identifier, genus: n.genus || '',
    gen: +s.generation_id,
    types: (typesOf.get(p.id) || []).sort((a, b) => a.slot - b.slot).map(t => typeName.get(t.type_id).identifier),
    stats: st,
    abilities: (abilOf.get(p.id) || []).sort((a, b) => a.slot - b.slot).map(a => ({ name: abilityName.get(a.ability_id) || a.ability_id, hidden: a.is_hidden === '1' })),
    height: +p.height / 10, weight: +p.weight / 10,
    legendary: s.is_legendary === '1', mythical: s.is_mythical === '1', baby: s.is_baby === '1',
    evolvesFrom: s.evolves_from_species_id ? +s.evolves_from_species_id : null, chain: +s.evolution_chain_id,
    color: (colorName.get(s.color_id) || {}).identifier || '', habitat: (habitatName.get(s.habitat_id) || {}).identifier || '',
    captureRate: +s.capture_rate
  };
}).filter(Boolean).sort((a, b) => a.id - b.id);

if (out.length < 1000 || out.some(p => !p.types.length || !p.stats.hp)) throw new Error('data looks incomplete; keeping the previous data/pokedex.json');
fs.mkdirSync(path.join(root, 'data'), { recursive: true });
fs.writeFileSync(path.join(root, 'data/pokedex.json'), JSON.stringify(out));
console.log(`wrote data/pokedex.json: ${out.length} species`);
