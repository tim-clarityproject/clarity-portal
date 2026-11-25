// The sign-in pages beside the approved 25 Nov example pages (polish 1,
// rules 22 and 23; ~/Downloads/clarity-phase-6a/example-pages-25nov.html),
// which win over M26 on look: Sign in and Enter your code, the two screens
// the example draws, dark and light, at 1280 by 800 and 390 by 844. Every
// other sign-in and account screen is built from the same parts and
// checked by measure.mjs, centring-pages.mjs and the lasting design check.
//
// For each screen the same parts are read on both, in the same way: the
// crosshair's size and its distance from the top of the screen, each part's
// place measured from the title's top and from the column's left edge, its
// size, and the type (the title's and the code's digits' size, THE CLARITY
// PORTAL's size and spacing, and its distance from the foot). Any
// difference over 2px fails, with the parts listed. (The example's page sits
// under its own 44px bar, so its screen is measured from its section, and
// its height is the section's: the form is in the middle of what is left.)
// Until polish 1 this compared every screen with M26 seq 7 to half a pixel.
//
//   APP_URL=http://localhost:<vite> LOCAL_SUPABASE_URL=http://localhost:<db> node --import ./tests/scores/register.mjs tests/signin/compare.mjs [folder for screenshots]
//   ONLY=signin,coach-code  MODES=dark  SIZES=1280  narrow a run.
//
// No real email is sent and Google's own page is never opened (shared.mjs).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SAM, guard, makeChecks, sleep, testEnv } from './shared.mjs';
import { SCREENS } from './screens.mjs';

export const EXAMPLE = process.env.EXAMPLE || join(homedir(), 'Downloads', 'clarity-phase-6a', 'example-pages-25nov.html');
const env = testEnv();
const out = process.argv[2] || null;
if (out) mkdirSync(out, { recursive: true });
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const MODES = (process.env.MODES || 'dark,light').split(',');
const SIZES = (process.env.SIZES || '1280,390').split(',').map(Number);
const TOLERANCE = 2;
const { pass, done } = makeChecks();

// The parts of one screen, read in the page: each from the title's top and
// the column's left edge. `sel` names each part on that page.
function readScreen(sel) {
  const q = (s) => (s ? [...document.querySelectorAll(s)].find((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; }) : null);
  const box = (el) => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, bottom: b.bottom }; };
  const screen = box(q(sel.screen));
  const title = box(q(sel.title));
  const col = box(q(sel.col));
  const parts = {};
  for (const [name, s] of Object.entries(sel.parts)) {
    const el = q(s);
    if (!el) continue;
    const b = box(el);
    parts[name] = { top: +(b.y - title.y).toFixed(2), left: +(b.x - col.x).toFixed(2), width: +b.w.toFixed(2), height: +b.h.toFixed(2) };
  }
  const mark = box(q(sel.mark));
  const foot = q(sel.foot);
  const fs = foot ? getComputedStyle(foot) : null;
  const ttl = getComputedStyle(q(sel.title));
  const digit = sel.digit ? q(sel.digit) : null;
  return {
    parts,
    mark: { size: +mark.w.toFixed(2), top: +(mark.y - screen.y).toFixed(2), middle: +(mark.x + mark.w / 2 - (screen.x + screen.w / 2)).toFixed(2) },
    title: { size: parseFloat(ttl.fontSize), font: ttl.fontFamily.split(',')[0].replace(/"/g, ''), middle: +(title.x + title.w / 2 - (col.x + col.w / 2)).toFixed(2) },
    foot: fs ? { size: parseFloat(fs.fontSize), spacing: parseFloat(fs.letterSpacing), fromBottom: +(screen.bottom - box(foot).bottom).toFixed(2), font: fs.fontFamily.split(',')[0].replace(/"/g, '') } : null,
    digit: digit ? parseFloat(getComputedStyle(digit).fontSize) : null,
    colWidth: +col.w.toFixed(2),
  };
}

const EX = {
  signin: { screen: '[data-page=signin]', col: '#f-signin', title: '#f-signin h1', mark: '[data-page=signin] .mk.big', foot: '[data-page=signin] .foot',
    parts: { email: '#em', password: '#pw', button: '#go-code', or: '#f-signin .or', google: '#f-signin .ghost.big', g: '#f-signin .gg', forgot: '#f-signin .lk' } },
  'coach-code': { screen: '[data-page=signin]', col: '#f-code', title: '#f-code h1', mark: '[data-page=signin] .mk.big', foot: '[data-page=signin] .foot', digit: '#code input',
    parts: { line: '#f-code p.sm', square1: '#code input:nth-child(1)', square2: '#code input:nth-child(2)', square6: '#code input:nth-child(6)', lost: '#f-code .lk' } },
};
const APP_SEL = {
  signin: { screen: '.si-root', col: '.si-col', title: '.si-ttl', mark: '.si-mark svg', foot: '.si-brand',
    parts: { email: '.si-field:nth-of-type(1) .si-inp', password: '.si-pw .si-inp', button: '.si-btn', or: '.si-or', google: '.si-google', g: '.si-g', forgot: '.si-alt' } },
  'coach-code': { screen: '.si-root', col: '.si-col', title: '.si-ttl', mark: '.si-mark svg', foot: '.si-brand', digit: '.si-code-sq',
    parts: { line: '.si-p', square1: '.si-code-sq:nth-child(1)', square2: '.si-code-sq:nth-child(2)', square6: '.si-code-sq:nth-child(6)', lost: '.si-alt' } },
};
// Where the build differs from the example on purpose, and why.
const MEANT = {
  // Kept from M26 (sign-in rule 13: "Password boxes say Show") and rule 7: "New here? Create my account" stays under
  // Forgotten your password on the clients' page; the example draws neither. They add no part the example measures.
};

async function exampleScreen(browser, key, width, mode) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 700 ? 844 : 800 }, colorScheme: mode });
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(EXAMPLE).href);
  await page.evaluate(([phone, theme, code]) => {
    document.body.classList.remove('light', 'dark');
    document.body.classList.add(theme);
    document.body.classList.toggle('phone', phone);
    window.dispatchEvent(new Event('resize'));
    if (code) { document.querySelector('#f-signin').hidden = true; document.querySelector('#f-code').hidden = false; }
  }, [width < 700, mode, key === 'coach-code']);
  await page.evaluate(() => document.fonts.ready);
  await sleep(200);
  const found = await page.evaluate(readScreen, EX[key]);
  if (out) await page.screenshot({ path: `${out}/example.${key}.${width}.${mode}.png` });
  await ctx.close();
  return found;
}

const browser = await chromium.launch();
const table = [];
for (const mode of MODES) {
  for (const width of SIZES) {
    const phone = width < 700;
    for (const screen of SCREENS.filter((s) => s.key in APP_SEL)) {
      if (ONLY && !ONLY.includes(screen.key)) continue;
      const tag = `${screen.name}, ${width}px ${mode}`;
      const want = await exampleScreen(browser, screen.key, width, mode);
      const answers = {};
      const ctx = await browser.newContext({ viewport: { width, height: phone ? 844 : 800 }, colorScheme: mode, locale: 'en-GB', timezoneId: 'Europe/London', hasTouch: phone, isMobile: phone });
      await ctx.addInitScript((m) => { try { localStorage.setItem('clarity-colour-mode', m); } catch { /* the device's mode */ } }, mode);
      await guard(ctx, [], answers);
      const page = await ctx.newPage();
      try {
        await screen.open(page, { env, answers, SAM, phone, ctx });
        await page.waitForSelector(APP_SEL[screen.key].title, { timeout: 20000 });
        await page.evaluate(() => document.fonts.ready);
        await page.mouse.move(1, 1);
        await page.evaluate(() => document.activeElement?.blur?.());
        await sleep(400);
      } catch (e) {
        pass(`${tag}: opens`, false, e.message.split('\n')[0]);
        await ctx.close();
        continue;
      }
      const got = await page.evaluate(readScreen, APP_SEL[screen.key]);
      if (out) await page.screenshot({ path: `${out}/built.${screen.key}.${width}.${mode}.png` });
      await ctx.close();

      const off = [];
      const near = (a, b) => Math.abs(a - b) <= TOLERANCE;
      for (const [name, w] of Object.entries(want.parts)) {
        const g = got.parts[name];
        if (!g) { off.push(`${name} missing`); continue; }
        for (const k of ['top', 'left', 'width', 'height']) if (!near(g[k], w[k])) off.push(`${name} ${k} ${g[k]} (example ${w[k]})`);
        table.push(`${tag}: ${name} top ${g.top} (${w.top}), left ${g.left} (${w.left}), ${g.width} by ${g.height} (${w.width} by ${w.height})`);
      }
      pass(`${tag}: every part sits where the example puts it, within ${TOLERANCE}px`, off.length === 0, off.join('; '));
      // The crosshair 11% of the screen down (at least 80px), on its middle; the example's screen is its section.
      const wantTop = Math.max(80, 0.11 * (phone ? 844 : 800));
      pass(`${tag}: the crosshair is ${want.mark.size}px, ${wantTop.toFixed(1)}px down, on the middle`, near(got.mark.size, want.mark.size) && Math.abs(got.mark.top - wantTop) <= 0.5 && Math.abs(got.mark.middle) <= 0.5, JSON.stringify({ got: got.mark, example: want.mark }));
      pass(`${tag}: the title in ${want.title.font} at ${want.title.size}px, centred`, got.title.size === want.title.size && got.title.font === want.title.font && Math.abs(got.title.middle) <= 0.5, JSON.stringify({ got: got.title, example: want.title }));
      pass(`${tag}: THE CLARITY PORTAL at the foot: ${want.foot.font} ${want.foot.size}px, spaced ${want.foot.spacing}px, ${want.foot.fromBottom}px from the bottom`, got.foot && got.foot.size === want.foot.size && near(got.foot.spacing, want.foot.spacing) && got.foot.font === want.foot.font && near(got.foot.fromBottom, want.foot.fromBottom), JSON.stringify({ got: got.foot, example: want.foot }));
      pass(`${tag}: the column is the example’s width`, near(got.colWidth, want.colWidth), `${got.colWidth} (example ${want.colWidth})`);
      if (want.digit) pass(`${tag}: the code’s digits are ${want.digit}px`, got.digit === want.digit, `${got.digit}`);
    }
  }
}
await browser.close();
console.log('\nSIDE BY SIDE (built, then the example in brackets; px from the title’s top and the column’s left edge)');
for (const line of table) console.log(`  ${line}`);
if (Object.keys(MEANT).length) console.log(MEANT);
done();
