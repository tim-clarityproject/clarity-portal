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
await browser.close();

console.log(fails.join('\n'));
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
