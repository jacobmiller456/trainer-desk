// Who's That Pokémon? daily puzzle (Today tab): silhouette, validation, feedback, hints, win/lose, persistence, share text.
// Usage: node tests/puzzle.test.js
const { chromium } = require('playwright');
const { serve } = require('./serve');
const fs = require('fs'), path = require('path');
let failures = 0;
const check = (l, ok, x) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + l + (ok || x === undefined ? '' : '  ' + JSON.stringify(x))); if (!ok) failures++; };
const names = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets/pokedex-names.json'), 'utf8'));

async function fresh(b, base) {
  const ctx = await b.newContext({ viewport: { width: 375, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('td-cookie-consent', 'denied'); } catch (e) {} });
  const page = await ctx.newPage(); page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
  const GIF = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
  await page.route('**/*', r => { const u = r.request().url(); if (u.startsWith(base)) return r.continue(); if (u.includes('/sprites/pokemon/')) return r.fulfill({ status: 200, contentType: 'image/gif', body: GIF }); return r.abort(); });
  await page.goto(base + '/'); await page.waitForSelector('#whos-form', { timeout: 10000 });
  return { ctx, page };
}
const guess = async (page, name) => { await page.fill('#whos-input', name); await page.click('#whos-form button[type=submit]'); await page.waitForTimeout(80); };

(async () => {
  const { base, close } = await serve();
  const b = await chromium.launch();
  let { ctx, page } = await fresh(b, base);
  const ans = await page.evaluate(() => window.__whos.answer);
  check('daily answer comes from the name list', names.some(n => n[0] === ans[0]), ans);
  check('silhouette shown (sprite blacked out)', /brightness\(0\)/.test(await page.$eval('.whos-img', e => getComputedStyle(e).filter)));
  const frame = await page.$eval('.whos-frame', e => ({ bg: getComputedStyle(e).backgroundImage, f: getComputedStyle(e).filter, img: getComputedStyle(e.querySelector('img')).backgroundImage }));
  check('box stays light behind the silhouette (not a black box)', /radial-gradient/.test(frame.bg) && frame.f === 'none' && frame.img === 'none', frame);
  check('name suggestions list all Pokémon', (await page.$$eval('#whos-names option', o => o.length)) === names.length);
  await guess(page, 'Notamon');
  check('unknown names rejected', /not in the Pokédex/.test(await page.textContent('#toast')));
  const wrong = names.filter(n => n[0] !== ans[0] && n[3] !== ans[3]).slice(0, 2);
  await guess(page, wrong[0][1].toLowerCase());
  const row = await page.textContent('.whos-guesses li');
  check('wrong guess shows Gen/Type/# feedback with direction', new RegExp(`Gen ${wrong[0][3] < ans[3] ? '↑' : '↓'}`).test(row) && /Type/.test(row) && /# [↑↓]/.test(row), row);
  await guess(page, wrong[0][1]);
  check('duplicate guess ignored', /Already guessed/.test(await page.textContent('#toast')) && (await page.$$eval('.whos-guesses li', l => l.length)) === 1);
  await guess(page, wrong[1][1]);
  check('hint after two misses', new RegExp(`Generation ${ans[3]}`).test(await page.textContent('#today-puzzle')));
  await guess(page, ans[1]);
  check('correct guess wins and reveals the Pokémon', /You got it!/.test(await page.textContent('#today-puzzle')) && (await page.$eval('.whos-img', e => e.classList.contains('shown'))));
  const share = await page.evaluate(() => window.__whos.shareText());
  check('share text: number, score, emoji rows, link', /^Who's That Pokémon\? #\d+ 3\/5\n([🟩🟨⬛]{3}\n){3}https:\/\/www\.trainerdesk\.net$/u.test(share), share);
  check('link to the Pokémon page works', fs.existsSync(path.join(__dirname, '..', (await page.getAttribute('.whos-link', 'href')).slice(1) + '.html')));
  await page.reload(); await page.waitForSelector('#whos-share', { timeout: 10000 });
  check('result and streak survive a reload', /Streak: 1 · Best: 1 · Solved 1\/1/.test(await page.textContent('#today-puzzle')));
  const lay = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
  check('no sideways scroll', lay.overflow <= 0, lay);
  const errs1 = page.errors; await ctx.close();

  ({ ctx, page } = await fresh(b, base));
  for (const n of names.filter(n => n[0] !== ans[0]).slice(10, 15)) await guess(page, n[1]);
  const lost = await page.textContent('#today-puzzle');
  check('five misses ends the round and reveals the answer', new RegExp(`It's ${ans[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}!`).test(lost) && /Streak: 0 · Best: 0 · Solved 0\/1/.test(lost));
  const ctx2 = ctx; ({ ctx, page } = await fresh(b, base)); await ctx2.close();
  const cap = t => t[0].toUpperCase() + t.slice(1);
  check('hint button offered before any guess', /HINT \(3 left\)/.test(await page.textContent('#whos-hint')));
  await page.click('#whos-hint'); await page.waitForTimeout(50);
  check('hint 1: generation and region', new RegExp(`Generation ${ans[3]} \\(`).test(await page.textContent('.whos-hints')) && /HINT \(2 left\)/.test(await page.textContent('#whos-hint')));
  await page.click('#whos-hint'); await page.waitForTimeout(50);
  check('hint 2: types', (await page.textContent('.whos-hints')).includes('Type: ' + ans[2].map(cap).join(' / ')));
  await page.click('#whos-hint'); await page.waitForTimeout(50);
  check('hint 3: first letter, then no more hints', (await page.textContent('.whos-hints')).includes(`starts with “${ans[1][0]}”`) && !(await page.$('#whos-hint')));
  await page.reload(); await page.waitForSelector('#whos-form', { timeout: 10000 });
  check('hints survive a reload', (await page.$$eval('.whos-hints li', l => l.length)) === 3);
  await guess(page, ans[1]);
  check('share text notes hints used', /1\/5 💡3\n/u.test(await page.evaluate(() => window.__whos.shareText())));
  const errs2 = page.errors;
  await page.route('**/sprites/pokemon/**', r => r.abort());
  ({ ctx: ctx, page: page } = { ctx, page });
  await page.goto(base + '/'); await page.waitForTimeout(800);
  check('sprite unreachable: "?" tile instead of a black box', (await page.$$eval('#today-puzzle .whos-q', n => n.length)) === 1);
  check('no uncaught JS errors', !errs1.length && !errs2.length && !page.errors.length, errs1.concat(errs2, page.errors));
  await b.close(); close();
  console.log(failures ? `\n${failures} PUZZLE CHECK(S) FAILED` : '\nALL PUZZLE CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})();
