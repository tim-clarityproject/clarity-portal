import { supabase } from '../supabase';
import { apiFetch } from '../readShare';
import { askWith } from './asks';

// The page side of asks.js: the caller's own sign-in from Supabase, sent through the app's apiFetch. A build that isn't
// the live site (__CLARITY_LIVE__, vite.config.js) answers with the stand-ins while a route isn't built yet (501)
// or isn't there at all (a plain 404: the dev server and a local build serve no api/; asks.js).

/* global __CLARITY_LIVE__ */
const LIVE = typeof __CLARITY_LIVE__ !== 'undefined' && __CLARITY_LIVE__ === true;

/**
 * Two stand-in answers the local stand-in (tests/scale/stack.mjs, /standin/v1) can also write, so the flow can be followed
 * on the dev server (P14, P15): a quote sent gets its Q- number and status, a refund or credit its credit note. Anywhere
 * else (a stand-in that isn't the local one) the plain stand-in answer stands. Never on the live site.
 */
const LOCAL_WRITES = {
  'agreements.send': (b) => (b.sendAs === 'quote' && b.quoteId ? ['quote-sent', { quoteId: b.quoteId, validDays: b.validDays }] : null),
  'billing.refund': (b) => ['credit-note', { invoiceId: b.invoiceId, amount: b.amount, reason: b.reason, kind: 'refund' }],
  'billing.credit': (b) => ['credit-note', { invoiceId: b.invoiceId, amount: b.amount, reason: b.reason, kind: 'credit' }],
};
async function localWrite(route, kind, body, token) {
  const plan = LOCAL_WRITES[`${route}.${kind}`]?.(body || {});
  const base = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_SUPABASE_URL : null;
  if (!plan || !token || !base || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(String(base).replace(/\/$/, ''))) return null;
  try {
    const res = await globalThis.fetch(`${String(base).replace(/\/$/, '')}/standin/v1/${plan[0]}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(plan[1]),
    });
    const answer = await res.json().catch(() => null);
    return answer?.ok === true ? answer : null;
  } catch {
    return null;
  }
}

/** One ask of the agreement server: route 'agreements' | 'billing' | 'settle' | 'link', kind, body. Never throws. */
export async function ask(route, kind, body = {}) {
  let token = null;
  if (route !== 'link') {
    try {
      const { data } = await supabase.auth.getSession();
      token = data?.session?.access_token || null;
    } catch {
      token = null;
    }
  }
  const answer = await askWith({ route, kind, body, token, send: apiFetch, live: LIVE });
  if (LIVE || !answer?.standIn) return answer;
  const more = await localWrite(route, kind, body, token);
  return more ? { ...answer, ...more, ok: true, standIn: true, written: true } : answer;
}
