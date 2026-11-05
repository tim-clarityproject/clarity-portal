import { supabase } from './supabase';
import { clearProgress } from './saveProgress';
import { deleteReview as deleteJournalEntryRow } from './reviewTool';
import { deleteJournal } from './dailyJournal';
import { discardReviewDraft, discardPlanReviewDraft, discardMissionReviewDraft } from './discardDraft';
import { deleteCheckin } from './wheelOfLifeApi';

// Deleting one saved item (a row of My Plans or My Reviews), in one place
// (Tim, 5 Nov): the lists' rows no longer carry a bin, so the opened item
// deletes itself with this, the same way the lists always did. A draft
// goes through the draft-only helpers, so a bug here can never take a
// finished review with it.

/** The part of a list row an opened item needs to delete itself. */
export function savedItemRef(row) {
  return row ? { dbId: row.dbId, source: row.source, isDraft: Boolean(row.isDraft), title: row.title, canDelete: row.canDelete !== false } : null;
}

/** Deletes it; throws when it can't. */
export async function deleteSavedItem(userId, item) {
  const { dbId: id, source, isDraft } = item;
  if (source === 'decision') {
    const { error } = await supabase.from('decisions').delete().eq('id', id);
    if (error) throw error;
    clearProgress();
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
