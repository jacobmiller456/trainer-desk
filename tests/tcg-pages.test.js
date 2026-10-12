// Generated TCG pages (tcg/<slug>.html + tcg/sets.html): facts, links, SEO limits, no copied text, phone layout,
// and the "live prices" deep link opening the right set in the app.
// Usage: node tests/tcg-pages.test.js
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
let failures = 0;
const check = (l, ok, x) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + l + (ok || x === undefined ? '' : '  ' + JSON.stringify(x))); if (!ok) failures++; };
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const tcg = JSON.parse(read('data/tcg.json'));

check('one page per set + index', fs.readdirSync(path.join(root, 'tcg')).length === tcg.length + 1 && fs.existsSync(path.join(root, 'tcg/sets.html')), tcg.length);
const pb = read('tcg/pitch-black.html');
check('Pitch Black: title, canonical', pb.includes('<title>Pitch Black Set List &amp; Card Checklist | Trainer Desk</title>') && pb.includes('<link rel="canonical" href="https://www.trainerdesk.net/tcg/pitch-black">'));
check('Pitch Black: facts (release, totals, secret rares, legality)', /released in English on July 17, 2026/.test(pb) && /main set has 84 cards, plus 36 secret rares/.test(pb) && /Standard and Expanded/.test(pb));
check('Pitch Black: rarity breakdown + full card list', /<th scope="row">Common<\/th><td class="v">37<\/td>/.test(pb) && (pb.match(/<li><img /g) || []).length === 120);
check('Pokémon cards link to Pokédex pages', pb.includes('<a href="/pokedex/tropius">Tropius</a>'));
check('live prices deep link', pb.includes('href="/tcg?set=me5"'));
const me5 = JSON.parse(read('data/tcg.json')).find(s => s.id === 'me5');
check('data keeps no flavor or attack text', !JSON.stringify(me5).includes('Delicious fruits') && me5.cards[0].length === 8);
check('apostrophes dropped from slugs', fs.existsSync(path.join(root, 'tcg/champions-path.html')));
const idx = read('tcg/sets.html');
check('set index links every set', tcg.every(s => idx.includes(`>${s.name.replace(/&/g, '&amp;').replace(/'/g, '&#39;')}</a>`)) && /All Pokémon TCG sets<\/h1>/.test(idx));

// limits + links across all set pages
let badT = [], badD = [], badL = [];
const exists = href => { const p = href.split(/[?#]/)[0]; if (p === '/') return true; return fs.existsSync(path.join(root, p.slice(1) + (path.extname(p) ? '' : '.html'))); };
for (const f of fs.readdirSync(path.join(root, 'tcg'))) {
  const h = read('tcg/' + f);
  const t = h.match(/<title>([^<]*)<\/title>/)[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'");
  const d = h.match(/<meta name="description" content="([^"]*)"/)[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'");
  if (t.length > 65) badT.push(f); if (d.length > 160 || d.length < 70) badD.push(f);
  for (const m of h.matchAll(/href="(\/[^"]*)"/g)) if (!exists(m[1])) badL.push(f + ' -> ' + m[1]);
}
check('titles <= 65, descriptions 70-160', !badT.length && !badD.length, { badT: badT.slice(0, 3), badD: badD.slice(0, 3) });
check('every internal link resolves', !badL.length, badL.slice(0, 5));
const sm = read('sitemap.xml');
check('sitemap has the set index and every set page', sm.includes('<loc>https://www.trainerdesk.net/tcg/sets</loc>') && (sm.match(/<loc>https:\/\/www\.trainerdesk\.net\/tcg\/[a-z0-9-]+<\/loc>/g) || []).length === tcg.length + 1);

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
  const cors = { 'access-control-allow-origin': '*' };
  await page.route('**/*', r => {
    const u = r.request().url();
    if (u.startsWith(base)) return r.continue();
    if (u.startsWith('https://api.pokemontcg.io/v2/sets')) return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'me55', name: '30th Celebration', releaseDate: '2026/09/16' }, { id: 'me5', name: 'Pitch Black', releaseDate: '2026/07/17' }] }) });
    if (u.startsWith('https://api.pokemontcg.io/v2/cards')) return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'x1', name: u.includes('me5&') || u.includes('set.id:me5&') ? 'Pitch Card' : 'Other Card', number: '1', rarity: 'Common' }] }) });
    return r.abort();
  });
  for (const p of ['/tcg/pitch-black', '/tcg/sets']) {
    await page.goto(base + p);
    const lay = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const small = [...document.querySelectorAll('header a, .pager a, .related a, .cta a, .setlist a')].filter(a => { const r = a.getBoundingClientRect(); return r.height < 44 || r.width < 44; }).map(a => a.textContent.trim()).slice(0, 5);
      const tiny = [...document.querySelectorAll('body *')].filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12).map(e => e.tagName);
      return { overflow: document.documentElement.scrollWidth - vw, small, tiny };
    });
    check(`${p} at 320px: no sideways scroll, tap targets, readable text`, lay.overflow <= 0 && !lay.small.length && !lay.tiny.length, lay);
  }
  await page.goto(base + '/tcg/pitch-black');
  await page.click('.cta a');
  await page.waitForFunction(() => document.querySelector('#set-select') && document.querySelector('#set-select').value === 'me5', null, { timeout: 10000 }).catch(() => {});
  check('"live prices" opens the TCG tab on that set', new URL(page.url()).pathname === '/tcg' && (await page.$eval('#set-select', s => s.value)) === 'me5' && (await page.isVisible('#view-tcg')));
  check('no uncaught JS errors', !errors.length, errors);
  await b.close(); server.close();
  console.log(failures ? `\n${failures} TCG PAGE CHECK(S) FAILED` : '\nALL TCG PAGE CHECKS PASSED');
  process.exit(failures ? 1 : 0);
});
