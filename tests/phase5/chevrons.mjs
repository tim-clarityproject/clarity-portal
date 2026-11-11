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
//     words, a flat capital beside capitals). Where the words have no such
//     letter it comes from the font's own measures: the baseline, less half
//     the height of "x" or of "H".
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
    if (!lines.length && control.nextElementSibling && vis(control.nextElementSibling)) {
      const after = document.createTreeWalker(control.nextElementSibling, NodeFilter.SHOW_TEXT);
      for (let n = after.nextNode(); n; n = after.nextNode()) {
        if (!n.textContent.trim() || !n.parentElement || !vis(n.parentElement)) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const r of [...range.getClientRects()].filter((x) => x.width > 0 && x.height > 0)) lines.push({ r, parent: n.parentElement, text: n.textContent.trim() });
      }
    }
    if (!lines.length) continue;
    // Distinct lines of words (by their tops), anywhere in the control.
    const tops = [...new Set(lines.map((l) => Math.round(l.r.top)))];
    const mid = cb.top + cb.height / 2;
    const onRow = lines.filter((l) => l.r.top - 2 <= mid && l.r.bottom + 2 >= mid);
    if (!onRow.length) continue;
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
    const want = capitals ? /[HEFILTNMZKXBDPRU]/ : /[xvwznmur]/;
    const node = [...line.parent.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim()) || null;
    if (node) {
      const drawn = cs.textTransform === 'uppercase' ? node.textContent.toUpperCase() : node.textContent;
      for (let i = 0; i < drawn.length && !letter; i += 1) {
        if (!want.test(drawn[i])) continue;
        const one = document.createRange();
        one.setStart(node, i);
        one.setEnd(node, i + 1);
        const r = one.getClientRects()[0];
        if (r && r.width > 2 && Math.abs(r.top - line.r.top) < 2) letter = { x: r.left, y: r.top, width: r.width, height: r.height };
      }
    }
    out.push({
      letter,
      label: `${String(control.className?.baseVal ?? control.className ?? '').split(' ')[0] || control.tagName.toLowerCase()} "${(control.innerText || control.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 34)}"`,
      box: { x: cb.left, y: cb.top, width: cb.width, height: cb.height },
      capitals,
      font: `${parseFloat(cs.fontSize)}px ${cs.fontFamily.split(',')[0].replace(/["']/g, '')}`,
      chevEm: parseFloat(getComputedStyle(chev).fontSize),
      line: (() => { const w = chev.closest('.ds-chevron-line, .chev-line'); if (!w) return 'no line'; const ws = getComputedStyle(w); return `${parseFloat(ws.fontSize)}px ${ws.fontFamily.split(',')[0].replace(/["']/g, '')} lh${ws.lineHeight}${(w.classList.contains('ds-chevron-line--caps') || w.classList.contains('caps')) ? ' caps' : ''} vs text lh${cs.lineHeight}`; })(),
      dir: (chev.className.match(/ds-chevron--(up|down|left|right)|\b(up|dn|lf)\b/) || []).slice(1).find(Boolean) || '',
      lines: tops.length,
      wordsMiddle: baseline - (capitals ? h.actualBoundingBoxAscent : x.actualBoundingBoxAscent) / 2,
      state: control.getAttribute('aria-expanded') === 'true' ? 'open' : control.hasAttribute('aria-expanded') ? 'closed' : '',
    });
  }
  return out;
}

/** The visible strokes' top and bottom inside a box, in CSS pixels, from the screen's own pixels. */
async function strokeMiddle(page, box, pad = 3) {
  const clip = { x: Math.max(0, Math.floor(box.x) - pad), y: Math.max(0, Math.floor(box.y) - pad), width: Math.ceil(box.width) + 2 * pad, height: Math.ceil(box.height) + 2 * pad };
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
  for (let i = 0; i < count; i += 1) {
    const [c] = await page.evaluate(collect, i);
    if (!c || c.lines !== 1) continue;
    const view = page.viewportSize();
    // Only what is on the screen can be read from its pixels.
    if (c.box.y < 3 || c.box.x < 3 || c.box.y + c.box.height > view.height - 3 || c.box.x + c.box.width > view.width - 3) continue;
    const middle = await strokeMiddle(page, c.box);
    if (middle == null) continue;
    // The words' middle as drawn (one letter's own pixels), or from the font's measures when no plain letter is there.
    const drawn = c.letter ? await strokeMiddle(page, c.letter, 0) : null;
    const wordsMiddle = drawn ?? c.wordsMiddle;
    out.push({ label: c.label, off: middle - wordsMiddle, read: drawn == null ? 'measures' : 'pixels', capitals: c.capitals, state: c.state, font: c.font, chevEm: c.chevEm, dir: c.dir, line: c.line });
  }
  await page.evaluate(() => { for (const el of document.querySelectorAll('[data-chev-n]')) el.removeAttribute('data-chev-n'); });
  return out;
}

/** The ones more than 0.5px off, as words for a failing check. */
export const chevronsOff = (list, tolerance = 0.5) => list.filter((c) => Math.abs(c.off) > tolerance)
  .map((c) => `${c.label}${c.state ? ` (${c.state})` : ''}: ${c.off > 0 ? 'below' : 'above'} the middle of the ${c.capitals ? 'capitals' : 'x-height'} by ${Math.abs(c.off).toFixed(2)}px`);
