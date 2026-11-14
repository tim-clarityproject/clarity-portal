// Comparing a built page with its mock-up, part by part (as compare-m9.mjs
// does for M9; shared here so each mock-up's comparison lists only its own
// screens, parts and meant differences). A part is
//   [name, the mock-up's selector, the built page's selector, which one (0 = first), what to compare]
// what: 'box' position and size; 'pos' where its words start; 'text' font,
// size, spacing and colour; 'edge' border colour and radius; 'foot' its
// place from the bottom of the screen.
export const TOL = 0.5;

export function makeReport() {
  const results = [];
  let failures = 0;
  const pass = (name, ok, detail = '') => {
    if (!ok) failures += 1;
    results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `: ${String(detail).slice(0, 300)}` : ''}`);
  };
  const note = (text) => results.push(`NOTE  ${text}`);
  return { results, pass, note, failures: () => failures };
}

// Runs in the page.
export function measureParts({ parts, mock, anchor, bottom }) {
  const q = (sel, nth, root = document) => [...root.querySelectorAll(sel)].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  })[nth] || null;
  const a = q(anchor, 0);
  const ar = a ? a.getBoundingClientRect() : { left: 0, top: 0 };
  // A mock-up's phone frame has a bezel: the screen ends inside it.
  const frame = typeof bottom === 'string' ? q(bottom, 0) : null;
  const foot = frame ? frame.getBoundingClientRect().bottom - parseFloat(getComputedStyle(frame).borderBottomWidth) : window.innerHeight;
  const rgb = (c) => c.replace(/\s+/g, '');
  // The part of a box that has ink in it: text lines, not the block's whole width.
  const ink = (el) => {
    if (el instanceof SVGElement) return el.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
    if (!rects.length) return el.getBoundingClientRect();
    return { left: Math.min(...rects.map((r) => r.left)), top: Math.min(...rects.map((r) => r.top)), right: Math.max(...rects.map((r) => r.right)), bottom: Math.max(...rects.map((r) => r.bottom)) };
  };
  const outp = {};
  for (const [name, mSel, bSel, nth] of parts) {
    const el = q(mock ? mSel : bSel, nth);
    if (!el) { outp[`${name}#${nth}`] = null; continue; }
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const i = ink(el);
    const svg = el instanceof SVGElement;
    outp[`${name}#${nth}`] = {
      x: r.left - ar.left, y: r.top - ar.top, w: r.width, h: r.height,
      ix: i.left - ar.left, iy: i.top - ar.top,
      fromBottom: foot - r.bottom, right: r.right - ar.left,
      font: cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(),
      size: parseFloat(cs.fontSize), weight: cs.fontWeight, ls: cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing),
      lh: cs.lineHeight === 'normal' ? 'normal' : parseFloat(cs.lineHeight), upper: cs.textTransform === 'uppercase',
      // An SVG mark's colours are its fill and stroke.
      colour: rgb(svg ? cs.fill : cs.color), fill: rgb(cs.backgroundColor),
      edge: svg ? `${parseFloat(cs.strokeWidth)}px ${rgb(cs.stroke)}` : `${parseFloat(cs.borderTopWidth)}px ${rgb(cs.borderTopColor)}`,
      radius: parseFloat(cs.borderTopLeftRadius),
    };
  }
  return outp;
}

// Runs in the page: every visible sentence, one line per block.
export function words({ root, hide }) {
  const el = [...document.querySelectorAll(root)].pop();
  if (!el) return [];
  const hidden = [...document.querySelectorAll(hide)];
  const was = hidden.map((h) => h.style.display);
  hidden.forEach((h) => { h.style.display = 'none'; });
  const lines = el.innerText.split('\n').map((t) => t.replace(/\s+/g, ' ').trim());
  for (const t of el.querySelectorAll('svg text')) lines.push(t.textContent.replace(/\s+/g, ' ').trim());
  for (const t of el.querySelectorAll('textarea, input')) if (t.value && t.checkVisibility?.()) lines.push(t.value.trim());
  for (const t of el.querySelectorAll('[placeholder]')) if (!t.value && t.checkVisibility?.()) lines.push(t.getAttribute('placeholder'));
  hidden.forEach((h, i) => { h.style.display = was[i]; });
  return [...new Set(lines.filter(Boolean))];
}

const near = (a, b, tol = TOL) => Math.abs(a - b) <= tol;

/**
 * Compares one screen's parts. `allowed(screen, part, what)` gives the
 * reason a difference is meant, or nothing. `mockName` is "M9" or "M10".
 */
export function compareParts({ report, allowed, mockName }, tag, screen, parts, m, b, phone) {
  const { pass, note } = report;
  for (const [name, , , nth, what] of parts) {
    const key = `${name}#${nth}`;
    const M = m[key];
    const B = b[key];
    if (!M) { note(`${tag}: ${mockName} doesn’t draw ${name} here`); continue; }
    if (!B) {
      const why = allowed(screen, name, 'missing');
      if (why) note(`${tag}: ${name} isn’t on the page, as meant: ${why}`);
      else pass(`${tag}: ${name} is on the page`, false, 'not found');
      continue;
    }
    const check = (label, ok, detail) => {
      const why = allowed(screen, name, label) || (phone && allowed(screen, name, `${label}@phone`));
      if (why && !ok) { note(`${tag}: ${name}, ${label} differs as meant (${detail}): ${why}`); return; }
      pass(`${tag}: ${name}, ${label}`, ok, detail);
    };
    const both = (x, y) => `${mockName} ${typeof x === 'number' ? x.toFixed(2) : x}, built ${typeof y === 'number' ? y.toFixed(2) : y}`;
    for (const w of what) {
      if (w === 'box') {
        check('left', near(M.x, B.x), both(M.x, B.x));
        check('top', near(M.y, B.y), both(M.y, B.y));
        check('width', near(M.w, B.w), both(M.w, B.w));
        check('height', near(M.h, B.h), both(M.h, B.h));
      } else if (w === 'size') {
        check('width', near(M.w, B.w), both(M.w, B.w));
        check('height', near(M.h, B.h), both(M.h, B.h));
      } else if (w === 'pos') {
        check('left', near(M.ix, B.ix), both(M.ix, B.ix));
        check('top', near(M.iy, B.iy), both(M.iy, B.iy));
      } else if (w === 'foot') {
        check('from the bottom', near(M.fromBottom, B.fromBottom), both(M.fromBottom, B.fromBottom));
        check('height', near(M.h, B.h), both(M.h, B.h));
        check('right edge', near(M.right, B.right), both(M.right, B.right));
        check('width', near(M.w, B.w), both(M.w, B.w));
      } else if (w === 'text') {
        check('font', M.font === B.font, both(M.font, B.font));
        check('text size', near(M.size, B.size, 0.01), both(M.size, B.size));
        check('letter-spacing', near(M.ls, B.ls, 0.05), both(M.ls, B.ls));
        check('capitals', M.upper === B.upper, both(M.upper, B.upper));
        check('colour', M.colour === B.colour, both(M.colour, B.colour));
      } else if (w === 'colour') {
        check('colour', M.colour === B.colour, both(M.colour, B.colour));
      } else if (w === 'fill') {
        check('fill', M.fill === B.fill, both(M.fill, B.fill));
      } else if (w === 'edge') {
        check('edge', M.edge === B.edge, both(M.edge, B.edge));
        if (!Number.isNaN(M.radius)) check('corners', near(M.radius, B.radius, 0.01) || (M.radius > 100 && B.radius > 100), both(M.radius, B.radius));
      }
    }
  }
}

/** Every sentence on one side must be on the other, unless listed as meant. */
export function compareWords({ report, mockOnly, builtOnly, mockName }, tag, screen, mw, bw) {
  const { pass, note } = report;
  const norm = (s) => s.replace(/ /g, ' ').replace(/[⁠​]/g, '').replace(/\s+/g, ' ').trim();
  const M = new Set(mw.map(norm));
  const B = new Set(bw.map(norm));
  const upper = new Set([...B].map((s) => s.toUpperCase()));
  const upperM = new Set([...M].map((s) => s.toUpperCase()));
  const skipM = new Map(mockOnly.get(screen) || []);
  const skipB = new Map(builtOnly.get(screen) || []);
  for (const s of M) {
    if (B.has(s) || upper.has(s.toUpperCase())) continue;
    if (skipM.has(s)) { note(`${tag}: ${mockName}’s “${s}” isn’t on the page, as meant: ${skipM.get(s)}`); continue; }
    pass(`${tag}: ${mockName}’s words “${s.slice(0, 90)}” are on the page`, false, 'missing');
  }
  for (const s of B) {
    if (M.has(s) || upperM.has(s.toUpperCase())) continue;
    if (skipB.has(s)) { note(`${tag}: the page’s “${s}” isn’t in ${mockName}, as meant: ${skipB.get(s)}`); continue; }
    pass(`${tag}: the page’s words “${s.slice(0, 90)}” are ${mockName}’s`, false, `not in ${mockName}`);
  }
  pass(`${tag}: every sentence compared`, true);
}
