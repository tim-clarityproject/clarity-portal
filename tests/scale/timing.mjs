// Times every main page at scale, against the local stand-in (stack.mjs)
// and a production build served like Vercel (serve.mjs). Muted, and every
// request that isn't to this machine is refused, so nothing hosted is
// ever reached.
//
//   node --import ./tests/scores/register.mjs tests/scale/timing.mjs \
//     --app http://127.0.0.1:4319 --api http://localhost:54400 --out <results.jsonl> \
//     [--roles client,associate,owner] [--sizes laptop,phone] [--pages home,coach-today] [--offline]
//
// For each role, size and page: a cold visit (a new browser context, signed
// in, nothing on the device) and a warm one (the same context, second
// visit). Each gives:
//   first   the first screen: largest contentful paint (first contentful paint if none)
//   data    when the data was on screen: the last change to the page before it went
//           quiet (no request to the database for 1.5 s and no change for 1.5 s)
//   taps    for a few main controls, the time from the tap to the next paint
//           (Event Timing, as INP measures it; under 16 ms is reported as 16)
//   api     requests to the database, rows and bytes (as sent, and compressed),
//           the slowest, and any that loads a whole list (500+ rows or 200 kB+)
//   static  bytes of the app itself over the wire
// The phone is 390 by 844, 4G as Chrome's "Fast 4G" preset (9 Mbps down,
// 1.5 Mbps up, 60 ms round trip) and the CPU slowed 4 times; the laptop is
// 1440 by 900 with no slowing.
import { chromium } from 'playwright';
import { appendFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const APP = opt('app', 'http://127.0.0.1:4319');
const API = opt('api', 'http://localhost:54400');
const OUT = opt('out');
const ROLES = opt('roles', 'client,associate,owner').split(',');
const SIZES = opt('sizes', 'laptop,phone').split(',');
const ONLY = opt('pages') ? new Set(opt('pages').split(',')) : null;
const OFFLINE = args.includes('--offline');
const md5uuid = async (s) => { const { createHash } = await import('node:crypto'); const h = createHash('md5').update(s).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`; };

export const PEOPLE = {
  client: { email: 'scale-client-0001@example.com' },
  associate: { email: 'scale-coach-02@example.com', client: await md5uuid('cprof301') },
  owner: { email: 'scale-coach-01@example.com', client: await md5uuid('cprof1') },
};

// What a page's taps press: role and name, as a person would find them.
const tapFolds = { folds: 3 };
export const PAGES = {
  client: [
    { key: 'home', path: '/welcome', taps: tapFolds },
    { key: 'daily-plan', path: '/daily-plan', taps: tapFolds },
    { key: 'daily-review', path: '/daily-review', taps: tapFolds },
    { key: 'sprint', path: '/performance-sprint', taps: tapFolds },
    { key: 'dashboard', path: '/dashboard', taps: tapFolds },
    { key: 'debrief', path: '/performance-sprint/debrief', taps: tapFolds },
    { key: 'settings', path: '/my-account', taps: tapFolds },
  ],
  coach: [
    { key: 'coach-today', path: '/coach', taps: { buttons: ['Open the menu', 'Notifications'] } },
    { key: 'coach-todos', path: '/coach/todos', taps: tapFolds },
    { key: 'coach-cal-week', path: '/coach/calendar?view=week', taps: { buttons: ['Month', 'Week'] } },
    { key: 'coach-cal-month', path: '/coach/calendar?view=month', taps: { buttons: ['Week', 'Month'] } },
    { key: 'coach-clients-list', path: '/coach/clients', taps: { buttons: ['Board', 'Table', 'List'] } },
    { key: 'coach-client-year', path: '/coach/clients/:client', taps: tapFolds },
    { key: 'coach-leads', path: '/coach/leads', owner: true, taps: tapFolds },
    { key: 'coach-network-table', path: '/coach/network?tab=table', owner: true, taps: tapFolds },
    { key: 'coach-network-map', path: '/coach/network?tab=map', owner: true, taps: tapFolds },
    { key: 'coach-search', path: '/coach', search: true },
  ],
};

const SIZE = {
  laptop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36' },
};
const FAST_4G = { offline: false, latency: 60, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 };

// In every page: what was painted, when the page last changed, and the
// taps' durations from Event Timing.
const OBSERVE = () => {
  const m = { lcp: null, fcp: null, lastChange: 0, events: [] };
  window.__scale = m;
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) m.lcp = e.renderTime || e.loadTime || e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch { /* none */ }
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') m.fcp = e.startTime; }).observe({ type: 'paint', buffered: true }); } catch { /* none */ }
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) m.events.push({ name: e.name, start: e.startTime, duration: e.duration, id: e.interactionId }); }).observe({ type: 'event', durationThreshold: 16, buffered: true }); } catch { /* none */ }
  const start = () => {
    // The Breathe pill's orb moves all the time: its changes are not the page's data.
    const moving = (n) => { const el = n.nodeType === 1 ? n : n.parentElement; return Boolean(el?.closest?.('[class*="borb"]')); };
    new MutationObserver((list) => { if (list.some((x) => !moving(x.target))) m.lastChange = performance.now(); }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'hidden', 'aria-busy', 'style'] });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
};

async function sessionFor(email) {
  const r = await fetch(`${API}/__session?email=${encodeURIComponent(email)}`);
  if (!r.ok) throw new Error(`no stand-in session for ${email}`);
  return r.json();
}
const apiSeq = async () => (await (await fetch(`${API}/__seq`)).json()).seq;
const apiSince = async (n) => (await fetch(`${API}/__stats?since=${n}`)).json();

async function newContext(browser, size, session) {
  const context = await browser.newContext({ ...SIZE[size], serviceWorkers: 'allow' });
  // Nothing leaves this machine.
  await context.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) || u.protocol === 'data:' || u.protocol === 'blob:') return route.continue();
    return route.abort('blockedbyclient');
  });
  await context.addInitScript(({ key, value }) => {
    try { if (!localStorage.getItem(key)) localStorage.setItem(key, value); } catch { /* none */ }
  }, { key: 'clarity-portal-auth', value: JSON.stringify(session) });
  await context.addInitScript(OBSERVE);
  return context;
}

async function throttle(page, size) {
  if (size !== 'phone') return null;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', FAST_4G);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  return cdp;
}

// Waits until the page is quiet: no database request in flight or ended in the last 1.5 s, and no change for 1.5 s.
async function untilQuiet(page, inflight, limitMs = 90000) {
  const t0 = Date.now();
  for (;;) {
    await page.waitForTimeout(250);
    const now = Date.now();
    const s = await page.evaluate(() => ({ last: window.__scale?.lastChange || 0, now: performance.now() })).catch(() => null);
    if (!s) continue;
    if (inflight.count === 0 && now - inflight.lastEnd > 1500 && s.now - s.last > 1500) return { timedOut: false };
    if (now - t0 > limitMs) return { timedOut: true };
  }
}

function track(page) {
  const inflight = { count: 0, lastEnd: Date.now() };
  const isApi = (r) => r.url().startsWith(API);
  page.on('request', (r) => { if (isApi(r)) inflight.count += 1; });
  const done = (r) => { if (isApi(r)) { inflight.count = Math.max(0, inflight.count - 1); inflight.lastEnd = Date.now(); } };
  page.on('requestfinished', done);
  page.on('requestfailed', done);
  return inflight;
}

async function measureVisit(page, url, inflight) {
  const seq = await apiSeq();
  const wall = Date.now();
  await page.goto(url, { waitUntil: 'commit', timeout: 60000 });
  const quiet = await untilQuiet(page, inflight);
  const m = await page.evaluate(() => {
    const s = window.__scale || {};
    const res = performance.getEntriesByType('resource');
    const nav = performance.getEntriesByType('navigation')[0];
    const local = res.filter((r) => r.name.startsWith(location.origin));
    return {
      path: location.pathname + location.search,
      lcp: s.lcp, fcp: s.fcp, lastChange: s.lastChange,
      staticWire: (nav?.transferSize || 0) + local.reduce((a, r) => a + (r.transferSize || 0), 0),
      staticCount: local.length + 1,
      staticFromCache: local.filter((r) => r.transferSize === 0).length,
      text: (document.querySelector('main, #root')?.innerText || '').slice(0, 160).replace(/\s+/g, ' '),
      // What the device kept (localStorage): its size, and the biggest copies.
      stored: (() => {
        try {
          const keys = Object.keys(localStorage).map((k) => [k.replace(/[0-9a-f-]{36}/g, '<id>'), (localStorage.getItem(k) || '').length]);
          return { chars: keys.reduce((a, [, n]) => a + n, 0), biggest: keys.sort((a, b) => b[1] - a[1]).slice(0, 4) };
        } catch { return null; }
      })(),
    };
  });
  const api = (await apiSince(seq)).filter((r) => r.path.startsWith('/rest/') || r.path.startsWith('/auth/'));
  return { ...m, wallMs: Date.now() - wall, timedOut: quiet.timedOut, api };
}

function summariseApi(api) {
  const rest = api.filter((r) => r.path.startsWith('/rest/'));
  const t0 = rest.length ? Math.min(...rest.map((r) => r.at)) : 0;
  return {
    requests: rest.length,
    auth: api.length - rest.length,
    rows: rest.reduce((a, r) => a + (r.rows || 0), 0),
    bytes: rest.reduce((a, r) => a + (r.bytes || 0), 0),
    wire: rest.reduce((a, r) => a + (r.wire || r.bytes || 0), 0),
    slowest: rest.slice().sort((a, b) => b.ms - a.ms).slice(0, 3).map((r) => ({ path: r.path.slice(0, 160), ms: r.ms, rows: r.rows })),
    whole: rest.filter((r) => r.rows >= 500 || r.bytes >= 200000).map((r) => ({ path: r.path.slice(0, 160), rows: r.rows, bytes: r.bytes })),
    errors: rest.filter((r) => r.status >= 400).map((r) => ({ path: r.path.slice(0, 160), status: r.status })),
    list: rest.map((r) => ({ t: r.at - t0, ms: r.ms, m: r.method, p: r.path.slice(0, 200), rows: r.rows, bytes: r.bytes, s: r.status })),
  };
}

async function tapsOn(page, spec) {
  const out = [];
  const before = await page.evaluate(() => (window.__scale?.events || []).length);
  const press = async (loc, label) => {
    const n0 = await page.evaluate(() => (window.__scale?.events || []).length);
    try { await loc.click({ timeout: 3000 }); } catch { out.push({ label, missed: true }); return false; }
    await page.waitForTimeout(900);
    const evs = await page.evaluate((n) => (window.__scale?.events || []).slice(n), n0);
    const worst = evs.filter((e) => ['pointerdown', 'pointerup', 'click', 'mousedown', 'mouseup', 'keydown', 'keyup'].includes(e.name)).reduce((a, e) => Math.max(a, e.duration), 0);
    out.push({ label, ms: worst || 16 });
    return true;
  };
  if (spec?.buttons) {
    for (const name of spec.buttons) {
      const loc = page.getByRole('button', { name, exact: true }).first();
      if (!(await loc.isVisible().catch(() => false))) { out.push({ label: name, missed: true }); continue; }
      await press(loc, name);
      // A panel or menu that opened is closed again before the next tap (not timed).
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(300);
    }
  }
  if (spec?.folds) {
    // Buttons that open something in place (folds, menus, drop-downs), page first; the header's last.
    const folds = page.locator('#root [aria-expanded="false"]:is(button, [role="button"]):visible');
    const n = Math.min(spec.folds, await folds.count());
    for (let i = 0; i < n; i += 1) {
      const loc = folds.nth(n - 1 - i);
      if (!(await loc.isVisible().catch(() => false))) break;
      const label = ((await loc.getAttribute('aria-label')) || (await loc.innerText().catch(() => '')) || 'fold').slice(0, 40).replace(/\s+/g, ' ');
      const path = await page.evaluate(() => location.pathname);
      await press(loc, label);
      if (await page.evaluate(() => location.pathname) !== path) { out.push({ label: 'left the page', missed: true }); break; }
      await page.keyboard.press('Escape').catch(() => {});
    }
    // A guided tool has no folds: its answers are the main controls.
    if (n === 0) {
      const choices = page.locator(':is(button[aria-pressed], [role="radio"], [role="checkbox"], [role="switch"]):visible');
      const m = Math.min(2, await choices.count());
      for (let i = 0; i < m; i += 1) {
        const loc = choices.nth(i);
        const label = ((await loc.getAttribute('aria-label')) || (await loc.innerText().catch(() => '')) || 'answer').slice(0, 40).replace(/\s+/g, ' ');
        await press(loc, label);
      }
    }
  }
  void before;
  return out;
}

async function searchTap(page) {
  const out = [];
  const box = page.getByRole('button', { name: 'Search, or do anything' });
  const n0 = await page.evaluate(() => (window.__scale?.events || []).length);
  await box.click({ timeout: 5000 });
  await page.waitForTimeout(600);
  const input = page.getByRole('combobox', { name: 'Search or type an action' });
  const seq = await apiSeq();
  const t = Date.now();
  await input.pressSequentially('Mi', { delay: 120 });
  await page.waitForTimeout(1500);
  const evs = await page.evaluate((n) => (window.__scale?.events || []).slice(n), n0);
  const by = (names) => evs.filter((e) => names.includes(e.name)).reduce((a, e) => Math.max(a, e.duration), 0) || 16;
  out.push({ label: 'open search', ms: by(['click', 'pointerdown', 'pointerup']) });
  out.push({ label: 'type in search', ms: by(['keydown', 'keyup', 'keypress', 'input', 'beforeinput']) });
  const api = (await apiSince(seq)).filter((r) => r.path.startsWith('/rest/'));
  const results = await page.locator('#cc-jump-list [role="option"], #cc-jump-list button').count().catch(() => 0);
  return { taps: out, searchApi: api.map((r) => ({ p: r.path.slice(0, 160), ms: r.ms, rows: r.rows })), results, searchWallMs: Date.now() - t };
}

async function runPage(browser, role, size, page) {
  const who = PEOPLE[role];
  const url = `${APP}${page.path.replace(':client', who.client || '')}`;
  const session = await sessionFor(who.email);
  const context = await newContext(browser, size, session);
  const tab = await context.newPage();
  const errors = [];
  tab.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
  const inflight = track(tab);
  const cdp = await throttle(tab, size);
  const row = { role, size, page: page.key, url: page.path };
  try {
    const cold = await measureVisit(tab, url, inflight);
    const warm = await measureVisit(tab, url, inflight);
    let taps = [];
    let search = null;
    if (page.search) { search = await searchTap(tab); taps = search.taps; } else taps = await tapsOn(tab, page.taps);
    Object.assign(row, {
      cold: { first: Math.round(cold.lcp ?? cold.fcp ?? -1), fcp: Math.round(cold.fcp ?? -1), data: Math.round(Math.max(cold.lastChange, cold.lcp ?? 0)), stored: cold.stored, wall: cold.wallMs, timedOut: cold.timedOut, staticWire: cold.staticWire, staticCount: cold.staticCount, landed: cold.path, text: cold.text, api: summariseApi(cold.api) },
      warm: { first: Math.round(warm.lcp ?? warm.fcp ?? -1), fcp: Math.round(warm.fcp ?? -1), data: Math.round(Math.max(warm.lastChange, warm.lcp ?? 0)), stored: warm.stored, wall: warm.wallMs, timedOut: warm.timedOut, staticWire: warm.staticWire, staticFromCache: warm.staticFromCache, landed: warm.path, api: summariseApi(warm.api) },
      taps,
      search: search && { api: search.searchApi, results: search.results, wall: search.searchWallMs },
      errors,
    });
  } catch (e) {
    row.failed = String(e.message).slice(0, 300);
  }
  // The coach portal after an offline reload (run 6 measured about 7 s).
  if (OFFLINE && page.key === 'coach-today') {
    try {
      await context.setOffline(true);
      // The phone's own 4G emulation would otherwise keep the page online.
      if (cdp) await cdp.send('Network.emulateNetworkConditions', { ...FAST_4G, offline: true });
      const t = Date.now();
      await tab.reload({ waitUntil: 'commit', timeout: 60000 }).catch(() => {});
      const marks = [];
      for (let i = 0; i < 120; i += 1) {
        await tab.waitForTimeout(100);
        const s = await tab.evaluate(() => ({ path: location.pathname, main: Boolean(document.querySelector('.cc-main')), loading: Boolean(document.querySelector('[role="status"][aria-label="Loading"]')), text: (document.body.innerText || '').slice(0, 80) })).catch(() => null);
        if (s) marks.push({ t: Date.now() - t, ...s });
        if (s && s.main && !s.loading) break;
      }
      const m = await tab.evaluate(() => ({ lcp: window.__scale?.lcp, fcp: window.__scale?.fcp, lastChange: window.__scale?.lastChange })).catch(() => ({}));
      row.offline = { shellAt: marks.find((x) => x.main && !x.loading)?.t ?? null, fcp: m.fcp, lcp: m.lcp, marks: marks.filter((x, i) => i === 0 || x.path !== marks[i - 1].path || x.main !== marks[i - 1].main || x.loading !== marks[i - 1].loading) };
      await context.setOffline(false);
      if (cdp) await cdp.send('Network.emulateNetworkConditions', FAST_4G);
    } catch (e) { row.offline = { failed: String(e.message).slice(0, 200) }; }
  }
  await context.close();
  return row;
}

const browser = await chromium.launch({ args: ['--mute-audio'] });
for (const role of ROLES) {
  const pages = role === 'client' ? PAGES.client : PAGES.coach.filter((p) => !p.owner || role === 'owner');
  for (const size of SIZES) {
    for (const p of pages) {
      if (ONLY && !ONLY.has(p.key)) continue;
      const row = await runPage(browser, role, size, p);
      const c = row.cold || {}; const w = row.warm || {};
      console.log(`${role.padEnd(9)} ${size.padEnd(6)} ${p.key.padEnd(20)} cold ${c.first}/${c.data} ms warm ${w.first}/${w.data} ms  api ${c.api?.requests ?? '-'} req ${c.api?.rows ?? '-'} rows ${Math.round((c.api?.bytes || 0) / 1024)} kB  taps ${(row.taps || []).map((t) => (t.missed ? 'x' : t.ms)).join(',')}${row.failed ? `  FAILED ${row.failed}` : ''}${c.timedOut ? ' (never quiet)' : ''}${row.errors?.length ? ` errors ${row.errors.length}` : ''}`);
      if (OUT) appendFileSync(OUT, `${JSON.stringify(row)}\n`);
    }
  }
}
await browser.close();
