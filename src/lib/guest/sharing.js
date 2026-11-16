// Who sees a guest's answers (Tim, 14 Nov, 09:49 and 09:52; migration 044).
// A guest chooses "Only you" or "You and [coach]", You and the coach by
// default, on every guest tool: the outside Health Check and the guest
// pages. With Only you the coach gets no completion email and can't open
// the answers; the guest still gets their PDF and their own copy.
//
// The choice is saved through the database (044: alignment_set_sharing,
// guest_set_sharing). Until 044 has run, or while the connection is away,
// it is kept on the device for the visit (this tab, sessionStorage) and
// sent once the function answers, with nothing alarming said: the page
// reads the kept choice, so it never asks for the coach's email while it
// is Only you.
//
// No React and no Supabase here, so the pages and the tests read one answer.

/** The line under the choice, from one place (M7b "Who can see this"). */
export function sharingLine(coachName, shared) {
  const who = String(coachName || '').trim() || 'Your coach';
  return shared
    ? `${who} sent you the link and will see your results.`
    : `${who} won’t see your answers, but you still get your PDF.`;
}

/** The default: You and the coach (Tim, 14 Nov, 09:52). */
export const SHARED_BY_DEFAULT = true;

/** A database function that isn't there yet (044 not run), as PostgREST and Postgres say it. */
export function functionMissing(error) {
  return error?.code === 'PGRST202' || error?.code === '42883' || error?.status === 404;
}

// ------------------------------------------------------------ this visit's choice
const KEY = 'clarity-share:';

/** The choice kept for this visit: { shared, sent } or null. */
export function keptChoice(id, storage = globalThis.sessionStorage) {
  try {
    const v = JSON.parse(storage?.getItem(KEY + id) || 'null');
    return v && typeof v === 'object' && typeof v.shared === 'boolean' ? { shared: v.shared, sent: v.sent === true } : null;
  } catch {
    return null;
  }
}

export function keepChoice(id, shared, sent, storage = globalThis.sessionStorage) {
  try {
    storage?.setItem(KEY + id, JSON.stringify({ shared: Boolean(shared), sent: Boolean(sent) }));
  } catch {
    // Storage blocked: the page still holds it while it is open.
  }
}

export function forgetChoice(id, storage = globalThis.sessionStorage) {
  try {
    storage?.removeItem(KEY + id);
  } catch {
    // Nothing to forget.
  }
}

/**
 * The choice to show when the visit opens: one kept on the device and not
 * yet sent wins (it is sent next); otherwise the database's (null before
 * 044), then one kept on the device, then the default.
 */
export function openingChoice(kept, fromDatabase) {
  if (kept && !kept.sent) return kept.shared;
  if (typeof fromDatabase === 'boolean') return fromDatabase;
  if (kept) return kept.shared;
  return SHARED_BY_DEFAULT;
}

/**
 * Keeps the choice on the device, then sends it. `send(shared)` resolves
 * { ok: true } once the database has it, { ok: false, missing: true } when
 * the function isn't there yet, or { ok: false } (or throws) when it didn't
 * go. Resolves { shared, sent, missing }; a refusal the page must act on
 * (the visit has ended) is thrown back by `send` with `refused: true`.
 */
export async function saveChoice(id, shared, send, storage = globalThis.sessionStorage) {
  keepChoice(id, shared, false, storage);
  let answer;
  try {
    answer = await send(shared);
  } catch (error) {
    if (error?.refused) throw error;
    answer = { ok: false, missing: functionMissing(error) };
  }
  const sent = Boolean(answer?.ok);
  if (sent) keepChoice(id, shared, true, storage);
  return { shared, sent, missing: Boolean(answer?.missing), notified: answer?.notified, newCode: answer?.newCode === true };
}

/** Sends a kept choice that hasn't gone yet. Resolves what saveChoice does, or null with nothing to send. */
export async function sendKeptChoice(id, send, storage = globalThis.sessionStorage) {
  const kept = keptChoice(id, storage);
  if (!kept || kept.sent) return null;
  return saveChoice(id, kept.shared, send, storage);
}

/**
 * Whether the page may ask for the coach's completion email: only while the
 * choice is You and the coach. (044 refuses it anyway once it has run; before
 * that, this is the only thing that stops it.)
 */
export const mayTellCoach = (shared) => shared !== false;
