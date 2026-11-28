// The client's agreement walk (Polish 1, Stage C; M28 v6 "sign"): Read, Sign and Settle as one flow in focus mode
// (ToolFrame), on the real pages, signed in as Sam Carter (the standing client) on the LOCAL STAND-IN with the Polish 1
// seed. Replaces run 1's walk (M13's "Read the full agreement", stubbed 061 functions), which no longer matched the pages.
//
// What it walks, at each size and mode (SIZES, MODES):
//   read    Step 1 of 3 in focus mode (no menu column), "Prepared for Sam by …", the coach's note, The main points, The
//           agreement with its clause count, the first clause open and the clauses opening one at a time, I've read it.
//   check   the sign step: Your full name filled from the agreement, the typed name as the signature to start with,
//           Sign pressed too early says "Tick the box to say you agree.", then "Type your full name to sign.", Draw instead
//           opens the box, Type it instead closes it, the start-now tick (self-funded), Back goes to Read.
// Once (the first size and mode), as it writes:
//   sign    5eed0c40-…02 signed with a drawn signature → Settle (Step 3 of 3, the amount "today", Card / Apple Pay, the
//           stand-in form, the 14-day line) → Direct Debit (?rest=bacs, only where something follows; this one is up front, so it is read directly below) → Welcome ("You’re all set").
//   typed   5eed0c40-…04 (now the one waiting) signed with the typed name, start-now ticked.
//   ask     5eed0c40-…06 (now the one waiting): a clause's Ask for a change opens Quick Add; Send with nothing typed does
//           nothing; typed words send, the toast says so, and Read shows "You asked for a change to …" and no Next.
// Then at every size and mode (read only): the signed version's view (Signed, Download PDF), Settle and Direct Debit,
// Welcome, the asked version's line, and Sam's own signed agreement (5eed0600-000a-…01). Every screen is read by the
// lasting design check (tests/design/design-rules.mjs designProblems). Nothing outside this machine is reached: any
// request to another host is stopped and fails the walk.
//
// Set-up (each run needs a fresh copy, as the walk signs and asks):
//   node tests/scale/db.mjs --from <polish-seeded.tar> --dump <copy.tar> tests/coaching/agreement-walk-seed.sql
//   POSTGREST_BIN=… node tests/scale/stack.mjs --snapshot <copy.tar> --port 54780
//   VITE_SUPABASE_URL=http://localhost:54780 VITE_SUPABASE_ANON_KEY=<stack.mjs's> npx vite --port 5480 --strictPort
//   LOCAL_SUPABASE_URL=http://localhost:54780 APP_URL=http://localhost:5480 \
//     node --import ./tests/scores/register.mjs tests/coaching/agreement-walk.mjs [folder for screenshots]
//   SIZES=1440,400  MODES=dark,light  narrow it.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { designProblems } from '../design/design-rules.mjs';
import { HOSTED, LOCAL_URL } from '../target.mjs';

if (HOSTED) throw new Error('The agreement walk signs and asks: it runs on the local stand-in only.');
const API = LOCAL_URL;
const APP = (process.env.APP_URL || 'http://localhost:5480').replace(/\/$/, '');
const OUT = process.argv[2] || null;
if (OUT) mkdirSync(OUT, { recursive: true });
const SIZES = (process.env.SIZES || '1440,400').split(',').map(Number);
const MODES = (process.env.MODES || 'dark,light').split(',');
const SAM = 'local-client@example.com';
const V = (n) => `5eed0c40-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DRAWN = V(2);
const TYPED = V(4);
const ASKED = V(6);
const SAM_SIGNED = '5eed0600-000a-4000-8000-000000000001';

let passed = 0;
const failed = [];
const pass = (what, ok, detail = '') => { if (ok) passed += 1; else { failed.push(`${what}${detail ? `: ${detail}` : ''}`); console.log(`  FAILED ${what}${detail ? `: ${detail}` : ''}`); } return ok; };

const browser = await chromium.launch({ args: ['--mute-audio'] });
const session = await (await fetch(`${API}/__session?email=${encodeURIComponent(SAM)}`)).json();
const outside = [];

async function open(width, mode) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, colorScheme: mode, reducedMotion: 'reduce', serviceWorkers: 'block', hasTouch: width < 600 });
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) || /^(data|blob):/.test(u.protocol)) return r.continue();
    outside.push(u.host);
    return r.abort('blockedbyclient');
  });
  await ctx.addInitScript(({ v }) => { try { if (!localStorage.getItem('clarity-portal-auth')) localStorage.setItem('clarity-portal-auth', v); } catch { /* none */ } }, { v: JSON.stringify(session) });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
  return { ctx, page, errors };
}
const still = (page) => page.addStyleTag({ content: '* { transition: none !important; animation-duration: 0s !important; }' }).catch(() => {});
const go = async (page, path) => { await page.goto(APP + path, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {}); await page.waitForTimeout(600); await still(page); };
const body = (page) => page.evaluate(() => document.body.innerText);
const stepWords = (page) => page.locator('.ds-tool-step').first().textContent().catch(() => '');
const question = (page) => page.locator('.ds-tool-q').first().textContent().catch(() => '');
const next = (page) => page.locator('.ds-tool-foot .ds-btn--primary').first();
const need = (page) => page.locator('.cl-signstep .ds-error, .cl-signstep [role=alert]').first().textContent({ timeout: 3000 }).catch(() => '');

async function design(page, what, width) {
  await still(page);
  const r = await page.evaluate(designProblems, { phone: width < 600, scale: 1 });
  pass(`${what}: design check`, r.problems.length === 0, r.problems.join(' / '));
}
async function shot(page, name) { if (OUT) await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true }); }

// ---------------------------------------------------------------- read and the sign step (nothing written)
async function readAndCheck(width, mode) {
  const tag = `${width} ${mode}`;
  const { ctx, page, errors } = await open(width, mode);
  await go(page, `/coaching/agreement/${DRAWN}`);
  pass(`read ${tag}: Step 1 of 3`, /Step 1 of 3/.test(await stepWords(page)), await stepWords(page));
  pass(`read ${tag}: the title`, /Your coaching agreement/.test(await question(page)));
  pass(`read ${tag}: focus mode hides the menu column`, !(await page.locator('.ds-frame-side').first().isVisible().catch(() => false)));
  const text = await body(page);
  pass(`read ${tag}: prepared for Sam`, /Prepared for Sam/i.test(text));
  pass(`read ${tag}: the coach's note`, /Thank you for this morning/.test(text));
  pass(`read ${tag}: The main points`, /The main points/i.test(text));
  pass(`read ${tag}: the clause count`, /\d+ clauses/.test(await page.locator('.cl-count').first().textContent().catch(() => '')));
  const folds = page.locator('.cl-fold');
  const n = await folds.count();
  pass(`read ${tag}: clauses listed`, n >= 8, String(n));
  pass(`read ${tag}: the first clause open to start with`, (await folds.nth(0).getAttribute('aria-expanded')) === 'true');
  await folds.nth(2).click();
  await page.waitForTimeout(200);
  const openNow = await page.locator('.cl-fold[aria-expanded=true]').count();
  pass(`read ${tag}: one clause open at a time`, openNow === 1 && (await folds.nth(2).getAttribute('aria-expanded')) === 'true', String(openNow));
  pass(`read ${tag}: Ask for a change under the open clause`, await page.locator('.cl-asklink').first().isVisible());
  await design(page, `read ${tag}`, width);
  await shot(page, `read-${width}-${mode}`);
  pass(`read ${tag}: I've read it`, /I’ve read it/.test(await next(page).textContent()));
  await next(page).click();
  await page.waitForTimeout(400);

  // The sign step.
  pass(`sign step ${tag}: Step 2 of 3`, /Step 2 of 3/.test(await stepWords(page)), await stepWords(page));
  pass(`sign step ${tag}: the question is Sign`, (await question(page)).trim() === 'Sign');
  const name = page.getByLabel('Your full name');
  pass(`sign step ${tag}: the name from the agreement`, (await name.inputValue()) === 'Sam Carter', await name.inputValue());
  pass(`sign step ${tag}: the typed name is the signature`, /Sam Carter/.test(await page.locator('.cl-sigprev').first().textContent().catch(() => '')));
  pass(`sign step ${tag}: the start-now tick (self-funded)`, (await page.locator('.cl-ticks [role=checkbox], .cl-ticks input[type=checkbox]').count()) === 2);
  await design(page, `sign step ${tag}`, width);
  await shot(page, `sign-${width}-${mode}`);
  await next(page).click();
  pass(`sign step ${tag}: Sign too early asks for the tick`, /Tick the box to say you agree\./.test(await need(page)), await need(page));
  await design(page, `sign step, nothing ticked ${tag}`, width);
  await page.getByText('I’ve read this agreement and I agree to it.').click();
  await name.fill('');
  await next(page).click();
  pass(`sign step ${tag}: no name asks for it`, /Type your full name to sign\./.test(await need(page)), await need(page));
  await name.fill('Sam Carter');
  await page.getByText('Draw my signature instead').click();
  pass(`sign step ${tag}: Draw instead opens the box`, await page.locator('canvas.cl-sig-canvas').isVisible());
  await design(page, `sign step, drawing ${tag}`, width);
  await page.getByText('Type it instead').click();
  pass(`sign step ${tag}: Type it instead closes it`, !(await page.locator('canvas.cl-sig-canvas').isVisible().catch(() => false)));
  await page.locator('.ds-tool-back').first().click();
  await page.waitForTimeout(300);
  pass(`sign step ${tag}: Back goes to Read`, /Step 1 of 3/.test(await stepWords(page)));
  pass(`${tag}: no page errors`, errors.length === 0, errors.join(' / '));
  await ctx.close();
}

// ---------------------------------------------------------------- signing, settling, asking (once: it writes)
async function signDrawn(width, mode) {
  const { ctx, page, errors } = await open(width, mode);
  await go(page, `/coaching/agreement/${DRAWN}`);
  await next(page).click();
  await page.waitForTimeout(300);
  await page.getByText('I’ve read this agreement and I agree to it.').click();
  await page.getByText('Draw my signature instead').click();
  const box = await page.locator('canvas.cl-sig-canvas').boundingBox();
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 12; i += 1) await page.mouse.move(box.x + 20 + i * 14, box.y + box.height / 2 + (i % 2 ? -12 : 12), { steps: 2 });
  await page.mouse.up();
  await next(page).click();
  await page.waitForURL(/\/settle/, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await still(page);
  pass('sign (drawn): Signed leads to Settle', /\/coaching\/agreement\/[^/]+\/settle$/.test(new URL(page.url()).pathname), page.url());
  pass('settle: Step 3 of 3', /Step 3 of 3/.test(await stepWords(page)), await stepWords(page));
  const t = await body(page);
  pass('settle: the amount, today', /today/.test(t));
  pass('settle: How would you like to settle?', /How would you like to settle\?/.test(t));
  pass('settle: the 14-day line', /14 days/.test(t));
  pass('settle: the stand-in card form', /Stripe’s secure card form sits here\./.test(t));
  await page.locator('.ds-seg-btn', { hasText: 'Apple Pay' }).first().click().catch(() => {});
  pass('settle: Apple Pay', /Apple Pay opens on your device\./.test(await body(page)));
  pass('settle: the button says Settle and the amount', /^Settle .+\d/.test((await next(page).textContent()).trim()), await next(page).textContent());
  await next(page).click();
  await page.waitForURL(/rest=bacs|\/welcome/, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(800);
  if (/rest=bacs/.test(page.url())) {
    pass('direct debit: its title', /Direct Debit/.test(await question(page)));
    await page.getByRole('button', { name: 'Not now' }).click();
    await page.waitForURL(/\/welcome/, { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(800);
  }
  await page.locator('.cl-done-title').first().waitFor({ timeout: 10000 }).catch(() => {});
  pass('welcome: You’re all set', /You’re all set/i.test(await body(page)), `${new URL(page.url()).pathname}: ${(await body(page)).slice(0, 160).replace(/\n/g, ' | ')}`);
  pass('welcome: Done', /Done/.test(await stepWords(page)));
  pass('sign: no page errors', errors.length === 0, errors.join(' / '));
  await ctx.close();
}

async function signTyped(width, mode) {
  const { ctx, page, errors } = await open(width, mode);
  await go(page, `/coaching/agreement/${TYPED}`);
  pass('typed: the next one waiting can be read', /I’ve read it/.test(await next(page).textContent().catch(() => '')));
  await next(page).click();
  await page.waitForTimeout(300);
  await page.getByText('I’ve read this agreement and I agree to it.').click();
  await page.locator('.cl-ticks').getByRole('checkbox').nth(1).click().catch(() => page.locator('.cl-ticks label').nth(1).click());
  // A tap in the first moment after a step moves is ignored on purpose (ToolFrame's guard, as GuidedTool's NEXT_GUARD_MS).
  await page.waitForTimeout(450);
  await next(page).click();
  await page.waitForURL(/\/(settle|welcome)/, { timeout: 15000 }).catch(() => {});
  pass('typed: signed with the typed name', /\/(settle|welcome)/.test(page.url()), page.url());
  pass('typed: no page errors', errors.length === 0, errors.join(' / '));
  await ctx.close();
}

async function askChange(width, mode) {
  const { ctx, page, errors } = await open(width, mode);
  await go(page, `/coaching/agreement/${ASKED}`);
  pass('ask: the third one is waiting', /I’ve read it/.test(await next(page).textContent().catch(() => '')));
  await page.locator('.cl-fold').nth(1).click();
  await page.locator('.cl-asklink').first().click();
  const box = page.locator('input.ds-qa-box');
  pass('ask: Quick Add opens with its question', await box.isVisible());
  await design(page, 'ask: Quick Add open', width);
  await page.locator('.ds-qa-acts .ds-btn--primary').click();
  await page.waitForTimeout(300);
  pass('ask: nothing typed sends nothing', await box.isVisible());
  await box.fill('Could the notice to rearrange be 48 hours rather than 24?');
  await page.locator('.ds-qa-acts .ds-btn--primary').click();
  const toast = await page.locator('.ds-toast-text').last().textContent({ timeout: 6000 }).catch(() => '');
  pass('ask: the toast says it went', /^Sent to /.test(toast), toast);
  await page.waitForTimeout(1200);
  pass('ask: Read shows the change line', /You asked for a change to/.test(await body(page)));
  pass('ask: no Next while a change waits', (await page.locator('.ds-tool-foot .ds-btn--primary').count()) === 0);
  pass('ask: no page errors', errors.length === 0, errors.join(' / '));
  await ctx.close();
}

// ---------------------------------------------------------------- what is left to read, at every size and mode
async function afterwards(width, mode) {
  const tag = `${width} ${mode}`;
  const { ctx, page, errors } = await open(width, mode);
  for (const [what, path, check] of [
    ['signed view', `/coaching/agreement/${DRAWN}`, async () => /Signed/.test(await stepWords(page)) && (await page.getByRole('button', { name: /PDF/ }).count()) > 0],
    ['settle', `/coaching/agreement/${DRAWN}/settle`, async () => /How would you like to settle\?/.test(await body(page))],
    ['direct debit', `/coaching/agreement/${DRAWN}/settle?rest=bacs`, async () => /Direct Debit/.test(await question(page))],
    ['welcome', `/coaching/agreement/${DRAWN}/welcome`, async () => /You’re all set/i.test(await body(page))],
    ['a change asked', `/coaching/agreement/${ASKED}`, async () => /You asked for a change to/.test(await body(page))],
    ['Sam’s own signed agreement', `/coaching/agreement/${SAM_SIGNED}`, async () => /Signed/.test(await stepWords(page))],
  ]) {
    await go(page, path);
    await page.waitForTimeout(what === 'welcome' ? 2500 : 500);
    pass(`${what} ${tag}`, await check(), new URL(page.url()).pathname);
    await design(page, `${what} ${tag}`, width);
    await shot(page, `${what.replace(/\W+/g, '-')}-${width}-${mode}`);
  }
  pass(`afterwards ${tag}: no page errors`, errors.length === 0, errors.join(' / '));
  await ctx.close();
}

const combos = SIZES.flatMap((w) => MODES.map((m) => [w, m]));
for (const [w, m] of combos) { console.log(`read and the sign step, ${w} ${m}`); await readAndCheck(w, m); }
console.log('signing, settling and asking (once)');
await signDrawn(...combos[0]);
await signTyped(...combos[0]);
await askChange(...combos[0]);
for (const [w, m] of combos) { console.log(`afterwards, ${w} ${m}`); await afterwards(w, m); }
pass('nothing outside this machine was asked for', outside.length === 0, [...new Set(outside)].join(', '));
await browser.close();
console.log(`\nAgreements, the client's Read, Sign and Settle: ${passed} passed, ${failed.length} failed.`);
if (failed.length) { console.log(failed.map((f) => `  - ${f}`).join('\n')); process.exitCode = 1; }
