import { supabase } from '../supabase';
import { apiFetch } from '../readShare';
import { askWith } from './asks';

// The page side of asks.js: the caller's own sign-in from Supabase, sent through the app's apiFetch. A build that isn't
// the live site (__CLARITY_LIVE__, vite.config.js) answers with the stand-ins while a route isn't built yet (501)
// or isn't there at all (a plain 404: the dev server and a local build serve no api/; asks.js).

/* global __CLARITY_LIVE__ */
const LIVE = typeof __CLARITY_LIVE__ !== 'undefined' && __CLARITY_LIVE__ === true;

/**
 * Stand-in answers the local stand-in (tests/scale/stack.mjs, /standin/v1) can also write, so the flow can be followed
 * on the dev server (P14, P15): a quote sent gets its Q- number and status, a refund or credit its credit note. Anywhere
 * else (a stand-in that isn't the local one) the plain stand-in answer stands. Never on the live site.
 */
const LOCAL_WRITES = {
  'agreements.send': (b) => (b.sendAs === 'quote' && b.quoteId ? ['quote-sent', { quoteId: b.quoteId, validDays: b.validDays }] : null),
  // A running agreement's changes (the Stage D UI tester's fault 2): kept on the local stand-in as the server keeps them.
  'agreements.pause': (b) => (b.agreementId ? ['pause', { agreementId: b.agreementId, from: b.from, to: b.to }] : null),
  'agreements.extend': (b) => (b.agreementId ? ['extend', { agreementId: b.agreementId, endsOn: b.endsOn }] : null),
  'agreements.end_early': (b) => (b.agreementId ? ['end-early', { agreementId: b.agreementId, endsOn: b.endsOn, by: b.by }] : null),
  'billing.refund':(b) => ['credit-note', { invoiceId: b.invoiceId, amount: b.amount, reason: b.reason, kind: 'refund' }],
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
    if (answer?.ok === true) return answer;
    // The stand-in refused, as the server would (a second pause, one past the longest, one while ending early: the
    // Stage D break-it tester): its calm words, never a "done" that changed nothing.
    return answer?.ok === false && answer.calm && typeof answer.message === 'string' ? { ok: false, message: answer.message } : null;
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
  if (more?.ok === false) return more;
  return more ? { ...answer, ...more, ok: true, standIn: true, written: true } : answer;
}

/**
 * When a signed agreement's PDF can't be had (P13): off the live site there is no PDF server, so it says so rather than
 * blaming the connection. Shown as one mistake line under the row that asked for it, never a toast that goes.
 */
export const signedPdfProblem = () => (LIVE ? 'The signed PDF wasn’t made. Check your connection and try again.'
  : 'The signed PDF is made on the live site only, so it can’t be downloaded here.');
