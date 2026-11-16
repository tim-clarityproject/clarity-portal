// What the outside Health Check's browser suites share (compare-m7b.mjs,
// flow.mjs, text size): the mock-up's own invented answers (Kestrel Group),
// a page on the dev server with the two database calls answered here, never
// a real link, and every email call and everything outside localhost
// blocked, so nothing is sent. No fonts are added: the page loads its own.
import { readFileSync } from 'node:fs';

export const APP = process.env.APP_URL || 'http://localhost:5173';
export const TOKEN = 'tok-hc-m7b-0000000000000000000000000000';
export const EMAIL = 'sam.example@invented.test';
export const CODE = 'ABC234';
/** The code 045 gives the guest when they choose Only you (stand-in). */
export const NEW_CODE = 'NEW789';

export const CSF = ['Win and keep enterprise clients', 'A product customers recommend', 'A team with the right skills in the right roles', 'Cash to invest ahead of growth'];
export const PR = [
  { t: 'Enterprise sales team', c: [3, 2, 2, 3], p: 2, r: 5, s: '2025-09', f: '2026-12' },
  { t: 'Customer success programme', c: [3, 3, 1, 2], p: 4, r: 3, s: '2026-01', f: '2027-03' },
  { t: 'Pricing review', c: [2, 2, 0, 3], p: 3, r: 2, s: '2026-06', f: '2026-12' },
  { t: 'Hiring plan for 2027', c: [2, 1, 2, 2], p: 1, r: 4, s: '2026-10', f: '2027-06' },
  { t: 'Partner channel', c: [2, 1, 1, 1], p: 3, r: 3, s: '2026-04', f: 'open' },
  { t: 'New office fit-out', c: [0, 0, 1, 1], p: 4, r: 4, s: '2026-07', f: '2026-11' },
  { t: 'Data platform', c: [1, 3, 1, 2], p: 5, r: 3, s: '2025-11', f: '2026-12' },
];
/** The mock-up's Health Check as saved data. `projects`: another list of names, each rated by its place. */
export const kestrel = ({ complete = true, projects = null } = {}) => {
  const list = projects ? projects.map((t, i) => ({ t, c: CSF.map((_, k) => (i + k) % 4), p: (i % 5) + 1, r: ((i * 2) % 5) + 1, s: '2026-01', f: i % 3 ? '2027-03' : 'open' })) : PR;
  return {
    objective: 'Double recurring revenue by 2028 while keeping client satisfaction above 9 out of 10.',
    csfs: CSF.map((text, i) => ({ id: `f${i}`, text, level: [3, 2, 2, 1][i] })),
    projects: list.map((p, i) => ({ id: `p${i}`, text: p.t, started: p.s, due: p.f })),
    ratings: { owner: Object.fromEntries(list.map((p, i) => [`p${i}`, { contrib: Object.fromEntries(p.c.map((v, k) => [`f${k}`, v])), progress: p.p, resource: p.r }])) },
    ...(complete ? { completedAt: '2026-10-27T09:00:00.000Z' } : {}),
  };
};

/**
 * A page on the outside Health Check.
 * opts: complete, step (the saved current_step), data (saved answers), watched (the Quick guide), textTwice,
 *       coach (the coach's first name), height, scale (screen pixels per point), motion (true: animations run),
 *       storage ({ key: value } already in the device's localStorage), shared (the saved choice, 044; default true),
 *       no044 (a database without migration 044: no sharing function, nothing about it from alignment_open),
 *       with045 (migration 045: the first Only you replaces the code with NEW_CODE, the old one then opens and saves nothing)
 * Returns { ctx, page, session, problems }: problems collects console errors and page errors.
 */
export async function appPage(browser, width, mode, opts = {}) {
  const { complete = false, step = { screen: 'objective' }, data, watched = true, textTwice = false, coach = 'Tim', height } = opts;
  const phone = width <= 600;
  const ctx = await browser.newContext({
    viewport: { width, height: height || (phone ? 844 : 900) }, isMobile: phone, hasTouch: phone, deviceScaleFactor: opts.scale || (phone ? 2 : 1),
    colorScheme: mode, reducedMotion: opts.motion ? 'no-preference' : 'reduce', locale: 'en-GB', timezoneId: 'Europe/London',
  });
  const session = {
    email: EMAIL, code: CODE, status: complete ? 'complete' : 'in_progress', data: data || kestrel({ complete }), current_step: step, version: 1, saves: 0, emails: [], outside: [], fonts: [],
    // 044: the guest's choice, and whether the coach's completion email has gone (as alignment_email_check keeps it)
    shared: opts.shared !== false, notified: false, coachEmails: 0, sharingCalls: [],
  };
  // Every font file the page asks for, wherever from (none is added by a test).
  ctx.on('request', (r) => { if (r.resourceType() === 'font' && !r.url().startsWith('data:')) session.fonts.push(r.url().replace(/\?.*$/, '')); });
  await ctx.route(/^https?:\/\/(?!localhost)/, (route) => {
    const url = route.request().url();
    const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (url.endsWith('/rpc/alignment_open')) {
      const b = JSON.parse(route.request().postData() || '{}');
      if (String(b.p_code || '').toUpperCase() !== session.code) return json({ ok: false, error: 'invalid' });
      return json({ ok: true, status: session.status, current_step: session.current_step, data: session.data, version: session.version, updated_at: '2026-10-27 09:30:00.123', completed_at: session.status === 'complete' ? '2026-10-27 09:30:00' : null, client_label: 'Kestrel Group', coach_name: coach, ...(opts.no044 ? {} : { shared_with_coach: session.shared }) });
    }
    if (url.endsWith('/rpc/alignment_set_sharing')) {
      const b = JSON.parse(route.request().postData() || '{}');
      session.sharingCalls.push(b.p_shared);
      if (opts.no044) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST202', details: null, hint: null, message: 'Could not find the function public.alignment_set_sharing in the schema cache' }) });
      if (String(b.p_code || '').toUpperCase() !== session.code) return json({ ok: false, error: 'invalid' });
      session.shared = b.p_shared === true;
      let fresh = false;
      if (opts.with045 && !session.shared && !session.reissued) {
        session.reissued = true;
        session.oldCode = session.code;
        session.code = NEW_CODE;
        fresh = true;
      }
      return json({ ok: true, shared_with_coach: session.shared, status: session.status, notified: session.notified, ...(opts.with045 ? { new_code: fresh } : {}) });
    }
    if (url.endsWith('/rpc/alignment_save')) {
      const b = JSON.parse(route.request().postData() || '{}');
      if (opts.with045 && String(b.p_code || '').toUpperCase() !== session.code) {
        session.refusedSaves = (session.refusedSaves || 0) + 1;
        return json({ ok: false, error: 'invalid', message: 'Those details don’t match. Check the email and access code you were sent.' });
      }
      session.data = b.p_data; session.current_step = b.p_current_step; session.version += 1; session.saves += 1;
      if (b.p_complete) session.status = 'complete';
      return json({ ok: true, version: session.version, updated_at: '2026-10-27 10:00:00', status: session.status });
    }
    session.outside.push(url.replace(/\?.*$/, ''));
    return route.abort();
  });
  await ctx.route(/localhost:\d+\/health-check\/[^/.]+$/, async (route) => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const r = await route.fetch({ url: `${APP}/health-check.html` });
    return route.fulfill({ response: r });
  });
  // Never a real email: every /api/ call is answered here, as the server
  // would after alignment_email_check (044: 'private' for Only you, nothing
  // marked as sent; 'already' once the coach's email has gone).
  await ctx.route('**/api/**', (route) => {
    const sent = JSON.parse(route.request().postData() || '{}');
    const kind = sent.kind || 'other';
    session.emails.push(kind);
    const reply = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    // 045: the new code goes to the guest's own address; the reply never holds it
    if (kind === 'code') {
      const known = [session.code, session.oldCode].includes(String(sent.code || '').toUpperCase());
      return known && session.reissued ? reply({ ok: true, sent: true }) : route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'invalid' }) });
    }
    if (kind === 'complete') {
      if (!opts.no044 && !session.shared) return reply({ ok: false, error: 'private' });
      if (session.notified) return reply({ ok: false, error: 'already' });
      session.notified = true;
      session.coachEmails += 1;
    }
    return reply({ ok: true });
  });
  if (textTwice) await ctx.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = 'html { font-size: 32px !important; }'; document.head.appendChild(st); }); });
  // storage: what the device already holds before the page loads ({ key: value } in localStorage).
  if (opts.storage) await ctx.addInitScript((kept) => { try { for (const [k, v] of Object.entries(kept)) localStorage.setItem(k, v); } catch { /* blocked */ } }, opts.storage);
  if (watched) await ctx.addInitScript(() => { try { localStorage.setItem('hc-quick-guide-watched', '1'); } catch { /* blocked */ } });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR_FAILED|Failed to load resource|WebSocket|\[vite\]|Vite server/.test(m.text())) problems.push(`console: ${m.text().slice(0, 600)}`); });
  await page.goto(`${APP}/health-check/${TOKEN}`);
  await page.locator('.ds-guest-title, .ds-guest-question').first().waitFor();
  return { ctx, page, session, problems };
}

/** From the welcome (or the email and code screen) into the Health Check. */
export async function signIn(page, session) {
  const begin = page.getByRole('button', { name: 'Begin the Health Check' });
  if (await begin.isVisible().catch(() => false)) await begin.click();
  await page.getByLabel('Email').fill(session.email);
  await page.getByLabel('Access code').fill(session.code);
  await page.locator('form button[type=submit]').click();
  await page.locator('.ds-guide .ds-guide-question, .ds-guide .ds-guide-title').first().waitFor();
  // The guided tool ignores a press in its first 400ms (the second half of a double tap).
  await page.waitForTimeout(500);
}

/** The saved step for each of M7b's guided screens (project 2, the first Success Factor, as its switcher). */
export const STEPS = {
  objective: { screen: 'objective' },
  csf: { screen: 'csf' },
  weight: { screen: 'weight' },
  projects: { screen: 'projects' },
  contrib: { screen: 'contrib', project: 1, factor: 0 },
  when: { screen: 'when', project: 1 },
  progress: { screen: 'progress', project: 1 },
  resource: { screen: 'resource', project: 1 },
};

export const readText = (p) => readFileSync(p, 'utf8');
