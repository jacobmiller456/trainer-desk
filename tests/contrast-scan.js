// Shared helper: find visible text whose colour contrast against the colour actually behind it is below `min`.
// Walks up the tree for the first mostly-opaque background colour; gradients fall back to the theme's base colour.
module.exports = (min, baseBg) => {
  const parse = c => { const m = c && c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const mix = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const base = parse(baseBg);
  const bgOf = el => {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e), c = parse(cs.backgroundColor);
      if (c && c.a > 0.5) return c.a < 1 ? mix(c, base) : c;
      if (cs.backgroundImage && cs.backgroundImage !== 'none' && e !== document.body && e !== document.documentElement && !/url\(/.test(cs.backgroundImage)) {
        const m = cs.backgroundImage.match(/rgba?\([^)]+\)/); if (m) { const g = parse(m[0]); if (g && g.a > 0.5) return g; }
      }
    }
    return base;
  };
  const out = [], seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode());) {
    const t = n.nodeValue.trim(); if (!t || !/[A-Za-z0-9$#]/.test(t)) continue;
    const el = n.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
    if (el.closest('canvas,script,style,noscript,[hidden],[aria-hidden="true"],dialog:not([open]),option')) continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity < 0.3) continue;
    let o = 1; for (let e = el; e; e = e.parentElement) o *= +getComputedStyle(e).opacity; if (o < 0.3) continue;
    const fg0 = parse(cs.color); if (!fg0) continue;
    const bg = bgOf(el), fg = fg0.a < 1 ? mix(fg0, bg) : fg0;
    const L1 = lum(fg), L2 = lum(bg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize), large = size >= 18 || (size >= 14 && +cs.fontWeight >= 700) || /Press Start/.test(cs.fontFamily);
    if (ratio < (large ? Math.min(min, 3) : min)) out.push({ text: t.slice(0, 40), ratio: Math.round(ratio * 100) / 100, sel: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''), fg: cs.color, bg: `rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})` });
  }
  return out;
};
