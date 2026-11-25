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

  // The top layer (an open panel or dialog), else the page.
  const top = [...document.querySelectorAll('[role=dialog], [aria-modal=true], .ds-guide--fullscreen, .ds-pmenu')].filter(vis).pop() || document.body;

  // Controls: anything you press or type into that is drawn as a box.
  const CTRL = 'button, a[href].ds-btn, [role=button], [role=radio]:not(input), [role=tab], input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea, .ds-count, .ds-numbox, .ds-stepper, .ds-seg, .hdr-mbox';
  const OWN = `${BREATHE}, [role=switch], [role=checkbox], .ds-check-box, [role=gridcell] *, .ds-cal-day, .ds-tab, [role=tab], .ds-seg-btn, .seg > button, .ds-count > button, .ds-stepper-btn, .ds-numbox input, .ds-mi, .ds-mbtn, svg, [class*="-dot"], .ds-chart *, .ds-google`;
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
      if (el.matches('textarea, input, select, .ds-answer:not(.ds-answer--box), [role=radio].ds-answer') || el.closest('.ds-rows')) continue;
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
    if (el.closest(`${MISTAKE}, ${BREATHE}, svg`) || !vis(el)) continue;
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
    const spanners = [...top.querySelectorAll('.ds-card, .ds-open-act > .ds-btn--primary, .ds-tool-foot > .ds-btn--primary, .ds-choices')].filter(vis);
    if (spanners.length) {
      const col = spanners.reduce((a, el) => { const b = el.getBoundingClientRect(); return { l: Math.min(a.l, b.left), r: Math.max(a.r, b.right) }; }, { l: Infinity, r: -Infinity });
      for (const el of spanners) {
        if (el.closest('.ds-card') && el.closest('.ds-card') !== el) continue;
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

  return { problems: [...new Set(out)], counts: { controls: controls.length, cards: top.querySelectorAll('.ds-card').length } };
}
