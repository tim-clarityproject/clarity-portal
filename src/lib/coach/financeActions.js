import { supabase } from '../supabase';
import { apiFetch } from '../readShare';
import { coachReadyNow, loadCoach } from './store';

// Finances' server asks (Phase 6b run 2): api/_routes/coach-billing.js at /api/coach-billing, asked with the coach's own
// sign-in (the 6-digit code session decides, 054). Nothing is sent by itself: each ask is a press of the owner's.
// Every answer is one of { ok: true, ... } or { ok: false, message } in calm words; anything that isn't an answer
// (offline, no server on a developer's machine) reads as "That didn’t reach the server…".

export const NOT_REACHED = 'That didn’t reach the server. Check your connection and try again.';
export const NOT_CONNECTED = 'Stripe isn’t connected yet, so nothing was sent.';
export const PREVIEW_ONLY = 'Nothing is sent from a preview. Send it from the live site.';

/**
 * One ask of the billing server. Resolves { ok, message?, ...answer }; on a good answer the coach's data is read again,
 * so what the server wrote (a payment, an invoice) shows.
 */
export async function coachBilling(userId, body) {
  let answer = null;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return { ok: false, message: 'Sign in again to carry on.' };
    const res = await apiFetch('/api/coach-billing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    answer = await res.json().catch(() => null);
  } catch {
    return { ok: false, message: NOT_REACHED };
  }
  if (!answer || typeof answer !== 'object') return { ok: false, message: NOT_REACHED };
  if (answer.ok !== true) {
    if (answer.reason === 'not_connected') return { ok: false, message: NOT_CONNECTED };
    if (answer.reason === 'preview') return { ok: false, message: PREVIEW_ONLY };
    return { ok: false, message: typeof answer.message === 'string' && answer.message ? answer.message : 'That didn’t work. Try again in a moment.' };
  }
  loadCoach(userId, { again: true }).catch(() => {});
  return answer;
}

const RECEIPT_TYPES = /^(image\/(png|jpeg|heic|heif|webp)|application\/pdf)$/;
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;

/** Whether a file can be a receipt: a photo or a PDF of at most 10 MB; the calm line when it can't. */
export function receiptProblem(file) {
  if (!file) return null;
  if (!RECEIPT_TYPES.test(file.type || '')) return 'A receipt is a photo or a PDF. Choose another file.';
  if (file.size > RECEIPT_MAX_BYTES) return 'That file is over 10 MB. Choose a smaller one.';
  return null;
}

/**
 * A receipt into the private coach-files bucket under the coach's own folder (as every coach file is), returning its
 * path, or throwing the calm words when it can't go.
 */
export async function uploadReceipt(userId, file, kind = 'receipts') {
  if (coachReadyNow() !== true) throw new Error('A receipt can be added once the coach portal’s tables are in place.');
  const problem = receiptProblem(file);
  if (problem) throw new Error(problem);
  const safe = String(file.name || 'receipt').replace(/[^\w.-]+/g, '_').replace(/\.{2,}/g, '.').slice(0, 120);
  const path = `${userId}/finances/${kind}/${crypto.randomUUID()}-${safe}`;
  const { error } = await supabase.storage.from('coach-files').upload(path, file, { upsert: false });
  if (error) throw new Error('That file didn’t upload. Check your connection and try again.');
  return path;
}

/** A receipt opened for a minute through a signed link. */
export async function openReceipt(path) {
  const { data, error } = await supabase.storage.from('coach-files').createSignedUrl(path, 60);
  if (error || !data?.signedUrl) throw new Error('That file didn’t open. Check your connection and try again.');
  window.open(data.signedUrl, '_blank', 'noopener');
}
