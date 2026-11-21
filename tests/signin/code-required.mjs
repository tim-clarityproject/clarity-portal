// The database asks for the 6-digit code (Phase 6a run 6, migration 054).
// A coach signed in with the password only (aal1) who types the coach
// portal's addresses straight in is held at Enter your code (or Set up your
// authenticator), and gets nothing back: nothing of the coach portal draws,
// no coach data is in the page, and every answer the database gave them was
// empty or a refusal. The database is stood in as 054 makes it answer
// (coachWorld's coachData: coach tables read empty and coach functions
// refuse at aal1; at aal2 they hold one invented client). Nothing reaches
// the test project or anything hosted, no real authenticator is enrolled,
// nothing is sent, and no code, key, password or token is printed.
//
//   APP_URL=http://localhost:4317 node --import ./tests/scores/register.mjs tests/signin/code-required.mjs
//   PARTS=code,setup,owner,direct
//
//   code    an associate with an authenticator, the code not given yet
//   setup   an associate with no authenticator yet
//   owner   the owner, the code not given yet
//   direct  the page's own token sent straight to the database, as someone
//           with only the password would (aal1: nothing), then the same
//           after the code is given (aal2: the stand-in's client), so the
//           refusals above are the code's and not an empty stand-in
import { chromium } from 'playwright';
import { APP, TEST_REF, makeChecks, sleep } from './shared.mjs';
import { COACH_DATA_MARKER, makeWorld, OWNER } from './coachWorld.mjs';
import { totp } from './totp.mjs';

const PARTS = (process.env.PARTS || 'code,setup,owner,direct').split(',');
const ADDRESSES = ['/coach', '/coach/clients', '/coach/leads', '/coach/network', '/coach/calendar'];
const { pass, done } = makeChecks();
const browser = await chromium.launch();
const path = (page) => new URL(page.url()).pathname;
const DB = `https://${TEST_REF}.supabase.co`;

async function device(world, { aal = 'aal1' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark', locale: 'en-GB', timezoneId: 'Europe/London', serviceWorkers: 'block' });
  // Anything of the coach portal itself ever drawn (its frame's classes start cc-).
  await ctx.addInitScript(() => {
    window.__coachShown = 0;
    const look = () => { if (document.querySelector('[class^="cc-"], [class*=" cc-"]')) window.__coachShown += 1; };
    new MutationObserver(look).observe(document, { childList: true, subtree: true });
  });
  await world.attach(ctx, { signedOut: false, aal });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 140)));
  // Every answer the page received, looked through for the invented client.
  const leaks = [];
  page.on('response', async (r) => {
    try {
      const text = await r.text();
      if (text.includes(COACH_DATA_MARKER)) leaks.push(new URL(r.url()).pathname);
    } catch { /* a body that can't be read (a redirect, an image) */ }
  });
  return { ctx, page, errors, leaks };
}
async function waitPath(page, re, timeout = 20000) {
  await page.waitForURL((u) => re.test(u.pathname), { timeout }).catch(() => null);
  return path(page);
}

for (const [part, label, o, owed] of [
  ['code', 'an associate, the code owed', { factor: 'verified' }, /\/coach\/sign-in\/code$/],
  ['setup', 'an associate, set-up owed', { factor: 'none', codesMade: false, codesSaved: false }, /\/coach\/sign-in\/set-up$/],
  ['owner', 'the owner, the code owed', { factor: 'verified', role: 'owner', user: { id: OWNER.id, email: 'tess.owner@harbourlane.co', first: 'Tess' } }, /\/coach\/sign-in\/code$/],
]) {
  if (!PARTS.includes(part)) continue;
  const world = makeWorld({ ...o, live: true, coachData: true });
  const d = await device(world, { aal: 'aal1' });
  for (const go of ADDRESSES) {
    await d.page.goto(`${APP}${go}`);
    const at = await waitPath(d.page, owed);
    await sleep(1200);
    const shown = await d.page.evaluate(() => window.__coachShown);
    const inPage = await d.page.evaluate((m) => document.documentElement.outerHTML.includes(m), COACH_DATA_MARKER);
    pass(`054 (${label}): typing ${go} at aal1 holds them at ${owed.source.replace(/\\/g, '').replace(/\$$/, '')}`, owed.test(at), at);
    pass(`054 (${label}): ${go}: nothing of the coach portal drew, and no coach data is in the page`, shown === 0 && !inPage, `${shown}, ${inPage}`);
  }
  const gave = world.coachAnswers.filter((a) => a.gave);
  pass(`054 (${label}): every coach answer at aal1 was empty or refused`, gave.length === 0, gave.map((a) => a.path).join(', '));
  pass(`054 (${label}): no response the page received held coach data`, d.leaks.length === 0, d.leaks.join(', '));
  pass(`054 (${label}): no page errors`, d.errors.length === 0, d.errors.slice(0, 2).join(' | '));
  await d.ctx.close();
}

if (PARTS.includes('direct')) {
  const label = 'straight to the database';
  const world = makeWorld({ factor: 'verified', live: true, coachData: true });
  const d = await device(world, { aal: 'aal1' });
  await d.page.goto(`${APP}/coach/clients`);
  await waitPath(d.page, /\/coach\/sign-in\/code$/);
  const ask = () => d.page.evaluate(async ({ db }) => {
    const token = JSON.parse(localStorage.getItem('clarity-portal-auth') || '{}').access_token || '';
    const h = { Authorization: `Bearer ${token}`, apikey: 'stand-in', 'Content-Type': 'application/json' };
    const out = {};
    for (const t of ['client_profiles', 'client_notes', 'coach_todos', 'coach_leads', 'network_people', 'coach_cal_items']) {
      const r = await fetch(`${db}/rest/v1/${t}?select=*`, { headers: h });
      out[t] = `${r.status}:${(await r.json()).length ?? 'x'}`;
    }
    for (const f of ['coach_admin_clients', 'network_page', 'coach_list']) {
      const r = await fetch(`${db}/rest/v1/rpc/${f}`, { method: 'POST', headers: h, body: '{}' });
      out[f] = String(r.status);
    }
    const w = await fetch(`${db}/rest/v1/coach_todos`, { method: 'POST', headers: h, body: JSON.stringify({ title: 'x' }) });
    out.write = String(w.status);
    return out;
  }, { db: DB });
  const before = await ask();
  pass(`054 (${label}): at aal1 every coach table reads empty`, ['client_profiles', 'client_notes', 'coach_todos', 'coach_leads', 'network_people', 'coach_cal_items'].every((t) => before[t] === '200:0'), JSON.stringify(before));
  pass(`054 (${label}): at aal1 every coach function and write is refused`, ['coach_admin_clients', 'network_page', 'coach_list', 'write'].every((k) => before[k] === '403'), JSON.stringify(before));
  // Now the code, as the page asks for it.
  await d.page.getByRole('textbox', { name: 'Code', exact: true }).fill(totp(world.keys.values().next().value));
  await d.page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await d.page.waitForURL((u) => !/\/sign-in\//.test(u.pathname), { timeout: 20000 }).catch(() => null);
  await sleep(1500);
  const after = await ask();
  pass(`054 (${label}): after the code (aal2) the same reads answer, so the refusals were the code's`, after.client_profiles === '200:1' && after.coach_admin_clients === '200', JSON.stringify(after));
  await d.ctx.close();
}

await browser.close();
done();
