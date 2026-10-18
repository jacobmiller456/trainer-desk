// GO event details on our site: cards open a details dialog (no direct off-site link on the card), facts from the feed,
// our own explainer, raid bosses with COUNTERS, spotlight bonus, promo code copy, add-to-calendar (.ics), share deep
// link, local vs worldwide time, escaping, deep link opens it. Usage: node tests/event-detail.test.js
const { chromium } = require('playwright');
const { serve } = require('./serve');
let failures = 0;
const check = (l, ok, x) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + l + (ok || x === undefined ? '' : '  ' + JSON.stringify(x))); if (!ok) failures++; };
const day = n => { const d = new Date(Date.now() + n * 864e5); return d.toISOString().slice(0, 10); };
const EVENTS = [
  { eventID: 'dialga-raids', name: 'Dialga in 5-star Raid Battles', eventType: 'raid-battles', heading: 'Raid Battles', link: 'https://leekduck.com/events/dialga-raids/',
    start: day(-1) + 'T10:00:00.000', end: day(3) + 'T22:00:00.000', extraData: { raidbattles: { bosses: [{ name: 'Dialga', canBeShiny: true }] }, generic: { hasSpawns: false, hasFieldResearchTasks: false } } },
  { eventID: 'stufful-spotlight', name: 'Stufful Spotlight Hour', eventType: 'pokemon-spotlight-hour', link: 'https://leekduck.com/events/x/',
    start: day(2) + 'T18:00:00.000', end: day(2) + 'T19:00:00.000', extraData: { spotlight: { name: 'Stufful', canBeShiny: true, bonus: '2× Transfer Candy', list: [{ name: 'Stufful', canBeShiny: true }] }, generic: { hasSpawns: true } } },
  { eventID: 'promo', name: 'Some <b>Timed</b> Research', eventType: 'research', link: 'https://leekduck.com/events/promo/',
    start: day(-5) + 'T10:00:00.000', end: day(40) + 'T20:00:00.000', extraData: { promocodes: ['ADIDASXPOKEMON', 'bad code!'], generic: { hasFieldResearchTasks: true } } },
  { eventID: 'sandile-hatch', name: 'Sandile Hatch Day', eventType: 'event', link: 'https://leekduck.com/events/sandile/',
    start: day(4) + 'T11:00:00.000', end: day(4) + 'T17:00:00.000', extraData: { generic: {} } },
  { eventID: 'halloween-2026-part-1', name: 'Pokémon GO Halloween 2026 Part I', eventType: 'event', link: 'https://leekduck.com/events/h/',
    start: day(6) + 'T10:00:00.000', end: day(10) + 'T10:00:00.000', extraData: { generic: {} } },
  { eventID: 'minior-showers-test-2099', name: 'Minior Showers: Test', eventType: 'event', link: 'https://leekduck.com/events/m/',
    start: day(7) + 'T17:00:00.000', end: day(9) + 'T23:59:00.000', extraData: { generic: {} } },
  { eventID: 'gbl', name: 'Great League', eventType: 'go-battle-league', link: 'https://leekduck.com/events/gbl/',
    start: day(1) + 'T20:00:00.000Z', end: day(8) + 'T20:00:00.000Z', extraData: { generic: {} } },
];

async function open(b, base, path = '/go') {
  const ctx = await b.newContext({ viewport: { width: 375, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('td-cookie-consent', 'denied'); } catch (e) {} });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await ctx.newPage(); page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
  await page.route('**/*', r => {
    const u = r.request().url();
    if (u.startsWith(base)) return r.continue();
    if (u.includes('events.json')) return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(EVENTS) });
    return r.abort();
  });
  await page.goto(base + path);
  await page.waitForFunction(() => document.querySelectorAll('#active-events .ev-more, #upcoming-events .ev-more').length === 7, null, { timeout: 15000 });
  return { ctx, page };
}
const body = page => page.textContent('#evd-body');
const openEv = async (page, id) => { await page.click(`.ev-more[data-ev="${id}"]`); await page.waitForTimeout(400); };

(async () => {
  const { base, close } = await serve();
  const b = await chromium.launch();
  let { ctx, page } = await open(b, base);
  check('event cards have a DETAILS button and no off-site link', (await page.$$eval('#active-events .ev a, #upcoming-events .ev a', a => a.length)) === 0);
  check('feed titles are escaped on cards', !(await page.$('#active-events .ev h3 b')) && /Some <b>Timed<\/b> Research/.test(await page.textContent('#active-events')));
  await openEv(page, 'dialga-raids');
  let t = await body(page);
  check('details dialog opens with type, title, dates, countdown and our explainer', await page.$eval('#ev-detail', d => d.open) && /RAID BATTLES/.test(t) && /Dialga in 5-star Raid Battles/.test(t) && /ends in/.test(t) && /Team up with other trainers/.test(t), t.replace(/\s+/g, ' '));
  check('local-time events say so', /Your local time/.test(t));
  check('raid boss listed (shiny marker) with COUNTERS', /RAID BOSS/.test(t) && /Dialga/.test(t) && !!(await page.$('#evd-body .evd-mons [title="Can be shiny"]')) && !!(await page.$('[data-evcounter="Dialga"]')));
  check('no off-site link in the dialog; source credited in text', !(await page.$('#evd-body a[href^="http"]')) && /ScrapedDuck/.test(t) && /LeekDuck/.test(t));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#evd-cal')]);
  const ics = require('fs').readFileSync(await dl.path(), 'utf8');
  check('ADD TO CALENDAR downloads an .ics with the event (local times have no Z)', /\.ics$/.test(dl.suggestedFilename()) && /BEGIN:VEVENT/.test(ics) && /SUMMARY:Dialga in 5-star Raid Battles/.test(ics) && /DTSTART:\d{8}T100000\r\n/.test(ics) && /go\?event=dialga-raids/.test(ics), ics);
  await page.evaluate(() => { navigator.share = undefined; });
  await page.click('#evd-share'); await page.waitForTimeout(150);
  check('SHARE copies a deep link to the event', /\/go\?event=dialga-raids$/.test(await page.evaluate(() => navigator.clipboard.readText())));
  await page.click('[data-evcounter="Dialga"]'); await page.waitForTimeout(500);
  check('COUNTERS closes the dialog and fills the type checker', !(await page.$eval('#ev-detail', d => d.open)) && (await page.inputValue('#tc-t1')) === 'steel' && (await page.inputValue('#tc-t2')) === 'dragon');
  await openEv(page, 'stufful-spotlight'); t = await body(page);
  check('spotlight: featured Pokémon and bonus line; spawns flag', /FEATURED POKÉMON/.test(t) && /Stufful/.test(t) && /Bonus during the hour: 2× Transfer Candy/.test(t) && /featured or boosted wild spawns/.test(t), t.replace(/\s+/g, ' '));
  await page.click('#evd-close');
  await openEv(page, 'promo'); t = await body(page);
  check('promo code shown (invalid ones dropped), COPY works', /ADIDASXPOKEMON/.test(t) && !/bad code/.test(t) && /Field Research/.test(t));
  await page.click('[data-code="ADIDASXPOKEMON"]'); await page.waitForTimeout(100);
  check('code copied', (await page.evaluate(() => navigator.clipboard.readText())) === 'ADIDASXPOKEMON');
  check('dialog title escaped', !(await page.$('#evd-name b')));
  await page.keyboard.press('Escape');
  await openEv(page, 'sandile-hatch'); t = await body(page);
  check('plain event without notes: name-based explainer (Hatch Day) instead of a generic line', /hatches from eggs far more often/.test(t), t.replace(/\s+/g, ' '));
  check('plain event: Pokémon from the title with types, our Pokédex page and counters', /POKÉMON IN THIS EVENT/.test(t) && /Sandile/.test(t) && /ground/.test(t) && (await page.getAttribute('#evd-body .evd-mon-acts a', 'href')) === '/pokedex/sandile' && !!(await page.$('[data-evcounter="Sandile"]')), t.replace(/\s+/g, ' '));
  await page.click('#evd-close');
  await openEv(page, 'dialga-raids'); await page.waitForTimeout(300);
  check('no duplicate Pokémon section when the boss list already covers it', !/POKÉMON IN THIS EVENT/.test(await body(page)));
  await page.click('#evd-close');
  await openEv(page, 'halloween-2026-part-1'); t = await body(page);
  check('hand-written notes shown for a known event, with checked date', /TRAINER DESK NOTES/.test(t) && /costumed Pikachu and Sinistea/i.test(t) && /Written by Trainer Desk/.test(t) && /checked/.test(t), t.replace(/\s+/g, ' ').slice(0, 400));
  await page.click('#evd-close');
  await openEv(page, 'minior-showers-test-2099'); t = await body(page);
  check('pattern notes cover a recurring series (Minior Showers)', /TRAINER DESK NOTES/.test(t) && /5–9 p\.m\./.test(t));
  await page.click('#evd-close');
  await openEv(page, 'dialga-raids');
  check('events without notes have no notes box', !/TRAINER DESK NOTES/.test(await body(page)));
  await page.click('#evd-close');
  await openEv(page, 'gbl'); t = await body(page);
  check('worldwide-time events say so', /same moment worldwide/.test(t));
  const lay = await page.evaluate(() => { const small = [...document.querySelectorAll('#ev-detail button, #ev-detail a.evd-src, .ev-more')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height < 44; }).length; return { small, overflow: document.getElementById('evd-body').scrollWidth - document.getElementById('evd-body').clientWidth, page: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
  check('375px: buttons/links >= 44px, no sideways scroll', !lay.small && lay.overflow <= 0 && lay.page <= 0, lay);
  const errs = page.errors; await ctx.close();
  ({ ctx, page } = await open(b, base, '/go?event=stufful-spotlight'));
  await page.waitForTimeout(500);
  check('deep link opens that event', await page.$eval('#ev-detail', d => d.open) && /Stufful Spotlight Hour/.test(await body(page)));
  check('no uncaught JS errors', !errs.length && !page.errors.length, errs.concat(page.errors));
  await b.close(); close();
  console.log(failures ? `\n${failures} EVENT DETAIL CHECK(S) FAILED` : '\nALL EVENT DETAIL CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})();
