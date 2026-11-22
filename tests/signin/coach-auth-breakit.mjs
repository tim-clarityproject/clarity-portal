// The coach authenticator, tried the wrong way on purpose (Phase 6a run 5,
// the break-it tester; the run's prompt, step 4). Each part is one way a
// person, a second tab, a lost connection or someone who shouldn't be there
// might get round it, in the running app, with Supabase's sign-in and MFA,
// migration 053's functions and the server's reset stood in by one world
// per part that behaves as the real ones do (coachWorld.mjs). Nothing
// reaches the test project but the owner's own read-only sign-in in part
// "resetoffline" (the coach portal's stand-ins, tests/coach). No real
// authenticator is enrolled, no email is sent, and no key, code, password,
// token or email address is printed.
//
//   APP_URL=http://localhost:4317 node --import ./tests/scores/register.mjs tests/signin/coach-auth-breakit.mjs
//   PARTS=reuse,twotabs,sixtabs,wait,recwait,skip,back,server,offline,resetoffline,stale,typed,sixletters,file,newcodes,secrets,sw,text
//
//   reuse        a recovery code used, then tried again: on the same device, on another
//   twotabs      two tabs pressing Sign in with the same recovery code at the same instant
//   sixtabs      two tabs giving the same 6-digit code at once
//   wait         5 wrong 6-digit codes: the wait, said calmly; trying during it; a reload
//                and a new tab still wait; after it, the right code; the count after
//   recwait      the same for recovery codes, held by the database (053), not the page
//   skip         typing /coach, /coach/settings or a deep link while set-up, the code or
//                the codes are owed
//   back         Back from the codes screen, then forward (the page's Back and the browser's)
//   server       the reset and the "recovered" call from the wrong people, with forged bodies
//   offline      each screen with no connection, then the connection back
//   resetoffline the owner's Reset it with no connection, then back (the owner's real
//                read-only test sign-in, the portal's data stood in)
//   stale        a sign-in from before the reset: an open tab, a token refreshed after it
//                (where the database can and can't end sessions), a second device, and its
//                own calls to 053
//   typed        a recovery code typed with spaces, dashes, capitals, unseen characters,
//                full-width letters, 200 characters, or nothing
//   sixletters   a 6-digit code typed with letters
//   file         the downloaded codes file read back
//   newcodes     Make new codes twice quickly in two tabs: one set wins
//   secrets      the key and the codes after leaving their screens: the address, storage,
//                console, title, history, live regions
//   sw           the service worker's cache never holds an answer from Supabase or /api/
//   text         every screen at twice the text size, at 1440 and 400
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { APP, TEST_REF, makeChecks, sleep } from './shared.mjs';
import { claimsOf, makeWorld, M26_CODES, M26_KEY, MAYA_PASSWORD } from './coachWorld.mjs';
import { totp } from './totp.mjs';
import {
  CODE_DIDNT_WORK, CODES_REPLACED, COACH_AUTH_WORDS, RECOVERY_DIDNT_WORK, SIGNED_OUT_BY_RESET, TYPE_RECOVERY_CODE, usedCodeLine, waitWords, plainKey, keyInGroups, codesLeftSummary,
} from '../../src/lib/signIn/coachAuth.js';
import { CODE_SIX_DIGITS } from '../../src/lib/signIn/words.js';
import { RESET_WORDS } from '../../api/coach-auth-reset.js';

const ALL = 'reuse,twotabs,sixtabs,wait,recwait,skip,back,server,offline,resetoffline,stale,typed,sixletters,file,newcodes,secrets,sw,text';
const PARTS = (process.env.PARTS || ALL).split(',');
const { pass, done } = makeChecks();
const browser = await chromium.launch();

const NEW_PHONE_KEY = 'KRUGKIDROVUWG2ZAMJZG653OEBTG66BA'; // invented
const SAM = { id: '00000000-0000-4000-8000-0000000005a0', email: 'sam.carter@harbourlane.co', first: 'Sam' };
const path = (page) => new URL(page.url()).pathname;
const squash = (t) => String(t || '').replace(/\s+/g, ' ').trim();
const flat = (lines) => (Array.isArray(lines) ? lines.join(' ') : String(lines));
const words = (page, sel = '.si-col') => page.locator(sel).first().innerText().then(squash).catch(() => '');
const message = (page) => page.locator('.si-err').first().innerText().then((t) => squash(t).replace(/^! /, '')).catch(() => '');
const codeBox = (page) => page.getByRole('textbox', { name: 'Code', exact: true });
const recBox = (page) => page.getByRole('textbox', { name: 'Recovery code' });
const press = (page, name) => page.getByRole('button', { name, exact: true }).click();
const verifies = (world) => world.calls.filter((c) => /\/auth\/v1\/factors\/:id\/verify$/.test(c)).length;
const uses = (world) => world.calls.filter((c) => /rpc\/coach_recovery_code_use$/.test(c)).length;
const bad = (world) => world.calls.filter((c) => c.startsWith('blocked'));
const signedOutLine = flat(SIGNED_OUT_BY_RESET);
const offLine = (what) => `${what} needs a connection, so try again when you’re back online.`;

async function waitPath(page, re, timeout = 20000) {
  await page.waitForURL((u) => re.test(u.pathname), { timeout }).catch(() => null);
  return path(page);
}
async function waitMessage(page, timeout = 10000) {
  await page.waitForSelector('.si-err', { timeout }).catch(() => null);
  return message(page);
}

/** A computer or phone for this account. `coachWatch` notes any coach portal part that ever showed. */
async function device(world, { width = 1440, mode = 'dark', signedIn = false, aal = 'aal2', scale = 1, sw = false } = {}) {
  const phone = width < 700;
  const ctx = await browser.newContext({ viewport: { width, height: phone ? 844 : 1000 }, colorScheme: mode, locale: 'en-GB', timezoneId: 'Europe/London', hasTouch: phone, isMobile: phone, serviceWorkers: sw ? 'allow' : 'block', acceptDownloads: true });
  await ctx.addInitScript((m) => { try { localStorage.setItem('clarity-colour-mode', m); } catch { /* the device's mode */ } }, mode);
  if (scale !== 1) await ctx.addInitScript((px) => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = `html{font-size:${px}px !important}`; document.head.appendChild(st); }); }, 16 * scale);
  // Anything of the coach portal itself ever drawn (its frame's classes start cc-).
  await ctx.addInitScript(() => {
    window.__coachShown = 0;
    const look = () => { if (document.querySelector('[class^="cc-"], [class*=" cc-"]')) window.__coachShown += 1; };
    new MutationObserver(look).observe(document, { childList: true, subtree: true });
  });
  await world.attach(ctx, { signedOut: !signedIn, aal });
  const page = await ctx.newPage();
  const errors = [];
  const consoleLines = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 140)));
  page.on('console', (m) => consoleLines.push(m.text()));
  return { ctx, page, errors, consoleLines };
}
async function newTab(ctx) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 140)));
  return { page, errors };
}

async function signIn(page, world, at = '/coach/sign-in') {
  await page.goto(`${APP}${at}`);
  await page.waitForSelector('.si-col .si-btn', { timeout: 20000 });
  await page.locator('input[type=email]').fill(world.user.email);
  await page.locator('.si-pw input').fill(MAYA_PASSWORD);
  await press(page, 'Sign in');
}
async function giveCode(page, key, button = 'Sign in') {
  await codeBox(page).waitFor({ timeout: 15000 });
  await codeBox(page).fill(totp(key));
  await press(page, button);
}
async function keyOnPage(page) {
  await page.waitForFunction(() => /[A-Z2-7]{4}/.test(document.querySelector('.si-key')?.textContent || ''), null, { timeout: 15000 }).catch(() => null);
  return (await page.locator('.si-key').innerText().catch(() => '')).replace(/\s+/g, '');
}
async function codesOnPage(page) {
  await page.waitForSelector('.si-rc li', { timeout: 15000 }).catch(() => null);
  return page.locator('.si-rc li').allInnerTexts();
}
async function useRecovery(page, typed) {
  await recBox(page).waitFor({ timeout: 15000 }).catch(() => null);
  await recBox(page).fill(typed);
  await press(page, 'Sign in');
}
/** A token for an invented owner (the stand-in checks no signature). */
function ownerToken(ownerId, aal = 'aal2') {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const t = Math.floor(Date.now() / 1000);
  return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ sub: ownerId, role: 'authenticated', aal, amr: [{ method: 'totp', timestamp: t }, { method: 'password', timestamp: t }], session_id: 'stand-in', iat: t, exp: t + 3600 })}.c3RhbmQtaW4`;
}
const tokenOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('clarity-portal-auth') || '{}').access_token || null);

// ---------------------------------------------------------------- reusing a recovery code
if (PARTS.includes('reuse')) {
  const tag = 'Reuse';
  const world = makeWorld({ factor: 'verified', live: true });
  const a = await device(world);
  await signIn(a.page, world);
  await waitPath(a.page, /\/code$/);
  await a.page.getByRole('link', { name: 'Lost your authenticator app?' }).click();
  await useRecovery(a.page, 'k7q2-9fmd');
  pass(`${tag}: the code gets in once`, (await waitPath(a.page, /\/in$/)) === '/coach/sign-in/in' && world.left() === 9, path(a.page));
  // Back in the same tab, the same code again.
  await a.page.goto(`${APP}/coach/sign-in/help`);
  await useRecovery(a.page, 'k7q2-9fmd');
  const again = await waitMessage(a.page);
  pass(`${tag}: the same code again in the same tab is refused, with the wrong code's words`, again === flat(RECOVERY_DIDNT_WORK) && path(a.page) === '/coach/sign-in/help' && world.left() === 9, `"${again}"`);
  // On another device, written a different way (a second later: a sign-in begun in the
  // same second as the code was used counts as from before it, and is ended, run 7).
  await sleep(1100);
  const b = await device(world, { width: 400, mode: 'light' });
  await signIn(b.page, world);
  await waitPath(b.page, /\/(code|set-up)$/);
  await b.page.goto(`${APP}/coach/sign-in/help`);
  await useRecovery(b.page, 'K7Q2 9FMD');
  const other = await waitMessage(b.page);
  pass(`${tag}: on another device, in capitals, still refused with the same words`, other === flat(RECOVERY_DIDNT_WORK) && world.left() === 9, `"${other}"`);
  pass(`${tag}: nothing reached anywhere but the stand-ins`, bad(world).length === 0);
  pass(`${tag}: no page errors`, [...a.errors, ...b.errors].length === 0, [...a.errors, ...b.errors].slice(0, 2).join(' | '));
  await a.ctx.close(); await b.ctx.close();
}

// ---------------------------------------------------------------- two tabs, one recovery code, the same instant
if (PARTS.includes('twotabs')) {
  const tag = 'Two tabs, one recovery code';
  const world = makeWorld({ factor: 'verified', live: true });
  const d = await device(world);
  await signIn(d.page, world);
  await waitPath(d.page, /\/code$/);
  const t2 = await newTab(d.ctx);
  for (const p of [d.page, t2.page]) { await p.goto(`${APP}/coach/sign-in/help`); await recBox(p).waitFor({ timeout: 15000 }); await recBox(p).fill('x3vp-r8tn'); }
  // Both presses go before either answer lands.
  await Promise.all([d.page.locator('.si-btn').first().dispatchEvent('click'), t2.page.locator('.si-btn').first().dispatchEvent('click')]);
  await sleep(2500);
  const ends = [path(d.page), path(t2.page)].sort();
  pass(`${tag}: one gets in, the other stays`, ends[0] === '/coach/sign-in/help' && ends[1] === '/coach/sign-in/in', ends.join(', '));
  const loser = path(d.page) === '/coach/sign-in/help' ? d.page : t2.page;
  pass(`${tag}: the other is told exactly what a wrong code is told`, (await message(loser)) === flat(RECOVERY_DIDNT_WORK), `"${await message(loser)}"`);
  pass(`${tag}: the code was used once, and both asked the database`, world.left() === 9 && uses(world) === 2, `${world.left()} left, ${uses(world)} asked`);
  pass(`${tag}: no page errors`, [...d.errors, ...t2.errors].length === 0);
  await d.ctx.close();
}

// ---------------------------------------------------------------- two tabs, one 6-digit code
if (PARTS.includes('sixtabs')) {
  const tag = 'Two tabs, one 6-digit code';
  const world = makeWorld({ factor: 'verified', live: true });
  const d = await device(world);
  await signIn(d.page, world);
  await waitPath(d.page, /\/code$/);
  const t2 = await newTab(d.ctx);
  await t2.page.goto(`${APP}/coach/sign-in/code`);
  const code = totp(M26_KEY);
  for (const p of [d.page, t2.page]) { await codeBox(p).waitFor({ timeout: 15000 }); await codeBox(p).fill(code); }
  await Promise.all([d.page.locator('.si-btn').first().dispatchEvent('click'), t2.page.locator('.si-btn').first().dispatchEvent('click')]);
  await sleep(3000);
  const ends = [path(d.page), path(t2.page)];
  // The tab that came to the code page by its own address has no place to go back to, so it goes Home.
  pass(`${tag}: both tabs are the same sign-in, so both get in (the first to the coach portal)`, ends[0] === '/coach' && ['/coach', '/welcome'].includes(ends[1]), ends.join(', '));
  pass(`${tag}: neither shows a message`, (await d.page.locator('.si-err').count()) + (await t2.page.locator('.si-err').count()) === 0);
  pass(`${tag}: still one sign-in on this device`, world.sessions.size === 1, `${world.sessions.size}`);
  pass(`${tag}: no page errors`, [...d.errors, ...t2.errors].length === 0, [...d.errors, ...t2.errors].slice(0, 2).join(' | '));
  await d.ctx.close();
}

// ---------------------------------------------------------------- wrong 6-digit codes in a row
if (PARTS.includes('wait')) {
  const tag = 'Wrong 6-digit codes';
  const world = makeWorld({ factor: 'verified', live: true });
  const d = await device(world);
  await signIn(d.page, world);
  await waitPath(d.page, /\/code$/);
  const wrong = totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'); // another key's code: never this account's
  const said = [];
  for (let i = 1; i <= 5; i += 1) {
    await codeBox(d.page).fill(wrong);
    await press(d.page, 'Sign in');
    await sleep(400);
    said.push(await waitMessage(d.page));
  }
  pass(`${tag}: the 1st to 4th say "That code didn’t work. Check the time on your phone and try again."`, said.slice(0, 4).every((s) => s === flat(CODE_DIDNT_WORK)), said.slice(0, 4).join(' | '));
  pass(`${tag}: the 5th says it calmly: "That was 5 wrong codes in a row. Wait 30 seconds, then try again."`, said[4] === flat(waitWords(30, { justNow: true })), said[4]);
  pass(`${tag}: no coral alarm, no "fail", no shouting`, !/fail|locked|blocked|!/i.test(said[4].replace(/^!/, '')));
  const asked = verifies(world);
  await giveCode(d.page, M26_KEY);
  const during = await waitMessage(d.page);
  pass(`${tag}: the right code during the wait waits, and Supabase isn't asked`, /^Wait \d+ seconds?, then try again\.$/.test(during) && verifies(world) === asked && path(d.page) === '/coach/sign-in/code', `"${during}"`);
  await d.page.reload();
  await giveCode(d.page, M26_KEY);
  const afterReload = await waitMessage(d.page);
  pass(`${tag}: after a reload it still waits`, /^Wait \d+ seconds?, then try again\.$/.test(afterReload) && verifies(world) === asked, `"${afterReload}"`);
  const t2 = await newTab(d.ctx);
  await t2.page.goto(`${APP}/coach/sign-in/code`);
  await giveCode(t2.page, M26_KEY);
  const newTabSaid = await waitMessage(t2.page);
  pass(`${tag}: a new tab still waits (kept on the device, not the tab)`, /^Wait \d+ seconds?, then try again\.$/.test(newTabSaid) && verifies(world) === asked, `"${newTabSaid}" ${path(t2.page)}`);
  console.log(`INFO  ${tag}: the 6-digit code is Supabase's to check, so this wait is the page's; a script calling Supabase directly meets only Supabase's own limit`);
  // The 30 seconds pass (the wait's end moved back, as a clock would).
  await d.page.evaluate(() => { const k = 'clarity-sign-in-code-tries'; const s = JSON.parse(localStorage.getItem(k) || '{}'); s.waitUntil = Date.now() - 1000; localStorage.setItem(k, JSON.stringify(s)); });
  await codeBox(d.page).fill(wrong);
  await press(d.page, 'Sign in');
  pass(`${tag}: after the wait, a wrong code starts the count again`, (await waitMessage(d.page)) === flat(CODE_DIDNT_WORK));
  await giveCode(d.page, M26_KEY);
  pass(`${tag}: then the right code gets in`, (await waitPath(d.page, /^\/coach$/)) === '/coach', path(d.page));
  const kept = await d.page.evaluate(() => localStorage.getItem('clarity-sign-in-code-tries'));
  pass(`${tag}: and the count is cleared after a right code`, kept === null);
  pass(`${tag}: no page errors`, [...d.errors, ...t2.errors].length === 0, [...d.errors, ...t2.errors].slice(0, 2).join(' | '));
  await d.ctx.close();
}

// ---------------------------------------------------------------- wrong recovery codes in a row (the database's wait)
if (PARTS.includes('recwait')) {
  const tag = 'Wrong recovery codes';
  const world = makeWorld({ factor: 'verified', live: true });
  const d = await device(world);
  await signIn(d.page, world);
  await waitPath(d.page, /\/code$/);
  await d.page.goto(`${APP}/coach/sign-in/help`);
  const said = [];
  for (let i = 1; i <= 5; i += 1) { await useRecovery(d.page, `zzzz-zzz${i + 1}`); await sleep(300); said.push(await waitMessage(d.page)); }
  pass(`${tag}: the 1st to 4th: one calm line that names no part`, said.slice(0, 4).every((s) => s === flat(RECOVERY_DIDNT_WORK)), said.slice(0, 4).join(' | '));
  pass(`${tag}: the 5th: "That was 5 wrong codes in a row. Wait 30 seconds, then try again."`, said[4] === flat(waitWords(30, { justNow: true })), said[4]);
  const asked = uses(world);
  await useRecovery(d.page, 'k7q2-9fmd');
  const during = await waitMessage(d.page);
  pass(`${tag}: a right code during the wait waits, and isn't spent`, /^Wait \d+ seconds?, then try again\.$/.test(during) && world.left() === 10, `"${during}"`);
  pass(`${tag}: the wait came from the database (it was asked)`, uses(world) === asked + 1);
  await d.page.reload();
  await useRecovery(d.page, 'k7q2-9fmd');
  pass(`${tag}: after a reload it still waits`, /^Wait \d+ seconds?/.test(await waitMessage(d.page)) && world.left() === 10);
  // Another device entirely: the database holds the wait, not the page.
  const other = await device(world, { width: 400, mode: 'light' });
  await signIn(other.page, world);
  await waitPath(other.page, /\/code$/);
  await other.page.goto(`${APP}/coach/sign-in/help`);
  await useRecovery(other.page, 'k7q2-9fmd');
  pass(`${tag}: another device (nothing of the page's) still waits: the database holds it`, /^Wait \d+ seconds?/.test(await waitMessage(other.page)) && world.left() === 10, path(other.page));
  world.waitUntil = Date.now() - 1000; // the 30 seconds pass
  await useRecovery(d.page, 'zzzz-zzzz');
  pass(`${tag}: after the wait the count starts again (a wrong code: the calm line)`, (await waitMessage(d.page)) === flat(RECOVERY_DIDNT_WORK) && world.wrongRecovery === 1);
  await useRecovery(d.page, 'k7q2-9fmd');
  pass(`${tag}: the right code gets in`, (await waitPath(d.page, /\/in$/)) === '/coach/sign-in/in' && world.left() === 9);
  pass(`${tag}: the count after a right code is nothing`, world.wrongRecovery === 0 && world.waitUntil === 0);
  pass(`${tag}: no page errors`, [...d.errors, ...other.errors].length === 0);
  await d.ctx.close(); await other.ctx.close();
}

// ---------------------------------------------------------------- skipping a stop by typing an address
if (PARTS.includes('skip')) {
  const DEEP = ['/coach', '/coach/settings', '/coach/settings/coaches?view=all#top', '/coach/clients/00000000-0000-4000-8000-00000000abcd', '/coach/todos', '/coach/calendar'];
  for (const [label, o, aal, owed] of [
    ['set-up owed', { factor: 'none', codesMade: false, codesSaved: false }, 'aal1', /\/set-up$/],
    ['the code owed', { factor: 'verified' }, 'aal1', /\/code$/],
    ['the codes owed', { factor: 'verified', codesSaved: false }, 'aal2', /\/recovery-codes$/],
  ]) {
    const world = makeWorld({ ...o, live: true });
    const d = await device(world, { signedIn: true, aal });
    for (const go of DEEP) {
      await d.page.goto(`${APP}${go}`);
      const at = await waitPath(d.page, owed);
      await sleep(400);
      const shown = await d.page.evaluate(() => window.__coachShown);
      pass(`Skip (${label}): typing ${go.split('?')[0]} lands on the stop, and nothing of the coach portal ever drew`, owed.test(at) && shown === 0, `${at}, ${shown}`);
    }
    // The sign-in pages themselves, opened by address, never let them past.
    for (const go of ['/coach/sign-in/in', '/coach/sign-in/code']) {
      await d.page.goto(`${APP}${go}`);
      await sleep(2500);
      const btn = d.page.locator('.si-col .si-btn').first();
      if (await btn.isVisible().catch(() => false) && go === '/coach/sign-in/in') { await btn.click().catch(() => null); await sleep(2000); }
      const shown = await d.page.evaluate(() => window.__coachShown);
      pass(`Skip (${label}): ${go} opened by its address doesn't open the coach portal`, path(d.page) !== '/coach' && shown === 0, `${path(d.page)}, ${shown}`);
    }
    // Sign-in security (not a coach portal address).
    await d.page.goto(`${APP}/my-account/sign-in-security`);
    await sleep(2500);
    const madeBefore = world.madeSets;
    if (await d.page.getByRole('button', { name: 'Make new codes' }).isVisible().catch(() => false)) {
      await d.page.getByRole('button', { name: 'Make new codes' }).click();
      await codeBox(d.page).fill('123456').catch(() => null);
      await press(d.page, 'Carry on').catch(() => null);
      await sleep(1500);
    }
    pass(`Skip (${label}): Sign-in security makes no codes without the current code`, world.madeSets === madeBefore, `${world.madeSets} sets, at ${path(d.page)}`);
    await d.page.goto(`${APP}/coach`);
    pass(`Skip (${label}): and /coach after it still asks`, owed.test(await waitPath(d.page, owed)), path(d.page));
    // Coach sign in opened while half in lets that sign-in go (sign-in rule 33): never the portal.
    await d.page.goto(`${APP}/coach/sign-in`);
    await sleep(2500);
    await d.page.goto(`${APP}/coach`);
    await sleep(2500);
    pass(`Skip (${label}): opening Coach sign in, then /coach: still not the coach portal`, (await d.page.evaluate(() => window.__coachShown)) === 0 && path(d.page) !== '/coach', path(d.page));
    pass(`Skip (${label}): no page errors`, d.errors.length === 0, d.errors.slice(0, 2).join(' | '));
    await d.ctx.close();
  }
}

// ---------------------------------------------------------------- Back from the codes screen, then forward
if (PARTS.includes('back')) {
  const tag = 'Back and forward';
  const world = makeWorld({ factor: 'none', codesMade: false, codesSaved: false, firstMake: 'random', live: true });
  const d = await device(world);
  await signIn(d.page, world);
  await waitPath(d.page, /set-up$/);
  const k1 = await keyOnPage(d.page);
  await giveCode(d.page, k1, 'Turn it on');
  await waitPath(d.page, /recovery-codes$/);
  const first = await codesOnPage(d.page);
  // The page's own Back.
  await d.page.getByRole('link', { name: 'Back' }).first().click();
  pass(`${tag}: the page's Back returns to set-up`, (await waitPath(d.page, /set-up$/)) === '/coach/sign-in/set-up', path(d.page));
  const k2 = await keyOnPage(d.page);
  pass(`${tag}: with a new key, the first one still on until the new one is`, k2 && k2 !== k1 && world.factors.filter((f) => f.status === 'verified').length === 1, `${world.factors.length} factors`);
  // The browser's back: the codes again, the same set (held in the tab), none made.
  await d.page.goBack().catch(() => null);
  await sleep(1500);
  const backAt = path(d.page);
  const backCodes = backAt.endsWith('recovery-codes') ? await codesOnPage(d.page) : [];
  pass(`${tag}: the browser's back shows the same codes, none made again`, backAt === '/coach/sign-in/recovery-codes' && backCodes.join() === first.join() && world.madeSets === 1, `${backAt}, ${world.madeSets} sets`);
  // Then forward: set-up again, never the coach portal.
  await d.page.goForward().catch(() => null);
  await sleep(1500);
  pass(`${tag}: then the browser's forward is set-up again, never the coach portal`, path(d.page) === '/coach/sign-in/set-up' && (await d.page.evaluate(() => window.__coachShown)) === 0, path(d.page));
  // Set up again from there with the newest key: the same codes, the old phone off.
  const k3 = await keyOnPage(d.page);
  await giveCode(d.page, k3, 'Turn it on');
  await waitPath(d.page, /recovery-codes$/);
  const afterAgain = await codesOnPage(d.page);
  const on = world.factors.filter((f) => f.status === 'verified');
  pass(`${tag}: set up again: one authenticator on, the newest; the same codes`, on.length === 1 && afterAgain.join() === first.join() && world.madeSets === 1, `${on.length} on, ${world.madeSets} sets`);
  // Typing /coach (a full load, nothing held): the codes are still owed, so a new set replaces the unsaved one.
  await d.page.goto(`${APP}/coach`);
  pass(`${tag}: /coach still asks for the codes to be ticked`, (await waitPath(d.page, /recovery-codes$/)) === '/coach/sign-in/recovery-codes', path(d.page));
  const fresh = await codesOnPage(d.page);
  pass(`${tag}: a full load holds nothing, so a new set replaces the unsaved one`, fresh.length === 10 && fresh.join() !== first.join() && world.madeSets === 2, `${world.madeSets} sets`);
  await d.page.getByRole('checkbox', { name: 'I’ve saved them somewhere safe' }).click();
  await press(d.page, 'Open the coach portal');
  pass(`${tag}: ticked, into the coach portal`, (await waitPath(d.page, /^\/coach$/)) === '/coach' && world.codesSaved, path(d.page));
  // Back from the coach portal: the saved codes must never be replaced.
  await d.page.goBack().catch(() => null);
  await sleep(2500);
  pass(`${tag}: Back from the coach portal makes no new codes and shows none`, world.madeSets === 2 && world.codesSaved && (await d.page.locator('.si-rc li').count()) === 0, `${path(d.page)}, ${world.madeSets} sets`);
  await d.page.goto(`${APP}/coach/sign-in/recovery-codes`);
  await sleep(2500);
  pass(`${tag}: nor does the codes address typed once they are saved: the saved codes still work`, world.madeSets === 2 && world.codesSaved && (await d.page.locator('.si-rc li').count()) === 0, `${path(d.page)}, ${world.madeSets} sets`);
  pass(`${tag}: no page errors`, d.errors.length === 0, d.errors.slice(0, 2).join(' | '));
  await d.ctx.close();
}

// ---------------------------------------------------------------- the server and 053, called by the wrong people
if (PARTS.includes('server')) {
  const tag = 'Server';
  const world = makeWorld({ factor: 'verified', live: true });
  const mayaCoach = world.coaches.find((c) => c.user_id === world.user.id).id;
  const ownerRow = world.coaches.find((c) => c.role === 'owner');
  const maya = world.sessionOut(world.newSession({ aal: 'aal2' })).access_token;
  const own = ownerToken(ownerRow.user_id);
  const before = () => JSON.stringify([world.factors.length, world.codeRows.length, world.resets.length]);
  const was = before();
  let out = await world.serve({ kind: 'reset', coachId: ownerRow.id }, `Bearer ${maya}`);
  pass(`${tag}: an associate resetting the owner: 403, "Only the owner can reset an authenticator."`, out.status === 403 && out.body.message === RESET_WORDS.notOwner && before() === was, `${out.status}`);
  out = await world.serve({ kind: 'reset', coachId: mayaCoach }, `Bearer ${maya}`);
  pass(`${tag}: an associate resetting themself: 403`, out.status === 403 && before() === was, `${out.status}`);
  pass(`${tag}: an associate calling 053's reset: 42501`, world.rpc('coach_authenticator_reset', { p_coach: ownerRow.id }, claimsOf(maya)).body.code === '42501');
  // Through the browser, with their own sign-in: the same.
  const d = await device(world, { signedIn: true, aal: 'aal2' });
  await d.page.goto(`${APP}/coach`);
  await sleep(1500);
  const viaPage = await d.page.evaluate(async ({ coachId, ref }) => {
    const s = JSON.parse(localStorage.getItem('clarity-portal-auth') || '{}');
    const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${s.access_token}` };
    const a = await fetch('/api/coach-auth-reset', { method: 'POST', headers: h, body: JSON.stringify({ kind: 'reset', coachId }) });
    const b = await fetch(`https://${ref}.supabase.co/rest/v1/rpc/coach_authenticator_reset`, { method: 'POST', headers: h, body: JSON.stringify({ p_coach: coachId }) });
    return { server: a.status, db: b.status, code: (await b.json().catch(() => ({}))).code };
  }, { coachId: ownerRow.id, ref: TEST_REF });
  pass(`${tag}: from the associate's own page, the server says 403 and the database 42501`, viaPage.server === 403 && viaPage.code === '42501' && before() === was, JSON.stringify(viaPage));
  await d.ctx.close();
  // A client.
  const client = makeWorld({ role: 'client', factor: 'none', live: true, user: SAM, coaches: [{ id: ownerRow.id, user_id: ownerRow.user_id, role: 'owner', active: true, display_first_name: 'Tim' }] });
  const sam = client.sessionOut(client.newSession({ aal: 'aal2' })).access_token;
  out = await client.serve({ kind: 'reset', coachId: ownerRow.id }, `Bearer ${sam}`);
  pass(`${tag}: a client calling the reset: 403`, out.status === 403 && out.body.message === RESET_WORDS.notOwner, `${out.status}`);
  out = await client.serve({ kind: 'recovered' }, `Bearer ${sam}`);
  pass(`${tag}: a client calling "recovered": 403`, out.status === 403, `${out.status}`);
  pass(`${tag}: a client calling 053's reset and state`, client.rpc('coach_authenticator_reset', { p_coach: ownerRow.id }, claimsOf(sam)).body.code === '42501' && client.rpc('coach_auth_state', {}, claimsOf(sam)).body.coach === false);
  // Someone signed out.
  for (const [label, auth] of [['no sign-in', undefined], ['an empty one', 'Bearer '], ['a made-up one', 'Bearer not.a.token'], ['someone else\'s scheme', 'Basic dXNlcjpwYXNz']]) {
    out = await world.serve({ kind: 'reset', coachId: mayaCoach }, auth);
    pass(`${tag}: signed out (${label}): 401, "Sign in again to carry on."`, out.status === 401 && out.body.message === RESET_WORDS.signIn && before() === was, `${out.status}`);
  }
  pass(`${tag}: signed out, 053 says 42501`, world.rpc('coach_authenticator_reset', { p_coach: mayaCoach }, null).body.code === '42501' && world.rpc('coach_recovery_code_use', { p_code: 'k7q29fmd' }, null).body.code === '42501');
  // The owner on their own.
  out = await world.serve({ kind: 'reset', coachId: ownerRow.id }, `Bearer ${own}`);
  pass(`${tag}: the owner resetting themself through the server: 400, with their way back`, out.status === 400 && out.body.message === RESET_WORDS.self && before() === was, `${out.status}`);
  out = await world.serve({ kind: 'reset', coachId: mayaCoach }, `Bearer ${ownerToken(ownerRow.user_id, 'aal1')}`);
  pass(`${tag}: the owner without their own code (aal1): 403, asked for it`, out.status === 403 && out.body.needsCode === true && before() === was, `${out.status}`);
  // Forged bodies.
  for (const [label, body, want] of [
    ['a coachId that isn\'t an id', { kind: 'reset', coachId: "x' or 1=1 --" }, 400],
    ['an array', { kind: 'reset', coachId: [mayaCoach] }, 400],
    ['an object', { kind: 'reset', coachId: { id: mayaCoach } }, 400],
    ['no coachId', { kind: 'reset' }, 400],
    ['an unknown kind', { kind: 'reset-all', coachId: mayaCoach }, 400],
    ['no body', null, 400],
    ['the owner\'s account id in place of a coach id', { kind: 'reset', coachId: ownerRow.user_id }, 404],
    ['an associate\'s account id in place of their coach id', { kind: 'reset', coachId: world.user.id }, 404],
  ]) {
    out = await world.serve(body, `Bearer ${own}`);
    pass(`${tag}: forged body (${label}): ${want}, nothing changed`, out.status === want && before() === was, `${out.status}`);
  }
  out = await world.serve({ kind: 'reset', coachId: ownerRow.id, userId: world.user.id, target: mayaCoach }, `Bearer ${own}`);
  pass(`${tag}: forged body naming another target beside the owner's own id: still "self", nobody reset`, out.status === 400 && before() === was, `${out.status}`);
  out = await world.serve({ kind: 'recovered', userId: ownerRow.user_id }, `Bearer ${maya}`);
  pass(`${tag}: "recovered" naming another account: only ever the caller's own, and refused without a recovery code`, out.status === 403 && out.body.message === RESET_WORDS.notRecovered && before() === was, `${out.status}`);
  out = await world.serve({ kind: 'reset', coachId: mayaCoach, userId: ownerRow.user_id }, `Bearer ${own}`);
  pass(`${tag}: a real reset with an extra id naming the owner: only the coach named by coachId is reset`, out.status === 200 && world.resets.length === 1 && world.resets[0].whom === world.user.id && world.factors.length === 0, `${out.status}`);
  pass(`${tag}: the service key never comes back`, !/service-stand-in/.test(JSON.stringify(world.server)) && !/service/i.test(JSON.stringify(out.body)));
}

// ---------------------------------------------------------------- offline on each screen, and coming back
if (PARTS.includes('offline')) {
  const goOff = async (d, world) => { world.down = true; await d.ctx.setOffline(true); };
  const goOn = async (d, world) => { world.down = false; await d.ctx.setOffline(false); await sleep(800); };
  // Enter your code.
  {
    const world = makeWorld({ factor: 'verified', live: true });
    const d = await device(world);
    await signIn(d.page, world);
    await waitPath(d.page, /\/code$/);
    await goOff(d, world);
    await giveCode(d.page, M26_KEY);
    pass('Offline, Enter your code: one calm line', (await waitMessage(d.page)) === offLine('Signing in'));
    pass('Offline, Enter your code: a press with no connection isn\'t counted as a wrong code', (await d.page.evaluate(() => localStorage.getItem('clarity-sign-in-code-tries'))) === null);
    await goOn(d, world);
    await giveCode(d.page, M26_KEY);
    pass('Back online, Enter your code: the same press gets in', (await waitPath(d.page, /^\/coach$/)) === '/coach', path(d.page));
    await d.ctx.close();
  }
  // Lost your authenticator app?
  {
    const world = makeWorld({ factor: 'verified', live: true });
    const d = await device(world);
    await signIn(d.page, world);
    await waitPath(d.page, /\/code$/);
    await d.page.goto(`${APP}/coach/sign-in/help`);
    await recBox(d.page).waitFor({ timeout: 15000 });
    await goOff(d, world);
    await useRecovery(d.page, 'k7q2-9fmd');
    pass('Offline, Lost your authenticator app?: one calm line, and the code isn\'t spent', (await waitMessage(d.page)) === offLine('Signing in') && world.left() === 10);
    await goOn(d, world);
    await useRecovery(d.page, 'k7q2-9fmd');
    pass('Back online, Lost: the same code gets in', (await waitPath(d.page, /\/in$/)) === '/coach/sign-in/in' && world.left() === 9, path(d.page));
    // You're in: Set it up with no connection, then back.
    await goOff(d, world);
    await press(d.page, COACH_AUTH_WORDS.in.button);
    await waitPath(d.page, /set-up$/);
    pass('Offline, You’re in, then set-up: one calm line', (await waitMessage(d.page)) === offLine('Setting up your authenticator'), await message(d.page));
    await goOn(d, world);
    await codeBox(d.page).fill('123456');
    await press(d.page, 'Turn it on');
    await sleep(1500);
    const key = await keyOnPage(d.page);
    const back = await message(d.page);
    pass('Back online, set-up: pressing Turn it on starts it again (a key shows, nothing stuck)', key.length >= 16 && world.enrolled >= 1, `${world.enrolled} enrolled, "${back}"`);
    if (key) {
      await giveCode(d.page, key, 'Turn it on');
      pass('Back online, set-up: and the new phone turns on', (await waitPath(d.page, /^\/coach$|recovery-codes$/)) !== '/coach/sign-in/set-up', path(d.page));
    }
    await d.ctx.close();
  }
  // Save your recovery codes, opened with no connection.
  {
    const world = makeWorld({ factor: 'verified', codesSaved: false, live: true });
    const d = await device(world, { signedIn: true, aal: 'aal2' });
    await d.page.goto(`${APP}/coach`);
    await waitPath(d.page, /recovery-codes$/);
    await d.page.waitForSelector('.si-rc li', { timeout: 15000 }).catch(() => null);
    const made = world.madeSets;
    await goOff(d, world);
    await d.page.getByRole('checkbox', { name: 'I’ve saved them somewhere safe' }).click();
    await press(d.page, 'Open the coach portal');
    pass('Offline, the codes: the tick with no connection says one calm line', (await waitMessage(d.page)) === offLine('Making your recovery codes') && !world.codesSaved);
    await goOn(d, world);
    await press(d.page, 'Open the coach portal');
    pass('Back online, the codes: the same press opens the coach portal, with the same set', (await waitPath(d.page, /^\/coach$/)) === '/coach' && world.codesSaved && world.madeSets === made, path(d.page));
    await d.ctx.close();
    // Opened while offline.
    const w2 = makeWorld({ factor: 'verified', codesSaved: false, live: true });
    const d2 = await device(w2, { signedIn: true, aal: 'aal2' });
    await d2.page.goto(`${APP}/coach/sign-in/recovery-codes`);
    await sleep(1500);
    await goOff(d2, w2);
    await d2.page.goto(`${APP}/coach/sign-in/recovery-codes`).catch(() => null);
    const opened = await waitMessage(d2.page);
    pass('Offline, the codes opened with no connection: one calm line, or the app can\'t load at all', opened === offLine('Making your recovery codes') || opened === '', `"${opened}"`);
    await goOn(d2, w2);
    await d2.page.getByRole('checkbox', { name: 'I’ve saved them somewhere safe' }).click().catch(() => null);
    await press(d2.page, 'Open the coach portal').catch(() => null);
    await sleep(2000);
    const shown = await d2.page.locator('.si-rc li').count();
    console.log(`INFO  Back online on a codes page opened offline: ${shown} codes show after pressing; at ${path(d2.page)}`);
    await d2.ctx.close();
  }
  // My Account, Sign-in security.
  {
    const world = makeWorld({ factor: 'verified', codesLeft: 9, live: true, firstMake: 'random' });
    const d = await device(world, { signedIn: true, aal: 'aal2' });
    await d.page.goto(`${APP}/my-account/sign-in-security`);
    await d.page.waitForSelector('.si-srow', { timeout: 20000 });
    await d.page.getByRole('button', { name: 'Make new codes' }).click();
    await goOff(d, world);
    await giveCode(d.page, M26_KEY, 'Carry on');
    pass('Offline, Sign-in security: one calm line, nothing made', (await waitMessage(d.page)) === offLine('Sign-in security') && world.madeSets === 0);
    await goOn(d, world);
    await giveCode(d.page, M26_KEY, 'Carry on');
    pass('Back online, Sign-in security: the same press makes the codes', (await waitPath(d.page, /recovery-codes$/)) === '/coach/sign-in/recovery-codes' && world.madeSets === 1, path(d.page));
    await d.ctx.close();
  }
}

// ---------------------------------------------------------------- the owner's Reset it, offline and back
if (PARTS.includes('resetoffline')) {
  const { coachContext, standIn } = await import('../coach/shared.mjs');
  const octx = await coachContext(browser, { size: 1440, theme: 'dark' });
  const owner = await octx.newPage();
  const errs = [];
  owner.on('pageerror', (e) => errs.push(String(e.message).slice(0, 140)));
  const store = await standIn(owner, { role: 'owner', db: 'none' });
  let asked = 0;
  await owner.route('**/api/coach-auth-reset', async (route) => { asked += 1; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, ran: false, message: RESET_WORDS.notLive }) }); });
  await owner.goto(`${APP}/coach/settings/coaches`);
  await owner.getByRole('button', { name: /^More for / }).first().waitFor({ timeout: 25000 }).catch(() => null);
  await owner.getByRole('button', { name: /^More for / }).first().click();
  await owner.getByRole('menuitem', { name: 'Reset authenticator' }).click();
  await owner.getByRole('dialog').waitFor({ timeout: 10000 }).catch(() => null);
  await octx.setOffline(true);
  await press(owner, 'Reset it');
  await sleep(1000);
  pass('Offline, Reset it: one calm line, the server not asked', (await owner.getByText(offLine('Resetting an authenticator')).isVisible().catch(() => false)) && asked === 0);
  await octx.setOffline(false);
  await sleep(800);
  await press(owner, 'Reset it');
  await sleep(1500);
  pass('Back online, Reset it: the same press asks the server once', asked === 1, `${asked}`);
  pass('Reset offline: nothing was written to the test project', !store.calls.some((c) => /^blocked/.test(c)));
  pass('Reset offline: no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  await octx.close();
}

// ---------------------------------------------------------------- a sign-in from before the reset
if (PARTS.includes('stale')) {
  const resetMaya = async (world) => {
    const own = world.coaches.find((c) => c.role === 'owner');
    return world.serve({ kind: 'reset', coachId: world.coaches.find((c) => c.user_id === world.user.id).id }, `Bearer ${ownerToken(own.user_id)}`);
  };
  // An open tab, and a second device, where the database ends sessions.
  {
    const tag = 'Stale (sessions ended)';
    const world = makeWorld({ factor: 'verified', live: true });
    const laptop = await device(world, { signedIn: true, aal: 'aal2' });
    const phone = await device(world, { width: 400, mode: 'light', signedIn: true, aal: 'aal2' });
    for (const d of [laptop, phone]) { await d.page.goto(`${APP}/coach`); await sleep(1500); }
    const out = await resetMaya(world);
    pass(`${tag}: the reset ran and ended both sessions`, out.status === 200 && world.sessions.size === 0, `${out.status}`);
    // The open tab moves within the coach portal without a reload.
    await laptop.page.evaluate(() => { window.history.pushState({}, '', '/coach/settings'); window.dispatchEvent(new PopStateEvent('popstate')); });
    await sleep(3000);
    const moved = path(laptop.page);
    console.log(`INFO  ${tag}: an open tab moving within the coach portal after the reset, without a reload, is at ${moved}`);
    // Showing the tab again (a person coming back to it) asks again, at most every 10 seconds.
    await sleep(8000);
    await laptop.page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });
    await sleep(3000);
    pass(`${tag}: the open tab, coming back to it, is signed out and told why`, path(laptop.page) === '/coach/sign-in' && (await message(laptop.page)) === signedOutLine, `${path(laptop.page)}`);
    await phone.page.reload();
    await waitPath(phone.page, /^\/coach\/sign-in$/);
    pass(`${tag}: the second device, on its next load, is signed out and told why`, path(phone.page) === '/coach/sign-in' && (await waitMessage(phone.page)) === signedOutLine, path(phone.page));
    pass(`${tag}: nothing of either sign-in is left`, !(await laptop.page.evaluate(() => localStorage.getItem('clarity-portal-auth'))) && !(await phone.page.evaluate(() => localStorage.getItem('clarity-portal-auth'))));
    await laptop.ctx.close(); await phone.ctx.close();
  }
  // Where the database can't end sessions: refreshed tokens, and the old session's own calls.
  {
    const tag = 'Stale (sessions kept)';
    const world = makeWorld({ factor: 'verified', live: true, sqlReachesAuth: false });
    const d = await device(world, { signedIn: true, aal: 'aal2' });
    await d.page.goto(`${APP}/coach`);
    await sleep(1500);
    const oldToken = await tokenOf(d.page);
    await resetMaya(world);
    pass(`${tag}: the reset ran; the session stays (no admin call ends it)`, world.sessions.size === 1 && world.factors.length === 0);
    // Its own calls to 053, straight from the page, bypassing the screens.
    const direct = await d.page.evaluate(async ({ ref }) => {
      const s = JSON.parse(localStorage.getItem('clarity-portal-auth') || '{}');
      const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${s.access_token}` };
      const call = async (fn, body = {}) => (await (await fetch(`https://${ref}.supabase.co/rest/v1/rpc/${fn}`, { method: 'POST', headers: h, body: JSON.stringify(body) })).json()).status;
      return { make: await call('coach_recovery_codes_make'), on: await call('coach_authenticator_on', { p_factor: null }), saved: await call('coach_recovery_codes_saved') };
    }, { ref: TEST_REF });
    pass(`${tag}: the old sign-in can't make new codes, turn an authenticator on or tick, even calling 053 directly`, direct.make === 'signed_out' && direct.on === 'signed_out' && direct.saved === 'signed_out' && world.codeRows.length === 0 && !world.turnedOnAt, JSON.stringify(direct));
    // A token refreshed after the reset (a new iat, the old sign-in's amr).
    await d.page.evaluate(() => { const s = JSON.parse(localStorage.getItem('clarity-portal-auth')); s.expires_at = Math.floor(Date.now() / 1000) - 60; localStorage.setItem('clarity-portal-auth', JSON.stringify(s)); });
    await d.page.reload();
    await waitPath(d.page, /^\/coach\/sign-in$/);
    pass(`${tag}: after its token is refreshed, it is still signed out and told why`, path(d.page) === '/coach/sign-in' && (await waitMessage(d.page)) === signedOutLine, path(d.page));
    pass(`${tag}: the refreshed token kept the old sign-in's time`, claimsOf(oldToken)?.amr?.length > 0);
    await d.ctx.close();
  }
  // A token refreshed after the reset where the database ended the session: the refresh is refused.
  {
    const tag = 'Stale (refresh refused)';
    const world = makeWorld({ factor: 'verified', live: true });
    const d = await device(world, { signedIn: true, aal: 'aal2' });
    await d.page.goto(`${APP}/coach`);
    await sleep(1500);
    await resetMaya(world);
    await d.page.evaluate(() => { const s = JSON.parse(localStorage.getItem('clarity-portal-auth')); s.expires_at = Math.floor(Date.now() / 1000) - 60; localStorage.setItem('clarity-portal-auth', JSON.stringify(s)); });
    await d.page.reload();
    await sleep(4000);
    const at = path(d.page);
    pass(`${tag}: a refresh the reset refused never opens the coach portal`, !/^\/coach(\/(?!sign-in)|$)/.test(at) && (await d.page.evaluate(() => window.__coachShown)) === 0, at);
    // Sign-in rule 24: Coach sign in, with the reason (run 6, item 13; it was the clients' Sign in, with none).
    pass(`${tag}: it lands on Coach sign in and is told why`, at === '/coach/sign-in' && (await waitMessage(d.page)) === signedOutLine, `${at} "${(await message(d.page)).slice(0, 80)}"`);
    pass(`${tag}: no page errors`, d.errors.length === 0, d.errors.slice(0, 2).join(' | '));
    await d.ctx.close();
  }
}

// ---------------------------------------------------------------- a recovery code typed every way
if (PARTS.includes('typed')) {
  const world = makeWorld({ factor: 'verified', live: true });
  const d = await device(world);
  await signIn(d.page, world);
  await waitPath(d.page, /\/code$/);
  const ok = [
    ['with spaces', ' k7q2 9fmd '],
    ['with an en dash', 'x3vp–r8tn'],
    ['in capitals', 'B6WH-2JCQ'],
    ['with a zero-width space and a soft hyphen', 'm9ze​­t4ra'],
    ['in full-width letters', 'ｐ２ｎｄ－７ｗｋｆ'],
    ['as written, without its dash', 'c8yt3hsm'],
  ];
  for (const [label, typed] of ok) {
    await d.page.goto(`${APP}/coach/sign-in/help`);
    const left = world.left();
    await useRecovery(d.page, typed);
    const at = await waitPath(d.page, /\/in$/, 10000);
    pass(`Typed (${label}): read as the code and used`, at === '/coach/sign-in/in' && world.left() === left - 1, `${at}, ${world.left()} left`);
    // Signed in again for the next one (a recovery code removes the phone).
    world.factors = [{ id: '00000000-0000-4000-8000-0000000000f1', factor_type: 'totp', status: 'verified', friendly_name: 'Authenticator', created_at: '2026-12-02T10:00:00Z', updated_at: '2026-12-02T10:00:00Z' }];
    world.keys.set('00000000-0000-4000-8000-0000000000f1', M26_KEY);
  }
  for (const [label, typed, want] of [
    ['empty', '', TYPE_RECOVERY_CODE],
    ['only spaces', '        ', TYPE_RECOVERY_CODE],
    ['200 characters', 'r5gq6vbe'.repeat(25), TYPE_RECOVERY_CODE],
    ['with a 1 and an l (never in a code)', 'r5gq-1lbe', TYPE_RECOVERY_CODE],
    ['a used one', 'k7q2-9fmd', flat(RECOVERY_DIDNT_WORK)],
  ]) {
    await d.page.goto(`${APP}/coach/sign-in/help`);
    const asked = uses(world);
    const left = world.left();
    await useRecovery(d.page, typed);
    const said = await waitMessage(d.page);
    const wantAsk = want === TYPE_RECOVERY_CODE ? asked : asked + 1;
    pass(`Typed (${label}): "${want}"${want === TYPE_RECOVERY_CODE ? ', never sent' : ''}`, said === want && uses(world) === wantAsk && world.left() === left && path(d.page) === '/coach/sign-in/help', `"${said}"`);
  }
  const typedIn = await recBox(d.page).inputValue();
  pass('Typed: the box holds at most 40 characters', typedIn.length <= 40, `${typedIn.length}`);
  pass('Typed: no page errors', d.errors.length === 0, d.errors.slice(0, 2).join(' | '));
  await d.ctx.close();
}

// ---------------------------------------------------------------- a 6-digit code with letters
if (PARTS.includes('sixletters')) {
  const world = makeWorld({ factor: 'verified', live: true });
  const d = await device(world);
  await signIn(d.page, world);
  await waitPath(d.page, /\/code$/);
  for (const [label, typed] of [['letters only', 'abcdef'], ['a letter among digits', '12a456'], ['an O for a zero', '1O3456'], ['nothing', '']]) {
    await codeBox(d.page).fill(typed);
    await press(d.page, 'Sign in');
    const said = await waitMessage(d.page);
    const shown = await codeBox(d.page).inputValue();
    pass(`6-digit (${label}): only the digits stay in the box, and it says "${CODE_SIX_DIGITS}", nothing sent, nothing counted`, said === flat(CODE_SIX_DIGITS) && /^\d*$/.test(shown) && verifies(world) === 0 && (await d.page.evaluate(() => localStorage.getItem('clarity-sign-in-code-tries'))) === null, `"${said}"`);
  }
  // Pasted with letters round the digits: the 6 digits are read.
  await codeBox(d.page).fill(`code: ${totp(M26_KEY).slice(0, 3)} ${totp(M26_KEY).slice(3)}`);
  await press(d.page, 'Sign in');
  pass('6-digit: "code: 123 456" is read as its six digits and gets in', (await waitPath(d.page, /^\/coach$/)) === '/coach', path(d.page));
  pass('6-digit: no page errors', d.errors.length === 0, d.errors.slice(0, 2).join(' | '));
  await d.ctx.close();
}

// ---------------------------------------------------------------- the downloaded file
if (PARTS.includes('file')) {
  const world = makeWorld({ factor: 'verified', codesSaved: false, firstMake: 'random', live: true });
  const d = await device(world, { signedIn: true, aal: 'aal2' });
  await d.page.goto(`${APP}/coach`);
  await waitPath(d.page, /recovery-codes$/);
  const codes = await codesOnPage(d.page);
  const [download] = await Promise.all([d.page.waitForEvent('download', { timeout: 10000 }).catch(() => null), d.page.getByRole('button', { name: 'Download' }).click()]);
  const name = download?.suggestedFilename() || '';
  const text = download ? readFileSync(await download.path(), 'utf8') : '';
  const found = text.match(/\b[a-z0-9]{4}-[a-z0-9]{4}\b/g) || [];
  pass('File: named in words, "The Clarity Portal recovery codes, 21 Nov 2026.txt"', /^The Clarity Portal recovery codes, \d{1,2} [A-Z][a-z]{2} \d{4}\.txt$/.test(name), name);
  pass('File: exactly the 10 codes on screen, each once, in order', found.length === 10 && found.join() === codes.join(), `${found.length} found`);
  const rest = text.replace(/\b[a-z0-9]{4}-[a-z0-9]{4}\b/g, '');
  pass('File: no email address, key, token or other code in it', !/@/.test(rest) && !rest.includes(M26_KEY) && !/[A-Z2-7]{16,}/.test(rest) && !/eyJ/.test(rest) && !/\b(?=[a-z0-9]*\d)[a-z0-9]{8}\b/.test(rest), `${text.split('\n').length} lines`);
  pass('File: says what they are, that each works once, and that new codes stop them', /recovery codes/i.test(text) && /once/i.test(text) && /stops these working/i.test(text));
  pass('File: plain text, one code a line', text.split('\n').filter((l) => /\b[a-z0-9]{4}-[a-z0-9]{4}\b/.test(l)).length === 10);
  await d.ctx.close();
}

// ---------------------------------------------------------------- new codes twice quickly
if (PARTS.includes('newcodes')) {
  const tag = 'New codes twice';
  const world = makeWorld({ factor: 'verified', codesLeft: 9, firstMake: 'random', live: true });
  const d = await device(world, { signedIn: true, aal: 'aal2' });
  const t2 = await newTab(d.ctx);
  for (const p of [d.page, t2.page]) {
    await p.goto(`${APP}/my-account/sign-in-security`);
    await p.waitForSelector('.si-srow', { timeout: 20000 });
    await p.getByRole('button', { name: 'Make new codes' }).click();
    await codeBox(p).fill(totp(M26_KEY));
  }
  await Promise.all([press(d.page, 'Carry on'), press(t2.page, 'Carry on')]);
  await Promise.all([waitPath(d.page, /recovery-codes$/), waitPath(t2.page, /recovery-codes$/)]);
  const a = await codesOnPage(d.page);
  const b = await codesOnPage(t2.page);
  pass(`${tag}: two sets made, one after the other`, world.madeSets === 2 && a.length === 10 && b.length === 10 && a.join() !== b.join(), `${world.madeSets} sets`);
  // Which tab's set is in force: the one made last.
  const firstTab = await (async () => {
    const other = await device(world, { width: 400, mode: 'light' });
    await signIn(other.page, world);
    await waitPath(other.page, /\/code$/);
    await other.page.goto(`${APP}/coach/sign-in/help`);
    await useRecovery(other.page, a[0]);
    const aWorks = (await waitPath(other.page, /\/in$/, 8000)) === '/coach/sign-in/in';
    await other.ctx.close();
    return aWorks ? 'b' : 'a'; // the tab whose codes don't work
  })();
  const stalePage = firstTab === 'a' ? d.page : t2.page;
  const livePage = firstTab === 'a' ? t2.page : d.page;
  const staleCodes = firstTab === 'a' ? a : b;
  pass(`${tag}: one set wins: the other tab's codes don't work`, world.left() === 9 || world.left() === 10, `${world.left()} left`);
  await stalePage.getByRole('checkbox', { name: 'I’ve saved them somewhere safe' }).click();
  await press(stalePage, 'Open the coach portal');
  const said = await waitMessage(stalePage);
  pass(`${tag}: the replaced set's tick is refused, saying so: "${flat(CODES_REPLACED)}"`, said === flat(CODES_REPLACED) && !world.codesSaved && path(stalePage) === '/coach/sign-in/recovery-codes', `"${said}"`);
  await livePage.getByRole('checkbox', { name: 'I’ve saved them somewhere safe' }).click();
  await press(livePage, 'Open the coach portal');
  pass(`${tag}: the set in force is ticked, and Sign-in security says so`, (await waitPath(livePage, /sign-in-security$/)) === '/my-account/sign-in-security' && world.codesSaved, path(livePage));
  // A replaced code, tried on another device.
  const other = await device(world, { width: 400, mode: 'light' });
  await signIn(other.page, world);
  await waitPath(other.page, /\/code$/);
  await other.page.goto(`${APP}/coach/sign-in/help`);
  await useRecovery(other.page, staleCodes[1]);
  pass(`${tag}: a code from the replaced set is refused like a wrong one`, (await waitMessage(other.page)) === flat(RECOVERY_DIDNT_WORK));
  await d.ctx.close(); await other.ctx.close();
}

// ---------------------------------------------------------------- the key and the codes after leaving their screens
if (PARTS.includes('secrets')) {
  const tag = 'Secrets';
  const world = makeWorld({ factor: 'none', codesMade: false, codesSaved: false, firstMake: 'random', live: true });
  const d = await device(world);
  const urls = [];
  d.page.on('framenavigated', (f) => { if (f === d.page.mainFrame()) urls.push(f.url()); });
  const titles = [];
  await signIn(d.page, world);
  await waitPath(d.page, /set-up$/);
  const key = await keyOnPage(d.page);
  titles.push(await d.page.title());
  await d.page.locator('.si-kv button').first().click().catch(() => null); // the copy icon
  await sleep(600);
  await giveCode(d.page, key, 'Turn it on');
  await waitPath(d.page, /recovery-codes$/);
  const codes = await codesOnPage(d.page);
  titles.push(await d.page.title());
  const historyOnCodes = await d.page.evaluate(() => JSON.stringify(window.history.state || {}));
  await d.page.getByRole('checkbox', { name: 'I’ve saved them somewhere safe' }).click();
  await press(d.page, 'Open the coach portal');
  await waitPath(d.page, /^\/coach$/);
  await sleep(1500);
  const secrets = [key, keyInGroups(key), plainKey(key).toLowerCase(), ...codes, ...codes.map((c) => c.replace('-', '')), ...codes.map((c) => c.toUpperCase())].filter(Boolean);
  const holds = (text) => secrets.some((s) => String(text || '').includes(s));
  const holdsLoose = (text) => holds(text) || holds(String(text || '').replace(/\\u002d/g, '-'));
  pass(`${tag}: never in the page's address, at any step`, urls.length > 2 && !urls.some(holds), `${urls.length} addresses`);
  pass(`${tag}: never in the tab's title`, ![...titles, await d.page.title()].some(holds));
  pass(`${tag}: never in the history's state (on the codes screen, or after)`, !holds(historyOnCodes) && !holds(await d.page.evaluate(() => JSON.stringify(window.history.state || {}))));
  const stored = await d.page.evaluate(() => {
    const all = [];
    for (const s of [localStorage, sessionStorage]) for (let i = 0; i < s.length; i += 1) all.push(`${s.key(i)}=${s.getItem(s.key(i))}`);
    return all.join('\n');
  });
  pass(`${tag}: never in localStorage or sessionStorage after leaving`, !holdsLoose(stored), `${stored.split('\n').length} keys`);
  const idb = await d.page.evaluate(async () => { try { return (await indexedDB.databases()).map((x) => x.name).join(','); } catch { return ''; } });
  console.log(`INFO  ${tag}: IndexedDB stores on the device: ${idb || 'none'}`);
  pass(`${tag}: never in a console line`, !d.consoleLines.some(holdsLoose), `${d.consoleLines.length} lines`);
  const live = await d.page.evaluate(() => [...document.querySelectorAll('[aria-live], [role=status], [role=alert], [role=log]')].map((n) => n.textContent).join(' | '));
  pass(`${tag}: never in a live region (what a screen reader reads out) after leaving`, !holds(live));
  pass(`${tag}: nowhere in the page after leaving`, !holds(await d.page.evaluate(() => document.documentElement.outerHTML)));
  // The copy icon put the key on the clipboard: said, not judged (it is what the person asked for).
  // Back to the codes address: a new set (the shown one is never shown again).
  await d.page.goto(`${APP}/coach/sign-in/recovery-codes`);
  await sleep(2500);
  const again = await d.page.locator('.si-rc li').allInnerTexts();
  pass(`${tag}: the codes screen opened again after leaving never shows the old set, and makes no new one`, !again.some((c) => codes.includes(c)) && world.madeSets === 1 && world.codesSaved, `${again.length} shown, ${world.madeSets} sets`);
  pass(`${tag}: nothing reached anywhere but the stand-ins`, bad(world).length === 0);
  await d.ctx.close();
}

// ---------------------------------------------------------------- the service worker's cache
if (PARTS.includes('sw')) {
  const tag = 'Service worker';
  const world = makeWorld({ factor: 'none', codesMade: false, codesSaved: false, firstMake: 'random', live: true });
  const d = await device(world, { sw: true });
  const outside = [];
  d.page.on('request', (r) => { const u = new URL(r.url()); if (u.origin !== new URL(APP).origin && u.protocol.startsWith('http')) outside.push(u.hostname); });
  await d.page.goto(`${APP}/coach/sign-in`);
  await d.page.waitForSelector('.si-col .si-btn', { timeout: 20000 });
  const ready = await d.page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 'none';
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 15000))]);
    return reg ? 'ready' : 'not yet';
  });
  // Through set-up and the codes with the worker running.
  await d.page.locator('input[type=email]').fill(world.user.email);
  await d.page.locator('.si-pw input').fill(MAYA_PASSWORD);
  await press(d.page, 'Sign in');
  await waitPath(d.page, /set-up$/);
  const key = await keyOnPage(d.page);
  await giveCode(d.page, key, 'Turn it on');
  await waitPath(d.page, /recovery-codes$/);
  const codes = await codesOnPage(d.page);
  await sleep(1500);
  const cached = await d.page.evaluate(async () => {
    const out = [];
    for (const name of await caches.keys()) {
      const c = await caches.open(name);
      for (const req of await c.keys()) out.push(req.url);
    }
    return out;
  });
  const insideWorker = cached.filter((u) => !u.startsWith(new URL(APP).origin) || /\/api\/|\/auth\/|\/rest\//.test(new URL(u).pathname));
  pass(`${tag}: it was running (${ready}), and it keeps only the portal's own files: nothing from Supabase or /api/`, ready === 'ready' && cached.length > 0 && insideWorker.length === 0, `${cached.length} kept, ${insideWorker.length} not the portal's`);
  // And none of the kept files holds the key or a code (they're the build's own files, read back).
  const holding = await d.page.evaluate(async (needles) => {
    let n = 0;
    for (const name of await caches.keys()) {
      const c = await caches.open(name);
      for (const req of await c.keys()) {
        const res = await c.match(req);
        const ct = res?.headers.get('content-type') || '';
        if (!/text|javascript|json|html|css/.test(ct)) continue;
        const t = await res.text();
        if (needles.some((s) => t.includes(s))) n += 1;
      }
    }
    return n;
  }, [key, ...codes]);
  pass(`${tag}: no kept file holds the key or a code`, holding === 0, `${holding}`);
  pass(`${tag}: every request outside the portal was to the stood-in Supabase (none reached anywhere else)`, outside.every((h) => h === `${TEST_REF}.supabase.co`) && bad(world).length === 0, [...new Set(outside)].join(','));
  await d.ctx.close();
}

// ---------------------------------------------------------------- twice the text size
if (PARTS.includes('text')) {
  const check = async (page, label) => {
    await sleep(700);
    const r = await page.evaluate(() => {
      const col = document.querySelector('.si-col--account') || document.querySelector('.si-col');
      const sideways = document.documentElement.scrollWidth - innerWidth;
      const out = [];
      for (const el of col ? col.querySelectorAll('h1, p, li, label, a, button, strong, span') : []) {
        const b = el.getBoundingClientRect();
        if (!b.width || getComputedStyle(el).visibility === 'hidden') continue;
        if (b.right > innerWidth + 1 || b.left < -1) out.push(`${el.tagName} off the screen`);
        if ((el.tagName === 'BUTTON' || el.tagName === 'A') && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible') out.push(`${el.tagName} cut off`);
      }
      const main = col?.querySelector('.si-btn');
      const mb = main?.getBoundingClientRect();
      return { sideways, out: out.slice(0, 4), main: mb ? Math.round(mb.height) : 0, size: parseFloat(getComputedStyle(document.documentElement).fontSize) };
    });
    // (Sign-in security's rows have no main button until a step opens.)
    pass(`Twice the text size, ${label}: no sideways scroll, nothing off the screen or cut off, the main button at least 44px`, r.size >= 32 && r.sideways <= 0 && r.out.length === 0 && (r.main >= 44 || (label.startsWith('Sign-in security,') && r.main === 0)), JSON.stringify(r));
  };
  for (const width of [1440, 400]) {
    const mode = width < 700 ? 'light' : 'dark';
    const at = `${width} ${mode}`;
    // Enter your code, then Lost, then You're in.
    {
      const world = makeWorld({ factor: 'verified', live: true });
      const d = await device(world, { width, mode, scale: 2 });
      await signIn(d.page, world);
      await waitPath(d.page, /\/code$/);
      await codeBox(d.page).waitFor({ timeout: 15000 });
      await check(d.page, `Enter your code, ${at}`);
      await d.page.goto(`${APP}/coach/sign-in/help`);
      await recBox(d.page).waitFor({ timeout: 15000 });
      await check(d.page, `Lost your authenticator app?, ${at}`);
      await useRecovery(d.page, 'k7q2-9fmd');
      await waitPath(d.page, /\/in$/);
      await check(d.page, `You’re in, ${at}`);
      await press(d.page, COACH_AUTH_WORDS.in.button);
      await waitPath(d.page, /set-up$/);
      await keyOnPage(d.page);
      await check(d.page, `Set up your authenticator, ${at}`);
      const keyBox = await d.page.evaluate(() => { const k = document.querySelector('.si-key').getBoundingClientRect(); return k.right <= innerWidth + 1 && k.left >= -1; });
      pass(`Twice the text size, set-up, ${at}: the key stays on the screen`, keyBox);
      const qr = await d.page.evaluate(() => { const q = document.querySelector('.si-qr svg')?.getBoundingClientRect(); return q ? q.right <= innerWidth + 1 && q.width >= 150 : false; });
      pass(`Twice the text size, set-up, ${at}: the QR code stays whole and its size`, qr);
      await d.ctx.close();
    }
    // The codes, My Account, the low-codes line.
    {
      const world = makeWorld({ factor: 'verified', codesSaved: false, live: true });
      const d = await device(world, { width, mode, scale: 2, signedIn: true, aal: 'aal2' });
      await d.page.goto(`${APP}/coach`);
      await waitPath(d.page, /recovery-codes$/);
      await codesOnPage(d.page);
      await check(d.page, `Save your recovery codes, ${at}`);
      await d.page.getByRole('checkbox', { name: 'I’ve saved them somewhere safe' }).click();
      await press(d.page, 'Open the coach portal');
      await waitPath(d.page, /^\/coach$/);
      await d.page.goto(`${APP}/my-account/sign-in-security`);
      await d.page.waitForSelector('.si-srow', { timeout: 20000 });
      await check(d.page, `Sign-in security, ${at}`);
      await d.page.getByRole('button', { name: 'Make new codes' }).click();
      await codeBox(d.page).waitFor({ timeout: 10000 });
      await check(d.page, `Sign-in security's current code, ${at}`);
      await d.ctx.close();
    }
    {
      const world = makeWorld({ factor: 'verified', codesLeft: 2, live: true });
      const d = await device(world, { width, mode, scale: 2 });
      await signIn(d.page, world);
      await waitPath(d.page, /\/code$/);
      await giveCode(d.page, M26_KEY);
      await waitPath(d.page, /\/in$/);
      await check(d.page, `You’re in (2 left), ${at}`);
      await d.ctx.close();
    }
  }
}

await browser.close();
done();
