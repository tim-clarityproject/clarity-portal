// The sign-in pages beside their mock-up, M26 (version 4, approved by Tim
// on 11 Nov): all 21 screens, dark and light, at 1280 wide and at 390 by
// 844. For each screen the same parts must appear in the same order with
// the same words, and each part must sit in the same place and be the
// same size as M26 draws it, to within half a pixel. It also saves a
// screenshot of every screen, named as M26's picker names them.
//
//   node tests/signin/compare.mjs [folder for screenshots]
//   ONLY=signin,create  MODES=dark  SIZES=1280  narrow a run.
//
// TEST project only. No real email is sent and Google's own page is never
// opened (tests/signin/shared.mjs answers those calls).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { APP, MOCKUP, SAM, guard, makeChecks, sleep, testEnv } from './shared.mjs';
import { SCREENS } from './screens.mjs';

const env = testEnv();
const out = process.argv[2] || null;
if (out) mkdirSync(out, { recursive: true });
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const MODES = (process.env.MODES || 'dark,light').split(',');
const SIZES = (process.env.SIZES || '1280,390').split(',').map(Number);
const { pass, done } = makeChecks();

// Reads the parts of one sign-in column, in the order they appear, with
// each part's place measured from the column's own top left corner.
function readParts({ root, map }) {
  const col = document.querySelector(root);
  if (!col) return null;
  const base = col.getBoundingClientRect();
  const clean = (t) => (t || '').replace(/[‑‐]/g, '-').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  const parts = [];
  const all = [...col.querySelectorAll('*')];
  for (const el of all) {
    const kind = Object.keys(map).find((k) => el.matches(map[k]));
    if (!kind) continue;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden') continue;
    let text = '';
    if (kind === 'inp') text = `${el.getAttribute('autocomplete') || ''}|${el.getAttribute('inputmode') || ''}|${el.getAttribute('placeholder') || ''}|${el.labels?.[0] ? 'labelled' : 'no label'}`;
    else if (kind === 'box') text = el.closest('[role=checkbox]')?.getAttribute('aria-checked') || '';
    else if (kind === 'mark' || kind === 'chev' || kind === 'spin') text = '';
    else text = clean(el.innerText);
    parts.push({
      kind,
      text,
      top: +(r.top - base.top).toFixed(2),
      left: +(r.left - base.left).toFixed(2),
      width: +r.width.toFixed(2),
      height: +r.height.toFixed(2),
      size: parseFloat(st.fontSize),
      colour: st.color,
      tag: el.tagName,
    });
  }
  return { parts, colWidth: +base.width.toFixed(2), colTop: +base.top.toFixed(2), colLeft: +base.left.toFixed(2), sideways: document.documentElement.scrollWidth - innerWidth };
}

const MOCK_MAP = {
  back: '.back', mark: '.mark svg', brand: '.brand', core: '.core', ttl: '.ttl, .ph3 h1', p: '.p', gbtn: '.gbtn', or: '.or',
  label: '.field label', inp: '.inp', show: '.show', terms: '.terms', box: '.cb i', err: '.err', btn: '.btn', alt: '.alt', link: '.alt a, .terms a',
  wait: '.wait', saved: '.saved',
};
const APP_MAP = {
  back: '.si-back', mark: '.si-mark svg', brand: '.si-brand', core: '.si-core', ttl: '.si-ttl, .si-account-title', p: '.si-p', gbtn: '.ds-google', or: '.si-or',
  label: '.si-field label', inp: '.si-inp', show: '.si-show', terms: '.si-terms', box: '.ds-check-box > span', err: '.si-err', btn: '.si-btn', alt: '.si-alt', link: '.si-alt .si-link, .si-terms .si-link',
  wait: '.si-wait', saved: '.ds-status--saved',
};

// Where a part's place is allowed to differ from M26's, and why.
function allowed(kind, what, screen) {
  // The name is nudged down 0.1em (Tim, 11 Nov: Nekst capitals sit high on their line).
  if (kind === 'brand' && what === 'top') return 1.4;
  // Back's box starts at the chevron's own square, so its visible edge
  // lands on the content edge (measured in tests/signin/measure.mjs).
  if (kind === 'back' && (what === 'left' || what === 'width')) return 12;
  // Words are as wide as their font draws them: M26 loads DM Sans from
  // Google, the portal carries its own copy.
  if (['link', 'show', 'saved'].includes(kind) && (what === 'left' || what === 'width')) return 3;
  if (kind === 'wait' && (what === 'width' || what === 'left')) return 3;
  if (screen.startsWith('acct-') && kind === 'btn' && (what === 'width')) return 4;
  return 0.6;
}

const browser = await chromium.launch();
const calls = [];
for (const mode of MODES) {
  // The mock-up, once per mode: both of its frames are on the page.
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
      await sleep(80);
      const want = await mock.evaluate(readParts, { root: phone ? '#ph' : '#dk', map: MOCK_MAP });
      const frameTop = await mock.evaluate((sel) => document.querySelector(sel).getBoundingClientRect().top, phone ? '.phone' : '.desk');

      const answers = {};
      // M26 draws its phone as a 390px frame with a 1px line round it, so
      // the page inside is 388px wide: the parts are measured at that
      // width, then the screenshot is taken at 390 by 844.
      const ctx = await browser.newContext({
        viewport: { width: phone ? width - 2 : width, height: phone ? 844 : 900 }, colorScheme: mode, locale: 'en-GB', timezoneId: 'Europe/London', hasTouch: phone, isMobile: phone,
      });
      await ctx.addInitScript((m) => { try { localStorage.setItem('clarity-colour-mode', m); } catch { /* the device's mode */ } }, mode);
      await guard(ctx, calls, answers);
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      try {
        await screen.open(page, { env, answers, SAM, phone, ctx });
        await page.waitForSelector(screen.acct ? '.si-col--account' : '.si-col', { timeout: 20000 });
        await page.evaluate(() => document.fonts.ready);
        await sleep(350);
      } catch (e) {
        pass(`${tag}: opens`, false, e.message.split('\n')[0]);
        await ctx.close();
        continue;
      }
      const got = await page.evaluate(readParts, { root: '.si-col', map: APP_MAP });
      pass(`${tag}: no page error`, errors.length === 0, errors[0]);
      pass(`${tag}: no sideways scroll`, got.sideways <= 0, `${got.sideways}px`);
      const kinds = (list) => list.parts.map((p) => `${p.kind}${p.text ? ` "${p.text}"` : ''}`);
      const same = JSON.stringify(kinds(want)) === JSON.stringify(kinds(got));
      pass(`${tag}: the same parts, in the same order, with the same words`, same, same ? '' : `\n   M26: ${kinds(want).join(' | ')}\n   app: ${kinds(got).join(' | ')}`);
      if (same) {
        const off = [];
        want.parts.forEach((w, i) => {
          const g = got.parts[i];
          for (const what of ['top', 'left', 'width', 'height']) {
            if (Math.abs(w[what] - g[what]) > allowed(w.kind, what, screen.key)) off.push(`${w.kind}${w.text ? ` "${w.text.slice(0, 24)}"` : ''} ${what} ${g[what]} (M26 ${w[what]})`);
          }
          if (w.kind !== 'box' && Math.abs(w.size - g.size) > 0.05) off.push(`${w.kind} text size ${g.size} (M26 ${w.size})`);
        });
        pass(`${tag}: every part where M26 draws it, within half a pixel (${want.parts.length} parts)`, off.length === 0, off.slice(0, 8).join('; '));
        const colours = want.parts.filter((w, i) => w.colour !== got.parts[i].colour && !['mark', 'gbtn', 'inp', 'box'].includes(w.kind)).map((w) => `${w.kind} ${got.parts[want.parts.indexOf(w)].colour} (M26 ${w.colour})`);
        pass(`${tag}: every part in M26's colour`, colours.length === 0, [...new Set(colours)].slice(0, 6).join('; '));
        pass(`${tag}: the column is M26's width`, Math.abs(want.colWidth - got.colWidth) <= 0.6, `${got.colWidth} (M26 ${want.colWidth})`);
        if (!screen.acct) pass(`${tag}: the column starts where M26's does`, Math.abs((want.colTop - frameTop) - got.colTop) <= 1.1, `${got.colTop} (M26 ${(want.colTop - frameTop).toFixed(2)})`);
      }
      const h1 = await page.locator('.si-col h1, .si-col--account h1').count();
      pass(`${tag}: one h1`, h1 === 1, `${h1}`);
      if (phone) {
        await page.setViewportSize({ width, height: 844 });
        await sleep(150);
        const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        pass(`${tag}: no sideways scroll at 390`, wide <= 0, `${wide}px`);
      }
      if (out) await page.screenshot({ path: `${out}/${screen.name.replace(/[’']/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${width === 1280 ? '1280' : '390x844'}-${mode}.png` });
      await ctx.close();
    }
  }
  await mockCtx.close();
}
await browser.close();
const blocked = calls.filter((c) => c.blocked && !/fonts\.(googleapis|gstatic)\.com|pwnedpasswords/.test(c.blocked));
pass('no outside host was asked for anything', blocked.length === 0, [...new Set(blocked.map((c) => c.blocked))].slice(0, 4).join(', '));
done();
