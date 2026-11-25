// Tidy follow-up 4, part 2, item 6: a coach whose role read gets no answer on a first visit is never sent to the client
// Home. The read is asked once more; if that fails too, the coach portal shows its calm error with Try again, and Try
// again opens the portal once the database answers. Local stand-in (stack.mjs) and a production build (serve.mjs) only;
// muted, and nothing leaves this machine.
//
//   node --import ./tests/scores/register.mjs tests/scale/role-check.mjs --app http://127.0.0.1:4320
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const APP = opt('app', 'http://127.0.0.1:4320');
const API = opt('api', 'http://localhost:54400');
const EMAIL = opt('email', 'scale-coach-02@example.com');

const results = [];
const check = (ok, what, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${what}${extra ? ` (${extra})` : ''}`); };

const session = await (await fetch(`${API}/__session?email=${encodeURIComponent(EMAIL)}`)).json();
const browser = await chromium.launch({ args: ['--mute-audio'] });

/** A first visit to /coach with the coach's role read failing `fails` times (Infinity: until told otherwise). */
async function visit(fails) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) return route.continue();
    return route.abort('blockedbyclient');
  });
  await context.addInitScript(({ key, value }) => { try { if (!localStorage.getItem(key)) localStorage.setItem(key, value); } catch { /* none */ } },
    { key: 'clarity-portal-auth', value: JSON.stringify(session) });
  const state = { left: fails, asked: 0 };
  await context.route(/\/rest\/v1\/coaches\?/, (route) => {
    state.asked += 1;
    if (state.left > 0) { state.left -= 1; return route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"unavailable"}' }); }
    return route.continue();
  });
  const page = await context.newPage();
  const seen = new Set();
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) seen.add(new URL(f.url()).pathname); });
  await page.goto(`${APP}/coach`, { waitUntil: 'commit' });
  return { context, page, state, seen };
}

const frame = (page) => page.locator('.cc-header').first();
const problem = (page) => page.getByText('Clarity Coach didn’t load. Check your connection and try again.');

// 1. Fails once: the second read answers, and the portal opens.
{
  const { context, page, state, seen } = await visit(1);
  await frame(page).waitFor({ timeout: 20000 }).catch(() => {});
  check(await frame(page).isVisible(), 'one missed role read: asked again, and the coach portal opens', `${state.asked} reads`);
  check(![...seen].includes('/welcome') && new URL(page.url()).pathname === '/coach', 'one missed role read: never the client Home', [...seen].join(' '));
  await context.close();
}

// 2. Fails every time: the calm error with Try again, never the client Home; Try again opens the portal once it answers.
{
  const { context, page, state, seen } = await visit(Infinity);
  await problem(page).waitFor({ timeout: 20000 }).catch(() => {});
  check(await problem(page).isVisible(), 'every role read missed: the coach portal says it didn’t load');
  const retry = page.getByRole('button', { name: 'Try again' });
  check(await retry.isVisible(), 'every role read missed: Try again is there');
  check(state.asked >= 2, 'every role read missed: it was asked again once before saying so', `${state.asked} reads`);
  check(![...seen].includes('/welcome') && new URL(page.url()).pathname === '/coach', 'every role read missed: never the client Home', [...seen].join(' '));
  await page.waitForTimeout(1500);
  check(!(await frame(page).isVisible()) && new URL(page.url()).pathname === '/coach', 'every role read missed: it stays on the calm error');
  state.left = 0;
  await retry.click();
  await frame(page).waitFor({ timeout: 20000 }).catch(() => {});
  check(await frame(page).isVisible(), 'Try again, with the database answering: the coach portal opens');
  check(![...seen].includes('/welcome'), 'Try again: never the client Home');
  await context.close();
}

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\nrole check: ${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
