import { supabase } from './supabase';
import { getLocalDateKey, parseDbTimestamp } from './dateFormatter';

// A review of a specific plan (daily plan, meeting, If-Then plan,
// Inversion thinking, Tough conversation) or of a day with no plan
// (prompt 8). Stored in the existing journal_entries table under its
// own review_type value ('plan-review' - see migration
// 013_add_plan_review_type.sql, additive only, not yet run against the
// live database as of this build - every call here fails gracefully
// until it is). No new columns: which plan is reviewed, and whether
// the review is still a draft, live inside the existing content TEXT
// column as JSON, the same convention every other review_type already
// uses (see MyJournal.jsx) - { a, b, planKind, planId, dateKey,
// reviewType: 'plan-review', draft }.
export const PLAN_REVIEW_TYPE = 'plan-review';

function parseContent(row) {
  try {
    return JSON.parse(row.content) || {};
  } catch {
    return {};
  }
}

// The one place that decides whether a plan-review row is a draft
// (patch D2 area A). savePlanReview() now writes the status column as
// well as the JSON flag, but rows saved before that only ever got the
// column's own DEFAULT 'final' - their real state is in the JSON. So a
// row counts as a draft if EITHER marker says so, which reads old and
// new rows correctly with no migration and no backfill.
//
// Takes either shape: a row from loadPlanReviews() (which has .data
// already parsed) or a raw journal_entries row straight from a query.
export function isPlanReviewDraft(row) {
  if (!row) return false;
  if (row.status === 'draft') return true;
  const data = row.data || parseContent(row);
  return data.draft === true;
}

// One fetch of every plan-review row for this user; callers match the
// one they need client-side (journal entries are low-volume per user,
// and the plan link lives inside the JSON content, not a column we
// could filter on in the query itself).
export async function loadPlanReviews(userId) {
  const { data, error } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('user_id', userId)
    .eq('review_type', PLAN_REVIEW_TYPE);
  if (error) throw error;
  return (data || []).map((row) => ({ ...row, data: parseContent(row) }));
}

// planId identifies a specific decisions row; its absence (a day with
// no daily plan) falls back to matching by dateKey instead.
export function findPlanReview(reviews, { planKind, planId, dateKey }) {
  return reviews.find((r) => {
    if (r.data.planKind !== planKind) return false;
    if (planId) return r.data.planId === planId;
    return !r.data.planId && r.data.dateKey === dateKey;
  }) || null;
}

// "Review my day"/"Review My Day" have no specific plan in hand (unlike
// a Review button on a plan's own summary) - find today's daily plan,
// if one exists, client-side (the created_at column has no time zone
// ending - rule 19 - so "today" cannot be a safe SQL date filter).
export async function findTodaysDailyPlan(userId) {
  const { data, error } = await supabase
    .from('decisions')
    .select('*')
    .eq('user_id', userId)
    .eq('tool_type', 'daily_plan')
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw error;
  const todayKey = getLocalDateKey(new Date());
  return (data || []).find((row) => getLocalDateKey(parseDbTimestamp(row.created_at)) === todayKey) || null;
}

export async function savePlanReview({ userId, entryId, planKind, planId, dateKey, title, a, b, draft }) {
  const content = JSON.stringify({
    a, b, planKind, planId: planId || null, dateKey, reviewType: PLAN_REVIEW_TYPE, draft: !!draft,
  });
  const payload = {
    content,
    title,
    entry_date: dateKey,
    // Kept exactly consistent with the JSON draft flag above (patch D2
    // area A). This column was never written before, so every row saved
    // earlier sits at its DEFAULT 'final' whatever its JSON says - read
    // plan-review rows through isPlanReviewDraft(), never off either
    // marker alone.
    status: draft ? 'draft' : 'final',
    updated_at: new Date().toISOString(),
  };

  if (entryId) {
    const { data, error } = await supabase
      .from('journal_entries')
      .update(payload)
      .eq('id', entryId)
      .eq('user_id', userId)
      .select();
    if (error) throw error;
    if (!data || data.length === 0) throw new Error('Could not find this review to update.');
    return data[0].id;
  }

  const { data, error } = await supabase
    .from('journal_entries')
    .insert({ user_id: userId, review_type: PLAN_REVIEW_TYPE, ...payload })
    .select();
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('Save did not return a review.');
  return data[0].id;
}
