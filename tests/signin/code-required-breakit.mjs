// The break-it tester's browser checks of 054 (Phase 6a run 6, 22 Nov):
// every way of reaching the coach portal without the 6-digit code. The
// database is stood in as 054 makes it answer (coachWorld's coachData,
// with a sign-in from before a reset answered as aal1, as coach_code_ok()
// now answers it). Nothing reaches the test project or anything hosted, no
// real authenticator is enrolled, nothing is sent, and no code, key,
// password or token is printed.
//
//   APP_URL=http://localhost:4317 node --import ./tests/scores/register.mjs tests/signin/code-required-breakit.mjs
//   PARTS=deep,stale,out,client,offline
//
//   deep     an associate at aal1 (code owed) types every coach address,
//            deep ones included, and the screens that come after the code
//   stale    an aal2 sign-in from before the owner's reset: Coach sign in
//            with the reason, and no coach data, on every address
//   out      signed out: every coach address and every sign-in screen
//            lands on Coach sign in, with nothing of the coach portal drawn
//   client   a client signed in types the coach addresses: Home, nothing
//            of the coach portal, no coach call answered
//   offline  the code owed with no connection: still held, nothing drawn
import { chromium } from 'playwright';
import { APP, makeChecks, sleep } from './shared.mjs';
import { COACH_DATA_MARKER, makeWorld } from './coachWorld.mjs';

const PARTS = (process.env.PARTS || 'deep,stale,out,client,offline').split(',');
const ID = '00000000-0000-4000-8000-0000000000aa';
const COACH = ['/coach', '/coach/todos', '/coach/calendar', '/coach/calendar/book', '/coach/calendar/polls/new', '/coach/clients', `/coach/clients/${ID}`,
  '/coach/clients/past', '/coach/clients?tab=workshops', '/coach/leads', `/coach/leads/${ID}`, '/coach/leads/cold', '/coach/leads/automations',
  '/coach/network', `/coach/network/${ID}`, '/coach/boards', `/coach/boards/${ID}`, '/coach/finances', '/coach/business', `/coach/sessions/${ID}`,
  '/coach/settings', '/coach/settings/coaches', '/coach/settings/you', '/coach/organisations', '/coach/not-a-page'];
const AFTER_CODE = ['/coach/sign-in/recovery-codes', '/coach/sign-in/in', '/my-account/sign-in-security'];
const SIGN_IN = ['/coach/sign-in/code', '/coach/sign-in/set-up', '/coach/sign-in/recovery-codes', '/coach/sign-in/in'];
const { pass, done } = makeChecks();
const browser = await chromium.launch();
const path = (page) => new URL(page.url()).pathname;

async function device(world, { aal = 'aal1', signedOut = false, fromBeforeReset = false, size = 1440 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: size, height: size > 600 ? 1000 : 844 }, colorScheme: 'dark', locale: 'en-GB', timezoneId: 'Europe/London', serviceWorkers: 'block' });
  await ctx.addInitScript(() => {
    window.__coachShown = 0;
    const look = () => { if (document.querySelector('[class^="cc-"], [class*=" cc-"]')) window.__coachShown += 1; };
    new MutationObserver(look).observe(document, { childList: true, subtree: true });
  });
  await world.attach(ctx, { signedOut, aal, fromBeforeReset });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 140)));
  const leaks = [];
  page.on('response', async (r) => {
    try {
      if ((await r.text()).includes(COACH_DATA_MARKER)) leaks.push(new URL(r.url()).pathname);
    } catch { /* a body that can't be read */ }
  });
  return { ctx, page, errors, leaks };
}
async function settle(page, re) {
  await page.waitForURL((u) => re.test(u.pathname), { timeout: 20000 }).catch(() => null);
  await sleep(900);
  return {
    at: path(page),
    shown: await page.evaluate(() => window.__coachShown),
    inPage: await page.evaluate((m) => document.documentElement.outerHTML.includes(m), COACH_DATA_MARKER),
    text: (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' '),
  };
}
function closing(label, world, d) {
  const gave = world.coachAnswers.filter((a) => a.gave);
  pass(`${label}: every coach answer was empty or refused`, gave.length === 0, gave.map((a) => a.path).slice(0, 4).join(', '));
  pass(`${label}: no response the page received held coach data`, d.leaks.length === 0, d.leaks.slice(0, 4).join(', '));
  pass(`${label}: no page errors`, d.errors.length === 0, d.errors.slice(0, 2).join(' | '));
}

if (PARTS.includes('deep')) {
  for (const size of [1440, 400]) {
    const label = `deep, code owed, ${size}`;
    const world = makeWorld({ factor: 'verified', live: true, coachData: true });
    const d = await device(world, { size });
    for (const go of [...COACH, ...AFTER_CODE]) {
      await d.page.goto(`${APP}${go}`);
      let s = await settle(d.page, /\/coach\/sign-in\/code$/);
      if (go === '/coach/sign-in/in' && s.at === go) {
        // You're in, opened with nothing to say (as after a reload): it says only to carry on, and carrying on asks for the code.
        await d.page.locator('form button[type=submit]').first().click().catch(() => null);
        s = await settle(d.page, /\/coach\/sign-in\/code$/);
      }
      pass(`${label}: ${go} holds them at Enter your code`, s.at === '/coach/sign-in/code', s.at);
      pass(`${label}: ${go}: nothing of the coach portal drew, no coach data in the page`, s.shown === 0 && !s.inPage, `${s.shown}, ${s.inPage}`);
    }
    // Back from the code page never shows the coach portal either.
    await d.page.goBack().catch(() => null);
    const b = await settle(d.page, /\/coach\/sign-in\/code$|\/coach\/sign-in$/);
    pass(`${label}: Back from the code page shows nothing of the coach portal`, b.shown === 0 && !b.inPage, `${b.at} ${b.shown}`);
    closing(label, world, d);
    await d.ctx.close();
  }
}

if (PARTS.includes('stale')) {
  const label = 'stale, aal2 from before the reset';
  const world = makeWorld({ factor: 'verified', live: true, coachData: true });
  const d = await device(world, { aal: 'aal2', fromBeforeReset: true });
  for (const go of ['/coach', '/coach/clients', `/coach/leads/${ID}`, '/coach/network', '/coach/settings/coaches', '/coach/sign-in/recovery-codes']) {
    await d.page.goto(`${APP}${go}`);
    const s = await settle(d.page, /\/coach\/sign-in(\/code)?$/);
    pass(`${label}: ${go} goes to Coach sign in (or the code), never the coach portal`, /^\/coach\/sign-in(\/code)?$/.test(s.at), s.at);
    pass(`${label}: ${go}: nothing of the coach portal drew, no coach data`, s.shown === 0 && !s.inPage, `${s.shown}, ${s.inPage}`);
  }
  closing(label, world, d);
  await d.ctx.close();
}

if (PARTS.includes('out')) {
  const label = 'signed out';
  const world = makeWorld({ factor: 'verified', live: true, coachData: true });
  const d = await device(world, { signedOut: true });
  for (const go of [...COACH, ...SIGN_IN]) {
    await d.page.goto(`${APP}${go}`);
    const s = await settle(d.page, /\/coach\/sign-in$/);
    pass(`${label}: ${go} lands on Coach sign in`, s.at === '/coach/sign-in', s.at);
    pass(`${label}: ${go}: nothing of the coach portal drew`, s.shown === 0 && !s.inPage, `${s.shown}, ${s.inPage}`);
  }
  closing(label, world, d);
  await d.ctx.close();
}

if (PARTS.includes('client')) {
  const label = 'a client';
  const world = makeWorld({ role: 'client', live: true, coachData: true });
  const d = await device(world, { aal: 'aal1' });
  for (const go of ['/coach', '/coach/clients', `/coach/leads/${ID}`, '/coach/network', '/coach/settings/coaches', ...SIGN_IN]) {
    await d.page.goto(`${APP}${go}`);
    const s = await settle(d.page, /^\/(welcome|coach\/sign-in.*|sign-in.*)$/);
    pass(`${label}: ${go} never opens the coach portal`, !/^\/coach(\/(?!sign-in)|$)/.test(s.at), s.at);
    pass(`${label}: ${go}: nothing of the coach portal drew, no coach data`, s.shown === 0 && !s.inPage, `${s.shown}, ${s.inPage}`);
  }
  closing(label, world, d);
  await d.ctx.close();
}

if (PARTS.includes('offline')) {
  const label = 'offline, code owed';
  const world = makeWorld({ factor: 'verified', live: true, coachData: true });
  const d = await device(world);
  await d.page.goto(`${APP}/coach/clients`);
  await settle(d.page, /\/coach\/sign-in\/code$/);
  world.down = true;
  await d.ctx.setOffline(true);
  for (const go of ['/coach', '/coach/network']) {
    await d.page.goto(`${APP}${go}`).catch(() => null);
    const s = await settle(d.page, /\/coach\/sign-in\/code$/);
    pass(`${label}: ${go} with no connection: nothing of the coach portal drew`, s.shown === 0 && !s.inPage, `${s.at} ${s.shown}`);
  }
  await d.ctx.setOffline(false);
  world.down = false;
  closing(label, world, d);
  await d.ctx.close();
}

await browser.close();
done();
