// Every button in the new style (Quiet precision; Tim, 18 Nov 2026), read on
// the page as it is drawn. Run in the page: page.evaluate(buttonProblems,
// { phone, scale }). It gives one line per problem:
//
//   - the look (follow-up 1, Tim, 18 Nov, 15:57): DM Sans, weight 400
//     (the coral button 450), sentence case (no capitals by CSS),
//     letter-spacing -0.005em, 8px corners, 16px in at each side, and at
//     the standard text size 16px words, 40px high (44px on a phone);
//   - the main button: flat coral with the faint top highlight; every
//     other button: no fill and a 1px hairline drawn as an inset shadow;
//   - at the standard text size no button's words wrap onto a second line;
//     at larger sizes they may wrap onto centred lines (Tim: WCAG resize
//     text), but are never cut off and the button never runs out of the
//     box it sits in;
//   - at most one coral button on the screen's top layer (an open panel,
//     else the page);
//   - every add row: at least 48px high, its 18px square with the cross,
//     16px words (at the standard size), no box and no outline.
//
// The tap area (44px through the button's ::after) is the calm-rules
// suite's own check, as for every control.
export function buttonProblems({ phone, scale = 1 }) {
  const FAMILIES = '.ds-btn--primary, .ds-btn--outline, .ui-btn-primary, .ui-btn-ghost, .auth-btn-primary, .auth-btn-ghost, .dng, .si-btn, .ds-focus-done';
  const PRIMARY = '.ds-btn--primary, .ui-btn-primary, .auth-btn-primary, .si-btn';
  const vis = (el) => {
    const b = el.getBoundingClientRect();
    if (!(b.width > 0 && b.height > 0)) return false;
    if (el.closest('[hidden],[inert],[aria-hidden=true]')) return false;
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      const st = getComputedStyle(p);
      if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) < 0.05) return false;
    }
    return true;
  };
  const name = (el) => `"${(el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 32)}"`;
  const near = (a, b, tol = 0.6) => Math.abs(a - b) <= tol;
  const out = [];
  // The screen's top layer: an open panel, dialog or the phone's menu (over its scrim), else the page.
  const top = [...document.querySelectorAll('[role=dialog], [aria-modal=true], .ds-guide--fullscreen, .ds-tmenu')].filter(vis).pop() || document.body;
  const buttons = [...top.querySelectorAll(FAMILIES)].filter(vis);
  for (const el of buttons) {
    const cs = getComputedStyle(el);
    const b = el.getBoundingClientRect();
    const fs = parseFloat(cs.fontSize);
    const bad = [];
    if (!/^"?DM Sans/.test(cs.fontFamily)) bad.push(`font ${cs.fontFamily.split(',')[0]}`);
    const wantWeight = el.matches(PRIMARY) ? '450' : '400';
    if (cs.fontWeight !== wantWeight) bad.push(`weight ${cs.fontWeight}, not ${wantWeight}`);
    if (cs.textTransform !== 'none') bad.push(`text-transform ${cs.textTransform}`);
    if (!near(parseFloat(cs.letterSpacing) || 0, -0.005 * fs, 0.05)) bad.push(`letter-spacing ${cs.letterSpacing}`);
    if (cs.borderTopLeftRadius !== '8px') bad.push(`corners ${cs.borderTopLeftRadius}`);
    if (cs.paddingLeft !== '16px' || cs.paddingRight !== '16px') bad.push(`sides ${cs.paddingLeft}/${cs.paddingRight}`);
    if (parseFloat(cs.borderTopWidth) > 0) bad.push(`a border of ${cs.borderTopWidth}`);
    // The words on one line: the text's own line boxes.
    const range = document.createRange();
    range.selectNodeContents(el);
    const tops = new Set([...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1).map((r) => Math.round(r.top + r.height / 2)));
    const lines = [...tops].sort((x, y) => x - y).reduce((n, t, i, all) => (i && t - all[i - 1] > fs * 0.6 ? n + 1 : n), tops.size ? 1 : 0);
    if (lines > 1 && scale === 1) bad.push(`its words wrap onto ${lines} lines`);
    if (lines > 1 && cs.textAlign !== 'center') bad.push(`its ${lines} lines aren't centred`);
    // Never out of the box it sits in (its parent's content box).
    const host = el.parentElement.getBoundingClientRect();
    if (b.right > host.right + 1 || b.left < host.left - 1) bad.push(`runs ${Math.round(Math.max(b.right - host.right, host.left - b.left))}px out of its box`);
    if (el.scrollWidth > el.clientWidth + 1 || range.getBoundingClientRect().right > b.right + 1 || range.getBoundingClientRect().left < b.left - 1) bad.push('its words are cut off');
    if (scale === 1) {
      if (!near(fs, 16)) bad.push(`words ${cs.fontSize}`);
      const want = phone ? 44 : 40;
      if (lines <= 1 && !near(b.height, want, 0.6)) bad.push(`${Math.round(b.height * 10) / 10}px high, not ${want}`);
    }
    const filled = el.matches(PRIMARY);
    if (filled) {
      if (!/inset/.test(cs.boxShadow) || !/rgba\(255, 255, 255, 0\.28\)/.test(cs.boxShadow)) bad.push(`no top highlight (${cs.boxShadow.slice(0, 40)})`);
    } else {
      const fill = cs.backgroundColor;
      if (!/rgba\(0, 0, 0, 0\)|transparent/.test(fill)) bad.push(`filled ${fill}`);
      if (!/inset/.test(cs.boxShadow) || !/0px 0px 0px 1px/.test(cs.boxShadow)) bad.push(`no hairline (${cs.boxShadow.slice(0, 40)})`);
    }
    if (bad.length) out.push(`${name(el)}: ${bad.join(', ')}`);
  }
  // One coral button per screen.
  const coral = buttons.filter((el) => el.matches(PRIMARY) && !el.disabled);
  if (coral.length > 1) out.push(`${coral.length} coral buttons: ${coral.slice(0, 4).map(name).join(', ')}`);
  // The add rows.
  for (const el of [...top.querySelectorAll('.ds-addrow')].filter(vis)) {
    const cs = getComputedStyle(el);
    const b = el.getBoundingClientRect();
    const mark = el.querySelector('.ds-addrow-mark')?.getBoundingClientRect();
    const bad = [];
    if (b.height < 47.5) bad.push(`${Math.round(b.height)}px high`);
    if (!mark || !near(mark.width, 18) || !near(mark.height, 18)) bad.push('no 18px square for its cross');
    if (scale === 1 && cs.fontSize !== '16px') bad.push(`words ${cs.fontSize}`);
    if (parseFloat(cs.borderTopWidth) > 0 || (cs.boxShadow && cs.boxShadow !== 'none')) bad.push('a box round it');
    if (!/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor)) bad.push(`filled ${cs.backgroundColor}`);
    if (bad.length) out.push(`add row ${name(el)}: ${bad.join(', ')}`);
  }
  return { problems: out, checked: buttons.length };
}

// Boxes side by side match (Tim, 18 Nov, follow-up 1): controls, choices,
// cards and boxes next to each other in one row are the same height, and
// cards in one board or grid row stretch to match. Run in the page:
// page.evaluate(sideBySide). Gives one line for each row whose boxed
// parts differ in height by more than 1px.
export function sideBySide() {
  const vis = (el) => {
    const b = el.getBoundingClientRect();
    if (!(b.width > 0 && b.height > 0)) return false;
    if (el.closest('[hidden],[inert],[aria-hidden=true]')) return false;
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      const st = getComputedStyle(p);
      if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) < 0.05) return false;
    }
    return true;
  };
  const clear = (c) => /rgba\(0, 0, 0, 0\)|transparent/.test(c);
  // A box people see as one: a control, or anything drawn with an edge or a fill.
  const CONTROL = 'input:not([type=checkbox]):not([type=radio]):not([type=hidden]), select, textarea, .ds-btn, .ds-seg, .ds-dd, .ds-field, .ds-chip, .ui-btn-primary, .ui-btn-ghost, .si-btn, .si-inp';
  const boxed = (el) => {
    if (el.matches(CONTROL)) return true;
    const st = getComputedStyle(el);
    return parseFloat(st.borderTopWidth) > 0 && parseFloat(st.borderBottomWidth) > 0 && parseFloat(st.borderLeftWidth) > 0 && parseFloat(st.borderRightWidth) > 0
      || !clear(st.backgroundColor) || /inset/.test(st.boxShadow);
  };
  const name = (el) => `${String(el.className?.baseVal ?? el.className ?? '').split(' ')[0] || el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').replace(/\s+/g, ' ').trim().slice(0, 20)}"`;
  // A plain container (no edge, no fill) round one box is measured by that box (follow-up 5, item 16: a search box in
  // a plain wrapper beside Filter got through). The box is the one boxed element inside it, found on every branch
  // without looking inside a box; a container holding two or more boxes is a group of its own, not one box.
  const placed = (el) => { const p = getComputedStyle(el).position; return p !== 'absolute' && p !== 'fixed'; };
  const boxIn = (el) => {
    if (boxed(el)) return el;
    const found = [];
    const walk = (n) => {
      for (const c of n.children) {
        if (found.length > 1) return;
        if (!vis(c) || !placed(c)) continue;
        if (boxed(c)) found.push(c); else walk(c);
      }
    };
    walk(el);
    return found.length === 1 ? found[0] : null;
  };
  const out = [];
  for (const parent of document.querySelectorAll('.ui-root *')) {
    const st = getComputedStyle(parent);
    const flexRow = st.display.includes('flex') && !st.flexDirection.startsWith('column');
    if (!flexRow && !st.display.includes('grid')) continue;
    const kids = [...parent.children].filter((k) => vis(k) && placed(k)).map(boxIn).filter(Boolean);
    if (kids.length < 2) continue;
    // Rows: boxes whose tops line up (within 1px) and who sit side by side.
    const rows = [];
    for (const k of kids) {
      const b = k.getBoundingClientRect();
      if (b.height < 30) continue; // small marks (a tick, a dot) are not boxes to match
      const row = rows.find((r) => Math.abs(r.top - b.top) <= 1);
      if (row) row.items.push([k, b]); else rows.push({ top: b.top, items: [[k, b]] });
    }
    for (const r of rows) {
      if (r.items.length < 2) continue;
      const hs = r.items.map(([, b]) => b.height);
      if (Math.max(...hs) - Math.min(...hs) > 1) out.push(r.items.map(([k, b]) => `${name(k)} ${b.height.toFixed(1)}`).join(' | '));
    }
  }
  return [...new Set(out)];
}

// No Nekst inside any control (Tim, 18 Nov, follow-up 1): buttons, chips,
// choices, steppers and calendar day numbers are DM Sans. A fold's
// heading row is a section heading (Nekst stays) and a big figure inside a
// control (Breathe's countdown) is not a control's words. Run in the page.
export function nekstInControls() {
  const CONTROLS = 'button, [role=button], [role=radio], [role=checkbox], [role=switch], [role=option], [role=tab], [role=gridcell], input, select, textarea, .ds-chip';
  const out = [];
  for (const el of document.querySelectorAll(CONTROLS)) {
    const b = el.getBoundingClientRect();
    if (!(b.width > 0 && b.height > 0) || el.closest('[hidden],[inert],[aria-hidden=true]')) continue;
    // A section heading that opens its fold, or a title row, keeps its Nekst capitals.
    if (el.closest('h1, h2, h3, .ds-collapse-head, .dash-colb, .dash-fold-h, .ds-guide-title, .ds-page-title-row') || el.querySelector('h1, h2, h3')) continue;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim()) continue;
      const host = n.parentElement;
      if (host.closest('.ds-sr, [aria-hidden=true]')) continue;
      const cs = getComputedStyle(host);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      if (/^"?Nekst/.test(cs.fontFamily) && parseFloat(cs.fontSize) < 24) {
        out.push(`${String(el.className?.baseVal ?? el.className ?? '').split(' ')[0] || el.tagName.toLowerCase()} "${n.textContent.trim().slice(0, 24)}"`);
        break;
      }
    }
  }
  return [...new Set(out)];
}

// No coloured side lines (Tim, 18 Nov, follow-up 1, and 12:55): no card,
// row or calendar block has a left (or right) edge 2px or more that its
// other edges don't share, and no bar 2px or more drawn down its side, with
// no exception (Important where there's no tick box is a small soft coral
// box before the title, never a line: importantMarks).
// Run in the page: page.evaluate(sideLines).
export function sideLines() {
  const out = [];
  for (const el of document.querySelectorAll('.ui-root *')) {
    const b = el.getBoundingClientRect();
    if (!(b.width > 0 && b.height > 0) || b.height < 20) continue;
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden') continue;
    const l = parseFloat(st.borderLeftWidth) || 0;
    const r = parseFloat(st.borderRightWidth) || 0;
    const t = parseFloat(st.borderTopWidth) || 0;
    if ((l >= 2 && l > t + 0.5) || (r >= 2 && r > t + 0.5)) out.push(`${String(el.className?.baseVal ?? el.className ?? '').split(' ')[0] || el.tagName.toLowerCase()} ${Math.max(l, r)}px side edge`);
    for (const which of ['::before', '::after']) {
      const ps = getComputedStyle(el, which);
      if (ps.content === 'none' || ps.position !== 'absolute' || ps.display === 'none') continue;
      const w = parseFloat(ps.width) || 0;
      const h = parseFloat(ps.height) || 0;
      if (w >= 2 && w <= 6 && h >= 20 && h > b.height * 0.5 && !/rgba\(0, 0, 0, 0\)|transparent/.test(ps.backgroundColor) && Number(ps.opacity) > 0.05 && !/scaleY\(0\)|matrix\(1, 0, 0, 0,/.test(ps.transform)) {
        out.push(`${String(el.className?.baseVal ?? el.className ?? '').split(' ')[0] || el.tagName.toLowerCase()}${which} a ${w}px bar down its side`);
      }
    }
  }
  return [...new Set(out)];
}

// No line directly under a section heading when rows with their own
// dividers follow (Tim, 18 Nov, follow-up 1), so there's never a doubled
// rule. A heading's line is its own bottom edge, or a line drawn by the
// part that holds it, within 24px under its words; the rows are the first
// boxes after it that carry a top or bottom edge of their own. Run in the
// page: page.evaluate(doubledRules).
export function doubledRules() {
  const out = [];
  const line = (st, side) => parseFloat(st[`border${side}Width`]) > 0 && st[`border${side}Style`] !== 'none' && !/rgba\(0, 0, 0, 0\)/.test(st[`border${side}Color`]);
  const vis = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const heads = document.querySelectorAll('.ui-root :is(h2, h3, .ds-section-title, .ds-results-head, .ds-collapse-head)');
  for (const h of heads) {
    if (!vis(h)) continue;
    const hb = h.getBoundingClientRect();
    // The heading's own line, or its row's (a heading row that holds it).
    let lineAt = null;
    for (let p = h, i = 0; p && i < 3; p = p.parentElement, i += 1) {
      const pb = p.getBoundingClientRect();
      if (pb.bottom - hb.bottom > 24) break;
      if (line(getComputedStyle(p), 'Bottom')) { lineAt = pb.bottom; break; }
    }
    if (lineAt == null) continue;
    // What follows: the first rows after the heading's block, below the line.
    let block = h;
    while (block.parentElement && !block.nextElementSibling && block.parentElement.getBoundingClientRect().bottom - hb.bottom < 24) block = block.parentElement;
    let next = block.nextElementSibling;
    while (next && !vis(next)) next = next.nextElementSibling;
    if (!next) continue;
    // A row's divider is a top or bottom edge alone: a box with an edge all round (a drop-down, a field, a card) isn't a row.
    const divided = (el) => { const st = getComputedStyle(el); const tb = line(st, 'Top') || line(st, 'Bottom'); return tb && !(line(st, 'Left') && line(st, 'Right')); };
    const firstRow = [next, ...next.querySelectorAll('*')].find((el) => vis(el) && !el.matches('h1, h2, h3, h4, .dash-sh, .ds-results-head, .ds-results-headrow') && el.getBoundingClientRect().height >= 32 && divided(el) && el.getBoundingClientRect().top - lineAt < 64);
    if (!firstRow) continue;
    const name = (h.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30);
    out.push(`“${name}”: a line under the heading and rows with their own lines (${String(firstRow.className?.baseVal ?? firstRow.className ?? '').split(' ')[0] || firstRow.tagName.toLowerCase()})`);
  }
  return [...new Set(out)];
}

// Folds open from the whole row (Tim, 18 Nov, follow-up 1): a section that
// folds opens from a tap anywhere on its heading row, never only from its
// chevron. A fold's button holding nothing but its chevron, beside a
// heading's words it doesn't hold, fails. Run in the page:
// page.evaluate(chevronOnlyFolds).
export function chevronOnlyFolds() {
  const out = [];
  for (const el of document.querySelectorAll('.ui-root [aria-expanded]')) {
    const b = el.getBoundingClientRect();
    if (!(b.width > 0 && b.height > 0) || el.closest('[hidden],[inert]')) continue;
    if (el.matches('.ds-dd, select, [role=combobox], [aria-haspopup]')) continue; // drop-downs and menus aren't folds
    const words = (el.innerText || '').trim();
    if (words) continue;
    // A fold's mark is the chevron; the menu's crosshair and an ⓘ open other things.
    if (!el.querySelector('.ds-chevron, .ds-disclosure')) continue;
    const row = el.parentElement;
    const rowWords = (row?.innerText || '').trim();
    if (rowWords) out.push(`a fold opened only by its chevron, beside “${rowWords.replace(/\s+/g, ' ').slice(0, 30)}” (${el.getAttribute('aria-label') || 'no label'})`);
  }
  return [...new Set(out)];
}

// One controls family (Tim, 22 Nov; design reference 22 Nov, "Controls" and
// "Controls in a row, and tabs"), read on the page as it is drawn. Run in the
// page: page.evaluate(controlsFamily, { phone, scale }). It gives one line
// per problem and fails:
//
//   - a round pill toggle: the old `.seg`, or any choice between views or
//     answers (options side by side, pressed or checked) drawn with round
//     ends, without the gliding switch's soft grey track, with an edge round
//     it, or with its chosen option filled coral. The gliding switch is the
//     one toggle: 8px corners on its track, the chosen option a raised tile
//     with 6px corners, 40px high (44px on a phone; taller only when larger
//     words wrap, or to match a box beside it in the same row);
//   - an on or off switch that isn't the quiet precision switch: 40 by 24,
//     mint when on (never coral);
//   - a pill inside any control: a button, link or option with words, drawn
//     with an edge or a fill and round ends (chips have 6px corners);
//   - a button of the wrong height or corners: anything drawn as a button
//     (an edge or a fill, words on one line) that isn't 40px high (44px on a
//     phone) with 8px corners, at the standard text size;
//   - Nekst inside any control (as nekstInControls);
//   - a second coral button on the screen's top layer, whatever its class:
//     anything that can be pressed and is filled coral, but a chosen state.
//
// Underlined tabs (role tab) move between parts of a page and are left to
// themselves; tick boxes, day boxes, answer rows, chips, form boxes, cards
// and tiles are other parts with their own rules.
export function controlsFamily({ phone, scale = 1 }) {
  const out = [];
  const vis = (el) => {
    const b = el.getBoundingClientRect();
    if (!(b.width > 0 && b.height > 0)) return false;
    if (el.closest('[hidden],[inert],[aria-hidden=true]')) return false;
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      const st = getComputedStyle(p);
      if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) < 0.05) return false;
    }
    return true;
  };
  const cls = (el) => String(el.className?.baseVal ?? el.className ?? '').split(' ').filter(Boolean)[0] || el.tagName.toLowerCase();
  const words = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  const name = (el) => `${cls(el)} "${(words(el) || el.getAttribute('aria-label') || '').slice(0, 28)}"`;
  const clear = (c) => !c || /rgba\(0, 0, 0, 0\)|transparent/.test(c);
  const near = (a, b, tol = 0.6) => Math.abs(a - b) <= tol;
  // A colour token read as the browser draws it.
  const probe = document.createElement('span');
  probe.style.display = 'none';
  (document.querySelector('.ui-root') || document.body).appendChild(probe);
  const colour = (value) => { probe.style.color = ''; probe.style.color = value; return getComputedStyle(probe).color; };
  const token = (el, t) => colour(getComputedStyle(el).getPropertyValue(t).trim() || 'transparent');
  const root = document.querySelector('.ui-root') || document.body;
  const corals = new Set([token(root, '--coral'), token(root, '--coral-hover'), 'rgb(255, 111, 92)'].filter((c) => !clear(c)));
  const edged = (st) => ['Top', 'Right', 'Bottom', 'Left'].every((s) => parseFloat(st[`border${s}Width`]) > 0 && st[`border${s}Style`] !== 'none' && !clear(st[`border${s}Color`]));
  const hairline = (st) => /inset/.test(st.boxShadow) && /0px 0px 0px 1px/.test(st.boxShadow);
  const drawn = (st) => edged(st) || !clear(st.backgroundColor) || hairline(st);
  const round = (el, st, b) => parseFloat(st.borderTopLeftRadius) >= b.height / 2 - 0.5 || /%/.test(st.borderTopLeftRadius) && parseFloat(st.borderTopLeftRadius) >= 50;
  const lineCount = (el, fs) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const mids = [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1).map((r) => r.top + r.height / 2).sort((x, y) => x - y);
    return mids.reduce((n, t, i) => (i && t - mids[i - 1] > fs * 0.6 ? n + 1 : n), mids.length ? 1 : 0);
  };
  const want = phone ? 44 : 40;
  // The top layer: an open panel, dialog or the phone's menu, else the page.
  const top = [...document.querySelectorAll('[role=dialog], [aria-modal=true], .ds-guide--fullscreen, .ds-tmenu')].filter(vis).pop() || document.body;
  // Parts with their own rules (each kept by its own check): the floating Breathe pill holds the orb (rule 4a); a
  // chart's marks; calendar days and week boxes; tick boxes; the phone bar and the menu's crosshair; the My Mission
  // pill (its own part in the design reference's colours, "Surface: Tiles, Mission pill", which expands smoothly, rule 10);
  // Merge into one's cells, which sit in a comparison table under its two column heads (answer boxes, not a switch);
  // a week's day boxes, each day its own (the week grid, rule 26e); a pop-up menu's or drop-down's items (rows of a
  // list, the branded drop-down's own rules); Continue with Google, which is Google's own
  // button in their light and dark versions, never redrawn (sign-in rule 17; M26).
  const OWN = '.ds-link, .cc-inline-link, [role^=menuitem], [role=menu], [role=listbox], .ds-google, .hdr-mis, .ds-mission-pill, .cc-merge-choice, .ds-logweek-days, .ds-logweek-yn, .ds-floating-orb, .ds-fab, .ds-breathe, [class*="orb"], [role=gridcell], [role=checkbox], .ds-check-box, .ds-week-box, .ds-bar, .ds-bar-menu, .hdr-menu, svg, .hc-dot, .cc-net-dot, [class*="-dot"], .ds-chart, .ds-chip, [role=tab], .ds-utabs, .cc-utabs, .ds-answer, .ds-rows, .ds-field, .ds-dd, .ds-text, input, select, textarea, .ds-stepper, [class*="stepper"]';

  // 1. The old pill toggle, by name.
  for (const el of document.querySelectorAll('.ui-root .seg, .ui-root .segw')) if (vis(el)) out.push(`${name(el)}: the retired round pill toggle (.seg)`);

  // 2. Every choice between views or answers: options side by side, pressed or checked.
  const OPTION = 'button[aria-pressed], [role=radio]:not(input), button[aria-checked]:not([role=switch]):not([role=checkbox])';
  const groups = new Map();
  for (const opt of top.querySelectorAll(OPTION)) {
    if (!vis(opt) || opt.closest(OWN) || opt.matches(OWN)) continue;
    const g = opt.closest('[role=radiogroup], [role=group], [role=toolbar]') || opt.parentElement;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(opt);
  }
  let toggles = 0;
  for (const [g, opts] of groups) {
    if (opts.length < 2) continue;
    const boxes = opts.map((o) => o.getBoundingClientRect());
    // Side by side: at least two options on one line. Stacked answer rows are rows, not a switch.
    const sideBySideOpts = boxes.some((b, i) => boxes.some((c, j) => j !== i && Math.abs(b.top - c.top) < 2));
    if (!sideBySideOpts) continue;
    // Words in each: a row of day squares or colour swatches is not a switch.
    if (opts.some((o) => words(o).length === 0)) continue;
    toggles += 1;
    const track = g.matches('[role=radiogroup], [role=group], [role=toolbar], .ds-seg') ? g : opts[0].parentElement;
    const ts = getComputedStyle(track);
    const tb = track.getBoundingClientRect();
    const bad = [];
    if (round(track, ts, tb)) bad.push('round ends on its track');
    for (const o of opts) {
      const os = getComputedStyle(o);
      const ob = o.getBoundingClientRect();
      if (ob.height >= 20 && round(o, os, ob) && (drawn(os) || o.matches('[aria-pressed=true], [aria-checked=true]'))) { bad.push(`a round option (${words(o).slice(0, 16)})`); break; }
    }
    // Every option inside its track: five words that don't fit wrap onto another row, never run out of it (UI tester, 22 Nov).
    const out1 = opts.find((o, i) => boxes[i].right > tb.right + 1 || boxes[i].left < tb.left - 1);
    if (out1) bad.push(`${words(out1).slice(0, 16)} runs out of its track`);
    if (clear(ts.backgroundColor)) bad.push('no soft grey track');
    if (edged(ts)) bad.push('an edge round its track');
    const chosen = opts.find((o) => o.matches('[aria-pressed=true], [aria-checked=true]'));
    if (chosen) {
      const cs = getComputedStyle(chosen);
      if (corals.has(cs.backgroundColor)) bad.push('its chosen option filled coral');
      if (/Nekst/.test(cs.fontFamily)) bad.push('its words in Nekst');
    }
    if (scale === 1) {
      if (!near(parseFloat(ts.borderTopLeftRadius) || 0, 8)) bad.push(`track corners ${ts.borderTopLeftRadius}, not 8px`);
      const tile = track.querySelector(':scope > .ds-seg-tile');
      const tileEl = tile && vis(tile) ? tile : chosen;
      if (tileEl && !clear(getComputedStyle(tileEl).backgroundColor) && !near(parseFloat(getComputedStyle(tileEl).borderTopLeftRadius) || 0, 6)) bad.push(`chosen tile corners ${getComputedStyle(tileEl).borderTopLeftRadius}, not 6px`);
      const wraps = opts.some((o) => lineCount(o, parseFloat(getComputedStyle(o).fontSize)) > 1 || o.querySelector('small, .ds-answer-note'));
      // Options on more than one row inside the track (five words on a phone): each option is then one row's height.
      const rows = new Set(boxes.map((b) => Math.round(b.top))).size;
      const pad = parseFloat(ts.paddingTop) || 0;
      const rowsOk = rows > 1 && boxes.every((b) => near(b.height, want - 2 * pad, 0.6));
      // Taller only to match a box beside it in the same row (boxes side by side are one height).
      let area = track;
      for (let i = 0; i < 4 && area.parentElement; i += 1) area = area.parentElement;
      const beside = [...area.querySelectorAll('.ds-field, .ds-dd, input, select, .ds-btn')]
        .filter((x) => vis(x) && !track.contains(x) && Math.abs(x.getBoundingClientRect().top - tb.top) < 2)
        .some((x) => near(x.getBoundingClientRect().height, tb.height, 1));
      if (!wraps && !beside && !rowsOk && !near(tb.height, want, 0.6)) bad.push(`${Math.round(tb.height * 10) / 10}px high, not ${want}`);
    }
    if (bad.length) out.push(`toggle ${name(track)}: not the gliding switch: ${bad.join(', ')}`);
  }

  // 2a. The shared switch starts on its box's left edge: its hidden measuring copy never pushes it along (the lead, 22 Nov).
  for (const seg of top.querySelectorAll('.ds-inline > .ds-seg:not(.ds-seg-measure)')) {
    if (!vis(seg)) continue;
    const box = seg.parentElement;
    const left = box.getBoundingClientRect().left + (parseFloat(getComputedStyle(box).paddingLeft) || 0);
    const off = seg.getBoundingClientRect().left - left;
    // A centred layout (Breathe) centres it, a right-aligned one puts it on the right: anything else is pushed along.
    const room = box.clientWidth - (parseFloat(getComputedStyle(box).paddingLeft) || 0) - (parseFloat(getComputedStyle(box).paddingRight) || 0) - seg.getBoundingClientRect().width;
    const align = getComputedStyle(box).textAlign;
    const meant = align === 'center' ? room / 2 : /right|end/.test(align) ? room : 0;
    if (Math.abs(off - meant) > 1) out.push(`toggle ${name(seg)}: ${Math.round(off)}px from its box's left edge`);
  }

  // 2b. Underlined tabs are underlined: a tab drawn as a round pill (filled or edged), or a tab strip with round
  // ends, is the retired pill toggle in a tab's clothes.
  for (const tab of top.querySelectorAll('[role=tab]')) {
    if (!vis(tab)) continue;
    const st = getComputedStyle(tab);
    const b = tab.getBoundingClientRect();
    if (round(tab, st, b) && (drawn(st) || corals.has(st.backgroundColor))) { out.push(`tab ${name(tab)}: a round pill, not an underlined tab or the gliding switch`); continue; }
    if (tab.matches('[aria-selected=true]') && corals.has(st.backgroundColor)) out.push(`tab ${name(tab)}: chosen filled coral`);
    const list = tab.closest('[role=tablist]');
    if (list) {
      const ls = getComputedStyle(list);
      if (round(list, ls, list.getBoundingClientRect()) && (edged(ls) || !clear(ls.backgroundColor))) out.push(`tabs ${name(list)}: a round pill strip`);
    }
  }

  // 3. On or off switches: the quiet precision switch.
  const mint = new Set([token(root, '--good'), token(root, '--mint'), token(root, '--mint-text')].filter((c) => !clear(c)));
  for (const sw of top.querySelectorAll('[role=switch]')) {
    if (!vis(sw)) continue;
    const st = getComputedStyle(sw);
    const b = sw.getBoundingClientRect();
    const bad = [];
    if (scale === 1 && (!near(b.width, 40) || !near(b.height, 24))) bad.push(`${Math.round(b.width)} by ${Math.round(b.height)}, not 40 by 24`);
    if (sw.getAttribute('aria-checked') === 'true') {
      // In forced colours the switch takes the system's colours (rule 8b).
      if (!matchMedia('(forced-colors: active)').matches && !mint.has(st.backgroundColor)) bad.push(`on, but ${st.backgroundColor}, not mint`);
    }
    if (corals.has(st.backgroundColor)) bad.push('coral');
    if (bad.length) out.push(`switch ${name(sw)}: ${bad.join(', ')}`);
  }

  // 4. Pills and buttons of the wrong size: anything with words that can be pressed and is drawn as a box.
  const PRESS = 'button, a[href], [role=button], [role=radio]:not(input)';
  let coral = [];
  for (const el of top.querySelectorAll(PRESS)) {
    if (!vis(el) || el.matches(OWN) || el.closest(OWN) || el.matches('[role=switch]')) continue;
    const st = getComputedStyle(el);
    const b = el.getBoundingClientRect();
    const w = words(el);
    const on = el.matches('[aria-pressed=true], [aria-checked=true], [aria-selected=true], [aria-current]:not([aria-current=false])');
    if (corals.has(st.backgroundColor) && !on && !el.disabled && el.getAttribute('aria-disabled') !== 'true' && w) coral.push(el);
    if (!w || w.length > 60 || el.matches('.ds-seg-btn')) continue;
    if (!drawn(st) || b.height > 60 || b.height < 20) continue;
    // A link inside a sentence, a whole row or card that opens something, is not a button.
    if (b.width > 480) continue;
    if (round(el, st, b) && !on) { out.push(`${name(el)}: a pill (round ends) inside a control`); continue; }
    if (scale !== 1) continue;
    const fs = parseFloat(st.fontSize);
    if (lineCount(el, fs) > 1) continue;
    // A button by its look: a hairline or a fill with words in the button family's size.
    const looksLikeButton = (hairline(st) || corals.has(st.backgroundColor) || (edged(st) && b.height < 52)) && near(fs, 16, 1.5);
    if (!looksLikeButton) continue;
    const r = parseFloat(st.borderTopLeftRadius) || 0;
    const bad = [];
    if (!near(r, 8)) bad.push(`corners ${st.borderTopLeftRadius}, not 8px`);
    if (!near(b.height, want, 0.6)) bad.push(`${Math.round(b.height * 10) / 10}px high, not ${want}`);
    if (bad.length) out.push(`button ${name(el)}: ${bad.join(', ')}`);
  }
  if (coral.length > 1) out.push(`${coral.length} coral buttons on one screen: ${coral.slice(0, 4).map(name).join(', ')}`);

  // 5. No Nekst inside any control (as nekstInControls, so this one check holds the whole family).
  const CONTROLS = 'button, [role=button], [role=radio], [role=checkbox], [role=switch], [role=option], [role=tab], [role=gridcell], input, select, textarea, .ds-chip';
  for (const el of document.querySelectorAll(CONTROLS)) {
    const b = el.getBoundingClientRect();
    if (!(b.width > 0 && b.height > 0) || el.closest('[hidden],[inert],[aria-hidden=true]')) continue;
    if (el.closest('h1, h2, h3, .ds-collapse-head, .dash-colb, .dash-fold-h, .ds-guide-title, .ds-page-title-row') || el.querySelector('h1, h2, h3')) continue;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim()) continue;
      const host = n.parentElement;
      if (host.closest('.ds-sr, [aria-hidden=true]')) continue;
      const cs = getComputedStyle(host);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      if (/^"?Nekst/.test(cs.fontFamily) && parseFloat(cs.fontSize) < 24) { out.push(`${cls(el)} "${n.textContent.trim().slice(0, 24)}": Nekst inside a control`); break; }
    }
  }
  probe.remove();
  return { problems: [...new Set(out)], toggles };
}

// Back's chevron is 10px from its words (Tim, 18 Nov, follow-up 1; rule 29t,
// `--back-gap`), on every page: the client portal, the coach portal and the
// outside pages. Every Back chevron (a chevron pointing left in a control
// that goes back: its class or label says Back, or it is a back link) is
// read as drawn: its visible right edge (the square's right side less the
// strokes' measured inset, `--chev-right-inset`, scaled to the chevron's
// size; the square is found from the chevron's box without its turn and
// shift) to the left of its label's first letter, which is the control's own
// words or, for a chevron alone (a guided tool's Back), the words just after
// it on its row. Each must be 10px within 0.5px. Run in the page:
// page.evaluate(backGaps). Gives { problems, checked }.
export function backGaps() {
  const out = [];
  let checked = 0;
  const vis = (el) => {
    const b = el.getBoundingClientRect();
    if (!(b.width > 0 && b.height > 0)) return false;
    if (el.closest('[hidden],[inert]')) return false;
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      const st = getComputedStyle(p);
      if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) < 0.05) return false;
    }
    return true;
  };
  const cls = (el) => String(el.className?.baseVal ?? el.className ?? '').split(' ').filter(Boolean)[0] || el.tagName.toLowerCase();
  // The first letter's left edge among the text nodes of `scope` that start after x.
  const firstLetter = (scope, x) => {
    const walk = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.textContent.trim() || n.parentElement.closest('.ds-sr, [aria-hidden=true]')) continue;
      const r = document.createRange();
      const at = n.textContent.search(/\S/);
      r.setStart(n, at);
      r.setEnd(n, at + 1);
      const box = [...r.getClientRects()].find((q) => q.width > 0);
      if (box && box.left > x) return box.left;
    }
    return null;
  };
  for (const ch of document.querySelectorAll('.ds-chevron--left')) {
    if (!vis(ch)) continue;
    const host = ch.closest('a, button, [role=button], [role=link]');
    if (!host) continue;
    const said = `${host.getAttribute('aria-label') || ''} ${(host.innerText || '').trim()}`.trim();
    const backish = /back/i.test(String(host.className?.baseVal ?? host.className ?? '')) || /^back\b/i.test(said);
    // Calendar arrows, "Previous week" and the like step through dates; they aren't Back.
    if (!backish || /^previous\b|^earlier\b/i.test(said)) continue;
    // The chevron's square as laid out: its box's centre less its shift (the turn keeps the centre).
    const st = getComputedStyle(ch);
    const m = /matrix\(([^)]+)\)/.exec(st.transform);
    const shift = m ? Number(m[1].split(',')[4]) || 0 : 0;
    const box = ch.getBoundingClientRect();
    const size = ch.offsetWidth || parseFloat(st.width);
    const centre = box.left + box.width / 2 - shift;
    const inset = (parseFloat(st.getPropertyValue('--chev-right-inset')) || 5.5) * (size / 16);
    const inkRight = centre + size / 2 - inset;
    // The label: the control's own words, or (a chevron alone) the words after it on its row.
    let left = (host.innerText || '').trim() ? firstLetter(host, inkRight) : null;
    if (left == null) {
      for (let sib = host.nextElementSibling; sib && left == null; sib = sib.nextElementSibling) {
        if (!vis(sib)) continue;
        const sb = sib.getBoundingClientRect();
        if (sb.top > box.bottom || sb.bottom < box.top) break; // another row
        left = firstLetter(sib, inkRight);
      }
    }
    if (left == null) continue;
    checked += 1;
    const gap = left - inkRight;
    if (Math.abs(gap - 10) > 0.5) out.push(`${cls(host)} "${said.slice(0, 28)}": its label is ${gap.toFixed(2)}px from the chevron, not 10px`);
  }
  return { problems: [...new Set(out)], checked };
}

// Important (Tim, 18 Nov, follow-up 1, and 12:55; buttons-followup-1.md
// point 5): an important item with a tick box shows it only as that box's
// 2px soft coral edge (--coral-soft-text), its title unchanged; one without
// a tick box shows a small soft coral box before its title, drawn exactly as
// that tick box's square (`.ds-important-mark`: --checkbox-box square, a 2px
// --coral-soft-text edge all round, the tick box's --radius-box corners, no
// fill), its title lined up with the titles around it. Neither shows
// anything else: no coloured line down its side, no bold, no coral or soft
// coral words, no dot. An item is important when it carries a class ending
// `--important` or holds a `.ds-important-mark`. Run in the page:
// page.evaluate(importantMarks). Gives { problems, checked }.
export function importantMarks() {
  const out = [];
  let checked = 0;
  const vis = (el) => {
    const b = el.getBoundingClientRect();
    if (!(b.width > 0 && b.height > 0)) return false;
    if (el.closest('[hidden],[inert]')) return false;
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      const st = getComputedStyle(p);
      if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) < 0.05) return false;
    }
    return true;
  };
  const cls = (el) => String(el.className?.baseVal ?? el.className ?? '').split(' ').filter(Boolean)[0] || el.tagName.toLowerCase();
  const name = (el) => `${cls(el)} "${(el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 28)}"`;
  const probe = document.createElement('span');
  probe.style.display = 'none';
  (document.querySelector('.ui-root') || document.body).appendChild(probe);
  const colour = (value) => { probe.style.color = ''; probe.style.color = value; return getComputedStyle(probe).color; };
  const root = document.querySelector('.ui-root') || document.body;
  const tok = (el, t) => colour(getComputedStyle(el).getPropertyValue(t).trim() || 'transparent');
  const px = (el, t) => { probe.style.width = ''; probe.style.width = getComputedStyle(el).getPropertyValue(t).trim() || '0px'; probe.style.display = 'block'; const w = parseFloat(getComputedStyle(probe).width) || 0; probe.style.display = 'none'; probe.style.width = ''; return w; };
  const near = (a, b, tol = 0.05) => Math.abs(a - b) <= tol;
  const clear = (c) => /rgba\(0, 0, 0, 0\)|transparent/.test(c);
  const TICK = '[role=checkbox], .ds-check-box, .cc-cal-tick';
  const SIDES = ['Top', 'Right', 'Bottom', 'Left'];
  // The words as drawn: every text node but the screen reader's (.ds-sr sits out of the flow).
  const textRects = (el) => {
    const rects = [];
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.textContent.trim() || n.parentElement.closest('.ds-sr') || n.parentElement.closest(TICK) || !vis(n.parentElement)) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      rects.push(...[...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0));
    }
    return rects;
  };
  const firstLine = (rects) => { if (!rects.length) return null; const top = Math.min(...rects.map((r) => r.top)); const line = rects.filter((r) => r.top - top < 2); return { left: Math.min(...line.map((r) => r.left)), top: Math.min(...line.map((r) => r.top)), bottom: Math.max(...line.map((r) => r.bottom)) }; };
  const items = new Set();
  for (const el of document.querySelectorAll('[class*="--important"]')) if (vis(el) && !el.parentElement?.closest('[class*="--important"]')) items.add(el);
  for (const m of document.querySelectorAll('.ds-important-mark')) if (vis(m) && !m.closest('[class*="--important"]')) items.add(m.parentElement || m);
  for (const item of items) {
    checked += 1;
    const soft = tok(item, '--coral-soft-text');
    const corals = new Set([soft, tok(root, '--coral'), tok(root, '--coral-text'), tok(root, '--coral-soft'), 'rgb(255, 111, 92)'].filter((c) => !clear(c)));
    const bad = [];
    const tick = [...item.querySelectorAll(TICK)].find(vis);
    const parts = [item, ...item.querySelectorAll('*')].filter((el) => vis(el) && !el.closest(TICK) && !el.closest('.ds-sr'));
    // A box: the shared mark, or any part with a coral or soft coral edge all round.
    const boxes = parts.filter((el) => el !== item && (el.matches('.ds-important-mark') || (SIDES.every((s) => parseFloat(getComputedStyle(el)[`border${s}Width`]) > 0 && getComputedStyle(el)[`border${s}Style`] !== 'none') && corals.has(getComputedStyle(el).borderTopColor))));
    // No coloured line down its side: a narrow coloured bar (a part or its ::before or ::after), or an edge on one side only.
    for (const el of parts) {
      const st = getComputedStyle(el);
      const l = parseFloat(st.borderLeftWidth) || 0;
      const r = parseFloat(st.borderRightWidth) || 0;
      const t = parseFloat(st.borderTopWidth) || 0;
      if ((l > t + 0.5 && !clear(st.borderLeftColor) && st.borderLeftStyle !== 'none') || (r > t + 0.5 && !clear(st.borderRightColor) && st.borderRightStyle !== 'none')) bad.push(`a coloured line down its side (${cls(el)})`);
      const b = el.getBoundingClientRect();
      if (b.width <= 6 && b.height >= 10 && b.height >= 3 * b.width && !clear(st.backgroundColor)) bad.push(`a coloured line down its side (${cls(el)})`);
      for (const which of ['::before', '::after']) {
        const ps = getComputedStyle(el, which);
        if (ps.content === 'none' || ps.display === 'none' || clear(ps.backgroundColor) || Number(ps.opacity) < 0.05) continue;
        const w = parseFloat(ps.width) || 0;
        const h = parseFloat(ps.height) || 0;
        if (w > 0 && w <= 6 && (h >= 10 || (ps.position === 'absolute' && ps.top !== 'auto' && ps.bottom !== 'auto'))) bad.push(`a coloured line down its side (${cls(el)}${which})`);
      }
    }
    if (tick) {
      // The tick box's own drawn square: the box itself or the span that draws it.
      const drawnBox = [...tick.querySelectorAll(':scope > span'), tick].find((e) => parseFloat(getComputedStyle(e).borderTopWidth) > 0) || tick;
      const ts = getComputedStyle(drawnBox);
      const ticked = tick.getAttribute('aria-checked') === 'true';
      if (!ticked) {
        if (!SIDES.every((s) => near(parseFloat(ts[`border${s}Width`]), 2))) bad.push(`its tick box edge is ${ts.borderTopWidth}, not 2px`);
        if (ts.borderTopColor !== soft) bad.push(`its tick box edge is ${ts.borderTopColor}, not soft coral`);
      }
      if (boxes.length) bad.push('a soft coral box as well as the tick box edge');
    } else if (!boxes.length) {
      bad.push('no small soft coral box before its title');
    } else {
      // Drawn exactly as the Important tick box's square.
      const box = boxes[0];
      const st = getComputedStyle(box);
      const bb = box.getBoundingClientRect();
      const size = px(root, '--checkbox-box') || 18;
      const radius = px(root, '--radius-box') || 5;
      if (!near(bb.width, size, 0.5) || !near(bb.height, size, 0.5)) bad.push(`its box is ${bb.width.toFixed(1)} by ${bb.height.toFixed(1)}px, not the tick box's ${size}px`);
      if (!SIDES.every((s) => near(parseFloat(st[`border${s}Width`]), 2))) bad.push(`its box edge is ${st.borderTopWidth}, not 2px`);
      if (!SIDES.every((s) => st[`border${s}Color`] === soft)) bad.push(`its box edge is ${st.borderTopColor}, not soft coral`);
      if (!near(parseFloat(st.borderTopLeftRadius) || 0, radius, 0.5)) bad.push(`its box corners are ${st.borderTopLeftRadius}, not the tick box's ${radius}px`);
      if (!clear(st.backgroundColor)) bad.push(`its box is filled (${st.backgroundColor})`);
      // Before the title, on its first line.
      const line = firstLine(textRects(item));
      if (line) {
        if (bb.right > line.left + 0.5) bad.push('its box is not before its title');
        const mid = (bb.top + bb.bottom) / 2;
        if (mid < line.top - 1 || mid > line.bottom + 1) bad.push('its box is not on its title\'s first line');
      }
      // The titles around it line up with its title: the same distance in from each row's own edge.
      let branch = item;
      for (let depth = 0; depth < 3 && branch.parentElement; depth += 1, branch = branch.parentElement) {
        const sibs = [...branch.parentElement.children].filter((c) => c !== branch && cls(c) === cls(branch) && vis(c));
        if (!sibs.length) continue;
        const mine = firstLine(textRects(branch));
        if (!mine) break;
        const myIn = mine.left - branch.getBoundingClientRect().left;
        for (const sib of sibs) {
          const theirs = firstLine(textRects(sib));
          if (!theirs) continue;
          const theirIn = theirs.left - sib.getBoundingClientRect().left;
          if (Math.abs(theirIn - myIn) > 1) { bad.push(`its title starts ${(myIn - theirIn).toFixed(1)}px from the titles around it`); break; }
        }
        break;
      }
    }
    // Nothing else: no dot, no coral word.
    for (const el of parts) {
      if (boxes.includes(el)) continue;
      const st = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      if (b.width <= 14 && b.height <= 14 && corals.has(st.backgroundColor)) { bad.push(`a small dot (${cls(el)})`); continue; }
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (own && corals.has(st.color)) bad.push(`a coral word ("${el.textContent.trim().slice(0, 16)}")`);
    }
    // No bold: a plain title is 400 or 500.
    const words = parts.filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
    const heavy = words.find((el) => Number(getComputedStyle(el).fontWeight) >= 600);
    if (heavy) bad.push(`bold words ("${heavy.textContent.trim().slice(0, 16)}", ${getComputedStyle(heavy).fontWeight})`);
    if (bad.length) out.push(`${name(item)}: ${[...new Set(bad)].join(', ')}`);
  }
  probe.remove();
  return { problems: [...new Set(out)], checked };
}

// Never squash (CLAUDE.md rule 20; Phase 6b run 3, UI finding 1: a label
// column crushed to "supplie / r portal", one letter a line at twice the
// text size). A column is never narrower than its longest word, so no
// plain word is ever broken across lines. Run in the page:
// page.evaluate(brokenWords). It reads every word of four letters or more
// (letters only, so an email address, a web address, a file name or a
// figure, which may wrap anywhere, is left alone) in every visible text on
// the page and gives one line for each word drawn on more than one line.
export function brokenWords() {
  const vis = (el) => {
    const b = el.getBoundingClientRect();
    if (!(b.width > 0 || b.height > 0)) return false; // a column crushed to nothing still draws its words
    if (el.closest('[hidden],[inert],[aria-hidden=true]')) return false;
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      const st = getComputedStyle(p);
      if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) < 0.05) return false;
    }
    return true;
  };
  const seen = new Map();
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || !el.closest('.ui-root') || el.closest('script,style,svg,textarea,input')) continue;
    if (!seen.has(el)) seen.set(el, vis(el));
    if (!seen.get(el)) continue;
    const text = n.nodeValue;
    // A word is a run of letters standing on its own: not part of a longer token with an @, a dot, a slash, a digit or
    // a hyphen in it (those may wrap where they can).
    for (const m of text.matchAll(/[^\s]+/g)) {
      const token = m[0].replace(/^[("“‘']+|[)"”’'.,;:!?…]+$/g, '');
      if (!/^\p{L}{4,}$/u.test(token)) continue;
      const start = m.index + m[0].indexOf(token);
      const r = document.createRange();
      r.setStart(n, start);
      r.setEnd(n, start + token.length);
      const tops = new Set([...r.getClientRects()].filter((b) => b.width > 0).map((b) => Math.round(b.top)));
      if (tops.size > 1) {
        const cls = String(el.className?.baseVal ?? el.className ?? '').split(' ')[0] || el.tagName.toLowerCase();
        out.push(`${cls}: "${token}" is broken across ${tops.size} lines (${Math.round(el.getBoundingClientRect().width)}px wide)`);
      }
    }
  }
  return [...new Set(out)];
}
