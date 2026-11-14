import { supabase } from './supabase';
import { readCache, writeCache } from './pageCache';
import { saveOrQueue, waitingToSend } from './syncQueue';
import { isMissingTable, tableReady } from './performance/tableReady';
import { parseDbTimestamp } from './dateFormatter';

// The saved work of the tools that keep their own answers (migration 043,
// `tool_answers`): the Team performance check ('team_check') and the
// Emotional wash ('emotional_wash'). One row per saved item, own rows only.
//
// Device first, as tableReady.js describes for 038. Every save is kept on
// the device at once, so the page shows it, offline too. Until Tim has run
// 043 that is all, with no error shown. Once the table is there a save is
// sent through the offline queue ("Saved", or "Will sync" while it waits),
// whatever waits on the device from before is moved across once, and a
// load brings the device's copy up to date with the table, so another
// device's work shows here. The device copy stays as the offline cache.
//
// A record, on the device and in the app:
//   { id, tool, title, status: 'draft' | 'completed', answers, shared,
//     createdAt, updatedAt, finishedAt, sent }
// Times are ISO strings. `sent` is true once the table (or the queue) has it.

export const TOOL_ANSWERS_TABLE = 'tool_answers';
const ON_DEVICE = 'tool-answers';
const COLS = 'id, tool, title, status, answers, shared_with_coach, finished_at, created_at, updated_at';

// Refused for good (a rule or a check): it can never be held, so it stops
// being tried and stays on the device as it is.
const NEVER = new Set(['42501', '23503', '23514']);

const iso = (v) => {
  if (!v) return null;
  const d = parseDbTimestamp(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

function kept(userId) {
  const v = readCache(userId, ON_DEVICE)?.v;
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function keep(userId, map) {
  writeCache(userId, ON_DEVICE, map);
}

function rowFor(userId, r) {
  return {
    id: r.id,
    user_id: userId,
    tool: r.tool,
    title: `${r.title || ''}`.slice(0, 200),
    status: r.status === 'completed' ? 'completed' : 'draft',
    answers: r.answers || {},
    shared_with_coach: Boolean(r.shared),
    finished_at: r.finishedAt || null,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  };
}

function fromRow(row) {
  return {
    id: row.id,
    tool: row.tool,
    title: row.title || '',
    status: row.status === 'completed' ? 'completed' : 'draft',
    answers: row.answers || {},
    shared: Boolean(row.shared_with_coach),
    finishedAt: iso(row.finished_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    sent: true,
  };
}

// Asking a database for a table it doesn't have yet shows as a failed
// request in the browser's console (a 404), so "not there yet" is
// remembered on the device for an hour: one question an hour, not one a
// page. "There" is remembered by tableReady itself.
const NOT_YET_KEY = 'clarity-tool-answers-not-yet';
const NOT_YET_MS = 60 * 60 * 1000;

function notYet() {
  try {
    const at = Number(window.localStorage.getItem(NOT_YET_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < NOT_YET_MS && Date.now() >= at;
  } catch {
    return false;
  }
}

function noteNotYet(missing) {
  try {
    if (missing) window.localStorage.setItem(NOT_YET_KEY, String(Date.now()));
    else window.localStorage.removeItem(NOT_YET_KEY);
  } catch {
    // Storage blocked: it is asked again next time.
  }
}

let asking = null;

async function ready() {
  if (notYet()) return false;
  // One question at a time, however many parts of a page ask.
  if (!asking) {
    asking = (async () => {
      try {
        const there = await tableReady(TOOL_ANSWERS_TABLE);
        if (there === false) noteNotYet(true);
        if (there === true) noteNotYet(false);
        return there;
      } catch {
        return null;
      }
    })().finally(() => { asking = null; });
  }
  return asking;
}

const newestFirst = (a, b) => `${b.updatedAt || ''}`.localeCompare(`${a.updatedAt || ''}`);

/** What this device holds for a tool, newest first (no waiting). */
export function deviceToolAnswers(userId, tool) {
  if (!userId) return [];
  return Object.values(kept(userId)).filter((r) => r && r.tool === tool).sort(newestFirst);
}

/** One record this device holds, or null. */
export function deviceToolAnswer(userId, id) {
  return (userId && kept(userId)[id]) || null;
}

async function send(userId, record) {
  const r = await saveOrQueue(userId, { table: TOOL_ANSWERS_TABLE, kind: 'upsert', onConflict: 'id', values: rowFor(userId, record) });
  // Marked as sent only when nothing newer was kept meanwhile (a newer
  // save sends itself). A queued save is the queue's to send now.
  const map = kept(userId);
  const now = map[record.id];
  if (now && now.updatedAt === record.updatedAt) keep(userId, { ...map, [record.id]: { ...now, sent: true } });
  return r?.status === 'queued' ? 'queued' : 'saved';
}

/**
 * Save one item: kept on the device first (so nothing is lost), then sent
 * when the table is there.
 * @returns {Promise<'saved'|'queued'|'device'>} 'device' until 043 has run
 */
export async function saveToolAnswers(userId, record) {
  if (!userId || !record?.id || !record.tool) return 'device';
  const now = new Date().toISOString();
  const rec = { ...record, createdAt: record.createdAt || now, updatedAt: now, sent: false };
  keep(userId, { ...kept(userId), [rec.id]: rec });
  if (!(await ready())) return 'device';
  try {
    return await send(userId, rec);
  } catch (error) {
    if (isMissingTable(error)) return 'device';
    throw error;
  }
}

/**
 * Take one item away, here and in the table. Its Undo saves it again
 * (saveToolAnswers with the same record).
 */
export async function deleteToolAnswers(userId, id) {
  if (!userId || !id) return 'device';
  const map = { ...kept(userId) };
  const had = map[id];
  delete map[id];
  keep(userId, map);
  const there = await ready();
  // Never sent and the table can't be told: there is nothing to take away there.
  if (there === false || (!there && !had?.sent)) return 'device';
  const r = await saveOrQueue(userId, { table: TOOL_ANSWERS_TABLE, kind: 'delete', match: { id, user_id: userId } });
  return r?.status === 'queued' ? 'queued' : 'saved';
}

let moving = null;

/**
 * Once the table is there: everything still waiting on this device is
 * sent across. Quiet: nothing is shown either way. Resolves how many moved.
 */
export function moveToolAnswers(userId) {
  if (!userId) return Promise.resolve(0);
  if (moving) return moving;
  moving = (async () => {
    const waiting = Object.values(kept(userId)).filter((r) => r && r.sent !== true);
    if (!waiting.length || !(await ready())) return 0;
    let moved = 0;
    for (const record of waiting) {
      try {
        await send(userId, record);
        moved += 1;
      } catch (error) {
        if (NEVER.has(`${error?.code || ''}`)) {
          const map = kept(userId);
          if (map[record.id]) keep(userId, { ...map, [record.id]: { ...map[record.id], sent: true } });
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
 * Every saved item of a tool, newest first: the table's rows once it is
 * there, with whatever still waits on this device on top. Never throws:
 * offline, or before 043, it is what the device holds.
 */
export async function loadToolAnswers(userId, tool) {
  if (!userId) return [];
  if (!(await ready())) return deviceToolAnswers(userId, tool);
  try {
    await moveToolAnswers(userId);
    const waitingBefore = waitingToSend(userId);
    const { data, error } = await supabase.from(TOOL_ANSWERS_TABLE).select(COLS).eq('user_id', userId).eq('tool', tool);
    if (error) throw error;
    const map = { ...kept(userId) };
    const rows = (data || []).map(fromRow);
    const ids = new Set(rows.map((r) => r.id));
    // Saves still on their way may be newer than what was read: the device's copy stays.
    if (!waitingBefore && !waitingToSend(userId)) {
      for (const r of rows) if (!map[r.id] || map[r.id].sent === true) map[r.id] = r;
      // Sent before and gone from the table: taken away on another device.
      for (const r of Object.values(map)) if (r?.tool === tool && r.sent === true && !ids.has(r.id)) delete map[r.id];
      keep(userId, map);
    }
    return Object.values(map).filter((r) => r && r.tool === tool).sort(newestFirst);
  } catch {
    return deviceToolAnswers(userId, tool);
  }
}

/** One saved item by its id: this device's copy, else the table's, else null. */
export async function loadToolAnswer(userId, tool, id) {
  const here = deviceToolAnswer(userId, id);
  if (here && here.sent !== true) return here;
  const all = await loadToolAnswers(userId, tool);
  return all.find((r) => r.id === id) || here || null;
}
