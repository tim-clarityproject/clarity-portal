// The sign-in pages, measured, on every one of their screens (screens.mjs
// and coachScreens.mjs), dark and light, at 1280 wide and at 390 by 844.
// Since polish 1 (the 25 Nov reference and example pages win over M26 on
// look; every behaviour rule in docs/rules/sign-in.md stays):
//   - the crosshair at the top, 40px, about 11% of the window down and at
//     least 80px, and THE CLARITY PORTAL at the foot, both on the screen's
//     middle (within 0.5px), read from their drawn pixels; the crosshair in
//     the same place on every page;
//   - "Back to sign in": the chevron's visible edge on the content's left
//     edge, 10px before its label, over the column above its title, and
//     clear of the phone's notch;
//   - the spacing, read from the page's own boxes (tests/signin/spacing.mjs):
//     32px under the title, 12px between every other part, 24px from the
//     code squares to the link under them; paragraphs at 1.55;
//   - stacked text links at least 28px apart, and no two tap areas
//     overlapping; every tap area 44px high;
//   - the tick box: the shared 24px one (1px edge, 6px corners) in a 44px
//     tap area, lined up with the boxes' left edge;
//   - "6-digit" on one line; boxes 16px or more; every outlined edge 3 to 1;
//   - centred throughout (tests/signin/centring.mjs, data-form="centred";
//     every screen at twice the text size too: centring-pages.mjs), My
//     Account's pages on one left edge.
// (Until polish 1 this read M26 seq 7 beside each screen: the name beside
// the crosshair at the top, one left edge on form pages, and the spacing
// rule of 19 Nov.)
//
//   APP_URL=http://localhost:<vite> LOCAL_SUPABASE_URL=http://localhost:<db> node --import ./tests/scores/register.mjs tests/signin/measure.mjs
//   ONLY=signin,create  MODES=dark  SIZES=1280  narrow a run.

import { chromium } from 'playwright';
import { SAM, guard, makeChecks, sleep, testEnv } from './shared.mjs';
import { SCREENS } from './screens.mjs';
import { COACH_SCREENS } from './coachScreens.mjs';
import { ruleProblems, spacingRule } from './spacing.mjs';
import { centredGroups, centringProblems } from './centring.mjs';
import { overlappingTaps } from '../phase5/taps.mjs';
import { outlinedEdges } from '../phase5/edges.mjs';
import { chevronsOff, measureChevrons } from '../phase5/chevrons.mjs';

const env = testEnv();
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const MODES = (process.env.MODES || 'dark,light').split(',');
const SIZES = (process.env.SIZES || '1280,390').split(',').map(Number);
const { pass, done } = makeChecks();
const SCALE = 2;

// The visible marks inside a box, from the screen's own pixels: the box
// that holds every pixel unlike the corner's (the page's colour).
async function ink(page, box) {
  const clip = { x: Math.max(0, Math.floor(box.x)), y: Math.max(0, Math.floor(box.y)), width: Math.ceil(box.width), height: Math.ceil(box.height) };
  const png = (await page.screenshot({ clip, fullPage: true })).toString('base64');
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
    let l = null; let r = null; let t = null; let b = null;
    for (let y = 0; y < c.height; y += 1) {
      for (let x = 0; x < c.width; x += 1) {
        const i = (y * c.width + x) * 4;
        const d = Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]);
        if (d < 96) continue;
        l = l === null ? x : Math.min(l, x); r = r === null ? x + 1 : Math.max(r, x + 1);
        t = t === null ? y : Math.min(t, y); b = b === null ? y + 1 : Math.max(b, y + 1);
      }
    }
    return l === null ? null : { l, r, t, b, w: c.width };
  }, png);
  if (!found) return null;
  const k = found.w / clip.width;
  return { left: clip.x + found.l / k, right: clip.x + found.r / k, top: clip.y + found.t / k, bottom: clip.y + found.b / k };
}

// The spacing rhythm, read the same way on the page and on M26: each gap
// is from the bottom of one part to the top of the next. Words are read
// from their own line (the letters' box), boxes and buttons from their edge.
function rhythm({ root, m }) {
  const col = document.querySelector(root);
  if (!col) return null;
  const q = (sel) => [...col.querySelectorAll(sel)].filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; });
  // A part nudged without moving anything under it (the name, 0.1em down)
  // is read where it stands in the layout, so its nudge isn't counted as spacing.
  const nudge = (el) => { const st = getComputedStyle(el); return st.position === 'relative' ? (parseFloat(st.top) || 0) : 0; };
  const letters = (el) => { const r = document.createRange(); r.selectNodeContents(el); const rects = [...r.getClientRects()].filter((x) => x.width > 0); const n = nudge(el); return rects.length ? { top: Math.min(...rects.map((x) => x.top)) - n, bottom: Math.max(...rects.map((x) => x.bottom)) - n } : el.getBoundingClientRect(); };
  const edge = (el) => el.getBoundingClientRect();
  const round = (v) => +v.toFixed(2);
  const out = {};
  // Under the name, title or core line: the last of them on the page, to the next part.
  const heads = q(m.heads);
  const head = heads[heads.length - 1];
  if (head) {
    // The part after it (after the box that holds it, where it sits alone in one).
    let next = head.nextElementSibling || head.parentElement.nextElementSibling;
    while (next && !(next.getBoundingClientRect().height > 0)) next = next.nextElementSibling;
    if (next) {
      const words = next.matches(m.words);
      out.underHead = round((words ? letters(next).top : edge(next).top) - letters(head).bottom);
    }
  }
  // Between boxes: one box's bottom edge to the next label's letters, less the label's own gap to its box.
  const fields = q(m.field);
  const between = [];
  for (let i = 1; i < fields.length; i += 1) {
    if (fields[i].previousElementSibling !== fields[i - 1]) continue;
    between.push(round(edge(fields[i]).top - edge(fields[i - 1]).bottom));
  }
  if (between.length) out.betweenBoxes = between;
  // Above the button: from the part before it.
  const btn = q(m.btn)[0];
  if (btn) {
    let prev = btn.previousElementSibling;
    while (prev && !(prev.getBoundingClientRect().height > 0)) prev = prev.previousElementSibling;
    if (prev) out.aboveButton = round(edge(btn).top - (prev.matches(m.words) ? letters(prev).bottom : edge(prev).bottom));
    // From the button to the first link's own line.
    const link = q(m.link).find((a) => edge(a).top > edge(btn).top && !a.closest(m.terms));
    if (link) out.buttonToLink = round(letters(link).top - edge(btn).bottom);
  }
  // Stacked links: from one link's line to the next.
  const links = q(m.link).filter((a) => !a.closest(m.terms));
  const apart = [];
  for (let i = 1; i < links.length; i += 1) apart.push(round(letters(links[i]).top - letters(links[i - 1]).top));
  if (apart.length) out.linksApart = apart;
  return out;
}
const BUILT = { heads: '.si-ttl, .si-account-open', words: '.si-p, .si-alt', field: '.si-field', btn: '.si-btn', link: '.si-alt .si-link', terms: '.si-terms' };

// Everything else that is read from the page itself.
function parts() {
  const col = document.querySelector('.si-col');
  const vis = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
  const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, width: b.width, height: b.height, right: b.right, bottom: b.bottom }; };
  const out = { col: r(col), message: col.dataset.align === 'centre', sideways: document.documentElement.scrollWidth - innerWidth, height: innerHeight };
  // Since polish 1 (the 25 Nov reference) the crosshair sits at the top of the screen and the name at its foot,
  // outside the column; Back sits over the column, in the middle part.
  const mark = document.querySelector('.si-mark svg');
  const brand = document.querySelector('.si-brand');
  if (mark && brand) { out.mark = r(mark); out.brand = r(brand); }
  const title = col.querySelector('.si-ttl, .si-account-open');
  if (title) out.title = r(title);
  const back = (col.closest('.si-mid') || col).querySelector('.si-back');
  if (back) {
    out.back = r(back);
    out.chev = r(back.querySelector('.ds-chevron'));
    const span = back.querySelector(':scope > span:last-child');
    const rg = document.createRange(); rg.selectNodeContents(span);
    out.backLabelLeft = Math.min(...[...rg.getClientRects()].map((x) => x.left));
  }
  const box = col.querySelector('.si-terms .ds-check-box');
  if (box) {
    const sq = box.querySelector('span'); const st = getComputedStyle(sq); const tick = box.querySelector('svg');
    out.tick = {
      // The edge as it is written (1.5px). A test browser rounds an edge to
      // whole pixels of its own screen when asked what it drew, so the
      // drawn edge is only checked for being there on all four sides.
      tap: r(box), square: r(sq), edge: [st.borderTopWidth, st.borderRightWidth, st.borderBottomWidth, st.borderLeftWidth].map(parseFloat), written: st.borderTopWidth, corners: parseFloat(st.borderTopLeftRadius), tick: r(tick),
      boxLeft: Math.min(...[...col.querySelectorAll('.si-inp')].filter(vis).map((i) => i.getBoundingClientRect().left)),
    };
  }
  // Tap areas: every control's own box, with the invisible ::after a button
  // lays round itself (since 18 Nov a button is 34px, 40px on a phone, in a
  // 44px-high target as wide as it).
  out.low = [];
  for (const el of col.querySelectorAll('a[href], button, input, [role=checkbox]')) {
    if (!vis(el)) continue;
    const own = el.getBoundingClientRect();
    const af = getComputedStyle(el, '::after');
    const reach = af.content !== 'none' && af.position === 'absolute' && af.pointerEvents !== 'none' ? { width: parseFloat(af.width) || 0, height: parseFloat(af.height) || 0 } : { width: 0, height: 0 };
    const b = { width: Math.max(own.width, reach.width), height: Math.max(own.height, reach.height) };
    const name = `${el.className.toString().split(' ')[0]} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24)}"`;
    if (b.height < 43.5) out.low.push(`${name} ${b.height.toFixed(1)}px high`);
    if (!el.matches('.si-link') && b.width < 43.5) out.low.push(`${name} ${b.width.toFixed(1)}px wide`);
  }
  out.smallText = [...col.querySelectorAll('input')].filter(vis).filter((i) => parseFloat(getComputedStyle(i).fontSize) < 16).length;
  const six = col.querySelector('.si-nowrap');
  if (six) out.six = { lines: six.getClientRects().length, text: six.textContent };
  return out;
}

const browser = await chromium.launch();
const same = {};
const table = [];
for (const mode of MODES) {
  for (const width of SIZES) {
    const phone = width < 700;
    for (const screen of [...SCREENS, ...COACH_SCREENS]) {
      if (ONLY && !ONLY.includes(screen.key)) continue;
      const tag = `${screen.name}, ${width}px ${mode}`;
      const answers = {};
      const ctx = await browser.newContext({ viewport: { width, height: phone ? 844 : 900 }, deviceScaleFactor: SCALE, colorScheme: mode, locale: 'en-GB', timezoneId: 'Europe/London', hasTouch: phone, isMobile: phone });
      await ctx.addInitScript((m) => { try { localStorage.setItem('clarity-colour-mode', m); } catch { /* the device's mode */ } }, mode);
      await guard(ctx, [], answers);
      const page = await ctx.newPage();
      try {
        await screen.open(page, { env, answers, SAM, phone, ctx });
        await page.waitForSelector(screen.acct ? '.si-col--account' : '.si-col', { timeout: 20000 });
        await page.evaluate(() => document.fonts.ready);
        await page.mouse.move(1, 1);
        await page.evaluate(() => document.activeElement?.blur?.());
        await sleep(450);
      } catch (e) {
        pass(`${tag}: opens`, false, e.message.split('\n')[0]);
        await ctx.close();
        continue;
      }
      const p = await page.evaluate(parts);
      const got = await page.evaluate(rhythm, { root: '.si-col', m: BUILT });

      // The crosshair at the top and THE CLARITY PORTAL at the foot (polish 1, rule 22; the 25 Nov example):
      // the crosshair 40px, about 11% of the window down and at least 80px, both on the window's middle.
      if (p.mark && !screen.acct) {
        const cross = await ink(page, { x: p.mark.x - 2, y: p.mark.y - 2, width: p.mark.width + 4, height: p.mark.height + 4 });
        const name = await ink(page, { x: p.brand.x, y: p.brand.y, width: p.brand.width, height: p.brand.height + 2 });
        const cx = (cross.left + cross.right) / 2;
        const nx = (name.left + name.right) / 2;
        const mid = width / 2;
        pass(`${tag}: the crosshair and the name are on the screen’s middle (within 0.5px)`, Math.abs(cx - mid) <= 0.5 && Math.abs(nx - mid) <= 0.5, `crosshair ${cx.toFixed(2)}, name ${nx.toFixed(2)}, middle ${mid}`);
        pass(`${tag}: the crosshair is 40px`, Math.abs(p.mark.width - 40) < 0.1 && Math.abs(p.mark.height - 40) < 0.1, `${p.mark.width} by ${p.mark.height}`);
        const top = Math.max(80, 0.11 * p.height);
        pass(`${tag}: the crosshair is 11% of the window down, at least 80px`, Math.abs(p.mark.y - top) <= 0.5, `${p.mark.y.toFixed(2)} (want ${top.toFixed(2)})`);
        pass(`${tag}: THE CLARITY PORTAL is at the foot, 40px from the bottom or below the form`, p.brand.bottom <= p.height - 39.5 || p.brand.y > p.col.bottom, `${p.brand.bottom.toFixed(1)} of ${p.height}`);
        const key = `${width} ${mode}`;
        const here = { crossTop: cross.top, crossLeft: cross.left };
        if (!same[key]) same[key] = { first: screen.name, at: here };
        const off = Object.keys(here).filter((k) => Math.abs(here[k] - same[key].at[k]) > 0.5);
        pass(`${tag}: the crosshair is in the same place as on ${same[key].first}`, off.length === 0, off.map((k) => `${k} ${here[k].toFixed(2)} (there ${same[key].at[k].toFixed(2)})`).join('; '));
        if (mode === MODES[0]) table.push(`${screen.name} ${width}: crosshair ${cross.left.toFixed(2)} to ${cross.right.toFixed(2)} at ${p.mark.y.toFixed(2)}, name ${name.left.toFixed(2)} to ${name.right.toFixed(2)}`);
      }

      // Back.
      if (p.back) {
        // From Back's own left edge up to just before its label: only the chevron is in there.
        const chev = await ink(page, { x: p.back.x - 2, y: p.back.y, width: p.backLabelLeft - p.back.x - 1, height: p.back.height });
        pass(`${tag}: Back’s chevron has its visible edge on the content’s left edge`, chev && Math.abs(chev.left - p.col.x) <= 0.5, chev ? `${chev.left.toFixed(2)} (content edge ${p.col.x.toFixed(2)})` : 'no chevron seen');
        // 10px on every page (Tim, 18 Nov, follow-up 1; was 14px).
        // Within 1px since polish 1: the fine chevron (the reference's .cv, a 1.6px line) is drawn with soft
        // edges, and its faintest pixels fall under the reader's threshold, so its right edge reads up to 0.6px in.
        pass(`${tag}: 10px from the chevron to its label`, chev && Math.abs(p.backLabelLeft - chev.right - 10) <= 1, chev ? `${(p.backLabelLeft - chev.right).toFixed(2)}px` : '');
        pass(`${tag}: Back’s tap area is 44px high`, p.back.height >= 43.5, `${p.back.height}`);
        if (!screen.acct) {
          pass(`${tag}: Back sits over the column, above its title`, p.title && p.back.bottom <= p.title.y + 0.5, `Back ends ${p.back.bottom.toFixed(1)}, title starts ${p.title?.y.toFixed(1)}`);
          if (phone) pass(`${tag}: Back is clear of the phone’s notch (below 47px)`, p.back.y >= 47, `${p.back.y.toFixed(1)}px from the top`);
        }
        // Centred on its words, within 0.5px (rule 29ao): read at the phone and laptop sizes in this mode.
        const chevrons = await measureChevrons(page);
        // The reader hides edges while it looks; they fade back in before anything else is read.
        await sleep(400);
        pass(`${tag}: Back’s chevron is centred on its words`, chevrons.length >= 1 && chevronsOff(chevrons).length === 0, `${chevrons.length} read; ${chevronsOff(chevrons).slice(0, 2).join('; ')}`);
        if (mode === MODES[0]) table.push(`${screen.name} ${width}: Back chevron edge ${(chev.left - p.col.x).toFixed(2)}px from the content edge, ${(p.backLabelLeft - chev.right).toFixed(2)}px to its label`);
      }

      // The spacing rule, from the page's own boxes.
      const rule = await page.evaluate(spacingRule, '.si-col');
      pass(`${tag}: the spacing (the 25 Nov reference: 32px under the title, 12px between parts, 24px from the code squares to a link; lines at 1.55)`, ruleProblems(rule).length === 0, ruleProblems(rule).join('; '));
      if (mode === MODES[0]) table.push(`${screen.name} ${width}: rule ${rule.gaps.map((x) => `${x.key} ${x.gap}`).join(', ') || 'no pairs it names'}`);
      if (got?.betweenBoxes) pass(`${tag}: 12px between boxes`, got.betweenBoxes.every((v) => Math.abs(v - 12) <= 0.5), JSON.stringify(got.betweenBoxes));
      if (got?.linksApart) pass(`${tag}: stacked links are at least 28px apart`, got.linksApart.every((v) => v >= 28), JSON.stringify(got.linksApart));
      if (mode === MODES[0] && got) table.push(`${screen.name} ${width}: ${Object.entries(got).map(([k, v]) => `${k} ${JSON.stringify(v)}`).join(', ')}`);

      // Centred throughout (the 25 Nov reference; a form says so with data-form), My Account's pages on one left edge.
      const centring = await page.evaluate(centredGroups, { root: screen.acct ? '.si-col--account' : '.si-col' });
      const offCentre = centringProblems(centring);
      pass(`${tag}: each row ${centring.align === 'centre' ? 'centred as a group' : 'on the column’s left edge'}, and boxes even inside`, offCentre.length === 0, offCentre.slice(0, 4).join('; '));

      // Tap areas, edges, boxes.
      const shared = await page.evaluate(overlappingTaps);
      pass(`${tag}: no two tap areas overlap`, shared.length === 0, shared.slice(0, 4).join('; '));
      pass(`${tag}: every tap area is 44px high (and buttons 44px wide)`, p.low.length === 0, p.low.slice(0, 5).join('; '));
      const low = await page.evaluate(outlinedEdges);
      pass(`${tag}: every outlined edge reaches 3 to 1`, low.length === 0, low.slice(0, 4).join('; '));
      pass(`${tag}: every box’s text is 16px or more`, p.smallText === 0, `${p.smallText}`);
      pass(`${tag}: no sideways scroll`, p.sideways <= 0, `${p.sideways}px`);

      // The tick box.
      if (p.tick) {
        const t = p.tick;
        const near = (a, b) => Math.abs(a - b) <= 0.1;
        // The 25 Nov reference's tick box (.tick): 24px, a 1px edge, 6px corners, in a 44px tap area (the shared .ds-check-box).
        pass(`${tag}: the tick box is the shared 24px one with a 1px edge and 6px corners, in a 44px tap area`,
          near(t.square.width, 24) && near(t.square.height, 24) && t.written === '1px' && t.edge.every((e) => e >= 1 && e <= 1.5) && near(t.corners, 6) && t.tick.width > 0 && near(t.tap.width, 44) && near(t.tap.height, 44),
          JSON.stringify({ square: [t.square.width, t.square.height], edgeWritten: t.written, edgeDrawn: t.edge, corners: t.corners, tick: [t.tick.width, t.tick.height], tap: [t.tap.width, t.tap.height] }));
        if (Number.isFinite(t.boxLeft)) pass(`${tag}: the tick box lines up with the boxes’ left edge`, Math.abs(t.square.x - t.boxLeft) <= 0.5, `${t.square.x.toFixed(2)} (boxes ${t.boxLeft.toFixed(2)})`);
        else pass(`${tag}: the tick box lines up with the column’s left edge`, Math.abs(t.square.x - p.col.x) <= 0.5, `${t.square.x.toFixed(2)} (column ${p.col.x.toFixed(2)})`);
      }
      if (p.six) {
        const lines = [p.six.lines];
        for (const w of phone ? [360, 320] : []) {
          await page.setViewportSize({ width: w, height: 844 });
          await sleep(120);
          lines.push(await page.locator('.si-nowrap').evaluate((el) => el.getClientRects().length));
        }
        pass(`${tag}: “6-digit” is on one line${phone ? ' (at 390, 360 and 320)' : ''}`, lines.every((n) => n === 1) && p.six.text === '6-digit', JSON.stringify(lines));
      }
      await ctx.close();
    }
  }
}
await browser.close();
console.log('\nMEASUREMENTS');
for (const line of table) console.log(`  ${line}`);
done();
