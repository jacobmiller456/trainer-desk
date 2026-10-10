// Cookie banner: shown on first visit, blocks analytics until accepted, remembers the choice.
// Usage: node tests/cookie.test.js index.html
const { chromium } = require('playwright');
const path = require('path');
const url = 'file://' + path.resolve(process.argv[2]);
let failures = 0;
const check = (l, ok, x) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + l + (ok || x === undefined ? '' : '  ' + JSON.stringify(x))); if (!ok) failures++; };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 375, height: 700 }, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', r => r.request().url().startsWith('file://') ? r.continue() : r.abort());
  const consentState = () => page.evaluate(() => [...window.dataLayer].filter(a => a[0] === 'consent').map(a => [a[1], a[2].analytics_storage]));

  await page.goto(url);
  check('banner visible on first visit', await page.isVisible('#cookie-banner'));
  check('analytics denied by default', JSON.stringify((await consentState())[0]) === '["default","denied"]', await consentState());

  await page.tap('#cookie-accept');
  check('banner hides after accept', !(await page.isVisible('#cookie-banner')));
  check('consent updated to granted', JSON.stringify((await consentState()).pop()) === '["update","granted"]', await consentState());

  await page.reload();
  check('choice remembered: banner stays hidden', !(await page.isVisible('#cookie-banner')));
  check('remembered grant restored before config', JSON.stringify((await consentState())[1]) === '["update","granted"]', await consentState());

  await page.tap('#cookie-settings');
  check('footer link reopens banner', await page.isVisible('#cookie-banner'));
  await page.tap('#cookie-decline');
  const last = (await consentState()).pop();
  check('decline revokes consent', JSON.stringify(last) === '["update","denied"]', last);
  await page.reload();
  const after = await consentState();
  check('declined choice remembered: banner hidden, analytics stay denied', !(await page.isVisible('#cookie-banner')) && after.length === 1 && after[0][1] === 'denied', after);
  check('no uncaught JS errors', !errors.length, errors);

  await browser.close();
  console.log(failures ? `\n${failures} COOKIE CHECK(S) FAILED` : '\nALL COOKIE CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})();
