// Comparing a built page with its mock-up, part by part (as compare-m9.mjs
// does for M9; shared here so each mock-up's comparison lists only its own
// screens, parts and meant differences). A part is
//   [name, the mock-up's selector, the built page's selector, which one (0 = first), what to compare]
// what: 'box' position and size; 'pos' where its words start; 'text' font,
// size, spacing and colour; 'edge' border colour and radius; 'foot' its
// place from the bottom of the screen; 'under' its bottom edge (a heading's
// line); 'band' a bar's height and place from the bottom; 'weight' the
// font's weight; 'words' where its first words start (for a line that
// holds an icon or a button as well).
export const TOL = 0.5;

// A guided tool's bottom bar, or a page's, with the new buttons (Tim, 18 Nov): the button is 34px
// (40px on a phone), so the bar is as tall as its 44px text link, 4px less than with the 48px pill,
// and a link in it sits 2px lower; a button in it is checked inside the pill's slot.
export const NEW_NOTE = 'the note beside a button sits 16px after it, centred on it, and the new button is its words plus 14px each side and 34px high, smaller than the mock-up’s pill (Tim, 18 Nov)';
export const NEW_BAR_H = 'the bar holds the new 34px button (40px on a phone), so it is 14px (8px) shorter than round the mock-up’s 48px pill (Tim, 18 Nov)';
export const NEW_CARD = 'the card holds a new 34px button (40px on a phone), so it is 14px (8px) shorter than round the mock-up’s 48px pill (Tim, 18 Nov)';
export const NEW_BAR = 'the new 34px button leaves the bar as tall as its 44px text link, 4px shorter than with the mock-up’s 48px pill, so the link sits 2px lower (Tim, 18 Nov)';

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
  const NEW_BUTTONS = '.ds-btn--primary, .ds-btn--outline, .ui-btn-primary, .ui-btn-ghost, .auth-btn-primary, .auth-btn-ghost, .dng, .si-btn, .ds-focus-done';
  const NEW_PRIMARY = '.ds-btn--primary, .ui-btn-primary, .auth-btn-primary, .si-btn';
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
    // Where its own words start: the first piece of text, whatever icon or button sits in the line with it.
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let first = null;
    while (!first && walker.nextNode()) if (walker.currentNode.textContent.trim()) first = walker.currentNode;
    let t = i;
    if (first && !svg) {
      const tr = document.createRange();
      tr.selectNodeContents(first);
      t = [...tr.getClientRects()].find((x) => x.width > 0 && x.height > 0) || i;
    }
    outp[`${name}#${nth}`] = {
      tx: t.left - ar.left, ty: t.top - ar.top,
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
      // The new buttons (Tim, 18 Nov): on the built page, whether this part is one, or an add row,
      // with its words' own width and its drawn hairline or highlight.
      btn: !mock && el.matches(NEW_BUTTONS), addrow: !mock && el.matches('.ds-addrow'),
      primary: !mock && el.matches(NEW_PRIMARY), wordsW: i.right - i.left, shadow: cs.boxShadow,
      // In a bar fixed to the screen (the guided tools' foot), so it never moves the page.
      fixed: (() => { for (let x = el; x && x !== document.body; x = x.parentElement) { const pos = getComputedStyle(x).position; if (pos === 'fixed' || pos === 'sticky') return true; } return false; })(),
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
  m = shiftForNewButtons(m, b, phone);
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
    if (B.btn || B.addrow) { newButton(check, both, M, B, what, phone); continue; }
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
      } else if (w === 'words') {
        check('left', near(M.tx, B.tx), both(M.tx, B.tx));
        check('top', near(M.ty, B.ty), both(M.ty, B.ty));
      } else if (w === 'under') {
        check('bottom edge', near(M.y + M.h, B.y + B.h), both(M.y + M.h, B.y + B.h));
      } else if (w === 'band') {
        check('from the bottom', near(M.fromBottom, B.fromBottom), both(M.fromBottom, B.fromBottom));
        check('height', near(M.h, B.h), both(M.h, B.h));
      } else if (w === 'weight') {
        check('weight', M.weight === B.weight, both(M.weight, B.weight));
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

/**
 * A button or add row on the built page, against a mock-up drawn before the
 * new buttons (Quiet precision; Tim, 18 Nov 2026). The mock-up's pill gives
 * the slot: the button sits in it (its left, right or middle on the
 * mock-up's, its top and foot inside the mock-up's height) and is drawn in
 * the new style: 34px high (40px on a phone), as wide as the mock-up's or
 * its words plus 14px each side, DM Sans 14px in sentence case, letter-
 * spacing -0.005em, 8px corners, no border, the coral button's highlight
 * or the hairline. An add row: the slot's left, at least as wide, at least
 * 48px high, DM Sans 16px, no box. Its words' colour is the coral
 * button's (black) or, on every other button and the add row, the
 * secondary grey, which the mock-ups don't draw.
 */
export function newButton(check, both, M, B, what, phone) {
  const tall = phone ? 44 : 40; // follow-up 1 (Tim, 18 Nov, 15:57)
  const inSlot = (from, to, x) => x >= from - TOL && x <= to + TOL;
  for (const w of what) {
    if (B.addrow) {
      if (['box', 'size', 'foot'].includes(w)) {
        if (w === 'box') {
          check('left', near(M.x, B.x), both(M.x, B.x));
          check('top', Math.abs(M.y + M.h / 2 - (B.y + B.h / 2)) <= Math.max(4, Math.abs(48 - M.h) / 2) + TOL, `${both(M.y, B.y)}, as the add row, centred within the slot`);
        }
        check('width', B.w >= M.w - TOL, `${both(M.w, B.w)}, as the add row, the list’s full width`);
        check('height', B.h >= 47.5, `${B.h.toFixed(2)}, as the add row, at least 48`);
      } else if (w === 'pos') {
        check('left', near(M.ix, B.ix, 32), `${both(M.ix, B.ix)}, as the add row, its words after the cross`);
      } else if (w === 'text') {
        check('font', B.font === 'DM Sans', `the add row’s DM Sans, built ${B.font}`);
        check('text size', near(B.size, 16, 0.01), `the add row’s 16, built ${B.size}`);
        check('capitals', B.upper === false, 'the add row is in sentence case');
      } else if (w === 'edge') {
        check('edge', B.edge.startsWith('0px') && (!B.shadow || B.shadow === 'none'), `the add row has no box, built ${B.edge} ${B.shadow}`);
      }
      continue;
    }
    if (w === 'box' || w === 'size' || w === 'foot') {
      const width = near(M.w, B.w) || near(B.w, B.wordsW + 32, 1);
      check('width', width, `${both(M.w, B.w)}, or its words plus 16px each side (${(B.wordsW + 32).toFixed(2)})`);
      check('height', near(B.h, tall), `${both(M.h, B.h)}, as the new button, ${tall}`);
      if (w === 'box') {
        check('left', near(M.x, B.x) || near(M.x + M.w, B.x + B.w) || near(M.x + M.w / 2, B.x + B.w / 2), `${both(M.x, B.x)}, its left, right or middle on the mock-up’s`);
        check('top', inSlot(M.y, M.y + M.h - tall, B.y), `${both(M.y, B.y)}, inside the mock-up’s ${M.h.toFixed(0)}px`);
      }
      if (w === 'foot') {
        check('from the bottom', inSlot(M.fromBottom, M.fromBottom + M.h - tall, B.fromBottom), `${both(M.fromBottom, B.fromBottom)}, inside the mock-up’s ${M.h.toFixed(0)}px`);
        check('right edge', near(M.right, B.right) || near(M.x, B.x) || near(M.x + M.w / 2, B.x + B.w / 2), `${both(M.right, B.right)}, its right, left or middle on the mock-up’s`);
      }
    } else if (w === 'pos' || w === 'words') {
      check('left', inSlot(M.x, M.x + M.w, B.ix), `${both(M.ix, B.ix)}, its words inside the mock-up’s button`);
    } else if (w === 'text') {
      check('font', B.font === 'DM Sans', `the new button’s DM Sans, built ${B.font}`);
      check('text size', near(B.size, 16, 0.01), `the new button’s 16, built ${B.size}`);
      check('letter-spacing', near(B.ls, -0.005 * B.size, 0.02), `the new button’s -0.005em, built ${B.ls}`);
      check('capitals', B.upper === false, 'the new button is in sentence case');
      if (B.primary) check('colour', M.colour === B.colour, both(M.colour, B.colour));
    } else if (w === 'weight') {
      check('weight', B.weight === (B.primary ? '450' : '400'), `the new button’s ${B.primary ? 450 : 400}, built ${B.weight}`);
    } else if (w === 'fill') {
      check('fill', B.primary ? M.fill === B.fill : /rgba\(0,0,0,0\)|transparent/.test(B.fill), both(M.fill, B.fill));
    } else if (w === 'edge') {
      check('edge', B.edge.startsWith('0px'), `the new button has no border, built ${B.edge}`);
      check('corners', near(B.radius, 8, 0.01), `the new button’s 8, built ${B.radius}`);
      check(B.primary ? 'highlight' : 'hairline', B.primary ? /rgba\(255, 255, 255, 0\.28\).*inset|inset.*rgba\(255, 255, 255, 0\.28\)/.test(B.shadow) : /0px 0px 0px 1px inset/.test(B.shadow), `built ${B.shadow}`);
    } else if (w === 'colour') {
      if (B.primary) check('colour', M.colour === B.colour, both(M.colour, B.colour));
    } else if (w === 'under') {
      check('bottom edge', inSlot(M.y + tall, M.y + M.h, B.y + B.h), `${both(M.y + M.h, B.y + B.h)}, inside the mock-up’s slot`);
    } else if (w === 'band') {
      check('height', near(B.h, tall), `as the new button, ${tall}, built ${B.h}`);
    }
  }
}

/**
 * A mock-up's measurements with everything below a new button moved up by
 * the height it gave back (the mock-up's pill less 34px, or 40px on a
 * phone; buttons side by side on one row give it back once). Parts held to
 * the screen's foot (`fromBottom`) don't move. `m` and `b` are the two
 * pages' measurements by part; a button counts where the built page has it.
 */
export function shiftForNewButtons(m, b, phone) {
  const tall = phone ? 44 : 40;
  const rows = [];
  const all = Object.entries(m).filter(([, M]) => M);
  for (const [key, B] of Object.entries(b)) {
    const M = m[key];
    if (!M || !B || !B.btn || B.fixed || M.h <= tall) continue;
    // A part beside the button as tall as its row (the timer's ring) keeps the row's height.
    const beside = all.some(([k, P]) => k !== key && !b[k]?.btn && P.y <= M.y + TOL && P.y + P.h >= M.y + M.h - TOL && (P.x + P.w <= M.x + TOL || P.x >= M.x + M.w - TOL));
    if (beside) continue;
    if (!rows.some((r) => Math.abs(r.top - M.y) < 1)) rows.push({ top: M.y, foot: M.y + M.h, left: M.x, right: M.x + M.w, by: M.h - tall });
  }
  if (!rows.length) return m;
  const out = {};
  for (const [key, M] of Object.entries(m)) {
    if (!M) { out[key] = M; continue; }
    const by = rows.filter((r) => r.foot <= M.y + TOL).reduce((n, r) => n + r.by, 0);
    // A part that holds a button (a card) is that much shorter.
    const inside = b[key]?.btn ? 0 : rows.filter((r) => M.y <= r.top + TOL && M.y + M.h >= r.foot - TOL && M.x <= r.left + TOL && M.x + M.w >= r.right - TOL).reduce((n, r) => n + r.by, 0);
    out[key] = by || inside ? { ...M, y: M.y - by, iy: M.iy - by, h: M.h - inside, ...(M.ty != null ? { ty: M.ty - by } : {}) } : M;
  }
  return out;
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
