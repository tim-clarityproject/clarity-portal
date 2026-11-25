// Whether a deployment's database is the TEST Supabase project, never live (Tim, 25 Nov 2026), so a server function
// that changes sign-in data (the coach authenticator's reset) may run on a preview or a developer's machine too.
//
// The test project is named here by its ref, the same one scripts/test-db-common.sh and the browser suites use
// (scripts/README-test-database.md: clarity-portal-test). It is not a secret: it is in every preview's own address
// for Supabase. Live (clarity-portal-fresh) is never named in code; LIVE_SUPABASE_REF in Vercel can name it, and a
// deployment pointing at that ref is refused even if it were ever written here by mistake.
//
// It answers true only when it can tell: the Supabase URL the function talks to is exactly
// https://<test ref>.supabase.co, and no key it would use names another project (a legacy JWT key carries its
// project's ref; the newer sb_ keys don't, and every call still goes to that URL). Anything else, no URL, another
// host, a custom domain, a key for another project, is "can't tell", and refused.

export const TEST_SUPABASE_REF = 'gqtqljngeenqzxneucoc';

const SUPABASE_HOST = /^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/;

/** The project ref of a Supabase URL, or '' when it isn't a plain https://<ref>.supabase.co. */
export function refOfUrl(url) {
  const m = SUPABASE_HOST.exec(String(url ?? '').trim().toLowerCase());
  return m ? m[1] : '';
}

/** The `ref` a legacy JWT key carries ('' for a key that names none, such as the newer sb_ keys). */
export function refOfKey(key) {
  const parts = String(key ?? '').split('.');
  if (parts.length !== 3) return '';
  try {
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return typeof claims?.ref === 'string' ? claims.ref.toLowerCase() : '';
  } catch {
    return '';
  }
}

/** True only when this deployment's Supabase is certainly the test project. */
export function onTestProject(env = process.env) {
  if (!env) return false;
  const ref = refOfUrl(env.SUPABASE_URL || env.VITE_SUPABASE_URL);
  if (!ref || ref !== TEST_SUPABASE_REF) return false;
  const live = String(env.LIVE_SUPABASE_REF ?? '').trim().toLowerCase();
  if (live && live === ref) return false;
  for (const key of [env.SUPABASE_SERVICE_ROLE_KEY, env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY]) {
    const keyRef = refOfKey(key);
    if (keyRef && keyRef !== ref) return false;
  }
  return true;
}

/**
 * Whether a function may change sign-in data here: the live site always (as before), and a preview or a developer's
 * machine only on the test project.
 */
export function mayChangeSignIn(env = process.env) {
  if (!env) return false;
  if (env.VERCEL_ENV === 'production') return true;
  return onTestProject(env);
}
