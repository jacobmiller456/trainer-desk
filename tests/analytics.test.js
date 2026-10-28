// Analytics: cookie-free Vercel Web Analytics on every page; no Google Analytics, no cookie banner, nothing stored on
// the device, and leftovers from the old Google Analytics setup are cleared. Usage: node tests/analytics.test.js
const { chromium } = require('playwright');
const { serve } = require('./serve');
const fs = require('fs'), path = require('path');
let failures = 0;
const check = (l, ok, x) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + l + (ok || x === undefined ? '' : '  ' + JSON.stringify(x))); if (!ok) failures++; };
const root = path.join(__dirname, '..');

(async () => {
  // every page we publish: the app, its tab copies and a sample of each kind of generated page
  const files = ['index.html', 'go.html', 'tcg.html', 'pokedex.html', 'arena.html', 'pokedex/bulbasaur.html', 'tcg/sets.html', 'go/events.html',
    fs.readdirSync(path.join(root, 'tcg')).find(f => f !== 'sets.html' && f.endsWith('.html')) && 'tcg/' + fs.readdirSync(path.join(root, 'tcg')).find(f => f !== 'sets.html' && f.endsWith('.html'))].filter(Boolean);
  for (const f of files) {
    const h = fs.readFileSync(path.join(root, f), 'utf8');
    check(`${f}: Vercel Web Analytics, no Google Analytics, no cookie banner`, h.includes('<script defer src="/_vercel/insights/script.js"></script>') && !/googletagmanager|gtag\(|cookie-banner/.test(h));
  }

  const { base, close } = await serve();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 375, height: 700 } });
  const u = new URL(base);
  await ctx.addCookies([{ name: '_ga', value: 'GA1.1.123', domain: u.hostname, path: '/' }, { name: '_ga_S7NHPZKHJQ', value: 'GS1.1.1', domain: u.hostname, path: '/' }, { name: 'keep', value: '1', domain: u.hostname, path: '/' }]);
  await ctx.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('td-cookie-consent', 'granted'); } });
  const page = await ctx.newPage(); const errors = [], reqs = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('request', r => reqs.push(r.url()));
  await page.route('**/*', r => {
    const url = r.request().url();
    if (url === base + '/_vercel/insights/script.js') return r.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.__vaLoaded=true;' });
    return url.startsWith(base) ? r.continue() : r.abort();
  });
  await page.goto(base + '/'); await page.waitForTimeout(800);
  check('no banner or consent prompt', !(await page.$('#cookie-banner, [aria-label="Cookie consent"]')));
  check('analytics script loads (deferred) and the va queue exists', await page.evaluate(() => window.__vaLoaded === true && typeof window.va === 'function'));
  check('no request to Google Analytics', !reqs.some(x => /googletagmanager|google-analytics/.test(x)), reqs.filter(x => /googletagmanager|google-analytics/.test(x)));
  const names = (await ctx.cookies()).map(c => c.name);
  check('old Google Analytics cookies removed, other cookies left alone', !names.some(n => /^_ga/.test(n)) && names.includes('keep'), names);
  check('old consent choice removed from storage', (await page.evaluate(() => localStorage.getItem('td-cookie-consent'))) === null);
  await page.goto(base + '/pokedex/bulbasaur'); await page.waitForTimeout(300);
  check('the page itself sets no cookies', JSON.stringify((await ctx.cookies()).map(c => c.name)) === '["keep"]');
  await page.goto(base + '/');
  check('footer says how visits are counted', /Vercel Web Analytics: no cookies/.test(await page.textContent('footer')));
  check('no uncaught JS errors', !errors.length, errors);
  await b.close(); close();
  console.log(failures ? `\n${failures} ANALYTICS CHECK(S) FAILED` : '\nALL ANALYTICS CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})();
