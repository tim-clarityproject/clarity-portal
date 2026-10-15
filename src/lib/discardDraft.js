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
// condition: their draft marker lives inside the content TEXT column
// as JSON (see planReview.js), and a TEXT column cannot be filtered on
// its JSON keys. review_type is the strongest guard available here, so
// this can still never touch any other kind of review - the draft
// check itself has to stay in ReviewPlan.jsx, reading the same flag the
// page already parses. Fixing that properly means moving the marker
// into the status column, which is a separate patch.
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
