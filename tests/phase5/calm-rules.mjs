// The calm-rules check (Tim's rules of 5 Nov, START-HERE 5e; part 5 of 10
// Nov): every page in scope, at 1280px and 390 by 844, in dark and light,
// with the real fonts. It fails on any break:
//
//   - no icon in any add button (words only, 5e rule 29e);
//   - every tap area 44px or more;
//   - no sideways scroll;
//   - at most one eye per page or section, beside its title: its centre
//     within 0.5px of the middle of the title's capitals and 12px (±1)
//     after its last letter;
//   - no "Performance Sprint" followed by a number in client text;
//   - no numbered ratings ("out of 10", "/10", "1 to 5");
//   - no title in capitals over 3 words;
//   - the page's background and text match the person's light or dark
//     setting, and the menu button never sits over a logo or content;
//   - no old names (Plan my day, Review my day, the check-in, Performance
//     Evidence), no crosshair used as a plus;
//   - no console errors.
//
//   - the outside Health Check follows the device, light or dark (Tim, 10
//     Nov, 23:22): its own page on four screens, and the portal's own route.
//
// It also saves a light screenshot of every page at both widths into the
// folder given (Tim's screens folder), named by page.
//
// Signed in as the invented test client on the TEST database only; every
// other host and every email call is blocked. Nothing is saved.
//
//   node --import ./tests/scores/register.mjs tests/phase5/calm-rules.mjs [folder for screenshots]
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_REF = 'gqtqljngeenqzxneucoc';
const TEST_HOST = `${TEST_REF}.supabase.co`;
const out = process.argv[2] || null;
if (out) mkdirSync(out, { recursive: true });
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
let failures = 0;
let passes = 0;
const fails = [];
const pass = (name, ok, detail = '') => {
  if (ok) passes += 1;
  else { failures += 1; fails.push(`FAIL  ${name}${detail ? `: ${detail}` : ''}`); }
};
const env = {};
for (const line of readFileSync(`${homedir()}/.clarity-test-accounts.env`, 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
if (!env.TEST_SUPABASE_URL?.includes(TEST_REF)) throw new Error('Not the test project.');
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

// [name, address, what to do once it's open (optional)]
const PAGES = [
  ['home', '/welcome'],
  ['menu', '/welcome', 'menu'],
  ['hub-personal', '/personal'],
  ['hub-plan', '/personal/plan'],
  ['hub-reset', '/personal/reset'],
  ['hub-review', '/personal/review'],
  ['hub-interpersonal', '/interpersonal'],
  ['hub-strategic', '/strategic'],
  ['performance-sprint', '/performance-sprint'],
  ['view-your-year', '/performance-sprint/year'],
  ['plan', '/performance-plan'],
  ['edit-my-plan', '/performance-plan/edit'],
  ['dashboard', '/dashboard'],
  ['daily-plan', '/daily-plan'],
  ['daily-review', '/daily-review'],
  ['weekly-debrief', '/performance-sprint/debrief'],
  ['monthly-review', '/monthly-review'],
  ['recovery', '/recovery'],
  ['my-plans', '/my-plans'],
  ['my-reviews', '/my-reviews'],
  ['my-account', '/my-account'],
  // The end-of-sprint review's two written questions and the first-time
  // builder's working days (Tim, 10 Nov): opened on their step, nothing saved.
  ['sprint-review-worked', '/performance-sprint/review', 'review:1'],
  ['sprint-review-next-time', '/performance-sprint/review', 'review:2'],
  ['build-working-days', '/performance-plan/build', 'build:4'],
].filter(([name]) => !ONLY || ONLY.test(name));

const BACKGROUND = { dark: 'rgb(0, 0, 0)', light: 'rgb(249, 248, 245)' };
const TEXT = { dark: 'rgb(255, 255, 255)', light: 'rgb(0, 0, 0)' };

/** Runs in the page. */
function measure({ phone }) {
  const vis = (el) => {
    const b = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return b.width > 0 && b.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0.05 && !el.closest('[hidden],[inert]');
  };
  const label = (el) => `${String(el.className?.baseVal ?? el.className ?? '').split(' ')[0] || el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 30)}"`;
  const root = document.querySelector('.ds-guide--fullscreen') || document.body;
  const text = root.innerText;

  // Add buttons: words only.
  const addIcons = [];
  for (const b of document.querySelectorAll('button, a')) {
    if (!vis(b)) continue;
    const words = (b.textContent || '').trim();
    const adds = b.classList.contains('ds-add') || /^(add|start a new|something else|save a new)\b/i.test(words);
    if (adds && b.querySelector('svg, img, .ds-cross, .ds-bold-cross')) addIcons.push(label(b));
  }
  // A crosshair is only ever the close (turned), the spinner, the menu button or the orb.
  const plusCross = [...document.querySelectorAll('.ds-cross')].filter((c) => vis(c)
    && !c.classList.contains('ds-cross--close') && !c.classList.contains('ds-cross--turned') && !c.classList.contains('ds-cross--spin')
    && !c.closest('.ds-orb, .ds-sdial, .ds-loading, .ds-saving, .ds-floating-orb, .ds-fab, [class*="orb"], [class*="dial"], [role=status]')).map((c) => label(c.closest('button, a, div') || c));

  // Tap areas (a shared part may reach 44px through its ::before or ::after).
  const small = [];
  for (const el of root.querySelectorAll('button, a, select, textarea, input, label, [role=radio], [role=checkbox], [role=switch], [role=tab], [role=option], summary')) {
    if (!vis(el) || el.disabled || el.getAttribute('aria-hidden') === 'true') continue;
    const b = el.getBoundingClientRect();
    if (el.tagName === 'INPUT' && (b.width <= 2 || b.height <= 2 || getComputedStyle(el).opacity === '0')) continue;
    if (el.tagName === 'LABEL' && !el.querySelector('input[type=checkbox], input[type=radio]')) continue;
    if (el.tagName === 'INPUT' && ['checkbox', 'radio'].includes(el.type) && el.closest('label')) continue;
    if (el.closest('label') && el.tagName !== 'LABEL' && el.tagName !== 'INPUT') continue;
    if (el.closest('.ds-ctable td, .ds-ctable th')) continue;
    const stretch = (p) => p.content !== 'none' && p.position === 'absolute' && (parseFloat(p.height) || 0) >= 43.5 && (parseFloat(p.width) || 0) >= 43.5;
    if ((b.height >= 43.5 && b.width >= 43.5) || stretch(getComputedStyle(el, '::after')) || stretch(getComputedStyle(el, '::before'))) continue;
    if (el.matches('.ds-seg-btn') && b.height >= 38) continue;
    // A link inside a sentence is as tall as its line (WCAG's inline exception).
    if (el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.parentElement && el.parentElement.innerText.trim().length > el.innerText.trim().length + 12) continue;
    small.push(`${label(el)} ${Math.round(b.width)}x${Math.round(b.height)}`);
  }

  // Eyes: once per page or section, beside the title.
  // The middle of the capitals on the title's last line, from the last
  // letter's own box and the font's metrics (as tests/phase2/title-info.mjs).
  const capMiddle = (letter, textEl) => {
    const cs = getComputedStyle(textEl);
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const mt = ctx.measureText('H');
    const baseline = letter.top + (letter.height - mt.fontBoundingBoxAscent - mt.fontBoundingBoxDescent) / 2 + mt.fontBoundingBoxAscent;
    return baseline - mt.actualBoundingBoxAscent / 2;
  };
  const eyes = [...root.querySelectorAll('.ds-who--eye, .ds-who')].filter((e) => vis(e) && !e.closest('.ds-modal, [role=dialog] [role=dialog]'));
  const eyeNotes = [];
  const perGroup = new Map();
  for (const eye of eyes) {
    const group = eye.closest('.ds-section, section, .ds-guide-page, .ds-fold, .dash-fold') || eye.closest('.ui-root');
    perGroup.set(group, (perGroup.get(group) || 0) + 1);
    const heading = eye.closest('h1, h2, h3, .ds-page-title-row, .ds-guide-question, .ds-guide-title, .ds-dialog-title');
    if (!heading) { eyeNotes.push(`${label(eye)}: not beside a title`); continue; }
    const title = heading.matches('.ds-page-title-row') ? heading.querySelector('.ds-page-title') : heading;
    // The title's last letter.
    const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
    let last = null;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (!eye.contains(n) && !n.parentElement.closest('.ds-sr') && n.textContent.trim()) last = n;
    if (!last) { eyeNotes.push(`${label(eye)}: no title words`); continue; }
    const end = last.textContent.replace(/\s+$/, '').length;
    const range = document.createRange();
    range.setStart(last, Math.max(0, end - 1));
    range.setEnd(last, end);
    const letter = range.getBoundingClientRect();
    const svg = eye.querySelector('svg') || eye;
    const icon = svg.getBoundingClientRect();
    const sameLine = Math.abs((icon.top + icon.height / 2) - (letter.top + letter.height / 2)) < letter.height;
    // Letter-spacing leaves space after the last letter: it isn't part of the gap.
    const ls = parseFloat(getComputedStyle(last.parentElement).letterSpacing) || 0;
    const gap = icon.left - (letter.right - ls);
    const off = icon.top + icon.height / 2 - capMiddle(letter, last.parentElement);
    if (!sameLine) eyeNotes.push(`${label(title)}: the eye is on its own line`);
    else {
      if (Math.abs(gap - 12) > 1) eyeNotes.push(`${label(title)}: the eye is ${gap.toFixed(1)}px after the last letter (12 ±1)`);
      if (Math.abs(off) > 0.5) eyeNotes.push(`${label(title)}: the eye is ${off.toFixed(2)}px off the middle of the capitals (±0.5)`);
    }
  }
  for (const [group, n] of perGroup) if (n > 1) eyeNotes.push(`${label(group.querySelector('h1, h2, h3, .ds-guide-question') || group)}: ${n} eyes in one page or section`);

  // Titles in capitals: 3 words at most.
  const longTitles = [...root.querySelectorAll('h1, h2, h3, .ds-page-title, .ds-section-title')].filter((h) => vis(h) && getComputedStyle(h).textTransform === 'uppercase')
    .map((h) => (h.childNodes.length ? [...h.childNodes].filter((n) => !(n.nodeType === 1 && n.matches('.ds-page-aside, .ds-sr'))).map((n) => n.textContent).join('') : h.textContent).replace(/\s+/g, ' ').trim())
    .filter((t) => t.split(' ').filter(Boolean).length > 3);

  // The menu button never sits over a logo or content.
  const over = [];
  const btn = document.querySelector('.hdr-menu');
  if (btn && vis(btn) && !phone) {
    const b = btn.getBoundingClientRect();
    for (const el of document.querySelectorAll('img, svg, h1, h2, p, a, button, input')) {
      if (btn.contains(el) || el.contains(btn) || !vis(el) || el.closest('#site-menu, .ds-dmenu-wrap')) continue;
      const r = el.getBoundingClientRect();
      if (r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top) over.push(label(el));
    }
  }
  const page = document.querySelector('.ui-root') || document.body;
  const heading = document.querySelector('.ds-page-title, .ds-guide-question, .ds-guide-title, .ds-hub-page h1, h1');
  return {
    text,
    addIcons,
    plusCross,
    small,
    eyeNotes,
    longTitles,
    over,
    sideways: document.documentElement.scrollWidth - window.innerWidth,
    theme: document.documentElement.getAttribute('data-theme'),
    background: getComputedStyle(document.documentElement).backgroundColor,
    pageBackground: getComputedStyle(page).backgroundColor,
    textColour: heading ? getComputedStyle(heading).color : null,
  };
}

const browser = await chromium.launch();
for (const width of [1280, 390]) {
  for (const mode of ['light', 'dark']) {
    const phone = width < 600;
    const context = await browser.newContext({ viewport: { width, height: phone ? 844 : 900 }, hasTouch: phone, isMobile: phone, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: mode });
    await context.route('**/*', (route) => {
      const url = route.request().url();
      if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
      if (/supabase\.co/.test(url) && !url.includes(TEST_HOST)) return route.abort();
      if (/\/functions\/v1\/|\/api\//.test(url)) return route.abort();
      // The first-time builder needs a person with no plan: every read is
      // answered empty for that page only (nothing in the database is touched).
      if (emptyReads && route.request().method() === 'GET' && /\/rest\/v1\/(?!person_settings|profiles)/.test(url)) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      if (emptyReads && /\/rest\/v1\/rpc\//.test(url)) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      if (emptyReads && route.request().method() !== 'GET' && /\/rest\/v1\//.test(url)) return route.abort();
      return route.fallback();
    });
    let emptyReads = false;
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|favicon/.test(m.text())) errors.push(m.text().slice(0, 160)); });
    await page.goto(`${APP}/auth/login`);
    await page.fill('input[type=email]', env.TEST_CLIENT_EMAIL);
    await page.fill('input[type=password]', env.TEST_CLIENT_PASSWORD);
    await page.keyboard.press('Enter');
    await page.waitForURL(/welcome/, { timeout: 30000 });

    for (const [name, path, act] of PAGES) {
      const tag = `${name} ${width}px ${mode}`;
      errors.length = 0;
      try {
        // A guided tool opened on one step: its saved place is set first.
        const [kind, at] = /^(review|build):\d+$/.test(act || '') ? act.split(':') : [];
        emptyReads = kind === 'build';
        if (kind) {
          // The person's page copies carry their id: wait until one is on the device.
          await page.waitForFunction(() => Object.keys(localStorage).some((x) => /^clarity-[a-z-]+:[0-9a-f-]{36}(:|$)/.test(x)), null, { timeout: 15000 });
          await page.evaluate(({ kind: k, at: n }) => {
            // The person's id, from any of their page copies on the device.
            const uid = Object.keys(localStorage).map((x) => /^clarity-[a-z-]+:([0-9a-f-]{36})(:|$)/.exec(x)?.[1]).find(Boolean);
            for (const x of Object.keys(localStorage)) if (x.startsWith('clarity-cache:') && k === 'build') localStorage.removeItem(x);
            localStorage.setItem(`ds-guide:${k === 'review' ? `performance-sprint-review-${uid}` : `performance-plan-build-${uid}`}`, JSON.stringify({ index: Number(n), skipped: [] }));
          }, { kind, at });
        }
        await page.goto(`${APP}${path}`);
        if (kind === 'review') {
          await page.getByRole('button', { name: 'Review it now' }).click({ timeout: 15000 }).catch(() => null);
        }
        if (kind) {
          await page.waitForSelector('.ds-guide-question', { timeout: 20000 });
          const want = { 'review:1': 'What worked best in this sprint?', 'review:2': 'What would make the next sprint even better?', 'build:4': 'Which days do you work?' }[act];
          const got = (await page.locator('.ds-guide-question').first().innerText()).replace(/\s+/g, ' ').trim();
          pass(`${tag}: opened on "${want}"`, got.startsWith(want), got);
          const eyes = await page.locator('.ds-guide-question .ds-who, .ds-guide-question .ds-page-aside').count();
          pass(`${tag}: the eye is inside the heading`, eyes >= 1, `${eyes}`);
        }
        await page.waitForLoadState('networkidle').catch(() => null);
        await page.evaluate(() => document.fonts.ready);
        await sleep(1200);
        if (act === 'menu') {
          await page.locator(phone ? '.ds-bar-menu' : '.hdr-menu').click();
          await sleep(700);
        }
        const fonts = await page.evaluate(() => [document.fonts.check('16px "DM Sans"'), document.fonts.check('16px Nekst')]);
        pass(`${tag}: the real fonts are loaded`, fonts[0] && fonts[1], JSON.stringify(fonts));
        const r = await page.evaluate(measure, { phone });
        pass(`${tag}: no icon in any add button`, r.addIcons.length === 0, r.addIcons.join('; '));
        pass(`${tag}: no crosshair used as a plus`, r.plusCross.length === 0, r.plusCross.slice(0, 4).join('; '));
        pass(`${tag}: every tap area is 44px or more`, r.small.length === 0, r.small.slice(0, 6).join('; '));
        pass(`${tag}: no sideways scroll`, r.sideways <= 0, `${r.sideways}px`);
        pass(`${tag}: at most one eye per page or section, beside its title`, r.eyeNotes.length === 0, r.eyeNotes.slice(0, 4).join('; '));
        const numbered = /Performance Sprint \d/.exec(r.text);
        pass(`${tag}: no "Performance Sprint" followed by a number`, !numbered, numbered?.[0]);
        const rating = /out of 10\b|\b\d+(\.\d+)?\/10\b|\b1 to 5\b|rated 1\b/i.exec(r.text);
        pass(`${tag}: no numbered ratings`, !rating, rating ? `"${r.text.slice(Math.max(0, rating.index - 30), rating.index + 30).replace(/\n/g, ' ')}"` : '');
        pass(`${tag}: no title in capitals over 3 words`, r.longTitles.length === 0, r.longTitles.join('; '));
        const old = /plan my day|review my day|hardware and software check-in|monthly check-in|first check-in|performance evidence/i.exec(r.text);
        pass(`${tag}: no old names`, !old, old?.[0]);
        pass(`${tag}: the background and text match the ${mode} setting`, r.theme === mode && r.background === BACKGROUND[mode] && (r.textColour == null || r.textColour === TEXT[mode]), `${r.theme} ${r.background} ${r.textColour}`);
        pass(`${tag}: the menu button sits over nothing`, r.over.length === 0, r.over.slice(0, 3).join('; '));
        pass(`${tag}: no console errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
        if (out && mode === 'light') await page.screenshot({ path: join(out, `${name}-${width === 1280 ? '1280' : '390x844'}.png`), fullPage: true });
        if (act === 'menu') await page.keyboard.press('Escape');
        if (kind) await page.evaluate(() => { for (const x of Object.keys(localStorage)) if (x.startsWith('ds-guide:performance-') || x.startsWith('clarity-cache:') || x.startsWith('clarity-draft:')) localStorage.removeItem(x); });
        emptyReads = false;
      } catch (e) {
        emptyReads = false;
        pass(`${tag}: opened`, false, e.message.split('\n')[0]);
      }
    }
    await context.close();
  }
}

// ---------------------------------------------------------------------------
// The outside Health Check (Tim, 10 Nov, 23:22): it follows the person's
// device, light or dark, like every other page. Its own page
// (health-check.html, which Vercel serves for /health-check/*) is opened with
// invented answers and the two database calls answered here, so nothing is
// read or saved anywhere: the welcome screen, signing in, the first question
// and the results, at both sizes, on a device set to light and one set to
// dark. Then the portal's own /health-check route, which must follow the
// device too, even when the portal on this device is set the other way.
const HC_ONLY = !ONLY || ONLY.test('health-check');
const HC_CSF = ['Win and keep enterprise clients', 'A product customers recommend', 'A team with the right skills in the right roles', 'Cash to invest ahead of growth'];
const HC_PR = [
  { t: 'Enterprise sales team', c: [3, 2, 2, 3], p: 2, r: 5, s: '2025-09', f: '2026-12' },
  { t: 'Customer success programme', c: [3, 3, 1, 2], p: 4, r: 3, s: '2026-01', f: '2027-03' },
  { t: 'Pricing review', c: [2, 2, 0, 3], p: 3, r: 2, s: '2026-06', f: '2026-12' },
  { t: 'Hiring plan for 2027', c: [2, 1, 2, 2], p: 1, r: 4, s: '2026-10', f: '2027-06' },
  { t: 'Partner channel', c: [2, 1, 1, 1], p: 3, r: 3, s: '2026-04', f: 'open' },
  { t: 'New office fit-out', c: [0, 0, 1, 1], p: 4, r: 4, s: '2026-07', f: '2026-11' },
  { t: 'Data platform', c: [1, 3, 1, 2], p: 5, r: 3, s: '2025-11', f: '2026-12' },
];
const hcAnswers = (complete) => (complete ? {
  objective: 'Double recurring revenue by 2028 while keeping client satisfaction high.',
  csfs: HC_CSF.map((text, i) => ({ id: `f${i}`, text, level: [3, 2, 2, 1][i] })),
  projects: HC_PR.map((p, i) => ({ id: `p${i}`, text: p.t, started: p.s, due: p.f })),
  ratings: { owner: Object.fromEntries(HC_PR.map((p, i) => [`p${i}`, { contrib: Object.fromEntries(p.c.map((v, k) => [`f${k}`, v])), progress: p.p, resource: p.r }])) },
  completedAt: '2026-10-27T09:00:00.000Z',
} : {});

/** Runs in the Health Check's own page. */
function measureHealthCheck() {
  const vis = (el) => {
    const b = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return b.width > 0 && b.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0.05 && !el.closest('[hidden],[inert]');
  };
  const label = (el) => `${String(el.className?.baseVal ?? el.className ?? '').split(' ')[0] || el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 30)}"`;
  const hc = document.querySelector('.hc');
  const small = [];
  for (const el of document.querySelectorAll('button, a, select, textarea, input, [role=radio], [role=checkbox], [role=switch], summary')) {
    if (!vis(el) || el.disabled || el.getAttribute('aria-hidden') === 'true') continue;
    const b = el.getBoundingClientRect();
    const stretch = (p) => p.content !== 'none' && p.position === 'absolute' && (parseFloat(p.height) || 0) >= 43.5 && (parseFloat(p.width) || 0) >= 43.5;
    if ((b.height >= 43.5 && b.width >= 43.5) || stretch(getComputedStyle(el, '::after')) || stretch(getComputedStyle(el, '::before'))) continue;
    // A link inside a sentence is as tall as its line (WCAG's inline exception).
    if (el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.parentElement && el.parentElement.innerText.trim().length > el.innerText.trim().length + 12) continue;
    small.push(`${label(el)} ${Math.round(b.width)}x${Math.round(b.height)}`);
  }
  const heading = [...document.querySelectorAll('.hc h1, .hc h2, .hc .qh')].find(vis);
  return {
    small,
    sideways: document.documentElement.scrollWidth - window.innerWidth,
    background: hc ? getComputedStyle(hc).backgroundColor : null,
    behind: getComputedStyle(document.documentElement).backgroundColor,
    textColour: heading ? getComputedStyle(heading).color : null,
    scheme: hc ? getComputedStyle(hc).colorScheme : null,
    text: (hc || document.body).innerText,
  };
}

if (HC_ONLY) {
  for (const width of [1280, 390]) {
    for (const mode of ['light', 'dark']) {
      const phone = width < 600;
      for (const screen of ['welcome', 'sign-in', 'first-question', 'results']) {
        const tag = `health-check ${screen} ${width}px ${mode}`;
        const complete = screen === 'results';
        const context = await browser.newContext({ viewport: { width, height: phone ? 844 : 900 }, hasTouch: phone, isMobile: phone, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: mode, reducedMotion: 'reduce' });
        const errors = [];
        try {
          // Nothing leaves this machine: the two database calls are answered here, everything else outside is stopped.
          await context.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => {
            const url = route.request().url();
            const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
            if (url.endsWith('/rpc/alignment_open')) return json({ ok: true, status: complete ? 'complete' : 'invited', current_step: null, data: hcAnswers(complete), version: 1, updated_at: '2026-10-27 09:30:00.123', completed_at: complete ? '2026-10-27 09:30:00' : null, client_label: 'Kestrel Group', coach_name: 'Tim' });
            if (url.endsWith('/rpc/alignment_save')) return json({ ok: true, version: 2, updated_at: '2026-10-27 10:00:00', status: 'in_progress' });
            return route.abort();
          });
          await context.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
          // As vercel.json does: /health-check/* is the Health Check's own page.
          await context.route(/\/health-check\/[^/.]+$/, async (route) => {
            if (route.request().resourceType() !== 'document') return route.continue();
            return route.fulfill({ response: await route.fetch({ url: `${APP}/health-check.html` }) });
          });
          // The portal on this device is set the other way: the Health Check has no such setting and follows the device.
          await context.addInitScript((other) => { try { localStorage.setItem('clarity-colour-mode', other); localStorage.setItem('hc-quick-guide-watched', '1'); } catch { /* blocked */ } }, mode === 'light' ? 'dark' : 'light');
          const page = await context.newPage();
          page.on('pageerror', (e) => errors.push(e.message));
          page.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|\[vite\]|Vite server|Failed to load resource|net::ERR|favicon/.test(m.text())) errors.push(m.text().slice(0, 160)); });
          await page.goto(`${APP}/health-check/tok-calm-rules-0000000000000000000000000000`);
          await page.locator('#hc-email, .wlc .btn.full').first().waitFor({ timeout: 20000 });
          if (screen !== 'welcome') {
            const begin = page.getByRole('button', { name: 'Begin the Health Check' });
            if (await begin.isVisible().catch(() => false)) await begin.click();
            await page.locator('#hc-email').waitFor({ timeout: 10000 });
          }
          if (screen === 'first-question' || screen === 'results') {
            await page.locator('#hc-email').fill('sam.example@invented.test');
            await page.locator('#hc-code').fill('ABC234');
            await page.locator('form button[type=submit]').click();
            await page.locator(complete ? '.gst b' : '.hc-main .page h2').first().waitFor({ timeout: 15000 });
          }
          await page.evaluate(() => document.fonts.ready);
          await sleep(700);
          const r = await page.evaluate(measureHealthCheck);
          pass(`${tag}: the page and its text follow the device (${mode})`, r.background === BACKGROUND[mode] && r.behind === BACKGROUND[mode] && r.textColour === TEXT[mode] && r.scheme === mode, `${r.background} ${r.behind} ${r.textColour} ${r.scheme}`);
          pass(`${tag}: every tap area is 44px or more`, r.small.length === 0, r.small.slice(0, 6).join('; '));
          pass(`${tag}: no sideways scroll`, r.sideways <= 0, `${r.sideways}px`);
          pass(`${tag}: no console errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
          if (out) await page.screenshot({ path: join(out, `health-check-${screen}-${width === 1280 ? '1280' : '390x844'}-${mode}.png`), fullPage: true });
        } catch (e) {
          pass(`${tag}: opened`, false, e.message.split('\n')[0]);
        }
        await context.close();
      }
      // The portal's own /health-check route (kept for rolling back): the device's mode, not the portal's saved choice.
      const context = await browser.newContext({ viewport: { width, height: phone ? 844 : 900 }, hasTouch: phone, isMobile: phone, locale: 'en-GB', colorScheme: mode });
      try {
        await context.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => route.abort());
        await context.addInitScript((other) => { try { localStorage.setItem('clarity-colour-mode', other); } catch { /* blocked */ } }, mode === 'light' ? 'dark' : 'light');
        const page = await context.newPage();
        await page.goto(`${APP}/health-check/tok-calm-rules-0000000000000000000000000000`);
        await page.waitForFunction(() => document.documentElement.getAttribute('data-theme'), null, { timeout: 15000 });
        const got = await page.evaluate(() => ({ theme: document.documentElement.getAttribute('data-theme'), background: getComputedStyle(document.documentElement).backgroundColor }));
        pass(`health-check, the portal's own route ${width}px ${mode}: follows the device, not the portal's saved choice`, got.theme === mode && got.background === BACKGROUND[mode], `${got.theme} ${got.background}`);
        // Typed with capitals, the app opens the same page: it follows the device too (break-it tester, 11 Nov).
        await page.goto(`${APP}/Health-Check/tok-calm-rules-0000000000000000000000000000`);
        await page.waitForFunction(() => document.documentElement.getAttribute('data-theme'), null, { timeout: 15000 });
        const capitals = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        pass(`health-check, the portal's own route ${width}px ${mode}: the same with capitals in the address`, capitals === mode, capitals);
        // Any other page still follows the saved choice (set the other way here).
        await page.goto(`${APP}/auth/login`);
        await page.waitForFunction(() => document.documentElement.getAttribute('data-theme'), null, { timeout: 15000 });
        const elsewhere = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        pass(`health-check ${width}px ${mode}: every other page keeps the saved choice`, elsewhere === (mode === 'light' ? 'dark' : 'light'), elsewhere);
      } catch (e) {
        pass(`health-check, the portal's own route ${width}px ${mode}: opened`, false, e.message.split('\n')[0]);
      }
      await context.close();
    }
  }
}

await browser.close();

console.log(fails.join('\n'));
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
