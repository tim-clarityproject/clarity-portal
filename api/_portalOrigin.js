// Where a Health Check email's link points (Claude's call, 11 Nov, 08:25).
// The link is built only from an allow-list of the portal's own addresses:
// the live site, this deployment's own preview addresses, and localhost on a
// developer's machine. It is never built from the request's host: the request
// can only choose between the addresses already on the list, and anything
// else (a forged Host or X-Forwarded-Host header) gets the live address.
//
// The preview addresses come from Vercel's own settings for the deployment
// (VERCEL_BRANCH_URL and VERCEL_URL, which Vercel sets, not the visitor), and
// only on a preview. PORTAL_PREVIEW_HOSTS can name more, separated by commas.
// Each must be a vercel.app address.

export const LIVE_ORIGIN = 'https://portal.theclarityproject.co.uk';

const PREVIEW_HOST = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.vercel\.app$/;
const LOCAL_HOST = /^localhost:(\d{2,5})$/;

const hostOf = (value) => String(value ?? '').trim().toLowerCase().replace(/^https:\/\//, '').replace(/\/+$/, '');

/** The portal's own addresses for this deployment: the live site first. */
export function allowedOrigins(env = process.env) {
  const out = [LIVE_ORIGIN];
  if (env.VERCEL_ENV === 'preview') {
    const named = String(env.PORTAL_PREVIEW_HOSTS ?? '').split(',');
    for (const value of [env.VERCEL_BRANCH_URL, env.VERCEL_URL, ...named]) {
      const host = hostOf(value);
      if (PREVIEW_HOST.test(host) && !out.includes(`https://${host}`)) out.push(`https://${host}`);
    }
  }
  return out;
}

/** The first host a request names, in lower case ('' when it names none). */
function askedHost(headers) {
  // No headers at all (null included) names no host.
  const raw = headers?.['x-forwarded-host'] ?? headers?.host ?? '';
  const first = Array.isArray(raw) ? raw[0] : String(raw).split(',')[0];
  return String(first ?? '').trim().toLowerCase();
}

/**
 * The address a Health Check email's link starts with: the one on the
 * allow-list the request came in on, or the live address.
 */
export function portalOrigin(headers, env = process.env) {
  const asked = askedHost(headers);
  const match = allowedOrigins(env).find((origin) => origin === `https://${asked}`);
  if (match) return match;
  // A developer's own machine, never a deployment: localhost with its port.
  // The port must be a real one (1 to 65535), or the link would open nothing.
  const local = !env.VERCEL && !env.VERCEL_ENV ? LOCAL_HOST.exec(asked) : null;
  const port = local ? Number(local[1]) : 0;
  if (port >= 1 && port <= 65535) return `http://localhost:${port}`;
  return LIVE_ORIGIN;
}
