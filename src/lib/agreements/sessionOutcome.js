// What happened at a coaching session (brief items 44 to 46; M28's s-cal-session and SESSL). After a coaching session's
// time its calendar pop-up offers "What happened?": It happened, Cancelled late (counts as used), Rearranged (not
// counted), Not sure yet. A Fathom summary marks it as happened by itself (Phase 6c wires it in), saying so, and the
// coach can change it. Each choice counts against the agreement ("7 of 16 coaching sessions used") and feeds the
// drafted invoices. No-show stays on the session's own page (050; risk 27). Checked by
// tests/performance/agreements-session-outcome.test.mjs.

export const WHAT_HAPPENED = Object.freeze([
  { value: 'held', label: 'It happened' },
  { value: 'late_cancel', label: 'Cancelled late, counts as used' },
  { value: 'moved', label: 'Rearranged' },
  { value: null, label: 'Not sure yet' },
]);
export const WHAT_HAPPENED_QUESTION = 'What happened?';
export const TO_CONFIRM = 'To confirm';
export const NOT_YET_LINE = 'This coaching session hasn’t happened yet.';

const ms = (v) => { const t = Date.parse(v); return Number.isNaN(t) ? null : t; };
/** Whether a session's time has passed (it ended). */
export const isOver = (s, now = Date.now()) => { const a = ms(s?.starts_at); return a !== null && a + (Number(s?.minutes) || 60) * 60000 <= now; };

/** Its line in a list (M28's SESSL). */
export function outcomeLabel(s, now = Date.now()) {
  if (s?.outcome === 'held') return s.outcome_source === 'fathom' ? 'Happened, marked by its Fathom summary' : 'Happened, ticked off by you';
  if (s?.outcome === 'late_cancel') return s.waived ? 'Cancelled late, waived' : 'Cancelled late, counts as used';
  if (s?.outcome === 'moved') return 'Rearranged, not counted';
  if (s?.outcome === 'no_show') return 'Missed, counts as used';
  return isOver(s, now) ? 'Did it happen? Tick it off' : 'Coming up';
}
/** The quiet word at the row's end: "To confirm" for a past one not yet said, "Open" for others past, nothing to come. */
export function rowAction(s, now = Date.now()) {
  if (!isOver(s, now)) return s?.outcome ? 'Open' : '';
  return s?.outcome ? 'Open' : TO_CONFIRM;
}
/** The choice the pop-up shows as chosen. */
export const chosenValue = (s) => (s?.outcome === 'no_show' ? null : s?.outcome ?? null);

/** Whether it counts as used: held, a late cancellation not waived, or a no-show. */
export const counts = (s) => s?.outcome === 'held' || s?.outcome === 'no_show' || (s?.outcome === 'late_cancel' && !s.waived);
export const usedCount = (sessions) => (sessions || []).filter(counts).length;
/** "3 of 16 coaching sessions used." */
export const usedLine = (sessions, total) => `${usedCount(sessions)} of ${total} coaching ${Number(total) === 1 ? 'session' : 'sessions'} used.`;
/** The past ones nobody has said yet ("To confirm"). */
export const toConfirm = (sessions, now = Date.now()) => (sessions || []).filter((s) => !s.outcome && isOver(s, now));

/** The session row the calendar's pop-up saves when a choice is made (the database records who said it: 065). */
export function withOutcome(s, value) {
  const outcome = WHAT_HAPPENED.some((o) => o.value === value) ? value : null;
  return { ...s, outcome, waived: outcome === 'late_cancel' ? Boolean(s.waived) : false, moved_to: outcome === 'moved' ? s.moved_to ?? null : null };
}
