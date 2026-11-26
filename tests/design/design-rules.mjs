// The lasting design check for the 25 Nov design reference (polish 1, "A lasting check"; design-reference-25nov.html,
// example-pages-25nov.html). Run in the page: page.evaluate(designProblems, { phone, scale }). It gives
// { problems: [...], counts } with one line per fault, each starting with its rule's name:
//
//   nekst         Nekst on anything but a page title or the product's name, or on mixed case or a figure
//   size          a text size outside 13, 16, 20, 22, 24px (24px digits in the code squares included)
//   radius        more than one control radius (the floating Breathe button excepted)
//   row-heights   controls in one row with different heights
//   short         a control under 40px (44px on a phone)
//   coral         a coral button, or coral anywhere that isn't a mistake
//   arrow         "→" in text
//   card          a card whose label isn't its padding from the top and left (±1px), or whose last row doesn't end
//                 its padding from the bottom
//   width         on a phone, a card, main button or answer box not spanning the content column
//   centre-icon   a centred link with an icon under a full-width button
//   wrap          words wrapping inside a control
//   repeat        a row whose first two lines are the same
//   main          more than one main button
//   scroll        sideways scroll
//   contrast      13px or 16px text under 4.5 to 1 against what's behind it (walk item 4: small grey text is --text-2;
//                 --placeholder only inside empty boxes); disabled controls are left out, as WCAG leaves them out
//   chevron-line  a row that opens something with its chevron off the name's line or away from the row's right end
//                 (walk item 8)
//   divider       rows of one list (lists one after another included) with different dividers (walk item 8)
//   bare-zero     a bare 0, 0% or £0 as a headline figure (rule 16; walk item 9: Figure's `empty` sentence instead)
//   figures       more than one 24px figure in a card (walk item 13: a row's value is row-sized)
//   fold-in-fold  a fold (a heading that opens a section) inside another fold (walk item 15)
//   card-gap      cards one above another not 20px apart, or the first card not 32px under the page opening (item 22)
//   empty-box     an outlined box with no words, no picture and no role (walk item 31)
//   overlap       anything drawn over the header's crosshair (walk item 32)
//   mission       My Mission in the phone header not filling the row from the crosshair to the right margin at 40px
//                 high, or on a laptop stretched past its words (walk item 33)
//
// Starting points: client-audit-25nov.md's measuring script (Claude, 25 Nov) and the example pages' own checks.
// Only the standard text size is held to the sizes (scale 1): larger device text grows them.
export function designProblems({ phone = false, scale = 1 } = {}) {
  const out = [];
  const say = (rule, msg) => out.push(`${rule}: ${msg}`);
  const W = window.innerWidth;
  const vis = (el) => {
    const b = el.getBoundingClientRect();
    if (!(b.width > 0 && b.height > 0)) return false;
    if (el.closest('[hidden],[inert],[aria-hidden=true],.ds-sr,.sr,.ds-seg-measure')) return false;
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      const st = getComputedStyle(p);
      if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) < 0.05) return false;
    }
    return true;
  };
  const words = (el) => (el.innerText || el.value || el.getAttribute?.('aria-label') || '').replace(/\s+/g, ' ').trim();
  const name = (el) => `"${words(el).slice(0, 36)}"`;
  const clear = (c) => !c || /rgba\(0, 0, 0, 0\)|transparent/.test(c);
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  const rgb = (c) => (c.match(/[\d.]+/g) || []).map(Number);
  // Coral: the brand's #FF6F5C and the deeper coral of light mode's mistakes (#C2412E), hover shades and soft coral.
  const isCoral = (c) => {
    if (clear(c)) return false;
    const [r, g, b, a = 1] = rgb(c);
    if (a < 0.5) return false;
    return (r > 180 && g > 50 && g < 145 && b > 35 && b < 125 && r - g > 80) || (r > 240 && g > 170 && g < 200 && b > 140 && b < 175);
  };
  const MISTAKE = '[role=alert], [aria-invalid=true], .ds-error, [class*="error"], [class*="-err"], [class*="problem"], .code.err, [data-mistake]';
  const BREATHE = '.ds-floating-orb, .ds-fab, .ds-breathe, [class*="borb"], [class*="orb-"], .ds-orb';
  // A list row (the reference's .li, .li.go: a hairline above, no box), the coach's to-do rows and the calendar's
  // Schedule rows (a phone's week) are rows, not boxed controls; the coach calendar's tiles are calendar events (coach
  // rule 28: 4px corners, the peach client tile).
  // The Dashboard's folded rows (.dash-fold-h) and the coach portal's own list rows (.cc-row, .cc-timeline-row,
  // .cc-auto-open, .cc-line) are hairline rows that open, as .ds-li (requests-b1 10, requests-b4 5, requests-b5 2).
  const ROWS = '.ds-li, .ds-todo-open, .cc-todo-row, .cc-sched-row, .dash-fold-h, .cc-row, .cc-timeline-row, .cc-auto-open, .cc-line';
  const CAL_TILES = '.cc-cal-tile, .cc-cal-more';
  const textNodesOf = (el) => [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
  const lines = (el, fs) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const mids = [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1).map((r) => r.top + r.height / 2).sort((x, y) => x - y);
    return mids.reduce((n, t, i) => (i && t - mids[i - 1] > fs * 0.6 ? n + 1 : n), mids.length ? 1 : 0);
  };

  // scroll
  if (document.documentElement.scrollWidth > W + 1) say('scroll', `the page is ${document.documentElement.scrollWidth}px wide at ${W}px`);

  // nekst, size, arrow
  const TITLE = 'h1, .ds-page-title, .ds-open-title, .si-ttl, .si-account-title, .auth-headline, .ds-guest-title, .cl-cover-title';
  const PRODUCT = /^THE CLARITY (PORTAL|PROJECT)$/;
  const ALLOWED = [13, 16, 20, 22, 24];
  const seenSize = new Set();
  for (const el of document.querySelectorAll('body *')) {
    const own = textNodesOf(el).map((n) => n.textContent.trim()).join(' ');
    if (!own || el.closest('svg, script, style, noscript, template') || !vis(el)) continue;
    const cs = getComputedStyle(el);
    if (own.includes('→')) say('arrow', `"→" in ${name(el)}`);
    if (/nekst/i.test(cs.fontFamily.split(',')[0])) {
      const shown = cs.textTransform === 'uppercase' ? own.toUpperCase() : own;
      if (shown !== shown.toUpperCase() || /\d/.test(own)) say('nekst', `Nekst on words or figures: "${own.slice(0, 36)}"`);
      else if (!el.closest(TITLE) && !PRODUCT.test(shown)) say('nekst', `Nekst on something that isn't a page title or the product's name: "${own.slice(0, 36)}"`);
    }
    if (scale === 1) {
      const fs = Math.round(parseFloat(cs.fontSize) * 10) / 10;
      const ok = ALLOWED.some((a) => near(fs, a, 0.3));
      if (!ok && !seenSize.has(`${fs}|${own.slice(0, 20)}`)) {
        seenSize.add(`${fs}|${own.slice(0, 20)}`);
        say('size', `${fs}px text: "${own.slice(0, 36)}"`);
      }
    }
  }

  // The top layer (an open panel or dialog, or an open Quick Add: its Add is that layer's own main button), else the page.
  const top = [...document.querySelectorAll('[role=dialog], [aria-modal=true], .ds-guide--fullscreen, .ds-pmenu, .ds-qa')].filter(vis).pop() || document.body;

  // Controls: anything you press or type into that is drawn as a box.
  const CTRL = 'button, a[href].ds-btn, [role=button], [role=radio]:not(input), [role=tab], input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea, .ds-count, .ds-numbox, .ds-stepper, .ds-seg, .hdr-mbox';
  const OWN = `${BREATHE}, ${ROWS}, ${CAL_TILES}, ${CAL_TILES.replace(/, /g, ' *, ')} *, [role=switch], [role=checkbox], .ds-check-box, [role=gridcell] *, .ds-cal-day, .ds-tab, [role=tab], .ds-seg-btn, .seg > button, .ds-count > button, .ds-stepper-btn, .ds-numbox input, .ds-mi, .ds-mbtn, svg, [class*="-dot"], .ds-chart *, .ds-google`;
  const drawn = (st) => (parseFloat(st.borderTopWidth) > 0 && st.borderTopStyle !== 'none' && !clear(st.borderTopColor)) || !clear(st.backgroundColor) || (/inset/.test(st.boxShadow) && /0px 0px 0px 1px/.test(st.boxShadow));
  const controls = [...top.querySelectorAll(CTRL)].filter((el) => vis(el) && !el.matches(OWN) && !el.closest('.ds-count, .ds-numbox, .ds-seg') ? true : el.matches('.ds-seg, .ds-count, .ds-numbox') && vis(el));
  const boxed = controls.filter((el) => drawn(getComputedStyle(el)));
  const radii = new Map();
  for (const el of boxed) {
    const st = getComputedStyle(el);
    const b = el.getBoundingClientRect();
    const r = parseFloat(st.borderTopLeftRadius) || 0;
    const shape = r >= b.height / 2 - 1 ? 'pill' : `${Math.round(r)}px`;
    if (!radii.has(shape)) radii.set(shape, []);
    radii.get(shape).push(el);
    // short: textareas grow, so they're left out.
    // My Mission in the phone header is a 40px box by the reference's own rule (rule 20); a textarea grows.
    if (el.tagName !== 'TEXTAREA' && !el.matches('.hdr-mbox') && b.height < (phone ? 44 : 40) - 0.5 && scale === 1) say('short', `${Math.round(b.height)}px control ${name(el)} (at least ${phone ? 44 : 40}px)`);
  }
  if (radii.size > 1) say('radius', [...radii].map(([k, v]) => `${k} ×${v.length} (${[...new Set(v.map(name))].slice(0, 3).join(' | ')})`).join('; '));

  // row-heights: controls whose middles share a line inside one row (the same parent row box), at least 20px high.
  const byRow = new Map();
  for (const el of boxed) {
    const b = el.getBoundingClientRect();
    if (b.height < 20 || el.tagName === 'TEXTAREA') continue;
    const row = el.parentElement?.closest('div, form, li, section, header, footer, nav, fieldset') || document.body;
    const key = `${Math.round((b.top + b.height / 2) / 6)}`;
    const k = [...byRow.keys()].find((x) => x.row === row && x.key === key) || { row, key };
    if (!byRow.has(k)) byRow.set(k, []);
    byRow.get(k).push(el);
  }
  for (const group of byRow.values()) {
    if (group.length < 2) continue;
    const hs = group.map((el) => el.getBoundingClientRect().height);
    if (Math.max(...hs) - Math.min(...hs) > 1) say('row-heights', group.map((el, i) => `${Math.round(hs[i])}px ${name(el).slice(0, 20)}`).join(' / '));
  }

  // wrap: words on more than one line inside a control (at the standard size).
  if (scale === 1) {
    for (const el of controls) {
      if (el.matches('textarea, input, select, .ds-answer:not(.ds-answer--box), [role=radio].ds-answer') || el.closest(`.ds-rows, ${ROWS}, ${CAL_TILES}`)) continue;
      const w = words(el);
      if (!w || w.length > 60) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (lines(el, fs) > 1) say('wrap', `words wrap inside ${name(el)}`);
    }
  }

  // main: more than one main button (black in light, white in dark: filled in the text colour) on the top layer.
  const textColour = getComputedStyle(document.querySelector('.ui-root') || document.body).color;
  const mains = [...top.querySelectorAll('button, a, [role=button]')].filter((el) => {
    if (!vis(el) || el.disabled || el.matches(OWN) || el.closest('.ds-seg, .seg, .ds-choices, .choices, .ds-rows, [role=radiogroup], [role=tablist], .ds-cal, .cal')) return false;
    const st = getComputedStyle(el);
    const b = el.getBoundingClientRect();
    return b.height >= 30 && words(el) && st.backgroundColor === textColour && !el.matches('[aria-pressed=true], [aria-checked=true], [aria-current]');
  });
  if (mains.length > 1) say('main', `${mains.length} main buttons: ${mains.slice(0, 4).map(name).join(', ')}`);

  // coral: a coral fill, words or edge that isn't a mistake.
  const corals = new Set();
  for (const el of top.querySelectorAll('*')) {
    if (el.closest(`${MISTAKE}, ${BREATHE}, ${CAL_TILES}, svg`) || !vis(el)) continue;
    const st = getComputedStyle(el);
    const fill = isCoral(st.backgroundColor);
    const ink = textNodesOf(el).length && isCoral(st.color);
    const edge = parseFloat(st.borderTopWidth) > 0 && isCoral(st.borderTopColor);
    if (fill || ink || edge) corals.add(`${fill ? 'filled' : ink ? 'words' : 'edge'} ${name(el)}`);
  }
  if (corals.size) say('coral', `coral that isn't a mistake: ${[...corals].slice(0, 5).join(', ')}`);

  // card: the label at the padding from the top and left, the last row ending the padding from the bottom.
  for (const card of top.querySelectorAll('.ds-card')) {
    if (!vis(card)) continue;
    const cs = getComputedStyle(card);
    const cb = card.getBoundingClientRect();
    const padT = parseFloat(cs.paddingTop);
    const padL = parseFloat(cs.paddingLeft);
    const padB = parseFloat(cs.paddingBottom);
    const bt = parseFloat(cs.borderTopWidth) || 0;
    const bl = parseFloat(cs.borderLeftWidth) || 0;
    const bb = parseFloat(cs.borderBottomWidth) || 0;
    const label = card.querySelector(':scope > .ds-card-head > .ds-label') || card.querySelector(':scope > .ds-label') || card.querySelector(':scope > .ds-card-head');
    if (label && vis(label)) {
      const lb = label.getBoundingClientRect();
      const head = label.closest('.ds-card-head')?.getBoundingClientRect() || lb;
      if (!near(head.top - cb.top - bt, padT, 1)) say('card', `label ${name(label)} is ${Math.round(head.top - cb.top - bt)}px from the card's top, not ${padT}`);
      if (!near(lb.left - cb.left - bl, padL, 1)) say('card', `label ${name(label)} is ${Math.round(lb.left - cb.left - bl)}px from the card's left, not ${padL}`);
    }
    const kids = [...card.children].filter(vis);
    const last = kids[kids.length - 1];
    // Cards side by side are one height (the shorter one's last row has room under it): only a card standing alone, or
    // the one whose content fills its row, is held to its foot.
    const parent = card.parentElement;
    const pd = parent ? getComputedStyle(parent).display : '';
    const stretched = /grid|flex/.test(pd) && [...parent.children].some((sib) => sib !== card && sib.matches('.ds-card') && vis(sib) && near(sib.getBoundingClientRect().top, cb.top, 1) && near(sib.getBoundingClientRect().height, cb.height, 1));
    if (last && !stretched) {
      // The last thing's own box, or its last row's, whichever ends lower.
      const lastRow = last.matches('.ds-rows-list') ? [...last.children].filter(vis).pop() || last : last;
      // Where its words end: the row's box less its own padding at the foot.
      const inner = (el) => el.getBoundingClientRect().bottom - (parseFloat(getComputedStyle(el).paddingBottom) || 0) - (parseFloat(getComputedStyle(el).borderBottomWidth) || 0);
      const end = lastRow === last ? inner(last) : Math.max(inner(lastRow), last.getBoundingClientRect().bottom - (parseFloat(getComputedStyle(last).paddingBottom) || 0));
      const gap = cb.bottom - bb - end;
      if (!near(gap, padB, 1)) say('card', `the last row of ${name(card).slice(0, 24)} ends ${Math.round(gap)}px from the card's bottom, not ${padB}`);
    }
  }

  // width: on a phone, cards, main buttons and answer boxes span the content column.
  if (phone) {
    // The objective and habit editors are drawn as the one card (requests-b2 3): what's inside spans their column.
    const CARDISH = '.ds-card, .ds-objed, .ds-habed';
    const spanners = [...top.querySelectorAll(`${CARDISH}, .ds-open-act > .ds-btn--primary, .ds-tool-foot > .ds-btn--primary, .ds-choices`)].filter(vis);
    if (spanners.length) {
      const col = spanners.reduce((a, el) => { const b = el.getBoundingClientRect(); return { l: Math.min(a.l, b.left), r: Math.max(a.r, b.right) }; }, { l: Infinity, r: -Infinity });
      for (const el of spanners) {
        if (el.parentElement?.closest(CARDISH)) continue;
        const b = el.getBoundingClientRect();
        if (!near(b.left, col.l, 1) || !near(b.right, col.r, 1)) say('width', `${name(el).slice(0, 24)} spans ${Math.round(b.left)} to ${Math.round(b.right)}, not the column ${Math.round(col.l)} to ${Math.round(col.r)}`);
      }
    }
  }

  // centre-icon: a link centred under a full-width button, with an icon.
  const fullButtons = [...top.querySelectorAll('button, a')].filter((el) => {
    if (!vis(el)) return false;
    const st = getComputedStyle(el);
    const b = el.getBoundingClientRect();
    const host = el.parentElement.getBoundingClientRect();
    return drawn(st) && b.height >= 36 && b.width >= host.width - 2 && b.width > 200;
  });
  for (const btn of fullButtons) {
    const bb = btn.getBoundingClientRect();
    const mid = bb.left + bb.width / 2;
    for (const link of top.querySelectorAll('a, button')) {
      if (link === btn || !vis(link) || drawn(getComputedStyle(link))) continue;
      const lb = link.getBoundingClientRect();
      if (lb.top < bb.bottom - 1 || lb.top - bb.bottom > 60) continue;
      const lr = document.createRange();
      lr.selectNodeContents(link);
      const tr = lr.getBoundingClientRect();
      const tmid = tr.left + tr.width / 2;
      if (Math.abs(tmid - mid) > 3 || tr.width > bb.width - 40) continue;
      const icon = [...link.querySelectorAll('.ds-chevron, .cv, svg, img, [class*="icon"]')].some(vis);
      if (icon) say('centre-icon', `${name(link)} is centred under ${name(btn)} with an icon (words only, rule 11)`);
    }
  }

  // repeat: a row whose first two lines are the same.
  for (const el of top.querySelectorAll('li, a, button, [role=listitem], .ds-li, .ds-row')) {
    if (!vis(el)) continue;
    const ls = (el.innerText || '').split('\n').map((x) => x.trim()).filter(Boolean);
    if (ls.length >= 2 && ls[0] === ls[1]) say('repeat', `"${ls[0].slice(0, 36)}" twice`);
  }

  // contrast: 13px and 16px text at 4.5 to 1 at least.
  const parse = (c) => { const v = rgb(c); return v.length >= 3 ? [v[0], v[1], v[2], v.length > 3 ? v[3] : 1] : null; };
  const over = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1);
  const lum = ([r, g, b]) => { const f = (x) => { const c = x / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const behind = (el) => {
    const layers = [];
    for (let p = el; p; p = p.parentElement) {
      const st = getComputedStyle(p);
      if (/url\(/.test(st.backgroundImage)) return null;
      const c = parse(st.backgroundColor);
      if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
    }
    let base = [255, 255, 255, 1];
    if (!layers.length || layers[layers.length - 1][3] < 1) base = parse(getComputedStyle(document.documentElement).backgroundColor) || base;
    if (base[3] < 1) base = [255, 255, 255, 1];
    return layers.reverse().reduce((b, l) => over(l, b), base);
  };
  const lowContrast = new Set();
  if (scale === 1) {
    for (const el of top.querySelectorAll('*')) {
      const own = textNodesOf(el).map((n) => n.textContent.trim()).join(' ');
      if (!own || !/[\p{L}\p{N}]/u.test(own) || el.closest('svg, script, style, noscript, template, [disabled], [aria-disabled=true], .ds-cal-day--out, [class*="placeholder"]') || !vis(el)) continue;
      const st = getComputedStyle(el);
      const fs = parseFloat(st.fontSize);
      if (!(near(fs, 13, 0.6) || near(fs, 16, 0.6))) continue;
      const bg = behind(el);
      const fg = parse(st.color);
      if (!bg || !fg) continue;
      let op = 1;
      for (let p = el; p; p = p.parentElement) op *= Number(getComputedStyle(p).opacity);
      const ink = over([fg[0], fg[1], fg[2], fg[3] * op], bg);
      const r = ratio(ink, bg);
      if (r < 4.5 - 0.005) lowContrast.add(`${r.toFixed(2)} to 1 for ${Math.round(fs)}px "${own.slice(0, 30)}"`);
    }
  }
  if (lowContrast.size) say('contrast', `text under 4.5 to 1: ${[...lowContrast].slice(0, 6).join(', ')}${lowContrast.size > 6 ? ` and ${lowContrast.size - 6} more` : ''}`);

  // Seen on screen, whatever aria-hidden says (a chevron, a mark).
  const seen = (el) => {
    const b = el.getBoundingClientRect();
    if (!(b.width > 0 && b.height > 0)) return false;
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      const st = getComputedStyle(p);
      if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) < 0.05) return false;
    }
    return !el.closest('[hidden]');
  };

  // chevron-line: a row that opens something keeps its chevron at its right end, on the name's line.
  const ROWLIKE = `${ROWS}, .ds-row, .cc-row, .dash-fold-h, .ds-expand-head, .ds-collapse-head, [role=listitem]`;
  for (const row of top.querySelectorAll(ROWLIKE)) {
    if (!vis(row)) continue;
    const rb = row.getBoundingClientRect();
    if (rb.width < 200) continue;
    const chev = [...row.querySelectorAll('.ds-chevron, .cv')].filter((c) => seen(c) && !c.matches('.ds-chevron--left, .ds-more-back')).pop();
    const link = chev?.closest('.ds-more, .ds-link');
    if (!chev || (link && link !== row && row.contains(link))) continue;
    // The name's first line: the first words in the row.
    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.textContent.trim() && vis(n.parentElement) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
    const first = walker.nextNode();
    if (!first) continue;
    const range = document.createRange();
    range.selectNodeContents(first);
    const line = [...range.getClientRects()].find((r) => r.width > 0 && r.height > 0);
    if (!line) continue;
    const cb = chev.getBoundingClientRect();
    const mid = cb.top + cb.height / 2;
    const rs = getComputedStyle(row);
    const inner = rb.right - (parseFloat(rs.paddingRight) || 0) - (parseFloat(rs.borderRightWidth) || 0);
    if (mid < line.top - 1 || mid > line.bottom + 1) say('chevron-line', `the chevron of ${name(row)} is off the name's line (${Math.round(mid - line.top)}px from its top)`);
    else if (inner - cb.right > 8) say('chevron-line', `the chevron of ${name(row)} is ${Math.round(inner - cb.right)}px from the row's right end`);
  }

  // divider: every row after the first in one list (or lists one after another) has the same divider.
  const ROW_ITEM = '.ds-li';
  for (const parent of top.querySelectorAll('*')) {
    let run = [];
    const flush = () => {
      if (run.length >= 3) {
        const lineOf = (el) => { const st = getComputedStyle(el); return parseFloat(st.borderTopWidth) > 0 && st.borderTopStyle !== 'none' && !clear(st.borderTopColor) ? 'line' : 'none'; };
        const kinds = run.slice(1).map(lineOf);
        if (new Set(kinds).size > 1) say('divider', `rows of one list differ in their dividers: ${run.slice(1).map((el, i) => `${name(el).slice(0, 22)} ${kinds[i]}`).slice(0, 4).join(', ')}`);
      }
      run = [];
    };
    for (const kid of parent.children) {
      if (!vis(kid)) continue;
      if (kid.matches(ROW_ITEM)) run.push(kid);
      else if (kid.matches('.ds-rows-list') && [...kid.children].filter(vis).every((k) => k.matches(ROW_ITEM))) run.push(...[...kid.children].filter(vis));
      else flush();
    }
    flush();
  }

  // bare-zero: a 24px figure reading 0, 0% or £0.
  // figures: at most one 24px figure in a card.
  const perCard = new Map();
  for (const el of top.querySelectorAll('*')) {
    const own = textNodesOf(el).map((n) => n.textContent.trim()).join(' ');
    if (!own || el.closest(`${TITLE}, svg, input, .ds-code, [class*="code-sq"]`) || !vis(el)) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 23.5 || fs > 25.5 * scale) continue;
    if (/^[£$€]?\s*0+(?:[.,]0+)?\s*%?$/.test(own)) say('bare-zero', `a bare "${own}" as a headline figure (say it in words: Figure's \`empty\`)`);
    const card = el.closest('.ds-card');
    if (card && /\d/.test(own)) { if (!perCard.has(card)) perCard.set(card, []); perCard.get(card).push(own); }
  }
  for (const [card, figs] of perCard) if (figs.length > 1) say('figures', `${figs.length} 24px figures in one card (${figs.slice(0, 4).map((f) => `"${f.slice(0, 16)}"`).join(', ')}): a row's value is 16px`);

  // fold-in-fold: a heading fold inside another fold's body (a closed fold's body counts: it is there, just shut).
  const FOLD = '.ds-collapse-head, details > summary, [aria-expanded][aria-controls]:not([aria-haspopup]):not([role=combobox]):not(.ds-mbtn):not(.ds-addrow):not(.ds-dd)';
  const folds = [...document.querySelectorAll(FOLD)].filter((t) => t.matches('.ds-collapse-head, summary') || t.querySelector('h2, h3, h4, .ds-label, .ds-section-title') || t.closest('h2, h3, h4'));
  const regionOf = (t) => (t.matches('summary') ? t.parentElement : document.getElementById(t.getAttribute('aria-controls') || '') || t.closest('.ds-collapse'));
  for (const inner of folds) {
    for (const outer of folds) {
      if (outer === inner) continue;
      const region = regionOf(outer);
      if (!region || (region.contains(outer) && !outer.matches('summary')) || !vis(outer)) continue;
      if (region.contains(inner) && region !== regionOf(inner)) { say('fold-in-fold', `${name(inner)} folds inside ${name(outer)}: make it a plain label`); break; }
    }
  }

  // card-gap: 20px between cards one above another, 32px from the page opening to the first card.
  for (const card of top.querySelectorAll('.ds-card')) {
    if (!vis(card)) continue;
    let prev = card.previousElementSibling;
    while (prev && !vis(prev)) prev = prev.previousElementSibling;
    if (!prev) continue;
    const a = prev.getBoundingClientRect();
    const b = card.getBoundingClientRect();
    if (b.top < a.bottom - 1 || !near(a.left, b.left, 1)) continue;
    const gap = b.top - a.bottom;
    if (prev.matches('.ds-card') && !near(gap, 20, 1)) say('card-gap', `${Math.round(gap)}px between ${name(prev).slice(0, 20)} and ${name(card).slice(0, 20)}, not 20`);
    if (prev.matches('.ds-open') && !near(gap, 32, 1)) say('card-gap', `${Math.round(gap)}px from the page opening to the first card, not 32`);
  }

  // empty-box: an outlined box with nothing in it and no role.
  const MARKS = '.ds-important-mark, .ds-mark-space, .ds-check-box, [role=checkbox], [role=switch], [role=radio], [role=progressbar], [role=img], [role=separator], [role=gridcell], button, a, input, select, textarea, label, .ds-switch, .ds-dot, [class*="-dot"], [class*="swatch"], [class*="ring"], [class*="orb"], [class*="logweek"], [class*="rate-"], [class*="week-sq"], [class*="skel"], [aria-label], [title]';
  for (const el of document.body.querySelectorAll('div, span, i, b, section, p')) {
    if (el.textContent.trim() || el.querySelector('svg, img, canvas, video, input, textarea, select, button, a, [role]') || el.closest(MARKS) || el.closest('svg')) continue;
    const st = getComputedStyle(el);
    const ring = ['Top', 'Right', 'Bottom', 'Left'].every((s) => parseFloat(st[`border${s}Width`]) > 0 && st[`border${s}Style`] !== 'none' && !clear(st[`border${s}Color`])) || /0px 0px 0px [\d.]+px/.test(st.boxShadow) && !/none/.test(st.boxShadow);
    if (!ring || /mask|url\(/.test(st.maskImage || '') || /url\(/.test(st.backgroundImage)) continue;
    const b = el.getBoundingClientRect();
    if (b.width < 8 || b.height < 8 || !seen(el)) continue;
    // A small square mark beside its row's words (a plan step's circle, a status box) says something by where it is.
    const square = Math.abs(b.width - b.height) <= 2 && b.width <= 28;
    if (square && el.parentElement && (el.parentElement.innerText || '').trim()) continue;
    // A box drawn for a field that sits beside it (the code's six squares over their one input) is that field's.
    if (el.parentElement?.parentElement?.querySelector(':scope > input, :scope > textarea')) continue;
    say('empty-box', `an empty outlined box, ${Math.round(b.width)} by ${Math.round(b.height)}px at ${Math.round(b.left)}, ${Math.round(b.top)} (${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0] || 'no class'})`);
  }

  // overlap: nothing drawn over the header's crosshair.
  const cross = [...document.querySelectorAll('.ds-mbtn, .hdr-menu')].find(seen);
  if (cross) {
    const r = cross.getBoundingClientRect();
    const bits = cross.querySelector('svg, .ds-bold-cross, .ds-x')?.getBoundingClientRect() || r;
    for (const el of document.body.querySelectorAll('button, a, [role=button], svg, img')) {
      if (el === cross || cross.contains(el) || el.contains(cross) || !seen(el) || el.closest('.ds-pmenu')) continue;
      const b = el.getBoundingClientRect();
      if (b.left < bits.right - 1 && b.right > bits.left + 1 && b.top < bits.bottom - 1 && b.bottom > bits.top + 1) {
        const st = getComputedStyle(el);
        if (Number(st.opacity) < 0.05) continue;
        say('overlap', `${el.tagName.toLowerCase()}.${String(el.className.baseVal ?? el.className).split(' ')[0]} ${name(el)} is drawn over the menu's crosshair`);
      }
    }
  }

  // mission: on a phone header, the box fills the row from the crosshair to the right margin, 40px high; on a laptop
  // with the frame it is sized to its words.
  const mbox = [...document.querySelectorAll('.hdr-frame .hdr-mbox')].find(seen);
  if (mbox) {
    const b = mbox.getBoundingClientRect();
    const head = mbox.closest('.hdr-frame');
    const hb = head.getBoundingClientRect();
    const hs = getComputedStyle(head);
    if (W < 1024) {
      const right = hb.right - parseFloat(hs.paddingRight);
      const menuBtn = [...head.querySelectorAll('.ds-mbtn')].find(seen);
      if (!near(b.height, 40, 0.5)) say('mission', `My Mission is ${Math.round(b.height)}px high in the phone header, not 40`);
      if (!near(b.right, right, 1)) say('mission', `My Mission ends ${Math.round(right - b.right)}px short of the header's right margin`);
      if (menuBtn && b.left - menuBtn.getBoundingClientRect().right > 24) say('mission', `My Mission starts ${Math.round(b.left - menuBtn.getBoundingClientRect().right)}px after the crosshair`);
    } else {
      const natural = [...mbox.childNodes].reduce((w, n) => { const rg = document.createRange(); rg.selectNodeContents(n); return w + rg.getBoundingClientRect().width; }, 0);
      const ms = getComputedStyle(mbox);
      const pad = parseFloat(ms.paddingLeft) + parseFloat(ms.paddingRight) + parseFloat(ms.borderLeftWidth) * 2;
      if (b.width > natural + pad + 16 && mbox.scrollWidth <= mbox.clientWidth + 1) say('mission', `My Mission is ${Math.round(b.width)}px wide on a laptop, wider than its words (${Math.round(natural + pad)}px)`);
    }
  }

  return { problems: [...new Set(out)], counts: { controls: controls.length, cards: top.querySelectorAll('.ds-card').length } };
}
