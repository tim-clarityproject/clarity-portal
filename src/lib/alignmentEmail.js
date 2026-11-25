// Strategic Alignment Health Check: asks the server function to send an email.
// The browser never says WHO the email goes to: the server decides from the
// session. The access code is sent only to prove the request is genuine.

import { apiFetch } from './readShare';

/**
 * @param {{token: string, email: string, code: string, kind: 'link'|'complete'|'code', timeZone?: string|null}} args
 *   code: the guest's new access code after Only you (045), to their own address.
 *   timeZone: the device's zone, sent only to choose the results PDF's paper (follow-up 5).
 * @returns {Promise<{ok: boolean, sent?: boolean, error?: 'limit'|'already'|'private'|'expired'|'invalid'|'failed'}>}
 *   expired: the results were open for 30 days, and that time has passed (064).
 *   sent: false on a preview or a developer's machine, which never send.
 *   private: the guest chose Only you (migration 044), so no coach email goes.
 */
export async function requestAlignmentEmail({ token, email, code, kind, timeZone = null }) {
  try {
    const res = await apiFetch('/api/alignment-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(timeZone ? { token, email, code, kind, timeZone } : { token, email, code, kind }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.ok) return { ok: true, sent: body.sent !== false };
    return { ok: false, error: body.error || 'failed' };
  } catch {
    return { ok: false, error: 'failed' };
  }
}
