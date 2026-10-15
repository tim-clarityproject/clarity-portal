import { supabase } from './supabase';
import { PLAN_REVIEW_TYPE } from './planReview';

// Draft-only deletes for every tool's in-page Discard (patch D1).
//
// Deliberately SEPARATE from the list pages' own delete functions
// (deleteJournal in dailyJournal.js, deleteReview in reviewTool.js and
// missionPlan.js): those are reached from a row's bin icon, where
// deleting a finished item is exactly what the person asked for, so
// they must stay unconditional. These are reached from Discard, where
// deleting a finished item would be data loss, so every one of them
// carries its draft condition in the database call itself.
//
// That matters because four of the calling pages (Tough Conversation's
// two steps, Inversion's steps 2 and 3) never fetch the row they are
// editing - they only receive form_data through navigation state - so
// they genuinely cannot tell a draft from a finished item in page code.
// Putting the condition in the query means a finished row matches
// nothing and is left untouched, rather than relying on a page-level
// check that those pages are not able to make.

export async function discardJournalDraft(userId, id) {
  const { error } = await supabase
    .from('daily_journals')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .eq('status', 'draft');
  if (error) throw error;
}

export async function discardReviewDraft(userId, entryId) {
  const { error } = await supabase
    .from('journal_entries')
    .delete()
    .eq('id', entryId)
    .eq('user_id', userId)
    .eq('status', 'draft');
  if (error) throw error;
}

// Day reviews are the one case with no usable database-level draft
// condition, and deliberately still are after patch D2.
//
// savePlanReview() now writes the status column, so NEW rows could be
// guarded on status='draft' - but rows saved before that sit at the
// column's DEFAULT 'final' even when their JSON says draft, so adding
// that condition here would silently refuse to delete every legacy
// draft. Their real marker is inside the content TEXT column as JSON,
// which cannot be filtered on. So review_type stays the guard (this
// can never touch another kind of review), and the draft decision
// stays with the caller, which asks isPlanReviewDraft() - the one
// helper that reads old and new rows correctly.
export async function discardPlanReviewDraft(userId, entryId) {
  const { error } = await supabase
    .from('journal_entries')
    .delete()
    .eq('id', entryId)
    .eq('user_id', userId)
    .eq('review_type', PLAN_REVIEW_TYPE);
  if (error) throw error;
}

// decisions carries two overlapping draft markers (a `draft` boolean
// and a `status` text) - some tools write both, Stop Doing Audit writes
// only status. Matching either one keeps this correct for every tool
// without depending on which of the two that tool happens to set, and
// a 'completed' row matches neither.
export async function discardDecisionDraft(userId, decisionId) {
  const { error } = await supabase
    .from('decisions')
    .delete()
    .eq('id', decisionId)
    .eq('user_id', userId)
    .or('draft.eq.true,status.eq.draft');
  if (error) throw error;
}
