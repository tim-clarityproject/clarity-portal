// Strategic Alignment Health Check: asks the server function to send an email.
// The browser never says WHO the email goes to: the server decides from the
// session. The access code is sent only to prove the request is genuine.

/**
 * @param {{token: string, email: string, code: string, kind: 'link'|'complete'}} args
 * @returns {Promise<{ok: boolean, error?: 'limit'|'already'|'invalid'|'failed'}>}
 */
export async function requestAlignmentEmail({ token, email, code, kind }) {
  try {
    const res = await fetch('/api/alignment-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, email, code, kind }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.ok) return { ok: true };
    return { ok: false, error: body.error || 'failed' };
  } catch {
    return { ok: false, error: 'failed' };
  }
}
