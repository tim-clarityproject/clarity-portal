// Traces one coach page's first visit on the slowed phone, step by step: every file and database read with when it
// started and ended (from the navigation), when the frame painted and when the page's own first screen was drawn
// (`data-first-screen="ready"` on .cc-main, coach first screen run). Local stand-in only, muted, nothing leaves this machine.
//
//   node --import ./tests/scores/register.mjs tests/scale/trace-first.mjs --role owner --page /coach [--size phone] [--warm]
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const APP = opt('app', 'http://127.0.0.1:4319');
const API = opt('api', 'http://localhost:54400');
const ROLE = opt('role', 'owner');
const SIZE = opt('size', 'phone');
const md5uuid = (s) => { const h = createHash('md5').update(s).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`; };
const PEOPLE = {
  associate: { email: 'scale-coach-02@example.com', client: md5uuid('cprof301') },
  owner: { email: 'scale-coach-01@example.com', client: md5uuid('cprof1') },
};
const who = PEOPLE[ROLE];
const PATH = opt('page', '/coach').replace(':client', who.client);
const FAST_4G = { offline: false, latency: 60, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 };

const session = await (await fetch(`${API}/__session?email=${encodeURIComponent(who.email)}`)).json();
const browser = await chromium.launch({ args: ['--mute-audio'] });
const context = await browser.newContext(SIZE === 'phone'
  ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
  : { viewport: { width: 1440, height: 900 } });
await context.route('**/*', (route) => {
  const u = new URL(route.request().url());
  if (['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) || u.protocol === 'data:' || u.protocol === 'blob:') return route.continue();
  return route.abort('blockedbyclient');
});
await context.addInitScript(({ key, value }) => { try { if (!localStorage.getItem(key)) localStorage.setItem(key, value); } catch { /* none */ } },
  { key: 'clarity-portal-auth', value: JSON.stringify(session) });
await context.addInitScript(() => {
  const m = { fcp: null, ready: null, frame: null };
  window.__trace = m;
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') m.fcp = e.startTime; }).observe({ type: 'paint', buffered: true }); } catch { /* none */ }
  const look = () => {
    const main = document.querySelector('.cc-main');
    if (main && m.frame == null && document.querySelector('.cc-header')) m.frame = performance.now();
    // The page drawn with its data: no turning crosshair over the page, the frame not held, a page inside, nothing on it
    // still waiting for the first screen. The same test for a build from before this run (it has no data-first-screen).
    if (main && m.ready == null && !main.classList.contains('cc-main--first') && !main.closest('.cc-hold') && main.querySelector('.cc-page') && !main.querySelector('[data-first-wait]')) m.ready = performance.now();
  };
  const start = () => new MutationObserver(look).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-first-screen', 'class', 'inert'] });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
});
const page = await context.newPage();
// Requests to the database in flight, so the return visit starts once the first has gone quiet (as timing.mjs waits).
const inflight = { n: 0, last: Date.now() };
page.on('request', (r) => { if (r.url().startsWith(API)) inflight.n += 1; });
const ended = (r) => { if (r.url().startsWith(API)) { inflight.n = Math.max(0, inflight.n - 1); inflight.last = Date.now(); } };
page.on('requestfinished', ended);
page.on('requestfailed', ended);
async function quiet(limit = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < limit) {
    await page.waitForTimeout(250);
    if (inflight.n === 0 && Date.now() - inflight.last > 2500) return;
  }
}
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(`console: ${m.text().slice(0, 300)}`); });
if (SIZE === 'phone') {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', FAST_4G);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
}
const PROFILE = args.includes('--profile');
let cdpProfiler = null;
async function visit() {
  if (PROFILE && !cdpProfiler) {
    cdpProfiler = await context.newCDPSession(page);
    await cdpProfiler.send('Profiler.enable');
    await cdpProfiler.send('Profiler.setSamplingInterval', { interval: 500 });
    await cdpProfiler.send('Profiler.start');
  }
  await page.goto(`${APP}${PATH}`, { waitUntil: 'commit' });
  for (let i = 0; i < 120; i += 1) {
    await page.waitForTimeout(250);
    const r = await page.evaluate(() => window.__trace?.ready).catch(() => null);
    if (r != null) break;
  }
  await page.waitForTimeout(1500);
  return page.evaluate(() => {
    const res = performance.getEntriesByType('resource').map((r) => ({ s: Math.round(r.startTime), e: Math.round(r.responseEnd), kb: Math.round((r.transferSize || 0) / 1024), n: r.name.replace(location.origin, '').replace(/^https?:\/\/[^/]+/, '').replace(/select=[^&]*&?/, '').slice(0, 100) }));
    const marks = performance.getEntriesByType('mark').filter((m) => m.name.startsWith('TMP-')).map((m) => `${m.name.slice(4)}@${Math.round(m.startTime)}`);
    return { trace: window.__trace, res, marks };
  });
}
const TIMELINE = opt('timeline'); // "from,to" in ms from the navigation: what the main thread did between them
if (TIMELINE) await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink.user_timing', 'v8.execute'] });
const cold = await visit();
if (TIMELINE) {
  const buf = await browser.stopTracing();
  const ev = JSON.parse(buf.toString()).traceEvents;
  const nav = ev.find((e) => e.name === 'navigationStart' && e.args?.data?.isLoadingMainFrame) || ev.find((e) => e.name === 'navigationStart');
  const [a, b] = TIMELINE.split(',').map(Number);
  const t0 = nav.ts;
  const inWin = (e) => e.ts >= t0 + a * 1000 && e.ts <= t0 + b * 1000;
  const main = ev.find((e) => e.name === 'TracingStartedInBrowser') ? null : null; void main;
  const tasks = ev.filter((e) => e.ph === 'X' && e.name === 'RunTask' && inWin(e));
  const threads = new Map();
  for (const t of tasks) threads.set(`${t.pid}:${t.tid}`, (threads.get(`${t.pid}:${t.tid}`) || 0) + t.dur);
  const [busiest] = [...threads].sort((x, y) => y[1] - x[1])[0] || [];
  const [pid, tid] = (busiest || '0:0').split(':').map(Number);
  const on = ev.filter((e) => e.pid === pid && e.tid === tid && e.ph === 'X' && inWin(e));
  const by = new Map();
  for (const e of on) {
    if (e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask') continue;
    const d = e.args?.data || {};
    const k = `${e.name} ${d.functionName || ''} ${String(d.url || d.frame || '').replace(/^.*\/assets\//, '').slice(0, 40)}`;
    by.set(k, (by.get(k) || 0) + e.dur / 1000);
  }
  console.log(`main thread ${a}-${b} ms: tasks ${Math.round(tasks.filter((t) => t.pid === pid && t.tid === tid).reduce((n, t) => n + t.dur, 0) / 1000)} ms`);
  for (const [k, ms] of [...by].sort((x, y) => y[1] - x[1]).slice(0, 25)) console.log(`  ${String(Math.round(ms)).padStart(5)} ms  ${k}`);
}
if (PROFILE) {
  // Self time by function and file over the whole visit (the main thread's work, at the slowed CPU).
  const { profile } = await cdpProfiler.send('Profiler.stop');
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  profile.samples.forEach((id, i) => {
    const n = byId.get(id);
    const f = n.callFrame;
    const k = `${f.functionName || '(anon)'} ${String(f.url).replace(/^.*\/assets\//, '')}:${f.lineNumber}`;
    self.set(k, (self.get(k) || 0) + (profile.timeDeltas[i + 1] || 0) / 1000);
  });
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  console.log(`profile: ${Math.round(total)} ms sampled`);
  for (const [k, ms] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`  ${String(Math.round(ms)).padStart(5)} ms  ${k.slice(0, 120)}`);
}
if (args.includes('--warm')) await quiet();
if (args.includes('--profile-warm')) {
  cdpProfiler = await context.newCDPSession(page);
  await cdpProfiler.send('Profiler.enable');
  await cdpProfiler.send('Profiler.setSamplingInterval', { interval: 500 });
  await cdpProfiler.send('Profiler.start');
}
const out = args.includes('--warm') ? await visit() : cold;
if (args.includes('--profile-warm')) {
  const { profile } = await cdpProfiler.send('Profiler.stop');
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  profile.samples.forEach((id, i) => {
    const f = byId.get(id).callFrame;
    const k = `${f.functionName || '(anon)'} ${String(f.url).replace(/^.*\/assets\//, '')}:${f.lineNumber}`;
    self.set(k, (self.get(k) || 0) + (profile.timeDeltas[i + 1] || 0) / 1000);
  });
  for (const [k, v] of [...self].sort((x, y) => y[1] - x[1]).slice(0, 18)) console.log(`  ${String(Math.round(v)).padStart(5)} ms  ${k.slice(0, 110)}`);
}
if (out !== cold) console.log(`first visit: fcp ${Math.round(cold.trace.fcp)}  frame ${Math.round(cold.trace.frame)}  first screen ${cold.trace.ready == null ? 'never marked' : Math.round(cold.trace.ready)}`);
if (pageErrors.length) console.log(`page errors: ${[...new Set(pageErrors)].slice(0, 5).join(' | ')}`);
if (out.marks?.length) console.log(`marks: ${[...new Set(out.marks)].join(' ')}`);
console.log(`fcp ${Math.round(out.trace.fcp)}  frame ${Math.round(out.trace.frame)}  first screen ${out.trace.ready == null ? 'never marked' : Math.round(out.trace.ready)}`);
if (!args.includes('--quiet')) for (const r of out.res.sort((a, b) => a.s - b.s)) console.log(`${String(r.s).padStart(5)} ${String(r.e).padStart(5)} ${String(r.kb).padStart(5)}k ${r.n}`);
await browser.close();
