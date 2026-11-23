import { SwitchRow, useToast } from '../../components/design';
import { removeRow, saveRow } from '../../lib/coach/store';
import { BUSY_WORDS, TG } from '../../lib/coach/googleBusy';
import { useCalSync } from './calSync';
import { useCoachPortal } from './parts';

// Your Personal and Family calendars from Google (Phase 6a run 8, item 2):
// every calendar on the coach's Google account, with a switch each, in
// Settings, My calendars and in the calendar's own My calendars panel. The
// main calendar is kept in step both ways (run 3) and has no switch; every
// other one is off until the coach switches it on. A calendar switched on
// shows its events on the coach's calendar as soft filled tiles and blocks
// those times for booking pages, Offer times and polls; the portal only
// ever reads it (calSync.jsx, googleBusy.js). Shared parts only (SwitchRow,
// the setting row, the toast with Undo).

/**
 * @param {{ inPanel?: boolean }} props `inPanel`: inside the calendar's My calendars panel (each switch in its own field)
 */
export function GoogleCalendarSwitches({ inPanel = false }) {
  const { userId, coach, googleCalendars = [], busyTimes = [] } = useCoachPortal();
  const sync = useCalSync();
  const toast = useToast();
  if (!sync.google) return inPanel ? null : <p className="cc-note">{BUSY_WORDS.none}</p>;
  const rows = googleCalendars.filter((c) => c.coach_id === coach.id);

  const save = async (c, on) => {
    const before = { ...c };
    try {
      const status = await saveRow(userId, TG.calendars, { ...c, busy_on: on });
      toast.saved({
        message: status === 'queued' ? 'Will sync' : (on ? BUSY_WORDS.on(c.name) : BUSY_WORDS.offSaved(c.name)),
        long: true,
        onUndo: () => saveRow(userId, TG.calendars, before).then(() => sync.soon()).catch(() => {}),
      });
    } catch {
      toast.error('That didn’t save. Check your connection and try again.');
      return;
    }
    // Switched off: its busy times stop blocking at once (the database leaves them out too, 059). Switched on: read now.
    if (!on) {
      for (const b of busyTimes.filter((x) => x.calendar_id === c.id)) await removeRow(userId, TG.busy, b.id).catch(() => {});
    }
    sync.soon();
  };

  const row = (c) => (c.is_main ? (
    <div key={c.id} className="cc-setrow">
      <span className="cc-setrow-label">{c.name}</span>
      <span className="cc-setrow-value">{BUSY_WORDS.main}</span>
    </div>
  ) : (
    <div key={c.id} className={inPanel ? 'cc-field cc-todo-switch' : undefined}>
      <SwitchRow label={c.name} note={BUSY_WORDS.note} checked={c.busy_on === true} onChange={(on) => save(c, on)} />
    </div>
  ));

  return (
    <div className="cc-gcals" aria-label={BUSY_WORDS.heading} role="group">
      <p className="cc-small-label">{BUSY_WORDS.heading}</p>
      {rows.length === 0 ? <p className="cc-note">{BUSY_WORDS.reading}</p> : rows.map(row)}
      {rows.length > 0 && <p className="cc-note">{rows.some((c) => c.busy_on) ? BUSY_WORDS.others : BUSY_WORDS.off}</p>}
    </div>
  );
}
