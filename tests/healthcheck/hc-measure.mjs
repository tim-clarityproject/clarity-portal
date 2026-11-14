// Measurements the outside Health Check's suites share (flow.mjs and
// compare-m7b.mjs), read from the screen's own pixels where a mark is a mask
// or an outline (tests/phase8/measure-lib.mjs's reading): the two small
// icons beside a title, and a Back chevron with its label.
import { ink } from '../phase8/measure-lib.mjs';

const grow = (r, by = 1) => ({ x: r.x - by, y: r.y - by, width: r.width + 2 * by, height: r.height + 2 * by });

/**
 * The play icon and the eye beside a title's last word.
 * sel: { heading, play, eye } (the two icons' own svg).
 * Gives { gapTitle, gapPair } visible edge to visible edge (the letter's ink
 * to the first icon, then between the two), { offPlay, offEye } each icon's
 * middle from the middle of the capitals, their sizes and their tap areas.
 */
export async function titleIcons(page, sel) {
  const g = await page.evaluate(({ heading, play, eye }) => {
    const vis = (s) => [...document.querySelectorAll(s)].find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    const h = vis(heading);
    const p = vis(play);
    const e = vis(eye);
    if (!h || !p || !e) return null;
    // The last letter: the last piece of text before the icons.
    const walker = document.createTreeWalker(h, NodeFilter.SHOW_TEXT);
    let last = null;
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (n.textContent.trim() && !n.parentElement.closest('button, [hidden], .tipx, .ds-sr')) last = n;
    }
    const text = last.textContent.replace(/\s+$/, '');
    const r = document.createRange();
    r.setStart(last, text.length - 1);
    r.setEnd(last, text.length);
    const lr = r.getBoundingClientRect();
    // The baseline: a mark of no size standing on it, beside the last letter.
    const mark = document.createElement('span');
    mark.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
    last.parentNode.insertBefore(mark, last);
    const baseline = mark.getBoundingClientRect().bottom;
    mark.remove();
    const cs = getComputedStyle(h);
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const cap = ctx.measureText('H').actualBoundingBoxAscent;
    const box = (x) => { const b = x.getBoundingClientRect(); return { x: b.left, y: b.top, width: b.width, height: b.height }; };
    const tap = (x) => { const b = x.closest('button').getBoundingClientRect(); return { w: b.width, h: b.height, left: b.left, right: b.right }; };
    const mid = (x) => { const b = x.getBoundingClientRect(); return b.top + b.height / 2; };
    return {
      letter: { x: lr.left, y: lr.top, width: lr.width, height: lr.height }, play: box(p), eye: box(e),
      capMiddle: baseline - cap / 2, midPlay: mid(p), midEye: mid(e), tapPlay: tap(p), tapEye: tap(e),
      font: cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(),
    };
  }, sel);
  if (!g) return null;
  const letter = await ink(page, grow(g.letter, 0));
  const play = await ink(page, grow(g.play));
  const eye = await ink(page, grow(g.eye));
  if (!letter || !play || !eye) return null;
  return {
    font: g.font,
    gapTitle: play.left - letter.right,
    gapPair: eye.left - play.right,
    offPlay: g.midPlay - g.capMiddle,
    offEye: g.midEye - g.capMiddle,
    sizePlay: `${g.play.width}x${g.play.height}`,
    sizeEye: `${g.eye.width}x${g.eye.height}`,
    tapPlay: g.tapPlay,
    tapEye: g.tapEye,
    tapsOverlap: Math.max(0, g.tapPlay.right - g.tapEye.left),
  };
}

/**
 * A Back chevron and its label. sel: { button, label, content } (label may
 * be the button itself). Gives { edge } the chevron's visible left edge from
 * the content's left edge, and { gap } from that edge to the label's first letter.
 */
export async function backChevron(page, sel) {
  const g = await page.evaluate(({ button, label, content }) => {
    const vis = (s) => [...document.querySelectorAll(s)].find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    const b = vis(button);
    const l = vis(label);
    const c = vis(content);
    if (!b || !l || !c) return null;
    const walker = document.createTreeWalker(l, NodeFilter.SHOW_TEXT);
    let n = null;
    while (!n && walker.nextNode()) if (walker.currentNode.textContent.trim()) n = walker.currentNode;
    const r = document.createRange();
    r.selectNodeContents(n);
    const br = b.getBoundingClientRect();
    return { x: br.left, y: br.top, h: br.height, w: br.width, label: r.getBoundingClientRect().left, content: c.getBoundingClientRect().left };
  }, sel);
  if (!g) return null;
  const chev = await ink(page, { x: g.x - 2, y: g.y, width: g.label - g.x + 1, height: g.h });
  if (!chev) return null;
  return { edge: chev.left - g.content, gap: g.label - chev.left, tapW: g.w, tapH: g.h };
}
