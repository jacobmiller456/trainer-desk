// Writes go.html, tcg.html, pokedex.html and arena.html: copies of index.html whose <head> carries that tab's
// title, description, canonical URL and social card. Link previewers (iMessage, Discord, X, Facebook) don't run
// JavaScript, so each shareable tab URL needs these tags in its HTML. Vercel's cleanUrls serves /tcg from tcg.html.
//   node scripts/tab-pages.mjs          regenerate
//   node scripts/tab-pages.mjs --check  exit 1 if the generated files are out of date (used by npm test / CI)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://www.trainerdesk.net';
const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const m = src.match(/const ROUTES=(\{[\s\S]*?\n\});/);
if (!m) { console.error('ROUTES not found in index.html'); process.exit(1); }
const ROUTES = Function('return ' + m[1])();
const attr = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function pageFor(r) {
  const url = SITE + r.path, img = SITE + '/assets/' + r.img;
  const rep = [
    [/<title>[^<]*<\/title>/, `<title>${attr(r.title)}</title>`],
    [/(<meta name="description" content=")[^"]*/, `$1${attr(r.desc)}`],
    [/(<link rel="canonical" href=")[^"]*/, `$1${url}`],
    [/(<meta property="og:url" content=")[^"]*/, `$1${url}`],
    [/(<meta property="og:title" content=")[^"]*/, `$1${attr(r.title)}`],
    [/(<meta property="og:description" content=")[^"]*/, `$1${attr(r.desc)}`],
    [/(<meta property="og:image" content=")[^"]*/, `$1${img}`],
    [/(<meta property="og:image:alt" content=")[^"]*/, `$1${attr(r.title)}`],
    [/(<meta name="twitter:title" content=")[^"]*/, `$1${attr(r.title)}`],
    [/(<meta name="twitter:description" content=")[^"]*/, `$1${attr(r.desc)}`],
    [/(<meta name="twitter:image" content=")[^"]*/, `$1${img}`],
  ];
  let out = src.replace('<head>', '<head>\n<!-- GENERATED from index.html by scripts/tab-pages.mjs. Edit index.html, then run: npm run pages -->');
  for (const [re, val] of rep) { if (!re.test(out)) throw new Error('head tag missing: ' + re); out = out.replace(re, val); }
  return out;
}

const check = process.argv.includes('--check');
const stale = [];
for (const [key, r] of Object.entries(ROUTES)) {
  if (r.path === '/') continue;
  const file = path.join(root, r.path.slice(1) + '.html');
  const html = pageFor(r);
  if (check) { if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== html) stale.push(path.basename(file)); }
  else { fs.writeFileSync(file, html); console.log('wrote ' + path.basename(file) + ' (' + key + ')'); }
}
if (check) {
  if (stale.length) { console.error('Out of date: ' + stale.join(', ') + ' — run: npm run pages'); process.exit(1); }
  console.log('tab pages up to date');
}
