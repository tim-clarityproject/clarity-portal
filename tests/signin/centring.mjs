// One alignment per page, each row centred as a group (Tim, 23 Nov 2026;
// sign-in rule 49). On a centred page (every sign-in page, the coach
// authenticator's screens, the outside Health Check's centred screens)
// each row of the page's main column is centred as one group: its words,
// icons and tick boxes together, read from what is drawn (text from its own
// letters, an icon from its drawing, a box from its edge), never from the
// element's full width. Exempt: a numbered list, a form field (a box and
// its label), and anything marked `data-align="start"`, which is how a page
// says its one alignment puts that part on the left (Back, a form's tick
// row). A drawn box (an edge all round, a fill or a hairline shadow) is its
// own group, and what it holds has equal space left and right inside it.
// On a left-aligned page (My Account's) every row starts on the column's
// left edge instead.
//
// Run in the page:
//   const found = await page.evaluate(centredGroups, { root: '.si-col' });
//   centringProblems(found)  // one line per row or box that is off
// `align` ('centre' or 'start') is read from the column's `data-align`,
// otherwise from its text-align; pass it to say it outright.
//
// Fixtures: tests/signin/centring.test.mjs (Tim's four faults and their
// fixed forms).

export const TOLERANCE = 1;

/** Everything is inside this one function: page.evaluate sends it on its own. */
export function centredGroups(arg) {
  const opts = typeof arg === 'string' ? { root: arg } : (arg || {});
  const tolerance = opts.tolerance ?? 1;
  const col = document.querySelector(opts.root || '.si-col');
  if (!col) return { align: null, rows: [], boxes: [], skipped: [] };
  const cs = (el) => getComputedStyle(el);
  const round = (v) => +v.toFixed(2);
  const clear = (c) => !c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c);
  const colStyle = cs(col);
  const align = opts.align || col.dataset.align || (colStyle.textAlign === 'center' ? 'centre' : 'start');
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
      if (node instanceof SVGSVGElement) {
        const shapes = [...node.querySelectorAll('path, rect, circle, ellipse, line, polyline, polygon, text, use, image')].filter((x) => cs(x).display !== 'none' && cs(x).visibility !== 'hidden');
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
    const marked = el.closest('[data-align="start"]');
    if (marked && marked !== col && col.contains(marked)) return 'marked left';
    if (numbered(el)) return 'numbered list';
    // Back sits with its chevron on the content's left edge (rule 29t), measured by the chevron suites.
    if (el.matches('.si-back, .hc-back, .ds-guide-back, .ui-back-link, .hc-backrow')) return 'Back';
    return null;
  };
  // A box and its label: only a part that holds nothing else is passed by as one.
  const formField = (el) => el.matches('label, input, select, textarea')
    || Boolean(el.querySelector('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea'));

  // The rows: the column's parts, opened up while they stack one above another.
  const rows = [];
  const skipped = [];
  const gather = (el) => {
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

  const out = { align, col: { left: round(inner.left), right: round(inner.right), centre: round(centre) }, rows: [], boxes: [], skipped };
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
  const buttonAbove = (el) => {
    let prev = el.previousElementSibling;
    while (prev && !shown(prev)) prev = prev.previousElementSibling;
    return prev && prev.matches('button, .si-btn, .ui-btn-primary, .ui-btn-ghost') && el.parentElement !== col ? prev : null;
  };
  for (const el of rows) {
    const ink = inkOf(el);
    if (!ink) continue;
    const mid = (ink.left + ink.right) / 2;
    const above = buttonAbove(el);
    const ab = above?.getBoundingClientRect();
    const off = above ? mid - (ab.left + ab.right) / 2 : (align === 'centre' ? mid - centre : ink.left - inner.left);
    out.rows.push({ name: name(el), left: round(ink.left), right: round(ink.right), centre: round(mid), off: round(off), ok: Math.abs(off) <= tolerance });
    // Every drawn box in the row (the row itself included) holds its content in its middle.
    // (A mark holding one icon alone, such as a play button's disc, is left to the icon's own drawing.)
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
    ...found.rows.filter((r) => !r.ok).map((r) => `${r.name} is ${r.off}px ${how} (ink ${r.left} to ${r.right})`),
    ...found.boxes.filter((b) => !b.ok).map((b) => `${b.name}: ${b.spaceLeft}px inside on the left, ${b.spaceRight}px on the right`),
  ];
}
