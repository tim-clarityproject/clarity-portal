import { supabase } from './supabase';
import { saveOrQueue } from './syncQueue';
import { clearProgress } from './saveProgress';
import { deleteReview as deleteJournalEntryRow } from './reviewTool';
import { deleteJournal } from './dailyJournal';
import { discardReviewDraft, discardPlanReviewDraft, discardMissionReviewDraft } from './discardDraft';
import { deleteCheckin } from './wheelOfLifeApi';
import { deleteToolAnswers, loadToolAnswer, saveToolAnswers } from './toolAnswers';

// Deleting one saved item (a row of My Plans or My Reviews), in one place
// (Tim, 5 Nov): the lists' rows no longer carry a bin, so the opened item
// deletes itself with this, the same way the lists always did. A draft
// goes through the draft-only helpers, so a bug here can never take a
// finished review with it.

/** The part of a list row an opened item needs to delete itself. */
export function savedItemRef(row) {
  return row ? { dbId: row.dbId, source: row.source, tool: row.tool || null, isDraft: Boolean(row.isDraft), title: row.title, canDelete: row.canDelete !== false } : null;
}

// Deleting happens straight away, with "Deleted" and Undo (writing rule 14;
// Phase 8a follow-up, step 2): no "Delete this?". Each saved item is one
// row of one table, so the row is read just before it goes, and Undo puts
// that same row back, with its own id, so every link to it still works.
const TABLE_OF = {
  decision: 'decisions',
  plan: 'mission_progress_reviews',
  journal: 'daily_journals',
  wheel: 'wheel_of_life_checkins',
};
const tableOf = (source) => TABLE_OF[source] || 'journal_entries';

/**
 * Deletes it and hands back its Undo: a function that saves it again as it
 * was (resolves once it is back). Throws when it can't be deleted.
 */
export async function deleteSavedItemWithUndo(userId, item) {
  if (item.source === 'tool-answers') {
    const record = item.tool ? await loadToolAnswer(userId, item.tool, item.dbId) : null;
    await deleteSavedItem(userId, item);
    return async () => {
      if (!record) throw new Error('Nothing to put back');
      const r = await saveToolAnswers(userId, { ...record, sent: false });
      return r === 'queued' ? 'queued' : 'saved';
    };
  }
  const table = tableOf(item.source);
  const { data: row, error } = await supabase.from(table).select('*').eq('id', item.dbId).eq('user_id', userId).maybeSingle();
  if (error) throw error;
  // Already gone (deleted in another tab): said so, with no Undo that can't work.
  if (!row) throw Object.assign(new Error('Already deleted'), { code: 'GONE' });
  await deleteSavedItem(userId, item);
  // Undo goes through the offline queue like every save: offline it waits on
  // the device ("Will sync") and is sent when the connection is back (the
  // break-it tester, 17 Nov: pressed offline, the item was lost for good).
  return async () => {
    // The person's own Undo: never refused as another window's (the row has gone).
    const r = await saveOrQueue(userId, { table, kind: 'upsert', onConflict: 'id', values: row, newestWins: true });
    return r?.status === 'queued' ? 'queued' : 'saved';
  };
}

/** Deletes it; throws when it can't. */
export async function deleteSavedItem(userId, item) {
  const { dbId: id, source, isDraft } = item;
  if (source === 'decision') {
    const { error } = await supabase.from('decisions').delete().eq('id', id);
    if (error) throw error;
    clearProgress();
  } else if (source === 'tool-answers') {
    // A Team performance check or an Emotional wash (tool_answers, or the
    // device's copy until migration 043 has run).
    await deleteToolAnswers(userId, id);
  } else if (source === 'wheel') {
    const { error } = await deleteCheckin(id);
    if (error) throw new Error(error.message);
  } else if (source === 'plan') {
    if (isDraft) await discardMissionReviewDraft(userId, id);
    else {
      const { error } = await supabase.from('mission_progress_reviews').delete().eq('id', id).eq('user_id', userId);
      if (error) throw error;
    }
  } else if (source === 'journal') {
    await deleteJournal(userId, id);
  } else if (isDraft && source === 'day') {
    await discardPlanReviewDraft(userId, id);
  } else if (isDraft) {
    await discardReviewDraft(userId, id);
  } else {
    await deleteJournalEntryRow(userId, id);
  }
}
