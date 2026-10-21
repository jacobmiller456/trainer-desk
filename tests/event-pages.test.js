// GO event guide pages (go/<id>.html + go/events.html, built by scripts/build-pages.mjs from data/events.json and the
// EVENT_NOTES in index.html): every noted event gets a page with its notes, SEO tags and Event data; the schedule lists
// events and links guides; sitemap lists them; the app links to the page; readable in light and dark; fits a phone.
// Usage: node tests/event-pages.test.js
const { chromium } = require('playwright');
const { serve } = require('./serve');
const scan = require('./contrast-scan');
const fs = require('fs'), path = require('path');
let failures = 0;
const check = (l, ok, x) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + l + (ok || x === undefined ? '' : '  ' + JSON.stringify(x))); if (!ok) failures++; };
const root = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data/events.json'), 'utf8'));
const pages = fs.readdirSync(path.join(root, 'go')).filter(f => f !== 'events.html');
const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');

(async () => {
  check('event guide pages exist', pages.length > 0, pages.length);
  const halloween = 'halloween-2026-part-1';
  const hasH = pages.includes(halloween + '.html') && data.events.some(e => e.id === halloween);
  check('every page belongs to an event in the snapshot', pages.every(f => data.events.some(e => e.id + '.html' === f)));
  check('sitemap lists the schedule and every guide', sitemap.includes('/go/events<') && pages.every(f => sitemap.includes('/go/' + f.replace('.html', '') + '<')));
  const { base, close } = await serve();
  const b = await chromium.launch();
  for (const scheme of ['light', 'dark']) {
    const ctx = await b.newContext({ viewport: { width: 375, height: 900 }, colorScheme: scheme });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/*', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
    const slug = hasH ? halloween : pages[0].replace('.html', '');
    await page.goto(base + '/go/' + slug);
    if (scheme === 'light') {
      const meta = await page.evaluate(() => ({ title: document.title, desc: document.querySelector('meta[name=description]').content, canon: document.querySelector('link[rel=canonical]').href, ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => JSON.parse(s.textContent)) }));
      const ld = [].concat(...meta.ld);
      check('guide page: title, description, canonical URL', / Pokémon GO Event Guide \| Trainer Desk$/.test(meta.title) && meta.desc.length > 50 && meta.desc.length <= 160 && meta.canon === `https://www.trainerdesk.net/go/${slug}`, meta);
      check('guide page: breadcrumb + Event structured data with dates', ld.some(x => x['@type'] === 'BreadcrumbList') && (!hasH || ld.some(x => x['@type'] === 'Event' && x.startDate && x.endDate)), ld.map(x => x['@type']));
      const text = await page.textContent('main');
      if (hasH) check('guide page shows the hand-written notes, dates and checked date', /costumed Pikachu and Sinistea/i.test(text) && /Oct 27, 2026/.test(text) && /checked October \d+, 2026/.test(text), text.slice(0, 300));
      check('guide page links to the live app (countdown, calendar) and the schedule', (await page.getAttribute('main .btn', 'href')) === `/go?event=${slug}` && !!(await page.$('main a[href="/go/events"]')));
      check('unofficial fan project footer + source credit', /unofficial fan project/.test(await page.textContent('footer')) && /ScrapedDuck/.test(await page.textContent('footer')));
      const lay = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
      check('375px: no sideways scroll', lay.overflow <= 0, lay);
    }
    const bad = (await page.evaluate(`(${scan.toString()})(${scheme === 'dark' ? 4.5 : 3}, '${scheme === 'dark' ? 'rgb(14,33,23)' : 'rgb(45,106,79)'}')`)).filter(x => !/type/.test(x.sel));
    check(`${scheme}: guide page text is readable`, !bad.length, bad.slice(0, 5));
    await page.goto(base + '/go/events');
    const idx = await page.textContent('main');
    check(`schedule page lists happening-now and coming-up events (${scheme})`, /Happening now/.test(idx) && /Coming up/.test(idx) && (await page.$$eval('main .setlist a', a => a.length)) > 3);
    if (hasH) check('schedule links guides to their page and others to the live app', !!(await page.$(`main a[href="/go/${halloween}"]`)) && !!(await page.$('main a[href^="/go?event="]')));
    const bad2 = (await page.evaluate(`(${scan.toString()})(${scheme === 'dark' ? 4.5 : 3}, '${scheme === 'dark' ? 'rgb(14,33,23)' : 'rgb(45,106,79)'}')`));
    check(`${scheme}: schedule page text is readable`, !bad2.length, bad2.slice(0, 5));
    check(`no JS errors (${scheme})`, !errs.length, errs);
    await ctx.close();
  }
  // the app links to the guide page
  if (hasH) {
    const ctx = await b.newContext({ viewport: { width: 375, height: 900 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('td-cookie-consent', 'denied'); } catch (e) {} });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
    const page = await ctx.newPage();
    const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
    await page.route('**/*', r => { const u = r.request().url(); if (u.startsWith(base)) return r.continue(); if (u.includes('events.json')) return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify([{ eventID: halloween, name: 'Pokémon GO Halloween 2026 Part I', eventType: 'event', start: day(3) + 'T10:00:00.000', end: day(7) + 'T10:00:00.000', extraData: {} }]) }); return r.abort(); });
    await page.goto(base + '/go'); await page.waitForSelector(`.ev-more[data-ev="${halloween}"]`, { timeout: 15000 });
    check('GO tab links to the full schedule', !!(await page.$('.ev-all a[href="/go/events"]')));
    await page.click(`.ev-more[data-ev="${halloween}"]`); await page.waitForTimeout(400);
    check('event dialog links to the guide page', (await page.getAttribute('#evd-body a.evd-src[href^="/go/"]', 'href')) === '/go/' + halloween);
    await page.evaluate(() => { navigator.share = undefined; }); await page.click('#evd-share'); await page.waitForTimeout(150);
    check('SHARE uses the guide page address', (await page.evaluate(() => navigator.clipboard.readText())).endsWith('/go/' + halloween));
    await ctx.close();
  }
  await b.close(); close();
  console.log(failures ? `\n${failures} EVENT PAGE CHECK(S) FAILED` : '\nALL EVENT PAGE CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})();
