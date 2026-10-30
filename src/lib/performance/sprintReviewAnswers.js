import { readCache, writeCache } from '../pageCache';
import { saveOrQueue } from '../syncQueue';
import { tableReady } from './tableReady';

// The end-of-sprint review's two written answers (and what comes next):
// saved to sprint_reviews (migration 038, Tim 29 Oct) when the table is
// there. Until Tim runs 038 they stay on this device, as before, with no
// error shown; once it is there, whatever waits on the device is moved
// across once and taken off the device.

export const ANSWERS_ON_DEVICE = 'performance-sprint-review-answers';
const MAX = 4000;

const clip = (text) => {
  const t = (text || '').trim();
  return t ? t.slice(0, MAX) : null;
};

function rowFor(userId, sprintId, a) {
  return {
    user_id: userId,
    sprint_id: sprintId,
    worked_best: clip(a.worked),
    next_better: clip(a.next),
    next_choice: a.choice === 'recovery' || a.choice === 'sprint' ? a.choice : null,
    finished_at: a.finishedAt || null,
  };
}

function keepOnDevice(userId, sprintId, a) {
  const kept = readCache(userId, ANSWERS_ON_DEVICE)?.v || {};
  writeCache(userId, ANSWERS_ON_DEVICE, { ...kept, [sprintId]: a });
}

function takeOffDevice(userId, sprintId) {
  const kept = { ...(readCache(userId, ANSWERS_ON_DEVICE)?.v || {}) };
  delete kept[sprintId];
  writeCache(userId, ANSWERS_ON_DEVICE, kept);
}

/**
 * Save a finished review's answers: always kept on the device first (so
 * nothing is lost), then sent to sprint_reviews when the table is there
 * (through the offline queue), and taken off the device once it has them.
 * @returns {Promise<'saved'|'queued'|'device'>}
 */
export async function saveSprintReviewAnswers(userId, sprintId, { worked, next, choice, at }) {
  const answers = { worked: worked || '', next: next || '', choice: choice || null, at: at || null, finishedAt: new Date().toISOString() };
  keepOnDevice(userId, sprintId, answers);
  let ready = null;
  try {
    ready = await tableReady('sprint_reviews');
  } catch {
    ready = null;
  }
  if (!ready) return 'device';
  try {
    const r = await saveOrQueue(userId, { table: 'sprint_reviews', kind: 'upsert', onConflict: 'sprint_id', values: rowFor(userId, sprintId, answers) });
    if (r?.status === 'saved') takeOffDevice(userId, sprintId);
    return r?.status === 'queued' ? 'queued' : 'saved';
  } catch {
    return 'device'; // still on the device; moved across next time
  }
}

let moving = null;

/**
 * Once the table is there: every review kept on this device is moved
 * across, never over an answer the table already holds (another device's),
 * and taken off the device. Quiet: nothing is shown either way.
 * @returns {Promise<number>} how many were moved
 */
export function moveSprintReviewAnswers(userId) {
  if (!userId) return Promise.resolve(0);
  if (moving) return moving;
  moving = (async () => {
    const kept = readCache(userId, ANSWERS_ON_DEVICE)?.v || {};
    const ids = Object.keys(kept);
    if (!ids.length) return 0;
    if (!(await tableReady('sprint_reviews'))) return 0;
    let moved = 0;
    for (const sprintId of ids) {
      try {
        const r = await saveOrQueue(userId, {
          table: 'sprint_reviews',
          kind: 'upsert',
          onConflict: 'sprint_id',
          ignoreDuplicates: true,
          values: rowFor(userId, sprintId, kept[sprintId] || {}),
        });
        if (r?.status === 'saved') {
          takeOffDevice(userId, sprintId);
          moved += 1;
        }
      } catch (error) {
        // Its sprint is gone (taken away, or not this person's): nothing
        // can hold it any more, so it stops being tried. Anything else
        // stays on the device for next time.
        if (error?.code === '23503' || error?.code === '42501') takeOffDevice(userId, sprintId);
      }
    }
    return moved;
  })().catch(() => 0).finally(() => { moving = null; });
  return moving;
}
