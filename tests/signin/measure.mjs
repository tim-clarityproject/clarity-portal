// The sign-in pages, measured (M26; Tim's audit of 11 Nov, 22:57 to
// 23:04), on every one of the 21 screens, dark and light, at 1280 wide
// and at 390 by 844:
//   - the bold crosshair and the name: the name's middle on the
//     crosshair's middle (within 0.5px), and both in the same place on
//     every page;
//   - "Back to sign in": the chevron's visible edge on the content's left
//     edge, 14px before its label, and clear of the phone's notch;
//   - the spacing rhythm, read the same way on the page and on M26 itself:
//     under the name, title or core line, between boxes, above the
//     button, and from the button to the first link;
//   - stacked text links at least 28px apart, and no two tap areas
//     overlapping; every tap area 44px high;
//   - the tick box: 18px, a 1.5px edge, 5px corners, a 12px tick, a 44px
//     tap area, and its row lined up with the boxes' left edge;
//   - "6-digit" on one line; boxes 16px or more; every outlined edge 3 to 1.
//
//   node tests/signin/measure.mjs
//   ONLY=signin,create  MODES=dark  SIZES=1280  narrow a run.
//
// TEST project only; no real email, and Google's own page is never opened.
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { APP, MOCKUP, SAM, guard, makeChecks, sleep, testEnv } from './shared.mjs';
import { SCREENS } from './screens.mjs';
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
const MOCK = { heads: '.brand, .core, .ttl, .ph3 h1', words: '.p, .alt, .core', field: '.field', btn: '.btn', link: '.alt a', terms: '.terms' };
const BUILT = { heads: '.si-brand, .si-core, .si-ttl, .si-account-title', words: '.si-p, .si-alt, .si-core', field: '.si-field', btn: '.si-btn', link: '.si-alt .si-link', terms: '.si-terms' };

// Everything else that is read from the page itself.
function parts() {
  const col = document.querySelector('.si-col');
  const vis = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
  const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, width: b.width, height: b.height, right: b.right, bottom: b.bottom }; };
  const out = { col: r(col), sideways: document.documentElement.scrollWidth - innerWidth };
  const mark = col.querySelector('.si-mark svg');
  const brand = col.querySelector('.si-brand');
  if (mark && brand) { out.mark = r(mark); out.brand = r(brand); }
  const back = col.querySelector('.si-back');
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
      tap: r(box), square: r(sq), edge: [st.borderTopWidth, st.borderRightWidth, st.borderBottomWidth, st.borderLeftWidth].map(parseFloat), written: st.getPropertyValue('--line-w-strong').trim(), corners: parseFloat(st.borderTopLeftRadius), tick: r(tick),
      boxLeft: Math.min(...[...col.querySelectorAll('.si-inp')].filter(vis).map((i) => i.getBoundingClientRect().left)),
    };
  }
  // Tap areas: every control's own box.
  out.low = [];
  for (const el of col.querySelectorAll('a[href], button, input, [role=checkbox]')) {
    if (!vis(el)) continue;
    const b = el.getBoundingClientRect();
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
  const mockCtx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, colorScheme: mode, locale: 'en-GB' });
  const mock = await mockCtx.newPage();
  await mock.goto(pathToFileURL(MOCKUP).href);
  await mock.locator(`#mode button[data-m="${mode}"]`).click();
  for (const width of SIZES) {
    const phone = width < 700;
    for (const screen of SCREENS) {
      if (ONLY && !ONLY.includes(screen.key)) continue;
      const tag = `${screen.name}, ${width}px ${mode}`;
      await mock.locator(`#scrs .pick button[data-s="${screen.key}"]`).click();
      await sleep(60);
      const want = await mock.evaluate(rhythm, { root: phone ? '#ph' : '#dk', m: MOCK });

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

      // The crosshair and the name.
      if (p.mark) {
        const cross = await ink(page, { x: p.mark.x - 2, y: p.mark.y - 2, width: p.mark.width + 4, height: p.mark.height + 4 });
        const name = await ink(page, { x: p.col.x, y: p.brand.y, width: p.col.width, height: p.brand.height + 2 });
        const cx = (cross.left + cross.right) / 2;
        const nx = (name.left + name.right) / 2;
        pass(`${tag}: the name’s middle is on the crosshair’s middle (within 0.5px)`, Math.abs(cx - nx) <= 0.5, `crosshair ${cx.toFixed(2)}, name ${nx.toFixed(2)}`);
        pass(`${tag}: both are in the middle of the column`, Math.abs(cx - (p.col.x + p.col.width / 2)) <= 0.5, `${cx.toFixed(2)} in a column centred on ${(p.col.x + p.col.width / 2).toFixed(2)}`);
        pass(`${tag}: the crosshair is 32px`, Math.abs(p.mark.width - 32) < 0.1 && Math.abs(p.mark.height - 32) < 0.1, `${p.mark.width} by ${p.mark.height}`);
        const key = `${width} ${mode}`;
        const here = { crossTop: cross.top, crossLeft: cross.left, nameTop: name.top, nameLeft: name.left };
        if (!same[key]) same[key] = { first: screen.name, at: here };
        const off = Object.keys(here).filter((k) => Math.abs(here[k] - same[key].at[k]) > 0.5);
        pass(`${tag}: the crosshair and the name are in the same place as on ${same[key].first}`, off.length === 0, off.map((k) => `${k} ${here[k].toFixed(2)} (there ${same[key].at[k].toFixed(2)})`).join('; '));
        if (mode === MODES[0]) table.push(`${screen.name} ${width}: crosshair centre ${cx.toFixed(2)}, name centre ${nx.toFixed(2)}`);
      }

      // Back.
      if (p.back) {
        // From Back's own left edge up to just before its label: only the chevron is in there.
        const chev = await ink(page, { x: p.back.x - 2, y: p.back.y, width: p.backLabelLeft - p.back.x - 1, height: p.back.height });
        pass(`${tag}: Back’s chevron has its visible edge on the content’s left edge`, chev && Math.abs(chev.left - p.col.x) <= 0.5, chev ? `${chev.left.toFixed(2)} (content edge ${p.col.x.toFixed(2)})` : 'no chevron seen');
        pass(`${tag}: 14px from the chevron to its label`, chev && Math.abs(p.backLabelLeft - chev.right - 14) <= 0.5, chev ? `${(p.backLabelLeft - chev.right).toFixed(2)}px` : '');
        pass(`${tag}: Back’s tap area is 44px high`, p.back.height >= 43.5, `${p.back.height}`);
        if (!screen.acct) {
          pass(`${tag}: Back sits at the top left, above the column`, p.back.bottom <= p.mark.y + 0.5 && Math.abs(p.back.x + 5 - p.col.x) <= 0.6, `Back ends ${p.back.bottom.toFixed(1)}, crosshair starts ${p.mark.y.toFixed(1)}`);
          if (phone) pass(`${tag}: Back is clear of the phone’s notch (below 47px)`, p.back.y >= 47, `${p.back.y.toFixed(1)}px from the top`);
        }
        // Centred on its words, within 0.5px (rule 29ao): read at the phone and laptop sizes in this mode.
        const chevrons = await measureChevrons(page);
        // The reader hides edges while it looks; they fade back in before anything else is read.
        await sleep(400);
        pass(`${tag}: Back’s chevron is centred on its words`, chevrons.length >= 1 && chevronsOff(chevrons).length === 0, `${chevrons.length} read; ${chevronsOff(chevrons).slice(0, 2).join('; ')}`);
        if (mode === MODES[0]) table.push(`${screen.name} ${width}: Back chevron edge ${(chev.left - p.col.x).toFixed(2)}px from the content edge, ${(p.backLabelLeft - chev.right).toFixed(2)}px to its label`);
      }

      // The spacing rhythm, against M26 read the same way.
      const gaps = [];
      for (const k of Object.keys(want || {})) {
        const w = [].concat(want[k]); const g = [].concat(got?.[k] ?? []);
        const ok = w.length === g.length && w.every((v, i) => Math.abs(v - g[i]) <= 0.5);
        if (!ok) gaps.push(`${k} ${JSON.stringify(got?.[k])} (M26 ${JSON.stringify(want[k])})`);
      }
      const extra = Object.keys(got || {}).filter((k) => !(k in (want || {})));
      pass(`${tag}: the spacing matches M26’s, read the same way`, gaps.length === 0 && extra.length === 0, [...gaps, ...extra.map((k) => `${k} only in the build`)].join('; '));
      if (got?.betweenBoxes) pass(`${tag}: 12px between boxes`, got.betweenBoxes.every((v) => Math.abs(v - 12) <= 0.5), JSON.stringify(got.betweenBoxes));
      if (got?.linksApart) pass(`${tag}: stacked links are at least 28px apart`, got.linksApart.every((v) => v >= 28), JSON.stringify(got.linksApart));
      if (mode === MODES[0] && got) table.push(`${screen.name} ${width}: ${Object.entries(got).map(([k, v]) => `${k} ${JSON.stringify(v)}`).join(', ')}`);

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
        pass(`${tag}: the tick box is 18px with a 1.5px edge, 5px corners and a 12px tick, in a 44px tap area`,
          near(t.square.width, 18) && near(t.square.height, 18) && t.written === '1.5px' && t.edge.every((e) => e >= 1 && e <= 1.5) && near(t.corners, 5) && near(t.tick.width, 12) && near(t.tick.height, 12) && near(t.tap.width, 44) && near(t.tap.height, 44),
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
  await mockCtx.close();
}
await browser.close();
console.log('\nMEASUREMENTS');
for (const line of table) console.log(`  ${line}`);
done();
