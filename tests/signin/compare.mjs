// The sign-in pages beside their mock-up, M26 (version 4, approved by Tim
// on 11 Nov; seq 7 since Phase 6a run 5, with the spacing rule of 19 Nov):
// all 21 screens, dark and light, at 1280 wide and at 390 by
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
import { withNewButtons, withNewFields } from '../buttons/expected.mjs';

const env = testEnv();
const out = process.argv[2] || null;
if (out) mkdirSync(out, { recursive: true });
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const MODES = (process.env.MODES || 'dark,light').split(',');
const SIZES = (process.env.SIZES || '1280,390').split(',').map(Number);
const { pass, done } = makeChecks();

// Reads the parts of one sign-in column, in the order they appear, with
// each part's place measured from the column's own top left corner.
function readParts({ root, map, loose = false }) {
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
    if (kind === 'inp') text = loose ? (el.labels?.[0] ? 'labelled' : 'no label') : `${el.getAttribute('autocomplete') || ''}|${el.getAttribute('inputmode') || ''}|${el.getAttribute('placeholder') || ''}|${el.labels?.[0] ? 'labelled' : 'no label'}`;
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
function allowed(kind, what, screen, phone) {
  // Inside My Account the pages sit in the portal's own frame, which M26
  // doesn't draw: on a phone its gutter is 20px a side where M26's sheet
  // has 16px, so the column is 8px narrower. Heights and gaps still match.
  if (screen.startsWith('acct-') && phone && (what === 'width' || what === 'left')) return 9;
  // The name is nudged down 0.1em (Tim, 11 Nov: Nekst capitals sit high on their line).
  if (kind === 'brand' && what === 'top') return 1.4;
  // Back's box starts at the chevron's own square, so its visible edge
  // lands on the content edge (measured in tests/signin/measure.mjs).
  if (kind === 'back' && (what === 'left' || what === 'width')) return 12;
  // Before you start: the tick box and its words are centred as one group on a page with no boxes (Tim, 23 Nov 2026,
  // sign-in rule 49, si-terms--centred), where M26 draws them on the column's left edge: they move right together
  // (about 30px on both widths); their sizes and the rows above and below are held to M26's.
  if (screen === 'google-new' && ['box', 'link'].includes(kind) && what === 'left') return 32;
  // Words are as wide as their font draws them: M26 loads DM Sans from
  // Google, the portal carries its own copy.
  if (['link', 'show', 'saved'].includes(kind) && (what === 'left' || what === 'width')) return 3;
  if (kind === 'wait' && (what === 'width' || what === 'left')) return 3;
  if (screen.startsWith('acct-') && kind === 'btn' && (what === 'width')) return 4;
  return 0.6;
}

// The spacing rule of 19 Nov, 21:25 (Phase 6a run 5; the run's prompt wins
// over M26): M26 seq 7 draws it on the sign-in pages, but My Account's
// pages kept version 4's 22px from a box to the button, 17px from the
// button to a link and 22px from the title to its first line. The rule
// moves those parts (box to button 18, button to link 18, title to line
// 12): from the first part of each kind named, everything below moves by
// that much.
const SPACING_RULE = {
  'acct-password': [['btn', -4], ['alt', 1]],
  'acct-password-saved': [['btn', -4], ['alt', 1]],
  'acct-email': [['btn', -4]],
  'acct-email-sent': [['p', -10], ['alt', 1]],
};
function withSpacingRule(parts, key) {
  const steps = [...(SPACING_RULE[key] || [])];
  let shift = 0;
  return parts.map((x) => {
    if (steps.length && x.kind === steps[0][0]) shift += steps.shift()[1];
    return shift ? { ...x, top: x.top + shift } : x;
  });
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
      if (screen.newer) await mock.evaluate(screen.newer, SAM.newEmail);
      await sleep(80);
      const want = await mock.evaluate(readParts, { root: phone ? '#ph' : '#dk', map: MOCK_MAP, loose: Boolean(screen.looseBox) });
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
        // The pointer away from the column, as measure.mjs does: a link that
        // lands under the last press would be read in its hover colour.
        await page.mouse.move(1, 1);
        await sleep(350);
      } catch (e) {
        pass(`${tag}: opens`, false, e.message.split('\n')[0]);
        await ctx.close();
        continue;
      }
      const got = await page.evaluate(readParts, { root: '.si-col', map: APP_MAP, loose: Boolean(screen.looseBox) });
      // M26's pill buttons, as the new buttons draw them (Tim, 18 Nov, follow-up 1; tests/buttons/expected.mjs): 40px
      // high, 44px on a phone, 16px words; a button that hugs its words is their width plus 16px each side.
      const boxWidth = Math.max(0, ...want.parts.filter((x) => x.kind === 'inp').map((x) => x.width));
      const appButtons = got.parts.filter((x) => x.kind === 'btn');
      const mockButtons = want.parts.filter((x) => x.kind === 'btn');
      const words = !appButtons.length ? [] : await page.evaluate((texts) => {
        const c = document.createElement('canvas').getContext('2d');
        const st = getComputedStyle(document.querySelector('.si-col .si-btn'));
        c.font = `${st.fontWeight} ${st.fontSize} ${st.fontFamily}`;
        c.letterSpacing = st.letterSpacing;
        return texts.map((t) => c.measureText(t).width);
      }, appButtons.map((x) => x.text));
      want.parts = withNewButtons(want.parts, {
        phone,
        isButton: (x) => x.kind === 'btn',
        fills: (x) => !boxWidth || x.width >= boxWidth - 1,
        wordsWidth: (x) => words[mockButtons.findIndex((m) => m.text === x.text && m.top === x.top)] ?? x.width,
      });
      // Its boxes, at follow-up 1's 56px (52px on a phone): what's below them moves by the difference.
      want.parts = withNewFields(want.parts, { phone, isField: (x) => x.kind === 'inp' });
      want.parts = withSpacingRule(want.parts, screen.key);
      pass(`${tag}: no page error`, errors.length === 0, errors[0]);
      pass(`${tag}: no sideways scroll`, got.sideways <= 0, `${got.sideways}px`);
      // M26 sets its buttons in capitals; since 18 Nov the portal's buttons are sentence case
      // (Tim's Quiet precision), so a button's words are compared letter for letter, whatever the case.
      const kinds = (list) => list.parts.map((p) => `${p.kind}${p.text ? ` "${p.kind === 'btn' ? p.text.toLowerCase() : p.text}"` : ''}`);
      const same = JSON.stringify(kinds(want)) === JSON.stringify(kinds(got));
      pass(`${tag}: the same parts, in the same order, with the same words`, same, same ? '' : `\n   M26: ${kinds(want).join(' | ')}\n   app: ${kinds(got).join(' | ')}`);
      if (same) {
        const off = [];
        want.parts.forEach((w, i) => {
          const g = got.parts[i];
          for (const what of ['top', 'left', 'width', 'height']) {
            if (Math.abs(w[what] - g[what]) > allowed(w.kind, what, screen.key, phone)) off.push(`${w.kind}${w.text ? ` "${w.text.slice(0, 24)}"` : ''} ${what} ${g[what]} (M26 ${w[what]})`);
          }
          if (w.kind !== 'box' && Math.abs(w.size - g.size) > 0.05) off.push(`${w.kind} text size ${g.size} (M26 ${w.size})`);
        });
        pass(`${tag}: every part where M26 draws it, within half a pixel (${want.parts.length} parts)`, off.length === 0, off.slice(0, 8).join('; '));
        const colours = want.parts.filter((w, i) => w.colour !== got.parts[i].colour && !['mark', 'gbtn', 'inp', 'box'].includes(w.kind)).map((w) => `${w.kind} ${got.parts[want.parts.indexOf(w)].colour} (M26 ${w.colour})`);
        pass(`${tag}: every part in M26's colour`, colours.length === 0, [...new Set(colours)].slice(0, 6).join('; '));
        pass(`${tag}: the column is M26's width`, Math.abs(want.colWidth - got.colWidth) <= (screen.acct && phone ? 8.6 : 0.6), `${got.colWidth} (M26 ${want.colWidth})`);
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
// The coach authenticator's screens (Phase 6a run 5; M26 seq 7), word for
// word: the run's prompt wins over M26, and the design reference over M26
// for how a part looks, so their places aren't held to M26's (the QR, the
// apps' rows and the reset's side panel are drawn differently on purpose;
// measure.mjs and coach-auth.mjs measure the spacing rule on them). Every
// line M26 draws must be there in M26's order, and nothing else may be,
// apart from the differences listed in COACH_MEANT with why. Each screen is
// stood in whole (coachWorld.mjs), and the owner's Reset is the test
// coach's saved read-only sign-in with 049 to 053 and the server stood in.
//   ONLY=coach-words runs this part alone.
const COACH_MEANT = {
  // The prompt: "Back returns to set-up" (M26 draws no Back here).
  'auth-codes': { added: ['Back'], gone: [] },
  // A side panel from the menu, the coach portal's shared part (the design reference wins): no Back "Coaches",
  // and its foot reads left to right, the quiet Keep it before the coral Reset it at the right.
  'acct-reset': { added: [], gone: ['Coaches'], swap: ['Reset it', 'Keep it'] },
  // A recovery code ends the coach's other sign-ins, and You're in says so (Phase 6a run 7, step 3; coach rule of 22 Nov).
  'auth-in': { added: ['Your other sign-ins have ended.'], gone: [] },
  // The stood-in authenticator was set up on the test's own day, 2 Nov 2026 (coachWorld.mjs), where M26 draws 2 Dec.
  'acct-security': { added: ['Authenticator app on since Mon 2 Nov'], gone: ['Authenticator app on since Wed 2 Dec'] },
};
const COACH_WORDS = [
  { key: 'coach-code', go: '/coach/sign-in/code', world: { factor: 'verified' }, wait: '.si-field' },
  { key: 'auth-setup', go: '/coach/sign-in/set-up', world: { factor: 'none', codesMade: false, codesSaved: false }, wait: '.si-qr svg' },
  { key: 'auth-codes', go: '/coach/sign-in/recovery-codes', world: { factor: 'verified', aal: 'aal2', codesSaved: false }, wait: '.si-rc li' },
  { key: 'auth-lost', go: '/coach/sign-in/help', world: { factor: 'verified' }, wait: '.si-field' },
  {
    key: 'auth-in', go: '/coach/sign-in/help', world: { factor: 'verified' }, wait: '.si-field',
    then: async (page) => {
      await page.getByLabel('Recovery code').fill('k7q2-9fmd');
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.waitForURL(/\/coach\/sign-in\/in$/, { timeout: 15000 });
      await page.getByText('That recovery code is now used.').waitFor({ timeout: 10000 });
    },
  },
  { key: 'acct-security', go: '/my-account/sign-in-security', world: { factor: 'verified', aal: 'aal2', codesLeft: 9 }, wait: '.si-srow', root: '.si-col--account' },
  { key: 'acct-reset', go: '/coach/settings/coaches', root: '[role=dialog]' },
];
if (!ONLY || ONLY.includes('coach-words')) {
  const { coachWorld } = await import('./coachWorld.mjs');
  // M26's lines for a screen: every element whose own words show, in order (the name and the mark left out).
  const mockLines = (root) => {
    const out = [];
    const el = document.querySelector(root);
    const walk = (n) => {
      for (const c of n.children) {
        const st = getComputedStyle(c);
        if (st.display === 'none' || st.visibility === 'hidden' || c.matches('.brand, .mark, svg')) continue;
        const own = [...c.childNodes].filter((x) => x.nodeType === 3).map((x) => x.textContent).join('').trim();
        if (own) out.push(c.innerText.replace(/\s+/g, ' ').trim()); else walk(c);
      }
    };
    walk(el);
    return out;
  };
  const clean = (t) => t.replace(/[‑‐]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();
  for (const mode of MODES) {
    const mockCtx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, colorScheme: mode, locale: 'en-GB' });
    const mock = await mockCtx.newPage();
    await mock.goto(pathToFileURL(MOCKUP).href);
    await mock.locator(`#mode button[data-m="${mode}"]`).click();
    for (const width of SIZES) {
      const phone = width < 700;
      for (const sc of COACH_WORDS) {
        const tag = `${sc.key} (words), ${width}px ${mode}`;
        await mock.locator(`#scrs .pick button[data-s="${sc.key}"]`).click();
        await sleep(80);
        const want = (await mock.evaluate(mockLines, phone ? '#ph' : '#dk')).map(clean);
        let ctx;
        try {
          let page;
          if (sc.world) {
            ctx = await browser.newContext({ viewport: { width, height: phone ? 844 : 900 }, colorScheme: mode, locale: 'en-GB', timezoneId: 'Europe/London', hasTouch: phone, isMobile: phone, serviceWorkers: 'block' });
            await ctx.addInitScript((m) => { try { localStorage.setItem('clarity-colour-mode', m); } catch { /* the device's mode */ } }, mode);
            await coachWorld(ctx, sc.world);
            page = await ctx.newPage();
          } else {
            const { coachContext, standIn } = await import('../coach/shared.mjs');
            ctx = await coachContext(browser, { size: phone ? 400 : 1440, theme: mode });
            page = await ctx.newPage();
            await standIn(page, { role: 'owner', db: 'none' });
            await page.route('**/api/coach-auth-reset', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"ran":false}' }));
          }
          await page.goto(`${APP}${sc.go}`);
          if (sc.wait) await page.waitForSelector(sc.wait, { timeout: 20000 });
          if (sc.then) await sc.then(page);
          if (sc.key === 'acct-reset') {
            await page.getByRole('button', { name: /^More for / }).first().click({ timeout: 25000 });
            await page.getByRole('menuitem', { name: 'Reset authenticator' }).click();
            await page.getByRole('dialog', { name: /Reset .*authenticator/i }).waitFor({ timeout: 10000 });
          }
          await sleep(300);
          const root = sc.root || '.si-col';
          const got = (await page.evaluate(({ r }) => {
            const el = document.querySelector(r);
            const out = [];
            const walk = (n) => {
              for (const c of n.children) {
                const st = getComputedStyle(c);
                if (st.display === 'none' || st.visibility === 'hidden' || c.matches('.si-brand, .si-mark, svg, .ds-sr, .sr-only, [aria-hidden=true]')) continue;
                const own = [...c.childNodes].filter((x) => x.nodeType === 3).map((x) => x.textContent).join('').trim();
                if (own) out.push(c.innerText.replace(/\s+/g, ' ').trim()); else walk(c);
              }
            };
            walk(el);
            return out;
          }, { r: root })).map(clean);
          const meant = COACH_MEANT[sc.key] || { added: [], gone: [] };
          let wantNow = want.filter((t) => t !== 'the clarity portal' && !meant.gone.map(clean).includes(t));
          if (meant.swap) {
            const [x, y] = meant.swap.map(clean);
            wantNow = wantNow.map((t) => (t === x ? y : t === y ? x : t));
          }
          const gotNow = got.filter((t) => t !== 'the clarity portal' && !meant.added.map(clean).includes(t) && t !== 'close');
          // Line by line, in order; a part may be split or joined differently (a step's number, a line's two halves).
          const a = wantNow.join(' | ');
          const b = gotNow.join(' | ');
          const squash = (x) => x.replace(/[|\s]+/g, ' ').trim();
          pass(`${tag}: M26’s words, in M26’s order, and nothing else`, squash(a) === squash(b), `\n   M26: ${a}\n   app: ${b}`);
        } catch (e) {
          pass(`${tag}: opens`, false, e.message.split('\n')[0]);
        }
        await ctx?.close();
      }
    }
    await mockCtx.close();
  }
}

await browser.close();
const blocked = calls.filter((c) => c.blocked && !/fonts\.(googleapis|gstatic)\.com|pwnedpasswords/.test(c.blocked));
pass('no outside host was asked for anything', blocked.length === 0, [...new Set(blocked.map((c) => c.blocked))].slice(0, 4).join(', '));
done();
