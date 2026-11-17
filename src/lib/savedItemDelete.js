import { supabase } from './supabase';
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
      await saveToolAnswers(userId, { ...record, sent: false });
    };
  }
  const table = tableOf(item.source);
  const { data: row, error } = await supabase.from(table).select('*').eq('id', item.dbId).eq('user_id', userId).maybeSingle();
  if (error) throw error;
  await deleteSavedItem(userId, item);
  return async () => {
    if (!row) throw new Error('Nothing to put back');
    const { error: back } = await supabase.from(table).insert(row);
    if (back) throw back;
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
