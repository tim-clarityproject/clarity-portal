import { supabase } from './supabase';

// Personal Operating Plan version history + plan reviews (prompt 9,
// per clarity-specs-9-to-11.md section A).
//
// Versioning lives entirely client-side (plain reads/writes into
// mission_versions, no DB function) - the spec prefers one
// transactional function but explicitly allows this ordered fallback.
// This schema has no stored procedures anywhere else, and nothing here
// can be rehearsed against the live database before the migration
// runs, so a function is the riskier choice. Saving a plan and saving
// its version are two separate calls: if the plan save succeeds but
// the version insert fails, the plan is NOT rolled back - callers
// should show "Plan saved, but your version history could not be
// updated." instead.
export const SCHEMA_VERSION = 1;

export const LIMITS = {
  mission: 70,
  strategyName: 80,
  strategyDescription: 280,
  tacticAction: 140,
  unit: 20,
  reviewNote: 500,
};

export function formatVersion(major, minor) {
  return `Version ${major}.${minor}`;
}

// No DB ids inside a snapshot - restoring an old version always
// creates brand new strategy/tactic rows (see restorePlanFromVersion).
export function buildSnapshot(title, strategies) {
  return {
    schema_version: SCHEMA_VERSION,
    mission: { title },
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

// Validate (spec 3.1 step 1): mission not empty and within its limit;
// every strategy named; every tactic has an action; every measurable
// tactic has a number 0-999,999,999,999. Returns the FIRST problem
// found, shaped so the caller can show it next to the right field.
export function validatePlan(title, strategies) {
  if (!title || !title.trim()) {
    return { field: 'mission', message: 'Your mission statement is required.' };
  }
  if (title.length > LIMITS.mission) {
    return { field: 'mission', message: `Keep your mission statement to ${LIMITS.mission} characters.` };
  }
  for (let si = 0; si < strategies.length; si++) {
    const s = strategies[si];
    if (!s.name || !s.name.trim()) {
      return { field: `strategy-${si}`, message: 'Give this strategy a name.' };
    }
    for (let ti = 0; ti < s.tactics.length; ti++) {
      const t = s.tactics[ti];
      if (!t.action || !t.action.trim()) {
        return { field: `tactic-${si}-${ti}`, message: 'Give this tactic an action.' };
      }
      if (t.type === 'measurable') {
        const n = Number(t.target_value);
        if (t.target_value === null || t.target_value === '' || Number.isNaN(n) || n < 0 || n > 999999999999) {
          return { field: `tactic-${si}-${ti}`, message: 'Enter a target between 0 and 999,999,999,999.' };
        }
      }
    }
  }
  return null;
}

function strategyNames(snapshot) {
  return (snapshot.strategies || []).map((s) => s.name);
}

// Automatic change description (spec 2.1/3.1): strategy identity for
// add/remove is by position-and-name match, as instructed; anything
// ambiguous falls through to "minor" rather than being lost.
function diffAndDescribe(prevSnapshot, nextSnapshot) {
  if (!prevSnapshot) return { changeType: 'start', changeNote: 'First Version.' };

  if (prevSnapshot.mission.title !== nextSnapshot.mission.title) {
    return { changeType: 'major', changeNote: 'Mission updated.' };
  }

  const prevNames = strategyNames(prevSnapshot);
  const nextNames = strategyNames(nextSnapshot);
  if (nextNames.some((n) => !prevNames.includes(n))) {
    return { changeType: 'major', changeNote: 'Strategy added.' };
  }
  if (prevNames.some((n) => !nextNames.includes(n))) {
    return { changeType: 'major', changeNote: 'Strategy removed.' };
  }

  const prevStrategies = prevSnapshot.strategies || [];
  const nextStrategies = nextSnapshot.strategies || [];
  let tacticAdded = false;
  let tacticRemoved = false;
  let otherChanged = false;

  for (let i = 0; i < nextStrategies.length; i++) {
    const ns = nextStrategies[i];
    const ps = prevStrategies.find((s) => s.name === ns.name) || prevStrategies[i];
    if (!ps) { otherChanged = true; continue; }
    if ((ps.description || '') !== (ns.description || '')) otherChanged = true;
    const pt = ps.tactics || [];
    const nt = ns.tactics || [];
    if (nt.length > pt.length) tacticAdded = true;
    if (nt.length < pt.length) tacticRemoved = true;
    const len = Math.min(pt.length, nt.length);
    for (let k = 0; k < len; k++) {
      if (pt[k].action !== nt[k].action || pt[k].type !== nt[k].type
        || pt[k].target_value !== nt[k].target_value || (pt[k].unit || '') !== (nt[k].unit || '')) {
        otherChanged = true;
      }
    }
  }

  if (tacticAdded) return { changeType: 'minor', changeNote: 'Tactic added.' };
  if (tacticRemoved) return { changeType: 'minor', changeNote: 'Tactic removed.' };
  if (otherChanged) return { changeType: 'minor', changeNote: 'Tactic or target updated.' };
  return { changeType: null, changeNote: null };
}

export async function loadLatestVersion(missionId) {
  const { data, error } = await supabase
    .from('mission_versions')
    .select('*')
    .eq('mission_id', missionId)
    .order('major', { ascending: false })
    .order('minor', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

export async function loadVersions(missionId) {
  const { data, error } = await supabase
    .from('mission_versions')
    .select('*')
    .eq('mission_id', missionId)
    .order('major', { ascending: false })
    .order('minor', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function insertVersion({ userId, missionId, major, minor, changeType, changeNote, snapshot, restoredFrom }) {
  const { error } = await supabase.from('mission_versions').insert({
    mission_id: missionId,
    user_id: userId,
    major,
    minor,
    change_type: changeType,
    change_note: changeNote,
    snapshot,
    restored_from: restoredFrom || null,
  });
  return error;
}

// Read-only preview of what saving right now would do (Edit page's
// live "Saving creates Version X.Y" / "No changes to save yet" line) -
// same rules as recordVersionAfterSave, but never writes anything.
export function previewNextVersion(latestVersion, title, strategies) {
  const nextSnapshot = buildSnapshot(title, strategies);
  const prevSnapshot = latestVersion?.snapshot || null;
  const { changeType } = diffAndDescribe(prevSnapshot, nextSnapshot);
  if (!latestVersion) return { major: 1, minor: 0, changeType: 'start' };
  if (!changeType) return { major: latestVersion.major, minor: latestVersion.minor, changeType: null };
  const major = changeType === 'major' ? latestVersion.major + 1 : latestVersion.major;
  const minor = changeType === 'major' ? 0 : latestVersion.minor + 1;
  return { major, minor, changeType };
}

// Called right after a plan save succeeds. Returns the version now in
// effect (existing or newly created) and whether anything actually
// changed, so the caller can show "Saved as Version X.Y." or "Plan
// saved. Nothing changed." Throws only the version-history insert
// error, never anything about the plan itself (the plan already
// saved). Retries once on a (mission_id, major, minor) race (spec
// section 5: "never overwrite a version").
export async function recordVersionAfterSave({ userId, missionId, title, strategies }) {
  const nextSnapshot = buildSnapshot(title, strategies);

  for (let attempt = 0; attempt < 2; attempt++) {
    const latest = await loadLatestVersion(missionId);
    const prevSnapshot = latest?.snapshot || null;
    const { changeType, changeNote } = diffAndDescribe(prevSnapshot, nextSnapshot);

    if (latest && !changeType) {
      return { major: latest.major, minor: latest.minor, created: false };
    }

    const major = !latest ? 1 : changeType === 'major' ? latest.major + 1 : latest.major;
    const minor = !latest ? 0 : changeType === 'major' ? 0 : latest.minor + 1;

    const error = await insertVersion({
      userId, missionId, major, minor, changeType: changeType || 'start', changeNote: changeNote || 'First Version.', snapshot: nextSnapshot,
    });
    if (!error) return { major, minor, created: true };
    if (error.code !== '23505' || attempt === 1) throw error;
    // Conflict: someone else saved a version between our read and our
    // insert - re-read the new latest and try once more.
  }
  throw new Error('Could not save version history - please try again.');
}

// Restoring always creates a brand new MAJOR version on top of
// whatever the latest version currently is (not the one being
// restored) - per spec, a restore is itself a plan change worth its
// own history entry.
export async function restorePlanFromVersion({ userId, missionId, version }) {
  const snapshot = version.snapshot;
  const { data: existingStrategies, error: loadError } = await supabase
    .from('strategies')
    .select('id')
    .eq('mission_id', missionId);
  if (loadError) throw loadError;
  for (const row of existingStrategies || []) {
    const { error } = await supabase.from('strategies').delete().eq('id', row.id);
    if (error) throw error;
  }

  const { error: titleError } = await supabase.from('missions').update({ title: snapshot.mission.title }).eq('id', missionId);
  if (titleError) throw titleError;
  await supabase.from('profiles').update({ personal_goal: snapshot.mission.title }).eq('id', userId);

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
  const major = (latest?.major || 0) + 1;
  const error = await insertVersion({
    userId, missionId, major, minor: 0, changeType: 'restore',
    changeNote: `Restored from ${formatVersion(version.major, version.minor)}.`,
    snapshot, restoredFrom: version.id,
  });
  if (error) throw error;
  return { major, minor: 0 };
}

// ---- Archived plans (dedicated page - spec 3.4, NOT profile settings) ----

export async function loadArchivedMissions(userId) {
  const { data, error } = await supabase
    .from('missions')
    .select('*')
    .eq('user_id', userId)
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false });
  if (error) throw error;
  const missions = data || [];
  return Promise.all(missions.map(async (mission) => {
    let latestVersion = null;
    try {
      latestVersion = await loadLatestVersion(mission.id);
    } catch (err) {
      console.error('[missionPlan] archived mission version lookup failed:', err);
    }
    const { count } = await supabase
      .from('mission_progress_reviews')
      .select('id', { count: 'exact', head: true })
      .eq('mission_id', mission.id);
    return { ...mission, latestVersion, reviewCount: count || 0 };
  }));
}

export async function countArchivedMissions(userId) {
  const { count } = await supabase
    .from('missions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .not('archived_at', 'is', null);
  return count || 0;
}

export async function archivePlan({ userId, missionId }) {
  const { error } = await supabase
    .from('missions')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', missionId)
    .eq('user_id', userId);
  if (error) throw error;
}

// Restore an archived plan (spec 3.4): if a live plan already exists
// it is archived first (so there is only ever one live plan), then the
// chosen mission is unarchived and becomes the live plan. No new
// version is created - the restored plan continues from its last one.
export async function restoreArchivedPlan({ userId, missionId }) {
  const { data: liveMissions } = await supabase
    .from('missions')
    .select('id')
    .eq('user_id', userId)
    .is('archived_at', null);

  for (const live of liveMissions || []) {
    if (live.id !== missionId) {
      const { error } = await supabase.from('missions').update({ archived_at: new Date().toISOString() }).eq('id', live.id);
      if (error) throw error;
    }
  }

  const { data: restored, error } = await supabase
    .from('missions')
    .update({ archived_at: null })
    .eq('id', missionId)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) throw error;

  await supabase.from('profiles').update({ personal_goal: restored.title }).eq('id', userId);
  return restored;
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
