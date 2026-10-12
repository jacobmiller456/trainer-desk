// SEO: head tags, structured data, share image, manifest, sitemap/robots, and real per-tab URLs served over HTTP
// (a tiny local server mimics the Vercel rewrites in vercel.json).
// Usage: node tests/seo.test.js
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
let failures = 0;
const check = (l, ok, x) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + l + (ok || x === undefined ? '' : '  ' + JSON.stringify(x))); if (!ok) failures++; };
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

// ---- static checks ----
const html = read('index.html');
const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
check('JSON-LD parses with WebSite + WebApplication', ld['@graph'].some(n => n['@type'] === 'WebSite') && ld['@graph'].some(n => n['@type'] === 'WebApplication'));
for (const tag of ['rel="canonical"', 'property="og:image"', 'name="twitter:card" content="summary_large_image"', 'rel="manifest"', 'rel="apple-touch-icon"', 'name="robots"', '<noscript>'])
  check('head has ' + tag, html.includes(tag));
const routes = eval('(' + html.match(/const ROUTES=(\{[\s\S]*?\n\});/)[1] + ')');
for (const [k, r] of Object.entries(routes)) {
  check(`${k}: title ${r.title.length} chars (<= 65)`, r.title.length <= 65, r.title);
  check(`${k}: description ${r.desc.length} chars (70-165)`, r.desc.length >= 70 && r.desc.length <= 165, r.desc.length);
}
const sitemap = read('sitemap.xml');
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
check('sitemap lists every tab route', Object.values(routes).every(r => locs.includes('https://www.trainerdesk.net' + r.path)), locs.slice(0, 6));
check('robots.txt points at the sitemap', /Sitemap: https:\/\/www\.trainerdesk\.net\/sitemap\.xml/.test(read('robots.txt')));
const vercel = JSON.parse(read('vercel.json'));
check('cleanUrls on, so /tcg is served from tcg.html', vercel.cleanUrls === true);
const { execFileSync } = require('child_process');
let fresh = true; try { execFileSync('node', [path.join(root, 'scripts/tab-pages.mjs'), '--check'], { stdio: 'pipe' }); } catch (e) { fresh = false; }
check('generated tab pages are up to date with index.html', fresh);
const imgFor = { today: 'og-image.jpg', go: 'og-go.jpg', tcg: 'og-tcg.jpg', dex: 'og-pokedex.jpg', arena: 'og-arena.jpg' };
for (const [k, r] of Object.entries(routes)) {
  const file = r.path === '/' ? 'index.html' : r.path.slice(1) + '.html';
  const h = read(file);
  const og = (h.match(/<meta property="og:image" content="([^"]+)"/) || [])[1];
  check(`${file}: own social card + title in raw HTML`, og === 'https://www.trainerdesk.net/assets/' + imgFor[k] && h.includes('<title>' + r.title.replace(/&/g, '&amp;') + '</title>') && fs.existsSync(path.join(root, 'assets', imgFor[k])), og);
}
const man = JSON.parse(read('site.webmanifest'));
check('manifest icons exist', man.icons.every(i => fs.existsSync(path.join(root, i.src))) && fs.existsSync(path.join(root, 'apple-touch-icon.png')));
check('404 page exists and is noindex', /noindex/.test(read('404.html')));

// ---- served over HTTP with the same rewrites ----
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml', '.txt': 'text/plain' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  else if (!path.extname(p) && fs.existsSync(path.join(root, p + '.html'))) p = p + '.html'; // Vercel cleanUrls
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404, { 'Content-Type': 'text/html' }); return res.end(read('404.html')); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
server.listen(0, async () => {
  const base = 'http://127.0.0.1:' + server.address().port;
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 375, height: 800 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
  const canon = () => page.getAttribute('link[rel="canonical"]', 'href');

  const img = await page.goto(base + '/assets/og-image.jpg');
  check('share image served', img.ok());
  await page.goto(base + '/');
  const dims = await page.evaluate(async () => { const i = new Image(); i.src = '/assets/og-image.jpg'; await i.decode(); return [i.naturalWidth, i.naturalHeight]; });
  check('share image is 1200x630', dims.join('x') === '1200x630', dims);
  check('/ opens Today with the home title + canonical', (await page.isVisible('#view-today')) && (await page.title()) === routes.today.title && (await canon()) === 'https://www.trainerdesk.net/');

  const raw = await (await page.request.get(base + '/tcg')).text();
  check('link previewers get the TCG card without running JS', raw.includes('assets/og-tcg.jpg') && raw.includes('<title>' + routes.tcg.title.replace(/&/g, '&amp;') + '</title>'));
  await page.goto(base + '/tcg');
  check('/tcg opens the TCG tab directly', await page.isVisible('#view-tcg'));
  check('/tcg has its own title, description, canonical', (await page.title()) === routes.tcg.title && (await page.getAttribute('meta[name="description"]', 'content')) === routes.tcg.desc && (await canon()) === 'https://www.trainerdesk.net/tcg');
  await page.click('button[data-view="dex"]');
  check('clicking a tab updates the URL', new URL(page.url()).pathname === '/pokedex' && (await page.title()) === routes.dex.title);
  await page.goBack();
  check('back button returns to the previous tab', new URL(page.url()).pathname === '/tcg' && (await page.isVisible('#view-tcg')));
  await page.goto(base + '/arena');
  check('/arena opens the Arena', (await page.isVisible('#view-arena')) && (await page.title()) === routes.arena.title);
  check('arena background loads from a tab URL', await page.evaluate(async () => { const i = new Image(); i.src = 'assets/arena/indigo.webp'; try { await i.decode(); return true; } catch (e) { return false; } }));

  const code = Buffer.from(JSON.stringify({ n: 'Shared', c: [['c1', 'Card 1', '1', '', 'Set']] })).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  await page.goto(base + '/#binder=' + code);
  await page.waitForSelector('#binder-shared:not([hidden])', { timeout: 5000 }).catch(() => {});
  check('shared binder link opens on /tcg and keeps its code', new URL(page.url()).pathname === '/tcg' && /^#binder=/.test(new URL(page.url()).hash) && await page.isVisible('#binder-shared'));

  const nf = await page.goto(base + '/no-such-page');
  check('unknown paths get the 404 page', nf.status() === 404 && /tall grass/.test(await page.textContent('h1')));
  check('no uncaught JS errors', !errors.length, errors);
  await b.close(); server.close();
  console.log(failures ? `\n${failures} SEO CHECK(S) FAILED` : '\nALL SEO CHECKS PASSED');
  process.exit(failures ? 1 : 0);
});
