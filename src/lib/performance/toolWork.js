import { supabase } from '../supabase';
import { readCache, writeCache } from '../pageCache';
import { newId, saveOrQueue } from '../syncQueue';
import { tableReady } from './tableReady';

// A tool's saved work tagged to a Strategy (decisions: "Any tool's output
// can be tagged to a strategy in one tap", shown under the Strategy as
// "Work this sprint"). Stored in tool_work_strategies (migration 038, Tim
// 29 Oct): one row per item and Strategy, the item being a decisions row
// (decision tools, Plan my day's old tool, meeting plans) or a
// journal_entries row (after-action and weekly reviews), with the sprint
// and week it was done in.
//
// Until Tim runs 038 the links are kept on this device, with no error, and
// moved across once the table is there.
//
// Nothing in the app tags work yet. Where Phase 3 will use these:
//   Step 1 (Plan my day) and Step 2 (Review my day): "Which Strategy did
//     this serve?" on a finished tool's summary calls linkToolWork.
//   Step 3 (the weekly debrief): "Your work this week" reads
//     loadToolWork({ sprintId, week }).
//   StrategyDetail's "Work this sprint" (Phase 2's empty state) reads
//     loadToolWork({ strategyId, sprintId }).

export const LINKS_ON_DEVICE = 'tool-work-strategies';

const onDevice = (userId) => readCache(userId, LINKS_ON_DEVICE)?.v || [];
const keepOnDevice = (userId, links) => writeCache(userId, LINKS_ON_DEVICE, links);
const sameItem = (a, b) => a.strategy_id === b.strategy_id
  && (a.decision_id || null) === (b.decision_id || null)
  && (a.journal_entry_id || null) === (b.journal_entry_id || null);

/**
 * Tag a tool's work to a Strategy. Exactly one of decisionId or
 * journalEntryId; sprintId and sprintWeek together or not at all.
 * @returns {Promise<{ id: string, where: 'saved'|'queued'|'device' }>}
 */
export async function linkToolWork(userId, { decisionId = null, journalEntryId = null, strategyId, sprintId = null, sprintWeek = null, linkedOn }) {
  if (Boolean(decisionId) === Boolean(journalEntryId)) throw new Error('Tag one piece of work: a decision or a journal entry.');
  if (Boolean(sprintId) !== Boolean(sprintWeek)) throw new Error('A sprint needs its week, and a week its sprint.');
  const row = {
    id: newId(),
    user_id: userId,
    decision_id: decisionId,
    journal_entry_id: journalEntryId,
    strategy_id: strategyId,
    sprint_id: sprintId,
    sprint_week: sprintWeek,
    linked_on: linkedOn,
  };
  if (!(await tableReady('tool_work_strategies').catch(() => null))) {
    const links = onDevice(userId);
    const existing = links.find((l) => sameItem(l, row));
    if (!existing) keepOnDevice(userId, [...links, row]);
    return { id: existing?.id || row.id, where: 'device' };
  }
  // Once per item and Strategy: a second tag is the same tag.
  const r = await saveOrQueue(userId, {
    table: 'tool_work_strategies',
    kind: 'upsert',
    onConflict: decisionId ? 'decision_id,strategy_id' : 'journal_entry_id,strategy_id',
    ignoreDuplicates: true,
    values: row,
  });
  return { id: row.id, where: r?.status === 'queued' ? 'queued' : 'saved' };
}

/** Take a tag off (by its id), wherever it is kept. */
export async function unlinkToolWork(userId, id) {
  const links = onDevice(userId);
  if (links.some((l) => l.id === id)) keepOnDevice(userId, links.filter((l) => l.id !== id));
  if (!(await tableReady('tool_work_strategies').catch(() => null))) return 'device';
  const r = await saveOrQueue(userId, { table: 'tool_work_strategies', kind: 'delete', match: { id, user_id: userId } });
  return r?.status === 'queued' ? 'queued' : 'saved';
}

/**
 * The tags, from the table and the device together (newest first), for a
 * Strategy, a sprint, or a sprint's week.
 */
export async function loadToolWork(userId, { strategyId = null, sprintId = null, week = null } = {}) {
  const fits = (l) => (!strategyId || l.strategy_id === strategyId) && (!sprintId || l.sprint_id === sprintId) && (week == null || l.sprint_week === week);
  const local = onDevice(userId).filter(fits);
  if (!(await tableReady('tool_work_strategies').catch(() => null))) return local;
  let q = supabase.from('tool_work_strategies')
    .select('id, decision_id, journal_entry_id, strategy_id, sprint_id, sprint_week, linked_on, created_at')
    .eq('user_id', userId);
  if (strategyId) q = q.eq('strategy_id', strategyId);
  if (sprintId) q = q.eq('sprint_id', sprintId);
  if (week != null) q = q.eq('sprint_week', week);
  const { data, error } = await q.order('linked_on', { ascending: false });
  if (error) throw error;
  return [...(data || []), ...local.filter((l) => !(data || []).some((d) => sameItem(d, l)))];
}

/** Once the table is there: the tags kept on this device go across once. */
export async function moveToolWorkLinks(userId) {
  const links = onDevice(userId);
  if (!links.length || !(await tableReady('tool_work_strategies').catch(() => null))) return 0;
  let moved = 0;
  for (const l of links) {
    try {
      const r = await saveOrQueue(userId, {
        table: 'tool_work_strategies',
        kind: 'upsert',
        onConflict: l.decision_id ? 'decision_id,strategy_id' : 'journal_entry_id,strategy_id',
        ignoreDuplicates: true,
        values: l,
      });
      if (r?.status !== 'saved') continue;
    } catch (error) {
      // Its work or Strategy is gone (or not this person's): it stops being tried.
      if (!['23503', '42501', '23514'].includes(error?.code)) continue;
    }
    keepOnDevice(userId, onDevice(userId).filter((x) => x.id !== l.id));
    moved += 1;
  }
  return moved;
}
