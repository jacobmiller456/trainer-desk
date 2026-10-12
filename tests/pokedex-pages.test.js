// Generated Pokédex pages (pokedex/<slug>.html): up to date, correct facts, valid links, SEO limits, phone layout,
// and the interactive Pokédex links to them.
// Usage: node tests/pokedex-pages.test.js
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
let failures = 0;
const check = (l, ok, x) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + l + (ok || x === undefined ? '' : '  ' + JSON.stringify(x))); if (!ok) failures++; };
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

let fresh = true; try { execFileSync('node', [path.join(root, 'scripts/build-pokedex-pages.mjs'), '--check'], { stdio: 'pipe' }); } catch (e) { fresh = false; }
check('pages and sitemap are up to date with data/pokedex.json', fresh);
const dex = JSON.parse(read('data/pokedex.json'));
check('one page per species', fs.readdirSync(path.join(root, 'pokedex')).length === dex.length && dex.length >= 1025, dex.length);

const pika = read('pokedex/pikachu.html');
check('Pikachu: title + canonical', pika.includes('<title>Pikachu (#025) Pokédex: Type, Stats &amp; Weaknesses | Trainer Desk</title>') && pika.includes('<link rel="canonical" href="https://www.trainerdesk.net/pokedex/pikachu">'));
check('Pikachu: facts in the HTML', /an Electric-type Mouse Pokémon first found in Kanto/.test(pika) && /Lightning Rod <small>\(hidden ability\)<\/small>/.test(pika) && /<td class="v">320<\/td>/.test(pika));
check('Pikachu: weak to Ground only, resists Electric/Flying/Steel', /Weak to:<\/b> <span class="type"[^>]*>Ground<\/span><\/p>/.test(pika) && /Resists:.*Electric.*Flying.*Steel/.test(pika));
check('Pikachu: evolution chain links Pichu and Raichu', pika.includes('<a href="/pokedex/pichu">Pichu</a>') && pika.includes('<b>Pikachu</b>') && pika.includes('<a href="/pokedex/raichu">Raichu</a>'));
const ld = JSON.parse(pika.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
check('breadcrumb structured data', ld['@type'] === 'BreadcrumbList' && ld.itemListElement.length === 3);
check('x4 weakness marked (Venusaur: Fire, Ice, Flying, Psychic)', /Weak to:.*Fire.*Ice.*Flying.*Psychic/.test(read('pokedex/venusaur.html')) && /×4/.test(read('pokedex/charizard.html')));
check('immunities listed (Gengar immune to Normal and Fighting)', /Immune to:.*Normal.*Fighting/.test(read('pokedex/gengar.html')));
check('special names kept (Mr. Mime, Nidoran♀)', read('pokedex/mr-mime.html').includes('<h1>Mr. Mime</h1>') && read('pokedex/nidoran-f.html').includes('<h1>Nidoran♀</h1>'));
check('no Pokédex flavor text on generated pages', !/flavor/i.test(pika));

// limits + links across all pages
const titles = new Set(); let badTitle = [], badDesc = [], badLinks = [];
const exists = href => { const p = href.split('#')[0]; if (p === '/') return true; return fs.existsSync(path.join(root, p.slice(1) + (path.extname(p) ? '' : '.html'))); };
for (const p of dex) {
  const h = read(`pokedex/${p.slug}.html`);
  const t = h.match(/<title>([^<]*)<\/title>/)[1].replace(/&amp;/g, '&');
  const d = h.match(/<meta name="description" content="([^"]*)"/)[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'");
  if (t.length > 65) badTitle.push(p.slug); if (d.length > 160 || d.length < 70) badDesc.push(p.slug); titles.add(t);
  for (const m of h.matchAll(/href="(\/[^"]*)"/g)) if (!exists(m[1])) badLinks.push(p.slug + ' -> ' + m[1]);
}
check('all titles <= 65 chars and unique', !badTitle.length && titles.size === dex.length, badTitle.slice(0, 5));
check('all descriptions 70-160 chars', !badDesc.length, badDesc.slice(0, 5));
check('every internal link resolves', !badLinks.length, badLinks.slice(0, 5));
const sm = read('sitemap.xml');
check('sitemap includes every Pokédex page', dex.every(p => sm.includes(`<loc>https://www.trainerdesk.net/pokedex/${p.slug}</loc>`)));

// phone layout + interactive Pokédex link
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  else if (!path.extname(p) && fs.existsSync(path.join(root, p + '.html'))) p += '.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
server.listen(0, async () => {
  const base = 'http://127.0.0.1:' + server.address().port;
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 320, height: 800 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
  await page.goto(base + '/pokedex/pikachu');
  check('page styled (stylesheet loaded)', await page.evaluate(() => getComputedStyle(document.querySelector('.box')).borderTopWidth === '3px'));
  const lay = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const small = [...document.querySelectorAll('header a, .pager a, .evo a, .related a, .cta a')].filter(a => { const r = a.getBoundingClientRect(); return r.height < 44 || r.width < 44; }).map(a => a.textContent.trim()).slice(0, 5);
    const tiny = [...document.querySelectorAll('body *')].filter(e => e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12).map(e => e.tagName);
    return { overflow: document.documentElement.scrollWidth - vw, small, tiny };
  });
  check('320px: no sideways scroll, links >= 44px, text >= 12px', lay.overflow <= 0 && !lay.small.length && !lay.tiny.length, lay);
  await page.goto(base + '/pokedex');
  await page.waitForSelector('#dex-grid .dex-tile', { timeout: 10000 });
  await page.click('#dex-grid .dex-tile[data-id="25"]');
  await page.waitForSelector('#dex-detail .dex-full', { timeout: 5000 }).catch(() => {});
  check('interactive Pokédex links to the full page', (await page.getAttribute('#dex-detail .dex-full', 'href').catch(() => null)) === '/pokedex/pikachu');
  check('no uncaught JS errors', !errors.length, errors);
  await b.close(); server.close();
  console.log(failures ? `\n${failures} POKEDEX PAGE CHECK(S) FAILED` : '\nALL POKEDEX PAGE CHECKS PASSED');
  process.exit(failures ? 1 : 0);
});
