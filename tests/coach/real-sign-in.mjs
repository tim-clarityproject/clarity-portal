// The two real test coaches sign in to the coach portal for real, on the TEST
// project, with their real authenticators (Tim enrolled both on 23 Nov 2026 and
// keeps the set-up keys as TEST_COACH_OWNER_TOTP_KEY and TEST_COACH_TWO_TOTP_KEY
// in ~/.clarity-test-accounts.env). Read only: every write the page tries is
// refused here before it leaves, so nothing on the test project changes. Nothing
// from the sign-in, the keys or the codes is ever printed.
//
// For each coach it checks:
//   1. with the password alone (aal1) the portal asks for the code, and the
//      database says the code isn't given (coach_code_ok() false);
//   2. with the real code (aal2, Supabase's own challenge and verify) the coach
//      reaches the coach portal, the database says the code is given, and the
//      coach's own row has the role the test project gives it (owner; coach).
//
//   node --import ./tests/scores/register.mjs tests/coach/real-sign-in.mjs
//   (APP_URL as the other coach suites: a test-project build, default :4317)
import { chromium } from 'playwright';
import { APP, accountId, makeReport, readEnv, settle, SIZES } from './shared.mjs';
import { needsHosted } from '../target.mjs';
import { asAal2 } from '../signin/aal2.mjs';

const { pass, done } = makeReport('Coach portal, the real test coaches sign in with their real codes');
// Real Supabase sign-in with the test coaches' real authenticators (TOTP keys), which the
// local stand-in doesn't have: opt-in with HOSTED=1 (Tim, 25 Nov 2026).
needsHosted(import.meta.url, 'it signs in with the test coaches\' real authenticators');
const env = readEnv();
const host = new URL(env.TEST_SUPABASE_URL).hostname;
// Reads the sign-in screens need; every other database write is refused before it leaves.
const READ_RPC = /\/rest\/v1\/rpc\/(coach_code_ok|coach_auth_state|is_coach|is_owner|my_coach_id)(\?|$)/;

async function guarded(browser) {
  const ctx = await browser.newContext({ viewport: SIZES[1440], colorScheme: 'light', serviceWorkers: 'block', reducedMotion: 'reduce' });
  const blocked = [];
  await ctx.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"sent":false}' }));
  await ctx.route((u) => u.hostname === host && u.pathname.startsWith('/rest/v1/'), (route) => {
    const req = route.request();
    if (req.method() === 'GET' || req.method() === 'HEAD' || READ_RPC.test(req.url())) return route.continue();
    blocked.push(`${req.method()} ${new URL(req.url()).pathname}`);
    return route.abort();
  });
  return { ctx, blocked };
}

/** coach_code_ok() and the coach's own row, as the page's own sign-in. */
async function readAs(page) {
  return page.evaluate(async ({ url, key }) => {
    let token = null;
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k === 'clarity-portal-auth' || /^sb-.*-auth-token$/.test(k)) { try { const v = JSON.parse(localStorage.getItem(k)); token = v?.access_token || v?.currentSession?.access_token || token; } catch { /* next */ } }
    }
    if (!token) return { signedIn: false };
    const h = { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    let aal = null;
    try { aal = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).aal || null; } catch { /* unread */ }
    const ok = await fetch(`${url}/rest/v1/rpc/coach_code_ok`, { method: 'POST', headers: h, body: '{}' }).then((r) => r.json()).catch(() => null);
    return { signedIn: true, aal, ok };
  }, { url: env.TEST_SUPABASE_URL, key: env.TEST_SUPABASE_ANON_KEY });
}

async function signIn(page, email, password) {
  await page.goto(`${APP}/coach/sign-in`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((u) => !/\/coach\/sign-in\/?$/.test(u.pathname), { timeout: 30000 }).catch(() => {});
  await settle(page, 2500);
}

const COACHES = [
  { name: 'the owner (coach-owner)', email: env.TEST_COACH_OWNER_EMAIL, password: env.TEST_COACH_OWNER_PASSWORD, key: env.TEST_COACH_OWNER_TOTP_KEY, role: 'owner' },
  { name: 'the second test coach', email: env.TEST_COACH_TWO_EMAIL, password: env.TEST_COACH_TWO_PASSWORD, key: env.TEST_COACH_TWO_TOTP_KEY, role: 'coach' },
];

const browser = await chromium.launch({ args: ['--mute-audio'] });
const writes = [];
try {
  for (const c of COACHES) {
    if (!c.email || !c.password || !c.key) { pass(`${c.name}: its email, password and set-up key are in the accounts file`, false, 'missing'); continue; }

    // 1. The password alone.
    {
      const { ctx, blocked } = await guarded(browser);
      const page = await ctx.newPage();
      await signIn(page, c.email, c.password);
      const path = new URL(page.url()).pathname;
      const r = await readAs(page);
      pass(`${c.name}, password only: the portal asks for the code`, /\/coach\/sign-in\/(code|authenticator|set-up|setup)|code/i.test(path) && !/^\/coach\/?$/.test(path), path);
      pass(`${c.name}, password only: the database says the code isn't given`, r.signedIn && r.aal === 'aal1' && r.ok === false, `${r.aal}/${r.ok}`);
      writes.push(...blocked);
      await ctx.close();
    }

    // 2. With the real code.
    {
      const { ctx, blocked } = await guarded(browser);
      await asAal2(ctx, { host, totpKey: c.key });
      const page = await ctx.newPage();
      await signIn(page, c.email, c.password);
      const path = new URL(page.url()).pathname;
      const r = await readAs(page);
      pass(`${c.name}, with its real code: reaches the coach portal`, /^\/coach(\/|$)/.test(path) && !/sign-in/.test(path), path);
      pass(`${c.name}, with its real code: the database says the code is given`, r.signedIn && r.aal === 'aal2' && r.ok === true, `${r.aal}/${r.ok}`);
      const uid = await accountId(page);
      const row = await page.evaluate(async ({ url, key, uid: id }) => {
        let token = null;
        for (let i = 0; i < localStorage.length; i += 1) {
          const k = localStorage.key(i);
          if (k === 'clarity-portal-auth' || /^sb-.*-auth-token$/.test(k)) { try { const v = JSON.parse(localStorage.getItem(k)); token = v?.access_token || v?.currentSession?.access_token || token; } catch { /* next */ } }
        }
        const res = await fetch(`${url}/rest/v1/coaches?select=role,active&user_id=eq.${id}`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
        return res.ok ? res.json() : [];
      }, { url: env.TEST_SUPABASE_URL, key: env.TEST_SUPABASE_ANON_KEY, uid });
      pass(`${c.name}, with its real code: its coach row is ${c.role}, active`, row?.[0]?.role === c.role && row?.[0]?.active === true, row?.[0] ? `${row[0].role}/${row[0].active}` : 'no row');
      writes.push(...blocked);
      await ctx.close();
    }
  }
  console.log(`  (writes refused before they left: ${writes.length}${writes.length ? `, ${[...new Set(writes)].slice(0, 6).join('; ')}` : ''})`);
} finally {
  await browser.close();
}
done();
