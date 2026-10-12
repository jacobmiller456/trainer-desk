// Today tab: default landing view; event, Pokémon of the day, next set and arena cards; buttons navigate.
// Usage: node tests/today.test.js index.html
const { chromium } = require('playwright');
const path = require('path');
const url = 'file://' + path.resolve(process.argv[2]);
const cors = { 'access-control-allow-origin': '*' };
let failures = 0;
const check = (l, ok, x) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + l + (ok || x === undefined ? '' : '  ' + JSON.stringify(x))); if (!ok) failures++; };
const MON = id => ({ id, name: 'testmon', species: { name: 'testmon' }, height: 5, weight: 50, types: [{ slot: 1, type: { name: 'water' } }], abilities: [],
  stats: [['hp', 50], ['attack', 50], ['defense', 50], ['special-attack', 50], ['special-defense', 50], ['speed', 50]].map(([k, v]) => ({ base_stat: v, stat: { name: k } })) });

async function run(mode) {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 375, height: 800 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', r => {
    const u = r.request().url(); const m = u.match(/^https:\/\/pokeapi\.co\/api\/v2\/pokemon\/(\d+)$/);
    if (u.startsWith('file://')) return r.continue();
    const sp = u.match(/^https:\/\/pokeapi\.co\/api\/v2\/pokemon-species\/(\d+)$/);
    if (mode === 'mock' && sp) return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({
      genera: [{ genus: 'Wateroid', language: { name: 'en' } }, { genus: 'x', language: { name: 'fr' } }],
      flavor_text_entries: [
        { flavor_text: 'Old entry.', language: { name: 'en' }, version: { name: 'red' } },
        { flavor_text: 'Latest entry with a soft\u00ad\nhyphen\nand a break\fNext sentence.', language: { name: 'en' }, version: { name: 'scarlet' } },
        { flavor_text: 'Entrée française.', language: { name: 'fr' }, version: { name: 'x' } }] }) });
    if (mode === 'mock' && m) return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(MON(+m[1])) });
    return r.abort();
  });
  await page.goto(url);
  check(`${mode}: Today is the landing view`, (await page.isVisible('#view-today')) && !(await page.isVisible('#view-go')));
  await page.waitForFunction(() => !/Loading/.test(document.getElementById('today-potd').textContent), null, { timeout: 10000 });
  const t = id => page.textContent('#' + id);
  check(`${mode}: GO event card filled`, /GO|HAPPENING|NEXT/.test(await t('today-event')) && (await t('today-event')).length > 20);
  const potd = await t('today-potd');
  check(`${mode}: Pokémon of the day shown`, /POKÉMON OF THE DAY/.test(potd) && /Base stat total/.test(potd) && (mode !== 'mock' || /Testmon/.test(potd)), potd.slice(0, 120));
  if (mode === 'mock') {
    check('mock: Pokédex entry shown (latest English, cleaned, credited)', /“Latest entry with a softhyphen and a break Next sentence\.”/.test(potd) && /Pokémon Scarlet/.test(potd) && /via PokéAPI/.test(potd) && /Wateroid/.test(potd), potd);
    check('mock: older and non-English entries ignored', !/Old entry|Entrée/.test(potd));
  } else check('offline: no entry text, card still fine', !/Pokédex entry/.test(potd));
  check(`${mode}: next TCG set shown`, /TCG SET/.test(await t('today-set')));
  check(`${mode}: sprite falls back to a letter disc when the image fails`, (await page.$$eval('#today-potd .mono', n => n.length)) === 1 || (await page.$$eval('#today-potd img', n => n.length)) === 1);
  // buttons navigate
  await page.click('#today-event [data-goto]'); check(`${mode}: event button opens GO tab`, await page.isVisible('#view-go'));
  await page.click('button[data-view="today"]');
  await page.click('#today-set [data-goto]'); check(`${mode}: set button opens TCG tab`, await page.isVisible('#view-tcg'));
  await page.click('button[data-view="today"]');
  await page.click('#today-arena [data-goto]'); check(`${mode}: arena button opens Arena`, await page.isVisible('#view-arena'));
  await page.click('button[data-view="today"]');
  await page.click('#today-potd-btn'); check(`${mode}: Pokédex button opens the Pokédex`, await page.isVisible('#view-dex'));
  check(`${mode}: no uncaught JS errors`, !errors.length, errors);
  await b.close();
}
(async () => { await run('offline'); await run('mock'); console.log(failures ? `\n${failures} TODAY CHECK(S) FAILED` : '\nALL TODAY CHECKS PASSED'); process.exit(failures ? 1 : 0); })();
