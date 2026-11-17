// Deleting a saved plan, the break-it tester's cases (Phase 8a follow-up,
// 17 Nov): signed in as the invented test client on the TEST database, one
// Get unstuck plan made for the test and deleted again at the end.
//
//   node --import ./tests/scores/register.mjs tests/phase8/delete-undo.mjs [out folder]
//
// 1. A second tab never brings a deleted plan back: its Save my edit says
//    "This plan was deleted in another tab, so it wasn’t saved." and the row
//    stays gone.
// 2. Undo pressed offline waits ("Will sync") and puts the plan back once the
//    connection is back, with its own id.
// 3. A second Delete in a stale tab says "This was already deleted.", with
//    no Undo that can't work.
// 4. The deleted plan's old address says it isn't here any more, never that
//    the connection failed.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { APP, block, clientDb, onQuestion, readEnv, signIn, sleep, until } from './shared.mjs';

const out = process.argv[2] || join(process.cwd(), 'tmp-phase8-delete-undo');
mkdirSync(out, { recursive: true });
const results = [];
let failures = 0;
const pass = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `: ${detail}` : ''}`);
};

const env = readEnv();
const { db, me } = await clientDb(env);
const GOAL = 'Delete-undo test: cut hiring time to 30 days';
const id = randomUUID();
const row = async () => (await db.from('decisions').select('id, title, form_data').eq('id', id).eq('user_id', me)).data?.[0] || null;
const toastText = (page) => page.locator('.ds-toast').last().innerText().then((t) => t.replace(/\s+/g, ' ').trim()).catch(() => '');
const sawToast = (page, words, ms = 8000) => until(async () => (await toastText(page)).includes(words), ms);

async function makePlan() {
  await db.from('decisions').delete().eq('id', id).eq('user_id', me);
  const { error } = await db.from('decisions').insert({
    id, user_id: me, tool_type: 'grow', title: GOAL, status: 'completed', draft: false,
    form_data: { version: 2, goal: GOAL, constraints: 'One recruiter.', opportunities: '', options: 'Referrals', next_steps: [], cons: ['One recruiter.'], opps: [], opts: ['Referrals'], acts: [] },
  });
  if (error) throw new Error(`could not make the plan: ${error.code}`);
}

// Opens the plan from My Plans in this page: the address carries the row, as the list hands it over.
async function openFromList(page) {
  await page.goto(`${APP}/my-plans?area=personal`);
  const r = page.locator('.ui-root').getByText(GOAL).first();
  await r.waitFor({ timeout: 20000 });
  await r.click();
  return onQuestion(page, 'Here’s your plan', 15000);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-GB', timezoneId: 'Europe/London' });
await block(ctx);
const a = await ctx.newPage();
const errors = [];
a.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
try {
  await signIn(a, env);
  await makePlan();

  // ---- 1. a second tab never brings a deleted plan back
  pass('1 the plan opens from My Plans in tab A', Boolean(await openFromList(a)));
  const b = await ctx.newPage();
  b.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  pass('1 … and in tab B', Boolean(await openFromList(b)));
  await a.locator('.ds-guide-delete button, .saved-item-actions button').filter({ hasText: /^Delete$/ }).first().click();
  pass('1 tab A deletes it at once, with Deleted and Undo', await sawToast(a, 'Deleted') && Boolean(await until(async () => !(await row()), 10000)));
  await b.getByRole('button', { name: /^Edit/ }).first().click();
  await sleep(600);
  const box = b.locator('.ds-guide-body textarea, .ds-guide-body input').first();
  await box.fill(`${GOAL}, edited in tab B`);
  await sleep(450);
  await b.locator('.ds-guide-next').click();
  pass('1 tab B’s Save my edit says the plan was deleted in another tab', await sawToast(b, 'This plan was deleted in another tab, so it wasn’t saved.'), await toastText(b));
  await sleep(2500);
  pass('1 … and the plan stays deleted', !(await row()));
  await b.close();

  // ---- 2. Undo pressed offline waits, then puts it back
  await makePlan();
  await openFromList(a);
  await a.locator('.ds-guide-delete button, .saved-item-actions button').filter({ hasText: /^Delete$/ }).first().click();
  await sawToast(a, 'Deleted');
  await until(async () => !(await row()), 10000);
  await ctx.setOffline(true);
  await a.locator('.ds-toast').last().getByRole('button', { name: 'Undo' }).click();
  pass('2 Undo offline says Will sync', await sawToast(a, 'Will sync'), await toastText(a));
  await ctx.setOffline(false);
  await a.evaluate(() => window.dispatchEvent(new Event('online')));
  const back = await until(async () => row(), 30000);
  pass('2 back online, the plan is back with its own id', Boolean(back) && back.title === GOAL, JSON.stringify(back && { title: back.title }));

  // ---- 3. a second Delete in a stale tab
  await openFromList(a);
  const c = await ctx.newPage();
  await openFromList(c);
  await a.locator('.ds-guide-delete button, .saved-item-actions button').filter({ hasText: /^Delete$/ }).first().click();
  await sawToast(a, 'Deleted');
  await until(async () => !(await row()), 10000);
  await c.locator('.ds-guide-delete button, .saved-item-actions button').filter({ hasText: /^Delete$/ }).first().click();
  pass('3 a second Delete in a stale tab says it was already deleted, with no Undo', await sawToast(c, 'This was already deleted.') && (await c.locator('.ds-toast').last().getByRole('button', { name: 'Undo' }).count()) === 0, await toastText(c));
  await c.close();

  // ---- 4. the deleted plan's old address
  await a.goto(`${APP}/get-unstuck?id=${id}`);
  const said = await until(async () => (await a.locator('.ui-root').first().innerText()).includes('This plan isn’t here any more. It may have been deleted.'), 15000);
  const shown = (await a.locator('.ui-root').first().innerText()).replace(/\s+/g, ' ');
  pass('4 a deleted plan’s address says it isn’t here any more, never the connection, with no keeps-happening line', Boolean(said) && !shown.includes('Check your connection') && !shown.includes('If it keeps happening'), shown.slice(0, 300));
  pass('no page errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  pass('the run finished', false, `${e.message}`.split('\n')[0]);
} finally {
  await browser.close();
  await db.from('decisions').delete().eq('id', id).eq('user_id', me);
}
writeFileSync(join(out, 'report.txt'), `${results.join('\n')}\n`);
console.log(results.join('\n'));
console.log(`\n${results.length - failures} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
