// The claims' rules with no Supabase in them (claim.js passes its rpc), so
// the tests read the same answer.
// Work done without an account moves into the account made with the same,
// confirmed email (asked once per sign-in per tab; safe to ask again, as
// nothing moves twice):
//   guest_claim()      a guest link's answers (migration 035; with 044 each
//                      saved item carries the guest's choice of who sees it)
//   alignment_claim()  each finished outside Health Check, as one version
//                      inside the portal, with its choice (migration 044)
// Until a migration has run its function isn't there: nothing happens and
// nothing is said, and it is asked again on the next sign-in.
const KEY = 'clarity-guest-claim:';

async function ask(rpc, name) {
  try {
    const { data, error } = await rpc(name);
    if (error) return null;
    return Number.isInteger(data) ? data : 0;
  } catch {
    return null;
  }
}

/**
 * Asks both claims once for this sign-in.
 * Resolves { guest, healthChecks }: how many moved in (0 when none, or when
 * it couldn't be asked).
 */
export async function claimOutsideWork(userId, { rpc, storage = globalThis.sessionStorage } = {}) {
  const none = { guest: 0, healthChecks: 0 };
  if (!userId) return none;
  let done = {};
  try {
    done = JSON.parse(storage?.getItem(KEY + userId) || '{}');
    if (done === '1' || done === 1) done = { guest: true }; // the earlier form of the mark
    if (!done || typeof done !== 'object') done = {};
  } catch {
    // Storage blocked: ask once per page load instead.
    done = {};
  }
  const [guest, healthChecks] = await Promise.all([
    done.guest ? null : ask(rpc, 'guest_claim'),
    done.healthChecks ? null : ask(rpc, 'alignment_claim'),
  ]);
  const next = { guest: Boolean(done.guest || guest !== null), healthChecks: Boolean(done.healthChecks || healthChecks !== null) };
  try {
    storage?.setItem(KEY + userId, JSON.stringify(next));
  } catch {
    // Nothing to remember.
  }
  return { guest: guest || 0, healthChecks: healthChecks || 0 };
}
