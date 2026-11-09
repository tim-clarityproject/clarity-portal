import { supabase } from '../supabase';
import { noteVersions, saveOrQueue, waitingToSend, whenSent } from '../syncQueue';
import { tableReady } from './tableReady';
import { parseDbTimestamp } from '../dateFormatter';

// What migration 039 gives a table to (Phase 4 step 7): things kept per
// person and day, until now on the device only. The habits chosen in Plan
// my day (day_plan_habits, dayPlanHabits.js) and the sleep wind down's
// thoughts (wind_down_nights, windDown.js).
//
// Device first, as tableReady.js describes for 038. Every change is kept
// on the device at once, so the page shows it, offline too. Until Tim has
// run 039 that is all, with no error shown. Once the table is there:
//   - a change is sent through the offline queue, based on the version of
//     the day's row this window last read (the save-version guard);
//     another device's newer change is never written over without being
//     read first: the save is refused as superseded, the newer row is
//     read, and this change is put on top of it once (onTop);
//   - what waits on the device from before is moved across once, put on
//     top of a row another device has already saved for that day;
//   - refresh() brings the device's copy up to date with the table, so
//     another device's choice shows here; the device copy stays as the
//     offline cache.
//
// A kept day may carry `sent: true` (the table has it) and `at` (the
// row's updated_at as last read or saved). Anything without `sent: true`
// is still to be sent.
//
//   device  { get(userId, day), set(userId, day, value) -> bool, days(userId) }
//   toRow(value) the table's columns; fromRow(row) the value kept
//   onTop(saved, mine) the value to send over another device's saved one
//   (default: this device's own)

// Refused for good: the row points at something gone or not the person's,
// or breaks a check. It can never be held, so it stops being tried (it
// stays on the device as it is).
const NEVER = new Set(['42501', '23503', '23514']);

export function dayStore({ table, dayCol, device, toRow, fromRow, onTop = (saved, mine) => mine }) {
  const onConflict = `user_id,${dayCol}`;
  const listeners = new Set();
  const notify = () => listeners.forEach((fn) => fn());

  const same = (x, y) => JSON.stringify(toRow(x)) === JSON.stringify(toRow(y));
  const values = (userId, day, value) => ({ user_id: userId, [dayCol]: day, ...toRow(value) });
  const upsert = (userId, day, value) => ({ table, kind: 'upsert', onConflict, values: values(userId, day, value) });

  async function ready() {
    try {
      return await tableReady(table);
    } catch {
      return null;
    }
  }

  function keep(userId, day, value) {
    const ok = device.set(userId, day, value);
    notify();
    return ok;
  }

  async function readRows(userId, narrow) {
    let query = supabase.from(table).select('*').eq('user_id', userId);
    query = narrow(query);
    const { data, error } = await query;
    if (error) throw error;
    noteVersions(table, data);
    return data || [];
  }

  // The day as the table holds it now (the version book learns it).
  async function readDay(userId, day) {
    return (await readRows(userId, (q) => q.eq(dayCol, day).limit(1)))[0] || null;
  }

  // Sends the day as the device keeps it. Superseded: another device (or
  // window) changed it since this one read it: read theirs, put this one
  // on top, and send that once.
  async function send(userId, day) {
    let mine = device.get(userId, day);
    if (!mine) return { status: 'saved' };
    let r = await saveOrQueue(userId, upsert(userId, day, mine));
    if (r?.status === 'superseded') {
      const saved = await readDay(userId, day);
      if (saved) mine = { ...onTop(fromRow(saved), mine), at: saved.updated_at };
      keep(userId, day, { ...mine, sent: false });
      r = await saveOrQueue(userId, upsert(userId, day, mine));
    }
    if (r?.status === 'saved' || r?.status === 'queued') {
      // Marked as sent only when nothing newer was kept meanwhile (a newer
      // change sends itself). A queued save is the queue's to send now.
      const now = device.get(userId, day);
      const at = r.data?.[0]?.updated_at || now?.at || null;
      if (now && same(now, mine)) keep(userId, day, { ...now, sent: true, ...(at ? { at } : {}) });
    }
    return r;
  }

  /**
   * Keep a day's value (on the device at once) and send it when the table
   * is there. Resolves as the queue does ({ status: 'saved' | 'queued' |
   * 'superseded' }), or { status: 'device' } until 039 has run.
   */
  async function write(userId, day, value) {
    if (!userId) return { status: 'device' };
    const had = device.get(userId, day);
    if (!keep(userId, day, { ...value, sent: false, ...(had?.at ? { at: had.at } : {}) })) {
      throw new Error('The device has no room to keep this.');
    }
    if (!(await ready())) return { status: 'device' };
    return send(userId, day);
  }

  let moving = null;

  /**
   * Once the table is there: every day still waiting on this device is
   * sent across, on top of a row another device has already saved for it.
   * Quiet: nothing is shown either way. Resolves how many were moved.
   */
  function move(userId) {
    if (!userId) return Promise.resolve(0);
    if (moving) return moving;
    moving = (async () => {
      const days = device.days(userId).filter((d) => device.get(userId, d) && device.get(userId, d).sent !== true);
      if (!days.length || !(await ready())) return 0;
      let moved = 0;
      for (const day of days) {
        try {
          const saved = await readDay(userId, day);
          const mine = device.get(userId, day);
          // Saved elsewhere since this device last read it: put this one on top.
          if (saved && saved.updated_at !== mine.at) keep(userId, day, { ...onTop(fromRow(saved), mine), sent: false, at: saved.updated_at });
          const r = await send(userId, day);
          if (r?.status === 'saved') moved += 1;
        } catch (error) {
          if (NEVER.has(`${error?.code || ''}`)) {
            const kept = device.get(userId, day);
            if (kept) keep(userId, day, { ...kept, sent: true });
          } else {
            break; // offline or the server is unwell: tried again next time
          }
        }
      }
      return moved;
    })().catch(() => 0).finally(() => { moving = null; });
    return moving;
  }

  /**
   * Bring the device's copy of these days up to date with the table, after
   * moving across whatever waits here. Never replaces a change still to be
   * sent. Resolves true when something shown here changed.
   * @param {{ day?: string, since?: string }} which one day, or every day from `since`
   */
  async function refresh(userId, { day, since } = {}) {
    if (!userId || !(await ready())) return false;
    try {
      await move(userId);
      await whenSent();
      const rows = await readRows(userId, (q) => (day ? q.eq(dayCol, day) : since ? q.gte(dayCol, since) : q));
      if (waitingToSend(userId)) return false;
      let changed = false;
      for (const row of rows) {
        const d = row[dayCol];
        const had = device.get(userId, d);
        if (had && had.sent !== true) continue;
        if (had && had.at === row.updated_at) continue;
        // A read that left before this device's own save landed (a choice
        // made while the page's quiet refresh was on its way): older than
        // what the device holds, so never written over it (9 Nov).
        if (had?.at && parseDbTimestamp(row.updated_at) < parseDbTimestamp(had.at)) continue;
        const next = { ...fromRow(row), sent: true, at: row.updated_at };
        if (!had || !same(had, next)) changed = true;
        keep(userId, d, { ...(had || {}), ...next });
      }
      return changed;
    } catch {
      return false; // offline or refused: the device's copy stays
    }
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }

  return { write, move, refresh, subscribe, ready };
}
