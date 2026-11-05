import { STEP_PREFIX } from '../components/design/guideDraft';
import { readDraft } from './drafts';
import { readJson } from './deviceStore';
import { formatDayMonthTime } from './dateFormatter';

// "Carry on where you left off" on Home (brief, Phase 4 step 2): one row
// per half-finished tool, from what this device keeps of it. A guided
// tool remembers its step (GuidedTool, `ds-guide:` keys), and every tool
// keeps its typing as a draft (drafts.js); each is cleared once the tool
// is finished or discarded, so whatever is still here is unfinished.
//
// Only drafts that open again from the tool's own address are listed (a
// draft of an old saved item needs that item's state to open). The tool
// Home is suggesting right now isn't repeated here.
//
// Rows are named in words: the tool's name, with when it was last typed
// in where the device knows it.

/** A guided tool's remembered step, when it has moved past the first. */
function stepOf(key) {
  const v = readJson(STEP_PREFIX + key);
  return v && Number(v.index) > 0 ? v : null;
}

/**
 * The rows, newest first: [{ key, title, to, at }].
 * @param {string} userId
 * @param {{ today: string, yesterday: string, exclude?: string[], finished?: string[] }} opts
 *   exclude: the routes the suggestion card already offers
 *   finished: the keys of tools already finished ('plan-my-day',
 *   'review-my-day:<day>'): never listed, whatever the device remembers
 *   of them (Tim, 5 Nov: reopening a finished review made it part-way)
 */
export function carryOnItems(userId, { today, yesterday, exclude = [], finished = [] }) {
  if (!userId) return [];
  const found = [];
  const add = (key, title, to, { step, draft } = {}) => {
    if (finished.includes(key)) return;
    const d = draft ? readDraft(userId, draft) : null;
    const s = step ? stepOf(step) : null;
    if (!s && !d) return;
    found.push({ key, title, to, at: d?.at || null });
  };

  // The rebuilt guided tools: where they were left, and their typing.
  add('plan-my-day', 'Plan my day', '/my-day/plan', { step: `day-plan-${userId}-${today}`, draft: `day-plan:${today}` });
  for (const day of [today, yesterday]) {
    add(`review-my-day:${day}`, 'Review my day', day === today ? '/my-day/review' : `/my-day/review/${day}`, { step: `day-review-${userId}-${day}`, draft: `day-review:${day}` });
  }
  add('build-plan', 'Build your plan', '/performance-plan/build', { step: `performance-plan-build-${userId}` });
  add('start-sprint', 'Start a Performance Sprint', '/performance-sprint/start', { step: `performance-sprint-start-${userId}` });
  add('sprint-review', 'End-of-sprint review', '/performance-sprint/review', { step: `performance-sprint-review-${userId}` });
  // The weekly debrief, for any week whose step the device remembers.
  try {
    const prefix = `${STEP_PREFIX}debrief-${userId}-`;
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      const name = k.slice(prefix.length);
      const [sprintId, week] = name.split(':');
      if (!sprintId || !/^\d+$/.test(week || '')) continue;
      add(`debrief:${name}`, 'Weekly performance debrief', `/performance-sprint/debrief/${sprintId}/${week}`, { step: k.slice(STEP_PREFIX.length) });
    }
  } catch {
    // Storage blocked: nothing to carry on.
  }

  // Older tools whose new drafts open from their own address.
  add('journal', 'Journal', '/daily-journal', { draft: `journal:${today}` });
  add('time-audit', 'Time audit', '/time-audit', { draft: 'stop-doing-audit:new' });
  add('feedback', 'Give difficult feedback', '/give-difficult-feedback', { draft: 'tough-conversation-1:new' });
  add('pre-mortem', 'Pre-mortem', '/pre-mortem', { draft: 'inversion-1:new' });

  return found
    .filter((x) => !exclude.includes(x.to))
    .sort((a, b) => (b.at || 0) - (a.at || 0));
}

/** "Last changed 21 Oct, 08:12" for a row, when the device knows (24-hour clock, rule 19). */
export function carryOnWhen(at) {
  return at ? formatDayMonthTime(new Date(at)) : null;
}
