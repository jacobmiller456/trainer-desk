// Install as an app: manifest + shortcuts, the install card (Android/desktop prompt, iPhone steps, "Not now"),
// shortcut deep links, and the service worker serving saved pages offline. Usage: node tests/pwa.test.js
const { chromium } = require('playwright');
const { serve } = require('./serve');
const fs = require('fs'), path = require('path');
let failures = 0;
const check = (l, ok, x) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + l + (ok || x === undefined ? '' : '  ' + JSON.stringify(x))); if (!ok) failures++; };
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

async function ctxFor(b, base, opts = {}) {
  const ctx = await b.newContext({ viewport: { width: 375, height: 800 }, ...(opts.ua ? { userAgent: opts.ua } : {}) });
  await ctx.addInitScript(sw => { try { localStorage.setItem('td-cookie-consent', 'denied'); } catch (e) {} if (sw) window.__tdSwTest = true; }, !!opts.sw);
  await ctx.route('**/*', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
  const page = await ctx.newPage(); page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
  return { ctx, page };
}
const fakePrompt = (page, outcome) => page.evaluate(o => {
  const e = new Event('beforeinstallprompt', { cancelable: true }); window.__prompted = 0;
  e.prompt = async () => { window.__prompted++; }; e.userChoice = Promise.resolve({ outcome: o });
  window.dispatchEvent(e); return e.defaultPrevented;
}, outcome);
const cardState = page => page.evaluate(() => { const c = document.getElementById('today-app'), b = document.getElementById('app-install'), r = b.getBoundingClientRect();
  return { shown: !c.hidden && c.offsetHeight > 0, btn: !b.hidden && b.offsetHeight > 0, steps: !document.getElementById('app-ios').hidden, w: r.width, h: r.height }; });

(async () => {
  const m = JSON.parse(fs.readFileSync(path.join(__dirname, '../site.webmanifest'), 'utf8'));
  check('manifest: standalone app with id, start_url and 192/512/maskable icons', m.id === '/' && m.start_url === '/' && m.display === 'standalone' && m.icons.length === 3 && m.icons.some(i => i.purpose === 'maskable'));
  check('manifest: 4 shortcuts (events, price movers, collection, arena)', JSON.stringify(m.shortcuts.map(s => s.url)) === '["/go","/tcg?view=movers","/pokedex?view=collection","/arena"]');
  for (const i of [...m.icons, ...m.shortcuts.flatMap(s => s.icons)]) check('icon file exists: ' + i.src, fs.existsSync(path.join(__dirname, '..', i.src)));
  const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '../vercel.json'), 'utf8'));
  check('sw.js is never cached by the browser (updates reach everyone)', vercel.headers.some(h => h.source === '/sw.js' && h.headers.some(x => x.key === 'Cache-Control' && /no-cache/.test(x.value))));

  const { base, close } = await serve();
  const b = await chromium.launch();
  let errs = [];

  // Android / desktop Chrome: install prompt
  let { ctx, page } = await ctxFor(b, base);
  await page.goto(base + '/'); await page.waitForTimeout(500);
  check('install card hidden until the browser offers an install', !(await cardState(page)).shown);
  check('beforeinstallprompt is held for our button (no browser mini-bar)', await fakePrompt(page, 'accepted'));
  let st = await cardState(page);
  check('install card shows the INSTALL APP button (44px), no iPhone steps', st.shown && st.btn && !st.steps && st.w >= 44 && st.h >= 44, st);
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  check('install card fits at 375px', scrollW <= 375, scrollW);
  await page.click('#app-install'); await page.waitForTimeout(200);
  check('button opens the install prompt; accepted → card goes away', (await page.evaluate(() => window.__prompted)) === 1 && !(await cardState(page)).shown);
  await fakePrompt(page, 'dismissed'); await page.click('#app-dismiss');
  check('"Not now" hides the card and remembers it', !(await cardState(page)).shown && !!(await page.evaluate(() => localStorage.getItem('td-app-dismissed'))));
  await page.reload(); await page.waitForTimeout(300); await fakePrompt(page, 'dismissed');
  check('after "Not now" the card stays hidden on the next visit', !(await cardState(page)).shown);
  await page.evaluate(() => localStorage.setItem('td-app-dismissed', String(Date.now() - 31 * 864e5)));
  await page.reload(); await page.waitForTimeout(300); await fakePrompt(page, 'dismissed');
  check('...and asks again after 30 days', (await cardState(page)).shown);
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  check('installed → card hidden', !(await cardState(page)).shown);

  // shortcut deep links
  await page.goto(base + '/tcg?view=movers'); await page.waitForTimeout(500);
  check('shortcut /tcg?view=movers opens Price Movers', await page.evaluate(() => !document.getElementById('tcg-movers').hidden && document.querySelector('[data-tcgview="movers"]').getAttribute('aria-pressed') === 'true'));
  await page.goto(base + '/pokedex?view=collection'); await page.waitForTimeout(500);
  check('shortcut /pokedex?view=collection opens My Collection', await page.evaluate(() => document.getElementById('dex-browse').hidden && document.querySelector('[data-dexview="collection"]').getAttribute('aria-pressed') === 'true'));
  check('service worker stays off in automated tests unless asked', !(await page.evaluate(() => navigator.serviceWorker && navigator.serviceWorker.controller)));
  errs = errs.concat(page.errors); await ctx.close();

  // iPhone Safari: steps instead of a button
  ({ ctx, page } = await ctxFor(b, base, { ua: IOS }));
  await page.goto(base + '/'); await page.waitForTimeout(500);
  st = await cardState(page);
  check('iPhone Safari: Add to Home Screen steps, no install button', st.shown && st.steps && !st.btn && /Add to Home Screen/.test(await page.textContent('#app-ios')), st);
  errs = errs.concat(page.errors); await ctx.close();

  // service worker: saved pages open offline
  ({ ctx, page } = await ctxFor(b, base, { sw: true }));
  await page.goto(base + '/');
  await page.evaluate(() => navigator.serviceWorker.ready); await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 });
  check('service worker registers and controls the page', true);
  await page.waitForFunction(async () => { const c = await caches.open('td-v1'); return (await c.keys()).length >= 8; }, null, { timeout: 10000 }).catch(() => {});
  const saved = await page.evaluate(async () => (await (await caches.open('td-v1')).keys()).map(r => new URL(r.url).pathname));
  check('install saves the 5 tab pages + event schedule', ['/', '/go', '/tcg', '/pokedex', '/arena', '/go/events'].every(p => saved.includes(p)), saved);
  check('nothing from other sites is saved', !(await page.evaluate(async () => (await (await caches.open('td-v1')).keys()).some(r => new URL(r.url).origin !== location.origin))));
  close(); // the site goes away: from here on only the saved copies can answer
  await page.goto(base + '/go').catch(() => {});
  check('offline: a saved tab still opens', /POKEMON GO/.test(await page.textContent('#view-go h1').catch(() => '')));
  await page.goto(base + '/tcg?set=sv1').catch(() => {});
  check('offline: /tcg?set=… opens the saved /tcg', !!(await page.$('#view-tcg')));
  await page.goto(base + '/pokedex/bulbasaur').catch(() => {});
  const off = await page.textContent('body').catch(() => '');
  check('offline: an unsaved page shows a friendly offline page with a way back', /You're offline/.test(off) && (await page.getAttribute('a', 'href')) === '/', off.slice(0, 80));
  errs = errs.concat(page.errors.filter(e => !/Failed to fetch|NetworkError|ERR_INTERNET_DISCONNECTED/.test(e))); await ctx.close();

  check('no uncaught JS errors', !errs.length, errs);
  await b.close();
  console.log(failures ? `\n${failures} APP CHECK(S) FAILED` : '\nALL APP CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})();
