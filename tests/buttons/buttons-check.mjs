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
  const out = [];
  for (const parent of document.querySelectorAll('.ui-root *')) {
    const st = getComputedStyle(parent);
    const flexRow = st.display.includes('flex') && !st.flexDirection.startsWith('column');
    if (!flexRow && !st.display.includes('grid')) continue;
    const kids = [...parent.children].filter((k) => vis(k) && getComputedStyle(k).position !== 'absolute' && getComputedStyle(k).position !== 'fixed' && boxed(k));
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

// No thick coloured side lines (Tim, 18 Nov, follow-up 1): no card, row or
// calendar block has a left (or right) edge 2px or more that its other
// edges don't share, and no bar 2px or more drawn down its side. Run in
// the page: page.evaluate(sideLines).
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
      if (w >= 2 && w <= 6 && h >= 20 && h > b.height * 0.5 && !/rgba\(0, 0, 0, 0\)|transparent/.test(ps.backgroundColor) && Number(ps.opacity) > 0.05 && !/scaleY\(0\)|matrix\(1, 0, 0, 0,/.test(ps.transform)) out.push(`${String(el.className?.baseVal ?? el.className ?? '').split(' ')[0] || el.tagName.toLowerCase()}${which} a ${w}px bar down its side`);
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
