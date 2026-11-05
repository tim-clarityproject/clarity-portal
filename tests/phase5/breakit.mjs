// Phase 5 step 6: the break-it tester's browser attacks, on the TEST
// database only (other hosts, /functions/v1/ and email calls blocked).
//   node --import ./tests/scores/register.mjs tests/phase5/breakit.mjs
// 1 half-done check-in, tab closed, reopened; back button
// 2 two tabs on one check-in, finished in one, the stale one answering after
// 3 a dashboard section collapsed offline, then back online
// 6 a broken page_preferences.patterns: the dashboard and the debrief
// 7 odd check-in URLs
// Everything it changes is put back at the end.
import { chromium } from 'playwright';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { createClient } from '@supabase/supabase-js';
import { checkinMonth } from '../../src/lib/performance/checkin.js';

const APP = 'http://localhost:5173';
const TEST_HOST = 'gqtqljngeenqzxneucoc.supabase.co';
const LOG = process.env.BREAKIT_LOG || 'tmp-phase5-breakit.txt';
writeFileSync(LOG, '');
const out = { push: (l) => appendFileSync(LOG, `${l}\n`) };
let failures = 0;
const pass = (n, ok, d = '') => { if (!ok) failures += 1; out.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${!ok && d ? `: ${String(d).slice(0, 300)}` : ''}`); };
const note = (s) => out.push(`NOTE  ${s}`);
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
async function until(fn, ms = 10000) { const end = Date.now() + ms; let v; while (Date.now() < end) { v = await fn().catch(() => null); if (v) return v; await sleep(250); } return v; }
const env = {};
for (const line of readFileSync(`${homedir()}/.clarity-test-accounts.env`, 'utf8').split('\n')) { const m = /^([A-Z_]+)=(.*)$/.exec(line.trim()); if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, ''); }
if (!env.TEST_SUPABASE_URL?.includes(TEST_HOST.split('.')[0])) throw new Error('Not the test project.');
const db = createClient(env.TEST_SUPABASE_URL, env.TEST_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: si, error: se } = await db.auth.signInWithPassword({ email: env.TEST_CLIENT_EMAIL, password: env.TEST_CLIENT_PASSWORD });
if (se) throw se;
const me = si.user.id;
const london = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const CUR = checkinMonth(london);
const CUR_PATH = `/check-in/${CUR.slice(0, 7)}`;
const { data: before } = await db.from('checkins').select('*').eq('user_id', me).eq('month', CUR);
const { data: ps } = await db.from('person_settings').select('page_preferences').eq('user_id', me).limit(1);
const prefsBefore = ps?.[0]?.page_preferences ?? {};
const rowsNow = async () => (await db.from('checkins').select('id,status,answers').eq('user_id', me).eq('month', CUR)).data || [];
await db.from('checkins').delete().eq('user_id', me).eq('month', CUR);

const browser = await chromium.launch();
const writes = [];
const errors = [];
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-GB', timezoneId: 'Europe/London', colorScheme: 'dark' });
await context.route('**/*', (route) => {
  const url = route.request().url();
  if (/resend\.com|sendgrid|mailgun|postmarkapp|smtp/i.test(url)) return route.abort();
  if (/supabase\.co/.test(url) && !url.includes(TEST_HOST)) return route.abort();
  if (/\/functions\/v1\/|\/api\//.test(url)) return route.abort();
  if (/\/rest\/v1\/checkins/.test(url) && ['POST', 'PATCH'].includes(route.request().method())) writes.push(route.request().postData() || '');
  return route.fallback();
});
const watch = (p, name) => p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
const heading = async (p) => ((await p.locator('.ds-guide-question, .ds-guide-title').count()) ? (await p.locator('.ds-guide-question, .ds-guide-title').first().textContent()).trim() : '');
const statement = async (p) => ((await p.locator('.ds-statement').count()) ? (await p.locator('.ds-statement').first().textContent()).trim() : '');
async function tap(p, index = 0) {
  const was = (await heading(p)) + (await statement(p));
  const radios = p.locator('.ds-guide-body [role=radio]');
  const n = await radios.count();
  await radios.nth(index < 0 ? n - 1 : index).click();
  return until(async () => (await heading(p)) + (await statement(p)) !== was, 4000);
}
async function next(p) { await sleep(450); await p.locator('.ds-guide-next').click(); await sleep(600); }
const body = async (p) => (await p.locator('.ui-root').first().innerText().catch(() => '')).replace(/\s+/g, ' ');

const p1 = await context.newPage(); watch(p1, 'tab 1');
await p1.goto(`${APP}/auth/login`);
await p1.fill('input[type=email]', env.TEST_CLIENT_EMAIL);
await p1.fill('input[type=password]', env.TEST_CLIENT_PASSWORD);
await p1.keyboard.press('Enter');
await p1.waitForURL(/welcome/, { timeout: 30000 });
await sleep(2000);

try {
  // ---------------------------------------------------------------- 1
  await p1.goto(`${APP}${CUR_PATH}`);
  await p1.waitForSelector('.ds-guide-next', { timeout: 20000 });
  await next(p1);
  for (let i = 0; i < 3; i += 1) await tap(p1, 0);
  const at = (await heading(p1)) + (await statement(p1));
  await sleep(2500);
  await p1.close();
  const p2 = await context.newPage(); watch(p2, 'tab 2');
  await p2.goto(`${APP}${CUR_PATH}`);
  await p2.waitForSelector('.ds-guide', { timeout: 20000 });
  await sleep(2000);
  const back = (await heading(p2)) + (await statement(p2));
  const txt = await body(p2);
  note(`reopened at "${back.slice(0, 80)}" (was "${at.slice(0, 80)}"); "Draft restored": ${/Draft restored/.test(txt)}; carry on words: ${/carry on|Carry on|pick up|Continue/.test(txt)}`);
  let rows = await rowsNow();
  pass('1 reopen: one row, still a draft, 3 answers kept', rows.length === 1 && rows[0].status === 'draft' && Object.keys(rows[0].answers).length === 3, JSON.stringify(rows.map((r) => [r.status, Object.keys(r.answers)])));
  pass('1 reopen: the place is kept (same question, or the opening screen offering to carry on)', back === at || /carry on|Carry on|Continue/i.test(txt), back);
  if (back !== at && (await p2.locator('.ds-guide-next').count())) await next(p2);
  // back button mid check-in
  const h0 = await heading(p2);
  await p2.goBack(); await sleep(1500);
  note(`back button from "${h0.slice(0, 50)}": now ${new URL(p2.url()).pathname}, heading "${(await heading(p2)).slice(0, 50)}"`);
  if (!new URL(p2.url()).pathname.startsWith('/check-in')) { await p2.goto(`${APP}${CUR_PATH}`); await p2.waitForSelector('.ds-guide', { timeout: 20000 }); await sleep(1500); if ((await p2.locator('.ds-guide-body [role=radio]').count()) === 0) await next(p2); }

  // ---------------------------------------------------------------- 2
  const p3 = await context.newPage(); watch(p3, 'tab 3');
  await p3.goto(`${APP}${CUR_PATH}`);
  await p3.waitForSelector('.ds-guide', { timeout: 20000 });
  await sleep(1500);
  if ((await p3.locator('.ds-guide-body [role=radio]').count()) === 0) await next(p3);
  const q2 = await heading(p2); const q3 = await heading(p3);
  note(`two tabs at "${q2.slice(0, 40)}" and "${q3.slice(0, 40)}"`);
  await tap(p2, 0); await sleep(1200); await tap(p3, -1); await sleep(2500);
  rows = await rowsNow();
  pass('2 two tabs: still one row', rows.length === 1, rows.length);
  note(`after both tabs answered: ${Object.keys(rows[0]?.answers || {}).length} answers in the row`);
  // Finish in tab 2: answer everything left with the first answer.
  let finished = false;
  for (let i = 0; i < 60 && !finished; i += 1) {
    if (await p2.locator('.ds-guide-body [role=radio]').count()) { await tap(p2, 0); continue; }
    const label = (await p2.locator('.ds-guide-next').count()) ? await p2.locator('.ds-guide-next').innerText() : '';
    if (/finish/i.test(label)) { await next(p2); finished = true; break; }
    if (!label) break;
    await next(p2);
  }
  const toasts = new Set();
  for (let i = 0; i < 12; i += 1) { for (const t of await p2.locator('.ds-toast-text').allInnerTexts().catch(() => [])) toasts.add(t); await sleep(250); }
  note(`tab 2 toasts after Finish: ${[...toasts].join(' | ') || 'none'}; tab 2 at ${new URL(p2.url()).pathname}`);
  await p2.screenshot({ path: `${LOG}.tab2.png` }).catch(() => {});
  await p3.screenshot({ path: `${LOG}.tab3.png` }).catch(() => {});
  rows = await rowsNow();
  note(`row after Finish: ${rows.map((r) => `${r.status} with ${Object.keys(r.answers).length} answers`).join(', ')}`);
  // With another tab writing, the first Finish can be refused as changed in
  // another window (the page reloads the latest): a second tap finishes it.
  if (rows[0]?.status !== 'finished' && (await p2.locator('.ds-guide-next').count())) {
    note('the first Finish was refused (another tab had written): tapping Finish again');
    await next(p2); await sleep(3000);
    rows = await rowsNow();
  }
  pass('2 finished in tab 2: one row, finished', finished && rows.length === 1 && rows[0].status === 'finished', JSON.stringify(rows.map((r) => r.status)));
  const answersAtFinish = JSON.stringify(rows[0]?.answers || {});
  // The stale tab answers its next question after the finish.
  const staleRadios = await p3.locator('.ds-guide-body [role=radio]').count();
  if (staleRadios) { await tap(p3, -1); await sleep(3000); }
  rows = await rowsNow();
  pass('2 stale tab after finish: still one row and still finished', rows.length === 1 && rows[0].status === 'finished', JSON.stringify(rows.map((r) => r.status)));
  note(`stale tab answering after finish changed the finished answers: ${JSON.stringify(rows[0]?.answers || {}) !== answersAtFinish}; stale tab shows: "${(await body(p3)).slice(0, 160)}"`);
  await p3.reload(); await sleep(2500);
  note(`stale tab reloaded: ${new URL(p3.url()).pathname} "${(await body(p3)).slice(0, 120)}"`);
  await p3.close();

  // ---------------------------------------------------------------- 7
  for (const u of ['/check-in/2099-13', '/check-in/garbage', '/check-in/2099-12', '/check-in/2025-01/answers', '/check-in/%27%3Bdrop', '/check-in/2026-10/../../welcome']) {
    const n = errors.length;
    await p2.goto(`${APP}${u}`); await sleep(2500);
    note(`${u} -> ${new URL(p2.url()).pathname}: "${(await body(p2)).replace(/^.*?(Home|Personal)\s/, '').slice(0, 110)}"`);
    pass(`7 ${u}: no page error`, errors.length === n, errors.slice(n).join(' | '));
  }

  // ---------------------------------------------------------------- 3
  await p2.goto(`${APP}/dashboard`);
  await p2.waitForSelector('.dash-sec-h .dash-colb', { timeout: 20000 }); await sleep(2000);
  const head = p2.locator('.dash-sec-h .dash-colb').first();
  const name = (await head.innerText()).trim();
  const wasOpen = (await head.getAttribute('aria-expanded')) === 'true';
  await context.setOffline(true);
  await head.evaluate((el) => el.click()); await sleep(1200);
  const offTxt = await body(p2);
  note(`dashboard "${name}" collapsed offline (was open ${wasOpen}): "Will sync" shown: ${/Will sync/.test(offTxt)}`);
  pass('3 collapse offline: closes at once', (await head.getAttribute('aria-expanded')) === String(!wasOpen));
  await context.setOffline(false);
  const synced = await until(async () => {
    const { data } = await db.from('person_settings').select('page_preferences').eq('user_id', me).limit(1);
    return data?.[0]?.page_preferences?.dashboard?.closed ? data[0].page_preferences.dashboard.closed : null;
  }, 40000);
  pass('3 back online: the collapse reaches the account', synced && Object.values(synced).some(Boolean), JSON.stringify(synced));
  note(`"Saved" after sync: ${/Saved/.test(await body(p2))}`);

  // ---------------------------------------------------------------- 6
  for (const garbage of ['not an object', [1, 2, 3], { cards: 'x', seen: 5, introduced: { a: null }, steady: [null] }, { introduced: 'yes', state: 42 }, null]) {
    await db.from('person_settings').update({ page_preferences: { ...prefsBefore, patterns: garbage } }).eq('user_id', me);
    for (const path of ['/dashboard', '/performance-sprint/debrief', '/welcome']) {
      const n = errors.length;
      await p2.goto(`${APP}${path}`); await sleep(3500);
      const t = await body(p2);
      const broken = /Something went wrong|went wrong|NaN|undefined|\[object Object\]/.test(t);
      pass(`6 patterns=${JSON.stringify(garbage).slice(0, 30)} ${path}: no error, no broken words`, errors.length === n && !broken, `${errors.slice(n).join(' | ')} ${broken ? t.slice(0, 200) : ''}`);
    }
  }
} catch (e) {
  pass('ran to the end', false, e.stack);
} finally {
  await context.close().catch(() => {});
  await browser.close();
  await db.from('checkins').delete().eq('user_id', me).eq('month', CUR);
  if (before?.length) await db.from('checkins').insert(before.map(({ hardware_score: _h, software_score: _s, area_scores: _a, methods_version: _m, ...r }) => r));
  await db.from('person_settings').update({ page_preferences: prefsBefore }).eq('user_id', me);
  const finishes = writes.filter((w) => /"status":"finished"/.test(w)).length;
  pass('2 Finish sent at most twice (once, or once more after a refusal)', finishes >= 1 && finishes <= 2, finishes);
  note(`Finish writes: ${finishes}`);
  note(`checkin writes seen: ${writes.length}; page errors: ${errors.length}${errors.length ? ` (${errors.join(' | ').slice(0, 400)})` : ''}`);
  pass('no page errors anywhere', errors.length === 0, errors.join(' | '));
  out.push(failures ? `${failures} failed` : 'all passed');
  console.log(readFileSync(LOG, 'utf8'));
  process.exitCode = failures ? 1 : 0;
}
