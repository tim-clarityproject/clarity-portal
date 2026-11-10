import { supabase } from './supabase';
import { formatVersion } from './missionPlan';
import { loadPlanReviews } from './planReview';
import { listCheckins } from './wheelOfLifeApi';
import { readCache } from './pageCache';
import { tableReady } from './performance/tableReady';
import { ANSWERS_ON_DEVICE } from './performance/sprintReviewAnswers';

// Reads every saved plan and review for My Plans, My Reviews and the hubs'
// recent lists (Phase 4 step 4); savedItems.js names them. Each part is
// read on its own, so a table a database doesn't have yet (an older
// migration not run) leaves its rows out instead of the whole list. The
// list shows an error only when nothing at all could be read.

/** The device copies' names, shared by the lists and the hubs' recent rows. */
export const SAVED_PLANS_CACHE = 'saved-plans';
export const SAVED_REVIEWS_CACHE = 'saved-reviews';

async function part(label, read) {
  try {
    return { ok: true, rows: await read() };
  } catch (error) {
    console.error(`[savedItems] ${label} didn’t load:`, error);
    return { ok: false, rows: [] };
  }
}

async function rows(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

function allFailed(parts) {
  if (!parts.some((p) => p.ok)) throw new TypeError('Failed to fetch: nothing loaded');
}

/** Every saved plan: { decisions, planReviews, plans, sprints, dayPlans, missions }. */
export async function loadSavedPlans(userId) {
  const parts = await Promise.all([
    part('decisions', () => rows(supabase.from('decisions').select('*').eq('user_id', userId).order('created_at', { ascending: false }))),
    // Reviews of plans live in journal_entries (prompt 8); without them a
    // plan just shows no Reviewed tag.
    part('plan reviews', () => loadPlanReviews(userId)),
    part('plans', () => rows(supabase.from('performance_plans').select('id, status, major, minor, created_at, updated_at').eq('user_id', userId))),
    part('sprints', () => rows(supabase.from('sprints').select('id, number, label, start_on, status').eq('user_id', userId))),
    part('day plans', () => rows(supabase.from('day_plans')
      .select('id, local_date, status, grateful_for, way_of_being, biggest_risk, risk_response').eq('user_id', userId))),
    part('missions', () => rows(supabase.from('missions').select('id, title, created_at, updated_at, archived_at').eq('user_id', userId))),
  ]);
  allFailed(parts);
  const [decisions, planReviews, plans, sprints, dayPlans, missions] = parts.map((p) => p.rows);
  return {
    decisions,
    // Only what the list needs from each review: which plan, and whether a draft.
    planReviews: planReviews.map((r) => ({ id: r.id, status: r.status, data: { planKind: r.data?.planKind, planId: r.data?.planId, draft: r.data?.draft } })),
    plans,
    sprints,
    dayPlans,
    missions,
  };
}

/**
 * The end-of-sprint reviews' answers: sprint_reviews once migration 038 is
 * there, plus any still kept on this device (until it is, they stay here).
 */
async function loadSprintReviews(userId) {
  const kept = readCache(userId, ANSWERS_ON_DEVICE)?.v || {};
  const fromDevice = Object.entries(kept)
    .filter(([, a]) => a && (a.finishedAt || a.worked || a.next))
    .map(([sprintId, a]) => ({ sprint_id: sprintId, finished_at: a.finishedAt || null }));
  let fromTable = [];
  if (await tableReady('sprint_reviews').catch(() => null)) {
    fromTable = await rows(supabase.from('sprint_reviews').select('sprint_id, finished_at').eq('user_id', userId));
  }
  const ids = new Set(fromTable.map((r) => r.sprint_id));
  return [...fromTable, ...fromDevice.filter((r) => !ids.has(r.sprint_id))];
}

/** Every saved review: { entries, missionReviews, journals, checkins, dayReviews, debriefs, sprints, sprintReviews, hsCheckins }. */
export async function loadSavedReviews(userId) {
  const parts = await Promise.all([
    part('journal entries', () => rows(supabase.from('journal_entries').select('*').eq('user_id', userId))),
    part('POP reviews', async () => {
      const data = await rows(supabase.from('mission_progress_reviews').select('*').eq('user_id', userId));
      const versionIds = [...new Set(data.map((r) => r.plan_version_id).filter(Boolean))];
      let versions = {};
      if (versionIds.length) {
        const { data: found } = await supabase.from('mission_versions').select('id, major, minor').in('id', versionIds);
        versions = Object.fromEntries((found || []).map((v) => [v.id, v]));
      }
      return data.map((r) => {
        const v = versions[r.plan_version_id];
        return { id: r.id, status: r.status, created_at: r.created_at, review_data: { mission_title: r.review_data?.mission_title }, version: v ? formatVersion(v.major, v.minor) : null };
      });
    }),
    part('journals', () => rows(supabase.from('daily_journals').select('id, journal_date, status, created_at').eq('user_id', userId).eq('status', 'final'))),
    part('Life balance reviews', async () => {
      const { data, error } = await listCheckins();
      if (error) throw new Error(error.message);
      return (data || []).map((c) => ({ id: c.id, checkinAt: c.checkinAt, date: c.date, areas: c.areas, focusAreaKey: c.focusAreaKey }));
    }),
    part('day reviews', () => rows(supabase.from('day_reviews')
      .select('id, local_date, status, way_of_being_rating, where_it_showed, went_well, differently, tomorrow, on_my_mind').eq('user_id', userId))),
    part('debriefs', () => rows(supabase.from('weekly_debriefs')
      .select('id, sprint_id, sprint_week, status, stress, went_well, got_in_way, adjust').eq('user_id', userId))),
    part('sprints', () => rows(supabase.from('sprints').select('id, number, start_on, actual_end_on, planned_end_on').eq('user_id', userId))),
    part('sprint reviews', () => loadSprintReviews(userId)),
    // The Hardware and Software check-in (029's checkins; Phase 5). The
    // "checkins" above are the Life balance review's, an older name.
    part('Monthly Hardware and Software reviews', () => rows(supabase.from('checkins')
      .select('id, kind, month, status, finished_at, updated_at').eq('user_id', userId))),
  ]);
  // The device's own sprint reviews don't count: offline, the list keeps
  // what it showed last time instead of only those.
  allFailed(parts.slice(0, 7));
  const [entries, missionReviews, journals, checkins, dayReviews, debriefs, sprints, sprintReviews, hsCheckins] = parts.map((p) => p.rows);
  return { entries, missionReviews, journals, checkins, dayReviews, debriefs, sprints, sprintReviews, hsCheckins };
}
