// Pixel Arena Daily Challenge + trainer record: same line-up for everyone each day, first finish counts (practice after),
// KOs/damage tracked, result card + share text, record saved across reloads, phone layout.
// Usage: node tests/arena-daily.test.js
const { chromium } = require('playwright');
const { serve } = require('./serve');
let failures = 0;
const check = (l, ok, x) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + l + (ok || x === undefined ? '' : '  ' + JSON.stringify(x))); if (!ok) failures++; };
const cors = { 'access-control-allow-origin': '*' };
const STATS = n => [['hp', 60 + n % 40], ['attack', 50 + n % 50], ['defense', 50], ['special-attack', 55], ['special-defense', 50], ['speed', 40 + n % 70]].map(([k, v]) => ({ base_stat: v, stat: { name: k } }));
const TYPES = ['fire', 'water', 'grass', 'electric', 'ghost', 'steel', 'fairy'];
const mockPokemon = id => ({ id, name: 'mon' + id, species: { name: 'mon' + id }, height: 5, weight: 50, types: [{ slot: 1, type: { name: TYPES[id % TYPES.length] } }], abilities: [], stats: STATS(id) });
const GIF = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');

async function newPage(ctx, base) {
  const page = await ctx.newPage(); page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
  await page.route('**/*', r => {
    const u = r.request().url();
    if (u.startsWith(base)) return r.continue();
    const m = u.match(/^https:\/\/pokeapi\.co\/api\/v2\/pokemon\/(\d+)$/);
    if (m) return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(mockPokemon(+m[1])) });
    if (/sprites/.test(u)) return r.fulfill({ status: 200, contentType: 'image/gif', body: GIF });
    return r.abort();
  });
  await page.goto(base + '/arena'); await page.waitForSelector('#arena-daily-go');
  return page;
}
const playOut = page => page.evaluate(() => { for (let i = 0; i < 8000 && window.__arena.state && !window.__arena.state.over; i++) window.__arena.step(0.05); return window.__arena.state; });
const started = page => page.waitForFunction(() => window.__arena.state && !window.__arena.state.over && document.getElementById('arena-overlay').hidden, null, { timeout: 15000 });

(async () => {
  const { base, close } = await serve();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 375, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('td-cookie-consent', 'denied'); } catch (e) {} });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  let page = await newPage(ctx, base);

  const plans = await page.evaluate(() => { const d = Math.floor(Date.now() / 864e5); return [window.__arena.dailyPlan(d), window.__arena.dailyPlan(d), window.__arena.dailyPlan(d + 1)]; });
  check('daily plan is the same for everyone on a day, different the next', JSON.stringify(plans[0]) === JSON.stringify(plans[1]) && JSON.stringify(plans[0]) !== JSON.stringify(plans[2]) && plans[0].rivals.length === 11 && !plans[0].rivals.includes(plans[0].fighter), plans[0]);
  check('daily card names the fighter and arena', /DAILY CHALLENGE #\d+/.test(await page.textContent('#arena-daily')) && /PLAY TODAY'S CHALLENGE/.test(await page.textContent('#arena-daily-go')));
  check('empty record shows a starter message', /Finish a match/.test(await page.textContent('#arena-record')));

  await page.click('#arena-daily-go'); await started(page);
  const s0 = await page.evaluate(() => window.__arena.state);
  check('daily match uses the planned fighter, rivals and arena', s0.mode === 'daily' && !s0.practice && s0.player.id === plans[0].fighter && JSON.stringify(s0.ids.slice(1)) === JSON.stringify(plans[0].rivals) && s0.arena === plans[0].arena, s0);
  const end = await playOut(page); await page.waitForTimeout(200);
  check('match ends with a placing; KOs and damage tracked', end.over && end.place >= 1 && end.place <= 12 && end.kos >= 0 && end.dmg >= 0, end);
  const res = await page.textContent('#arena-result');
  check('result card: placed, KOs, damage, survived + share', /DAILY CHALLENGE #/.test(res) && /Placed/.test(res) && /KOs/.test(res) && /Damage/.test(res) && /Survived/.test(res) && !!(await page.$('#arena-share')), res.replace(/\s+/g, ' '));
  await page.evaluate(() => { navigator.share = undefined; });
  await page.click('#arena-share'); await page.waitForTimeout(150);
  const txt = await page.evaluate(() => navigator.clipboard.readText());
  check('share text: daily number, medal/place, KOs, time, link', /^Pixel Arena Daily #\d+ (🥇|🥈|🥉|#\d+) \d+(st|nd|rd|th)\/12 · \d+ KOs? · \d+s\nhttps:\/\/www\.trainerdesk\.net\/arena$/u.test(txt), txt);
  check('daily card now shows today\'s result and offers practice', /Today:/.test(await page.textContent('#arena-daily')) && /PRACTICE/.test(await page.textContent('#arena-daily-go')));

  await page.click('#arena-daily-go'); await started(page);
  check('second daily run is practice', (await page.evaluate(() => window.__arena.state)).practice);
  await playOut(page); await page.waitForTimeout(200);
  check('practice result is labelled and has no share button', /PRACTICE RUN/.test(await page.textContent('#arena-result')) && !(await page.$('#arena-share')));
  const daily = await page.evaluate(() => JSON.parse(localStorage.getItem('td-arena-daily-v1')));
  check('official daily result kept (practice did not overwrite it)', daily.place === end.place && daily.kos === end.kos, { daily, end });

  await page.selectOption('#arena-fighter', { index: 2 }); await page.click('#arena-start'); await started(page);
  check('START is free play', (await page.evaluate(() => window.__arena.state)).mode === 'free');
  await playOut(page); await page.waitForTimeout(200);
  const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('td-arena-stats-v1')));
  check('record counts every finished match (3), daily streak 1', rec.played === 3 && rec.dStreak === 1 && Object.values(rec.by).reduce((n, v) => n + v.p, 0) === 3, rec);
  const lay = await page.evaluate(() => { const vw = document.documentElement.clientWidth; const small = [...document.querySelectorAll('#arena-daily button, #arena-result button')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height < 44; }).length; return { overflow: document.documentElement.scrollWidth - vw, small }; });
  check('375px: no sideways scroll, buttons >= 44px', lay.overflow <= 0 && !lay.small, lay);
  const errs = page.errors; await page.close();

  // offline (PokéAPI unreachable): the daily run falls back to sample fighters and must not count
  const ctx2 = await b.newContext({ viewport: { width: 375, height: 900 } });
  await ctx2.addInitScript(() => { try { localStorage.setItem('td-cookie-consent', 'denied'); } catch (e) {} });
  const off = await ctx2.newPage(); off.errors = []; off.on('pageerror', e => off.errors.push(e.message));
  await off.route('**/*', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
  await off.goto(base + '/arena'); await off.waitForSelector('#arena-daily-go');
  await off.click('#arena-daily-go'); await started(off);
  check('offline daily run is practice and says why', (await off.evaluate(() => window.__arena.state)).practice && /practice only/.test(await off.textContent('#arena-hud')));
  await playOut(off); await off.waitForTimeout(200);
  check('offline daily run not saved as the official result', !(await off.evaluate(() => localStorage.getItem('td-arena-daily-v1'))) && /PRACTICE RUN/.test(await off.textContent('#arena-result')));
  const errsOff = off.errors; await ctx2.close();

  page = await newPage(ctx, base);
  const r2 = await page.textContent('#arena-record');
  check('record survives a reload', /Matches\s*3/.test(r2) && /(Best fighter|Most played)/.test(r2) && /Daily streak\s*1/.test(r2), r2.replace(/\s+/g, ' '));
  check('no uncaught JS errors', !errs.length && !errsOff.length && !page.errors.length, errs.concat(errsOff, page.errors));
  await b.close(); close();
  console.log(failures ? `\n${failures} ARENA DAILY CHECK(S) FAILED` : '\nALL ARENA DAILY CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})();
