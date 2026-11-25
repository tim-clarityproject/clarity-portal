// One left edge (Tim, 23 Nov 2026, 17:40; sign-in rule 49, which replaces
// the morning's "one alignment per page, each row centred as a group").
// A page with a form, a list, a box to type in, numbered steps or more than
// a few lines puts everything on the column's left edge: the logo or
// crosshair, the title, the text, the boxes, the buttons, the tick box rows,
// the links and the small print, and Back, which sits on the same edge.
// A short message page (no boxes, no list: "Check your email", "You're in")
// is centred throughout. Never a mix.
//
// Each row of the page's main column is read from what is drawn (text from
// its own letters, an icon from its drawing, a chevron from its visible
// edge, a box from its edge, a numbered step from its number), never from
// the element's full width:
//   - a form or list page (`data-align="start"`): a row fails when its left
//     edge is more than 1px off the column's left edge;
//   - a message page (`data-align="centre"`): a row fails when its middle is
//     more than 1px off the column's middle, a drawn box fails when what it
//     holds has more space on one side than the other, and the page fails
//     when it holds a box to type in, a tick box or a list (it is then a
//     form or list page, and centring it is the mix the rule forbids).
// A full-width button is a drawn box on the column's edge; its words are
// centred inside it, which is not part of the rule. A note under its button
// is centred on that button (rule 29v), on either kind of page. On a
// message page Back keeps its place at the top left (rule 29t), and
// anything marked `data-align="start"` (a message's own lines inside its
// box) is passed by.
//
// Run in the page:
//   const found = await page.evaluate(centredGroups, { root: '.si-col' });
//   centringProblems(found)  // one line per row or box that is off
// `align` ('centre' or 'start') is read from the column's `data-align`,
// otherwise from its text-align; pass it to say it outright. `also` names
// parts outside the column that sit on its edge too (the outside pages'
// crosshair in the bar above the column).
//
// The 25 Nov reference (polish 1) centres the sign-in pages' forms: a column
// marked `data-form="centred"` may hold boxes, a tick box and lists (each
// list and tick box row marked `data-align="start"`); every other row is
// centred on the column.
//
// Fixtures: tests/signin/centring.test.mjs.

export const TOLERANCE = 1;

/** Everything is inside this one function: page.evaluate sends it on its own. */
export function centredGroups(arg) {
  const opts = typeof arg === 'string' ? { root: arg } : (arg || {});
  const tolerance = opts.tolerance ?? 1;
  const BACK = '.si-back, .hc-backrow, .hc-back, .ds-guide-back, .ui-back-link';
  const col = document.querySelector(opts.root || '.si-col');
  if (!col) return { align: null, rows: [], boxes: [], skipped: [] };
  const cs = (el) => getComputedStyle(el);
  const round = (v) => +v.toFixed(2);
  const clear = (c) => !c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c);
  const colStyle = cs(col);
  let pageColour = null;
  for (let e = col; e && !pageColour; e = e.parentElement) if (!clear(cs(e).backgroundColor)) pageColour = cs(e).backgroundColor;
  const said = opts.align || col.dataset.align;
  const align = said ? (/^cent/.test(said) ? 'centre' : 'start') : (colStyle.textAlign === 'center' ? 'centre' : 'start');
  const cr = col.getBoundingClientRect();
  let inner = {
    left: cr.left + parseFloat(colStyle.borderLeftWidth) + parseFloat(colStyle.paddingLeft),
    right: cr.right - parseFloat(colStyle.borderRightWidth) - parseFloat(colStyle.paddingRight),
  };
  // `column: 'children'`: a column whose parts are held narrower inside it
  // (the outside Health Check's) is as wide as the parts themselves.
  if (opts.column === 'children') {
    const parts = [...col.children].filter((k) => { const r = k.getBoundingClientRect(); return r.width > 0 && !['absolute', 'fixed'].includes(cs(k).position); }).map((k) => k.getBoundingClientRect());
    if (parts.length) inner = { left: Math.min(...parts.map((r) => r.left)), right: Math.max(...parts.map((r) => r.right)) };
  }
  const centre = (inner.left + inner.right) / 2;

  // Seen at all: not hidden, not faded out, not a screen reader's words.
  const unseen = (el) => {
    const s = cs(el);
    if (s.display === 'none' || s.visibility === 'hidden' || s.visibility === 'collapse') return true;
    if (s.clip && s.clip !== 'auto' && /rect\(\s*0/.test(s.clip)) return true;
    if (s.clipPath && /inset\(\s*50%/.test(s.clipPath)) return true;
    const r = el.getBoundingClientRect();
    if (s.position === 'absolute' && r.width <= 1 && r.height <= 1) return true;
    for (let e = el; e && e !== col.parentElement; e = e.parentElement) if (+cs(e).opacity === 0) return true;
    return false;
  };
  const shown = (el) => { const r = el.getBoundingClientRect(); return (r.width > 0 || r.height > 0) && !unseen(el); };
  const inFlow = (el) => !['absolute', 'fixed'].includes(cs(el).position);
  // A drawn box: an edge all round, a fill, or a hairline drawn as a shadow.
  const drawn = (el) => {
    if (el instanceof SVGElement) return false;
    const s = cs(el);
    const sides = ['Top', 'Right', 'Bottom', 'Left'];
    const edged = sides.every((k) => parseFloat(s[`border${k}Width`]) > 0 && s[`border${k}Style`] !== 'none' && !clear(s[`border${k}Color`]));
    return edged || !clear(s.backgroundColor) || (s.boxShadow && s.boxShadow !== 'none');
  };
  const name = (el) => {
    const cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean)[0];
    const words = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 32);
    return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}${words ? ` “${words}”` : ''}`;
  };

  // The ink of a part: the union of what is drawn in it.
  const inkOf = (start, { self = true } = {}) => {
    let box = null;
    const add = (r) => {
      if (!r || !(r.right - r.left > 0) || !(r.bottom - r.top > 0)) return;
      box = box ? { left: Math.min(box.left, r.left), right: Math.max(box.right, r.right), top: Math.min(box.top, r.top), bottom: Math.max(box.bottom, r.bottom) }
        : { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };
    const walk = (node, top) => {
      if (node.nodeType === 3) {
        const text = node.data;
        const from = text.search(/\S/);
        if (from < 0) return;
        const to = text.length - (text.length - text.trimEnd().length);
        const rg = document.createRange();
        rg.setStart(node, from);
        rg.setEnd(node, to);
        // Letter spacing follows every letter, the last one too: it is space, not ink.
        const ls = Math.max(0, parseFloat(cs(node.parentElement).letterSpacing) || 0);
        const rects = [...rg.getClientRects()].filter((r) => r.width > 0);
        // Words that wrap fill their line: a wrapped block set on the left is
        // as wide as the block that holds it, so that block's content box is
        // their extent. Centred lines are read as they stand, each centred.
        let blk = node.parentElement;
        while (blk && blk !== start && /^inline|^contents$/.test(cs(blk).display)) blk = blk.parentElement;
        if (new Set(rects.map((r) => Math.round(r.top))).size > 1 && cs(blk).textAlign !== 'center') {
          const bs = cs(blk);
          const br = blk.getBoundingClientRect();
          const l = br.left + parseFloat(bs.borderLeftWidth) + parseFloat(bs.paddingLeft);
          const r = br.right - parseFloat(bs.borderRightWidth) - parseFloat(bs.paddingRight);
          for (const x of rects) add({ left: l, right: r, top: x.top, bottom: x.bottom });
          return;
        }
        for (const r of rects) add({ left: r.left, right: r.right - ls, top: r.top, bottom: r.bottom });
        return;
      }
      if (node.nodeType !== 1 || unseen(node)) return;
      // A chevron is a mask on a square: its visible edges are inside the square
      // (--chev-left-inset and --chev-right-inset for a 16px one, as backGaps reads them).
      if (node.classList?.contains('ds-chevron')) {
        const st = cs(node);
        const m = /matrix\(([^)]+)\)/.exec(st.transform);
        const shift = m ? Number(m[1].split(',')[4]) || 0 : 0;
        const b = node.getBoundingClientRect();
        const size = node.offsetWidth || b.width;
        const mid = b.left + b.width / 2 - shift;
        const k = size / 16;
        const inL = (parseFloat(st.getPropertyValue('--chev-left-inset')) || 5) * k;
        const inR = (parseFloat(st.getPropertyValue('--chev-right-inset')) || 5.5) * k;
        if (node.classList.contains('ds-chevron--left')) add({ left: mid - size / 2 + inL, right: mid + size / 2 - inR, top: b.top, bottom: b.bottom });
        else if (node.classList.contains('ds-chevron--right')) add({ left: mid - size / 2 + inR, right: mid + size / 2 - inL, top: b.top, bottom: b.bottom });
        else add(b);
        return;
      }
      // What a part draws before or after itself: a numbered step's number
      // (set at its own left), or a line drawn as a filled box ("or"'s two
      // lines, which reach the part's own edges).
      if (!(node instanceof SVGElement)) {
        const b = node.getBoundingClientRect();
        const st = cs(node);
        for (const which of ['::before', '::after']) {
          const ps = getComputedStyle(node, which);
          if (!ps.content || ps.content === 'none' || ps.content === 'normal' || ps.display === 'none') continue;
          const words = ps.content !== '""' && ps.content !== "''";
          const filled = !clear(ps.backgroundColor);
          if (!words && !filled) continue;
          if (ps.position === 'absolute' && ps.left !== 'auto') {
            const l = b.left + parseFloat(st.borderLeftWidth) + parseFloat(ps.left);
            add({ left: l, right: l + Math.max(1, parseFloat(ps.width) || 0), top: b.top, bottom: b.bottom });
          } else if (filled && ps.position !== 'absolute') {
            add({ left: b.left + parseFloat(st.borderLeftWidth) + parseFloat(st.paddingLeft), right: b.right - parseFloat(st.borderRightWidth) - parseFloat(st.paddingRight), top: b.top, bottom: b.bottom });
          }
        }
      }
      if (node instanceof SVGSVGElement) {
        // A shape filled in the page's own colour with no line round it isn't seen
        // (the QR code's quiet zone in light mode).
        const unseenShape = (x) => { const st = cs(x); return st.fill === pageColour && (!st.stroke || st.stroke === 'none'); };
        const shapes = [...node.querySelectorAll('path, rect, circle, ellipse, line, polyline, polygon, text, use, image')].filter((x) => cs(x).display !== 'none' && cs(x).visibility !== 'hidden' && !unseenShape(x));
        if (shapes.length) shapes.forEach((x) => add(x.getBoundingClientRect()));
        else add(node.getBoundingClientRect());
        return;
      }
      if (/^(IMG|CANVAS|VIDEO|INPUT|SELECT|TEXTAREA|PICTURE)$/.test(node.tagName)) { add(node.getBoundingClientRect()); return; }
      if (!(top && !self) && drawn(node)) { add(node.getBoundingClientRect()); return; }
      // Inside a box, words the page sets on the left on purpose (a message's
      // lines) count as the block they fill, not their ragged right edge.
      if (!top && node.dataset?.align === 'start') { add(node.getBoundingClientRect()); return; }
      for (const child of node.childNodes) walk(child, false);
    };
    walk(start, true);
    return box;
  };

  // What a page sets on the left on purpose: a numbered list, a form field, or a part marked so.
  const numbered = (el) => el.tagName === 'OL' && (cs(el).listStyleType !== 'none'
    || [...el.children].some((li) => /counter/.test(getComputedStyle(li, '::before').content)));
  const exemptWhy = (el) => {
    // On a form or list page every part is on the one left edge: nothing is passed by.
    if (align === 'start') return null;
    const marked = el.closest('[data-align="start"]');
    if (marked && marked !== col && col.contains(marked)) return 'marked left';
    if (numbered(el)) return 'numbered list';
    // Back sits with its chevron on the content's left edge (rule 29t), measured by the chevron suites.
    if (el.matches(BACK)) return 'Back';
    return null;
  };
  // A box and its label: only a part that holds nothing else is passed by as one.
  const formField = (el) => align === 'centre' && plainField(el);
  const plainField = (el) => el.matches('label, input, select, textarea')
    || Boolean(el.querySelector('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea'));

  // The rows: the column's parts, opened up while they stack one above another.
  const rows = [];
  const skipped = [];
  const gather = (el) => {
    // Back sits above the column's first row (on the sign-in pages it is placed
    // there on its own), on the same left edge as everything else.
    if (align === 'start' && el.matches(BACK) && shown(el)) { rows.push(el); return; }
    if (!inFlow(el) || !shown(el)) return;
    const why = exemptWhy(el);
    if (why) { skipped.push(`${name(el)} (${why})`); return; }
    if (drawn(el)) {
      if (formField(el)) skipped.push(`${name(el)} (form field)`);
      else rows.push(el);
      return;
    }
    const kids = [...el.children].filter((k) => inFlow(k) && shown(k));
    const words = [...el.childNodes].some((n) => n.nodeType === 3 && n.data.trim());
    // The parts stack when each sits on its own line, below the one before.
    const boxes = kids.map((k) => k.getBoundingClientRect()).sort((a, b) => a.top - b.top);
    const stacks = !words && kids.length > 0 && boxes.every((r, n) => n === 0 || r.top >= boxes[n - 1].bottom - 0.5);
    if (stacks) kids.forEach(gather);
    else if (formField(el)) skipped.push(`${name(el)} (form field)`);
    else rows.push(el);
  };
  [...col.children].forEach(gather);
  // Parts outside the column that sit on its edge (the crosshair in the bar above it).
  if (opts.also) for (const el of document.querySelectorAll(opts.also)) if (shown(el) && !col.contains(el)) rows.push(el);

  // A message page holds no box to type in, no tick box and no list. The
  // sign-in pages of the 25 Nov reference (polish 1, rule 22) are a centred
  // form on purpose: their column says so (`data-form="centred"`), its boxes
  // span it, and its lists and tick box rows are marked to keep their own
  // left edge (`data-align="start"`).
  const formOrList = [];
  if (align === 'centre' && col.dataset.form !== 'centred') {
    for (const el of col.querySelectorAll('input:not([type=hidden]), select, textarea, [role=checkbox], ol, ul')) {
      if (!shown(el)) continue;
      if (/^(OL|UL)$/.test(el.tagName) && [...el.children].filter(shown).length < 2) continue;
      formOrList.push(name(el));
    }
  }

  const out = { align, col: { left: round(inner.left), right: round(inner.right), centre: round(centre) }, rows: [], boxes: [], skipped, formOrList };
  const boxesSeen = new Set();
  const checkBox = (el) => {
    if (boxesSeen.has(el) || el.matches('input, select, textarea, button.ds-google')) return;
    boxesSeen.add(el);
    const r = el.getBoundingClientRect();
    const s = cs(el);
    const ink = inkOf(el, { self: false });
    if (!ink) return;
    const spaceLeft = ink.left - (r.left + parseFloat(s.borderLeftWidth));
    const spaceRight = (r.right - parseFloat(s.borderRightWidth)) - ink.right;
    out.boxes.push({ name: name(el), spaceLeft: round(spaceLeft), spaceRight: round(spaceRight), ok: Math.abs(spaceLeft - spaceRight) <= tolerance });
  };
  // A note under its button is centred on that button (rule 29v), whatever the page's alignment.
  // A note is words: a link or button after a button is an action of its own, on the page's edge.
  const buttonAbove = (el) => {
    if (el.matches('a, button, [role=button], [role=link]')) return null;
    let prev = el.previousElementSibling;
    while (prev && !shown(prev)) prev = prev.previousElementSibling;
    return prev && prev.matches('button, .si-btn, .ui-btn-primary, .ui-btn-ghost') && el.parentElement !== col ? prev : null;
  };
  // A table's heading row starts with an empty corner over the row numbers or the
  // hours (a grid whose first cell draws nothing): its words stand over their own
  // columns, and the row starts where the table does (rule 20).
  const tableHead = (el) => {
    if (!/grid/.test(cs(el).display)) return false;
    const first = [...el.children].find((k) => inFlow(k) && !unseen(k));
    return Boolean(first) && !inkOf(first);
  };
  for (const el of rows) {
    let ink = inkOf(el);
    if (!ink) continue;
    if (tableHead(el)) {
      const r = el.getBoundingClientRect();
      ink = { ...ink, left: r.left + parseFloat(cs(el).borderLeftWidth) + parseFloat(cs(el).paddingLeft) };
    }
    const mid = (ink.left + ink.right) / 2;
    const above = buttonAbove(el);
    const ab = above?.getBoundingClientRect();
    const off = above ? mid - (ab.left + ab.right) / 2 : (align === 'centre' ? mid - centre : ink.left - inner.left);
    out.rows.push({ name: name(el), left: round(ink.left), right: round(ink.right), centre: round(mid), off: round(off), ok: Math.abs(off) <= tolerance });
    // On a message page every drawn box in the row (the row itself included) holds its content in its middle.
    // (A mark holding one icon alone, such as a play button's disc, is left to the icon's own drawing.)
    if (align !== 'centre') continue;
    const iconOnly = (b) => !b.textContent.trim() && b.children.length === 1 && b.firstElementChild instanceof SVGSVGElement;
    for (const b of [el, ...el.querySelectorAll('*')]) if (!(b instanceof SVGElement) && shown(b) && drawn(b) && b.children.length + b.textContent.trim().length > 0 && !iconOnly(b)) checkBox(b);
  }
  return out;
}

/** One line per row whose group is off, and per box whose two sides differ. */
export function centringProblems(found) {
  if (!found || !found.align) return ['no column found'];
  const how = found.align === 'centre' ? `from the column’s centre ${found.col.centre}` : `from the column’s left edge ${found.col.left}`;
  return [
    ...(found.formOrList || []).map((x) => `${x}: a centred message page holds a box, a tick box or a list, so it must be on one left edge`),
    ...found.rows.filter((r) => !r.ok).map((r) => `${r.name} is ${r.off}px ${how} (ink ${r.left} to ${r.right})`),
    ...found.boxes.filter((b) => !b.ok).map((b) => `${b.name}: ${b.spaceLeft}px inside on the left, ${b.spaceRight}px on the right`),
  ];
}
