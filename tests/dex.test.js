// Usage: NODE_PATH=<global node_modules> node dex-test.js <path-to-index.html> <screenshot-dir>
const { chromium } = require('playwright');
const path = require('path');

const [,, htmlPath, shotDir] = process.argv;
const url = 'file://' + path.resolve(htmlPath);

const SPECIES = [
  [1,'bulbasaur'],[25,'pikachu'],[122,'mr-mime'],[152,'chikorita'],
  [252,'treecko'],[386,'deoxys'],[906,'sprigatito'],[1025,'pecharunt']
];
const PIKACHU = {
  id:25, name:'pikachu', height:4, weight:60,
  species:{name:'pikachu'},
  types:[{slot:1,type:{name:'electric'}}],
  abilities:[{slot:3,is_hidden:true,ability:{name:'lightning-rod'}},{slot:1,is_hidden:false,ability:{name:'static'}}],
  stats:[['hp',35],['attack',55],['defense',40],['special-attack',50],['special-defense',50],['speed',90]]
    .map(([n,v])=>({base_stat:v,stat:{name:n}}))
};

let failures = 0;
function check(label, ok, extra='') {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + label + (extra ? '  ' + extra : ''));
  if (!ok) failures++;
}

async function run(mode) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
  let pokeapiHits = 0;

  await page.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith('file://') ) return route.continue();
    if (mode === 'mock' && u.startsWith('https://pokeapi.co/api/v2/')) {
      pokeapiHits++;
      const p = u.replace('https://pokeapi.co/api/v2/', '');
      const cors = { 'access-control-allow-origin': '*' };
      if (p === 'pokemon-species?limit=1') return route.fulfill({ status:200, headers:cors, contentType:'application/json', body: JSON.stringify({count: SPECIES.length, results:[]}) });
      if (p === `pokemon-species?limit=${SPECIES.length}`) return route.fulfill({ status:200, headers:cors, contentType:'application/json',
        body: JSON.stringify({count: SPECIES.length, results: SPECIES.map(([id,name])=>({name, url:`https://pokeapi.co/api/v2/pokemon-species/${id}/`}))}) });
      if (p === 'pokemon/25') return route.fulfill({ status:200, headers:cors, contentType:'application/json', body: JSON.stringify(PIKACHU) });
      return route.fulfill({ status:404, headers:cors, body:'not found' });
    }
    return route.abort(); // everything else (fonts, TCG, feeds, offline mode) fails
  });

  await page.goto(url);
  await page.waitForTimeout(400);
  const hitsBeforeTab = pokeapiHits;
  await page.click('button[data-view="dex"]');
  await page.waitForSelector('#dex-grid .dex-tile', { timeout: 10000 });
  const tiles = () => page.$$eval('#dex-grid .dex-tile', els => els.map(e => e.querySelector('.dex-name').textContent));

  if (mode === 'mock') {
    check('lazy: no PokéAPI calls before the tab is opened', hitsBeforeTab === 0, `(hits=${hitsBeforeTab})`);
    let names = await tiles();
    check('mock: 8 species rendered', names.length === 8, JSON.stringify(names));
    check('mock: Mr. Mime override applied', names.includes('Mr. Mime'));
    check('mock: status shows species count', (await page.textContent('#dex-status')) === '8 species');

    await page.fill('#dex-search', 'pika');
    names = await tiles();
    check('search by name', names.length === 1 && names[0] === 'Pikachu', JSON.stringify(names));

    await page.fill('#dex-search', '#025');
    names = await tiles();
    check('search by #number', names.length === 1 && names[0] === 'Pikachu', JSON.stringify(names));

    await page.fill('#dex-search', 'zzzz');
    check('empty-state message shows', await page.isVisible('#dex-empty'));
    await page.fill('#dex-search', '');

    await page.selectOption('#dex-gen', '3');
    names = await tiles();
    check('generation filter (Gen 3 → Treecko, Deoxys)', JSON.stringify(names) === JSON.stringify(['Treecko','Deoxys']), JSON.stringify(names));
    await page.selectOption('#dex-gen', '9');
    names = await tiles();
    check('Gen 9 includes ids above 1025 boundary (906 and 1025)', JSON.stringify(names) === JSON.stringify(['Sprigatito','Pecharunt']), JSON.stringify(names));
    await page.selectOption('#dex-gen', 'all');

    await page.fill('#dex-search', 'pika');
    await page.click('#dex-grid .dex-tile');
    await page.waitForSelector('#dex-detail.open h2');
    const detail = await page.textContent('#dex-detail');
    check('detail: name', /Pikachu/.test(detail));
    check('detail: type badge', /electric/i.test(detail));
    check('detail: height/weight converted (4 dm → 0.4 m, 60 hg → 6.0 kg)', /0\.4 m/.test(detail) && /6\.0 kg/.test(detail));
    check('detail: hidden ability flagged', /Lightning Rod\s*\(hidden\)/.test(detail));
    check('detail: base stat total 320', /Base stat total:\s*320/.test(detail));
    check('detail: six stat rows', (await page.$$('#dex-detail .dex-stat')).length === 6);
    check('tile marked pressed', (await page.getAttribute('#dex-grid .dex-tile', 'aria-pressed')) === 'true');

    const hitsAfterFirst = pokeapiHits;
    await page.click('#dex-close');
    const closedState = await page.evaluate(() => ({
      open: document.getElementById('dex-detail').classList.contains('open'),
      shown: getComputedStyle(document.getElementById('dex-detail')).display !== 'none',
      pressed: document.querySelectorAll('#dex-grid .dex-tile[aria-pressed="true"]').length
    }));
    check('close button hides panel and clears selection', !closedState.open && !closedState.shown && closedState.pressed === 0, JSON.stringify(closedState));
    await page.click('#dex-grid .dex-tile');
    await page.waitForSelector('#dex-detail.open h2');
    check('detail cached: reopening does not refetch', pokeapiHits === hitsAfterFirst, `(hits ${hitsAfterFirst}→${pokeapiHits})`);

    // listing cached in sessionStorage → switching tabs and back must not refetch the list
    await page.click('button[data-view="go"]');
    await page.click('button[data-view="dex"]');
    check('re-opening tab does not refetch list', pokeapiHits === hitsAfterFirst);

    await page.fill('#dex-search', '');
    await page.screenshot({ path: path.join(shotDir, 'dex-desktop-detail.png'), fullPage: false });
  } else {
    const names = await tiles();
    check('offline: 5 sample species rendered', names.length === 5, JSON.stringify(names));
    check('offline: status says offline', /offline/.test(await page.textContent('#dex-status')));
    await page.fill('#dex-search', 'pika');
    await page.click('#dex-grid .dex-tile');
    await page.waitForSelector('#dex-detail.open h2');
    const detail = await page.textContent('#dex-detail');
    check('offline: sample detail renders (Pikachu, 320 total)', /Pikachu/.test(detail) && /Base stat total:\s*320/.test(detail));
    await page.fill('#dex-search', '');
    await page.screenshot({ path: path.join(shotDir, 'dex-offline.png') });
  }

  check(mode + ': no uncaught JS errors', errors.length === 0, errors.join(' | '));

  // other tabs still work
  await page.click('button[data-view="tcg"]');
  check(mode + ': TCG tab still visible', await page.isVisible('#view-tcg'));
  await page.click('button[data-view="go"]');
  check(mode + ': GO tab still visible', await page.isVisible('#view-go'));

  if (mode === 'mock') {
    // narrow viewport: header must contain all three tabs without overlapping page content
    await page.setViewportSize({ width: 375, height: 800 });
    await page.click('button[data-view="dex"]');
    await page.waitForTimeout(200);
    const geo = await page.evaluate(() => {
      const h = document.querySelector('header').getBoundingClientRect();
      const tabs = [...document.querySelectorAll('.tab')].map(t => t.getBoundingClientRect());
      const view = document.querySelector('.view.active').getBoundingClientRect();
      return { headerBottom: h.bottom, maxTabBottom: Math.max(...tabs.map(t => t.bottom)), maxTabRight: Math.max(...tabs.map(t => t.right)), viewTop: view.top, docW: document.documentElement.scrollWidth };
    });
    check('mobile: tabs sit inside header', geo.maxTabBottom <= geo.headerBottom + 1, JSON.stringify(geo));
    check('mobile: no horizontal overflow', geo.docW <= 376, JSON.stringify(geo));
    await page.screenshot({ path: path.join(shotDir, 'dex-mobile.png') });
  }
  await browser.close();
}

(async () => {
  await run('mock');
  await run('offline');
  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
