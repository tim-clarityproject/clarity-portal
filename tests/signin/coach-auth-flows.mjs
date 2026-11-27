// The coach authenticator, walked start to finish (Phase 6a run 5, the
// functionality tester; the run's prompt, step 4). Every part is one story
// a coach lives through, in the running app, with Supabase's sign-in and
// MFA, migration 053's functions and the server's reset stood in by one
// world per story that behaves as the real ones do (coachWorld.mjs: each
// device its own session, real TOTP codes worked out here from the key the
// page shows, recovery codes kept hashed, the reset clearing factors, codes
// and sessions, and the real api/_routes/coach-auth-reset.js run as the live site
// would). Nothing reaches the test project but the owner's own read-only
// sign-in in part "reset" (the coach portal's stand-ins, tests/coach). No
// real authenticator is enrolled, no email is sent, and no key, code,
// password, token or email address is printed.
//
//   APP_URL=http://localhost:4317 node --import ./tests/scores/register.mjs tests/signin/coach-auth-flows.mjs
//   PARTS=first,second,lost,others,newcodes,reset,hosted,low,client   (all by default)
//   SIZES=1440,400   the core stories (first, second, lost) at each; the rest at the first size.
//
//   first     a new associate's first sign-in: the password, set-up (the key typed
//             from the page into the "app"), Turn it on, the codes (Download named
//             in words, its text holding the 10 codes), the tick, the coach portal
//   second    a second computer: asked once there, then never again on that device
//             after a reload or a new tab, until sign out
//   lost      the lost phone: Lost your authenticator app?, a recovery code, You're
//             in with the real count and "Your other sign-ins have ended.", a new
//             phone; the lost phone's own sign-in is ended and told why; the used
//             code and the old phone never work again
//   others    the same where nothing could end the lost phone's session (the
//             database can't reach Supabase's sessions, and Supabase's own sign
//             out of the others never arrives): 055's marker alone refuses it
//             coach data and signs it out (run 7)
//   newcodes  Make new codes in Settings (a current code first): the old codes
//             stop working, and it reads 10 of 10 left
//   reset     the owner resets the associate on the Coaches page (the owner's real
//             test sign-in, the portal's data stood in): the associate's open
//             sessions are signed out and the codes are gone; no menu on the
//             owner's own row and the server refuses their own; an associate calling
//             the reset is refused; then the associate sets up again
//   hosted    the same reset where the database can't reach Supabase's sessions: a
//             sign-in from before it is still signed out after its token refreshes
//   low       the 2-or-fewer line once after an ordinary sign-in, never twice in one
//   client    a client signs in exactly as before and never sees any of this
import { DB_ORIGIN as TARGET_ORIGIN } from '../target.mjs';
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { APP, makeChecks, sleep, TEST_REF } from './shared.mjs';
import { claimsOf, makeWorld, M26_CODES, M26_KEY, MAYA, MAYA_PASSWORD } from './coachWorld.mjs';
import { totp } from './totp.mjs';
import { codesLeftSummary, COACH_AUTH_WORDS, lowCodesLine, RECOVERY_DIDNT_WORK, SIGNED_OUT_BY_RECOVERY, SIGNED_OUT_BY_RESET, usedCodeLine, CODE_DIDNT_WORK } from '../../src/lib/signIn/coachAuth.js';
import { RESET_WORDS } from '../../api/_routes/coach-auth-reset.js';

const PARTS = (process.env.PARTS || 'first,second,lost,others,newcodes,reset,hosted,low,client').split(',');
const SIZES = (process.env.SIZES || '1440,400').split(',').map(Number);
const { pass, done } = makeChecks();
const browser = await chromium.launch();

const NEW_PHONE_KEY = 'KRUGKIDROVUWG2ZAMJZG653OEBTG66BA'; // an invented base-32 key for a "new phone"
const SAM = { id: '00000000-0000-4000-8000-0000000005a0', email: 'sam.carter@harbourlane.co', first: 'Sam' };
const path = (page) => new URL(page.url()).pathname;
const squash = (t) => String(t || '').replace(/\s+/g, ' ').trim();
const words = (page, sel = '.si-col') => page.locator(sel).first().innerText().then(squash).catch(() => '');
const message = (page) => page.locator('.si-err').first().innerText().then((t) => squash(t).replace(/^! /, '')).catch(() => '');
const codeBox = (page) => page.getByRole('textbox', { name: 'Code', exact: true });
const press = (page, name) => page.getByRole('button', { name, exact: true }).click();
const verifies = (world) => world.calls.filter((c) => /\/auth\/v1\/factors\/:id\/verify$/.test(c)).length;
const bad = (world) => world.calls.filter((c) => c.startsWith('blocked'));

async function waitPath(page, re, timeout = 20000) {
  await page.waitForURL((u) => re.test(u.pathname), { timeout }).catch(() => null);
  return path(page);
}

/** A computer or phone for this account: a browser context attached to the world. */
async function device(world, { width = 1440, mode = 'dark', signedIn = false, aal = 'aal2' } = {}) {
  const phone = width < 700;
  const ctx = await browser.newContext({ viewport: { width, height: phone ? 844 : 1000 }, colorScheme: mode, locale: 'en-GB', timezoneId: 'Europe/London', hasTouch: phone, isMobile: phone, serviceWorkers: 'block', acceptDownloads: true });
  await ctx.addInitScript((m) => { try { localStorage.setItem('clarity-colour-mode', m); } catch { /* the device's mode */ } }, mode);
  await world.attach(ctx, { signedOut: !signedIn, aal });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 140)));
  return { ctx, page, errors };
}

async function signIn(page, world, at = '/coach/sign-in') {
  await page.goto(`${APP}${at}`);
  await page.waitForSelector('.si-col .si-btn', { timeout: 20000 });
  await page.locator('input[type=email]').fill(world.user.email);
  await page.locator('.si-pw input').fill(MAYA_PASSWORD);
  await press(page, 'Sign in');
}

/** The code the "phone" holding this key shows right now, typed in. */
async function giveCode(page, key, button = 'Sign in') {
  await codeBox(page).waitFor({ timeout: 15000 });
  await codeBox(page).fill(totp(key));
  await press(page, button);
}

/** The key as the page shows it, typed into the "app" (the QR is read back by coach-auth.mjs). */
async function keyOnPage(page) {
  await page.waitForSelector('.si-qr svg', { timeout: 15000 }).catch(() => null);
  await page.waitForFunction(() => /[A-Z2-7]{4}/.test(document.querySelector('.si-key')?.textContent || ''), null, { timeout: 15000 }).catch(() => null);
  return (await page.locator('.si-key').innerText().catch(() => '')).replace(/\s+/g, '');
}

async function codesOnPage(page) {
  await page.waitForSelector('.si-rc li', { timeout: 15000 }).catch(() => null);
  return page.locator('.si-rc li').allInnerTexts();
}

async function signOut(page) {
  await page.getByRole('button', { name: /^(Open the menu|Menu)$/ }).first().click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
}

const signedOutLine = SIGNED_OUT_BY_RESET.join(' ');
const recoveryLine = SIGNED_OUT_BY_RECOVERY.join(' ');
/** A coach table read with a sign-in's own token, as the page would: the marker row at aal2, nothing otherwise (054). */
const readCoachData = (page, token) => page.evaluate(async ({ url, token }) => { try { const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, apikey: 'stand-in' } }); return await r.json(); } catch { return null; } }, { url: `${TARGET_ORIGIN}/rest/v1/coach_todos?select=*`, token });
const tokenOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('clarity-portal-auth') || '{}').access_token || null);

// ---------------------------------------------------------------- 1. a new associate's first sign-in
if (PARTS.includes('first')) {
  for (const [width, mode] of SIZES.map((w) => [w, w < 700 ? 'light' : 'dark'])) {
    const tag = `First sign-in, ${width} ${mode}`;
    const world = makeWorld({ factor: 'none', codesMade: false, codesSaved: false, firstMake: 'random', live: true });
    const { ctx, page, errors } = await device(world, { width, mode });
    await signIn(page, world);
    pass(`${tag}: after the password, set-up (the coach portal is shut until it's done)`, (await waitPath(page, /set-up$/)) === '/coach/sign-in/set-up', path(page));
    const key = await keyOnPage(page);
    pass(`${tag}: Supabase's own enrolment gives the key, once, shown in fours`, world.enrolled === 1 && key.length >= 16 && /^([A-Z2-7]{4} )+[A-Z2-7]{1,4}$/.test(squash(await page.locator('.si-key').innerText())), `${world.enrolled} enrolled`);
    await page.goto(`${APP}/coach`);
    pass(`${tag}: typing /coach before set-up is done returns to set-up`, (await waitPath(page, /set-up$/)) === '/coach/sign-in/set-up', path(page));
    const phone = await keyOnPage(page);
    pass(`${tag}: coming back starts again with a new key (the unfinished one is taken off)`, phone && phone !== key && world.factors.length === 1 && world.factors[0].status === 'unverified', `${world.factors.length} factors`);
    await codeBox(page).fill('000000');
    await press(page, 'Turn it on');
    await page.waitForSelector('.si-err', { timeout: 10000 }).catch(() => null);
    pass(`${tag}: a wrong code: "That code didn't work. Check the time on your phone and try again."`, (await message(page)) === CODE_DIDNT_WORK.join(' '));
    await giveCode(page, phone, 'Turn it on');
    pass(`${tag}: Turn it on, with the code from the key typed into the app, leads to the codes`, (await waitPath(page, /recovery-codes$/)) === '/coach/sign-in/recovery-codes', path(page));
    pass(`${tag}: the authenticator is on ("On since" recorded) and this sign-in has given its code`, Boolean(world.turnedOnAt) && world.factors.filter((f) => f.status === 'verified').length === 1);
    const codes = await codesOnPage(page);
    const shape = /^[abcdefghjkmnpqrstuvwxyz023456789]{4}-[abcdefghjkmnpqrstuvwxyz023456789]{4}$/;
    pass(`${tag}: 10 codes, all different, in the code's shape, none of M26's`, codes.length === 10 && new Set(codes).size === 10 && codes.every((c) => shape.test(c)) && !codes.some((c) => M26_CODES.includes(c.replace('-', ''))), `${codes.length} codes`);
    pass(`${tag}: the world keeps only hashes of them`, world.codeRows.length === 10 && world.codeRows.every((r) => r.plain === null && r.hash.length === 32));
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }).catch(() => null), page.getByRole('button', { name: 'Download' }).click()]);
    const name = download?.suggestedFilename() || '';
    pass(`${tag}: Download names the file in words ("The Clarity Portal recovery codes, 21 Nov 2026.txt")`, /^The Clarity Portal recovery codes, \d{1,2} [A-Z][a-z]{2} \d{4}\.txt$/.test(name), name);
    const text = download ? readFileSync(await download.path(), 'utf8') : '';
    const inFile = text.match(/\b[a-z0-9]{4}-[a-z0-9]{4}\b/g) || [];
    pass(`${tag}: the file's text holds the 10 codes, the same as on screen`, inFile.length === 10 && codes.every((c) => inFile.includes(c)), `${inFile.length} found`);
    pass(`${tag}: and says what they are in words`, /recovery codes/i.test(text) && /once/i.test(text), `${text.split('\n').length} lines`);
    const open = page.getByRole('button', { name: 'Open the coach portal' });
    pass(`${tag}: Open the coach portal waits for the tick`, await open.isDisabled());
    await page.goto(`${APP}/coach`);
    pass(`${tag}: typing /coach before the tick returns to the codes`, (await waitPath(page, /recovery-codes$/)) === '/coach/sign-in/recovery-codes', path(page));
    const again = await codesOnPage(page);
    pass(`${tag}: with none in memory, a new set replaces the unsaved one`, world.madeSets === 2 && again.length === 10 && !again.some((c) => codes.includes(c)), `${world.madeSets} sets`);
    await page.getByRole('checkbox', { name: 'I’ve saved them somewhere safe' }).click();
    pass(`${tag}: ticked, it can be pressed`, await open.isEnabled());
    await press(page, 'Open the coach portal');
    pass(`${tag}: Open the coach portal lands in the coach portal`, (await waitPath(page, /^\/coach$/)) === '/coach' && world.codesSaved, path(page));
    await page.reload();
    await sleep(1500);
    pass(`${tag}: a reload stays in the coach portal, asked nothing`, path(page) === '/coach' && verifies(world) === 2, `${path(page)}, ${verifies(world)} codes given`);
    pass(`${tag}: nothing reached anywhere but the stand-ins`, bad(world).length === 0, bad(world).join(', '));
    pass(`${tag}: no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
    await ctx.close();
  }
}

// ---------------------------------------------------------------- 2. a second computer
if (PARTS.includes('second')) {
  for (const [width, mode] of SIZES.map((w) => [w, w < 700 ? 'light' : 'dark'])) {
    const tag = `Second computer, ${width} ${mode}`;
    const world = makeWorld({ factor: 'verified', live: true });
    const first = await device(world, { signedIn: true, aal: 'aal2' });
    await first.page.goto(`${APP}/coach`);
    await sleep(1500);
    pass(`${tag}: on the first computer the coach is simply in`, path(first.page) === '/coach', path(first.page));
    const { ctx, page, errors } = await device(world, { width, mode });
    await signIn(page, world);
    pass(`${tag}: after the password, the code is asked on the new computer`, (await waitPath(page, /\/code$/)) === '/coach/sign-in/code', path(page));
    pass(`${tag}: "You're only asked on a new phone or computer."`, (await words(page)).includes('You’re only asked on a new phone or computer.'));
    await giveCode(page, M26_KEY);
    pass(`${tag}: the code from the phone opens the coach portal`, (await waitPath(page, /^\/coach$/)) === '/coach' && verifies(world) === 1, path(page));
    await page.reload();
    await sleep(2000);
    pass(`${tag}: after a reload it isn't asked again`, path(page) === '/coach' && verifies(world) === 1, path(page));
    const tab = await ctx.newPage();
    await tab.goto(`${APP}/coach`);
    await sleep(2000);
    pass(`${tag}: nor in a new tab`, path(tab) === '/coach' && verifies(world) === 1, path(tab));
    await tab.goto(`${APP}/coach/sign-in/code`);
    await sleep(2000);
    pass(`${tag}: nor if the code page is opened by its address`, !/\/code$/.test(path(tab)) && verifies(world) === 1, path(tab));
    await tab.close();
    await signOut(page);
    pass(`${tag}: Sign out goes to Coach sign in`, (await waitPath(page, /^\/coach\/sign-in$/)) === '/coach/sign-in', path(page));
    const kept = await page.evaluate(() => localStorage.getItem('clarity-portal-auth'));
    pass(`${tag}: and leaves no sign-in on the device`, !kept);
    await signIn(page, world);
    pass(`${tag}: signing in again there, the code is asked again`, (await waitPath(page, /\/code$/)) === '/coach/sign-in/code', path(page));
    // Given in a new tab (the place to land is kept per tab, so that tab has none): it lands in the coach portal, not Home (run 6, item 14).
    const codeTab = await ctx.newPage();
    await codeTab.goto(`${APP}/coach/sign-in/code`);
    await giveCode(codeTab, M26_KEY);
    pass(`${tag}: and given in a new tab, that tab lands in the coach portal`, (await waitPath(codeTab, /^\/coach$/)) === '/coach' && verifies(world) === 2, path(codeTab));
    await codeTab.close();
    await page.reload();
    pass(`${tag}: and the first tab, reloaded, is in again`, (await waitPath(page, /^\/coach$/)) === '/coach' && verifies(world) === 2, path(page));
    // Sign out ends this device's sign-in only (sign-in rule 10; run 6, item 15): the first computer stays in.
    await first.page.reload();
    await sleep(2500);
    pass(`${tag}: after Sign out on the second computer, the first computer is still in the coach portal`, path(first.page) === '/coach', path(first.page));
    pass(`${tag}: nothing reached anywhere but the stand-ins`, bad(world).length === 0, bad(world).join(', '));
    pass(`${tag}: no page errors`, [...errors, ...first.errors].length === 0, [...errors, ...first.errors].slice(0, 2).join(' | '));
    await ctx.close();
    await first.ctx.close();
  }
}

// ---------------------------------------------------------------- 3. the lost phone
if (PARTS.includes('lost')) {
  for (const [width, mode] of SIZES.map((w) => [w, w < 700 ? 'light' : 'dark'])) {
    const tag = `Lost phone, ${width} ${mode}`;
    const world = makeWorld({ factor: 'verified', live: true });
    world.secret = NEW_PHONE_KEY;
    // The lost phone, still signed in with its code given, in someone else's hands.
    const lostPhone = await device(world, { width, mode, signedIn: true, aal: 'aal2' });
    const lostSession = [...world.sessions.keys()].at(-1);
    await lostPhone.page.goto(`${APP}/coach`);
    pass(`${tag}: the lost phone is in the coach portal before the code is used`, (await waitPath(lostPhone.page, /^\/coach$/)) === '/coach', path(lostPhone.page));
    await sleep(1200);
    const { ctx, page, errors } = await device(world, { width, mode });
    await signIn(page, world);
    await waitPath(page, /\/code$/);
    await page.getByRole('link', { name: 'Lost your authenticator app?' }).click();
    pass(`${tag}: Lost your authenticator app? opens`, (await waitPath(page, /\/help$/)) === '/coach/sign-in/help', path(page));
    await page.getByRole('textbox', { name: 'Recovery code' }).waitFor({ timeout: 15000 }).catch(() => null);
    const lost = await words(page);
    pass(`${tag}: the line names the owner from the data, with the video call, and offers no email`, lost.includes('Lost your codes too? Ask Tim to reset your authenticator.') && lost.includes('video call') && !/email/i.test(lost));
    await page.getByLabel('Recovery code').fill('zzzz-zzzz');
    await press(page, 'Sign in');
    await page.waitForSelector('.si-err', { timeout: 10000 }).catch(() => null);
    pass(`${tag}: a wrong code: one calm line that names no part`, (await message(page)) === RECOVERY_DIDNT_WORK.join(' '));
    await page.getByLabel('Recovery code').fill('K7Q2 9FMD');
    await press(page, 'Sign in');
    pass(`${tag}: a recovery code, typed in capitals with a space, gets in`, (await waitPath(page, /\/in$/)) === '/coach/sign-in/in', path(page));
    const inWords = await words(page);
    pass(`${tag}: You're in: "That recovery code is now used. You have 9 left."`, inWords.includes(usedCodeLine(9)) && world.left() === 9);
    pass(`${tag}: You're in: "Your other sign-ins have ended.", between the count and Set it up`, inWords.includes(`${usedCodeLine(9)} ${COACH_AUTH_WORDS.in.othersEnded} ${COACH_AUTH_WORDS.in.setUpLine}`), inWords.slice(0, 240));
    const mine = claimsOf(await tokenOf(page))?.session_id;
    pass(`${tag}: the lost phone's session has ended; the one that used the code carries on`, !world.sessions.has(lostSession) && world.sessions.has(mine) && world.sessions.size === 1, `${world.sessions.size} sessions`);
    pass(`${tag}: and Supabase was asked to end the others, never this one (scope others)`, world.calls.includes('POST /auth/v1/logout'), world.calls.filter((c) => /logout/.test(c)).join(', '));
    await lostPhone.page.reload();
    await waitPath(lostPhone.page, /^\/coach\/sign-in$/);
    await lostPhone.page.waitForSelector('.si-err', { timeout: 10000 }).catch(() => null);
    pass(`${tag}: the lost phone is signed out of the coach portal and told why`, path(lostPhone.page) === '/coach/sign-in' && (await message(lostPhone.page)) === recoveryLine, `${path(lostPhone.page)} "${await message(lostPhone.page)}"`);
    pass(`${tag}: nothing of the lost phone's sign-in is left on it`, !(await tokenOf(lostPhone.page)));
    await lostPhone.ctx.close();
    pass(`${tag}: the lost phone's authenticator is gone, and the server was asked (the live site's own check)`, world.factors.length === 0 && world.server.some((s) => s.kind === 'recovered' && s.status === 200), JSON.stringify(world.server));
    await press(page, COACH_AUTH_WORDS.in.button);
    pass(`${tag}: Set it up opens set-up`, (await waitPath(page, /set-up$/)) === '/coach/sign-in/set-up', path(page));
    const phone = await keyOnPage(page);
    pass(`${tag}: with the new phone's own key`, phone === NEW_PHONE_KEY);
    await giveCode(page, phone, 'Turn it on');
    pass(`${tag}: the new phone on, into the coach portal (the codes were saved before)`, (await waitPath(page, /^\/coach$/)) === '/coach' && world.factors.filter((f) => f.status === 'verified').length === 1, path(page));
    // Another computer: the old phone's code and the used recovery code never work again.
    // A sign-in's start is kept to the second (its amr time), so one begun in
    // the same second as the code was used counts as from before it and is
    // ended too (the safe way round). A person can't sign in that fast; the
    // stand-ins can, so the other computer waits a second.
    await sleep(1100);
    const other = await device(world, { width, mode });
    await signIn(other.page, world);
    pass(`${tag}: another computer, signed in after the code, is asked for its 6-digit code`, (await waitPath(other.page, /\/code$/)) === '/coach/sign-in/code', `${path(other.page)} "${await message(other.page)}"`);
    await giveCode(other.page, M26_KEY);
    await other.page.waitForSelector('.si-err', { timeout: 10000 }).catch(() => null);
    pass(`${tag}: the lost phone's code no longer works`, path(other.page) === '/coach/sign-in/code' && (await message(other.page)) === CODE_DIDNT_WORK.join(' '), path(other.page));
    await other.page.getByRole('link', { name: 'Lost your authenticator app?' }).click();
    await other.page.getByRole('textbox', { name: 'Recovery code' }).waitFor({ timeout: 15000 }).catch(() => null);
    await other.page.getByLabel('Recovery code').fill('k7q2-9fmd');
    await press(other.page, 'Sign in');
    await other.page.waitForSelector('.si-err', { timeout: 10000 }).catch(() => null);
    pass(`${tag}: the used recovery code is refused, with the same words as a wrong one`, path(other.page) === '/coach/sign-in/help' && (await message(other.page)) === RECOVERY_DIDNT_WORK.join(' ') && world.left() === 9);
    await other.page.goto(`${APP}/coach/sign-in/code`);
    await giveCode(other.page, phone);
    pass(`${tag}: the new phone's code works there`, (await waitPath(other.page, /^\/coach$/)) === '/coach', path(other.page));
    pass(`${tag}: nothing reached anywhere but the stand-ins`, bad(world).length === 0, bad(world).join(', '));
    pass(`${tag}: no page errors`, [...errors, ...other.errors].length === 0, [...errors, ...other.errors].slice(0, 2).join(' | '));
    await other.ctx.close();
    await ctx.close();
  }
}

// ---------------------------------------------------------------- 3b. the marker alone (run 7)
if (PARTS.includes('others')) {
  const tag = `A recovery code, nothing else reaching the lost phone, ${SIZES[0]}`;
  // A hosted database that can't reach Supabase's sessions, and Supabase's own sign out of the others never arriving.
  const world = makeWorld({ factor: 'verified', live: true, sqlReachesAuth: false, coachData: true });
  const lostPhone = await device(world, { signedIn: true, aal: 'aal2' });
  const lostSession = [...world.sessions.keys()].at(-1);
  await lostPhone.page.goto(`${APP}/coach`);
  await waitPath(lostPhone.page, /^\/coach$/);
  const lostToken = await tokenOf(lostPhone.page);
  const before = await readCoachData(lostPhone.page, lostToken);
  pass(`${tag}: before the code, the lost phone reads coach data`, Array.isArray(before) && before.length === 1, JSON.stringify(before)?.slice(0, 80));
  await sleep(1200);
  const { ctx, page, errors } = await device(world);
  await ctx.route('**/auth/v1/logout**', (route) => route.abort('internetdisconnected'));
  await signIn(page, world);
  await waitPath(page, /\/code$/);
  await page.goto(`${APP}/coach/sign-in/help`);
  await page.getByRole('textbox', { name: 'Recovery code' }).waitFor({ timeout: 15000 }).catch(() => null);
  await page.getByLabel('Recovery code').fill('k7q2-9fmd');
  await press(page, 'Sign in');
  pass(`${tag}: the code gets in`, (await waitPath(page, /\/in$/)) === '/coach/sign-in/in', path(page));
  const inWords = await words(page);
  pass(`${tag}: You're in still says "Your other sign-ins have ended." (the database ended them)`, inWords.includes(COACH_AUTH_WORDS.in.othersEnded), inWords.slice(0, 200));
  pass(`${tag}: the lost phone's session is still there (nothing could remove it)`, world.sessions.has(lostSession));
  const after = await readCoachData(lostPhone.page, lostToken);
  pass(`${tag}: its token, still within its hour, now reads no coach data (055's marker)`, Array.isArray(after) && after.length === 0, JSON.stringify(after)?.slice(0, 80));
  await lostPhone.page.reload();
  await waitPath(lostPhone.page, /^\/coach\/sign-in$/);
  await lostPhone.page.waitForSelector('.si-err', { timeout: 10000 }).catch(() => null);
  pass(`${tag}: and the coach portal lets it go, saying why`, path(lostPhone.page) === '/coach/sign-in' && (await message(lostPhone.page)) === recoveryLine, `${path(lostPhone.page)} "${await message(lostPhone.page)}"`);
  // The coach carries on: the sign-in that used the code is still good (set-up is walked in "lost").
  const mine = world.rpc('coach_auth_state', null, claimsOf(await tokenOf(page))).body;
  pass(`${tag}: the sign-in that used the code carries on`, mine.session_ok === true && !mine.ended_by && path(page) === '/coach/sign-in/in', JSON.stringify({ ok: mine.session_ok, by: mine.ended_by }));
  pass(`${tag}: nothing reached anywhere but the stand-ins`, bad(world).length === 0, bad(world).join(', '));
  pass(`${tag}: no page errors`, [...errors, ...lostPhone.errors].length === 0, [...errors, ...lostPhone.errors].slice(0, 2).join(' | '));
  await lostPhone.ctx.close();
  await ctx.close();
}

// ---------------------------------------------------------------- 4. new codes in My Account
if (PARTS.includes('newcodes')) {
  const tag = `New codes, ${SIZES[0]}`;
  const world = makeWorld({ factor: 'verified', codesLeft: 9, firstMake: 'random', live: true });
  const { ctx, page, errors } = await device(world, { width: SIZES[0], signedIn: true, aal: 'aal2' });
  await page.goto(`${APP}/coach/settings/sign-in-security`);
  await page.waitForSelector('.si-srow', { timeout: 20000 }).catch(() => null);
  const before = await words(page, '.si-col--account');
  pass(`${tag}: Sign-in security reads "On since" and "9 of 10 left"`, before.includes('On since') && before.includes(codesLeftSummary(9, 10)), before.slice(0, 160));
  await page.getByRole('button', { name: 'Make new codes' }).click();
  await giveCode(page, '2222222222222222', 'Carry on');
  await page.waitForSelector('.si-err', { timeout: 10000 }).catch(() => null);
  pass(`${tag}: a code that isn't the phone's is refused, and nothing is made`, world.madeSets === 0 && (await message(page)) === CODE_DIDNT_WORK.join(' '));
  await giveCode(page, M26_KEY, 'Carry on');
  pass(`${tag}: with the current code, a new set`, (await waitPath(page, /recovery-codes$/)) === '/coach/sign-in/recovery-codes', path(page));
  const fresh = await codesOnPage(page);
  pass(`${tag}: 10 new codes, none of the old ones`, fresh.length === 10 && world.madeSets === 1 && !fresh.some((c) => M26_CODES.includes(c.replace('-', ''))));
  await page.getByRole('checkbox', { name: 'I’ve saved them somewhere safe' }).click();
  await press(page, 'Open the coach portal');
  await waitPath(page, /sign-in-security$/);
  await page.getByText('Your new recovery codes are in force.').waitFor({ timeout: 10000 }).catch(() => null);
  const after = await words(page, '.si-col--account');
  pass(`${tag}: back on Sign-in security: "Your new recovery codes are in force." and "10 of 10 left"`, after.includes('Your new recovery codes are in force.') && after.includes(codesLeftSummary(10, 10)), after.slice(0, 200));
  // The old codes stop working, on another computer.
  const other = await device(world, { width: SIZES[0] });
  await signIn(other.page, world);
  await waitPath(other.page, /\/code$/);
  await other.page.getByRole('link', { name: 'Lost your authenticator app?' }).click();
  await other.page.getByRole('textbox', { name: 'Recovery code' }).waitFor({ timeout: 15000 }).catch(() => null);
  await other.page.getByLabel('Recovery code').fill('x3vp-r8tn');
  await press(other.page, 'Sign in');
  await other.page.waitForSelector('.si-err', { timeout: 10000 }).catch(() => null);
  pass(`${tag}: an old code (never used) no longer works`, path(other.page) === '/coach/sign-in/help' && (await message(other.page)) === RECOVERY_DIDNT_WORK.join(' '));
  await other.page.getByLabel('Recovery code').fill(fresh[3]);
  await press(other.page, 'Sign in');
  await waitPath(other.page, /\/in$/);
  pass(`${tag}: a new one does: "You have 9 left."`, (await words(other.page)).includes(usedCodeLine(9)));
  pass(`${tag}: nothing reached anywhere but the stand-ins`, bad(world).length === 0, bad(world).join(', '));
  pass(`${tag}: no page errors`, [...errors, ...other.errors].length === 0, [...errors, ...other.errors].slice(0, 2).join(' | '));
  await other.ctx.close();
  await ctx.close();
}

// ---------------------------------------------------------------- 5 and 6. the owner's reset, then set up again
/** A token for the owner, made here (the stand-in checks no signature). */
function ownerToken(ownerId, aal = 'aal2') {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const t = Math.floor(Date.now() / 1000);
  return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ sub: ownerId, role: 'authenticated', aal, amr: [{ method: 'totp', timestamp: t }, { method: 'password', timestamp: t }], session_id: 'stand-in', iat: t, exp: t + 3600 })}.c3RhbmQtaW4`;
}

if (PARTS.includes('reset')) {
  const { coachContext, standIn, accountId } = await import('../coach/shared.mjs');
  const tag = `Owner’s reset, ${SIZES[0]}`;
  const octx = await coachContext(browser, { size: SIZES[0], theme: 'dark' });
  const owner = await octx.newPage();
  const ownerErrors = [];
  owner.on('pageerror', (e) => ownerErrors.push(String(e.message).slice(0, 140)));
  const store = await standIn(owner, { role: 'owner', db: 'none' });
  let world = null;
  await owner.route('**/api/coach-auth-reset', async (route) => {
    const out = await world.serve(route.request().postDataJSON(), route.request().headers().authorization);
    await route.fulfill({ status: out.status, contentType: 'application/json', body: JSON.stringify(out.body) });
  });
  await owner.goto(`${APP}/coach/settings/coaches`);
  await owner.getByRole('button', { name: /^More for / }).first().waitFor({ timeout: 25000 }).catch(() => null);
  const ownerId = await accountId(owner);
  const ownRow = store.coaches.find((c) => c.role === 'owner');
  const mayaRow = store.coaches.find((c) => c.role !== 'owner');
  // Maya's world: her coaches row is the one the owner's page shows; the owner's is the real test owner's account.
  world = makeWorld({
    factor: 'verified', live: true, firstMake: 'random',
    user: { ...MAYA, id: mayaRow.user_id, first: mayaRow.display_first_name },
    coaches: [{ ...ownRow, user_id: ownerId }, { ...mayaRow }],
  });
  world.secret = NEW_PHONE_KEY;
  const laptop = await device(world, { signedIn: true, aal: 'aal2' });
  const phone = await device(world, { width: 400, mode: 'light', signedIn: true, aal: 'aal2' });
  for (const d of [laptop, phone]) { await d.page.goto(`${APP}/coach`); await sleep(1500); }
  pass(`${tag}: Maya is in on her laptop and her phone`, path(laptop.page) === '/coach' && path(phone.page) === '/coach' && world.sessions.size === 2, `${path(laptop.page)}, ${path(phone.page)}`);

  // An associate calling the reset directly is refused, and nothing changes.
  const asMaya = await laptop.page.evaluate(async (coachId) => {
    const s = JSON.parse(localStorage.getItem('clarity-portal-auth') || '{}');
    const res = await fetch('/api/coach-auth-reset', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.access_token}` }, body: JSON.stringify({ kind: 'reset', coachId }) });
    return { status: res.status, message: (await res.json().catch(() => ({}))).message };
  }, ownRow.id);
  pass(`${tag}: an associate calling the reset is refused ("Only the owner can reset an authenticator.")`, asMaya.status === 403 && asMaya.message === RESET_WORDS.notOwner && world.resets.length === 0 && world.factors.length === 1, `${asMaya.status}`);
  const mayaClaims = claimsOf(await laptop.page.evaluate(() => JSON.parse(localStorage.getItem('clarity-portal-auth') || '{}').access_token));
  pass(`${tag}: and the database refuses it too (42501)`, world.rpc('coach_authenticator_reset', { p_coach: ownRow.id }, mayaClaims).body.code === '42501');

  // The owner: no menu on their own row; the server refuses their own.
  const mores = await owner.getByRole('button', { name: /^More for / }).count();
  pass(`${tag}: each associate has a More menu, the owner's own row none`, mores === 1, `${mores}`);
  const self = await owner.evaluate(async (coachId) => {
    const s = JSON.parse(localStorage.getItem('clarity-portal-auth') || '{}');
    const res = await fetch('/api/coach-auth-reset', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.access_token}` }, body: JSON.stringify({ kind: 'reset', coachId }) });
    return { status: res.status, message: (await res.json().catch(() => ({}))).message };
  }, ownRow.id);
  pass(`${tag}: the owner calling the reset on their own is refused, with the way back`, self.status === 400 && self.message === RESET_WORDS.self && world.resets.length === 0, `${self.status}`);
  pass(`${tag}: and so does the database ("self")`, world.rpc('coach_authenticator_reset', { p_coach: ownRow.id }, claimsOf(ownerToken(ownerId))).body.status === 'self');
  pass(`${tag}: the owner needs their own code first (aal2)`, world.rpc('coach_authenticator_reset', { p_coach: mayaRow.id }, claimsOf(ownerToken(ownerId, 'aal1'))).body.status === 'needs_code' && world.resets.length === 0);

  // Reset it.
  await owner.getByRole('button', { name: /^More for / }).first().click();
  await owner.getByRole('menuitem', { name: 'Reset authenticator' }).click();
  await owner.getByRole('dialog', { name: /Reset Maya/i }).waitFor({ timeout: 10000 }).catch(() => null);
  await press(owner, 'Reset it');
  await sleep(1500);
  const r = world.resets[0];
  pass(`${tag}: Reset it: the server runs as the live site, and the database records who reset whom`, world.resets.length === 1 && r.by === ownerId && r.whom === mayaRow.user_id && world.server.some((s) => s.kind === 'reset' && s.status === 200 && s.ran === true), JSON.stringify(world.server));
  pass(`${tag}: her authenticator, her 10 codes and both her sessions are gone`, world.factors.length === 0 && world.codeRows.length === 0 && world.sessions.size === 0 && r.codes === 10 && r.sessions === 2, `${world.factors.length} factors, ${world.codeRows.length} codes, ${world.sessions.size} sessions`);
  const toast = squash(await owner.locator('.ds-toast').innerText().catch(() => ''));
  pass(`${tag}: the owner is told calmly, with no Undo`, toast.length > 0 && !/undo/i.test(toast) && !(await owner.getByRole('dialog', { name: /Reset Maya/i }).isVisible().catch(() => false)), toast);
  for (const [name, d] of [['laptop', laptop], ['phone', phone]]) {
    await d.page.reload();
    await waitPath(d.page, /^\/coach\/sign-in$/);
    await d.page.waitForSelector('.si-err', { timeout: 10000 }).catch(() => null);
    const said = await message(d.page);
    pass(`${tag}: her ${name}'s open session is signed out on its next load, and told why`, path(d.page) === '/coach/sign-in' && said === signedOutLine, `${path(d.page)} "${said}"`);
    pass(`${tag}: and nothing of it is left on her ${name}`, !(await d.page.evaluate(() => localStorage.getItem('clarity-portal-auth'))));
  }

  // 6. Maya sets up again.
  const t6 = `Set up again, ${SIZES[0]}`;
  await signIn(laptop.page, world);
  pass(`${t6}: after the password, set-up (no authenticator now)`, (await waitPath(laptop.page, /set-up$/)) === '/coach/sign-in/set-up', path(laptop.page));
  const key = await keyOnPage(laptop.page);
  pass(`${t6}: with a new key`, key === NEW_PHONE_KEY);
  await giveCode(laptop.page, key, 'Turn it on');
  pass(`${t6}: Turn it on leads to new codes (the old ones went with the reset)`, (await waitPath(laptop.page, /recovery-codes$/)) === '/coach/sign-in/recovery-codes', path(laptop.page));
  const fresh = await codesOnPage(laptop.page);
  pass(`${t6}: 10 new codes`, fresh.length === 10 && world.codeRows.length === 10 && !fresh.some((c) => M26_CODES.includes(c.replace('-', ''))));
  await laptop.page.getByRole('checkbox', { name: 'I’ve saved them somewhere safe' }).click();
  await press(laptop.page, 'Open the coach portal');
  pass(`${t6}: and into the coach portal`, (await waitPath(laptop.page, /^\/coach$/)) === '/coach', path(laptop.page));
  // On the phone: the new authenticator's code, and a code from before the reset refused.
  await signIn(phone.page, world);
  await waitPath(phone.page, /\/code$/);
  await phone.page.getByRole('link', { name: 'Lost your authenticator app?' }).click();
  await phone.page.getByRole('textbox', { name: 'Recovery code' }).waitFor({ timeout: 15000 }).catch(() => null);
  await phone.page.getByLabel('Recovery code').fill('m9ze-t4ra');
  await press(phone.page, 'Sign in');
  await phone.page.waitForSelector('.si-err', { timeout: 10000 }).catch(() => null);
  pass(`${t6}: a recovery code from before the reset is refused`, (await message(phone.page)) === RECOVERY_DIDNT_WORK.join(' '));
  await phone.page.goto(`${APP}/coach/sign-in/code`);
  await giveCode(phone.page, key);
  pass(`${t6}: the new authenticator's code opens the coach portal on her phone`, (await waitPath(phone.page, /^\/coach$/)) === '/coach', path(phone.page));
  pass(`${tag}: nothing was written to the test project`, !store.calls.some((c) => /^blocked/.test(c)), store.calls.filter((c) => /^blocked/.test(c)).slice(0, 3).join(', '));
  pass(`${tag}: nothing of Maya's reached anywhere but the stand-ins`, bad(world).length === 0, bad(world).join(', '));
  const errs = [...ownerErrors, ...laptop.errors, ...phone.errors];
  pass(`${tag}: no page errors`, errs.length === 0, errs.slice(0, 2).join(' | '));
  await laptop.ctx.close();
  await phone.ctx.close();
  await octx.close();
}

// ---------------------------------------------------------------- the reset where the database can't reach sessions
if (PARTS.includes('hosted')) {
  const tag = `Reset where the database can’t reach sessions, ${SIZES[0]}`;
  const world = makeWorld({ factor: 'verified', live: true, sqlReachesAuth: false });
  const { ctx, page, errors } = await device(world, { signedIn: true, aal: 'aal2' });
  await page.goto(`${APP}/coach`);
  await sleep(1500);
  const out = await world.serve({ kind: 'reset', coachId: world.coaches.find((c) => c.user_id === world.user.id).id }, `Bearer ${ownerToken(world.coaches.find((c) => c.role === 'owner').user_id)}`);
  pass(`${tag}: the server resets; the admin calls take the factor off; the sessions stay (no admin call ends them)`, out.status === 200 && out.body.ran && out.body.signedOutEverywhere === false && world.factors.length === 0 && world.codeRows.length === 0 && world.sessions.size === 1, JSON.stringify({ status: out.status, ...out.body }));
  // An hour later: the token has run out, and the page refreshes it as it loads (a new iat, the same sign-in).
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('clarity-portal-auth')); s.expires_at = Math.floor(Date.now() / 1000) - 60; localStorage.setItem('clarity-portal-auth', JSON.stringify(s)); });
  const refreshes = () => world.calls.filter((c) => c === 'POST /auth/v1/token').length;
  const before = refreshes();
  await page.reload();
  await waitPath(page, /^\/coach\/sign-in$/);
  await page.waitForSelector('.si-err', { timeout: 10000 }).catch(() => null);
  pass(`${tag}: the token was refreshed as the page loaded`, refreshes() > before, `${refreshes() - before}`);
  pass(`${tag}: a sign-in from before the reset is still signed out after its refresh, and told why`, path(page) === '/coach/sign-in' && (await message(page)) === signedOutLine, `${path(page)} "${await message(page)}"`);
  pass(`${tag}: no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------- 7. the 2-or-fewer line
if (PARTS.includes('low')) {
  const tag = `2 or fewer codes, ${SIZES[0]}`;
  const world = makeWorld({ factor: 'verified', codesLeft: 2, live: true });
  const { ctx, page, errors } = await device(world, { width: SIZES[0] });
  await signIn(page, world);
  await waitPath(page, /\/code$/);
  await giveCode(page, M26_KEY);
  pass(`${tag}: after the code, You're in with the line`, (await waitPath(page, /\/in$/)) === '/coach/sign-in/in' && (await words(page)).includes(lowCodesLine(2)), path(page));
  await press(page, COACH_AUTH_WORDS.low.button);
  pass(`${tag}: Open the coach portal`, (await waitPath(page, /^\/coach$/)) === '/coach', path(page));
  await page.reload();
  await sleep(2000);
  pass(`${tag}: a reload doesn't say it again`, path(page) === '/coach', path(page));
  const tab = await ctx.newPage();
  await tab.goto(`${APP}/coach`);
  await sleep(2000);
  pass(`${tag}: nor a new tab`, path(tab) === '/coach', path(tab));
  await tab.goto(`${APP}/coach/sign-in/code`);
  await sleep(2000);
  // (It passes them on to wherever the tab was going: Home, in a tab with no place remembered.)
  pass(`${tag}: nor the code page opened again in the same sign-in`, !/\/(in|code)$/.test(path(tab)), path(tab));
  // The code given again in the same sign-in (Make new codes' current code, say) never brings it back.
  await tab.goto(`${APP}/coach/settings/sign-in-security`);
  await tab.waitForSelector('.si-srow', { timeout: 20000 }).catch(() => null);
  pass(`${tag}: Sign-in security reads "2 of 10 left"`, (await words(tab, '.si-col--account')).includes(codesLeftSummary(2, 10)));
  await tab.close();
  await signOut(page);
  await waitPath(page, /^\/coach\/sign-in$/);
  await signIn(page, world);
  await waitPath(page, /\/code$/);
  await giveCode(page, M26_KEY);
  pass(`${tag}: a new sign-in says it once more`, (await waitPath(page, /\/in$/)) === '/coach/sign-in/in' && (await words(page)).includes(lowCodesLine(2)), path(page));
  await ctx.close();
  // At 3 left there's nothing to say.
  const three = makeWorld({ factor: 'verified', codesLeft: 3, live: true });
  const d3 = await device(three, { width: SIZES[0] });
  await signIn(d3.page, three);
  await waitPath(d3.page, /\/code$/);
  await giveCode(d3.page, M26_KEY);
  pass(`${tag}: with 3 left, straight into the coach portal`, (await waitPath(d3.page, /^\/coach$/)) === '/coach', path(d3.page));
  pass(`${tag}: no page errors`, [...errors, ...d3.errors].length === 0, [...errors, ...d3.errors].slice(0, 2).join(' | '));
  await d3.ctx.close();
}

// ---------------------------------------------------------------- 8. a client
if (PARTS.includes('client')) {
  const tag = `A client, ${SIZES[0]}`;
  const world = makeWorld({ role: 'client', factor: 'none', codesMade: false, live: true, user: SAM });
  const { ctx, page, errors } = await device(world, { width: SIZES[0] });
  await signIn(page, world, '/auth/login');
  pass(`${tag}: signs in to Home as before`, (await waitPath(page, /^\/welcome$/)) === '/welcome', path(page));
  await sleep(1500);
  const asked = () => world.calls.filter((c) => /coach_auth|coach_recovery|\/factors/.test(c));
  pass(`${tag}: nothing about the coach authenticator is asked on the way in`, asked().length === 0, asked().join(', '));
  await page.goto(`${APP}/my-account`);
  await sleep(2500);
  pass(`${tag}: My Account has no Sign-in security`, !(await page.getByText('Sign-in security').count()));
  for (const [go, what] of [
    ['/coach', 'the coach portal'],
    ['/coach/sign-in/set-up', 'Set up your authenticator'],
    ['/coach/sign-in/recovery-codes', 'Save your recovery codes'],
    ['/coach/sign-in/help', 'Lost your authenticator app?'],
    ['/coach/sign-in/in', 'You’re in'],
    ['/coach/settings/sign-in-security', 'Sign-in security'],
  ]) {
    await page.goto(`${APP}${go}`);
    await sleep(3000);
    const shown = await page.locator('.si-qr, .si-rc, input[name="recovery-code"], .si-srow').count();
    pass(`${tag}: opening ${what} by its address shows none of it`, shown === 0 && !/^\/coach\/sign-in\/(set-up|recovery-codes|help|in)$|sign-in-security$/.test(path(page)), `${go} -> ${path(page)}`);
  }
  pass(`${tag}: no authenticator was enrolled and no codes were made`, world.enrolled === 0 && world.madeSets === 0, `${world.enrolled} enrolled, ${world.madeSets} sets`);
  pass(`${tag}: nothing reached anywhere but the stand-ins`, bad(world).length === 0, bad(world).join(', '));
  pass(`${tag}: no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  await ctx.close();
}

await browser.close();
done();
