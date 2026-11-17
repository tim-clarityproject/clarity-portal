// Guest links: asks the server to email the guest a copy of their plan
// (api/guest-copy.js). The browser sends only its visit key: the server
// learns who to email, and what the plan says, from the database. It never
// sends from a preview or a developer's machine, and then answers
// { sent: false }.

/**
 * @param {string} visit the visit key from guest_open
 * @returns {Promise<{sent: boolean, limit?: boolean}>} never throws; `limit`
 *   when too many copies have been asked for (3 a link each hour)
 */
export async function sendGuestCopy(visit) {
  try {
    const res = await fetch('/api/guest-copy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visit }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body && body.ok === true && body.sent === true) return { sent: true };
    return res.status === 429 ? { sent: false, limit: true } : { sent: false };
  } catch {
    return { sent: false };
  }
}

/**
 * The 6-digit code that shows a guest their earlier answers (migration 046):
 * the server emails it to the guest's own address, from the database.
 * @returns {Promise<{sent: boolean, never?: boolean, limit?: boolean}>} never
 *   throws; `never` on a deployment that never sends (a preview, a
 *   developer's machine)
 */
export async function sendGuestCode(visit) {
  try {
    const res = await fetch('/api/guest-copy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visit, kind: 'code' }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body?.ok === true && body.sent === true) return { sent: true };
    if (res.ok && body?.ok === true && body.sent === false) return { sent: false, never: true };
    return res.status === 429 ? { sent: false, limit: true } : { sent: false };
  } catch {
    return { sent: false };
  }
}
