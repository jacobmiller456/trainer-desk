// Builds the static, plain-HTML pages that sit alongside the app (no JavaScript needed to read them):
//   pokedex/<slug>.html  one page per Pokémon      (data/pokedex.json, from PokéAPI's open data)
//   tcg/<slug>.html      one page per English set  (data/tcg.json, from the open Pokémon TCG data)
//   tcg/sets.html        index of every set, plus sitemap.xml
// Facts only: no flavor text or attack text; sprites and card images are hotlinked, never copied.
//   node scripts/build-pages.mjs          regenerate
//   node scripts/build-pages.mjs --check  exit 1 if anything is out of date (npm test / CI)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://www.trainerdesk.net';
const dex = JSON.parse(fs.readFileSync(path.join(root, 'data/pokedex.json'), 'utf8'));
const tcg = JSON.parse(fs.readFileSync(path.join(root, 'data/tcg.json'), 'utf8'));
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

function doc({ title, desc, url, ld, img, current, ogType, body }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<!-- GENERATED by scripts/build-pages.mjs from data/. Do not edit by hand. -->
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#1B4332">
<meta property="og:type" content="${ogType || 'website'}">
<meta property="og:site_name" content="Trainer Desk">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${SITE}/assets/${img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${SITE}/assets/${img}">
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
  <span class="links">${[['go','/go','GO'],['tcg','/tcg','TCG'],['dex','/pokedex','DEX'],['arena','/arena','ARENA']].map(([k,h,l])=>`<a href="${h}"${k===current?' aria-current="page"':''}>${l}</a>`).join('')}</span>
</nav></header>
${body}
<footer class="wrap">
  Trainer Desk is an unofficial fan project, not affiliated with, endorsed, sponsored, or approved by Nintendo, Game Freak, Creatures Inc., or The Pokémon Company International.
  Pokémon and all related names are trademarks of their respective owners. Data from <a href="https://pokeapi.co">PokéAPI</a>; sprites are linked from PokéAPI's sprite repository and belong to their respective owners.
</footer>
</body>
</html>
`;
}

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
  
  return doc({ title, desc, url, ld, img: ROUTES.dex.img, current: 'dex', ogType: 'article', body: `<main class="wrap">
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

${cardsSection(p)}
  <nav class="pager" aria-label="Pokédex order">
    ${prev ? `<a href="/pokedex/${prev.slug}">← #${pad(prev.id)} ${esc(prev.name)}</a>` : '<span></span>'}
    ${next ? `<a href="/pokedex/${next.slug}">#${pad(next.id)} ${esc(next.name)} →</a>` : '<span></span>'}
  </nav>

  <section class="box">
    <h2>More ${esc(cap(p.types[0]))}-type Pokémon</h2>
    <p class="related">${sameType.map(link).join(' ')}</p>
  </section>

  <p class="cta"><a class="btn" href="/pokedex">Open the interactive Pokédex</a><a class="btn" href="/arena">Play Pixel Arena</a><a class="btn" href="/">Today's events</a></p>
</main>` });
}


// ---------- TCG ----------
const slugify = t => t.toLowerCase().replace(/['’]/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const setSlug = new Map();
{ const seen = new Set(['sets']); for (const s of tcg) { let sl = slugify(s.name) || s.id; if (seen.has(sl)) sl = sl + '-' + s.id; seen.add(sl); setSlug.set(s.id, sl); } }
const dexSlug = new Map(dex.map(p => [p.id, p.slug]));
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmtDate = d => { const [y, m, dd] = d.split('-').map(Number); return `${MONTHS[m - 1]} ${dd}, ${y}`; };
const setLink = s => `<a href="/tcg/${setSlug.get(s.id)}">${esc(s.name)}</a>`;
// cards per Pokédex number, newest set first
const cardsByDex = new Map();
for (const s of [...tcg].reverse()) for (const c of s.cards) if (c[5]) { const a = cardsByDex.get(c[5]) || cardsByDex.set(c[5], []).get(c[5]); a.push(s); }
function cardsSection(p) {
  const sets = cardsByDex.get(p.id); if (!sets || !sets.length) return '';
  const counts = new Map(); sets.forEach(s => counts.set(s, (counts.get(s) || 0) + 1));
  const top = [...counts.keys()].slice(0, 12);
  return `
  <section class="box">
    <h2>${esc(p.name)} Pokémon TCG cards</h2>
    <p>${esc(p.name)} appears on ${sets.length} English card${sets.length === 1 ? '' : 's'} across ${counts.size} set${counts.size === 1 ? '' : 's'}. Most recent:</p>
    <p class="related">${top.map(s => `${setLink(s)}<small>${counts.get(s) > 1 ? '×' + counts.get(s) : ''}</small>`).join(' ')}</p>
  </section>
`;
}
function setPage(s, i) {
  const url = `${SITE}/tcg/${setSlug.get(s.id)}`;
  const n = s.cards.length, secret = Math.max(0, (s.total || n) - (s.printedTotal || 0));
  const by = (k, f = x => x) => s.cards.reduce((m, c) => { const v = f(c[k]); if (v) m.set(v, (m.get(v) || 0) + 1); return m; }, new Map());
  const rar = [...by(2)].sort((a, b) => b[1] - a[1]);
  const sup = by(3);
  const types = [...by(4, v => v.split('/')[0])].sort((a, b) => b[1] - a[1]);
  const artists = [...by(7)].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const legal = s.standard ? 'legal in the Standard and Expanded formats' : s.expanded ? 'legal in the Expanded format (rotated out of Standard)' : 'not legal in Standard or Expanded';
  const y = s.releaseDate.slice(0, 4), mon = MONTHS[+s.releaseDate.slice(5, 7) - 1];
  const intro = `${s.name} is a Pokémon TCG expansion in the ${s.series} series, released in English on ${fmtDate(s.releaseDate)}. ` +
    (s.printedTotal && secret ? `Its main set has ${s.printedTotal} cards, plus ${secret} secret rare${secret === 1 ? '' : 's'} numbered beyond the set (${s.total} in total). ` : `It has ${s.total || n} cards. `) +
    `It includes ${sup.get('Pokémon') || 0} Pokémon, ${sup.get('Trainer') || 0} Trainer and ${sup.get('Energy') || 0} Energy cards, and is ${legal}.`;
  const t0 = `${s.name} Set List & Card Checklist | Trainer Desk`;
  const title = t0.length <= 65 ? t0 : (`${s.name}: Pokémon TCG Card List`.length <= 65 ? `${s.name}: Pokémon TCG Card List` : trim(s.name, 50) + ' Card List');
  const desc = trim(`${s.name}${s.ptcgoCode ? ` (${s.ptcgoCode})` : ''} is a ${s.series} Pokémon TCG set released ${mon} ${y} with ${s.total || n} cards. Full checklist with rarities, card images and live market prices.`, 160);
  const series = tcg.filter(x => x.series === s.series);
  const prev = tcg[i - 1], next = tcg[i + 1];
  const ld = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Trainer Desk', item: SITE + '/' },
    { '@type': 'ListItem', position: 2, name: 'Pokémon TCG sets', item: SITE + '/tcg/sets' },
    { '@type': 'ListItem', position: 3, name: s.name, item: url }] };
  const card = c => {
    const name = c[5] && dexSlug.has(c[5]) && c[3] === 'Pokémon' ? `<a href="/pokedex/${dexSlug.get(c[5])}">${esc(c[1])}</a>` : esc(c[1]);
    return `<li>${c[6] ? `<img src="${esc(c[6])}" alt="${esc(c[1])} #${esc(c[0])}" loading="lazy" decoding="async" width="245" height="342">` : '<span class="noimg"></span>'}<span class="cn">#${esc(c[0])}</span> ${name}${c[2] ? `<small>${esc(c[2])}</small>` : ''}</li>`;
  };
  return doc({ title, desc, url, ld, img: ROUTES.tcg.img, current: 'tcg', body: `<main class="wrap">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › <a href="/tcg/sets">Pokémon TCG sets</a> › <span>${esc(s.name)}</span></nav>
  <section class="hero box">
    ${s.logo ? `<img class="logo-img" src="${esc(s.logo)}" alt="${esc(s.name)} logo" width="240" height="90">` : ''}
    <div>
      <p class="num">${esc(s.series)} series${s.ptcgoCode ? ' · ' + esc(s.ptcgoCode) : ''}</p>
      <h1>${esc(s.name)}</h1>
      <p class="meta">Released ${fmtDate(s.releaseDate)} · ${s.total || n} cards</p>
      <p class="types">${s.standard ? '<span class="type legal">Standard</span>' : ''}${s.expanded ? '<span class="type legal">Expanded</span>' : ''}</p>
    </div>
  </section>
  <p class="intro">${esc(intro)}</p>
  <p class="cta"><a class="btn" href="/tcg?set=${encodeURIComponent(s.id)}">See live prices &amp; add cards to your binder</a></p>

  <section class="box two">
    <div>
      <h2>Cards by rarity</h2>
      <table class="stats">${rar.map(([r, c]) => `<tr><th scope="row">${esc(r)}</th><td class="v">${c}</td></tr>`).join('')}</table>
    </div>
    <div>
      <h2>Pokémon by type</h2>
      <p>${types.map(([t, c]) => `<span class="type" style="background:${TYPE_COLORS[t.toLowerCase()] || (t === 'Colorless' ? '#A8A77A' : t === 'Lightning' ? '#F7D02C' : t === 'Darkness' ? '#705746' : t === 'Metal' ? '#B7B7CE' : '#888')}">${esc(t)} ${c}</span>`).join(' ') || 'None'}</p>
    </div>
  </section>

  <section class="box">
    <h2>${esc(s.name)} card list</h2>
    <ul class="cards">${s.cards.map(card).join('')}</ul>
  </section>

  ${artists.length ? `<section class="box"><h2>Illustrators</h2><p>${artists.length} illustrator${artists.length === 1 ? '' : 's'} worked on ${esc(s.name)}. Most cards: ${esc(artists.slice(0, 8).map(([a, c]) => `${a} (${c})`).join(', '))}.</p></section>` : ''}

  <nav class="pager" aria-label="Release order">
    ${prev ? `<a href="/tcg/${setSlug.get(prev.id)}">← ${esc(prev.name)}</a>` : '<span></span>'}
    ${next ? `<a href="/tcg/${setSlug.get(next.id)}">${esc(next.name)} →</a>` : '<span></span>'}
  </nav>
  <section class="box">
    <h2>More ${esc(s.series)} sets</h2>
    <p class="related">${series.filter(x => x !== s).map(setLink).join(' ') || 'None'}</p>
    <p><a href="/tcg/sets">All Pokémon TCG sets →</a></p>
  </section>
</main>` });
}
function setsIndex() {
  const bySeries = new Map();
  for (const s of [...tcg].reverse()) (bySeries.get(s.series) || bySeries.set(s.series, []).get(s.series)).push(s);
  const url = SITE + '/tcg/sets';
  const ld = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Trainer Desk', item: SITE + '/' },
    { '@type': 'ListItem', position: 2, name: 'Pokémon TCG sets', item: url }] };
  return doc({ title: 'All Pokémon TCG Sets: Release Dates & Card Lists | Trainer Desk',
    desc: `Every English Pokémon TCG set from Base Set to ${tcg[tcg.length - 1].name}: ${tcg.length} sets with release dates, card counts and full card checklists.`,
    url, ld, img: ROUTES.tcg.img, current: 'tcg', body: `<main class="wrap">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › <span>Pokémon TCG sets</span></nav>
  <h1 class="page-h1">All Pokémon TCG sets</h1>
  <p class="intro">${tcg.length} English Pokémon TCG sets, newest first, grouped by series. Each set page has the full card list with rarities and images; open the <a href="/tcg">TCG browser</a> for live market prices and your binder.</p>
  ${[...bySeries].map(([series, sets]) => `<section class="box"><h2>${esc(series)}</h2><ul class="setlist">${sets.map(s => `<li>${setLink(s)}<small>${fmtDate(s.releaseDate)} · ${s.total || s.cards.length} cards</small></li>`).join('')}</ul></section>`).join('\n  ')}
</main>` });
}

function sitemap() {
  const urls = [...Object.values(ROUTES).map(r => [r.path, r.path === '/' ? '1.0' : '0.8', 'daily']), ...dex.map(p => ['/pokedex/' + p.slug, '0.6', 'monthly']), ['/tcg/sets', '0.7', 'weekly'], ...[...tcg].reverse().map(t => ['/tcg/' + setSlug.get(t.id), '0.6', 'weekly'])];
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(([u, pr, f]) => `  <url><loc>${SITE}${u}</loc><changefreq>${f}</changefreq><priority>${pr}</priority></url>\n`).join('') + '</urlset>\n';
}

const check = process.argv.includes('--check');
const files = new Map(dex.map(p => [path.join('pokedex', p.slug + '.html'), page(p)]));
tcg.forEach((t, i) => files.set(path.join('tcg', setSlug.get(t.id) + '.html'), setPage(t, i)));
files.set(path.join('tcg', 'sets.html'), setsIndex());
files.set('sitemap.xml', sitemap());
const stale = [];
if (!check) { fs.mkdirSync(path.join(root, 'pokedex'), { recursive: true }); fs.mkdirSync(path.join(root, 'tcg'), { recursive: true }); }
for (const [rel, html] of files) {
  const f = path.join(root, rel);
  if (check) { if (!fs.existsSync(f) || fs.readFileSync(f, 'utf8') !== html) stale.push(rel); }
  else fs.writeFileSync(f, html);
}
if (!check) for (const d of ['pokedex', 'tcg']) for (const n of fs.readdirSync(path.join(root, d))) if (!files.has(path.join(d, n))) fs.unlinkSync(path.join(root, d, n));
if (check) {
  const extra = ['pokedex', 'tcg'].flatMap(d => fs.existsSync(path.join(root, d)) ? fs.readdirSync(path.join(root, d)).filter(n => !files.has(path.join(d, n))) : []);
  if (stale.length || extra.length) { console.error(`Static pages out of date (${stale.length} changed, ${extra.length} extra) — run: npm run static-pages`); process.exit(1); }
  console.log(`static pages up to date (${dex.length} Pokémon, ${tcg.length} sets)`);
} else console.log(`wrote ${dex.length} Pokémon pages, ${tcg.length} set pages, the set index and sitemap.xml`);
