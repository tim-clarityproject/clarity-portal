// Health Check 5: the Quick guide's player, in the running app.
//
//   node tests/healthcheck/quick-guide.mjs [presses|full|all]   (default presses)
//   APP_URL=http://localhost:5174 (default)  ENGINES=chromium,webkit  SIZES=laptop,phone
//   PRESSES=20  VTT=<captions file> (default the Health Check's own)
//   MOCKUP=<a copy of m7b-v49.html> (layout; default ~/Downloads/clarity-quick-guide/m7b-v49.html)
//
// presses: pause and play, 20 times in a row while the video plays, with the
// Pause/Play button, with a tap (or click) on the picture, and with Space and
// Enter on the focused button, on the welcome card and in the panel from the
// Quick guide icon. Each press must change the state (the button's name and
// the video's paused flag, together) within 100ms of the press being made
// (the pointer, finger or Space lifting, or Enter going down), timed inside
// the page. A press that changes nothing is a lost press.
// It also checks that the button is the same element after every press
// (nothing is rebuilt), that no video is asked for before the guide is opened,
// that the right video plays for the size (the desktop one on a laptop, the
// phone one on a phone) and that nothing plays by itself.
//
// full: each size's video plays right through in real time, with its sound,
// and the caption bar is recorded against the video's own clock. Every
// caption must appear, in order, exactly as the captions file says, within
// 0.5 seconds of its cue time, with no error from the page or the video.
//
// layout: the welcome card's player measured against the mock-up's (version
// 49, its desktop frame and its phone frame, in Chromium): the picture's
// shape, the caption bar, the controls and the Watch this first panel, and
// the caption bar's first line before anything plays. The mock-up's own
// script runs in a browser with everything outside it blocked.
//
// Laptop is 1280 by 800 (a mouse); phone is an iPhone size, 390 by 844, with
// hasTouch and isMobile, so presses are taps. Both run in Chromium and in
// WebKit (Playwright's Safari engine: npx playwright install webkit).
//
// The welcome page needs no database call. The panel is opened from a
// question screen, so the sign-in and save calls are answered here for one
// invented session (as in tests/popups.mjs); anything else that isn't
// localhost is blocked, and every email call (/api/) is answered here and
// counted, so nothing is sent and no live link is used.
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium, webkit } from 'playwright';

const BASE = process.env.APP_URL || 'http://localhost:5174';
const MODE = process.argv[2] || 'presses';
const ENGINES = (process.env.ENGINES || 'chromium,webkit').split(',');
const SIZES = (process.env.SIZES || 'laptop,phone').split(',');
const PRESSES = Number(process.env.PRESSES || 20);
const LIMIT = 100; // ms
const VTT = process.env.VTT || fileURLToPath(new URL('../../src/health-check/media/quick-guide.en-GB.vtt', import.meta.url));
const SIZE = {
  laptop: { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, video: 'quick-guide-desktop' },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, video: 'quick-guide-phone' },
};
const ENGINE = { chromium, webkit };

let failures = 0;
const check = (ok, what) => { if (!ok) failures += 1; console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`); return ok; };

/** The cues of a WebVTT file: [{ start, end, text }]. */
export function readCues(text) {
  const t = (s) => { const p = s.trim().split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; };
  return text.replace(/\r/g, '').split(/\n\n+/).map((b) => b.split('\n')).flatMap((lines) => {
    const i = lines.findIndex((l) => l.includes('-->'));
    if (i < 0) return [];
    const [a, b] = lines[i].split('-->');
    return [{ start: t(a), end: t(b.trim().split(/\s+/)[0]), text: lines.slice(i + 1).join('\n').trim() }];
  });
}

async function open(engine, size) {
  const browser = await ENGINE[engine].launch();
  const s = SIZE[size];
  const ctx = await browser.newContext({ viewport: s.viewport, isMobile: s.isMobile, hasTouch: s.hasTouch, deviceScaleFactor: s.deviceScaleFactor || 1, colorScheme: 'dark' });
  const got = { outside: [], emails: 0, errors: [], media: [] };
  await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)(?!.*supabase\.co)/, (r) => { got.outside.push(new URL(r.request().url()).host); return r.abort(); });
  await ctx.route(/\/api\//, (r) => { got.emails += 1; return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
  const SESSION = { email: 'sam.example@invented.test', code: 'ABC234' };
  await ctx.route(/supabase\.co/, (r) => {
    const url = r.request().url();
    const json = (o) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (url.endsWith('/rpc/alignment_open')) return json({ ok: true, status: 'invited', current_step: null, data: {}, version: 1, updated_at: '2026-10-29 09:30:00.123', completed_at: null, client_label: 'Kestrel Group', coach_name: 'Tim' });
    if (url.endsWith('/rpc/alignment_save')) return json({ ok: true, version: 2, updated_at: '2026-10-29 09:31:00', status: 'in_progress' });
    got.outside.push('supabase (other)');
    return r.abort();
  });
  ctx.session = SESSION;
  // As vercel.json does: /health-check/* is the Health Check's own page.
  await ctx.route(/\/health-check\/[^/.]+$/, async (r) => {
    if (r.request().resourceType() !== 'document') return r.continue();
    return r.fulfill({ response: await r.fetch({ url: `${BASE}/health-check.html` }) });
  });
  const page = await ctx.newPage();
  // (On the dev server a file's ?url import is a small script, not the file itself.)
  page.on('request', (r) => { if (/\.(mp4|vtt|jpg)(\?|$)/.test(r.url()) && !/[?&]url\b/.test(r.url())) got.media.push(r.url().split('/').pop().split('?')[0]); });
  page.on('pageerror', (e) => got.errors.push(`page: ${e.message}`));
  // Left out: the dev server's own socket (blocked here, with its knock-on
  // "Failed to send error to Vite server"), and WebKit's built-in media
  // controls logging icons it doesn't ship ("Button failed to load, iconName").
  page.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|\[vite\]|Vite server|Failed to load resource|^Button failed to load, iconName/.test(m.text())) got.errors.push(`console: ${m.text()}`); });
  await page.goto(`${BASE}/health-check/quickguidetest`);
  await page.locator('.wlc .bigplay').waitFor();
  return { browser, ctx, page, got };
}

/** The picture's state, read the same way every time. */
const readState = (root) => document.querySelector(root).querySelector('.vpc .pb')?.getAttribute('aria-label');

/**
 * Arms the page to time the next press: from the moment the press is made
 * (a pointer or finger lifting, Space lifting, or Enter going down: when a
 * button is pressed) to the button's name and the video's paused flag both
 * changing. The time from the pointer or key going down is kept too; it also
 * holds the test driver's own gap between down and up.
 */
async function arm(page, root) {
  await page.evaluate((root) => {
    const box = document.querySelector(root);
    const v = box.querySelector('video');
    const btn = box.querySelector('.vpc .pb');
    const before = btn.getAttribute('aria-label');
    let down = null; let made = null;
    const onDown = (e) => { if (down === null) down = performance.now(); if (e.type === 'keydown' && e.key === 'Enter') made = performance.now(); };
    const onUp = () => { made = performance.now(); };
    const DOWN = ['pointerdown', 'touchstart', 'mousedown', 'keydown'];
    const UP = ['pointerup', 'touchend', 'mouseup', 'keyup'];
    DOWN.forEach((e) => document.addEventListener(e, onDown, true));
    UP.forEach((e) => document.addEventListener(e, onUp, true));
    window.__press = new Promise((resolve) => {
      const done = (r) => {
        DOWN.forEach((e) => document.removeEventListener(e, onDown, true));
        UP.forEach((e) => document.removeEventListener(e, onUp, true));
        resolve(r);
      };
      const look = () => {
        const b = box.querySelector('.vpc .pb');
        const now = b.getAttribute('aria-label');
        const agree = (now === 'Pause') === !v.paused; // the button says what pressing it will do
        const at = performance.now();
        if (made !== null && now !== before && agree) { mo.disconnect(); return done({ ms: at - made, fromDown: at - down, same: b === btn, before, now }); }
        if (down !== null && at - down > 1500) { mo.disconnect(); return done({ ms: null, same: b === btn, before, now, paused: v.paused }); }
        requestAnimationFrame(look); setTimeout(look, 2);
      };
      // The change is seen the moment the page makes it (a MutationObserver),
      // and on every frame and timer as well.
      const mo = new MutationObserver(() => look());
      mo.observe(box, { attributes: true, childList: true, subtree: true });
      let ran = false;
      const once = () => { if (!ran) { ran = true; look(); } };
      requestAnimationFrame(once);
      setTimeout(() => { if (down === null) done({ ms: null, noInput: true, before }); }, 3000);
    });
  }, root);
}

async function press(page, root, how, touch) {
  const btn = page.locator(`${root} .vpc .pb`).first();
  if (how === 'button') { if (touch) await btn.tap(); else await btn.click(); return; }
  if (how === 'picture') {
    const stage = page.locator(`${root} .stg`);
    const box = await stage.boundingBox();
    const pos = { x: Math.round(box.width * 0.5), y: Math.round(box.height * 0.4) };
    if (touch) await stage.tap({ position: pos }); else await stage.click({ position: pos });
    return;
  }
  await btn.focus();
  await page.keyboard.press(how === 'space' ? ' ' : 'Enter');
}

/** Waits until the video is really moving (its clock advances). */
async function moving(page, root) {
  await page.waitForFunction((root) => {
    const v = document.querySelector(root).querySelector('video');
    if (!v || v.paused) return false;
    const t = v.currentTime;
    if (window.__lastT !== undefined && t > window.__lastT) { window.__lastT = undefined; return true; }
    window.__lastT = t; return false;
  }, root, { polling: 150, timeout: 15000 });
}

async function presses(engine, size) {
  const tag = `${engine} ${size}`;
  const touch = SIZE[size].hasTouch;
  const { browser, ctx, page, got } = await open(engine, size);
  try {
    await page.waitForTimeout(1500);
    check(got.media.length === 0, `${tag}: no video, captions or poster asked for before the guide is opened (${got.media.join(', ') || 'none'})`);
    const muted0 = await page.evaluate(() => { const v = document.querySelector('.wlc video'); return { paused: v.paused, src: v.currentSrc || v.getAttribute('src') || '' }; });
    check(muted0.paused && !muted0.src, `${tag}: the welcome card holds no video and plays nothing by itself`);

    for (const where of ['card', 'panel']) {
      let root;
      if (where === 'card') {
        root = '.wlc .vp';
        if (touch) await page.locator('.wlc .bigplay').tap(); else await page.locator('.wlc .bigplay').click();
      } else {
        // Signed in to the first question, where the icon row has Quick guide.
        await page.reload();
        await page.getByRole('button', { name: 'Begin the Health Check' }).click();
        await page.locator('#hc-email').fill(ctx.session.email);
        await page.locator('#hc-code').fill(ctx.session.code);
        await page.locator('form button[type=submit]').click();
        await page.locator('.hc-main .page h2').first().waitFor();
        const g = page.getByRole('button', { name: 'Quick guide' }).first();
        if (touch) await g.tap(); else await g.click();
        root = '.vp[role="dialog"]';
        await page.locator(root).waitFor();
      }
      await moving(page, root);
      const src = await page.evaluate((root) => document.querySelector(root).querySelector('video').currentSrc, root);
      check(src.includes(SIZE[size].video), `${tag} ${where}: plays ${SIZE[size].video}.mp4 (${src.split('/').pop().split('?')[0]})`);
      const sound = await page.evaluate((root) => { const v = document.querySelector(root).querySelector('video'); return !v.muted && v.volume > 0; }, root);
      check(sound, `${tag} ${where}: the voice is on once Watch or the Quick guide is pressed`);

      for (const how of where === 'card' ? ['button', 'picture', 'space', 'enter'] : ['button', 'picture']) {
        // Start each run from playing, so every other press happens while it plays.
        if (await page.evaluate(readState, root) !== 'Pause') { await press(page, root, 'button', touch); }
        await moving(page, root);
        const times = []; const downs = []; let lost = 0; let rebuilt = 0;
        for (let i = 0; i < PRESSES; i++) {
          // Near the end, go back to the start, so it is still playing for the next press.
          await page.evaluate((root) => { const v = document.querySelector(root).querySelector('video'); if (v.duration && v.currentTime > v.duration - 4) v.currentTime = 1; }, root);
          await arm(page, root);
          await press(page, root, how, touch);
          const r = await page.evaluate(() => window.__press);
          if (r.ms === null) lost += 1; else { times.push(r.ms); downs.push(r.fromDown); }
          if (!r.same) rebuilt += 1;
          if (r.ms === null) console.log(`    press ${i + 1} (${r.before}) lost: ${JSON.stringify(r)}`);
          // Let the video run (and its clock tick several times) before the next press.
          await page.waitForTimeout(r.now === 'Pause' ? 450 : 200);
          if (r.now === 'Pause') await moving(page, root).catch(() => {});
        }
        const max = times.length ? Math.max(...times) : null;
        const med = times.length ? [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)] : null;
        check(lost === 0 && max !== null && max <= LIMIT && rebuilt === 0,
          `${tag} ${where} ${how}: ${PRESSES} presses, ${lost} lost, ${rebuilt} rebuilt the button, slowest ${max === null ? '-' : max.toFixed(0)}ms, median ${med === null ? '-' : med.toFixed(0)}ms (limit ${LIMIT}ms); from down, slowest ${downs.length ? Math.max(...downs).toFixed(0) : '-'}ms`);
      }
      // Mute keeps your place.
      const m = await page.evaluate(async (root) => {
        const box = document.querySelector(root); const v = box.querySelector('video');
        const t = v.currentTime;
        box.querySelector('.vpc [aria-label="Mute the voice"]').click();
        await new Promise((r) => setTimeout(r, 120));
        const after = { muted: v.muted, jump: v.currentTime - t, paused: v.paused };
        box.querySelector('.vpc [aria-label="Turn the voice on"]').click();
        await new Promise((r) => setTimeout(r, 120));
        return { ...after, back: !v.muted };
      }, root);
      check(m.muted && m.back && m.jump >= -0.05 && m.jump < 1, `${tag} ${where}: Mute keeps the place (moved ${m.jump.toFixed(2)}s) and the voice comes back`);
    }
    check(got.errors.length === 0, `${tag}: no errors${got.errors.length ? ` (${got.errors.slice(0, 3).join(' | ')})` : ''}`);
    check(got.emails === 0 && got.outside.length === 0, `${tag}: nothing sent, nothing outside localhost asked for`);
  } finally {
    await browser.close();
  }
}

async function full(engine, size, cues) {
  const tag = `${engine} ${size}`;
  const { browser, page, got } = await open(engine, size);
  try {
    await page.evaluate(() => {
      const box = document.querySelector('.wlc .vp');
      window.__caps = []; window.__vErr = [];
      const bar = box.querySelector('.capbar');
      const v = box.querySelector('video');
      v.addEventListener('error', () => window.__vErr.push(String(v.error?.code)));
      v.addEventListener('ended', () => { window.__ended = performance.now(); });
      new MutationObserver(() => {
        const text = bar.textContent; const last = window.__caps[window.__caps.length - 1];
        if (!last || last.text !== text) window.__caps.push({ t: v.currentTime, text });
      }).observe(bar, { childList: true, characterData: true, subtree: true });
    });
    const t0 = Date.now();
    if (SIZE[size].hasTouch) await page.locator('.wlc .bigplay').tap(); else await page.locator('.wlc .bigplay').click();
    await page.waitForFunction(() => window.__ended, null, { timeout: 120000, polling: 500 });
    const wall = (Date.now() - t0) / 1000;
    const r = await page.evaluate(() => {
      const v = document.querySelector('.wlc video');
      return { caps: window.__caps, err: window.__vErr, dur: v.duration, src: v.currentSrc.split('/').pop().split('?')[0], big: document.querySelector('.wlc .bigplay b')?.textContent };
    });
    check(r.src.startsWith(SIZE[size].video), `${tag}: plays ${r.src}`);
    check(wall >= r.dur - 1, `${tag}: played in real time (${r.dur.toFixed(2)}s of video in ${wall.toFixed(1)}s)`);
    const shown = r.caps.filter((c) => c.text && !/^Watch with sound/.test(c.text));
    check(shown.length === cues.length, `${tag}: ${shown.length} captions shown, ${cues.length} in the file`);
    let worst = 0;
    cues.forEach((c, i) => {
      const s = shown[i];
      const exact = s && s.text === c.text;
      const off = s ? s.t - c.start : NaN;
      worst = Math.max(worst, Math.abs(off) || 0);
      check(exact && Math.abs(off) <= 0.5, `${tag}: caption ${i + 1} at ${c.start.toFixed(1)}s, shown at ${s ? s.t.toFixed(2) : '-'}s, ${exact ? 'exactly as written' : `differs: "${s?.text}"`}`);
    });
    console.log(`    ${tag}: worst caption offset ${worst.toFixed(2)}s`);
    check(r.big === 'Watch again', `${tag}: ends on Watch again`);
    check(r.err.length === 0 && got.errors.length === 0, `${tag}: no errors from the video or the page${got.errors.length || r.err.length ? ` (${[...r.err, ...got.errors].slice(0, 3).join(' | ')})` : ''}`);
    check(got.emails === 0 && got.outside.length === 0, `${tag}: nothing sent, nothing outside localhost asked for`);
  } finally {
    await browser.close();
  }
}

/** The player's measurements, read the same way in the app and in the mock-up. */
const measure = (root) => {
  const box = typeof root === 'string' ? document.querySelector(root) : root;
  const q = (sel) => box.querySelector(sel);
  const cs = (el) => getComputedStyle(el);
  const r = (el) => el.getBoundingClientRect();
  const stg = q('.stg'); const cap = q('.capbar'); const vpc = q('.vpc'); const pbs = [...box.querySelectorAll('.vpc .pb')];
  const big = q('.bigplay'); const tm = q('.vpc .tm');
  return {
    'picture shape (width / height)': (r(stg).width / r(stg).height).toFixed(2),
    'caption bar min height': cs(cap).minHeight,
    'caption bar text size': cs(cap).fontSize,
    'caption bar padding': cs(cap).padding,
    'caption bar first line': cap.textContent.trim(),
    'controls padding': cs(vpc).padding,
    'controls gap': cs(vpc).gap,
    'control buttons, in order': pbs.map((b) => b.getAttribute('aria-label')).join(', '),
    'control button size': pbs.map((b) => `${Math.round(r(b).width)}x${Math.round(r(b).height)}`).join(' '),
    'control icon size': `${Math.round(r(pbs[0].querySelector('svg')).width)}px`,
    'progress line height': cs(q('.scrub .trk')).height,
    'progress knob': cs(q('.scrub .th')).width,
    'time text size': cs(tm).fontSize,
    'time': tm.textContent.trim(),
    'Watch panel heading': big?.querySelector('b')?.textContent.trim(),
    'Watch panel line': big?.querySelector('small')?.textContent.trim(),
    'Watch panel background solid': big ? (cs(big).backgroundColor.match(/[\d.]+/g) || []).length < 4 || Number(cs(big).backgroundColor.match(/[\d.]+/g)[3]) >= 0.999 : null,
    'Watch circle': big ? `${Math.round(r(big.querySelector('.bpc')).width)}px` : null,
    'card corner radius': cs(box).borderRadius,
  };
};

async function layout() {
  const mock = process.env.MOCKUP || join(homedir(), 'Downloads', 'clarity-quick-guide', 'm7b-v49.html');
  const browser = await chromium.launch();
  try {
    const mctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, colorScheme: 'dark' });
    await mctx.route(/^https?:\/\//, (r) => r.abort());
    const mp = await mctx.newPage();
    await mp.goto(pathToFileURL(mock).href);
    await mp.waitForSelector('.frame.d [data-vinl] .stg');
    await mp.waitForSelector('.frame.p [data-vinl] .stg');
    const want = { laptop: await mp.evaluate(measure, '.frame.d [data-vinl] .vp'), phone: await mp.evaluate(measure, '.frame.p [data-vinl] .vp') };
    for (const size of ['laptop', 'phone']) {
      const ctx = await browser.newContext({ viewport: size === 'laptop' ? SIZE.laptop.viewport : { width: 360, height: 780 }, colorScheme: 'dark' });
      await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());
      await ctx.route(/\/health-check\/[^/.]+$/, async (r) => (r.request().resourceType() !== 'document' ? r.continue() : r.fulfill({ response: await r.fetch({ url: `${BASE}/health-check.html` }) })));
      const page = await ctx.newPage();
      await page.goto(`${BASE}/health-check/quickguidelayout`);
      await page.locator('.wlc .bigplay').waitFor();
      await page.waitForTimeout(800);
      const got = await page.evaluate(measure, '.wlc .vp');
      for (const k of Object.keys(want[size])) {
        check(String(got[k]) === String(want[size][k]), `layout ${size}: ${k}: app ${JSON.stringify(got[k])}, mock-up ${JSON.stringify(want[size][k])}`);
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
}

if (MODE === 'layout' || MODE === 'all') await layout();
const runs = [];
for (const e of ENGINES) for (const s of SIZES) runs.push([e, s]);
if (MODE === 'presses' || MODE === 'all') {
  for (const [e, s] of runs) await presses(e, s);
}
if (MODE === 'full' || MODE === 'all') {
  const cues = readCues(readFileSync(VTT, 'utf8'));
  // The four plays run side by side, each in its own browser, in real time.
  await Promise.all(runs.map(([e, s]) => full(e, s, cues)));
}
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
