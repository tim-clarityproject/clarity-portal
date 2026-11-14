// What the UI tester measures on a guided tool's screens (Phase 8a step 5),
// shared by the Team performance check's and the Emotional wash's flows:
// every tap area 44px, one coral button a screen, no sideways scroll, Back's
// chevron with its visible edge on the content's edge and the tool's name
// 14px from it, and the eye 12px after its heading's last letter with its
// middle on the middle of the capitals, within 0.5px (12px from the letter's
// ink: its box 11px after a sentence's last letter, 10px after spaced capitals).
import { sleep } from './shared.mjs';

// The visible marks inside a box, from the screen's own pixels (as
// tests/signin/measure.mjs reads them): the box that holds every pixel
// unlike the corner's (the page's colour).
export async function ink(page, box) {
  const clip = { x: Math.max(0, Math.floor(box.x)), y: Math.max(0, Math.floor(box.y)), width: Math.ceil(box.width), height: Math.ceil(box.height) };
  const png = (await page.screenshot({ clip })).toString('base64');
  const found = await page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, c.width, c.height).data;
    const bg = [px[0], px[1], px[2]];
    let l = null; let r = null;
    for (let y = 0; y < c.height; y += 1) {
      for (let x = 0; x < c.width; x += 1) {
        const i = (y * c.width + x) * 4;
        const d = Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]);
        if (d < 96) continue;
        l = l === null ? x : Math.min(l, x); r = r === null ? x + 1 : Math.max(r, x + 1);
      }
    }
    return l === null ? null : { l, r, w: c.width };
  }, png);
  if (!found) return null;
  const k = found.w / clip.width;
  return { left: clip.x + found.l / k, right: clip.x + found.r / k };
}

// ---------------------------------------------------------------- measuring (runs in the page)
// One screen's measurements. `layer` is the top layer's selector (the tool, or an open panel).
export function measure({ layer, heading }) {
  const root = [...document.querySelectorAll(layer)].pop();
  const out = { taps: [], coral: 0 };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[inert], [hidden], [aria-hidden=true]');
  };
  // 44px tap areas: every button, link and mark that can be tapped.
  for (const el of root.querySelectorAll('button, a[href], [role=radio], [role=option], [role=button], input, textarea, .tpc-dot')) {
    if (!visible(el)) continue;
    const box = el.matches('.tpc-dot') ? el.querySelector('.tpc-dot-tap').getBoundingClientRect() : el.getBoundingClientRect();
    // A shared part may reach 44px through its ::before or ::after (a pill in a segmented control).
    const stretch = (ps) => ps.content !== 'none' && ps.position === 'absolute' && (parseFloat(ps.height) || 0) >= 43.5 && (parseFloat(ps.width) || 0) >= 43.5;
    if (stretch(getComputedStyle(el, '::after')) || stretch(getComputedStyle(el, '::before'))) continue;
    if (box.width < 43.5 || box.height < 43.5) out.taps.push(`${(el.getAttribute('aria-label') || el.textContent || el.className).trim().slice(0, 40)} ${box.width.toFixed(1)}x${box.height.toFixed(1)}`);
  }
  // One coral button: anything filled with the coral of the main button.
  for (const el of root.querySelectorAll('button, a')) {
    if (visible(el) && getComputedStyle(el).backgroundColor.replace(/\s+/g, '') === 'rgb(255,111,92)') out.coral += 1;
  }
  // No sideways scroll, on the page or inside the tool.
  const scroller = root.querySelector('.ds-guide-scroll') || root;
  out.sideways = Math.max(document.documentElement.scrollWidth - document.documentElement.clientWidth, scroller.scrollWidth - scroller.clientWidth);
  // Back's chevron: its visible edge on the content's left edge, the name 14px from that edge.
  const back = root.querySelector('.ds-guide-back .ds-chevron');
  const content = root.querySelector('.ds-guide-pct-track, .ds-guide-title, .ds-guide-question');
  const name = root.querySelector('.ds-guide-name');
  if (back && content && name) {
    const range = document.createRange();
    range.selectNodeContents(name);
    const button = back.closest('button').getBoundingClientRect();
    out.back = {
      content: content.getBoundingClientRect().left,
      nameLeft: range.getBoundingClientRect().left,
      name: range.getBoundingClientRect().left - content.getBoundingClientRect().left,
      tap: button.width,
      button: { x: button.left, y: button.top, height: button.height },
    };
  }
  // The eye: 12px from the last letter, its middle on the middle of the capitals.
  const h = heading ? root.querySelector(heading) : null;
  const eye = h?.querySelector('.ds-who svg');
  if (h && eye) {
    const end = h.querySelector('.ds-title-end');
    const textNode = [...end.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    const r = document.createRange();
    r.setStart(textNode, textNode.textContent.length - 1);
    r.setEnd(textNode, textNode.textContent.length);
    const last = r.getBoundingClientRect();
    const cs = getComputedStyle(h);
    const spacing = cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing);
    // The baseline: a mark of no size standing on it, beside the last word.
    const mark = document.createElement('span');
    mark.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
    end.insertBefore(mark, end.firstChild);
    const baseline = mark.getBoundingClientRect().bottom;
    mark.remove();
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const cap = ctx.measureText('H').actualBoundingBoxAscent;
    const e = eye.getBoundingClientRect();
    out.eye = {
      spaced: spacing > 0,
      gap: e.left - (last.right - spacing),
      off: (e.top + e.height / 2) - (baseline - cap / 2),
      size: `${e.width}x${e.height}`,
      tap: eye.closest('button').getBoundingClientRect().width,
    };
  }
  return out;
}

/** `pass(name, ok, detail)` records each check; gives back checkScreen(page, tag, options). */
export const makeCheckScreen = (pass) => async function checkScreen(page, tag, { layer = '.ds-guide', heading = null, coral = 1, back = true } = {}) {
  await page.mouse.move(2, 2); // nothing is pointed at: a button's own colour, not its hover
  await sleep(700); // the step has finished sliding in
  const m = await page.evaluate(measure, { layer, heading });
  pass(`${tag}: every tap area is 44px`, m.taps.length === 0, m.taps.join(' | '));
  pass(`${tag}: ${coral === 1 ? 'one coral button' : `${coral} coral buttons`}`, m.coral === coral, `found ${m.coral}`);
  pass(`${tag}: no sideways scroll`, m.sideways <= 0, `${m.sideways}px`);
  if (back && layer === '.ds-guide') {
    // The chevron as drawn (it is a mask, so its box says nothing): read from the screen's own pixels.
    const chev = m.back ? await ink(page, { x: m.back.button.x - 2, y: m.back.button.y, width: m.back.nameLeft - m.back.button.x + 1, height: m.back.button.height }) : null;
    pass(`${tag}: Back’s chevron has its visible edge on the content’s edge`, chev && Math.abs(chev.left - m.back.content) <= 0.5, chev ? `${chev.left.toFixed(2)} (content edge ${m.back.content.toFixed(2)})` : 'no chevron found');
    pass(`${tag}: the tool’s name is 14px from that edge`, m.back && Math.abs(m.back.name - 14) <= 0.5, JSON.stringify(m.back));
  }
  if (heading) {
    // 12px from the letter's ink to the eye's visible edge (tokens.css --icon-title-gap; read from the
    // pixels by the UI tester, 14 Nov): box to box that is 11px after a sentence's last letter and
    // 10px after spaced capitals, whose boxes end about 1px and 2px after their ink.
    pass(`${tag}: the eye is 12px from the last letter`, m.eye && Math.abs(m.eye.gap - (m.eye.spaced ? 10 : 11)) <= 0.5, JSON.stringify(m.eye));
    pass(`${tag}: the eye is centred on the capitals within 0.5px`, m.eye && Math.abs(m.eye.off) <= 0.5, JSON.stringify(m.eye));
    pass(`${tag}: the eye is 16px, in a 44px tap area`, m.eye && m.eye.size === '16x16' && m.eye.tap >= 44, JSON.stringify(m.eye));
  }
};
