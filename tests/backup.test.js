// Back up / restore (footer → "Back up / restore your data"): summary of what's saved, backup file contents (only the
// visitor's own data, no cookie consent or caches), restore on another device with a confirmation, undo, bad files,
// phone layout. Usage: node tests/backup.test.js
const { chromium } = require('playwright');
const { serve } = require('./serve');
const fs = require('fs'), os = require('os'), path = require('path');
let failures = 0;
const check = (l, ok, x) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + l + (ok || x === undefined ? '' : '  ' + JSON.stringify(x))); if (!ok) failures++; };
const SAVED = {
  'td-owned-v1': JSON.stringify({ sv3pt5: { name: '151', n: 207, have: ['1', '4', '199'] } }),
  'td-watch-v1': JSON.stringify({ 'sv3pt5-199': { name: 'Charizard ex', set: 'sv3pt5', p0: 250 } }),
  'td-binders-v1': JSON.stringify({ active: 'b1', binders: [{ id: 'b1', name: 'Main', cards: [{ id: 'sv3pt5-25' }, { id: 'sv3pt5-1' }] }] }),
  'td-deck-v1': '4 Pikachu ex SSP 57',
  'td-collection-v1': JSON.stringify({ c: [1, 4, 7], s: [4], l: [], h: [] }),
  'td-arena-stats-v1': JSON.stringify({ played: 12, wins: 3, stars: 25 }),
  'td-theme': 'dark',
};

async function open(b, base, store) {
  const ctx = await b.newContext({ viewport: { width: 375, height: 800 }, acceptDownloads: true });
  await ctx.addInitScript(st => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('td-cookie-consent', 'denied'); for (const [k, v] of Object.entries(st || {})) localStorage.setItem(k, v); }, store || null);
  const page = await ctx.newPage(); page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
  await page.route('**/*', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
  await page.goto(base + '/'); await page.waitForSelector('#backup-open');
  return { ctx, page };
}
const openDlg = async page => { await page.click('#backup-open'); await page.waitForFunction(() => document.getElementById('backup-dlg').open); };

(async () => {
  const { base, close } = await serve();
  const b = await chromium.launch();
  // device A: has data
  let { ctx, page } = await open(b, base, SAVED);
  await openDlg(page);
  const sum = (await page.textContent('#bk-sum')).replace(/\s+/g, ' ');
  check('dialog lists what is saved on this device', /Owned cards: 3 cards in 1 set/.test(sum) && /Watchlist: 1 card/.test(sum) && /Binders: 1 binder, 2 cards/.test(sum) && /A saved deck list/.test(sum) && /Pokédex collection: 3 caught marks, 1 shiny/.test(sum) && /Pixel Arena record: 12 matches, 25 ★/.test(sum) && /Your settings/.test(sum), sum);
  const lay = await page.evaluate(() => { const small = [...document.querySelectorAll('#backup-dlg button:not([hidden]), #backup-dlg label')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.height < 44 || r.width < 44); }).map(e => e.id || e.textContent); const r = document.getElementById('backup-dlg').getBoundingClientRect(); return { small, fits: r.left >= 0 && r.right <= innerWidth }; });
  check('375px: dialog fits, buttons 44px+', !lay.small.length && lay.fits, lay);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bk-save')]);
  const file = path.join(os.tmpdir(), 'td-backup-test-' + process.pid + '.json');
  await dl.saveAs(file); // the download is deleted when this context closes
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  check('BACK UP saves trainer-desk-backup-<date>.json', /^trainer-desk-backup-\d{4}-\d{2}-\d{2}\.json$/.test(dl.suggestedFilename()) && /Saved trainer-desk-backup/.test(await page.textContent('#bk-msg')), dl.suggestedFilename());
  check('backup file: the visitor\'s own data only (no cookie consent, no caches)', json.app === 'trainer-desk' && json.type === 'backup' && json.v === 1 && Object.keys(json.data).sort().join() === Object.keys(SAVED).concat('td-hub-days-v1').sort().join() /* + visit days, for the streak */ && !('td-cookie-consent' in json.data), Object.keys(json.data));
  const errsA = page.errors; await ctx.close();

  // device B: fresh, restores the file
  ({ ctx, page } = await open(b, base, { 'td-owned-v1': JSON.stringify({ sv1: { name: 'Scarlet & Violet', n: 258, have: ['5'] } }) }));
  await openDlg(page);
  await page.setInputFiles('#bk-file', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await page.waitForFunction(() => /isn't a Trainer Desk backup/.test(document.getElementById('bk-msg').textContent));
  check('a file that is not a backup is refused', true);
  await page.setInputFiles('#bk-file', file);
  await page.waitForFunction(() => !document.getElementById('bk-confirm').hidden);
  const conf = (await page.textContent('#bk-confirm')).replace(/\s+/g, ' ');
  check('restore asks first, showing what the backup holds', /Backup from/.test(conf) && /Owned cards: 3 cards in 1 set/.test(conf) && /will replace/.test(conf), conf);
  await Promise.all([page.waitForNavigation(), page.click('#bk-do')]);
  await page.waitForSelector('#backup-open');
  const after = await page.evaluate(() => ({ owned: localStorage.getItem('td-owned-v1'), deck: localStorage.getItem('td-deck-v1'), theme: document.documentElement.getAttribute('data-theme'), undo: !!localStorage.getItem('td-restore-undo'), consent: localStorage.getItem('td-cookie-consent') }));
  check('restored: data from the backup replaces this device\'s, settings applied, cookie choice untouched', after.owned === SAVED['td-owned-v1'] && after.deck === '4 Pikachu ex SSP 57' && after.theme === 'dark' && after.undo && after.consent === 'denied', after);
  await openDlg(page);
  check('UNDO LAST RESTORE offered', await page.isVisible('#bk-undo'));
  await Promise.all([page.waitForNavigation(), page.click('#bk-undo')]);
  await page.waitForSelector('#backup-open');
  const undone = await page.evaluate(() => ({ owned: localStorage.getItem('td-owned-v1'), deck: localStorage.getItem('td-deck-v1'), undo: localStorage.getItem('td-restore-undo') }));
  check('undo brings back what this device had before', /Scarlet & Violet/.test(undone.owned || '') && undone.deck === null && undone.undo === null, undone);
  const errsB = page.errors; await ctx.close();

  // nothing saved yet
  ({ ctx, page } = await open(b, base, {}));
  await openDlg(page);
  check('nothing saved: says so; BACK UP explains there is nothing to save', /Nothing saved on this device yet/.test(await page.textContent('#bk-sum')) && (await page.click('#bk-save'), /nothing to back up/.test(await page.textContent('#bk-msg'))));
  await page.click('#bk-close');
  check('Close closes the dialog', !(await page.evaluate(() => document.getElementById('backup-dlg').open)));
  check('no uncaught JS errors', !errsA.length && !errsB.length && !page.errors.length, errsA.concat(errsB, page.errors));
  await ctx.close();
  await b.close(); close(); fs.rmSync(file, { force: true });
  console.log(failures ? `\n${failures} BACKUP CHECK(S) FAILED` : '\nALL BACKUP CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})();
