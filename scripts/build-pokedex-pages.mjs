// Builds one static page per Pokémon (pokedex/<slug>.html) from data/pokedex.json, plus sitemap.xml.
// Pages are plain HTML (no JavaScript needed to read them) so search engines and link previews see everything.
// Facts only: no Pokédex flavor text; sprites are hotlinked from PokéAPI's sprite repo (SHOW_SPRITES in index.html).
//   node scripts/build-pokedex-pages.mjs          regenerate
//   node scripts/build-pokedex-pages.mjs --check  exit 1 if pages/sitemap are out of date (npm test / CI)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://www.trainerdesk.net';
const dex = JSON.parse(fs.readFileSync(path.join(root, 'data/pokedex.json'), 'utf8'));
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const SHOW_SPRITES = /const SHOW_SPRITES=true/.test(indexHtml);
const ROUTES = Function('return ' + indexHtml.match(/const ROUTES=(\{[\s\S]*?\n\});/)[1])();

const REGION = { 1: 'Kanto', 2: 'Johto', 3: 'Hoenn', 4: 'Sinnoh', 5: 'Unova', 6: 'Kalos', 7: 'Alola', 8: 'Galar', 9: 'Paldea' };
const TYPE_COLORS = { normal: '#A8A77A', fire: '#EE8130', water: '#6390F0', electric: '#F7D02C', grass: '#7AC74C', ice: '#96D9D6', fighting: '#C22E28', poison: '#A33EA1', ground: '#E2BF65', flying: '#A98FF3', psychic: '#F95587', bug: '#A6B91A', rock: '#B6A136', ghost: '#735797', dragon: '#6F35FC', dark: '#705746', steel: '#B7B7CE', fairy: '#D685AD' };
const STAT = [['hp', 'HP'], ['attack', 'Attack'], ['defense', 'Defense'], ['special-attack', 'Sp. Atk'], ['special-defense', 'Sp. Def'], ['speed', 'Speed']];
// Attacking type -> defending types: double / half / no damage (standard chart).
const CHART = {
  normal: { half: ['rock', 'steel'], zero: ['ghost'] }, fire: { dbl: ['grass', 'ice', 'bug', 'steel'], half: ['fire', 'water', 'rock', 'dragon'] },
  water: { dbl: ['fire', 'ground', 'rock'], half: ['water', 'grass', 'dragon'] }, electric: { dbl: ['water', 'flying'], half: ['electric', 'grass', 'dragon'], zero: ['ground'] },
  grass: { dbl: ['water', 'ground', 'rock'], half: ['fire', 'grass', 'poison', 'flying', 'bug', 'dragon', 'steel'] }, ice: { dbl: ['grass', 'ground', 'flying', 'dragon'], half: ['fire', 'water', 'ice', 'steel'] },
  fighting: { dbl: ['normal', 'ice', 'rock', 'dark', 'steel'], half: ['poison', 'flying', 'psychic', 'bug', 'fairy'], zero: ['ghost'] }, poison: { dbl: ['grass', 'fairy'], half: ['poison', 'ground', 'rock', 'ghost'], zero: ['steel'] },
  ground: { dbl: ['fire', 'electric', 'poison', 'rock', 'steel'], half: ['grass', 'bug'], zero: ['flying'] }, flying: { dbl: ['grass', 'fighting', 'bug'], half: ['electric', 'rock', 'steel'] },
  psychic: { dbl: ['fighting', 'poison'], half: ['psychic', 'steel'], zero: ['dark'] }, bug: { dbl: ['grass', 'psychic', 'dark'], half: ['fire', 'fighting', 'poison', 'flying', 'ghost', 'steel', 'fairy'] },
  rock: { dbl: ['fire', 'ice', 'flying', 'bug'], half: ['fighting', 'ground', 'steel'] }, ghost: { dbl: ['psychic', 'ghost'], half: ['dark'], zero: ['normal'] },
  dragon: { dbl: ['dragon'], half: ['steel'], zero: ['fairy'] }, dark: { dbl: ['psychic', 'ghost'], half: ['fighting', 'dark', 'fairy'] },
  steel: { dbl: ['ice', 'rock', 'fairy'], half: ['fire', 'water', 'electric', 'steel'] }, fairy: { dbl: ['fighting', 'dragon', 'dark'], half: ['fire', 'poison', 'steel'] }
};
const TYPES = Object.keys(CHART);
function matchups(def) {
  const out = {};
  for (const atk of TYPES) {
    let m = 1; const c = CHART[atk];
    for (const t of def) { if (c.zero?.includes(t)) m *= 0; else if (c.dbl?.includes(t)) m *= 2; else if (c.half?.includes(t)) m *= 0.5; }
    out[atk] = m;
  }
  return out;
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const pad = n => String(n).padStart(3, '0');
const list = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
const typeLabel = p => p.types.map(cap).join('/');
const an = w => /^[aeiou]/i.test(w) ? 'an' : 'a';
const sprite = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
const byId = new Map(dex.map(p => [p.id, p]));
const byChain = dex.reduce((m, p) => (m.get(p.chain) || m.set(p.chain, []).get(p.chain)).push(p) && m, new Map());
const trim = (s, n) => s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…';
const badge = t => `<span class="type" style="background:${TYPE_COLORS[t] || '#888'}">${esc(cap(t))}</span>`;
const link = p => `<a href="/pokedex/${p.slug}">${esc(p.name)}</a>`;

function evolutionStages(p) {
  const members = byChain.get(p.chain) || [p];
  const depth = q => { let d = 0, c = q; while (c.evolvesFrom && byId.has(c.evolvesFrom) && d < 5) { c = byId.get(c.evolvesFrom); d++; } return d; };
  const stages = [];
  members.forEach(q => { const d = depth(q); (stages[d] = stages[d] || []).push(q); });
  return stages.filter(Boolean).map(s => s.sort((a, b) => a.id - b.id));
}

function page(p) {
  const total = STAT.reduce((n, [k]) => n + (p.stats[k] || 0), 0);
  const top = STAT.reduce((a, b) => (p.stats[b[0]] || 0) > (p.stats[a[0]] || 0) ? b : a);
  const region = REGION[p.gen] || `Generation ${p.gen}`;
  const m = matchups(p.types);
  const weak = TYPES.filter(t => m[t] > 1).sort((a, b) => m[b] - m[a]);
  const resist = TYPES.filter(t => m[t] > 0 && m[t] < 1);
  const immune = TYPES.filter(t => m[t] === 0);
  const from = p.evolvesFrom && byId.get(p.evolvesFrom);
  const into = dex.filter(q => q.evolvesFrom === p.id);
  const stages = evolutionStages(p);
  const status = p.mythical ? 'Mythical Pokémon' : p.legendary ? 'Legendary Pokémon' : p.baby ? 'Baby Pokémon' : '';
  const abil = p.abilities.map(a => a.name + (a.hidden ? ' (hidden)' : ''));

  const title0 = `${p.name} (#${pad(p.id)}) Pokédex: Type, Stats & Weaknesses | Trainer Desk`;
  const title = title0.length <= 65 ? title0 : `${p.name} (#${pad(p.id)}): Type, Stats & Weaknesses`;
  const desc = trim(`${p.name} is ${an(typeLabel(p))} ${typeLabel(p)}-type ${p.genus || 'Pokémon'} from ${region}. Base stat total ${total}${weak.length ? `; weak to ${list(weak.slice(0, 3).map(cap))}` : ''}. Abilities: ${abil.join(', ')}.`, 160);
  const url = `${SITE}/pokedex/${p.slug}`;
  const intro = `${p.name} is ${an(typeLabel(p))} ${typeLabel(p)}-type ${p.genus || 'Pokémon'} first found in ${region} (Generation ${p.gen})${status ? `, and is classed as a ${status}` : ''}. ` +
    `It stands ${p.height} m tall and weighs ${p.weight} kg. ` +
    (from ? `It evolves from ${from.name}${into.length ? ` and into ${list(into.map(q => q.name))}` : ''}. ` : into.length ? `It evolves into ${list(into.map(q => q.name))}. ` : 'It does not evolve. ') +
    `Its highest base stat is ${top[1]} (${p.stats[top[0]]}), with a base stat total of ${total}.`;
  const prev = byId.get(p.id - 1), next = byId.get(p.id + 1);
  const sameType = dex.filter(q => q.id !== p.id && q.types[0] === p.types[0]).sort((a, b) => Math.abs(a.id - p.id) - Math.abs(b.id - p.id)).slice(0, 8).sort((a, b) => a.id - b.id);
  const ld = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Trainer Desk', item: SITE + '/' },
    { '@type': 'ListItem', position: 2, name: 'Pokédex', item: SITE + '/pokedex' },
    { '@type': 'ListItem', position: 3, name: p.name, item: url }] };
  const img = SITE + '/assets/' + ROUTES.dex.img;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<!-- GENERATED by scripts/build-pokedex-pages.mjs from data/pokedex.json. Do not edit by hand. -->
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#1B4332">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Trainer Desk">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${img}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="stylesheet" href="/assets/dex-page.css">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<!-- Analytics only if the visitor already accepted cookies on the main site (Consent Mode: denied by default) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-S7NHPZKHJQ"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});try{if(localStorage.getItem('td-cookie-consent')==='granted')gtag('consent','update',{analytics_storage:'granted'});}catch(e){}gtag('js',new Date());gtag('config','G-S7NHPZKHJQ');</script>
</head>
<body>
<header><nav class="wrap" aria-label="Site">
  <a class="logo" href="/"><span class="mark" aria-hidden="true">✦</span> TRAINER DESK</a>
  <span class="links"><a href="/go">GO</a><a href="/tcg">TCG</a><a href="/pokedex" aria-current="page">DEX</a><a href="/arena">ARENA</a></span>
</nav></header>
<main class="wrap">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › <a href="/pokedex">Pokédex</a> › <span>${esc(p.name)}</span></nav>
  <section class="hero box">
    ${SHOW_SPRITES ? `<img class="sprite" src="${sprite(p.id)}" alt="${esc(p.name)} sprite" width="160" height="160">` : `<span class="sprite mono" aria-hidden="true" style="background:${TYPE_COLORS[p.types[0]]}">${esc(p.name.charAt(0))}</span>`}
    <div>
      <p class="num">#${pad(p.id)}${p.genus ? ' · ' + esc(p.genus) : ''}</p>
      <h1>${esc(p.name)}</h1>
      <p class="types">${p.types.map(badge).join(' ')}</p>
      <p class="meta">${esc(region)} · Generation ${p.gen}${status ? ' · ' + esc(status) : ''}</p>
    </div>
  </section>
  <p class="intro">${esc(intro)}</p>

  <section class="box">
    <h2>Base stats</h2>
    <table class="stats">
      ${STAT.map(([k, l]) => { const v = p.stats[k] || 0; return `<tr><th scope="row">${l}</th><td class="v">${v}</td><td class="bar"><span style="width:${Math.min(100, Math.round(v / 255 * 100))}%"></span></td></tr>`; }).join('\n      ')}
      <tr class="total"><th scope="row">Total</th><td class="v">${total}</td><td></td></tr>
    </table>
  </section>

  <section class="box">
    <h2>Type matchups</h2>
    <p><b>Weak to:</b> ${weak.length ? weak.map(t => badge(t) + (m[t] === 4 ? '<small>×4</small>' : '')).join(' ') : 'nothing'}</p>
    <p><b>Resists:</b> ${resist.length ? resist.map(t => badge(t) + (m[t] === 0.25 ? '<small>×¼</small>' : '')).join(' ') : 'nothing'}</p>
    ${immune.length ? `<p><b>Immune to:</b> ${immune.map(badge).join(' ')}</p>` : ''}
  </section>

  <section class="box two">
    <div>
      <h2>Abilities</h2>
      <ul>${p.abilities.map(a => `<li>${esc(a.name)}${a.hidden ? ' <small>(hidden ability)</small>' : ''}</li>`).join('')}</ul>
    </div>
    <div>
      <h2>Size</h2>
      <ul><li>Height: ${p.height} m</li><li>Weight: ${p.weight} kg</li>${p.habitat ? `<li>Habitat: ${esc(cap(p.habitat.replace(/-/g, ' ')))}</li>` : ''}<li>Catch rate: ${p.captureRate}</li></ul>
    </div>
  </section>

  <section class="box">
    <h2>Evolution</h2>
    ${stages.length > 1 ? `<ol class="evo">${stages.map(s => `<li>${s.map(q => q.id === p.id ? `<b>${esc(q.name)}</b>` : link(q)).join(' / ')}</li>`).join('')}</ol>` : `<p>${esc(p.name)} does not evolve.</p>`}
  </section>

  <nav class="pager" aria-label="Pokédex order">
    ${prev ? `<a href="/pokedex/${prev.slug}">← #${pad(prev.id)} ${esc(prev.name)}</a>` : '<span></span>'}
    ${next ? `<a href="/pokedex/${next.slug}">#${pad(next.id)} ${esc(next.name)} →</a>` : '<span></span>'}
  </nav>

  <section class="box">
    <h2>More ${esc(cap(p.types[0]))}-type Pokémon</h2>
    <p class="related">${sameType.map(link).join(' ')}</p>
  </section>

  <p class="cta"><a class="btn" href="/pokedex">Open the interactive Pokédex</a><a class="btn" href="/arena">Play Pixel Arena</a><a class="btn" href="/">Today's events</a></p>
</main>
<footer class="wrap">
  Trainer Desk is an unofficial fan project, not affiliated with, endorsed, sponsored, or approved by Nintendo, Game Freak, Creatures Inc., or The Pokémon Company International.
  Pokémon and all related names are trademarks of their respective owners. Data from <a href="https://pokeapi.co">PokéAPI</a>; sprites are linked from PokéAPI's sprite repository and belong to their respective owners.
</footer>
</body>
</html>
`;
}

function sitemap() {
  const urls = [...Object.values(ROUTES).map(r => [r.path, r.path === '/' ? '1.0' : '0.8', 'daily']), ...dex.map(p => ['/pokedex/' + p.slug, '0.6', 'monthly'])];
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(([u, pr, f]) => `  <url><loc>${SITE}${u}</loc><changefreq>${f}</changefreq><priority>${pr}</priority></url>\n`).join('') + '</urlset>\n';
}

const check = process.argv.includes('--check');
const files = new Map(dex.map(p => [path.join('pokedex', p.slug + '.html'), page(p)]));
files.set('sitemap.xml', sitemap());
const stale = [];
if (!check) fs.mkdirSync(path.join(root, 'pokedex'), { recursive: true });
for (const [rel, html] of files) {
  const f = path.join(root, rel);
  if (check) { if (!fs.existsSync(f) || fs.readFileSync(f, 'utf8') !== html) stale.push(rel); }
  else fs.writeFileSync(f, html);
}
if (check) {
  const extra = fs.existsSync(path.join(root, 'pokedex')) ? fs.readdirSync(path.join(root, 'pokedex')).filter(n => !files.has(path.join('pokedex', n))) : [];
  if (stale.length || extra.length) { console.error(`Pokédex pages out of date (${stale.length} changed, ${extra.length} extra) — run: npm run dex-pages`); process.exit(1); }
  console.log(`pokedex pages up to date (${dex.length})`);
} else console.log(`wrote ${dex.length} pages in pokedex/ and sitemap.xml`);
