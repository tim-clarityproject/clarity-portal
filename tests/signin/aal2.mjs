// A test coach, signed in for real on the TEST project, shown to the page
// as one that has set up an authenticator and given its code this sign-in
// (Phase 6a run 5). No real authenticator is ever enrolled on a test
// account: the page is told about a stand-in factor, and the sign-in's own
// token is shown to the page with its assurance level raised to aal2.
//
// How: the token the page keeps is a copy of the real one with `aal: aal2`
// and the real middle part carried inside it (`x_real`). Every request the
// page sends to the test project goes with the real token again, so the
// database only ever sees the real sign-in and its own rules. Supabase's
// own sign-in answers (the token, and the account's own record) are read
// for real and given back with the stand-in factor and the raised level.
// The token is never printed.
//
//   await asAal2(pageOrContext, { host })   register AFTER any other routes
//     on the same page or context, so it runs first and every later handler
//     sees the real token.
const FACTOR_ID = '00000000-0000-4000-8000-0000000000f1';
export const STAND_IN_FACTOR = { id: FACTOR_ID, factor_type: 'totp', status: 'verified', friendly_name: 'Authenticator', created_at: '2026-11-02T09:00:00Z', updated_at: '2026-11-02T09:00:00Z' };

const b64u = (text) => Buffer.from(text, 'utf8').toString('base64url');
const unb64u = (part) => Buffer.from(part, 'base64url').toString('utf8');

/** The token with its level raised (and the real middle part kept inside it). */
export function forgeAal2(token) {
  const [h, p, s] = String(token || '').split('.');
  if (!h || !p) return token;
  try {
    const payload = JSON.parse(unb64u(p));
    if (payload.x_real) return token;
    const raised = { ...payload, aal: 'aal2', amr: [{ method: 'totp', timestamp: payload.iat }, ...(payload.amr || [])], x_real: p };
    return `${h}.${b64u(JSON.stringify(raised))}.${s}`;
  } catch {
    return token;
  }
}

/** The real token inside a raised one (any other token as it is). */
export function realOf(token) {
  const [h, p, s] = String(token || '').split('.');
  try {
    const payload = JSON.parse(unb64u(p));
    return payload.x_real ? `${h}.${payload.x_real}.${s}` : token;
  } catch {
    return token;
  }
}

const withFactor = (user, factor) => (user && factor ? { ...user, factors: [...(user.factors || []).filter((f) => f.factor_type !== 'totp'), STAND_IN_FACTOR] } : user);

/**
 * @param {{ host: string, factor?: boolean, raise?: boolean }} o `raise`
 *   false: the stand-in factor only, the level left as it is (aal1), so the
 *   page asks for the code.
 */
export async function asAal2(target, { host, factor = true, raise = true } = {}) {
  // A session already on the device (a saved sign-in) is raised as the page opens.
  await target.addInitScript(({ standIn, withF, up }) => {
    try {
      const raw = localStorage.getItem('clarity-portal-auth');
      if (!raw) return;
      const s = JSON.parse(raw);
      const [h, p, sig] = String(s.access_token || '').split('.');
      if (!p) return;
      const json = JSON.parse(decodeURIComponent(escape(atob(p.replace(/-/g, '+').replace(/_/g, '/')))));
      if (up && !json.x_real) {
        const raised = { ...json, aal: 'aal2', amr: [{ method: 'totp', timestamp: json.iat }, ...(json.amr || [])], x_real: p };
        const enc = btoa(unescape(encodeURIComponent(JSON.stringify(raised)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        s.access_token = `${h}.${enc}.${sig}`;
      }
      if (withF && s.user) s.user.factors = [...(s.user.factors || []).filter((f) => f.factor_type !== 'totp'), standIn];
      localStorage.setItem('clarity-portal-auth', JSON.stringify(s));
    } catch { /* the page signs in again */ }
  }, { standIn: STAND_IN_FACTOR, withF: factor, up: raise });

  await target.route((url) => url.hostname === host, async (route) => {
    const req = route.request();
    const auth = req.headers().authorization || '';
    const headers = /^Bearer /.test(auth) ? { ...req.headers(), authorization: `Bearer ${realOf(auth.slice(7))}` } : undefined;
    const path = new URL(req.url()).pathname;
    try {
      if (path.endsWith('/auth/v1/user') && req.method() === 'GET') {
        const res = await route.fetch({ headers });
        const body = await res.json().catch(() => null);
        return route.fulfill({ status: res.status(), contentType: 'application/json', body: JSON.stringify(res.ok() ? withFactor(body, factor) : body) });
      }
      if (path.endsWith('/auth/v1/token') && req.method() === 'POST') {
        const res = await route.fetch({ headers });
        const body = await res.json().catch(() => null);
        if (res.ok() && body?.access_token) {
          if (raise) body.access_token = forgeAal2(body.access_token);
          if (body.user) body.user = withFactor(body.user, factor);
        }
        return route.fulfill({ status: res.status(), contentType: 'application/json', body: JSON.stringify(body) });
      }
    } catch (error) {
      if (/disposed|closed/i.test(error?.message || '')) return undefined;
      throw error;
    }
    return route.fallback(headers ? { headers } : undefined);
  });
}
