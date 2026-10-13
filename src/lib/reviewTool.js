import { supabase } from './supabase';
import { formatWeekOf } from './dateFormatter';

// After-action review / Weekly Momentum Check-in (prompt 10b, per
// clarity-specs-9-to-11.md section C). Both live in journal_entries,
// keyed by review_type ('after-action' | 'weekly-momentum'); 'progress'
// is a third, old review_type that is dropped from the UI (no entry
// point creates one any more) but existing rows still open read-only.

export const AFTER_ACTION_QUESTIONS = [
  { key: 'q1', label: 'What did you plan to do?' },
  { key: 'q2', label: 'What actually happened?' },
  { key: 'q3', label: 'Why was there a difference?' },
  { key: 'q4', label: 'What can you learn from this?' },
];

export const WEEKLY_QUESTIONS = [
  { key: 'q1', label: 'What moved forward this week?' },
  { key: 'q2', label: 'What did you do better this week?' },
  { key: 'q3', label: 'What are your priorities for next week?' },
];

// Legacy review_type, kept only so old rows still display correctly.
export const PROGRESS_QUESTIONS = [
  { key: 'q1', label: "What's been going well?" },
  { key: 'q2', label: 'What have you learned recently?' },
  { key: 'q3', label: 'What next steps will expand your performance potential?' },
];

export const RATINGS = [
  { key: 'momentum', label: 'Momentum', help: 'How much did things move forward this week?' },
  { key: 'intentionality', label: 'Intentionality', help: 'How clear was your focus on your priorities this week?' },
  { key: 'communication', label: 'Communication', help: 'How well did you communicate with those you lead or work with this week?' },
  { key: 'performanceUnderPressure', label: 'Performance under pressure', help: 'How well did you perform under pressure this week?' },
];

export function questionsFor(reviewType) {
  if (reviewType === 'weekly-momentum') return WEEKLY_QUESTIONS;
  if (reviewType === 'progress') return PROGRESS_QUESTIONS;
  return AFTER_ACTION_QUESTIONS;
}

export function weeklyTitle(dateKey) {
  return `Weekly momentum check-in, week of ${formatWeekOf(dateKey)}`;
}

export function afterActionTitle(typed) {
  const trimmed = (typed || '').trim();
  return trimmed ? trimmed.slice(0, 60) : 'After-action review';
}

// At least one answer written; weekly also needs at least one rating.
export function validateReview({ reviewType, answers, ratings }) {
  const hasAnswer = questionsFor(reviewType).some((q) => (answers[q.key] || '').trim());
  if (!hasAnswer) return 'Write at least one answer first.';
  if (reviewType === 'weekly-momentum') {
    const hasRating = RATINGS.some((r) => ratings[r.key]);
    if (!hasRating) return 'Give at least one rating first.';
  }
  return null;
}

export async function loadReviewByEntryId(userId, entryId) {
  const { data, error } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('id', entryId)
    .eq('user_id', userId)
    .single();
  if (error) throw error;
  return data;
}

// Anti-duplicate-draft check for a fresh Weekly Momentum Check-in
// (spec: "at most one draft per type and week"): if a draft already
// exists for this exact week-ending date, continue it instead of
// letting a second one start.
export async function loadWeeklyDraftFor(userId, dateKey) {
  const { data, error } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('user_id', userId)
    .eq('review_type', 'weekly-momentum')
    .eq('entry_date', dateKey)
    .eq('status', 'draft')
    .order('updated_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

export async function loadLatestDraft(userId, reviewType) {
  const { data, error } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('user_id', userId)
    .eq('review_type', reviewType)
    .eq('status', 'draft')
    .order('updated_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

export async function saveReview({ userId, entryId, reviewType, dateKey, title, content, status }) {
  const payload = {
    entry_date: dateKey,
    title,
    content: JSON.stringify({ ...content, reviewType }),
    status,
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
    .insert({ user_id: userId, review_type: reviewType, ...payload })
    .select();
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('Save did not return a review.');
  return data[0].id;
}

export async function deleteReview(userId, entryId) {
  const { error } = await supabase
    .from('journal_entries')
    .delete()
    .eq('id', entryId)
    .eq('user_id', userId);
  if (error) throw error;
}
