// /week (built by scripts/build-pages.mjs): this week's GO events and TCG price moves, with a ready-to-paste post and a
// copy button; phone layout, dark mode, sitemap. Usage: node tests/week.test.js
const { chromium } = require('playwright');
const { serve } = require('./serve');
const fs = require('fs'), path = require('path');
let failures = 0;
const check = (l, ok, x) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + l + (ok || x === undefined ? '' : '  ' + JSON.stringify(x))); if (!ok) failures++; };
(async () => {
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'week.html'), 'utf8');
  const post = (html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/) || [])[1] || '';
  check('page has the week\'s title, GO section, price section and a post ending with the site link', /<title>This Week in Pokémon GO &amp; the Pokémon TCG \(/.test(html) && /Pokémon GO: starting this week/.test(html) && /TCG prices: biggest risers/.test(html) && /trainerdesk\.net\/week$/.test(post.trim()));
  check('in the sitemap; linked from the GO tab', fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8').includes('<loc>https://www.trainerdesk.net/week</loc>') && fs.readFileSync(path.join(root, 'index.html'), 'utf8').includes('href="/week"'));
  const { base, close } = await serve();
  const b = await chromium.launch();
  for (const scheme of ['light', 'dark']) for (const w of [320, 375]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 800 }, colorScheme: scheme, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
    await page.goto(base + '/week');
    const lay = await page.evaluate(() => { const b = document.getElementById('week-copy').getBoundingClientRect(), t = getComputedStyle(document.getElementById('week-post'));
      return { btn: b.height >= 44 && b.width >= 44, font: t.fontSize, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, ink: t.color !== t.backgroundColor }; });
    check(`${w}px ${scheme}: copy button 44px+, 16px text box, readable, no sideways scroll`, lay.btn && lay.font === '16px' && lay.overflow <= 0 && lay.ink, lay);
    if (w === 375 && scheme === 'light') {
      await page.click('#week-copy');
      const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
      check('COPY puts the post on the clipboard and says so', /^\*\*This week in Pokémon GO & the Pokémon TCG/.test(clip) && (await page.textContent('#week-msg')) === 'Copied!', clip.slice(0, 80));
    }
    check(`${w}px ${scheme}: no JS errors`, !errors.length, errors);
    await ctx.close();
  }
  await b.close(); close();
  console.log(failures ? `\n${failures} WEEK CHECK(S) FAILED` : '\nALL WEEK CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})();
