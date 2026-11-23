// What of a coach's copy on this device hasn't reached the database, read
// without loading the coach store (tidy follow-up 3, the scale check's 5:
// Sign out clears the coach's copies too, after sending what waits, and
// counts what still waits for "Some changes haven't synced yet."). Pure.

/** Tables the coach only reads: never sent, so never waiting (store.js READ_ONLY). */
export const READ_ONLY_TABLES = new Set(['coach_sessions_older', 'activity_log', 'workshop_survey_answers', 'workshop_sends', 'coach_poll_votes', 'coach_bookings',
  'coach_cal_reminder_sends', 'coach_email_addresses']);

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

/**
 * The rows of a coach's device copy (clarity-coach-local:, { rows, marks }) that haven't reached the database: no mark,
 * not sent yet, or a removal still to send; never one the database refused.
 */
export function coachRowsWaiting(copy) {
  const rows = obj(obj(copy).rows);
  const marks = obj(obj(copy).marks);
  let n = 0;
  for (const [table, byKey] of Object.entries(rows)) {
    if (READ_ONLY_TABLES.has(table)) continue;
    for (const k of Object.keys(obj(byKey))) {
      const m = obj(marks[table])[k];
      // A refused row is never sent again until it is changed, so waiting can't help it (as signOutCopies' own `waits`).
      if ((!m?.sent || m.gone) && !m?.refused) n += 1;
    }
  }
  return n;
}

/** Network kept on the device before 052 (clarity-coach-network-local:): every person, give and rating there waits. */
export function networkRowsWaiting(copy) {
  const c = obj(copy);
  return Object.keys(obj(c.people)).length + Object.keys(obj(c.gives)).length + (Array.isArray(c.ratings) ? c.ratings.length : 0);
}
