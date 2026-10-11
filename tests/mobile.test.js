// Mobile layout guard: every tab, at common phone widths, offline (all network aborted).
// Usage: node tests/mobile.test.js index.html
const { chromium, devices } = require('playwright');
const path = require('path');

const url = 'file://' + path.resolve(process.argv[2]);
const WIDTHS = [320, 375, 414];
const TABS = ['go', 'tcg', 'dex', 'arena'];
const MIN_TAP = 44;      // px, Apple HIG / WCAG 2.5.5 target size
const MIN_FONT = 12;     // px, smallest readable body text
const MIN_PIXEL_FONT = 10; // px, Press Start 2P glyphs fill the whole em, so 10px reads like ~14px Inter
const MIN_INPUT_FONT = 16; // px, below this iOS Safari zooms the page on focus

let failures = 0;
function check(label, ok, extra) {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + label + (ok || !extra ? '' : '  ' + JSON.stringify(extra)));
  if (!ok) failures++;
}

function audit({ minTap, minFont, minPixelFont, minInputFont }) {
  const vw = document.documentElement.clientWidth;
  const visible = el => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const describe = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
    (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '');
  // Elements inside a deliberate horizontal scroller are allowed past the edge.
  const inScroller = el => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if ((ox === 'auto' || ox === 'scroll') && p.scrollWidth > p.clientWidth) return true;
    }
    return false;
  };
  const all = [...document.querySelectorAll('body *')].filter(visible);

  const overflowing = all.filter(el => {
    const r = el.getBoundingClientRect();
    return (r.right > vw + 1 || r.left < -1) && !inScroller(el);
  }).map(describe);

  const smallTaps = [...document.querySelectorAll('button, a[href], select, input, [role="button"], [tabindex]:not([tabindex="-1"])')]
    .filter(visible)
    .filter(el => {
      // Inline links inside running text are exempt (WCAG 2.5.8 inline exception).
      if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') return false;
      const r = el.getBoundingClientRect();
      return r.height < minTap || r.width < minTap;
    })
    .map(el => { const r = el.getBoundingClientRect(); return `${describe(el)} ${Math.round(r.width)}x${Math.round(r.height)}`; });

  const tinyText = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode());) {
    if (!n.textContent.trim() || !n.parentElement || !visible(n.parentElement)) continue;
    if (n.parentElement.closest('svg')) continue; // text drawn inside artwork, scales with the image
    const cs = getComputedStyle(n.parentElement), fs = parseFloat(cs.fontSize);
    if (fs < (/Press Start 2P/.test(cs.fontFamily) ? minPixelFont : minFont)) tinyText.push(`${describe(n.parentElement)} ${fs}px "${n.textContent.trim().slice(0, 20)}"`);
  }

  const zoomingInputs = [...document.querySelectorAll('input, select, textarea')].filter(visible)
    .filter(el => parseFloat(getComputedStyle(el).fontSize) < minInputFont)
    .map(el => `${describe(el)} ${getComputedStyle(el).fontSize}`);

  return {
    docOverflow: document.documentElement.scrollWidth - vw,
    overflowing: [...new Set(overflowing)].slice(0, 10),
    smallTaps: [...new Set(smallTaps)].slice(0, 10),
    tinyText: [...new Set(tinyText)].slice(0, 10),
    zoomingInputs,
  };
}

(async () => {
  const browser = await chromium.launch();

  // Static checks once.
  {
    const page = await browser.newPage();
    await page.route('**/*', r => r.request().url().startsWith('file://') ? r.continue() : r.abort());
    await page.goto(url);
    const vp = await page.$eval('meta[name="viewport"]', m => m.content).catch(() => '');
    check('viewport meta uses device-width', /width=device-width/.test(vp), vp);
    check('viewport meta does not block pinch-zoom', !/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?\b/.test(vp), vp);
    await page.close();
  }

  for (const width of WIDTHS) {
    const context = await browser.newContext({ ...devices['iPhone 13'], viewport: { width, height: 800 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', r => r.request().url().startsWith('file://') ? r.continue() : r.abort());
    await page.goto(url);

    for (const tab of TABS) {
      await page.tap(`button[data-view="${tab}"]`);
      // Let fallback data render (fetchWithTimeout aborts immediately here, but sections render async).
      await page.waitForTimeout(1200);
      const r = await page.evaluate(audit, { minTap: MIN_TAP, minFont: MIN_FONT, minPixelFont: MIN_PIXEL_FONT, minInputFont: MIN_INPUT_FONT });
      const tag = `${width}px ${tab}:`;
      check(`${tag} no horizontal page scroll`, r.docOverflow <= 0, { docOverflow: r.docOverflow });
      check(`${tag} no element past the screen edge`, !r.overflowing.length, r.overflowing);
      check(`${tag} tap targets >= ${MIN_TAP}px`, !r.smallTaps.length, r.smallTaps);
      check(`${tag} text >= ${MIN_FONT}px`, !r.tinyText.length, r.tinyText);
      check(`${tag} form fields >= ${MIN_INPUT_FONT}px (no iOS focus zoom)`, !r.zoomingInputs.length, r.zoomingInputs);
    }
    check(`${width}px: no uncaught JS errors`, !errors.length, errors);
    await context.close();
  }

  await browser.close();
  console.log(failures ? `\n${failures} MOBILE CHECK(S) FAILED` : '\nALL MOBILE CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})();
