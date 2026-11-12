// Tim's follow-up of 12 Nov, checked in a browser at 1280px and 390 by 844,
// in light and dark:
//
//   - every outlined edge reaches 3 to 1: the portal's outlined buttons, the
//     Add button, the Breathe button, the segmented control's outer edge and
//     the journal's prompt chips, each measured from the colours the browser
//     used (tests/phase5/calm-rules.mjs runs the same reading on every page);
//   - in Windows high-contrast mode (forced colours) the masked icons, the
//     chevrons and the close crosshair, are drawn in the system's text
//     colour: read from the style the browser used and from the screen's own
//     pixels, in the portal and on the outside Health Check;
//   - Home's "Edit my review": with today's Daily review finished, the card
//     "Priorities for tomorrow" shows the link, and it opens the Daily review;
//   - the outside Health Check's "Edit the exact date": a project with an
//     exact due date shows the link, and it opens the day picker.
//
//   - in that mode a ticked box, a chosen pick-several answer, the small
//     win and a done plan step are filled with the system's text colour and
//     differ from unticked ones (read in the design gallery, once a run).
//
// Each check was tried with the thing it guards broken in the page (a
// fainter edge colour, the high-contrast rule overridden): each went red.
//
// (A chevron beside a name with a line under it, and the portal's own Health
// Check route, are measured by calm-rules' chevrons part; "Edit the start
// date" by tests/phase2/start-sprint.mjs and build-plan.mjs; "is due today."
// by tests/performance/dashboard.test.mjs.)
//
// Signed in as the invented test client on the TEST database only; every
// other host and every email call is blocked, and nothing is saved.
//
//   node --import ./tests/scores/register.mjs tests/phase5/answers3.mjs [folder for screenshots]
//   SIZES=390 MODES=light …   one part of it
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { measureChevrons } from './chevrons.mjs';
import { outlinedEdges } from './edges.mjs';

const APP = process.env.APP_URL || 'http://localhost:5173';
const TEST_REF = 'gqtqljngeenqzxneucoc';
const TEST_HOST = `${TEST_REF}.supabase.co`;
const out = process.argv[2] || null;
if (out) mkdirSync(out, { recursive: true });
let failures = 0;
let passes = 0;
const fails = [];
const pass = (name, ok, detail = '') => {
  if (ok) passes += 1;
  else { failures += 1; fails.push(`FAIL  ${name}${detail ? `: ${String(detail).slice(0, 300)}` : ''}`); }
};
const env = {};
for (const line of readFileSync(`${homedir()}/.clarity-test-accounts.env`, 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
if (!env.TEST_SUPABASE_URL?.includes(TEST_REF)) throw new Error('Not the test project.');
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

/** Runs in the page: the outlines matching a selector, each with its ratio (from outlinedEdges' own list). */
const ratiosOf = (all, start) => all.filter((e) => e.startsWith(`${start} `)).map((e) => Number(e.split(' ').pop()));
const edgeCheck = (name, all, start, least = 1) => {
  const got = ratiosOf(all, start);
  pass(`${name}: the edge reaches 3 to 1 (${got.length} measured, lowest ${got.length ? Math.min(...got).toFixed(2) : 'none'})`, got.length >= least && got.every((r) => r >= 3), got.length ? got.filter((r) => r < 3).map((r) => r.toFixed(2)).join(', ') : 'none found');
};

/** Runs in the page: each masked icon's colour as drawn, beside the system's own text and page colours. */
function maskedIcons(selector) {
  const probe = document.createElement('span');
  probe.style.cssText = 'color: CanvasText; background-color: Canvas; forced-color-adjust: none;';
  document.body.appendChild(probe);
  const text = getComputedStyle(probe).color;
  const canvas = getComputedStyle(probe).backgroundColor;
  probe.remove();
  const icons = [];
  for (const el of document.querySelectorAll(selector)) {
    const b = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    if (!(b.width > 0 && b.height > 0) || st.visibility === 'hidden' || st.display === 'none' || el.closest('[hidden],[inert]')) continue;
    icons.push({ name: String(el.className).split(' ').slice(0, 2).join(' '), colour: st.backgroundColor });
  }
  return { text, canvas, icons };
}

// The Health Check's invented answers (as tests/phase5/calm-rules.mjs); the first project has an exact start date and an exact due date.
const HC_CSF = ['Win and keep enterprise clients', 'A product customers recommend', 'A team with the right skills in the right roles', 'Cash to invest ahead of growth'];
const HC_PR = [
  { t: 'Enterprise sales team', s: '2025-09', sOn: '2025-09-12', f: '2026-12', fOn: '2026-12-18' },
  { t: 'Customer success programme', s: '2026-01', f: '2027-03' },
  { t: 'Pricing review', s: '2026-06', f: '2026-12' },
];
const hcAnswers = () => ({
  objective: 'Double recurring revenue by 2028 while keeping client satisfaction high.',
  csfs: HC_CSF.map((text, i) => ({ id: `f${i}`, text, level: [3, 2, 2, 1][i] })),
  projects: HC_PR.map((p, i) => ({ id: `p${i}`, text: p.t, started: p.s, due: p.f, ...(p.sOn ? { startedOn: p.sOn } : {}), ...(p.fOn ? { dueOn: p.fOn } : {}) })),
  ratings: { owner: Object.fromEntries(HC_PR.map((p, i) => [`p${i}`, { contrib: Object.fromEntries(HC_CSF.map((_, k) => [`f${k}`, 2])) }])) },
});

const blockOthers = (context) => context.route('**/*', (route) => {
  const url = route.request().url();
  if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
  if (/supabase\.co/.test(url) && !url.includes(TEST_HOST)) return route.abort();
  if (/\/functions\/v1\/|\/api\//.test(url)) return route.abort();
  // Nothing is saved: a write is answered here and goes nowhere.
  if (/supabase\.co\/rest\/v1\//.test(url) && !/\/rpc\//.test(url) && !['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  return route.fallback();
});
const signIn = async (page) => {
  await page.goto(`${APP}/auth/login`);
  await page.fill('input[type=email]', env.TEST_CLIENT_EMAIL);
  await page.fill('input[type=password]', env.TEST_CLIENT_PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForURL(/welcome/, { timeout: 30000 });
  // (Signing in lands on the "welcome back" screen first; Home is /welcome.)
  await page.goto(`${APP}/welcome`);
};
/** The outside Health Check, opened on a mocked link (nothing reaches a database). */
const openHealthCheck = async (context, open) => {
  await context.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => {
    const url = route.request().url();
    const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (url.endsWith('/rpc/alignment_open')) return json(open);
    if (url.endsWith('/rpc/alignment_save')) return json({ ok: true, version: 2, updated_at: '2026-10-27 10:00:00', status: 'in_progress' });
    return route.abort();
  });
  await context.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  await context.route(/\/health-check\/[^/.]+$/, async (route) => {
    if (route.request().resourceType() !== 'document') return route.continue();
    return route.fulfill({ response: await route.fetch({ url: `${APP}/health-check.html` }) });
  });
  await context.addInitScript(() => { try { localStorage.setItem('hc-quick-guide-watched', '1'); } catch { /* blocked */ } });
  const page = await context.newPage();
  await page.goto(`${APP}/health-check/tok-answers-three-000000000000000000000000`);
  await page.locator('#hc-email, .wlc .btn.full').first().waitFor({ timeout: 20000 });
  const begin = page.getByRole('button', { name: 'Begin the Health Check' });
  if (await begin.isVisible().catch(() => false)) await begin.click();
  return page;
};

const browser = await chromium.launch();
let ticksRead = false;
try {
  for (const width of [1280, 390].filter((w) => !process.env.SIZES || process.env.SIZES.split(',').includes(String(w)))) {
    for (const mode of ['light', 'dark'].filter((m) => !process.env.MODES || process.env.MODES.split(',').includes(m))) {
      const phone = width < 600;
      const size = width === 1280 ? '1280' : '390x844';
      const tag = `${width}px ${mode}`;
      const base = { viewport: { width, height: phone ? 844 : 900 }, hasTouch: phone, isMobile: phone, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: mode, reducedMotion: 'reduce' };

      // ------------------------------------------------ outlined edges, and Home's "Edit my review"
      const context = await browser.newContext(base);
      await blockOthers(context);
      // Today's Daily review reads as finished, with three priorities for tomorrow (answered here; nothing is saved).
      let reviewedToday = false;
      // The browser's own day (its clock is London's).
      const londonToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
      await context.route(/supabase\.co\/rest\/v1\/day_reviews\?/, async (route) => {
        const url = decodeURIComponent(route.request().url());
        const day = /local_date=eq\.(\d{4}-\d{2}-\d{2})/.exec(url)?.[1];
        // (Either side of midnight: a page opened at 23:59 asks for the day it opened on, a moment after the day has turned here.)
        if (!reviewedToday || route.request().method() !== 'GET' || !day || (day !== londonToday() && day !== reviewedToday) || !/select=[^&]*status/.test(url)) return route.fallback();
        const row = { id: '00000000-0000-4000-8000-00000000a003', local_date: day, status: 'finished', tomorrow: ['Call Evan about the proposal', 'Send the board paper', 'Book the venue'], updated_at: `${day}T18:05:00` };
        const one = /vnd\.pgrst\.object/.test(route.request().headers().accept || '');
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(one ? row : [row]) });
      });
      const page = await context.newPage();
      const settle = async (p = page) => { await p.waitForLoadState('networkidle').catch(() => null); await p.evaluate(() => document.fonts.ready); await sleep(900); };
      const shot = async (name, p = page, opts = {}) => { if (out) await p.screenshot({ path: join(out, `${name}-${size}-${mode}.png`), fullPage: true, ...opts }); };
      try {
        await signIn(page);
        await page.locator('.home-page .ds-page-title').first().waitFor({ timeout: 20000 });
        await page.getByRole('button', { name: 'Add a to-do' }).first().waitFor({ timeout: 20000 });
        await settle();
        const home = await page.evaluate(outlinedEdges, true);
        edgeCheck(`Home ${tag}, the Add button and outlined buttons`, home, 'ds-btn', 1);
        if (!phone) edgeCheck(`Home ${tag}, the Breathe button`, home, 'ds-breathe', 1);
        pass(`Home ${tag}: no outlined edge under 3 to 1`, (await page.evaluate(outlinedEdges)).length === 0, (await page.evaluate(outlinedEdges)).join('; '));
        await shot('home');

        await page.goto(`${APP}/performance-sprint`);
        await settle();
        const sprint = await page.evaluate(outlinedEdges, true);
        edgeCheck(`Sprint page ${tag}, the segmented control's outer edge`, sprint, 'ds-seg', 1);
        pass(`Sprint page ${tag}: no outlined edge under 3 to 1`, (await page.evaluate(outlinedEdges)).length === 0, (await page.evaluate(outlinedEdges)).join('; '));
        await shot('sprint-page');

        await page.goto(`${APP}/daily-journal`);
        await settle();
        const journal = await page.evaluate(outlinedEdges, true);
        edgeCheck(`Journal ${tag}, the prompt chips`, journal, 'ds-chip', 3);
        pass(`Journal ${tag}: no outlined edge under 3 to 1`, (await page.evaluate(outlinedEdges)).length === 0, (await page.evaluate(outlinedEdges)).join('; '));
        await shot('journal');

        await page.goto(`${APP}/strategic`);
        await settle();
        edgeCheck(`Strategic hub ${tag}, its outlined button`, await page.evaluate(outlinedEdges, true), 'ds-btn', 1);
      } catch (e) { pass(`outlined edges ${tag}: measured`, false, `${e.message.split('\n')[0]} at ${page.url().replace(APP, '')}: ${(await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160)}`); }

      try {
        reviewedToday = londonToday();
        // From 21:00 to 03:00 Home's one card is Sleep wind down, not the
        // finished day's, so this failed falsely every evening (break-it, 12
        // Nov, 21:26). The page's clock reads early evening on the same day
        // for this part (18:30 UTC is 18:30 or 19:30 in London).
        await page.clock.setFixedTime(new Date(`${reviewedToday}T18:30:00Z`));
        await page.goto(`${APP}/welcome`);
        await settle();
        const link = page.getByRole('link', { name: 'Edit my review' }).or(page.getByRole('button', { name: 'Edit my review' }));
        const text = await page.locator('.ui-root').first().innerText();
        pass(`Home ${tag}, the day reviewed: the card reads "Priorities for tomorrow"`, /Priorities for tomorrow/i.test(text), text.slice(0, 200));
        pass(`Home ${tag}, the day reviewed: the three priorities are listed`, /Call Evan about the proposal/.test(text) && /Book the venue/.test(text), text.slice(0, 300));
        pass(`Home ${tag}, the day reviewed: the link reads "Edit my review"`, (await link.count()) === 1 && await link.first().isVisible(), `${await link.count()} found`);
        pass(`Home ${tag}, the day reviewed: nothing says "Change my review"`, !/Change my review/i.test(text));
        if (await link.count()) {
          const b = await link.first().boundingBox();
          pass(`Home ${tag}, the day reviewed: the link's tap area is 44px`, b && b.height >= 43.5, b ? `${b.width.toFixed(0)} by ${b.height.toFixed(0)}` : 'not on screen');
          await shot('home-day-reviewed');
          await link.first().click();
          await page.waitForURL(/\/daily-review/, { timeout: 10000 }).catch(() => null);
          pass(`Home ${tag}, the day reviewed: "Edit my review" opens the Daily review`, /\/daily-review/.test(page.url()), page.url().replace(APP, ''));
        }
      } catch (e) { pass(`Home's "Edit my review" ${tag}: checked`, false, e.message.split('\n')[0]); }
      reviewedToday = false;
      await context.close();

      // ------------------------------------------------ the outside Health Check: "Edit the exact date"
      const hc = await browser.newContext(base);
      try {
        const p2 = await openHealthCheck(hc, { ok: true, status: 'in_progress', current_step: { screen: 'when', pi: 0, mode: 'full' }, data: hcAnswers(), version: 1, updated_at: '2026-10-27 09:30:00.123', completed_at: null, client_label: 'Kestrel Group', coach_name: 'Tim' });
        await p2.locator('#hc-email').fill('sam.example@invented.test');
        await p2.locator('#hc-code').fill('ABC234');
        await p2.locator('form button[type=submit]').click();
        await p2.locator('.hc-main .page h2').first().waitFor({ timeout: 15000 });
        await p2.evaluate(() => document.fonts.ready);
        await sleep(800);
        const edit = p2.getByRole('button', { name: 'Edit the exact date' });
        const text = await p2.locator('.hc-main').innerText();
        pass(`Health Check, when it started ${tag}: opened on the project's dates`, /Enterprise sales team/.test(text), text.slice(0, 160));
        pass(`Health Check, when it started ${tag}: the saved day shows, with "Edit the exact date"`, /18 Dec 2026/.test(text) && (await edit.count()) === 1, `${await edit.count()} found; ${text.replace(/\s+/g, ' ').slice(0, 200)}`);
        pass(`Health Check, when it started ${tag}: nothing says "Change the exact date"`, !/Change the exact date/i.test(text));
        if (out) await p2.screenshot({ path: join(out, `health-check-exact-date-${size}-${mode}.png`), fullPage: true });
        if (await edit.count()) {
          const b = await edit.first().boundingBox();
          pass(`Health Check, when it started ${tag}: the link's tap area is 44px high`, b && b.height >= 43.5, b ? `${b.width.toFixed(0)} by ${b.height.toFixed(0)}` : 'not on screen');
          await edit.first().click();
          await sleep(600);
          const panel = await p2.evaluate(() => { const d = document.querySelector('[role=dialog], .panel, .sheet'); return d ? d.innerText.replace(/\s+/g, ' ').slice(0, 200) : ''; });
          pass(`Health Check, when it started ${tag}: "Edit the exact date" opens the day picker`, /December 2026|Dec 2026/.test(panel), panel || 'no panel opened');
          if (out) await p2.screenshot({ path: join(out, `health-check-exact-date-open-${size}-${mode}.png`), fullPage: true });
        }
      } catch (e) { pass(`Health Check's "Edit the exact date" ${tag}: checked`, false, e.message.split('\n')[0]); }
      await hc.close();

      // ------------------------------------------------ Windows high-contrast mode (forced colours)
      const forced = await browser.newContext({ ...base, forcedColors: 'active', deviceScaleFactor: 2 });
      await blockOthers(forced);
      const fp = await forced.newPage();
      try {
        await signIn(fp);
        await fp.goto(`${APP}/performance-sprint`);
        await settle(fp);
        const icons = await fp.evaluate(maskedIcons, '.ds-chevron, .ds-cross');
        pass(`high contrast, sprint page ${tag}: the system's text colour differs from its page colour`, icons.text !== icons.canvas, `${icons.text} on ${icons.canvas}`);
        pass(`high contrast, sprint page ${tag}: every chevron is in the system's text colour (${icons.icons.length})`, icons.icons.length >= 2 && icons.icons.every((i) => i.colour === icons.text), icons.icons.filter((i) => i.colour !== icons.text).slice(0, 4).map((i) => `${i.name} ${i.colour}`).join('; ') || `${icons.icons.length} found`);
        // And they can be seen: read from the screen's own pixels.
        const drawn = await measureChevrons(fp);
        const unseen = (drawn.skipped || []).filter((s) => s.why === 'nothing drawn');
        pass(`high contrast, sprint page ${tag}: the chevrons are drawn on the screen (${drawn.length} read)`, drawn.length >= 1 && unseen.length === 0, unseen.map((s) => s.label).join('; ') || `${drawn.length} read`);
        if (out) await fp.screenshot({ path: join(out, `high-contrast-sprint-page-${size}-${mode}.png`), fullPage: true });
        // The close crosshair, in a panel (Add a to-do; closed again, nothing saved).
        await fp.getByRole('button', { name: 'Add a to-do' }).first().click({ timeout: 5000 });
        await fp.locator('[role=dialog]').first().waitFor({ timeout: 8000 });
        await sleep(500);
        const close = await fp.evaluate(maskedIcons, '[role=dialog] .ds-cross');
        pass(`high contrast, a panel ${tag}: the close crosshair is in the system's text colour`, close.icons.length >= 1 && close.icons.every((i) => i.colour === close.text), close.icons.map((i) => `${i.name} ${i.colour}`).join('; ') || 'no crosshair found');
        const box = await fp.locator('[role=dialog] .ds-cross').first().boundingBox();
        if (box) {
          const png = (await fp.screenshot({ clip: { x: Math.floor(box.x), y: Math.floor(box.y), width: Math.ceil(box.width), height: Math.ceil(box.height) } })).toString('base64');
          const colours = await fp.evaluate(async (data) => {
            const img = new Image(); img.src = `data:image/png;base64,${data}`; await img.decode();
            const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
            const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
            const px = ctx.getImageData(0, 0, c.width, c.height).data;
            let lo = 765; let hi = 0;
            for (let i = 0; i < px.length; i += 4) { const v = px[i] + px[i + 1] + px[i + 2]; lo = Math.min(lo, v); hi = Math.max(hi, v); }
            return hi - lo;
          }, png);
          pass(`high contrast, a panel ${tag}: the close crosshair is drawn on the screen`, colours > 300, `light to dark range ${colours}`);
        }
        if (out) await fp.screenshot({ path: join(out, `high-contrast-panel-${size}-${mode}.png`) });
      } catch (e) { pass(`high contrast, the portal ${tag}: checked`, false, e.message.split('\n')[0]); }
      await forced.close();

      const forcedHc = await browser.newContext({ ...base, forcedColors: 'active', deviceScaleFactor: 2 });
      try {
        const p3 = await openHealthCheck(forcedHc, { ok: true, status: 'in_progress', current_step: { screen: 'when', pi: 0, mode: 'full' }, data: hcAnswers(), version: 1, updated_at: '2026-10-27 09:30:00.123', completed_at: null, client_label: 'Kestrel Group', coach_name: 'Tim' });
        await p3.locator('#hc-email').waitFor({ timeout: 10000 });
        await p3.evaluate(() => document.fonts.ready);
        await sleep(600);
        const icons = await p3.evaluate(maskedIcons, '.hc .chev, .hc .x');
        pass(`high contrast, Health Check ${tag}: every chevron and crosshair is in the system's text colour (${icons.icons.length})`, icons.icons.length >= 1 && icons.icons.every((i) => i.colour === icons.text), icons.icons.map((i) => `${i.name} ${i.colour}`).join('; ') || 'none found');
        const drawn = await measureChevrons(p3);
        const unseen = (drawn.skipped || []).filter((s) => s.why === 'nothing drawn');
        pass(`high contrast, Health Check ${tag}: Back's chevron is drawn on the screen`, drawn.length >= 1 && unseen.length === 0, unseen.map((s) => s.label).join('; ') || `${drawn.length} read`);
        if (out) await p3.screenshot({ path: join(out, `high-contrast-health-check-${size}-${mode}.png`), fullPage: true });
      } catch (e) { pass(`high contrast, Health Check ${tag}: checked`, false, e.message.split('\n')[0]); }
      await forcedHc.close();

      // Ticked boxes, chosen pick-several answers, the small win and a done
      // plan step (functionality tester, 12 Nov): in high-contrast mode each
      // is filled with the system's text colour, with its tick in the page's,
      // and an unticked one is not filled. Read in the design gallery, which
      // shows them all with no sign-in (local and previews only); once a run.
      if (!ticksRead) {
        ticksRead = true;
        const forcedGallery = await browser.newContext({ ...base, forcedColors: 'active' });
        await forcedGallery.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => route.abort());
        try {
          const gp = await forcedGallery.newPage();
          await gp.goto(`${APP}/design-reference`);
          await gp.locator('.ds-check-box').first().waitFor({ state: 'attached', timeout: 30000 });
          await gp.evaluate(() => document.fonts.ready);
          await sleep(800);
          const ticks = await gp.evaluate(() => {
            const probe = document.createElement('span');
            probe.style.cssText = 'color: CanvasText; background-color: Canvas; forced-color-adjust: none;';
            document.body.appendChild(probe);
            const text = getComputedStyle(probe).color;
            const canvas = getComputedStyle(probe).backgroundColor;
            probe.remove();
            const shown = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
            const read = (selector) => [...document.querySelectorAll(selector)].filter(shown).map((el) => ({ fill: getComputedStyle(el).backgroundColor, tick: el.querySelector('svg') ? getComputedStyle(el.querySelector('svg')).stroke : '' }));
            return {
              text,
              canvas,
              on: {
                'a ticked box': read('.ds-check-box[aria-checked="true"] > span'),
                'a chosen pick-several answer': read('.ds-answer--pick[aria-pressed="true"] .ds-pick-mark'),
                'the small win': read('.ds-win-tick'),
                'a done plan step': read('.ds-planstep--done .ds-planstep-mark'),
              },
              off: {
                'an unticked box': read('.ds-check-box[aria-checked="false"] > span'),
                'an answer not chosen': read('.ds-answer--pick[aria-pressed="false"] .ds-pick-mark'),
              },
            };
          });
          for (const [name, list] of Object.entries(ticks.on)) {
            pass(`high contrast, the gallery: ${name} is filled with the system's text colour, its tick in the page's (${list.length})`, list.length >= 1 && list.every((t) => t.fill === ticks.text && t.tick === ticks.canvas), list.length ? [...new Set(list.map((t) => `${t.fill}, tick ${t.tick}`))].join('; ') : 'none found');
          }
          // A switch (break-it, 12 Nov): two flat colours with no edge, so nothing of it showed in this mode.
          // (The gallery's switches start off: the first is turned on here. Nothing is saved; the gallery reaches no database.)
          await gp.locator('.ds-switch').first().click({ timeout: 5000 }).catch(() => null);
          await sleep(400);
          const switches = await gp.evaluate(() => [...document.querySelectorAll('.ds-switch')].filter((el) => el.getBoundingClientRect().width > 0).map((el) => ({ on: el.getAttribute('aria-checked') === 'true', track: getComputedStyle(el).backgroundColor, edge: getComputedStyle(el).borderTopColor, edgeWidth: parseFloat(getComputedStyle(el).borderTopWidth), knob: getComputedStyle(el, '::after').backgroundColor })));
          const offOnes = switches.filter((sw) => !sw.on);
          const onOnes = switches.filter((sw) => sw.on);
          pass(`high contrast, the gallery: a switch that is off shows its edge and its knob in the system's text colour (${offOnes.length})`, offOnes.length >= 1 && offOnes.every((sw) => sw.edgeWidth >= 1 && sw.edge === ticks.text && sw.knob === ticks.text && sw.track === ticks.canvas), offOnes.length ? JSON.stringify(offOnes[0]) : 'none found');
          pass(`high contrast, the gallery: a switch that is on is filled with the system's text colour, its knob in the page's (${onOnes.length})`, onOnes.length >= 1 && onOnes.every((sw) => sw.track === ticks.text && sw.knob === ticks.canvas), onOnes.length ? JSON.stringify(onOnes[0]) : 'none found');
          for (const [name, list] of Object.entries(ticks.off)) {
            pass(`high contrast, the gallery: ${name} is not filled, so it differs from a ticked one (${list.length})`, list.length >= 1 && list.every((t) => t.fill !== ticks.text), list.length ? [...new Set(list.map((t) => t.fill))].join('; ') : 'none found');
          }
        } catch (e) { pass('high contrast, the gallery: ticked parts checked', false, e.message.split('\n')[0]); }
        await forcedGallery.close();
      }
    }
  }
} finally {
  await browser.close();
}

console.log(fails.join('\n'));
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
