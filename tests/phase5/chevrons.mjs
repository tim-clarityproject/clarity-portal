// Chevrons centred on their text (Tim, 11 Nov, 14:36; decisions part 5,
// 15:20): a chevron (the half crosshair) beside text sits centred on that
// text. Beside lowercase text its centre lines up with the middle of the
// x-height; beside capitals, the middle of the cap height. Within 0.5px,
// measured in a browser, open and closed, everywhere: folds, drop-downs,
// Back, links that go somewhere.
//
// measureChevrons(page) is shared by tests/phase5/calm-rules.mjs (every
// page in scope) and by anything else that wants the numbers.
//
// How it measures:
//   - the chevron's centre is read from the screen's own pixels (the
//     strokes that can be seen), so the clip, the mask and every transform
//     are in it;
//   - the text's middle is read the same way, from one plain letter of the
//     words as it was really drawn (a letter as tall as "x" beside lowercase
//     words, a flat capital beside capitals; failing those a round one, o or
//     O, whose middle is the same). Where the words have no such letter it
//     comes from the font's own measures: the baseline, less half the height
//     of "x" or of "H".
//
// What it will not pass over (break-it, 11 Nov): the chevron is read with
// the words around it left undrawn, so a first letter close by is never
// taken for part of it; and a chevron built to sit beside words that is
// left on a row of its own, pushed off the side of the screen or not drawn
// at all is listed by chevronsOff as a fault; so is one that is hidden
// while its words can be seen, one with no mask (a filled corner), and one
// with nothing drawn that no open list lies over (break-it, 12 Nov).
// Everything else it could not measure is in the list's `skipped`, each
// with its reason.
//
// A chevron counts as "beside text" when it and one line of words share a
// row inside the same control (a button, a link, a summary or a label), or
// the control's own row. The words are the control's own: the first on the
// chevron's row, in reading order. A chevron beside several lines of words (a name
// with a line under it) is centred on the block as a whole, and one with no
// words beside it (a calendar's arrows, a row's "more" chevron under a
// two-line name) isn't measured here.

// Each chevron is read from its own small screenshot. Playwright would wait
// for every font on the page before each one (and can wait for ever on a
// font that is only fetched when first used); the callers wait for the
// fonts once, themselves, before measuring.
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';

/**
 * Runs in the page. With no number: tags every chevron that can be seen and
 * says how many. With a number: brings that one into view and gives its box
 * and its words' middle as they then stand.
 */
function collect(only = null) {
  const vis = (el) => {
    const b = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return b.width > 0 && b.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0.05 && !el.closest('[hidden],[inert]');
  };
  const out = [];
  const seen = new Set();
  if (only === null) {
    let n = 0;
    for (const el of document.querySelectorAll('[data-chev-n]')) el.removeAttribute('data-chev-n');
    for (const chev of document.querySelectorAll('.ds-chevron, .ui-back-link-icon, .hc .chev')) {
      if (!vis(chev)) continue;
      chev.setAttribute('data-chev-n', String(n));
      n += 1;
    }
    return n;
  }
  for (const chev of document.querySelectorAll(`[data-chev-n="${only}"]`)) {
    if (!vis(chev) || seen.has(chev)) continue;
    seen.add(chev);
    chev.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    const control = chev.closest('button, a, summary, label, [role=button], [role=combobox]') || chev.parentElement;
    if (!control || !vis(control)) continue;
    const cb = chev.getBoundingClientRect();
    // Built to sit beside words (Chevron's `beside`, the Health Check's own line).
    const beside = Boolean(chev.closest('.ds-chevron-line, .chev-line'));
    const name = `${String(control.className?.baseVal ?? control.className ?? '').split(' ')[0] || control.tagName.toLowerCase()} "${(control.innerText || control.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 34)}"`;
    // Its square as it stands before it is turned (a turned square's own box is wider than its strokes).
    const square = { x: cb.left + cb.width / 2 - chev.offsetWidth / 2, y: cb.top + cb.height / 2 - chev.offsetHeight / 2, width: chev.offsetWidth, height: chev.offsetHeight };
    const skip = (why, lines = 0) => out.push({ skip: why, label: name, beside, lines, box: square });
    // Its shape is the mask: without one it is a filled corner, not a chevron,
    // wherever its middle lands (break-it, 12 Nov).
    const cst = getComputedStyle(chev);
    if ((cst.maskImage || cst.webkitMaskImage || 'none') === 'none') { skip('no mask'); continue; }
    // Covered by something else (an open drop-down's list lying over the sort
    // link): its pixels are the list's, not the chevron's, so it isn't read.
    // (Its middle and its four corners: a list may lie over part of it.)
    const over = (x, y) => { const onTop = document.elementFromPoint(x, y); return Boolean(onTop && onTop !== chev && !control.contains(onTop) && !onTop.contains(chev)); };
    if (over(cb.left + cb.width / 2, cb.top + cb.height / 2) || [[1, 1], [cb.width - 1, 1], [1, cb.height - 1], [cb.width - 1, cb.height - 1]].some(([dx, dy]) => over(cb.left + dx, cb.top + dy))) { skip('covered'); continue; }
    // The words on the chevron's own row: text nodes inside the control whose line crosses the chevron's middle band.
    const walker = document.createTreeWalker(control, NodeFilter.SHOW_TEXT);
    const lines = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim() || chev.contains(n)) continue;
      const parent = n.parentElement;
      if (!parent || !vis(parent) || parent.closest('.ds-sr, [aria-hidden=true]')) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
      for (const r of rects) lines.push({ r, parent, text: n.textContent.trim() });
    }
    // A button that is the chevron alone (Back beside a guided tool's name): the words are the name right after it.
    // (Not a button whose own words are only hidden, as the Health Check's phone Back is: what comes after that is another button.)
    if (!lines.length && !control.textContent.trim() && control.nextElementSibling && vis(control.nextElementSibling)) {
      const after = document.createTreeWalker(control.nextElementSibling, NodeFilter.SHOW_TEXT);
      for (let n = after.nextNode(); n; n = after.nextNode()) {
        if (!n.textContent.trim() || !n.parentElement || !vis(n.parentElement)) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const r of [...range.getClientRects()].filter((x) => x.width > 0 && x.height > 0)) lines.push({ r, parent: n.parentElement, text: n.textContent.trim() });
      }
    }
    if (!lines.length) { skip('no words'); continue; }
    // Distinct lines of words (by their tops), anywhere in the control: tops
    // within 3px of each other are one line (words of two sizes on one row).
    const tops = [];
    for (const t of lines.map((l) => l.r.top + l.r.height / 2).sort((a, b) => a - b)) if (!tops.length || t - tops[tops.length - 1] > 3) tops.push(t);
    const mid = cb.top + cb.height / 2;
    const onRow = lines.filter((l) => l.r.top - 2 <= mid && l.r.bottom + 2 >= mid);
    // Several lines of words (12 Nov). Three cases:
    //   - the chevron shares one line's own box (Home's "View your week" under
    //     the date): it is measured against that line, like any other;
    //   - a name with a line under it, the chevron beside the two (a dashboard
    //     fold, Home's "This week"): it is centred on the block of words, from
    //     the top of the first line's capitals to the last line's baseline
    //     (the lines stacked on the block's own left edge; a figure in
    //     another column isn't part of it);
    //   - one run of words that has wrapped: no rule says where it belongs,
    //     so it is passed over, with its reason.
    let ownRow = false;
    if (tops.length > 1) {
      const within = (el) => {
        const t = [];
        for (const v of lines.filter((l) => el.contains(l.parent)).map((l) => l.r.top + l.r.height / 2).sort((a, b) => a - b)) if (!t.length || v - t[t.length - 1] > 3) t.push(v);
        return t.length;
      };
      let holder = onRow[0]?.parent || null;
      while (holder && holder !== control && holder.parentElement && within(holder.parentElement) === 1) holder = holder.parentElement;
      ownRow = Boolean(holder && within(holder) === 1 && holder.contains(chev));
      if (!ownRow) {
        const left = Math.min(...lines.map((l) => l.r.left));
        const stack = lines.filter((l) => l.r.left - left < 4).sort((a, b) => a.r.top - b.r.top);
        if (new Set(stack.map((l) => l.parent)).size < 2) { skip('one run of words, wrapped', tops.length); continue; }
        const inked = (l) => {
          const st = getComputedStyle(l.parent);
          const c2 = document.createElement('canvas').getContext('2d');
          c2.font = `${st.fontStyle} ${st.fontWeight} ${st.fontSize} ${st.fontFamily}`;
          const m = c2.measureText('H');
          const base = l.r.top + (l.r.height - m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2 + m.fontBoundingBoxAscent;
          return { top: base - m.actualBoundingBoxAscent, base };
        };
        const top = inked(stack[0]).top;
        const bottom = inked(stack[stack.length - 1]).base;
        // A chevron under the words, not beside them (a row's "more"), isn't one of these.
        if (mid < stack[0].r.top - 2 || mid > stack[stack.length - 1].r.bottom + 2) { skip('off its row', tops.length); continue; }
        out.push({ block: true, label: name, beside, square, box: { x: cb.left, y: cb.top, width: cb.width, height: cb.height }, lines: tops.length, wordsMiddle: (top + bottom) / 2, capitals: false, font: '', chevEm: 0, line: '', dir: (chev.className.match(/ds-chevron--(up|down|left|right)|\b(up|dn|lf)\b/) || []).slice(1).find(Boolean) || '', state: control.getAttribute('aria-expanded') === 'true' ? 'open' : control.hasAttribute('aria-expanded') ? 'closed' : '' });
        continue;
      }
    }
    if (!onRow.length) { skip('off its row', tops.length); continue; }
    // The control's own words: the first on that row, in reading order (a
    // fold's name, not the figure that may sit between it and the chevron).
    const line = onRow[0];
    const cs = getComputedStyle(line.parent);
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const h = ctx.measureText('H');
    const x = ctx.measureText('x');
    const baseline = line.r.top + (line.r.height - h.fontBoundingBoxAscent - h.fontBoundingBoxDescent) / 2 + h.fontBoundingBoxAscent;
    const shown = cs.textTransform === 'uppercase' ? line.text.toUpperCase() : line.text;
    const capitals = shown === shown.toUpperCase() && /[A-Z]/.test(shown);
    // One plain letter of those words, to read where they were really drawn:
    // a capital with a flat top and foot beside capitals, a lowercase letter
    // as tall as "x" and no taller beside lowercase words.
    let letter = null;
    // Flat letters first; then round ones, which overshoot the line by the
    // same hair above and below, so their middle is the same middle. A
    // letter is passed over when a neighbour's own strokes reach into its
    // box (the bar of the T in "Tue" lies over its u, and would be read as
    // the u's top).
    const wants = capitals ? [/[HEFILTNMZKXBDPRU]/, /[OCSG]/] : [/[xvwznmur]/, /[aceos]/];
    const reachesOn = /[TVWYFPfr'’"“/]/;
    const reachesBack = /[TVWYfjy'’"”/]/;
    const node = [...line.parent.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim()) || null;
    if (node && node.textContent.toUpperCase().length === node.textContent.length) {
      const raw = node.textContent;
      const drawn = cs.textTransform === 'uppercase' ? raw.toUpperCase() : raw;
      for (const want of wants) {
        for (let i = 0; i < drawn.length && !letter; i += 1) {
          if (!want.test(drawn[i])) continue;
          if (reachesOn.test(drawn[i - 1] || '') || reachesBack.test(drawn[i + 1] || '')) continue;
          const one = document.createRange();
          one.setStart(node, i);
          one.setEnd(node, i + 1);
          const r = one.getClientRects()[0];
          if (r && r.width > 2 && Math.abs(r.top - line.r.top) < 2) letter = { x: r.left, y: r.top, width: r.width, height: r.height };
        }
        if (letter) break;
      }
    }
    out.push({
      letter,
      label: name,
      beside,
      square,
      box: { x: cb.left, y: cb.top, width: cb.width, height: cb.height },
      capitals,
      font: `${parseFloat(cs.fontSize)}px ${cs.fontFamily.split(',')[0].replace(/["']/g, '')}`,
      chevEm: parseFloat(getComputedStyle(chev).fontSize),
      line: (() => { const w = chev.closest('.ds-chevron-line, .chev-line'); if (!w) return 'no line'; const ws = getComputedStyle(w); return `${parseFloat(ws.fontSize)}px ${ws.fontFamily.split(',')[0].replace(/["']/g, '')} lh${ws.lineHeight}${(w.classList.contains('ds-chevron-line--caps') || w.classList.contains('caps')) ? ' caps' : ''} vs text lh${cs.lineHeight}`; })(),
      dir: (chev.className.match(/ds-chevron--(up|down|left|right)|\b(up|dn|lf)\b/) || []).slice(1).find(Boolean) || '',
      lines: ownRow ? 1 : tops.length,
      wordsMiddle: baseline - (capitals ? h.actualBoundingBoxAscent : x.actualBoundingBoxAscent) / 2,
      state: control.getAttribute('aria-expanded') === 'true' ? 'open' : control.hasAttribute('aria-expanded') ? 'closed' : '',
    });
  }
  return out;
}

/**
 * Runs in the page: chevrons built to sit beside words whose own line is
 * laid out inside a control that can be seen, but which are themselves
 * hidden (display none, visibility hidden or no opacity on the chevron or
 * its line). They are never tagged for measuring, so without this a chevron
 * that had vanished was simply not counted (break-it, 12 Nov). A line that
 * takes no room, or one inside something hidden, is hidden on purpose.
 */
function hiddenBeside() {
  const shown = (el) => { const b = el.getBoundingClientRect(); const st = getComputedStyle(el); return b.width > 0 && b.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0.05 && !el.closest('[hidden],[inert]'); };
  const out = [];
  for (const chev of document.querySelectorAll('.ds-chevron-line .ds-chevron, .chev-line .chev')) {
    const line = chev.closest('.ds-chevron-line, .chev-line');
    const control = chev.closest('button, a, summary, label, [role=button], [role=combobox]') || line.parentElement;
    if (!control || !shown(control) || !control.contains(line)) continue;
    const lb = line.getBoundingClientRect();
    if (!(lb.width > 0) || getComputedStyle(line).display === 'none') continue;
    // Everything from the control down to the line can be seen; the chevron, or its line, cannot.
    let outerHidden = false;
    for (let p = line.parentElement; p && p !== control.parentElement; p = p.parentElement) { const st = getComputedStyle(p); if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) <= 0.05) outerHidden = true; }
    if (outerHidden) continue;
    let gone = false;
    for (let p = chev; p && p !== line.parentElement; p = p.parentElement) { const st = getComputedStyle(p); if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) <= 0.05) gone = true; }
    if (!gone) continue;
    out.push(`${String(control.className?.baseVal ?? control.className ?? '').split(' ')[0] || control.tagName.toLowerCase()} "${(control.innerText || control.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 34)}"`);
  }
  return out;
}

/** The visible strokes' top and bottom inside a box, in CSS pixels, from the screen's own pixels. */
async function strokeMiddle(page, box, pad = 3, view = null) {
  const clip = { x: Math.max(0, Math.floor(box.x) - pad), y: Math.max(0, Math.floor(box.y) - pad), width: Math.ceil(box.width) + 2 * pad, height: Math.ceil(box.height) + 2 * pad };
  // Kept inside the screen: a chevron at the very edge is still read.
  if (view) {
    clip.width = Math.min(clip.width, view.width - clip.x);
    clip.height = Math.min(clip.height, view.height - clip.y);
    if (clip.width < 1 || clip.height < 1) return null;
  }
  const png = (await page.screenshot({ clip })).toString('base64');
  const scan = await page.evaluate(async ({ data, cssHeight }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, c.width, c.height).data;
    // The background is the commonest colour (a letter's own ink may be in the corner).
    const counts = new Map();
    for (let i = 0; i < px.length; i += 4) { const k = `${px[i]},${px[i + 1]},${px[i + 2]}`; counts.set(k, (counts.get(k) || 0) + 1); }
    const bg = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number);
    // How strongly each row is drawn; the edges are where half the strongest pixel's strength is reached.
    let top = null; let bottom = null; let strongest = 0;
    const rows = [];
    for (let y = 0; y < c.height; y += 1) {
      let most = 0;
      for (let x = 0; x < c.width; x += 1) {
        const i = (y * c.width + x) * 4;
        most = Math.max(most, Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]));
      }
      rows.push(most);
      strongest = Math.max(strongest, most);
    }
    if (strongest < 60) return null;
    for (let y = 0; y < rows.length; y += 1) {
      if (rows[y] >= strongest / 2) { if (top === null) top = y; bottom = y + 1; }
    }
    const scale = c.height / cssHeight;
    return { top: top / scale, bottom: bottom / scale };
  }, { data: png, cssHeight: clip.height });
  if (!scan) return null;
  return clip.y + (scan.top + scan.bottom) / 2;
}

/**
 * Every chevron beside one line of words on the page as it stands.
 * @returns {Promise<{ label: string, off: number, capitals: boolean, state: string }[]>}
 *   `off` is the chevron's centre less the words' middle, in CSS pixels (below is positive).
 */
export async function measureChevrons(page) {
  const count = await page.evaluate(collect, null);
  const out = [];
  // What could not be measured, and why: { label, why, fault }. A chevron
  // built to sit beside words (Chevron's `beside`) that is left on a row of
  // its own, pushed off the side of the screen or not drawn at all is a
  // fault, not something to pass over (chevronsOff lists those too).
  const skipped = [];
  const view = page.viewportSize();
  for (const label of await page.evaluate(hiddenBeside)) skipped.push({ n: -1, label, why: 'hidden', fault: 'is hidden, beside words that can be seen' });
  for (let i = 0; i < count; i += 1) {
    const [c] = await page.evaluate(collect, i);
    if (!c) continue;
    if (c.skip) {
      // Beside one line of its own words, but not on that line.
      skipped.push({ n: i, label: c.label, why: c.skip, fault: c.skip === 'no mask' ? 'has lost its shape: it has no mask' : c.beside && c.skip === 'off its row' && c.lines === 1 ? 'is not on the row of its words' : '' });
      continue;
    }
    // Off the side of the screen (its square as it stands, not the wider box of a turned square).
    if (c.square.x < -1 || c.square.x + c.square.width > view.width + 1) {
      skipped.push({ n: i, label: c.label, why: 'off the side', fault: c.beside ? 'is off the side of the screen' : '' });
      continue;
    }
    if (c.lines !== 1 && !c.block) { skipped.push({ n: i, label: c.label, why: `${c.lines} lines of words`, fault: '' }); continue; }
    // Only what is on the screen can be read from its pixels.
    if (c.square.y < 0 || c.square.y + c.square.height > view.height) { skipped.push({ n: i, label: c.label, why: 'above or below the screen', fault: '' }); continue; }
    // The chevron's own strokes only: the words around it are left undrawn
    // while it is read. (Its box, turned, is wider than its strokes and
    // reaches a first letter 6px away, whose taller strokes were then read
    // as the chevron's and hid a chevron 1.75px low: break-it, 11 Nov.)
    await page.evaluate((n) => {
      const chev = document.querySelector(`[data-chev-n="${n}"]`);
      const control = chev?.closest('button, a, summary, label, [role=button], [role=combobox]') || chev?.parentElement;
      const around = control?.parentElement || control;
      if (!around) return;
      if (!document.getElementById('chev-quiet-style')) {
        const st = document.createElement('style');
        st.id = 'chev-quiet-style';
        // (Edges too: an open button's coral edge, close to its chevron at the largest text sizes, was read as part of it: 12 Nov.)
        st.textContent = '[data-chev-quiet], [data-chev-quiet] * { -webkit-text-fill-color: transparent !important; text-shadow: none !important; text-decoration-color: transparent !important; border-color: transparent !important; outline-color: transparent !important; box-shadow: none !important; }';
        document.head.appendChild(st);
      }
      around.setAttribute('data-chev-quiet', '');
    }, i);
    const middle = await strokeMiddle(page, c.box, 3, view);
    await page.evaluate(() => { for (const el of document.querySelectorAll('[data-chev-quiet]')) el.removeAttribute('data-chev-quiet'); });
    if (middle == null) {
      // An open drop-down's list lies over whatever is under it, and a list that takes no taps isn't found by asking what is on top.
      // (Only a list that lies over this chevron: an open list elsewhere on the page let any chevron that wasn't drawn through as "covered": break-it, 12 Nov.)
      const listOpen = await page.evaluate((box) => [...document.querySelectorAll('[role=listbox]')].some((l) => { const r = l.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left < box.x + box.width && r.right > box.x && r.top < box.y + box.height && r.bottom > box.y; }), c.box);
      skipped.push({ n: i, label: c.label, why: listOpen ? 'covered' : 'nothing drawn', fault: c.beside && !listOpen ? 'cannot be seen: nothing is drawn where it stands' : '' });
      continue;
    }
    // The words' middle as drawn (one letter's own pixels), or from the font's measures when no plain letter is there.
    const drawn = c.letter && !c.block ? await strokeMiddle(page, c.letter, 0, view) : null;
    const wordsMiddle = drawn ?? c.wordsMiddle;
    out.push({ n: i, label: c.label, off: middle - wordsMiddle, block: Boolean(c.block), lines: c.lines, read: c.block ? 'block' : drawn == null ? 'measures' : 'pixels', capitals: c.capitals, state: c.state, font: c.font, chevEm: c.chevEm, dir: c.dir, line: c.line });
  }
  await page.evaluate(() => { for (const el of document.querySelectorAll('[data-chev-n]')) el.removeAttribute('data-chev-n'); document.getElementById('chev-quiet-style')?.remove(); });
  out.skipped = skipped;
  return out;
}

/**
 * The ones more than 0.5px off, as words for a failing check; and, when the
 * list is measureChevrons' own, the chevrons beside words that could not be
 * measured because they are plainly wrong (off their row, off the screen,
 * not drawn).
 */
// (A chevron beside a name with a line under it is allowed 1px: the browser
// places the row and each line of its words on whole screen pixels
// separately, so the same chevron reads up to about 0.85px either way from
// one place on a page to another. Beside one line it shares that line's
// own baseline, and 0.5px holds.)
export const chevronsOff = (list, tolerance = 0.5, blockTolerance = 1) => [
  ...list.filter((c) => !Number.isFinite(c.off) || Math.abs(c.off) > (c.block ? blockTolerance : tolerance))
    .map((c) => (Number.isFinite(c.off)
      ? `${c.label}${c.state ? ` (${c.state})` : ''}: ${c.off > 0 ? 'below' : 'above'} the middle of ${c.block ? `its ${c.lines} lines of words` : `the ${c.capitals ? 'capitals' : 'x-height'}`} by ${Math.abs(c.off).toFixed(2)}px`
      : `${c.label}${c.state ? ` (${c.state})` : ''}: could not be measured`)),
  ...(list.skipped || []).filter((c) => c.fault).map((c) => `${c.label}: ${c.fault}`),
];
