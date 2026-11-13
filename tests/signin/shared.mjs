// Shared by the sign-in page tests (mock-up M26). The TEST project only;
// every outside host and every call that would send an email is blocked
// or answered here, so no real email is ever sent and Google's own page
// is never opened.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const APP = process.env.APP_URL || 'http://localhost:5173';
export const TEST_REF = 'gqtqljngeenqzxneucoc';
export const MOCKUP = process.env.M26 || join(homedir(), 'Downloads', 'clarity-google-sign-in', 'M26-sign-in-pages.html');

export function testEnv() {
  const env = {};
  for (const line of readFileSync(`${homedir()}/.clarity-test-accounts.env`, 'utf8').split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  if (!env.TEST_SUPABASE_URL?.includes(TEST_REF)) throw new Error('Not the test project.');
  return env;
}

// Invented people only (Sam is the seeded test client's invented name).
export const SAM = { first: 'Sam', email: 'sam.carter@harbourlane.co', gmail: 'sam.carter@gmail.com', newEmail: 'sam@harbourlane.studio' };

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/**
 * Blocks every host but the app and the test project, and answers the
 * calls that would send an email (sign-up, resend, reset, email change)
 * so none is sent. `calls` collects what the pages asked for, without
 * any header or cookie.
 */
export async function guard(context, calls = [], answers = {}) {
  await context.route('**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const local = url.origin === new URL(APP).origin;
    const test = url.hostname === `${TEST_REF}.supabase.co`;
    if (local || url.protocol === 'data:' || url.protocol === 'blob:') return route.continue();
    if (!test) {
      calls.push({ blocked: `${url.origin}${url.pathname}` });
      if (url.hostname === 'api.pwnedpasswords.com' && answers.pwned) return route.fulfill({ status: 200, contentType: 'text/plain', body: answers.pwned(url.pathname) });
      return route.abort();
    }
    const path = url.pathname;
    const method = req.method();
    let body = null;
    try { body = req.postDataJSON(); } catch { body = null; }
    const seen = { method, path, query: Object.fromEntries([...url.searchParams].filter(([k]) => !/code|token|key/i.test(k))) };
    if (body && typeof body === 'object') {
      seen.body = JSON.parse(JSON.stringify(body, (k, v) => (/password|token|verifier|code$/i.test(k) ? '(hidden)' : v)));
    }
    calls.push(seen);
    for (const [name, answer] of Object.entries(answers)) {
      if (name === 'pwned') continue;
      const [m, p] = name.split(' ');
      if (m === method && path.endsWith(p)) {
        const out = await answer({ url, body, route });
        if (out === 'continue') return route.continue();
        if (out === 'handled') return undefined;
        if (out) return json(route, out.status || 200, out.body ?? {});
      }
    }
    // These tests show the seeded test client under invented names and
    // addresses, so nothing they do may be written to its real profile or
    // account: such writes are answered here and never sent.
    if (path.endsWith('/rest/v1/profiles') && method !== 'GET') return json(route, 200, []);
    if (path.endsWith('/auth/v1/user') && method === 'PUT' && !answers['PUT /auth/v1/user']) return json(route, 200, {});
    // Never let a real email be asked for.
    if (/\/auth\/v1\/(signup|resend|recover|otp|magiclink|invite)$/.test(path)) return json(route, 200, {});
    if (path.endsWith('/auth/v1/user') && method === 'PUT' && body && 'email' in body) return json(route, 200, {});
    if (/\/functions\/v1\//.test(path)) return route.abort();
    return route.continue();
  });
}

export async function signInAs(page, email, password) {
  await page.goto(`${APP}/auth/login`);
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', password);
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/welcome$/, { timeout: 30000 });
}

export function makeChecks() {
  let passed = 0; let failed = 0;
  const pass = (name, ok, detail = '') => {
    if (ok) passed += 1; else failed += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && (!ok || process.env.VERBOSE) ? `: ${detail}` : ''}`);
    return ok;
  };
  const done = () => {
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  };
  return { pass, done };
}
