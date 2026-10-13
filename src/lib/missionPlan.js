import { supabase } from './supabase';

// Personal Operating Plan version history + plan reviews (prompt 9).
//
// Versioning lives entirely client-side (plain reads/writes into
// mission_versions, no DB function) - this schema has no stored
// procedures anywhere else, and nothing here can be rehearsed against
// the live database before the migration runs, so a function is the
// riskier choice. Saving a plan and saving its version are two
// separate calls: if the plan save succeeds but the version insert
// fails, the plan is NOT rolled back - callers should show "Plan
// saved, but your version history could not be updated." instead.
export const SCHEMA_VERSION = 1;

export function formatVersion(major, minor) {
  return `Version ${major}.${minor}`;
}

// No DB ids inside a snapshot - restoring an old version always
// creates brand new strategy/tactic rows (see restorePlanFromVersion).
export function buildSnapshot(title, strategies) {
  return {
    schema_version: SCHEMA_VERSION,
    title,
    strategies: (strategies || []).map((s, si) => ({
      name: s.name,
      description: s.description || '',
      sort_order: si,
      tactics: (s.tactics || []).map((t, ti) => ({
        action: t.action,
        type: t.type,
        target_value: t.type === 'measurable' ? (t.target_value ?? null) : null,
        unit: t.type === 'measurable' ? (t.unit || '') : null,
        current_value: t.type === 'measurable' ? (t.current_value ?? null) : null,
        is_done: t.type === 'tickable' ? !!t.is_done : null,
        sort_order: ti,
      })),
    })),
  };
}

function strategyNameSet(snapshot) {
  return (snapshot.strategies || []).map((s) => s.name).sort().join('');
}

// current_value/is_done are stripped before comparing: ticking a box
// or logging a number is progress, not a plan change, and must never
// create a new version.
function stripProgress(snapshot) {
  return JSON.stringify({
    title: snapshot.title,
    strategies: (snapshot.strategies || []).map((s) => ({
      name: s.name,
      description: s.description,
      sort_order: s.sort_order,
      tactics: (s.tactics || []).map((t) => ({
        action: t.action, type: t.type, target_value: t.target_value, unit: t.unit, sort_order: t.sort_order,
      })),
    })),
  });
}

// MAJOR: mission statement changed, or a strategy was added/removed.
// MINOR: any other structural change (name/description/tactics edited,
// reordered, tactic added/removed). null: nothing structural changed
// (progress-only, or no change at all) - no version row is written.
export function diffSnapshots(prevSnapshot, nextSnapshot) {
  if (!prevSnapshot) return 'major';
  if (prevSnapshot.title !== nextSnapshot.title) return 'major';
  if (strategyNameSet(prevSnapshot) !== strategyNameSet(nextSnapshot)) return 'major';
  if (stripProgress(prevSnapshot) === stripProgress(nextSnapshot)) return null;
  return 'minor';
}

export async function loadLatestVersion(missionId) {
  const { data, error } = await supabase
    .from('mission_versions')
    .select('*')
    .eq('mission_id', missionId)
    .order('version_major', { ascending: false })
    .order('version_minor', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

export async function loadVersions(missionId) {
  const { data, error } = await supabase
    .from('mission_versions')
    .select('*')
    .eq('mission_id', missionId)
    .order('version_major', { ascending: false })
    .order('version_minor', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Called right after a plan save succeeds. Returns the version now in
// effect (existing or newly created) so the caller can show "Saved as
// Version X.Y." Throws only the version-history insert error, never
// anything about the plan itself (the plan already saved).
export async function recordVersionAfterSave({ userId, missionId, title, strategies }) {
  const nextSnapshot = buildSnapshot(title, strategies);
  const latest = await loadLatestVersion(missionId);
  const prevSnapshot = latest?.snapshot || null;
  const bump = diffSnapshots(prevSnapshot, nextSnapshot);

  if (!latest) {
    const { error } = await supabase.from('mission_versions').insert({
      mission_id: missionId, user_id: userId, version_major: 1, version_minor: 0, snapshot: nextSnapshot,
    });
    if (error) throw error;
    return { major: 1, minor: 0, created: true };
  }

  if (!bump) return { major: latest.version_major, minor: latest.version_minor, created: false };

  const major = bump === 'major' ? latest.version_major + 1 : latest.version_major;
  const minor = bump === 'major' ? 0 : latest.version_minor + 1;
  const { error } = await supabase.from('mission_versions').insert({
    mission_id: missionId, user_id: userId, version_major: major, version_minor: minor, snapshot: nextSnapshot,
  });
  if (error) throw error;
  return { major, minor, created: true };
}

// Restoring always creates a brand new MAJOR version on top of
// whatever the latest version currently is (not the one being
// restored) - per spec, a restore is itself a plan change worth its
// own history entry.
export async function restorePlanFromVersion({ userId, missionId, snapshot }) {
  const { data: existingStrategies, error: loadError } = await supabase
    .from('strategies')
    .select('id')
    .eq('mission_id', missionId);
  if (loadError) throw loadError;
  for (const row of existingStrategies || []) {
    const { error } = await supabase.from('strategies').delete().eq('id', row.id);
    if (error) throw error;
  }

  const { error: titleError } = await supabase.from('missions').update({ title: snapshot.title }).eq('id', missionId);
  if (titleError) throw titleError;
  await supabase.from('profiles').update({ personal_goal: snapshot.title }).eq('id', userId);

  for (let si = 0; si < (snapshot.strategies || []).length; si++) {
    const s = snapshot.strategies[si];
    const { data: newStrategy, error } = await supabase
      .from('strategies')
      .insert({ mission_id: missionId, name: s.name, description: s.description, sort_order: si })
      .select()
      .single();
    if (error) throw error;
    for (let ti = 0; ti < (s.tactics || []).length; ti++) {
      const t = s.tactics[ti];
      const { error: tacticError } = await supabase.from('tactics').insert({
        strategy_id: newStrategy.id,
        action: t.action,
        type: t.type,
        target_value: t.target_value,
        unit: t.unit,
        current_value: t.current_value,
        is_done: t.is_done,
        sort_order: ti,
      });
      if (tacticError) throw tacticError;
    }
  }

  const latest = await loadLatestVersion(missionId);
  const major = (latest?.version_major || 0) + 1;
  const { error: versionError } = await supabase.from('mission_versions').insert({
    mission_id: missionId, user_id: userId, version_major: major, version_minor: 0, snapshot,
  });
  if (versionError) throw versionError;
  return { major, minor: 0 };
}

// ---- Plan reviews (mission_progress_reviews) ----
// A review is either a 'draft' (one at most per mission, upserted in
// place) or 'final' (a permanent dated snapshot, never edited into a
// different id). status/plan_version_id/updated_at are new columns
// (migration 014, not yet run) - every call here can fail until then;
// callers treat that failure the same way every other not-yet-run
// migration in this app is handled (an inline message, nothing crashes).
export async function loadDraftReview(userId, missionId) {
  const { data, error } = await supabase
    .from('mission_progress_reviews')
    .select('*')
    .eq('user_id', userId)
    .eq('mission_id', missionId)
    .eq('status', 'draft')
    .order('updated_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

export async function loadReview(userId, reviewId) {
  const { data, error } = await supabase
    .from('mission_progress_reviews')
    .select('*')
    .eq('id', reviewId)
    .eq('user_id', userId)
    .single();
  if (error) throw error;
  return data;
}

export async function saveReview({ userId, missionId, planVersionId, reviewData, status, existingId }) {
  const payload = {
    mission_id: missionId,
    user_id: userId,
    review_data: reviewData,
    plan_version_id: planVersionId || null,
    status,
    updated_at: new Date().toISOString(),
  };
  if (existingId) {
    const { data, error } = await supabase
      .from('mission_progress_reviews')
      .update(payload)
      .eq('id', existingId)
      .eq('user_id', userId)
      .select();
    if (error) throw error;
    if (!data || data.length === 0) throw new Error('Could not find this review to update.');
    return data[0].id;
  }
  const { data, error } = await supabase
    .from('mission_progress_reviews')
    .insert(payload)
    .select();
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('Save did not return a review.');
  return data[0].id;
}

export async function deleteReview(userId, reviewId) {
  const { error } = await supabase
    .from('mission_progress_reviews')
    .delete()
    .eq('id', reviewId)
    .eq('user_id', userId);
  if (error) throw error;
}
