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

// Follow-up 1 (Tim, 18 Nov, 15:57), against mock-ups drawn before it:
//   - text inputs and drop-downs are 56px (52px on a phone), so a one-line box is that height and a
//     box of several lines keeps its lines with the inputs' padding; what's below moves by the
//     difference (`FIELD`);
//   - a segmented switch is a quiet track (8px corners, no edge) with plain 16px words and a raised
//     tile for the chosen one (`SEG`); chips have 6px corners;
//   - Back's chevron is 10px from the tool's name, measured from the chevron's strokes (`BACK`): the
//     mock-ups put the name 14px after the chevron's square, which is where 10px from its strokes
//     lands, so the name keeps the mock-up's place (tidy pass follow-up 1, 23 Nov: the shift of 4px
//     read the 14px as from the strokes and left the name about 5px from them);
//   - a section heading over rows with their own lines has no line under it (`NO_LINE`);
//   - an Add has no "a" or "an", and "Add my to-do" is "Add to-do" (`ADD_WORDS`).
export const FIELD = 'text inputs and drop-downs are 56px, 52px on a phone (Tim, 18 Nov, follow-up 1)';
export const SEG = 'a segmented switch is a quiet track with plain 16px words and a raised tile for the chosen one (Tim, 18 Nov, follow-up 1)';
export const BACK = 'Back’s chevron is 10px from the name, measured from its strokes (Tim, 18 Nov, follow-up 1)';
export const NO_LINE = 'no line under a section heading over rows with their own lines (Tim, 18 Nov, follow-up 1)';
export const ADD_WORDS = 'no “a” or “an” in an Add, and “Add my to-do” is “Add to-do” (Tim, 18 Nov, follow-up 1)';
const BACK_SHIFT = 0;
const SEG_PAD = 3;
const fieldH = (phone) => (phone ? 52 : 56);
/** An Add's words as follow-up 1 has them. */
export const newAddWords = (t) => t.replace(/^(add) (?:a|an) /i, '$1 ').replace(/^(add) my (to-do)$/i, '$1 $2');

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
  const FIELDS = 'input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea, select, .ds-field, .ds-dd, .ds-num--box, .ds-text, .ds-grow, .si-inp, .auth-input, .plan-input';
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
      // Follow-up 1 (Tim, 18 Nov, 15:57): a field, a segmented switch's option or track, a chip, and the line under it.
      field: !mock && el.matches(FIELDS), seg: !mock && el.matches('.ds-seg-btn'), segTrack: !mock && el.matches('.ds-seg'),
      chip: !mock && el.matches('.ds-chip'), under: parseFloat(cs.borderBottomWidth) || 0,
      // In a bar fixed to the screen (the guided tools' foot), so it never moves the page. A layer
      // fixed over the whole screen (a guided tool's own frame) is the page itself, not a bar.
      fixed: !!el.closest('.ds-guide-foot, .ds-bottombar') || (() => { for (let x = el; x && x !== document.body; x = x.parentElement) { const pos = getComputedStyle(x).position; if ((pos === 'fixed' || pos === 'sticky') && x.getBoundingClientRect().height < innerHeight / 2) return true; } return false; })(),
      // As tall as the screen (a side panel): it never gets shorter for what is inside it.
      screen: r.height >= innerHeight - 2,
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
    if (B.seg || B.segTrack) { newSeg(check, both, M, B, what, phone); continue; }
    for (const w of what) {
      if (w === 'box') {
        check('left', near(M.x, B.x), both(M.x, B.x));
        check('top', near(M.y, B.y), both(M.y, B.y));
        check('width', near(M.w, B.w), both(M.w, B.w));
        heightCheck(check, both, M, B, phone);
      } else if (w === 'size') {
        check('width', near(M.w, B.w), both(M.w, B.w));
        heightCheck(check, both, M, B, phone);
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
        if (B.chip) check('corners', near(B.radius, 6, 0.01), `a chip’s 6, built ${B.radius}`);
        else if (!Number.isNaN(M.radius)) check('corners', near(M.radius, B.radius, 0.01) || (M.radius > 100 && B.radius > 100), both(M.radius, B.radius));
      }
    }
  }
}

/** A part's height: a field's is follow-up 1's; a heading that lost its line under it is that much shorter. */
export function heightCheck(check, both, M, B, phone) {
  if (B.field && !near(M.h, B.h)) {
    if (M.h <= 60) check('height', near(B.h, fieldH(phone)), `${both(M.h, B.h)}, a field’s ${fieldH(phone)}`);
    else check('height', B.h <= M.h + TOL && B.h >= M.h - 8, `${both(M.h, B.h)}, several lines with the inputs’ padding`);
    return;
  }
  if (M.under > 0 && B.under === 0 && !B.field) {
    check('height', near(M.h - M.under, B.h) || near(M.h, B.h), `${both(M.h, B.h)}, with no line under it`);
    return;
  }
  check('height', near(M.h, B.h), both(M.h, B.h));
}

/**
 * A segmented switch, against a mock-up drawn before follow-up 1: the track is the family's height
 * (40px, 44px on a phone), 8px corners and no edge, its left or right edge on the mock-up's; each
 * option is 6px less than the track, its words DM Sans 16px weight 400 with at least 16px each side,
 * no fill of its own (the raised tile behind the chosen one) and 6px corners. Its place along the
 * track follows its new words' widths, so only its top is held to the mock-up's (within the track's
 * 3px padding).
 */
export function newSeg(check, both, M, B, what, phone) {
  const tall = phone ? 44 : 40;
  for (const w of what) {
    if (B.segTrack) {
      if (w === 'box' || w === 'size') {
        check('height', near(B.h, tall, 1), `${both(M.h, B.h)}, the track’s ${tall}`);
        if (w === 'box') {
          check('left', near(M.x, B.x) || near(M.x + M.w, B.x + B.w) || near(M.w, B.w), `${both(M.x, B.x)}, its left or right edge on the mock-up’s`);
          check('top', Math.abs(M.y + M.h / 2 - (B.y + B.h / 2)) <= Math.abs(M.h - tall) / 2 + 1, `${both(M.y, B.y)}, centred on the mock-up’s`);
        }
      } else if (w === 'edge') {
        check('edge', B.edge.startsWith('0px'), `the track has no edge, built ${B.edge}`);
        check('corners', near(B.radius, 8, 0.01), `the track’s 8, built ${B.radius}`);
      }
      continue;
    }
    if (w === 'box' || w === 'size') {
      check('height', near(B.h, tall - 2 * SEG_PAD, 1), `${both(M.h, B.h)}, an option’s ${tall - 2 * SEG_PAD}`);
      check('width', B.w >= B.wordsW + 32 - 1, `${both(M.w, B.w)}, at least its words plus 16px each side (${(B.wordsW + 32).toFixed(2)})`);
      if (w === 'box') check('top', Math.abs(M.y + M.h / 2 - (B.y + B.h / 2)) <= Math.abs(M.h - (tall - 2 * SEG_PAD)) / 2 + SEG_PAD + TOL, `${both(M.y, B.y)}, centred in the mock-up’s slot`);
    } else if (w === 'pos' || w === 'words') {
      check('left', B.ix >= B.x - TOL && B.ix <= B.x + B.w + TOL, `${B.ix.toFixed(2)}, its words inside the option`);
    } else if (w === 'text') {
      check('font', B.font === 'DM Sans', `the option’s DM Sans, built ${B.font}`);
      check('text size', near(B.size, 16, 0.01), `the option’s 16, built ${B.size}`);
      check('capitals', B.upper === false, 'the option is in sentence case');
    } else if (w === 'weight') {
      check('weight', B.weight === '400', `the option’s 400, built ${B.weight}`);
    } else if (w === 'fill') {
      check('fill', /rgba\(0,0,0,0\)|transparent/.test(B.fill), `no fill of its own (the tile is behind it), built ${B.fill}`);
    } else if (w === 'edge') {
      check('corners', near(B.radius, 6, 0.01), `the option’s 6, built ${B.radius}`);
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
  // What gives back height (follow-up 1 adds fields, segmented tracks and a heading's lost line).
  const gives = (key, M, B) => {
    if (B.fixed) return 0;
    if (B.btn) return M.h > tall ? M.h - tall : 0;
    if (B.segTrack) return M.h - B.h;
    if (B.field) return Math.abs(M.h - B.h) >= TOL ? M.h - B.h : 0;
    if (M.under > 0 && B.under === 0) return near(M.h, B.h) ? 0 : M.under;
    return 0;
  };
  for (const [key, B] of Object.entries(b)) {
    const M = m[key];
    if (!M || !B) continue;
    const by = gives(key, M, B);
    if (!by) continue;
    // A part beside it as tall as its row (the timer's ring) keeps the row's height.
    const beside = B.btn && all.some(([k, P]) => k !== key && !b[k]?.btn && !b[k]?.field && P.y <= M.y + TOL && P.y + P.h >= M.y + M.h - TOL && (P.x + P.w <= M.x + TOL || P.x >= M.x + M.w - TOL));
    if (beside) continue;
    // Parts inside one another, or side by side on one row, give it back once.
    if (rows.some((r) => Math.abs(r.top - M.y) < 1 || (r.top <= M.y + TOL && r.foot >= M.y + M.h - TOL))) continue;
    for (let i = rows.length - 1; i >= 0; i -= 1) if (M.y <= rows[i].top + TOL && M.y + M.h >= rows[i].foot - TOL) rows.splice(i, 1);
    rows.push({ top: M.y, foot: M.y + M.h, left: M.x, right: M.x + M.w, by, field: Boolean(B.field) });
  }
  const out = {};
  for (const [key, M] of Object.entries(m)) {
    if (!M) { out[key] = M; continue; }
    // Back's chevron is 4px nearer the tool's name.
    const back = /^the tool’s name/.test(key) ? BACK_SHIFT : 0;
    const by = rows.filter((r) => r.foot <= M.y + TOL).reduce((n, r) => n + r.by, 0);
    // A part that holds one (a card) is that much shorter.
    const own = b[key] && gives(key, M, b[key]);
    const inside = own || b[key]?.screen ? 0 : rows.filter((r) => M.y <= r.top + TOL && M.y + M.h >= r.foot - TOL && M.x <= r.left + TOL && M.x + M.w >= r.right - TOL && !(near(M.y, r.top) && near(M.y + M.h, r.foot))).reduce((n, r) => n + r.by, 0);
    // A part beside a field on its row (its remove crosshair) stays on the field's middle.
    const band = own ? 0 : (rows.find((r) => r.field && M.y >= r.top - TOL && M.y + M.h <= r.foot + TOL && !(near(M.y, r.top) && near(M.y + M.h, r.foot)))?.by || 0) / 2;
    const by2 = by + band;
    out[key] = by2 || inside || back ? { ...M, x: M.x - back, ix: M.ix - back, y: M.y - by2, iy: M.iy - by2, h: M.h - inside, ...(M.tx != null ? { tx: M.tx - back } : {}), ...(M.ty != null ? { ty: M.ty - by2 } : {}) } : M;
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
  const addM = new Set([...M].map((s) => newAddWords(s).toUpperCase()));
  for (const s of M) {
    if (B.has(s) || upper.has(s.toUpperCase())) continue;
    if (newAddWords(s) !== s && upper.has(newAddWords(s).toUpperCase())) { note(`${tag}: ${mockName}’s “${s}” reads “${newAddWords(s)}”, as meant: ${ADD_WORDS}`); continue; }
    if (skipM.has(s)) { note(`${tag}: ${mockName}’s “${s}” isn’t on the page, as meant: ${skipM.get(s)}`); continue; }
    pass(`${tag}: ${mockName}’s words “${s.slice(0, 90)}” are on the page`, false, 'missing');
  }
  for (const s of B) {
    if (M.has(s) || upperM.has(s.toUpperCase())) continue;
    if (addM.has(s.toUpperCase())) continue;
    if (skipB.has(s)) { note(`${tag}: the page’s “${s}” isn’t in ${mockName}, as meant: ${skipB.get(s)}`); continue; }
    pass(`${tag}: the page’s words “${s.slice(0, 90)}” are ${mockName}’s`, false, `not in ${mockName}`);
  }
  pass(`${tag}: every sentence compared`, true);
}
