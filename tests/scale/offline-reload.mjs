// The coach portal after an offline reload, step by step (run 6 measured
// about 7 seconds): what the page logs, which requests it tries and fails,
// and when the shell, the Loading screen and the data show. Local only, muted.
//
//   node --import ./tests/scores/register.mjs tests/scale/offline-reload.mjs \
//     --app http://127.0.0.1:4319 --api http://localhost:54400 [--who scale-coach-02@example.com] [--size laptop|phone]
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const APP = opt('app', 'http://127.0.0.1:4319');
const API = opt('api', 'http://localhost:54400');
const WHO = opt('who', 'scale-coach-02@example.com');
const PHONE = opt('size', 'laptop') === 'phone';

const session = await (await fetch(`${API}/__session?email=${encodeURIComponent(WHO)}`)).json();
const browser = await chromium.launch({ args: ['--mute-audio'] });
const context = await browser.newContext(PHONE ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : { viewport: { width: 1440, height: 900 } });
await context.route('**/*', (r) => { const u = new URL(r.request().url()); return ['127.0.0.1', 'localhost'].includes(u.hostname) ? r.continue() : r.abort('blockedbyclient'); });
await context.addInitScript((v) => { try { if (!localStorage.getItem('clarity-portal-auth')) localStorage.setItem('clarity-portal-auth', v); } catch { /* none */ } }, JSON.stringify(session));
const page = await context.newPage();
if (PHONE) { const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); }
await page.goto(`${APP}/coach`);
await page.waitForSelector('.cc-main', { timeout: 60000 });
await page.waitForTimeout(12000); // the store's load, warmDevice and the service worker settle
const kept = await page.evaluate(() => Object.keys(localStorage).map((k) => [k.replace(/[0-9a-f-]{36}/g, '<id>'), (localStorage.getItem(k) || '').length]).sort((a, b) => b[1] - a[1]).slice(0, 6));
const sw = await page.evaluate(() => Boolean(navigator.serviceWorker?.controller));

await context.setOffline(true);
const t0 = Date.now();
const log = [];
const at = () => Date.now() - t0;
page.on('console', (m) => { const t = m.text(); if (/AuthContext|ProtectedLayout|offline|coach|Supabase/i.test(t)) log.push(`${at()} console ${t.slice(0, 140)}`); });
page.on('requestfailed', (r) => log.push(`${at()} failed ${r.method()} ${r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 120)} (${r.failure()?.errorText})`));
page.on('request', (r) => { if (r.url().startsWith(API)) log.push(`${at()} asks ${r.method()} ${r.url().replace(API, '').slice(0, 120)}`); });
await page.reload({ waitUntil: 'commit' }).catch((e) => log.push(`${at()} reload ${e.message.slice(0, 80)}`));
let last = '';
for (let i = 0; i < 200; i += 1) {
  const s = await page.evaluate(() => ({
    loading: Boolean(document.querySelector('[role="status"][aria-label="Loading"]')),
    shell: Boolean(document.querySelector('.cc-main')),
    path: location.pathname,
    words: (document.querySelector('.cc-main')?.innerText || document.body.innerText || '').slice(0, 70).replace(/\s+/g, ' '),
  })).catch(() => null);
  const line = s ? `loading=${s.loading} shell=${s.shell} ${s.path} "${s.words}"` : 'no page';
  if (line !== last) { log.push(`${at()} screen ${line}`); last = line; }
  if (s?.shell && !s.loading && at() > 9000) break;
  await page.waitForTimeout(50);
}
console.log(`kept on the device before going offline: ${JSON.stringify(kept)}; service worker in control: ${sw}`);
for (const l of log) console.log(l);
await browser.close();
