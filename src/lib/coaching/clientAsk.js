import { supabase } from '../supabase';
import { apiFetch } from '../readShare';
import { askWith } from '../agreements/asks';

// The client's and a link's asks of the agreement server (Group C; the shape is asks.js's), as askClient.js: off the
// live site a route that isn't built (501) or isn't there at all (a plain 404, as on a developer's machine or the local
// stand-in, where no /api runs) answers with the stand-in (asks.js). The live site never takes a stand-in.

/* global __CLARITY_LIVE__ */
const LIVE = typeof __CLARITY_LIVE__ !== 'undefined' && __CLARITY_LIVE__ === true;

/** Whether this build is the live site (no stand-ins, no stand-in Stripe form). */
export const isLive = () => LIVE;

/** One ask: route 'settle' | 'link', kind, body. Never throws. */
export async function clientAsk(route, kind, body = {}) {
  let token = null;
  if (route !== 'link') {
    try {
      const { data } = await supabase.auth.getSession();
      token = data?.session?.access_token || null;
    } catch {
      token = null;
    }
  }
  return askWith({ route, kind, body, token, send: apiFetch, live: LIVE });
}

/** A PDF a link's ask sent back (base64), as savePdf's stored PDF. */
export function storedPdf(answer, fallbackName) {
  const raw = globalThis.atob(String(answer?.pdf || ''));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return { storedPdf: { bytes, fileName: answer?.fileName || fallbackName } };
}
