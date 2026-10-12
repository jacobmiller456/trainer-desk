// GO tab Community Day section: next CD with featured/shiny Pokémon, bonuses, research name, link; schedule; offline message.
// Usage: node tests/community-day.test.js index.html
const { chromium } = require('playwright');
const path = require('path');
const url = 'file://' + path.resolve(process.argv[2]);
const cors = { 'access-control-allow-origin': '*' };
let failures = 0;
const check = (l, ok, x) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + l + (ok || x === undefined ? '' : '  ' + JSON.stringify(x))); if (!ok) failures++; };
const local = (days, h) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(h, 0, 0, 0); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(h)}:00:00.000`; };
const FEED = [
  { eventID: 'past-cd', name: 'Old Community Day', eventType: 'community-day', heading: 'Community Day', link: 'https://leekduck.com/events/old/', start: local(-30, 14), end: local(-30, 17), extraData: { generic: {} } },
  { eventID: 'next-cd', name: 'Zorua Community Day', eventType: 'community-day', heading: 'Community Day', link: 'https://leekduck.com/events/october-communityday2026/', start: local(3, 14), end: local(3, 17),
    extraData: { communityday: {
      spawns: [{ name: 'Zorua', image: 'x' }],
      bonuses: [{ text: 'Increased Spawns', image: 'x' }, { text: '3x Catch XP', image: 'x' }, { text: '1-hour Lures*', image: 'x' }],
      bonusDisclaimers: ['* Long disclaimer text that we do not import.'],
      shinies: [{ name: 'Zorua', image: 'x' }, { name: 'Zoroark', image: 'x' }],
      specialresearch: [{ name: "Trickster's Trail", step: 1, tasks: [{ text: 'Secret task text', reward: { text: 'x' } }], rewards: [] }, { name: "Trickster's Trail", step: 2, tasks: [], rewards: [] }] } } },
  { eventID: 'tba-cd', name: 'November Community Day', eventType: 'community-day', heading: 'Community Day', link: 'https://leekduck.com/events/nov/', start: local(40, 14), end: local(40, 17), extraData: { generic: {} } },
  { eventID: 'raid', name: 'Raid Hour', eventType: 'raid-hour', heading: 'Raid Hour', link: null, start: local(1, 18), end: local(1, 19), extraData: {} }
];

async function run(mode) {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 375, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', r => {
    const u = r.request().url();
    if (u.startsWith('file://')) return r.continue();
    if (mode === 'live' && /ScrapedDuck.*events\.json/.test(u)) return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(FEED) });
    if (mode === 'live' && u === 'https://pokeapi.co/api/v2/pokemon/zorua') return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ id: 570 }) });
    return r.abort();
  });
  await page.goto(url);
  await page.click('button[data-view="go"]');
  if (mode === 'offline') {
    await page.waitForTimeout(800);
    check('offline: section explains the feed is unreachable', /can't be reached/.test(await page.textContent('#cd-box')));
  } else {
    await page.waitForFunction(() => /Zorua Community Day/.test(document.getElementById('cd-box').textContent), null, { timeout: 10000 });
    const box = await page.textContent('#cd-box');
    check('next Community Day featured (not the past one)', /Zorua Community Day/.test(box) && !/Old Community Day/.test(box));
    check('featured Pokémon with shiny marker', /Zorua/.test(box) && /shiny available/.test(box));
    check('extra shiny listed', /Shiny also available: Zoroark/.test(box));
    check('bonuses listed, with own-words note for starred ones', (await page.$$eval('.cd-bonuses li', n => n.length)) === 3 && /Starred bonuses run longer/.test(box));
    check('disclaimer and research task text not imported', !/Long disclaimer/.test(box) && !/Secret task/.test(box));
    check('special research name shown once', (box.match(/Trickster's Trail/g) || []).length === 1);
    check('countdown running', /starts in \d/.test(box));
    check('link to full details', (await page.getAttribute('.cd-link', 'href')) === 'https://leekduck.com/events/october-communityday2026/');
    check('upcoming TBA Community Day in schedule', /November Community Day \(Pokémon TBA\)/.test(box));
    await page.waitForSelector('.cd-mon img', { timeout: 5000 }).catch(() => {});
    const src = await page.$eval('.cd-mon img', i => i.getAttribute('src')).catch(() => null);
    check('sprite resolved through PokéAPI', /\/570\.png$/.test(src || ''), src);
    check('footer credits LeekDuck', /sourced from LeekDuck/.test(await page.textContent('footer')));
  }
  check(`${mode}: no uncaught JS errors`, !errors.length, errors);
  await b.close();
}
(async () => { await run('live'); await run('offline'); console.log(failures ? `\n${failures} COMMUNITY DAY CHECK(S) FAILED` : '\nALL COMMUNITY DAY CHECKS PASSED'); process.exit(failures ? 1 : 0); })();
