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
//   overlap       anything drawn over the header's crosshair (walk item 32); what lies under it in the stack is not
//   mission       My Mission in the phone header not filling the row from the crosshair to the right margin at 40px
//                 high, or on a laptop stretched past its words (walk item 33)
//
// Tim's walk of Stage B (26 Nov; WALK-B.md):
//   who-line      a page's opening line saying who can see it in words (item 5: the eye alone, 5e rule 10)
//   label-wrap    a section label (13px spaced capitals) on more than one line (item 9)
//   switch        a joined switch with unequal parts where equal ones fit, or stretched past its parts while it shares
//                 its row (item 7)
//   tap           a link or fold whose tap area (its box, or its invisible ::after or ::before) is under 44px high
//                 (items 6 and 8; rule 29g); a link inside a sentence is left out, as WCAG leaves it out
//   bare-zero     also a row's value reading a bare 0, 0%, £0 or £0/month (item 9)
//   breathe       Breathe drawn over something to press in a fixed bar at the foot (item 2); a panel drawn over
//                 Breathe hides it, so it isn't drawn over that panel's foot (read from the stacking, as overlap);
//                 the floating button not a 48px circle, with words or coral, on a laptop (1024px and wider: Breathe
//                 is the menu's item) or on the Breathe page (NEXT-BREATHE.md, option D)
//   year          a date this year shown with its year (item 4; writing rule 28)
//   focus         a tool's address (TOOL_ROUTES) showing the menu, the phone header, My Mission or Breathe: a tool runs
//                 in focus mode (item 1; rule 21). Give `route` (the runner passes the address it landed on).
//   duplicate     the same action (three words or more) offered twice on one screen, outside list rows (item 10);
//                 answers (radios, toggles, options) are not actions, and an objective's editor is its own card
//   card          also a card with no label whose first row doesn't start at its padding (item 11)
//
// The UI tester's findings (FX2, 26 Nov):
//   focus         also anything but the tool drawn while the frame is in focus mode, on any address: the menu, the
//                 phone header, My Mission, the coach's Search and bell, the next-session strip (F1)
//   title-wrap    a page title on two lines that fits its column on one (F12: room kept for a My Mission box that
//                 isn't there, or wider than the box)
//   edge          a page opening not on the frame's left edge: the frame's padding on a laptop, 20px under 1024px (F15)
//   progress      a tool's progress line with less than 8% filled: step 1 shows a short filled start (P15)
//   bare-zero     also a nought with its unit in words ("0 minutes") as a headline figure (F8)
//   coral-fill    any coral background, a mistake's included: a mistake is one coral line of words (Tim, 26 Nov, 15:55)
//
// Tim's walk fixes (27 Nov):
//   add           "+ Add" in a card's head not the 32px square (soft grey, no outline, 8px corners, 16px plus, level with
//                 the label, at the head's right, a 44px tap area, named by what it adds) (item 4)
//   mission       (changed) on a laptop no My Mission box in the header; the Mission line under the title on one 13px line
//                 with "…", a hairline, 24px to what follows; never under 1024px (item 5)
//   squeeze       two columns with the main one under 560px; a row's name, a figure's label, a section label or a card
//                 narrower than its longest word (item 17)
//
// The Breathe tools (Tim, 26 Nov, decisions part 12; NEXT-BREATHE-TOOLS.md "Checks"), on any screen with the orb
// (Breathe and Sleep wind down):
//   breathe-colour   coral or mint anywhere on a Breathe screen: the orb's lines, fills, words, buttons and edges are
//                    the text, line and surface colours only
//   breathe-words    the words beside the orb drawn over it (they sit beside it on a laptop and under it on a phone)
//   breathe-square   Box breathing drawn with a circle (every part of its orb is a rounded square), or another
//                    exercise drawn square
//   breathe-height   a button, joined switch or drop-down on a Breathe screen not 40px high (44px on a phone); the
//                    exercises' answer boxes are 56px (52px), and the × and quiet links keep their 44px tap height
//
// Starting points: client-audit-25nov.md's measuring script (Claude, 25 Nov) and the example pages' own checks.
// Only the standard text size is held to the sizes (scale 1): larger device text grows them.
export function designProblems({ phone = false, scale = 1, route = null, tools = null } = {}) {
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
      // A typed signature is drawn at 28px (M28 v6 .sigprev; --fs-signature): a hand's mark, not words on the scale.
      const ok = ALLOWED.some((a) => near(fs, a, 0.3)) || Boolean(el.closest('[data-signature], .cl-sigprev, .cl-sig-typed'));
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
  const OWN = `${BREATHE}, ${ROWS}, ${CAL_TILES}, ${CAL_TILES.replace(/, /g, ' *, ')} *, [role=switch], [role=checkbox], .ds-check-box, [role=gridcell] *, .ds-cal-day, .ds-tab, [role=tab], .ds-seg-btn, .seg > button, .ds-count > button, .ds-stepper-btn, .ds-numbox input, .ds-mi, .ds-mbtn, svg, [class*="-dot"], .ds-chart *, .ds-google, .ds-addsq`;
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
      // Breathe's answer boxes (.ds-bt-ans) hold the name and its grey line, one under the other on a phone, each on one line.
      if (el.matches('textarea, input, select, .ds-answer:not(.ds-answer--box), [role=radio].ds-answer, [role=radio].ds-bt-ans') || el.closest(`.ds-rows, .ds-row, ${ROWS}, ${CAL_TILES}`)) continue; // a saved-items row (ListRow, .ds-row) is a row: its type line may wrap
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

  // coral-fill: nothing has a coral background, a mistake included (Tim, 26 Nov, 15:55): a mistake is one short line of
  // coral words under what it is about, as M28 v6 draws it, never a filled or tinted box. Soft coral tints count too.
  const coralFill = (c) => {
    if (clear(c)) return false;
    const [r, g, b, a = 1] = rgb(c);
    if (a < 0.04) return false;
    return (r > 180 && g > 50 && g < 145 && b > 35 && b < 125 && r - g > 80) || (r > 240 && g > 170 && g < 200 && b > 140 && b < 175)
      || (r > 245 && g > 215 && g < 240 && b > 195 && b < 230 && r - b > 20);
  };
  const filled = new Set();
  for (const el of top.querySelectorAll('*')) {
    if (el.closest(`${BREATHE}, ${CAL_TILES}, svg`) || !vis(el)) continue;
    if (coralFill(getComputedStyle(el).backgroundColor)) filled.add(name(el));
  }
  if (filled.size) say('coral-fill', `a coral background (a mistake is a coral line of words, never a box): ${[...filled].slice(0, 5).join(', ')}`);

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
    // No label: the first row's words start at the padding (item 11), as the label's would.
    const firstKid = [...card.children].find(vis);
    if (!label && firstKid && firstKid.matches('.ds-li, .ds-rows-list')) {
      const row = firstKid.matches('.ds-rows-list') ? [...firstKid.children].find(vis) : firstKid;
      if (row) {
        const rs = getComputedStyle(row);
        const wordsTop = row.getBoundingClientRect().top + (parseFloat(rs.paddingTop) || 0) + (parseFloat(rs.borderTopWidth) || 0) - cb.top - bt;
        if (!near(wordsTop, padT, 1)) say('card', `the first row of a card with no label, ${name(row)}, starts ${Math.round(wordsTop)}px from the card's top, not ${padT}`);
      }
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
    if (/^[£$€]?\s*0+(?:[.,]0+)?\s*%?$/.test(own) || /^0+\s+[a-z]+$/i.test(own)) say('bare-zero', `a bare "${own}" as a headline figure (say it in words: Figure's \`empty\`)`);
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
        // Stacking (Polish 1, Stage C): a row scrolled under the sticky header, or under a full-screen panel that also
        // covers the crosshair, sits below the crosshair and its header's background, so it isn't drawn over it. At the
        // middle of the two boxes' overlap: the crosshair nearer the eye, with an opaque part between them.
        const x = (Math.max(b.left, bits.left) + Math.min(b.right, bits.right)) / 2;
        const y = (Math.max(b.top, bits.top) + Math.min(b.bottom, bits.bottom)) / 2;
        const stack = document.elementsFromPoint(x, y);
        const at = (fn) => stack.findIndex(fn);
        const crossAt = at((k) => k === cross || cross.contains(k));
        const elAt = at((k) => k === el || el.contains(k));
        // Underneath and hidden: something opaque lies between the two (the header's own background).
        const opaque = (k) => { const m = getComputedStyle(k).backgroundColor.match(/[\d.]+/g); return m && (m.length < 4 || Number(m[3]) > 0.9); };
        if (crossAt >= 0 && elAt >= 0 && crossAt < elAt && stack.slice(crossAt, elAt).some((k) => !k.contains(el) && opaque(k))) continue;
        say('overlap', `${el.tagName.toLowerCase()}.${String(el.className.baseVal ?? el.className).split(' ')[0]} ${name(el)} is drawn over the menu's crosshair`);
      }
    }
  }

  // mission: on a phone header, the box fills the row from the crosshair to the right margin, 40px high. On a laptop
  // (walk item 5, Tim, 27 Nov, option C) there is no box: the Mission is one 13px line straight under the page title
  // (MissionLine), "My Mission" grey then the Mission, one line ending in "…", a hairline under it, 24px to what follows.
  const mbox = [...document.querySelectorAll('.hdr-frame .hdr-mbox')].find(seen);
  if (mbox && W >= 1024) say('mission', 'a My Mission box is drawn in the laptop header (the Mission is a line under the title on Home and Dashboard)');
  for (const ml of document.querySelectorAll('.ds-mline')) {
    if (!seen(ml)) continue;
    if (W < 1024) { say('mission', 'the laptop\'s Mission line shows under 1024px (the phone header box is the Mission there)'); continue; }
    const st = getComputedStyle(ml);
    const b = ml.getBoundingClientRect();
    const prev = ml.previousElementSibling;
    if (!prev || !prev.matches('.ds-open-title, h1')) say('mission', 'the Mission line is not straight under the page title');
    if (scale === 1 && !near(parseFloat(st.fontSize), 13, 0.3)) say('mission', `the Mission line is ${parseFloat(st.fontSize)}px, not 13`);
    const v = ml.querySelector('.ds-mline-v');
    if (v && lines(v, parseFloat(st.fontSize)) > 1) say('mission', 'the Mission line wraps (one line ending in "…")');
    if (v && v.scrollWidth > v.clientWidth + 1 && getComputedStyle(v).textOverflow !== 'ellipsis') say('mission', 'a long Mission is cut without "…"');
    const k = ml.querySelector('.ds-mline-k');
    if (k && v && !ml.matches('.ds-mline--none') && getComputedStyle(k).color === getComputedStyle(v).color) say('mission', '"My Mission" and the Mission are the same colour (grey, then the text colour)');
    if (!(parseFloat(st.borderBottomWidth) > 0) || clear(st.borderBottomColor)) say('mission', 'the Mission line has no hairline under it');
    const next = ml.nextElementSibling;
    if (next && seen(next)) {
      const gap = next.getBoundingClientRect().top - b.bottom;
      if (!near(gap, 24, 1)) say('mission', `${Math.round(gap)}px from the Mission line's hairline to ${name(next).slice(0, 20)}, not 24`);
    }
  }
  if (mbox && W < 1024) {
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
    }
  }


  // ------------------------------------------------------------------ Tim's walk of Stage B (26 Nov)

  // who-line: a page line saying who can see the page in words (the eye says it).
  for (const el of top.querySelectorAll('.ds-open-line, .ds-page-line, .ds-tool-hint')) {
    if (!vis(el)) continue;
    // Widened (FX7, 26 Nov): "who can read it", "sees the same …" and "shared with …" say it too.
    const w = words(el);
    if (/\b(only you|you and [A-Z][\w’']*|your (coach|team)) can (see|read)\b/i.test(w)
      || /\bwho can (see|read)\b/i.test(w)
      || /\b(sees?|see) the same\b/i.test(w)
      || /\bshared with\b/i.test(w)) say('who-line', `${name(el)} says who can see it in words (the eye says it)`);
  }

  // label-wrap: a section label on one line.
  if (scale === 1) {
    for (const el of top.querySelectorAll('.ds-label, .ds-section-title, .ds-open-label, .cc-fold-title, .ds-card-head > h2, .ds-card-head > h3')) {
      if (!vis(el) || el.closest('.ds-li, .ds-rows')) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (lines(el, fs) > 1) say('label-wrap', `the label ${name(el)} wraps onto ${lines(el, fs)} lines`);
    }
  }

  // switch: equal parts where they fit; sized to its parts while it shares its row.
  for (const seg of top.querySelectorAll('.ds-seg')) {
    if (!vis(seg) || seg.matches('.ds-seg-measure')) continue;
    const parts = [...seg.querySelectorAll(':scope > button, :scope > [role=radio]')].filter(vis);
    if (parts.length < 2) continue;
    const ws = parts.map((b) => b.getBoundingClientRect().width);
    const natural = parts.map((b) => {
      const st = getComputedStyle(b);
      const r = document.createRange();
      r.selectNodeContents(b);
      return r.getBoundingClientRect().width + parseFloat(st.paddingLeft) + parseFloat(st.paddingRight);
    });
    const sb = seg.getBoundingClientRect();
    const host = seg.parentElement.getBoundingClientRect();
    const frame = sb.width - ws.reduce((a, b) => a + b, 0);
    // Equal parts fit when the switch plus the room its line leaves free could hold the widest part each time; a row
    // crowded below that keeps the parts' own widths (one line wins).
    const even = Math.max(...natural) * parts.length + frame;
    // Its holder: the switch with the wrappers it sits alone in (InlineChoice's .ds-choice and .ds-inline, a page's own).
    let holder = seg;
    while (holder.parentElement && holder.parentElement !== top && [...holder.parentElement.children].filter((k) => vis(k) && getComputedStyle(k).position !== 'absolute').length === 1) holder = holder.parentElement;
    const row = holder.parentElement;
    const hb = holder.getBoundingClientRect();
    const sameLine = [...row.children].filter((k) => vis(k) && (() => { const b = k.getBoundingClientRect(); return b.top < hb.bottom - 1 && b.bottom > hb.top + 1; })());
    const rs = getComputedStyle(row);
    const gapX = parseFloat(rs.columnGap) || 0;
    const used = sameLine.reduce((a, k) => a + k.getBoundingClientRect().width, 0) + gapX * Math.max(0, sameLine.length - 1);
    const free = row.getBoundingClientRect().width - (parseFloat(rs.paddingLeft) || 0) - (parseFloat(rs.paddingRight) || 0) - used;
    const fits = even <= sb.width + Math.max(0, free) + 1 && even <= host.width + 1;
    if (fits && Math.max(...ws) - Math.min(...ws) > 1.5) say('switch', `the joined switch ${name(seg).slice(0, 28)} has unequal parts (${ws.map((w) => Math.round(w)).join(' and ')}px)`);
    const own = Math.max(...natural) * parts.length + frame;
    if (sb.width > own + 4) {
      const mid = sb.top + sb.height / 2;
      const sharing = [...top.querySelectorAll('a, button, [role=tab], input, select, .ds-dd')].some((el) => !seg.contains(el) && !el.contains(seg) && vis(el) && (() => { const b = el.getBoundingClientRect(); return b.top < mid && b.bottom > mid && b.width > 0; })());
      if (sharing) say('switch', `the joined switch ${name(seg).slice(0, 28)} is ${Math.round(sb.width)}px wide, stretched past its parts (${Math.round(own)}px), in a row it shares`);
    }
  }

  // tap: links and folds keep a 44px tap area (their box, or an invisible ::after or ::before laid over it).
  if (scale === 1) {
    const reach = (el) => {
      let h = el.getBoundingClientRect().height;
      for (const pseudo of ['::after', '::before']) {
        const ps = getComputedStyle(el, pseudo);
        if (ps.content && ps.content !== 'none' && ps.position === 'absolute' && ps.display !== 'none') h = Math.max(h, parseFloat(ps.height) || 0);
      }
      return h;
    };
    for (const el of top.querySelectorAll('a[href], button, [role=button], summary')) {
      if (!vis(el) || el.matches(OWN) || el.closest(`${ROWS}, ${CAL_TILES}, .ds-seg, .ds-choices, .ds-rows, [role=tablist], [role=grid], .ds-cal, svg, .ds-chart`)) continue;
      const st = getComputedStyle(el);
      if (drawn(st) && el.matches(CTRL)) continue; // a boxed control: the short rule measures it
      const host = el.parentElement;
      if (host && /^(P|LI|SPAN|SMALL)$/.test(host.tagName) && (host.innerText || '').trim().length > (el.innerText || '').trim().length + 12) continue; // inside a sentence
      const h = reach(el);
      if (h < 44 - 0.5) say('tap', `the ${el.getAttribute('aria-expanded') != null ? 'fold' : 'link'} ${name(el)} has a ${Math.round(h)}px tap area (44px)`);
    }
  }

  // bare-zero in a row: a row's value reading a bare 0, 0%, £0 or £0/month.
  for (const el of top.querySelectorAll('.ds-li-value, .fin-row-value, .cc-row-value')) {
    if (!vis(el)) continue;
    const v = words(el);
    if (/^[£$€]?\s*0+(?:[.,]0+)?\s*%?(?:\s*\/\s*\w+)?$/.test(v)) say('bare-zero', `a row's value reads a bare "${v}" (say it in words)`);
  }

  // breathe: Breathe never sits on something to press in a fixed bar at the foot.
  const orb = [...document.querySelectorAll('.ds-orb--fixed .ds-breathe')].find(seen);
  if (orb) {
    const ob = orb.getBoundingClientRect();
    const fixedAncestor = (el) => { for (let p = el; p && p !== document.body; p = p.parentElement) if (getComputedStyle(p).position === 'fixed') return p; return null; };
    for (const el of document.body.querySelectorAll('button, a[href], input, textarea, select, [role=button]')) {
      if (orb.contains(el) || el.closest('.ds-orb') || !seen(el)) continue;
      const bar = fixedAncestor(el);
      if (!bar) continue;
      const b = el.getBoundingClientRect();
      if (!(b.left < ob.right - 1 && b.right > ob.left + 1 && b.top < ob.bottom - 1 && b.bottom > ob.top + 1)) continue;
      // Stacking (FX8, 26 Nov), as `overlap` reads it: at the middle of the two boxes' overlap, Breathe is drawn over the
      // control only when it is nearer the eye. A side panel or dialog drawn over Breathe (its own foot's "Done"
      // included) hides Breathe there, so Breathe isn't drawn over anything of it.
      const x = (Math.max(b.left, ob.left) + Math.min(b.right, ob.right)) / 2;
      const y = (Math.max(b.top, ob.top) + Math.min(b.bottom, ob.bottom)) / 2;
      const stack = document.elementsFromPoint(x, y);
      const orbAt = stack.findIndex((k) => k === orb || orb.contains(k) || Boolean(k.closest?.('.ds-orb')));
      const elAt = stack.findIndex((k) => k === el || el.contains(k));
      if (orbAt < 0 || (elAt >= 0 && elAt < orbAt)) continue;
      say('breathe', `Breathe is drawn over ${name(el)} in a fixed bar`);
    }
  }

  // breathe, the button itself (Tim, 26 Nov, decisions part 12; NEXT-BREATHE.md, option D): a 48px round button with no
  // word and no coral, under 1024px only (on a laptop Breathe is the menu's plain item and nothing floats over the
  // page), and never on the Breathe page.
  const breathePath = (route || location.pathname || '').split(/[?#]/)[0].replace(/\/$/, '');
  for (const fb of [...document.querySelectorAll('.ds-orb--fixed .ds-breathe')].filter(seen)) {
    const r = fb.getBoundingClientRect();
    const s = getComputedStyle(fb);
    if (W >= 1024) say('breathe', 'the Breathe button floats over the page on a laptop (Breathe is the menu’s item there)');
    if (breathePath === '/breathe') say('breathe', 'the Breathe button shows on the Breathe page');
    if (Math.abs(r.width - 48) > 0.5 || Math.abs(r.height - 48) > 0.5 || parseFloat(s.borderTopLeftRadius) < 23.5) say('breathe', `the Breathe button is ${Math.round(r.width)} by ${Math.round(r.height)}px and not round (a 48px circle)`);
    if ((fb.innerText || '').trim()) say('breathe', `the Breathe button has words ("${fb.innerText.trim().slice(0, 20)}"; its name is read out, never shown)`);
    const marks = [s.borderTopColor, s.backgroundColor, s.color, ...(s.boxShadow.match(/rgba?\([^)]*\)/g) || []), ...[...fb.querySelectorAll('svg, svg *')].flatMap((k) => { const ks = getComputedStyle(k); return [ks.stroke, ks.fill]; })];
    if (marks.some((c) => /^rgb/.test(c) && isCoral(c))) say('breathe', 'the Breathe button uses coral (coral is for mistakes only)');
  }

  // year: a date this year never shows its year (writing rule 28).
  const yearNow = new Date().getFullYear();
  const MONTHS = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
  const dated = new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)? ${MONTHS},? ${yearNow}\\b|\\b${MONTHS} \\d{1,2},? ${yearNow}\\b`, 'i');
  const seenYear = new Set();
  for (const el of top.querySelectorAll('body *')) {
    const own = textNodesOf(el).map((n) => n.textContent.trim()).join(' ');
    if (!own || el.closest('svg, script, style, input, textarea, [contenteditable], .ds-legal, [data-year]') || !vis(el)) continue;
    const m = own.match(dated);
    if (m && !seenYear.has(m[0])) { seenYear.add(m[0]); say('year', `"${m[0]}" shows this year's date with its year`); }
  }

  // focus: a tool runs in focus mode, with no menu, header, My Mission or Breathe.
  const path = (route || '').split(/[?#]/)[0].replace(/\/$/, '') || null;
  // The tools' addresses (inside the function: the page receives it as text, so nothing outside travels with it).
  const TOOL_ROUTES = tools || ['/daily-journal', '/daily-plan', '/plan-meeting', '/pressure-plan', '/time-audit', '/pre-mortem', '/pre-mortem/risks', '/pre-mortem/plan', '/give-difficult-feedback', '/give-difficult-feedback/questions', '/breathe', '/sleep-wind-down'];
  // A client still being prepared sees the preparing page at a tool's address (walk item 15): no tool, so no focus mode.
  if (path && TOOL_ROUTES.includes(path) && !document.querySelector('[data-preparing]')) {
    const shown = ['.ds-frame-side .ds-mi', '.ds-mbtn', '.hdr-mbox', '.ds-orb--fixed .ds-breathe'].filter((sel) => [...document.querySelectorAll(sel)].some(seen));
    if (shown.length) say('focus', `the tool at ${path} isn't in focus mode: ${shown.join(', ')} show${shown.length === 1 ? 's' : ''}`);
  }

  // focus, on any address: while the frame is in focus mode nothing but the tool shows (F1).
  if (document.querySelector('.ds-frame-root--focus')) {
    const extra = ['.ds-frame-side .ds-mi', '.ds-frame-phead .ds-mbtn', '.hdr-mbox', '.cc-header--frame .cc-search', '.cc-glass-btn', '.cc-callbar'].filter((sel) => [...document.querySelectorAll(sel)].some(seen));
    if (extra.length) say('focus', `focus mode shows more than the tool: ${extra.join(', ')}`);
  }

  // title-wrap: a page title on two lines that would fit its column on one (F12).
  for (const t of top.querySelectorAll('.ds-open-title, .ds-page-title')) {
    if (!vis(t) || t.closest('[role=dialog]')) continue;
    const st = getComputedStyle(t);
    const lh = parseFloat(st.lineHeight) || parseFloat(st.fontSize) * 1.2;
    const textH = t.getBoundingClientRect().height - parseFloat(st.paddingTop) - parseFloat(st.paddingBottom);
    if (textH < lh * 1.5) continue;
    // The title as drawn on one line, its eye or ⓘ beside it included: a copy beside it with nothing to wrap.
    const probe = t.cloneNode(true);
    probe.removeAttribute('id');
    Object.assign(probe.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'nowrap', width: 'max-content', maxWidth: 'none', paddingLeft: '0px', paddingRight: '0px', left: '0px', top: '0px' });
    t.parentElement.appendChild(probe);
    const one = probe.getBoundingClientRect().width;
    probe.remove();
    const column = t.getBoundingClientRect().width - parseFloat(st.paddingLeft);
    if (one <= column - 1) say('title-wrap', `the title ${name(t)} wraps onto two lines though it fits its ${Math.round(column)}px column on one (${Math.round(one)}px)`);
  }

  // edge: the page opening starts on the frame's left edge (F15).
  const frameMain = document.querySelector('.ds-frame-main');
  if (frameMain && !document.querySelector('.ds-frame-root--focus')) {
    const fm = frameMain.getBoundingClientRect();
    const want = W < 1024 ? fm.left + 20 : fm.left + parseFloat(getComputedStyle(frameMain).paddingLeft);
    const open = [...frameMain.querySelectorAll('.ds-open')].find((o) => vis(o) && !o.closest('[role=dialog], .ds-card'));
    if (open && Math.abs(open.getBoundingClientRect().left - want) > 1) say('edge', `the page opening starts at ${Math.round(open.getBoundingClientRect().left)}px, not on the frame's edge at ${Math.round(want)}px`);
  }

  // progress: a tool's progress line shows a short filled start from step 1 (P15).
  for (const fill of document.querySelectorAll('.ds-tool-prog > i, .ds-guide-pct-track > span')) {
    const track = fill.parentElement;
    if (!seen(track)) continue;
    const tw = track.getBoundingClientRect().width;
    if (tw > 0 && fill.getBoundingClientRect().width < tw * 0.08 - 0.5) say('progress', `the progress line is ${Math.round(fill.getBoundingClientRect().width)}px of ${Math.round(tw)}px filled (step 1 shows a short filled start)`);
  }

  // add: "+ Add" in a card's head is the square (walk item 4, Tim, 27 Nov, option B): 32 by 32, the soft surface grey with
  // no outline, 8px corners, a 16px plus, centred on the card label's line at the head's right end, a 44px tap area, and
  // named by what it adds ("Add a to-do"). An add in a card's head drawn as the words "+ Add" fails.
  for (const head of top.querySelectorAll('.ds-card-head')) {
    if (!vis(head)) continue;
    const label = head.querySelector(':scope > .ds-label, :scope > h2, :scope > h3, :scope > .ds-card-head-l .ds-label');
    for (const old of head.querySelectorAll('.ds-addrow')) {
      if (vis(old) && words(old) === 'Add') say('add', `"+ Add" in the head of ${name(label || head)} is drawn as words, not the square`);
    }
    for (const sq of head.querySelectorAll('.ds-addsq')) {
      if (!vis(sq)) continue;
      const st = getComputedStyle(sq);
      const b = sq.getBoundingClientRect();
      const who = `the "+ Add" square of ${name(label || head)}`;
      if (!near(b.width, 32, 0.5) || !near(b.height, 32, 0.5)) say('add', `${who} is ${Math.round(b.width)} by ${Math.round(b.height)}px, not 32 by 32`);
      if (!near(parseFloat(st.borderTopLeftRadius) || 0, 8, 0.5)) say('add', `${who} has ${parseFloat(st.borderTopLeftRadius) || 0}px corners, not 8`);
      if (parseFloat(st.borderTopWidth) > 0 && st.borderTopStyle !== 'none' && !clear(st.borderTopColor)) say('add', `${who} has an outline`);
      if (clear(st.backgroundColor)) say('add', `${who} has no fill`);
      const plus = sq.querySelector('.ds-addsq-plus')?.getBoundingClientRect();
      if (plus && !near(plus.width, 16, 0.5)) say('add', `${who}'s plus is ${Math.round(plus.width)}px, not 16`);
      const lab = (sq.getAttribute('aria-label') || '').trim();
      if (!/^Add \S/.test(lab) || lab === 'Add') say('add', `${who} isn't named by what it adds ("${lab}")`);
      let tap = Math.min(b.width, b.height);
      const ps = getComputedStyle(sq, '::after');
      if (ps.content && ps.content !== 'none' && ps.position === 'absolute') tap = Math.max(tap, Math.min(parseFloat(ps.width) || 0, parseFloat(ps.height) || 0));
      if (tap < 44 - 0.5) say('add', `${who} has a ${Math.round(tap)}px tap area (44px)`);
      if (label && vis(label)) {
        const lb = label.getBoundingClientRect();
        if (Math.abs((b.top + b.height / 2) - (lb.top + lb.height / 2)) > 1.5) say('add', `${who} isn't level with the label (${Math.round((b.top + b.height / 2) - (lb.top + lb.height / 2))}px off its middle)`);
        const card = head.closest('.ds-card');
        if (card) {
          const cb = card.getBoundingClientRect();
          const cs = getComputedStyle(card);
          const inner = cb.right - (parseFloat(cs.borderRightWidth) || 0) - (parseFloat(cs.paddingRight) || 0);
          if (inner - b.right > 1) say('add', `${who} ends ${Math.round(inner - b.right)}px short of the card's right padding`);
        }
      }
    }
  }

  // squeeze (walk item 17, 27 Nov): two columns only while the main column is at least 560px wide; and a row's name, a
  // figure's label or a card never narrower than its longest word (the value moves under the name instead).
  if (W >= 1024) {
    for (const cols of top.querySelectorAll('.ds-cols')) {
      if (!vis(cols)) continue;
      const kids = [...cols.children].filter(vis);
      if (kids.length < 2) continue;
      const [a, b2] = kids.map((k) => k.getBoundingClientRect());
      const side = a.right <= b2.left + 1 || b2.right <= a.left + 1;
      if (side) {
        const main = Math.max(a.width, b2.width) === a.width ? a : b2;
        if (main.width < 560 - 0.5) say('squeeze', `two columns with the main one ${Math.round(main.width)}px wide (one column under 560px)`);
      }
    }
  }
  if (scale === 1) {
    const canvas = document.createElement('canvas').getContext('2d');
    const longest = (el) => {
      const st = getComputedStyle(el);
      canvas.font = `${st.fontStyle} ${st.fontWeight} ${st.fontSize} ${st.fontFamily}`;
      const ls = parseFloat(st.letterSpacing) || 0;
      const ws = (el.innerText || '').split(/\s+/).filter((w) => w.length >= 4 && /\p{L}/u.test(w));
      let best = { w: 0, word: '' };
      for (const word of ws) {
        const shown = st.textTransform === 'uppercase' ? word.toUpperCase() : word;
        const w = canvas.measureText(shown).width + ls * shown.length;
        if (w > best.w) best = { w, word };
      }
      return best;
    };
    const SQUEEZE = '.ds-li-name, .ds-fig-label, .ds-stat-label, .ds-label, .ds-card-head > h2, .ds-card-head > h3';
    const said = new Set();
    for (const el of top.querySelectorAll(SQUEEZE)) {
      if (!vis(el) || el.closest('[role=dialog] .ds-chart, svg')) continue;
      const st = getComputedStyle(el);
      const room = el.getBoundingClientRect().width - (parseFloat(st.paddingLeft) || 0) - (parseFloat(st.paddingRight) || 0);
      const { w, word } = longest(el);
      if (word && room < w - 1 && !said.has(word)) { said.add(word); say('squeeze', `${name(el)} is ${Math.round(room)}px wide, narrower than its word "${word.slice(0, 24)}" (${Math.round(w)}px)`); }
    }
    for (const card of top.querySelectorAll('.ds-card')) {
      if (!vis(card)) continue;
      const cs = getComputedStyle(card);
      const room = card.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const { w, word } = longest(card);
      if (word && room < w - 1) say('squeeze', `the card ${name(card).slice(0, 24)} is ${Math.round(room)}px wide inside, narrower than "${word.slice(0, 24)}" (${Math.round(w)}px)`);
    }
  }

  // duplicate: one action offered twice on one screen (outside list rows, where each row has its own).
  // Each card's own action, like each row's, belongs to that card ("Show as a table" under each of two charts, "Edit
  // this objective" on each objective's card): counted within its card, or across the page outside cards. An objective's
  // own editor (.ds-objed, its own box in Build your plan) and a carried row (.ds-carry-row, KeepChangeRow in the sprint
  // review) are each their own card. An answer is not an action (FX8, 26 Nov): a choice (role radio, option, checkbox
  // or switch, a pressed or unpressed toggle, anything in a radio group) is what one thing is, so each objective's "I’ll
  // track a number" or each row's "Keep it as it is" is that row's own answer, never one action offered again.
  const ANSWER = '[role=radio], [role=option], [role=checkbox], [role=switch], [role=menuitemradio], [role=menuitemcheckbox], [aria-pressed], [role=radiogroup] *';
  const actions = new Map();
  const scopes = new Map();
  for (const el of top.querySelectorAll('a[href], button, [role=button]')) {
    if (!vis(el) || el.closest(`${ROWS}, li, tr, [role=row], [role=listitem], .ds-rows-list, [role=menu]`) || el.matches(ANSWER)) continue;
    const w = (el.innerText || '').replace(/\s+/g, ' ').trim();
    if (w.split(' ').length < 3) continue;
    const scope = el.closest('.ds-card, .ds-objective, .ds-objed, .ds-carry-row, section[class*="card"]');
    if (!scopes.has(scope)) scopes.set(scope, scopes.size);
    const key = `${scopes.get(scope)}|${w}`;
    actions.set(key, (actions.get(key) || 0) + 1);
  }
  for (const [key, n] of actions) if (n > 1) say('duplicate', `"${key.slice(key.indexOf('|') + 1).slice(0, 40)}" is offered ${n} times`);

  // The Breathe tools (NEXT-BREATHE-TOOLS.md "Checks"): a screen with the orb, or Breathe's own page.
  const orbs = [...document.querySelectorAll('[data-breathe-orb]')].filter(seen);
  const breatheScreen = document.querySelector('[data-breathe]') || orbs[0]?.closest('.ds-night-breathe, .ds-guide, .ui-root');
  if (breatheScreen && seen(breatheScreen)) {
    // breathe-colour: no coral and no mint, in any colour, edge, line or fill (the orb's SVG included).
    const isMint = (c) => {
      if (clear(c) || !/rgb/.test(c)) return false;
      const [r, g, b, a = 1] = rgb(c);
      return a >= 0.3 && g > 100 && g - r > 60 && g - b > 15;
    };
    const tinted = new Set();
    for (const el of [breatheScreen, ...breatheScreen.querySelectorAll('*')]) {
      if (!seen(el) && !(el instanceof SVGElement && el.closest('svg') && seen(el.closest('svg')))) continue;
      const st = getComputedStyle(el);
      const paints = [st.color, st.backgroundColor];
      if (parseFloat(st.borderTopWidth) > 0 && st.borderTopStyle !== 'none') paints.push(st.borderTopColor);
      if (el instanceof SVGElement) paints.push(st.stroke, st.fill);
      const bad = paints.find((c) => c && (isCoral(c) || isMint(c)));
      if (bad) tinted.add(`${isCoral(bad) ? 'coral' : 'mint'} on ${el instanceof SVGElement ? `the orb's ${el.tagName}` : name(el)}`);
    }
    if (tinted.size) say('breathe-colour', `coral or mint on a Breathe screen: ${[...tinted].slice(0, 5).join(', ')}`);

    // breathe-words: the words never on the orb.
    for (const words of document.querySelectorAll('[data-breathe-words]')) {
      if (!seen(words)) continue;
      const wb = words.getBoundingClientRect();
      for (const orb of orbs) {
        const ob = orb.getBoundingClientRect();
        const x = Math.min(wb.right, ob.right) - Math.max(wb.left, ob.left);
        const y = Math.min(wb.bottom, ob.bottom) - Math.max(wb.top, ob.top);
        if (x > 0.5 && y > 0.5) say('breathe-words', `the words ${name(words)} are drawn over the orb (${Math.round(x)} by ${Math.round(y)}px)`);
      }
    }

    // breathe-square: Box breathing is squares only, the others round.
    for (const orb of orbs) {
      const words = orb.closest('.ds-bstage, [data-breathe], .ds-night-breathe')?.querySelector('[data-breathe-words]');
      const box = /Box breathing/.test(words?.innerText || '') || orb.dataset.orbShape === 'square';
      const circles = orb.querySelectorAll('circle').length;
      if (box && circles) say('breathe-square', `Box breathing's orb draws ${circles} circle${circles === 1 ? '' : 's'} (every part a rounded square)`);
      if (box && words && !/Box breathing/.test(words.innerText)) say('breathe-square', `${name(words)} is drawn square (only Box breathing is)`);
    }

    // breathe-height: the tools' controls are 40px (44px on a phone).
    const want = phone || W <= 600 ? 44 : 40; // the phone sizes start at 600px and under (tokens.css)
    for (const el of breatheScreen.querySelectorAll('.ds-btn, .ds-seg, button.ds-dd, select')) {
      if (!vis(el)) continue;
      const h = el.getBoundingClientRect().height;
      if (Math.abs(h - want) > 0.5 && scale === 1) say('breathe-height', `${name(el)} is ${Math.round(h)}px high on a Breathe screen (${want}px)`);
    }
  }

  return { problems: [...new Set(out)], counts: { controls: controls.length, cards: top.querySelectorAll('.ds-card').length } };
}
