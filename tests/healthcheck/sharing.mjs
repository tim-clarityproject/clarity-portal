// Guests choose who sees their answers (Tim, 14 Nov, 09:52; migration 044),
// in a browser: the outside Health Check and Get unstuck's guest pages, at
// 1440 and 400 wide.
//
//   node tests/healthcheck/sharing.mjs <folder>
//   SIZES=1440,400  MODES=dark  PARTS=hc,guest
//
// For each: You and Tim is the default; the eye's panel offers Only you or
// You and Tim with the line under the choice; switching to Only you halfway
// and back saves each time with "Saved"; finishing asks for the coach's
// completion email only while it is You and Tim (and once more on switching
// back after finishing); the guest still gets their PDF and their copy; and
// before 044 has run the choice is kept on the device for the visit, with
// no error, and never lets the coach's email be asked for while it is Only
// you.
//
// The pages run on the dev server. Every database call is answered by
// stand-ins shaped as the SQL (tests/healthcheck/hc-shared.mjs and
// tests/phase8/shared.mjs), every /api/ call is answered there, and
// everything else outside localhost is blocked: nothing is saved and no
// email is sent. The claims after sign-in are checked by
// tests/healthcheck/sharing.test.mjs and supabase/044_guest_sharing_test.sql.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TOKEN, appPage, kestrel, signIn } from './hc-shared.mjs';
import { GUEST_TOKEN, M9, block, fillTo, guestApi, guestOpenTool, guestStandIn, onQuestion, pressNext } from '../phase8/shared.mjs';

const out = process.argv[2] || join(process.cwd(), 'tmp-hc-sharing');
mkdirSync(out, { recursive: true });
const SIZES = (process.env.SIZES || '1440,400').split(',').map(Number);
const MODES = (process.env.MODES || 'dark').split(',');
const PARTS = (process.env.PARTS || 'hc,guest').split(',');
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const DIALOG = '[role=dialog]:not(.ds-guide)';
const SHARED_LINE = (c) => `${c} sent you the link and will see your results.`;
const PRIVATE_LINE = (c) => `${c} won’t see your answers, but you still get your PDF.`;

const results = [];
let failures = 0;
const pass = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `: ${String(detail).slice(0, 400)}` : ''}`);
};

async function until(fn, ms = 8000) {
  const end = Date.now() + ms;
  for (;;) {
    if (await Promise.resolve().then(fn).catch(() => false)) return true;
    if (Date.now() > end) return false;
    await sleep(40);
  }
}
const toastText = (page) => page.evaluate(() => [...document.querySelectorAll('.ds-toast')].map((t) => t.innerText.replace(/\s+/g, ' ').trim()).join(' | '));
const hasToast = (page, words, ms = 4000) => until(async () => (await toastText(page)).includes(words), ms);

/** The eye showing now (the last visible one). */
const eye = (page) => page.locator('.ds-who--eye:visible').last();
const eyeLabel = async (page) => (await eye(page).getAttribute('aria-label')) || '';

/** Opens the eye's panel and reads it: { options, chosen, text }. */
async function readPanel(page) {
  await eye(page).click();
  const sheet = page.locator(DIALOG).last();
  await sheet.waitFor({ timeout: 5000 });
  await sleep(300);
  return {
    sheet,
    options: await sheet.locator('[role=option]').allInnerTexts(),
    chosen: (await sheet.locator('[role=option][aria-selected=true]').innerText().catch(() => '')).trim(),
    text: (await sheet.innerText()).replace(/\s+/g, ' '),
  };
}

/** Chooses one in the eye's panel; true when it said "Saved" and closed. */
async function choose(page, words, tag, coach) {
  const panel = await readPanel(page);
  await panel.sheet.getByRole('option', { name: words, exact: true }).click();
  const saved = await hasToast(page, 'Saved');
  const closed = await until(async () => (await page.locator(DIALOG).count()) === 0, 4000);
  pass(`${tag}: choosing “${words}” saves at once with “Saved”`, saved && closed, await toastText(page));
  const want = words === 'Only you' ? 'Only you can see this. Edit who can see this.' : `You and ${coach} can see this. Edit who can see this.`;
  pass(`${tag}: ... and the eye says so`, await until(async () => (await eyeLabel(page)) === want, 3000), await eyeLabel(page));
  return panel;
}

// ---------------------------------------------------------------- the outside Health Check
const LAST_RESOURCE = { screen: 'resource', project: 6 };
const resultsShowing = (page) => until(async () => (await page.locator('.ds-guide-title, h1').allInnerTexts()).some((t) => /strategic alignment health check/i.test(t))
  && (await page.locator('text=Questions to start with').count()) > 0, 10000);

/** From the last Resource question to the results (the answer moves on by itself). */
async function finishHc(page) {
  await page.locator('.ds-answer').first().waitFor({ timeout: 8000 });
  await sleep(500);
  await page.locator('.ds-answer').nth(2).click();
  return resultsShowing(page);
}

async function hc(browser, width, mode) {
  const tag = `Health Check ${width}px ${mode}`;
  const data = kestrel({ complete: false });

  // 1. You and Tim by default; Only you halfway, then back; finish: the coach's email is asked for, once.
  {
    const { ctx, page, session, problems } = await appPage(browser, width, mode, { data, step: { screen: 'objective' } });
    await signIn(page, session);
    pass(`${tag}: the eye on the first question says You and Tim by default`, (await eyeLabel(page)) === 'You and Tim can see this. Edit who can see this.', await eyeLabel(page));
    const first = await readPanel(page);
    pass(`${tag}: the panel offers Only you or You and Tim, You and Tim chosen`, first.options.join('|') === 'Only you|You and Tim' && first.chosen === 'You and Tim', JSON.stringify(first.options));
    pass(`${tag}: the line under the choice: “${SHARED_LINE('Tim')}”`, first.text.includes(SHARED_LINE('Tim')), first.text);
    await page.screenshot({ path: join(out, `hc-panel-${width}-${mode}.png`) });
    await page.keyboard.press('Escape');
    await until(async () => (await page.locator(DIALOG).count()) === 0, 3000);
    await choose(page, 'Only you', `${tag}, halfway`, 'Tim');
    pass(`${tag}, halfway: Only you reaches the database (alignment_set_sharing)`, await until(async () => session.shared === false) && session.sharingCalls.join(',') === 'false', session.sharingCalls.join(','));
    const now = await readPanel(page);
    pass(`${tag}, halfway: the line follows the choice: “${PRIVATE_LINE('Tim')}”`, now.chosen === 'Only you' && now.text.includes(PRIVATE_LINE('Tim')), now.text);
    await page.screenshot({ path: join(out, `hc-panel-only-you-${width}-${mode}.png`) });
    await page.keyboard.press('Escape');
    await until(async () => (await page.locator(DIALOG).count()) === 0, 3000);
    await choose(page, 'You and Tim', `${tag}, then back`, 'Tim');
    pass(`${tag}, then back: You and Tim reaches the database`, await until(async () => session.shared === true));
    // Carry on to the last question (as if answered), then finish.
    session.current_step = LAST_RESOURCE;
    await page.reload();
    const done = await finishHc(page);
    pass(`${tag}: the last answer opens the results`, done);
    pass(`${tag}: finished as You and Tim, the coach’s completion email is asked for, once`, await until(async () => session.coachEmails === 1, 6000) && session.emails.filter((k) => k === 'complete').length === 1, session.emails.join(','));
    pass(`${tag}: the results’ eye still says You and Tim`, (await eyeLabel(page)) === 'You and Tim can see this. Edit who can see this.', await eyeLabel(page));
    pass(`${tag}: no page errors`, problems.length === 0, problems.join(' | '));
    await ctx.close();
  }

  // 2. Only you, then finish: no coach email; the PDF is still there; switching back sends it then, once.
  {
    const { ctx, page, session, problems } = await appPage(browser, width, mode, { data, step: { screen: 'objective' } });
    await signIn(page, session);
    await choose(page, 'Only you', `${tag}, Only you`, 'Tim');
    session.current_step = LAST_RESOURCE;
    await page.reload();
    const done = await finishHc(page);
    pass(`${tag}, Only you: the last answer opens the results`, done);
    await sleep(1500);
    pass(`${tag}, Only you: no completion email is asked for (the coach hears nothing)`, !session.emails.includes('complete') && session.coachEmails === 0, session.emails.join(','));
    pass(`${tag}, Only you: the results’ eye says Only you`, (await eyeLabel(page)) === 'Only you can see this. Edit who can see this.', await eyeLabel(page));
    pass(`${tag}, Only you: the guest still has their PDF and “Email my link”`, (await page.getByRole('button', { name: 'Download my PDF' }).count()) > 0 && (await page.getByRole('button', { name: 'Email my link' }).count()) > 0);
    await page.screenshot({ path: join(out, `hc-results-only-you-${width}-${mode}.png`) });
    await page.getByRole('button', { name: 'Email my link' }).click();
    pass(`${tag}, Only you: the guest's own link email is still asked for`, await until(async () => session.emails.includes('link'), 4000), session.emails.join(','));
    await choose(page, 'You and Tim', `${tag}, back after finishing`, 'Tim');
    pass(`${tag}, back after finishing: the coach’s email is asked for now, once`, await until(async () => session.coachEmails === 1, 6000) && session.emails.filter((k) => k === 'complete').length === 1, session.emails.join(','));
    pass(`${tag}, Only you: no page errors`, problems.length === 0, problems.join(' | '));
    await ctx.close();
  }

  // 3. Before 044 has run: the choice is kept on the device for the visit, with no error, and holds back the coach's email.
  {
    const { ctx, page, session, problems } = await appPage(browser, width, mode, { data, step: { screen: 'objective' }, no044: true });
    await signIn(page, session);
    await choose(page, 'Only you', `${tag}, before 044`, 'Tim');
    const kept = await page.evaluate((t) => localStorage.getItem(`clarity-share:hc:${t}`), TOKEN);
    pass(`${tag}, before 044: the choice is kept on the device for the visit, not yet sent`, kept === '{"shared":false,"sent":false}', kept);
    pass(`${tag}, before 044: nothing alarming is said`, !(await toastText(page)).match(/didn’t|couldn’t|try again/i), await toastText(page));
    session.current_step = LAST_RESOURCE;
    await page.reload();
    const done = await finishHc(page);
    pass(`${tag}, before 044: opened again, the kept choice holds`, done && (await eyeLabel(page)).startsWith('Only you'), await eyeLabel(page));
    await sleep(1500);
    pass(`${tag}, before 044: finished as Only you, no completion email is asked for`, !session.emails.includes('complete'), session.emails.join(','));
    pass(`${tag}, before 044: the page tried to send the kept choice again`, session.sharingCalls.length >= 2, session.sharingCalls.join(','));
    await choose(page, 'You and Tim', `${tag}, before 044, back`, 'Tim');
    pass(`${tag}, before 044, back: the coach’s email is asked for now`, await until(async () => session.coachEmails === 1, 6000), session.emails.join(','));
    pass(`${tag}, before 044: no page errors`, problems.length === 0, problems.join(' | '));
    await ctx.close();
  }

  // 5. With 045: Only you replaces the code. The old one (the coach had it) opens nothing; the new one goes to the guest's email.
  {
    const { ctx, page, session, problems } = await appPage(browser, width, mode, { data, step: { screen: 'objective' }, with045: true });
    await signIn(page, session);
    const old = session.code;
    {
      const panel = await readPanel(page);
      await panel.sheet.getByRole('option', { name: 'Only you', exact: true }).click();
      pass(`${tag}, 045: choosing “Only you” says “Saved”`, await hasToast(page, 'Saved'), await toastText(page));
    }
    pass(`${tag}, 045: Only you replaces the code`, await until(async () => session.reissued === true));
    pass(`${tag}, 045: the new code is asked to be emailed to the guest (with the old code, as proof)`, await until(async () => session.emails.includes('code'), 4000), session.emails.join(','));
    const sub = page.getByText('We’ve emailed you a new access code, so only you can open your answers. Type it to carry on.');
    pass(`${tag}, 045: the page asks for the new code, saying why`, await until(async () => sub.isVisible(), 4000));
    pass(`${tag}, 045: the access code box is empty, the email still there`, (await page.getByLabel('Access code').inputValue()) === '' && (await page.getByLabel('Email').inputValue()) === session.email);
    await page.screenshot({ path: join(out, `hc-new-code-${width}-${mode}.png`) });
    await page.getByRole('button', { name: 'Didn’t get it? Send it again' }).click();
    pass(`${tag}, 045: “Didn’t get it? Send it again” asks again and says “Sent”`, await until(async () => session.emails.filter((k) => k === 'code').length === 2, 4000) && await hasToast(page, 'Sent'), session.emails.join(','));
    await page.getByLabel('Access code').fill(old);
    await page.locator('form button[type=submit]').click();
    pass(`${tag}, 045: the old code no longer opens it`, await until(async () => (await page.getByText('Those details don’t match').count()) > 0, 4000));
    await page.getByLabel('Access code').fill(session.code);
    await page.locator('form button[type=submit]').click();
    await page.locator('.ds-guide .ds-guide-question, .ds-guide .ds-guide-title').first().waitFor();
    await page.waitForTimeout(500);
    pass(`${tag}, 045: the new code opens it, still Only you`, (await eyeLabel(page)) === 'Only you can see this. Edit who can see this.', await eyeLabel(page));
    await choose(page, 'You and Tim', `${tag}, 045, back`, 'Tim');
    pass(`${tag}, 045: back to You and Tim with the new code, and no second code`, await until(async () => session.shared === true) && session.code === 'NEW789' && session.emails.filter((k) => k === 'code').length === 2);
    pass(`${tag}, 045: nothing was refused along the way`, !session.refusedSaves, String(session.refusedSaves || 0));
    pass(`${tag}, 045: no page errors`, problems.length === 0, problems.join(' | '));
    await ctx.close();
  }

  // 4. A choice saved earlier (on another device) is what the eye shows.
  {
    const { ctx, page, session, problems } = await appPage(browser, width, mode, { data, step: { screen: 'objective' }, shared: false });
    await signIn(page, session);
    pass(`${tag}, saved earlier: the eye shows the database’s Only you`, (await eyeLabel(page)) === 'Only you can see this. Edit who can see this.', await eyeLabel(page));
    pass(`${tag}, saved earlier: no page errors`, problems.length === 0, problems.join(' | '));
    await ctx.close();
  }
}

// ---------------------------------------------------------------- Get unstuck's guest pages
async function guest(browser, width, mode) {
  const phone = width < 600;
  const tag = `Get unstuck guest ${width}px ${mode}`;
  const make = async (opts = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height: phone ? 844 : 900 }, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: mode, hasTouch: phone, isMobile: phone, reducedMotion: 'reduce' });
    const state = await guestStandIn(ctx, opts);
    await block(ctx, { api: guestApi(state) });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
    return { ctx, state, page, errors };
  };

  // 1. You and Tim by default; Only you halfway, then back, then Only you at the end.
  {
    const { ctx, state, page, errors } = await make();
    await guestOpenTool(page);
    pass(`${tag}: the eye on the first step says You and Tim by default`, (await eyeLabel(page)) === `You and ${M9.coach} can see this. Edit who can see this.`, await eyeLabel(page));
    pass(`${tag}: the link’s choice is read when the visit opens (guest_sharing)`, state.calls.some((c) => c.name === 'guest_sharing'));
    const first = await readPanel(page);
    pass(`${tag}: the panel offers Only you or You and Tim, You and Tim chosen, with its line`, first.options.join('|') === `Only you|You and ${M9.coach}` && first.chosen === `You and ${M9.coach}` && first.text.includes(SHARED_LINE(M9.coach)), first.text);
    await page.keyboard.press('Escape');
    await until(async () => (await page.locator(DIALOG).count()) === 0, 3000);
    await page.locator('.ds-guide-body .ds-text').first().fill(M9.goal);
    await choose(page, 'Only you', `${tag}, halfway`, M9.coach);
    const set = state.calls.filter((c) => c.name === 'guest_set_sharing');
    pass(`${tag}, halfway: Only you reaches the link with the visit key (guest_set_sharing)`, state.shared === false && set.length === 1 && set[0].args.p_shared === false && /^[0-9a-f]{64}$/.test(set[0].args.p_visit), JSON.stringify(set));
    const now = await readPanel(page);
    pass(`${tag}, halfway: the line follows the choice`, now.text.includes(PRIVATE_LINE(M9.coach)), now.text);
    await page.keyboard.press('Escape');
    await until(async () => (await page.locator(DIALOG).count()) === 0, 3000);
    pass(`${tag}, halfway: the saved item says Only you too`, await until(() => state.rows.length === 1 && state.rows[0].form_data?.shared_with_coach === false, 8000), JSON.stringify(state.rows[0]?.form_data?.shared_with_coach));
    await choose(page, `You and ${M9.coach}`, `${tag}, then back`, M9.coach);
    pass(`${tag}, then back: the link is shared again`, state.shared === true);
    await fillTo(page, 'steps');
    await pressNext(page);
    await onQuestion(page, 'Here’s your plan.');
    pass(`${tag}: Your plan’s eye says You and Tim`, (await eyeLabel(page)) === `You and ${M9.coach} can see this. Edit who can see this.`, await eyeLabel(page));
    await pressNext(page);
    await page.waitForSelector('.ds-guest-question', { timeout: 15000 });
    pass(`${tag}: finished, the saved item says You and Tim`, await until(() => state.rows[0]?.form_data?.shared_with_coach === true && state.rows[0]?.status === 'completed', 6000), JSON.stringify(state.rows[0]?.form_data?.shared_with_coach));
    pass(`${tag}: the end page’s eye says You and Tim`, (await eyeLabel(page)) === `You and ${M9.coach} can see this. Edit who can see this.`, await eyeLabel(page));
    await choose(page, 'Only you', `${tag}, at the end`, M9.coach);
    pass(`${tag}, at the end: the coach can’t read the answers now (as coach_guest_answers would refuse)`, state.coachReads() === false);
    pass(`${tag}, at the end: the guest still gets their copy and their PDF`, await until(async () => state.copies >= 1, 6000) && (await page.getByRole('button', { name: 'Download my PDF' }).count()) === 1);
    await page.screenshot({ path: join(out, `guest-end-only-you-${width}-${mode}.png`), fullPage: true });
    pass(`${tag}: no page errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // 2. Before 044 has run (035 and 042 have): kept on the device, said calmly, carried in the saved item.
  {
    const { ctx, state, page, errors } = await make({ no044: true });
    await guestOpenTool(page);
    pass(`${tag}, before 044: the eye says You and Tim by default`, (await eyeLabel(page)) === `You and ${M9.coach} can see this. Edit who can see this.`, await eyeLabel(page));
    await page.locator('.ds-guide-body .ds-text').first().fill(M9.goal);
    await choose(page, 'Only you', `${tag}, before 044`, M9.coach);
    const kept = await page.evaluate((t) => sessionStorage.getItem(`clarity-share:guest:${t}`), GUEST_TOKEN);
    pass(`${tag}, before 044: kept on the device for the visit, not yet sent`, kept === '{"shared":false,"sent":false}', kept);
    pass(`${tag}, before 044: nothing alarming is said`, !(await toastText(page)).match(/didn’t|couldn’t|try again|isn’t ready/i), await toastText(page));
    pass(`${tag}, before 044: the saved item carries Only you`, await until(() => state.rows[0]?.form_data?.shared_with_coach === false, 8000), JSON.stringify(state.rows[0]?.form_data));
    pass(`${tag}, before 044: no page errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
}

const browser = await chromium.launch();
try {
  for (const width of SIZES) {
    for (const mode of MODES) {
      if (PARTS.includes('hc')) await hc(browser, width, mode);
      if (PARTS.includes('guest')) await guest(browser, width, mode);
    }
  }
} finally {
  await browser.close();
}
writeFileSync(join(out, 'report.txt'), `${results.join('\n')}\n`);
results.filter((r) => r.startsWith('FAIL')).forEach((r) => console.log(r));
console.log(`${results.filter((r) => r.startsWith('PASS')).length} passed, ${failures} failed (report: ${join(out, 'report.txt')})`);
process.exit(failures ? 1 : 0);
