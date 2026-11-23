// The coach authenticator's screens (Phase 6a run 5; M26 seq 7, from "Coach
// sign in, authenticator code" to "Tim resets an associate's
// authenticator"; the run's prompt wins over M26), in the running app.
//
// Part 1, the screens: Enter your code, Set up your authenticator, Save your
// recovery codes, Lost your authenticator app?, You're in (after a recovery
// code, and the 2-or-fewer line after a sign-in), and My Account's Sign-in
// security, at 1440, 768 and 400 wide, dark and light: M26's words in M26's
// order, the spacing rule measured (tests/signin/spacing.mjs), 44px tap
// areas and none overlapping, every outlined edge 3 to 1, no sideways
// scroll, no console errors. The QR code is read back with jsQR from the
// screenshot (dark and light) and must give the key typed under it.
// Part 2, the flows (1440 dark; the first one at 400 light too).
// Part 3, the owner's Reset authenticator on the Coaches page, as the real
// test coach (read-only sign-in), with 049 to 053 and the server stood in.
//
// Parts 1 and 2 never reach the test project: the coach's sign-in,
// Supabase's MFA calls, 053's functions and the server's reset are all
// stood in (coachWorld.mjs). No real authenticator is ever enrolled and no
// email is sent. No key, code or token is printed.
//
//   APP_URL=http://localhost:4317 node --import ./tests/scores/register.mjs tests/signin/coach-auth.mjs [shots folder]
//   PARTS=screens,flows,reset  SIZES=1440,768,400  MODES=dark,light  narrow a run.
//   TEXT=2 opens every screen at twice the device's text size (the pictures
//   then end ".text2"); ONLY=auth-in,low-codes keeps the screens whose key or
//   picture name starts so.
//
// The UI tester (run 5) added: the QR read with jsQR's dontInvert in both
// modes (dark dots on the light page colour's own square, with nothing round
// it), every line of text at 4.5 to 1 (3 to 1 at 24px or 18.5px bold), the
// count on You're in at 9, 2, 1 and 0, the 2-or-fewer line at 2, 1 and 0,
// the wait after 5 wrong codes, both of Sign-in security's current-code
// steps, a picture of each offline line, and the owner's Reset at every
// size and mode.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { APP, MOCKUP, makeChecks, sleep } from './shared.mjs';
import { coachWorld, M26_CODES, M26_KEY } from './coachWorld.mjs';
import { ruleProblems, spacingRule } from './spacing.mjs';
import { centredGroups, centringProblems } from './centring.mjs';
import { overlappingTaps } from '../phase5/taps.mjs';
import { outlinedEdges } from '../phase5/edges.mjs';
import { COACH_AUTH_WORDS, lowCodesLine, makeNewCodesLine, usedCodeLine } from '../../src/lib/signIn/coachAuth.js';

const require = createRequire(import.meta.url);
const JSQR = require.resolve('jsqr/dist/jsQR.js');
const OUT = process.argv[2] || null;
if (OUT) mkdirSync(OUT, { recursive: true });
const PARTS = (process.env.PARTS || 'screens,flows,reset').split(',');
const SIZES = (process.env.SIZES || '1440,768,400').split(',').map(Number);
const MODES = (process.env.MODES || 'dark,light').split(',');
const SCALE = Number(process.env.TEXT || 1);
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const SUFFIX = SCALE !== 1 ? `.text${SCALE}` : '';
const { pass, done } = makeChecks();
const browser = await chromium.launch();
const path = (page) => new URL(page.url()).pathname;
const words = (page, sel = '.si-col') => page.locator(sel).first().innerText().then((t) => t.replace(/\s+/g, ' ').trim()).catch(() => '');
const squash = (t) => String(t).replace(/\s+/g, '').toLowerCase();
const message = (page) => page.locator('.si-err').first().innerText().then((t) => t.replace(/\s+/g, ' ').replace(/^! /, '').trim()).catch(() => '');
const tapButton = (page, name) => page.getByRole('button', { name, exact: true }).click();

async function open(world, { width = 1440, mode = 'dark' } = {}) {
  const phone = width < 700;
  const ctx = await browser.newContext({ viewport: { width, height: phone ? 844 : 1000 }, colorScheme: mode, locale: 'en-GB', timezoneId: 'Europe/London', hasTouch: phone, isMobile: phone, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await ctx.addInitScript((m) => { try { localStorage.setItem('clarity-colour-mode', m); } catch { /* the device's mode */ } }, mode);
  // The device's text-size setting, as a root size (16px is standard), as calm-rules sets it.
  if (SCALE !== 1) await ctx.addInitScript((px) => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = `html{font-size:${px}px !important}`; document.head.appendChild(st); }); }, 16 * SCALE);
  const w = await coachWorld(ctx, world);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 140)); });
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 140)));
  return { ctx, page, world: w, errors };
}

// M26's own words for a screen, in order: each line of its template.
async function m26Lines(key) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1200 } });
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(MOCKUP).href);
  await page.locator(`#scrs .pick button[data-s="${key}"]`).click();
  await sleep(80);
  const lines = await page.evaluate(() => {
    const root = document.querySelector('#dk');
    const out = [];
    for (const el of root.querySelectorAll('h1, .p, label, li, .alt, .btn, .keyrow > span:first-child, .key, .rcact a, .terms span, .back, .sl, .sv, .keep')) {
      const t = (el.matches('.sl') ? el.firstChild.textContent : el.textContent).replace(/\s+/g, ' ').trim();
      if (t) out.push(t);
    }
    return out;
  });
  await ctx.close();
  return lines;
}

// Every tap area 44px (a button's invisible ::after counts), as measure.mjs reads it.
function lowTaps(root) {
  const col = document.querySelector(root);
  const vis = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
  const low = [];
  for (const el of col.querySelectorAll('a[href], button, input, [role=checkbox]')) {
    if (!vis(el)) continue;
    const own = el.getBoundingClientRect();
    const af = getComputedStyle(el, '::after');
    const reach = af.content !== 'none' && af.position === 'absolute' && af.pointerEvents !== 'none' ? { width: parseFloat(af.width) || 0, height: parseFloat(af.height) || 0 } : { width: 0, height: 0 };
    const h = Math.max(own.height, reach.height);
    const w = Math.max(own.width, reach.width);
    const name = `${el.className.toString().split(' ')[0]} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24)}"`;
    if (h < 43.5) low.push(`${name} ${h.toFixed(1)}px high`);
    if (!el.matches('.si-link') && w < 43.5) low.push(`${name} ${w.toFixed(1)}px wide`);
  }
  return low;
}

// The QR code read back from the screen's own pixels (jsQR, in the page),
// with dontInvert only: dark dots on a light square, in both modes, as an
// authenticator app's reader expects. The picture is taken 8px wider than
// the code's square all round, so what sits round it is read too: the
// page's own colour, with no card or edge.
async function readQr(page) {
  const qr = page.locator('.si-qr svg');
  if (!(await qr.count())) return { text: null };
  // In the middle of the screen, so the picture round it is all on screen.
  await qr.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await sleep(400);
  const box = await qr.boundingBox();
  const pad = 8;
  const buf = await page.screenshot({ clip: { x: box.x - pad, y: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 2 } });
  if (process.env.QR_DEBUG) (await import('node:fs')).writeFileSync(process.env.QR_DEBUG, buf);
  const png = buf.toString('base64');
  await page.addScriptTag({ path: JSQR });
  return page.evaluate(async ({ data, pad: p }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const scale = devicePixelRatio;
    const px = ctx.getImageData(0, 0, c.width, c.height);
    const at = (x, y) => { const i = (Math.round(y) * c.width + Math.round(x)) * 4; return [px.data[i], px.data[i + 1], px.data[i + 2]]; };
    const edge = p * scale;
    // The code's own square (its quiet zone's corner) and the page just outside it, on each side.
    const square = at(edge + 2, edge + 2);
    const outside = [at(edge / 2, c.height / 2), at(c.width - edge / 2, c.height / 2), at(c.width / 2, edge / 2), at(c.width / 2, c.height - edge / 2)];
    // Just inside and outside the square's edge: no line drawn round it.
    const rim = [at(edge + 0.5 * scale, c.height / 2), at(edge - 1.5 * scale, c.height / 2)];
    // jsQR can throw on an image with no finder patterns it can use: that is "not read".
    let plain = null;
    try { plain = window.jsQR(px.data, c.width, c.height, { inversionAttempts: 'dontInvert' }); } catch { plain = null; }
    const page = getComputedStyle(document.body).backgroundColor.match(/\d+/g).slice(0, 3).map(Number);
    return { text: plain?.data || null, square, outside, rim, page };
  }, { data: png, pad });
}

// Every line of text in the column at 4.5 to 1 against what it sits on (3 to
// 1 for large text: 24px, or 18.5px bold), its opacity counted. A control
// that can't be pressed yet is exempt (WCAG 1.4.3), as is Google's own button.
function lowText(root) {
  const col = document.querySelector(root);
  if (!col) return ['no column'];
  const parse = (c) => { const m = String(c).match(/[\d.]+/g); if (!m) return null; const [r, g, b, a = 1] = m.map(Number); return [r, g, b, a]; };
  const lin = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const mix = (fg, bg, a) => [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a));
  const behind = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c[3] > 0) { layers.push(c); if (c[3] >= 0.99) break; } }
    let bg = parse(getComputedStyle(document.body).backgroundColor) || [0, 0, 0, 1];
    for (const c of layers.reverse()) bg = [...mix(c, bg, c[3]), 1];
    return bg;
  };
  const low = [];
  for (const el of col.querySelectorAll('*')) {
    if (el.closest('svg, .ds-google, :disabled, [aria-disabled="true"]')) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    const b = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    if (!b.width || !b.height || st.visibility === 'hidden') continue;
    let alpha = 1;
    for (let e = el; e; e = e.parentElement) alpha *= Number(getComputedStyle(e).opacity);
    const fg = parse(st.color);
    const bg = behind(el);
    const seen = mix(fg, bg, fg[3] * alpha);
    const [a, z] = [lum(seen), lum(bg)].sort((x, y) => y - x);
    const ratio = (a + 0.05) / (z + 0.05);
    const size = parseFloat(st.fontSize);
    const large = size >= 24 || (size >= 18.5 && Number(st.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5) - 0.01) low.push(`"${el.textContent.trim().slice(0, 28)}" ${ratio.toFixed(2)} to 1`);
  }
  return low;
}

const SCREENS = [
  { key: 'coach-code', name: 'Enter your code', world: { factor: 'verified', aal: 'aal1' }, go: '/coach/sign-in/code' },
  { key: 'auth-setup', name: 'Set up your authenticator', world: { factor: 'none', aal: 'aal1', codesMade: false, codesSaved: false }, go: '/coach/sign-in/set-up', wait: '.si-qr svg' },
  { key: 'auth-codes', name: 'Save your recovery codes', world: { factor: 'verified', aal: 'aal2', codesSaved: false }, go: '/coach/sign-in/recovery-codes', wait: '.si-rc li' },
  { key: 'auth-lost', name: 'Lost your authenticator app', world: { factor: 'verified', aal: 'aal1' }, go: '/coach/sign-in/help', wait: '.si-field' },
  {
    key: 'auth-in',
    name: 'Signed in with a recovery code',
    world: { factor: 'verified', aal: 'aal1' },
    go: '/coach/sign-in/help',
    wait: '.si-field',
    then: async (page) => {
      await page.getByLabel('Recovery code').fill('k7q2-9fmd');
      await tapButton(page, 'Sign in');
      await page.waitForURL(/\/coach\/sign-in\/in$/, { timeout: 15000 });
      await page.getByText('That recovery code is now used.').waitFor({ timeout: 10000 });
    },
    expect: [usedCodeLine(9), COACH_AUTH_WORDS.in.othersEnded],
  },
  { key: 'acct-security', name: 'My Account, sign-in security', acct: true, world: { factor: 'verified', aal: 'aal2', codesLeft: 9 }, go: '/my-account/sign-in-security', wait: '.si-srow' },
  {
    key: 'acct-security',
    name: 'My Account, sign-in security, a current code first (not drawn in M26)',
    shot: 'acct-security-code',
    acct: true,
    world: { factor: 'verified', aal: 'aal2', codesLeft: 9 },
    go: '/my-account/sign-in-security',
    wait: '.si-srow',
    then: async (page) => { await page.getByRole('button', { name: 'Make new codes' }).click(); await page.getByRole('textbox', { name: 'Code', exact: true }).waitFor(); },
  },
  {
    key: 'low-codes',
    name: 'You’re in, 2 codes left (not drawn in M26)',
    noMock: true,
    world: { factor: 'verified', aal: 'aal1', codesLeft: 2 },
    go: '/coach',
    then: async (page, world) => {
      await page.waitForURL(/\/coach\/sign-in\/code$/, { timeout: 15000 });
      await page.getByRole('textbox', { name: 'Code', exact: true }).fill(world.goodCode);
      await tapButton(page, 'Sign in');
      await page.waitForURL(/\/coach\/sign-in\/in$/, { timeout: 15000 });
      await page.getByText('recovery codes left').waitFor({ timeout: 10000 });
    },
    expect: [lowCodesLine(2)],
  },
  // The wait after 5 wrong codes in a row (the prompt's words; M26 draws none).
  {
    key: 'coach-code',
    name: 'Enter your code, after 5 wrong codes (not drawn in M26)',
    shot: 'coach-code-wait',
    noMock: true,
    world: { factor: 'verified', aal: 'aal1' },
    go: '/coach/sign-in/code',
    then: async (page) => {
      for (let i = 1; i <= 5; i += 1) {
        await page.getByRole('textbox', { name: 'Code', exact: true }).fill(`00000${i}`);
        await tapButton(page, 'Sign in');
        await sleep(350);
      }
      await page.getByText('That was 5 wrong codes in a row.').waitFor({ timeout: 10000 });
    },
    expect: ['That was 5 wrong codes in a row.', 'Wait 30 seconds, then try again.'],
  },
  // You're in at 2, 1 and 0 left (M26 draws 9).
  ...[2, 1, 0].map((n) => ({
    key: 'auth-in',
    name: `Signed in with a recovery code, ${n} left (M26 draws 9)`,
    shot: `auth-in-${n}`,
    noMock: true,
    world: { factor: 'verified', aal: 'aal1', codesLeft: n + 1 },
    go: '/coach/sign-in/help',
    wait: '.si-field',
    then: async (page, world) => {
      await page.getByLabel('Recovery code').fill(world.codes.find((c) => !c.used).code);
      await tapButton(page, 'Sign in');
      await page.waitForURL(/\/coach\/sign-in\/in$/, { timeout: 15000 });
      await page.getByText('That recovery code is now used.').waitFor({ timeout: 10000 });
    },
    expect: [usedCodeLine(n), COACH_AUTH_WORDS.in.othersEnded, makeNewCodesLine(n)].filter(Boolean),
  })),
  // The 2-or-fewer line after a code sign-in, at 1 and 0 too.
  ...[1, 0].map((n) => ({
    key: 'low-codes',
    name: `You’re in, ${n} codes left (not drawn in M26)`,
    shot: `low-codes-${n}`,
    noMock: true,
    world: { factor: 'verified', aal: 'aal1', codesLeft: n },
    go: '/coach',
    then: async (page, world) => {
      await page.waitForURL(/\/coach\/sign-in\/code$/, { timeout: 15000 });
      await page.getByRole('textbox', { name: 'Code', exact: true }).fill(world.goodCode);
      await tapButton(page, 'Sign in');
      await page.waitForURL(/\/coach\/sign-in\/in$/, { timeout: 15000 });
      await page.getByText('Make new codes in My Account').waitFor({ timeout: 10000 });
    },
    expect: [lowCodesLine(n)],
  })),
  // Sign-in security's other current-code step: Set up on a new phone.
  {
    key: 'acct-security',
    name: 'My Account, sign-in security, a current code before a new phone (not drawn in M26)',
    shot: 'acct-security-phone',
    noMock: true,
    acct: true,
    world: { factor: 'verified', aal: 'aal2', codesLeft: 9 },
    go: '/my-account/sign-in-security',
    wait: '.si-srow',
    then: async (page) => { await page.getByRole('button', { name: 'Set up on a new phone' }).click(); await page.getByRole('textbox', { name: 'Code', exact: true }).waitFor(); },
  },
];

// ---------------------------------------------------------------- part 1: the screens
if (PARTS.includes('screens')) {
  const mock = {};
  for (const s of SCREENS) if (!s.noMock) mock[s.key] = await m26Lines(s.key);
  for (const mode of MODES) {
    for (const width of SIZES) {
      for (const s of SCREENS) {
        if (ONLY && !ONLY.some((o) => (s.shot || s.key).startsWith(o))) continue;
        const tag = `${s.name}, ${width} ${mode}${SCALE !== 1 ? `, text ×${SCALE}` : ''}`;
        const { ctx, page, world, errors } = await open(s.world, { width, mode });
        try {
          await page.goto(`${APP}${s.go}`);
          await page.waitForSelector(s.wait || '.si-col .si-btn', { timeout: 20000 });
          if (s.then) await s.then(page, world);
          await page.evaluate(() => document.fonts.ready);
          await page.mouse.move(1, 1);
          await page.evaluate(() => document.activeElement?.blur?.());
          await sleep(400);
        } catch (e) {
          pass(`${tag}: opens`, false, `${path(page)} ${e.message.split('\n')[0]}`);
          await ctx.close();
          continue;
        }
        const root = s.acct ? '.si-col--account' : '.si-col';
        if (OUT) await page.screenshot({ path: `${OUT}/${s.shot || s.key}.${width}.${mode}${SUFFIX}.png`, fullPage: true });
        if (s.expect) {
          const built = squash(await words(page, root));
          const missing = s.expect.filter((line) => !built.includes(squash(line)));
          pass(`${tag}: says “${s.expect.join(' ')}”`, missing.length === 0, missing.join(' | '));
        }
        const dim = await page.evaluate(lowText, root);
        pass(`${tag}: every line of text reaches 4.5 to 1 (3 to 1 when large)`, dim.length === 0, dim.slice(0, 4).join('; '));

        // M26's words, in M26's order (the prompt's words where they differ).
        if (mock[s.key] && !s.noMock) {
          const built = squash(await words(page, root));
          let at = 0;
          const missing = [];
          for (const line of mock[s.key]) {
            const want = squash(line.replace(/‑/g, '-'));
            const found = built.indexOf(want, at);
            if (found < 0) missing.push(want); else at = found + want.length;
          }
          pass(`${tag}: M26’s words, in M26’s order`, missing.length === 0, missing.slice(0, 3).join(' | '));
        }
        // The spacing rule, from the page's own boxes.
        const rule = await page.evaluate(spacingRule, root);
        // Sign-in security at rest is rows and one line, which the rule doesn't name.
        pass(`${tag}: the spacing rule (12, 12, 24, 18, 18; lines at 1.55)`, ruleProblems(rule).length === 0 && (rule.gaps.length > 0 || (s.acct && !s.then)), `${ruleProblems(rule).join('; ')} (${rule.gaps.length} gaps read)`);
        const low = await page.evaluate(lowTaps, root);
        pass(`${tag}: every tap area is 44px`, low.length === 0, low.slice(0, 4).join('; '));
        const shared = await page.evaluate(overlappingTaps);
        pass(`${tag}: no two tap areas overlap`, shared.length === 0, shared.slice(0, 3).join('; '));
        const edges = await page.evaluate(outlinedEdges);
        pass(`${tag}: every outlined edge reaches 3 to 1`, edges.length === 0, edges.slice(0, 3).join('; '));
        const sideways = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        pass(`${tag}: no sideways scroll`, sideways <= 0, `${sideways}px`);
        // One alignment per page, each row centred as a group, boxes even inside (sign-in rule 49).
        const centring = await page.evaluate(centredGroups, { root: s.acct ? '.si-col--account' : '.si-col' });
        const offCentre = centringProblems(centring);
        pass(`${tag}: each row ${centring.align === 'centre' ? 'centred as a group' : 'on the column’s left edge'}, and boxes even inside`, offCentre.length === 0, offCentre.slice(0, 4).join('; '));
        // A wrong code is Supabase's own 422, which the browser notes as a resource that didn't load.
        const own = errors.filter((e) => !(s.shot === 'coach-code-wait' && /status of 422/.test(e)));
        pass(`${tag}: no console errors`, own.length === 0, own.slice(0, 2).join(' | '));
        pass(`${tag}: nothing reached anywhere but the stand-ins`, !world.calls.some((c) => c.startsWith('blocked')), world.calls.filter((c) => c.startsWith('blocked')).join(', '));

        if (s.key === 'auth-setup') {
          const qr = await readQr(page);
          const shownKey = (await page.locator('.si-key').innerText()).replace(/\s+/g, '');
          const secret = qr.text ? new URL(qr.text.replace('otpauth://', 'https://')).searchParams.get('secret') : null;
          // The app shows "The Clarity Portal" whatever address this is (Tim, 23 Nov): the stand-in names
          // the code after the page's own host unless the page asks for the issuer, as Supabase does.
          const qrUrl = qr.text ? new URL(qr.text.replace('otpauth://', 'https://')) : null;
          const label = qrUrl ? decodeURIComponent(qrUrl.pathname.replace(/^\//, '')) : '';
          pass(`${tag}: the QR code names The Clarity Portal and the coach’s email, on ${new URL(APP).host}`, Boolean(qrUrl) && qrUrl.searchParams.get('issuer') === 'The Clarity Portal' && label === `The Clarity Portal:${world.user.email}` && world.issuerAsked === 'The Clarity Portal' && !qr.text.includes(new URL(APP).hostname), qrUrl ? `issuer "${qrUrl.searchParams.get('issuer')}", label "${label}", asked "${world.issuerAsked}"` : 'not read');
          pass(`${tag}: the QR code reads back as the typed key, with jsQR’s dontInvert`, Boolean(qr.text) && secret === shownKey && shownKey === M26_KEY, qr.text ? 'read, but not the same key' : 'not read');
          const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 3);
          // The light page colour (#F9F8F5) under the dots in both modes; round it, the page itself, with no card or edge.
          pass(`${tag}: the code alone sits on a square of the light page colour, with nothing round it`, near(qr.square, [249, 248, 245]) && qr.outside.every((c) => near(c, qr.page)) && near(qr.rim[0], [249, 248, 245]) && near(qr.rim[1], qr.page), JSON.stringify({ square: qr.square, outside: qr.outside, rim: qr.rim, page: qr.page }));
          pass(`${tag}: the key is shown in groups of four`, /^([A-Z2-7]{4} )+[A-Z2-7]{1,4}$/.test((await page.locator('.si-key').innerText()).trim()));
          const appRows = await page.locator('.si-apps .si-link').evaluateAll((els) => els.map((el) => { const b = el.getBoundingClientRect(); return { top: Math.round(b.top), h: b.height, href: el.getAttribute('href') }; }));
          pass(`${tag}: the three apps are links, each in its own 44px row`, appRows.length === 3 && appRows.every((r) => r.h >= 44 && /^https:\/\//.test(r.href)) && new Set(appRows.map((r) => r.top)).size === 3, JSON.stringify(appRows));
          pass(`${tag}: Supabase’s own picture (with its white box) is never used`, (await page.locator('img[src^="data:image/svg"]').count()) === 0);
        }
        if (s.key === 'auth-codes') {
          const codes = await page.locator('.si-rc li').allInnerTexts();
          pass(`${tag}: 10 codes, two to a row`, codes.length === 10 && codes.join(',') === M26_CODES.map((c) => `${c.slice(0, 4)}-${c.slice(4)}`).join(','), codes.join(','));
          const cols = await page.locator('.si-rc li').evaluateAll((els) => new Set(els.map((el) => Math.round(el.getBoundingClientRect().left))).size);
          pass(`${tag}: in two columns`, cols === 2, `${cols}`);
          const btn = page.getByRole('button', { name: 'Open the coach portal' });
          pass(`${tag}: Open the coach portal is unavailable until the box is ticked`, await btn.isDisabled());
        }
        await ctx.close();
      }
    }
  }
}

// ---------------------------------------------------------------- part 2: the flows
async function signInAsMaya(page) {
  await page.goto(`${APP}/coach/sign-in`);
  await page.waitForSelector('.si-col .ds-google');
  await page.locator('input[type=email]').fill('maya.collins@harbourlane.co');
  await page.locator('.si-pw input').fill('lighthouse-keeper-77');
  await tapButton(page, 'Sign in');
}

if (PARTS.includes('flows')) {
  // A new associate's first sign-in: set-up, then codes, then the coach portal.
  for (const [width, mode] of [[1440, 'dark'], [400, 'light']]) {
    const tag = `First sign-in, ${width} ${mode}`;
    const { ctx, page, world, errors } = await open({ signedOut: true, factor: 'none', codesMade: false, codesSaved: false }, { width, mode });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: APP });
    await signInAsMaya(page);
    await page.waitForURL(/\/coach\/sign-in\/set-up$/, { timeout: 20000 }).catch(() => null);
    pass(`${tag}: a coach with no authenticator is taken to set it up after the password`, path(page) === '/coach/sign-in/set-up', path(page));
    await page.waitForSelector('.si-qr svg', { timeout: 15000 }).catch(() => null);
    pass(`${tag}: the key and QR come from Supabase’s own enrolment, once`, world.enrolled === 1, `${world.enrolled}`);
    // The coach portal can't be reached before it's done.
    await page.goto(`${APP}/coach`);
    await page.waitForURL(/\/coach\/sign-in\/set-up$/, { timeout: 20000 }).catch(() => null);
    pass(`${tag}: typing the coach portal’s address returns to set-up`, path(page) === '/coach/sign-in/set-up', path(page));
    await page.waitForSelector('.si-qr svg', { timeout: 15000 }).catch(() => null);
    // Copy the key: "Copied." in the design reference's toast.
    await page.getByRole('button', { name: 'Copy the key' }).click();
    await page.locator('.ds-toast').getByText('Copied.').waitFor({ timeout: 5000 }).catch(() => null);
    pass(`${tag}: the copy icon says “Copied.” in the shared toast`, await page.locator('.ds-toast').getByText('Copied.').isVisible().catch(() => false));
    const copied = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    // Each enrolment has its own key (coming back to set-up made a new one, as Supabase does).
    const shownKey = (await page.locator('.si-key').innerText().catch(() => '')).replace(/\s+/g, '');
    pass(`${tag}: and copies the key as typed into an app (no spaces)`, Boolean(copied) && copied === shownKey && /^[A-Z2-7]+$/.test(copied));
    // A wrong code, then the right one.
    await page.getByRole('textbox', { name: 'Code', exact: true }).fill('111111');
    await tapButton(page, 'Turn it on');
    await page.waitForSelector('.si-err', { timeout: 10000 }).catch(() => null);
    pass(`${tag}: a wrong code: “That code didn’t work. Check the time on your phone and try again.”`, (await message(page)) === 'That code didn’t work. Check the time on your phone and try again.', await message(page));
    await page.getByRole('textbox', { name: 'Code', exact: true }).fill(world.goodCode);
    await tapButton(page, 'Turn it on');
    await page.waitForURL(/\/coach\/sign-in\/recovery-codes$/, { timeout: 20000 }).catch(() => null);
    pass(`${tag}: Turn it on leads to Save your recovery codes`, path(page) === '/coach/sign-in/recovery-codes', path(page));
    await page.waitForSelector('.si-rc li', { timeout: 15000 }).catch(() => null);
    pass(`${tag}: “On since” is recorded`, Boolean(world.turnedOnAt));
    // Typing the coach portal's address doesn't skip the codes: a new set is made (the old one was never saved).
    await page.goto(`${APP}/coach`);
    await page.waitForURL(/\/coach\/sign-in\/recovery-codes$/, { timeout: 20000 }).catch(() => null);
    await page.waitForSelector('.si-rc li', { timeout: 15000 }).catch(() => null);
    pass(`${tag}: typing /coach before the box is ticked returns to the codes`, path(page) === '/coach/sign-in/recovery-codes', path(page));
    pass(`${tag}: and, with no codes in memory, a new set replaces the unsaved one`, world.madeSets === 2, `${world.madeSets} sets made`);
    // Download: a plain text file named in words.
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }).catch(() => null), page.getByRole('button', { name: 'Download' }).click()]);
    pass(`${tag}: Download gives a plain text file named in words`, /^The Clarity Portal recovery codes, \d{1,2} [A-Z][a-z]{2} \d{4}\.txt$/.test(download?.suggestedFilename() || ''), download?.suggestedFilename());
    await page.getByRole('button', { name: 'Copy the codes' }).click();
    const codesCopied = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    pass(`${tag}: the copy icon copies the ten codes`, codesCopied.split('\n').length === 10);
    // Back returns to set-up, and the same codes come back after.
    await page.getByRole('link', { name: 'Back' }).click();
    await page.waitForURL(/\/coach\/sign-in\/set-up$/, { timeout: 15000 }).catch(() => null);
    pass(`${tag}: Back returns to set-up`, path(page) === '/coach/sign-in/set-up', path(page));
    await page.waitForSelector('.si-qr svg', { timeout: 15000 }).catch(() => null);
    await page.getByRole('textbox', { name: 'Code', exact: true }).fill(world.goodCode);
    await tapButton(page, 'Turn it on');
    await page.waitForURL(/\/coach\/sign-in\/recovery-codes$/, { timeout: 20000 }).catch(() => null);
    await page.waitForSelector('.si-rc li', { timeout: 15000 }).catch(() => null);
    pass(`${tag}: set up again, the same codes show (none made again) and one authenticator is left`, world.madeSets === 2 && world.factors.filter((f) => f.status === 'verified').length === 1, `${world.madeSets} sets, ${world.factors.length} factors`);
    // The tick, then in.
    await page.getByRole('checkbox', { name: 'I’ve saved them somewhere safe' }).click();
    pass(`${tag}: ticked, Open the coach portal can be pressed`, await page.getByRole('button', { name: 'Open the coach portal' }).isEnabled());
    await tapButton(page, 'Open the coach portal');
    await page.waitForURL(/\/coach$/, { timeout: 20000 }).catch(() => null);
    pass(`${tag}: Open the coach portal opens it`, path(page) === '/coach' && world.codesSaved, path(page));
    pass(`${tag}: no console errors`, errors.filter((e) => !/Failed to load resource/.test(e)).length === 0, errors.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // A second computer: the password, then the 6-digit code.
  {
    const { ctx, page, world } = await open({ signedOut: true, factor: 'verified' });
    await signInAsMaya(page);
    await page.waitForURL(/\/coach\/sign-in\/code$/, { timeout: 20000 }).catch(() => null);
    pass('Second computer: the code follows the password', path(page) === '/coach/sign-in/code', path(page));
    const lines = await words(page);
    pass('Second computer: “You’re only asked on a new phone or computer.”', lines.includes('You’re only asked on a new phone or computer.'), lines.slice(0, 160));
    // Five wrong codes in a row: a calm wait, and even the right code waits.
    for (let i = 1; i <= 5; i += 1) {
      await page.getByRole('textbox', { name: 'Code', exact: true }).fill(`00000${i}`);
      await tapButton(page, 'Sign in');
      await sleep(400);
    }
    pass('Second computer: after 5 wrong codes: “That was 5 wrong codes in a row. Wait 30 seconds, then try again.”', (await message(page)) === 'That was 5 wrong codes in a row. Wait 30 seconds, then try again.', await message(page));
    await page.getByRole('textbox', { name: 'Code', exact: true }).fill(world.goodCode);
    await tapButton(page, 'Sign in');
    await sleep(400);
    pass('Second computer: during the wait even the right code waits, said calmly', /^Wait \d+ seconds?, then try again\.$/.test(await message(page)) && path(page) === '/coach/sign-in/code', await message(page));
    // The wait is over (the device's count is moved on, as 30 seconds would; kept on the device since the break-it tester, 21 Nov).
    await page.evaluate(() => localStorage.removeItem('clarity-sign-in-code-tries'));
    await page.getByRole('textbox', { name: 'Code', exact: true }).fill(world.goodCode);
    await tapButton(page, 'Sign in');
    await page.waitForURL(/\/coach$/, { timeout: 20000 }).catch(() => null);
    pass('Second computer: the right code opens the coach portal', path(page) === '/coach', path(page));
    await ctx.close();
  }

  // Lost the phone: a recovery code, You're in, then set up the new phone.
  {
    const { ctx, page, world } = await open({ signedOut: true, factor: 'verified' });
    await signInAsMaya(page);
    await page.waitForURL(/\/coach\/sign-in\/code$/, { timeout: 20000 }).catch(() => null);
    await page.getByRole('link', { name: 'Lost your authenticator app?' }).click();
    await page.waitForURL(/\/coach\/sign-in\/help$/, { timeout: 15000 }).catch(() => null);
    await page.getByRole('textbox', { name: 'Recovery code' }).waitFor({ timeout: 15000 }).catch(() => null);
    const lost = await words(page);
    pass('Lost phone: the line names the owner from the data, with the video call', lost.includes('Lost your codes too? Ask Tim to reset your authenticator. Tim checks it’s you on a video call first.'), lost.slice(-160));
    pass('Lost phone: nothing offers email', !/email/i.test(lost));
    await page.getByLabel('Recovery code').fill('zzzz-zzzz');
    await tapButton(page, 'Sign in');
    await page.waitForSelector('.si-err', { timeout: 10000 }).catch(() => null);
    pass('Lost phone: a wrong code says so, and not which part', (await message(page)) === 'That recovery code didn’t work. Check it and try again, or use another one.', await message(page));
    await page.getByLabel('Recovery code').fill('K7Q2 9FMD');
    await tapButton(page, 'Sign in');
    await page.waitForURL(/\/coach\/sign-in\/in$/, { timeout: 15000 }).catch(() => null);
    const inWords = await words(page);
    pass('Lost phone: You’re in: “That recovery code is now used. You have 9 left.”', inWords.includes('That recovery code is now used. You have 9 left.'), inWords.slice(0, 200));
    pass('Lost phone: You’re in: “Your other sign-ins have ended.”', inWords.includes('Your other sign-ins have ended.'), inWords.slice(0, 200));
    pass('Lost phone: the server is asked to take the lost phone off (nothing changes off the live site)', world.serverRecovered === 1);
    await tapButton(page, 'Set it up');
    await page.waitForURL(/\/coach\/sign-in\/set-up$/, { timeout: 15000 }).catch(() => null);
    await page.waitForSelector('.si-qr svg', { timeout: 15000 }).catch(() => null);
    pass('Lost phone: Set it up opens set-up with a new key', path(page) === '/coach/sign-in/set-up' && world.enrolled === 1, path(page));
    await page.getByRole('textbox', { name: 'Code', exact: true }).fill(world.goodCode);
    await tapButton(page, 'Turn it on');
    await page.waitForURL(/\/coach$/, { timeout: 20000 }).catch(() => null);
    pass('Lost phone: the new phone set up, the coach portal opens (the codes were saved already)', path(page) === '/coach', path(page));
    await ctx.close();
  }

  // The same recovery code twice, and from two tabs.
  {
    const { ctx, page } = await open({ factor: 'verified' });
    const second = await ctx.newPage();
    for (const p of [page, second]) { await p.goto(`${APP}/coach/sign-in/help`); await p.waitForSelector('.si-field', { timeout: 15000 }); await p.getByLabel('Recovery code').fill('x3vp-r8tn'); }
    await Promise.all([tapButton(page, 'Sign in'), tapButton(second, 'Sign in')]);
    await sleep(1500);
    const ends = [path(page), path(second)].sort();
    pass('Two tabs with one recovery code: only one gets in', ends[0] === '/coach/sign-in/help' && ends[1] === '/coach/sign-in/in', ends.join(', '));
    await ctx.close();
  }

  // A sign-in from before the owner's reset is let go.
  {
    const { ctx, page } = await open({ factor: 'verified', aal: 'aal2', sessionOk: false });
    await page.goto(`${APP}/coach`);
    await page.waitForURL(/\/coach\/sign-in$/, { timeout: 20000 }).catch(() => null);
    await page.waitForSelector('.si-err', { timeout: 10000 }).catch(() => null);
    pass('After a reset: an older sign-in is signed out, and told why', path(page) === '/coach/sign-in' && (await message(page)) === 'You’ve been signed out, because your authenticator was reset. Sign in again to set it up.', `${path(page)} ${await message(page)}`);
    const kept = await page.evaluate(() => localStorage.getItem('clarity-portal-auth'));
    pass('After a reset: nothing of that sign-in is left on the device', !kept);
    await ctx.close();
  }

  // My Account: Make new codes, then Set up on a new phone, each after a current code.
  {
    const { ctx, page, world } = await open({ factor: 'verified', aal: 'aal2', codesLeft: 9 });
    await page.goto(`${APP}/my-account/sign-in-security`);
    await page.waitForSelector('.si-srow', { timeout: 20000 });
    await page.getByRole('button', { name: 'Make new codes' }).click();
    await page.getByRole('textbox', { name: 'Code', exact: true }).fill('999999');
    await tapButton(page, 'Carry on');
    await page.waitForSelector('.si-err', { timeout: 10000 }).catch(() => null);
    pass('Make new codes needs a current code: a wrong one is refused', world.madeSets === 0 && /didn’t work/.test(await message(page)), await message(page));
    await page.getByRole('textbox', { name: 'Code', exact: true }).fill(world.goodCode);
    await tapButton(page, 'Carry on');
    await page.waitForURL(/\/coach\/sign-in\/recovery-codes$/, { timeout: 15000 }).catch(() => null);
    await page.waitForSelector('.si-rc li', { timeout: 10000 }).catch(() => null);
    pass('Make new codes: a new set, shown once', world.madeSets === 1 && (await page.locator('.si-rc li').count()) === 10);
    await page.getByRole('checkbox', { name: 'I’ve saved them somewhere safe' }).click();
    await tapButton(page, 'Open the coach portal');
    await page.waitForURL(/\/my-account\/sign-in-security$/, { timeout: 15000 }).catch(() => null);
    await page.getByText('Your new recovery codes are in force.').waitFor({ timeout: 10000 }).catch(() => null);
    pass('Make new codes: back on Sign-in security, “10 of 10 left”', (await words(page, '.si-col--account')).includes('10 of 10 left'), (await words(page, '.si-col--account')).slice(0, 200));
    const old = world.factors.find((f) => f.status === 'verified')?.id;
    await page.getByRole('button', { name: 'Set up on a new phone' }).click();
    await page.getByRole('textbox', { name: 'Code', exact: true }).fill(world.goodCode);
    await tapButton(page, 'Carry on');
    await page.waitForURL(/\/coach\/sign-in\/set-up$/, { timeout: 15000 }).catch(() => null);
    await page.waitForSelector('.si-qr svg', { timeout: 15000 }).catch(() => null);
    await page.getByRole('textbox', { name: 'Code', exact: true }).fill(world.goodCode);
    await tapButton(page, 'Turn it on');
    await page.waitForURL(/\/my-account\/sign-in-security$/, { timeout: 15000 }).catch(() => null);
    const left = world.factors.filter((f) => f.status === 'verified');
    pass('New phone: the new authenticator is on and the old phone’s is taken off', left.length === 1 && left[0].id !== old, `${left.length} on`);
    await page.getByText('Your authenticator is on your new phone.').waitFor({ timeout: 10000 }).catch(() => null);
    pass('New phone: back on Sign-in security, said calmly', await page.getByText('Your authenticator is on your new phone.').isVisible().catch(() => false));
    await ctx.close();
  }

  // Offline: one calm line on each screen (with a picture of each, 1440 and 400, dark and light).
  const OFFLINE_SIZES = [[1440, 'dark'], [400, 'light'], [1440, 'light'], [400, 'dark']];
  for (const [go, setUp, press, line, shot, width, mode] of [
    ['/coach/sign-in/code', { factor: 'verified' }, async (p) => { await p.getByRole('textbox', { name: 'Code', exact: true }).fill('123456'); await tapButton(p, 'Sign in'); }, 'Signing in needs a connection, so try again when you’re back online.', 'coach-code'],
    ['/coach/sign-in/help', { factor: 'verified' }, async (p) => { await p.getByLabel('Recovery code').fill('k7q2-9fmd'); await tapButton(p, 'Sign in'); }, 'Signing in needs a connection, so try again when you’re back online.', 'auth-lost'],
    ['/coach/sign-in/set-up', { factor: 'none', codesMade: false, codesSaved: false }, null, 'Setting up your authenticator needs a connection, so try again when you’re back online.', 'auth-setup'],
    ['/coach/sign-in/recovery-codes', { factor: 'verified', aal: 'aal2', codesSaved: false }, null, 'Making your recovery codes needs a connection, so try again when you’re back online.', 'auth-codes'],
    ['/my-account/sign-in-security', { factor: 'verified', aal: 'aal2', codesLeft: 9 }, async (p) => { await p.getByRole('button', { name: 'Make new codes' }).click(); await p.getByRole('textbox', { name: 'Code', exact: true }).fill('123456'); await tapButton(p, 'Carry on'); }, 'Sign-in security needs a connection, so try again when you’re back online.', 'acct-security'],
  ].flatMap((row) => OFFLINE_SIZES.map(([w, m]) => [...row, w, m]))) {
    const { ctx, page, world, errors } = await open(setUp, { width, mode });
    if (press) {
      await page.goto(`${APP}${go}`);
      await page.waitForSelector('.si-field, .si-srow', { timeout: 15000 });
      world.down = true;
      await ctx.setOffline(true);
      await press(page);
    } else {
      // No answer from anywhere as the screen opens (the app itself still loads).
      world.down = true;
      await page.goto(`${APP}${go}`);
    }
    await page.waitForSelector('.si-err', { timeout: 10000 }).catch(() => null);
    const said = await message(page);
    pass(`Offline on ${go}, ${width} ${mode}: one calm line`, said === line, said);
    const root = go.startsWith('/my-account') ? '.si-col--account' : '.si-col';
    await page.mouse.move(1, 1);
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    pass(`Offline on ${go}, ${width} ${mode}: no sideways scroll`, sideways <= 0, `${sideways}px`);
    const dim = await page.evaluate(lowText, root);
    pass(`Offline on ${go}, ${width} ${mode}: every line of text reaches 4.5 to 1`, dim.length === 0, dim.slice(0, 3).join('; '));
    // AuthContext notes its own profile read that couldn't reach the database (Failed to fetch): that's being offline, not a fault.
    const crash = errors.filter((e) => !/Failed to load resource|net::ERR|Failed to fetch/.test(e));
    pass(`Offline on ${go}, ${width} ${mode}: no page errors`, crash.length === 0, crash.slice(0, 2).join(' | '));
    if (OUT) await page.screenshot({ path: `${OUT}/offline-${shot}.${width}.${mode}${SUFFIX}.png`, fullPage: true });
    await ctx.close();
  }

  // Clients never see any of this.
  {
    const { ctx, page, world } = await open({ role: 'client', factor: 'none', ready: false });
    await page.goto(`${APP}/welcome`);
    await sleep(2500);
    pass('A client with no authenticator opens Home as before', path(page) === '/welcome', path(page));
    pass('A client’s pages never ask about the coach authenticator', !world.calls.some((c) => /coach_auth_state|\/auth\/v1\/factors/.test(c)), world.calls.filter((c) => /coach_|factors/.test(c)).join(', '));
    await page.goto(`${APP}/my-account/sign-in-security`);
    await page.waitForURL(/\/my-account$/, { timeout: 15000 }).catch(() => null);
    pass('Sign-in security is for coaches only', path(page) === '/my-account', path(page));
    await page.goto(`${APP}/coach`);
    await page.waitForURL((u) => !/^\/coach/.test(u.pathname), { timeout: 15000 }).catch(() => null);
    pass('A client opening /coach is sent home, never to set-up', !/sign-in/.test(path(page)) && world.enrolled === 0, path(page));
    await ctx.close();
  }
}

// ---------------------------------------------------------------- part 3: the owner's reset
if (PARTS.includes('reset')) {
  const { coachContext, standIn } = await import('../coach/shared.mjs');
  for (const [width, mode] of MODES.flatMap((m) => SIZES.map((w) => [w, m]))) {
    const tag = `Owner’s reset, ${width} ${mode}${SCALE !== 1 ? `, text ×${SCALE}` : ''}`;
    const ctx = await coachContext(browser, { size: width, theme: mode });
    if (SCALE !== 1) await ctx.addInitScript((px) => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = `html{font-size:${px}px !important}`; document.head.appendChild(st); }); }, 16 * SCALE);
    const page = await ctx.newPage();
    const store = await standIn(page, { role: 'owner', db: 'none' });
    const asked = [];
    // The server's reset, stood in: the checks it makes are A's unit test's; off the live site nothing changes.
    await page.route('**/api/coach-auth-reset', async (route) => {
      const body = route.request().postDataJSON();
      asked.push({ kind: body?.kind, coachId: body?.coachId, bearer: /^Bearer .+/.test(route.request().headers().authorization || '') });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, ran: false, message: 'Resetting an authenticator only works on the live site, so nothing has changed here.' }) });
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 140)));
    await page.goto(`${APP}/coach/settings/coaches`);
    await page.getByRole('button', { name: /^More for / }).first().waitFor({ timeout: 25000 }).catch(() => null);
    const mores = await page.getByRole('button', { name: /^More for / }).count();
    pass(`${tag}: each associate’s row has a More menu, the owner’s own has none`, mores === store.coaches.filter((c) => c.role !== 'owner' && c.active).length && mores >= 1, `${mores}`);
    await sleep(400);
    if (OUT) await page.screenshot({ path: `${OUT}/coaches.${width}.${mode}${SUFFIX}.png` });
    if (mores) {
      await page.getByRole('button', { name: /^More for / }).first().click();
      await page.getByRole('menuitem', { name: 'Reset authenticator' }).click();
      const panel = page.getByRole('dialog', { name: /Reset Maya/i });
      await panel.waitFor({ timeout: 10000 });
      await sleep(400);
      const text = (await panel.innerText()).replace(/\s+/g, ' ');
      pass(`${tag}: “Reset Maya’s authenticator?” with M26’s two lines, Reset it and Keep it`, text.toLowerCase().includes('reset maya’s authenticator?') && text.includes('Only do this after a video call with Maya, to check it’s them.') && text.includes('Their next sign-in asks them to set it up again, and their old recovery codes stop working.') && text.includes('Reset it') && text.includes('Keep it'), text.slice(0, 240));
      if (OUT) await page.screenshot({ path: `${OUT}/acct-reset.${width}.${mode}${SUFFIX}.png` });
      // The panel itself: 44px taps, none shared, edges at 3 to 1, text at 4.5 to 1, no sideways scroll.
      const panelTaps = (await page.evaluate(overlappingTaps)).filter((o) => /Reset it|Keep it|Close/.test(o));
      pass(`${tag}: the panel's taps don't overlap`, panelTaps.length === 0, panelTaps.slice(0, 3).join('; '));
      const small = await page.evaluate(() => {
        const d = document.querySelector('[role=dialog]');
        const out = [];
        for (const el of d.querySelectorAll('button, a[href]')) {
          const b = el.getBoundingClientRect();
          if (!b.width) continue;
          const af = getComputedStyle(el, '::after');
          const h = Math.max(b.height, af.content !== 'none' && af.position === 'absolute' ? parseFloat(af.height) || 0 : 0);
          const w = Math.max(b.width, af.content !== 'none' && af.position === 'absolute' ? parseFloat(af.width) || 0 : 0);
          if (h < 43.5 || w < 43.5) out.push(`"${(el.getAttribute('aria-label') || el.textContent).trim().slice(0, 20)}" ${w.toFixed(0)} by ${h.toFixed(0)}`);
        }
        return out;
      });
      pass(`${tag}: every tap area in the panel is 44px`, small.length === 0, small.join('; '));
      const panelEdges = await page.evaluate(outlinedEdges);
      pass(`${tag}: every outlined edge reaches 3 to 1`, panelEdges.length === 0, panelEdges.slice(0, 3).join('; '));
      const panelText = await page.evaluate(lowText, '[role=dialog]');
      pass(`${tag}: every line of text in the panel reaches 4.5 to 1`, panelText.length === 0, panelText.slice(0, 3).join('; '));
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      pass(`${tag}: no sideways scroll`, wide <= 0, `${wide}px`);
      await page.getByRole('button', { name: 'Keep it' }).click();
      await sleep(500);
      pass(`${tag}: Keep it closes it, and nothing is asked of the server`, asked.length === 0 && !(await page.getByRole('dialog', { name: /Reset Maya/i }).isVisible().catch(() => false)));
      await page.getByRole('button', { name: /^More for / }).first().click();
      await page.getByRole('menuitem', { name: 'Reset authenticator' }).click();
      await page.getByRole('button', { name: 'Reset it' }).click();
      await page.getByText('only works on the live site').waitFor({ timeout: 10000 }).catch(() => null);
      pass(`${tag}: Reset it asks the server once, with the owner’s own sign-in and the coach’s id`, asked.length === 1 && asked[0].kind === 'reset' && asked[0].bearer && asked[0].coachId === store.coaches.find((c) => c.role !== 'owner').id, JSON.stringify(asked.map((a) => ({ kind: a.kind, bearer: a.bearer }))));
      pass(`${tag}: off the live site it says calmly that nothing changed`, await page.getByText('Resetting an authenticator only works on the live site, so nothing has changed here.').isVisible().catch(() => false));
      // Offline: Reset it says one calm line, and asks nothing.
      await page.keyboard.press('Escape');
      await sleep(300);
      await page.getByRole('button', { name: /^More for / }).first().click();
      await page.getByRole('menuitem', { name: 'Reset authenticator' }).click();
      await page.getByRole('dialog', { name: /Reset Maya/i }).waitFor({ timeout: 10000 });
      await ctx.setOffline(true);
      await page.getByRole('button', { name: 'Reset it' }).click();
      const offLine = 'Resetting an authenticator needs a connection, so try again when you’re back online.';
      await page.getByText(offLine).waitFor({ timeout: 10000 }).catch(() => null);
      pass(`${tag}: offline, Reset it says one calm line and asks nothing`, (await page.getByText(offLine).isVisible().catch(() => false)) && asked.length === 1);
      if (OUT) await page.screenshot({ path: `${OUT}/offline-acct-reset.${width}.${mode}${SUFFIX}.png` });
      await ctx.setOffline(false);
    }
    pass(`${tag}: nothing was written to the test project`, !store.calls.some((c) => /^blocked/.test(c)), store.calls.filter((c) => /^blocked/.test(c)).slice(0, 3).join(', '));
    pass(`${tag}: no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
    await ctx.close();
  }
}

await browser.close();
done();
