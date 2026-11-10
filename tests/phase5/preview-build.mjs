// A preview address always shows the newest build (Tim, 10 Nov: the branch
// address showed an older build than the newest deployment).
//
// Why it did: the service worker keeps the app on the device and, on the
// live site, a new version waits until the next full open. A branch
// address never changes, so it opened its saved copy, the build before the
// newest push; each deployment's own address is new, with nothing saved.
//
// This builds two PREVIEW builds (VERCEL_ENV=preview, as Vercel sets it for
// a branch) and one live-style build, serves them like Vercel
// (tests/phase4/serve-build.mjs) and checks, in Chromium and WebKit:
//   1. a preview with build c saved on the device: once build d is
//      deployed, the very next open shows d (no second open needed);
//   2. with no connection the preview still opens, from its saved copy;
//   3. a live-style build is unchanged: its worker never asks to take
//      over by itself (the wait is checked in tests/phase4/offline.mjs).
// No database is touched: only the sign-in page is opened, and every
// request off this machine is blocked.
//
//   node tests/phase5/preview-build.mjs [folder for the builds]
import { chromium, webkit } from 'playwright';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serveBuild } from '../phase4/serve-build.mjs';

const PORT = Number(process.env.PREVIEW_PORT || 4185);
const BUILDS = process.argv[2] || join(tmpdir(), 'clarity-preview-builds');
let failures = 0;
let passes = 0;
const pass = (name, ok, detail = '') => {
  if (ok) passes += 1;
  else failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `: ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
async function until(fn, ms = 20000) {
  const end = Date.now() + ms;
  let v;
  while (Date.now() < end) {
    v = await fn();
    if (v) return v;
    await sleep(200);
  }
  return v;
}

function build(dir, version, vercelEnv) {
  execFileSync('npx', ['vite', 'build', '--outDir', dir, '--emptyOutDir'], {
    stdio: 'pipe',
    // An address that answers nothing: the page never reaches a database.
    env: { ...process.env, VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'none', VERCEL_GIT_COMMIT_SHA: version, VERCEL_ENV: vercelEnv },
  });
}
const C = join(BUILDS, 'c');
const D = join(BUILDS, 'd');
const LIVE = join(BUILDS, 'live');
if (process.env.REUSE_BUILDS !== '1' || !existsSync(join(LIVE, 'sw.js'))) {
  console.log('Building preview c, preview d and a live-style build…');
  build(C, 'preview-test-c', 'preview');
  build(D, 'preview-test-d', 'preview');
  build(LIVE, 'preview-test-live', 'production');
}
const headOf = (dir) => {
  const sw = readFileSync(join(dir, 'sw.js'), 'utf8');
  return JSON.parse(sw.slice(sw.indexOf('=') + 1, sw.indexOf(';\n')));
};
pass('a preview build’s worker knows it is a preview', headOf(C).preview === true && headOf(D).preview === true);
pass('a live build’s worker does not', headOf(LIVE).preview === false);

const srv = await serveBuild({ root: C, port: PORT });
const APP = srv.url;
const version = (page) => page.evaluate(() => fetch('/version.json', { cache: 'no-store' }).then((r) => r.json()).then((j) => j.id).catch(() => null));
// The build a page is running: the id baked into its own script.
const running = async (page) => {
  const src = await page.evaluate(() => document.querySelector('script[type=module][src*="/assets/"]')?.getAttribute('src') || '');
  for (const [name, dir] of [['c', C], ['d', D], ['live', LIVE]]) {
    if (src && existsSync(join(dir, src))) {
      const same = readFileSync(join(dir, 'index.html'), 'utf8').includes(src);
      if (same) return name;
    }
  }
  return `unknown (${src})`;
};
const controlled = (page) => page.evaluate(() => Boolean(navigator.serviceWorker?.controller));

for (const [engine, type] of [['Chromium', chromium], ['WebKit', webkit]]) {
  const browser = await type.launch();
  try {
    const context = await browser.newContext({ locale: 'en-GB' });
    await context.route('**/*', (route) => (route.request().url().startsWith(APP) ? route.fallback() : route.abort()));
    const page = await context.newPage();

    srv.setRoot(C);
    await page.goto(`${APP}/auth/login`);
    await until(() => controlled(page));
    pass(`${engine}: build c is on the device and looks after the page`, (await controlled(page)) && (await running(page)) === 'c', await running(page));

    // Build d is deployed to the same address.
    srv.setRoot(D);
    pass(`${engine}: the address now serves d`, (await version(page)) === 'preview-test-d');
    await page.goto(`${APP}/auth/login`);
    pass(`${engine}: the very next open shows build d`, (await running(page)) === 'd', await running(page));
    // d's worker has finished installing and taken over (a preview never waits).
    const took = await until(() => page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const key = (await caches.keys()).find((k) => k.endsWith('preview-test-d'));
      if (!reg || reg.installing || reg.waiting || !key) return false;
      return Boolean(await (await caches.open(key)).match('/index.html'));
    }));
    pass(`${engine}: build d’s worker takes over without waiting`, Boolean(took));
    await page.reload();
    pass(`${engine}: and a refresh stays on d`, (await running(page)) === 'd', await running(page));

    // No connection: the saved copy opens.
    if (engine === 'Chromium') await context.setOffline(true);
    else srv.setDown(true);
    await page.goto(`${APP}/auth/login`).catch(() => null);
    pass(`${engine}: with no connection the preview still opens, on its saved build`, (await until(async () => (await running(page)) === 'd', 12000)) === true, await running(page));
    if (engine === 'Chromium') await context.setOffline(false);
    else srv.setDown(false);
    await context.close();

    // A live-style build: nothing asks its worker to take over at once.
    const live = readFileSync(join(LIVE, 'sw.js'), 'utf8');
    pass(`${engine}: the live worker has the same code, with preview off`, live.includes('"preview":false') && live.includes('PREVIEW ? self.skipWaiting()'));
  } catch (e) {
    pass(`${engine}: ran to the end`, false, e.message.split('\n')[0]);
  } finally {
    await browser.close();
  }
}

await srv.close();
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
