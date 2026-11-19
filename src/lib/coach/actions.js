import { supabase } from '../supabase';
import { coachReady, forgetRows, keyOf, loadCoach, newId, noteRows, removeRow, rowsOf, saveRow, saveRows } from './store';
import { clean, mergedProfile } from './model';

// What the coach portal does that is more than saving one row (Phase 6a
// run 1). Each goes through the database's own checked function once 049
// is there (so the rules, the Activity log and the history are the
// database's), and is done on the device's copy before that, where one
// coach working alone can do it: merge, Undo, delete. What needs two
// coaches (Move to a coach, approving a profile) waits for 049 and says so.

export const NEEDS_049 = 'This will work once the coach portal’s tables are in place.';

function refuse(error) {
  // The database's own sentence is written for people (049's functions).
  const e = new Error(error?.message || 'That didn’t work.');
  e.code = error?.code;
  return e;
}

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw refuse(error);
  return data;
}

/** The coaches there are: the owner gets each one's facts, an associate only names. */
export async function loadCoaches() {
  if ((await coachReady()) === true) return (await rpc('coach_list')) || [];
  const { data, error } = await supabase.from('coaches').select('*');
  if (error) throw refuse(error);
  return (data || []).map((c) => ({ coach_id: c.id, first_name: c.display_first_name, full_name: c.full_name || null, role: c.role, active: c.active, is_me: false, clients: null, hourly_rate: null, rate_currency: null, profile_waiting: false, user_id: c.user_id }));
}

/** The owner's admin facts for every client (name, coach, engagement); empty before 049. */
export async function loadAdminClients() {
  if ((await coachReady()) !== true) return [];
  return (await rpc('coach_admin_clients')) || [];
}

/** A coach's own name clients see, full name, mobile and ways to reach them. */
export async function saveCoachDetails(coach, change) {
  const next = { ...coach, ...change };
  if ((await coachReady()) === true) {
    await rpc('coach_save_details', { p_first_name: next.display_first_name, p_full_name: next.full_name || null, p_mobile: next.mobile || null, p_contact_ways: next.contact_ways || [] });
    return;
  }
  // Before 049 there is no full name to keep, and only the owner may change a coach's row (026).
  const { error } = await supabase.from('coaches').update({ display_first_name: next.display_first_name, mobile: next.mobile || null, contact_ways: next.contact_ways || [] }).eq('id', coach.id);
  if (error) throw refuse(error);
}

/** The owner's facts about a coach: what they are paid an hour and the hours a week they aim for. */
export async function saveCoachFacts(coachId, change) {
  if ((await coachReady()) !== true) throw new Error(NEEDS_049);
  const { error } = await supabase.from('coaches').update(change).eq('id', coachId);
  if (error) throw refuse(error);
}

/**
 * Add a coach (owner): asks the server to make their account and send the
 * branded invite. Nothing is sent from a preview or a developer's machine;
 * the answer says which happened.
 */
export async function addCoach({ firstName, fullName, email }) {
  const { data: session } = await supabase.auth.getSession();
  const token = session?.session?.access_token;
  let res;
  try {
    res = await fetch('/api/coach-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ firstName, fullName, email }),
    });
  } catch {
    throw new Error('Adding a coach needs a connection, so try again when you’re back online.');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) throw new Error(body?.message || 'That didn’t work. Try again in a moment.');
  return body;
}

/** Move to a coach (owner). Resolves the coach the client had, for Undo. */
export async function moveClient(userId, profileId, toCoachId) {
  if ((await coachReady()) !== true) throw new Error(NEEDS_049);
  const from = await rpc('client_move', { p_profile: profileId, p_to_coach: toCoachId });
  await loadCoach(userId);
  return from;
}

export async function decideProfile(coachId, approve) {
  if ((await coachReady()) !== true) throw new Error(NEEDS_049);
  await rpc('coach_profile_decide', { p_coach: coachId, p_approve: approve });
}

export async function switchCoach(coachId, on) {
  if ((await coachReady()) !== true) throw new Error(NEEDS_049);
  await rpc('coach_switch', { p_coach: coachId, p_active: on });
}

/** Records something in the Activity log (an export). Quiet when it can't. */
export async function logActivity(userId, coach, kind, summary) {
  try {
    if ((await coachReady()) === true) await rpc('log_activity', { p_kind: kind, p_summary: summary });
    else await saveRow(userId, 'activity_log', { id: newId(), actor_id: userId, actor_name: coach?.full_name || coach?.display_first_name || '', kind, summary, item: {} });
  } catch { /* the export itself still happened */ }
}

/** The owner adds a client for another coach, through the checked function (it can't be a plain save). */
export async function addClientFor(coachId, profile) {
  if ((await coachReady()) !== true) throw new Error(NEEDS_049);
  return rpc('client_add_for', { p_coach: coachId, p_id: profile.id, p_name: profile.name, p_email: profile.email, p_organisation: profile.organisation_id, p_time_zone: profile.time_zone, p_frequent_traveller: profile.frequent_traveller, p_referred_by: profile.referred_by });
}

/** Invite to the portal: records that the coach pressed it. Nothing is sent from here. */
export async function inviteClient(userId, profile) {
  if (!profile.email) throw new Error('Add an email first.');
  if ((await coachReady()) === true) {
    await rpc('client_invite', { p_profile: profile.id });
    await loadCoach(userId);
    return;
  }
  await saveRow(userId, 'client_profiles', { ...profile, invited_at: new Date().toISOString() });
}

// The rows of a table that hang off a profile, and the column they hang by.
const HANGS = [['client_notes', 'profile_id'], ['client_files', 'profile_id'], ['engagements', 'profile_id'], ['coach_group_members', 'profile_id']];

/**
 * Merge two of the coach's own clients into one. `values` names the fields
 * to take from the one merged away. Resolves what Undo needs.
 */
export async function mergeClients(userId, state, keepId, dropId, values = {}) {
  if (keepId === dropId) throw new Error('Choose two different people to merge.');
  if ((await coachReady()) === true) {
    const mergeId = await rpc('client_merge', { p_keep: keepId, p_drop: dropId, p_values: values });
    await loadCoach(userId);
    return { mergeId };
  }
  const keep = state.rows.client_profiles?.[keepId];
  const drop = state.rows.client_profiles?.[dropId];
  if (!keep || !drop || keep.merged_into || drop.merged_into) throw new Error('One of these has already been merged.');
  const before = [['client_profiles', keep], ['client_profiles', drop]];
  const pairs = [['client_profiles', mergedProfile(keep, drop, values)], ['client_profiles', { ...drop, merged_into: keepId, user_id: null }]];
  for (const [table, col] of HANGS) {
    for (const row of rowsOf(state, table).filter((r) => r[col] === dropId)) {
      before.push([table, row]);
      pairs.push([table, { ...row, [col]: keepId }]);
    }
  }
  const removed = [];
  const keepTags = new Set(rowsOf(state, 'coach_tag_links').filter((l) => l.item_kind === 'client' && l.item_id === keepId).map((l) => l.tag_id));
  for (const link of rowsOf(state, 'coach_tag_links').filter((l) => l.item_kind === 'client' && l.item_id === dropId && !keepTags.has(l.tag_id))) {
    removed.push(['coach_tag_links', link]);
    pairs.push(['coach_tag_links', { ...link, item_id: keepId }]);
  }
  const keepFields = new Set(rowsOf(state, 'coach_field_values').filter((v) => v.item_id === keepId).map((v) => v.field_id));
  for (const v of rowsOf(state, 'coach_field_values').filter((x) => x.item_id === dropId && !keepFields.has(x.field_id))) {
    removed.push(['coach_field_values', v]);
    pairs.push(['coach_field_values', { ...v, item_id: keepId }]);
  }
  const about = rowsOf(state, 'client_about');
  if (!about.some((a) => a.profile_id === keepId)) {
    for (const a of about.filter((x) => x.profile_id === dropId)) {
      removed.push(['client_about', a]);
      pairs.push(['client_about', { ...a, profile_id: keepId }]);
    }
  }
  // A row named by the profile it is on moves by being made again under the other.
  for (const [table, row] of removed) await removeRow(userId, table, keyOf(table, row));
  await saveRows(userId, pairs);
  return { device: { before, removed, made: pairs.filter(([t]) => ['coach_tag_links', 'coach_field_values', 'client_about'].includes(t)) } };
}

/** Undo for a merge. */
export async function unmergeClients(userId, undo) {
  if (undo.mergeId) {
    await rpc('client_unmerge', { p_merge: undo.mergeId });
    await loadCoach(userId);
    return;
  }
  for (const [table, row] of undo.device.made) await removeRow(userId, table, keyOf(table, row));
  await saveRows(userId, [...undo.device.before, ...undo.device.removed]);
}

/** Delete a client's data: the name is typed first. It can't be undone. */
export async function deleteClient(userId, state, profile, typedName) {
  if (clean(typedName) !== clean(profile.name)) throw new Error('Type the name exactly to carry on.');
  const parts = [];
  for (const [table, col] of [...HANGS, ['client_about', 'profile_id'], ['client_view_requests', 'profile_id'], ['coach_cover', 'profile_id']]) {
    for (const row of rowsOf(state, table).filter((r) => r[col] === profile.id)) parts.push([table, keyOf(table, row)]);
  }
  for (const l of rowsOf(state, 'coach_tag_links').filter((x) => x.item_kind === 'client' && x.item_id === profile.id)) parts.push(['coach_tag_links', keyOf('coach_tag_links', l)]);
  for (const v of rowsOf(state, 'coach_field_values').filter((x) => x.item_id === profile.id)) parts.push(['coach_field_values', keyOf('coach_field_values', v)]);
  if ((await coachReady()) === true) {
    await rpc('client_delete', { p_profile: profile.id, p_typed_name: typedName });
    forgetRows(userId, [...parts, ['client_profiles', profile.id]]);
    await loadCoach(userId);
    return;
  }
  for (const [table, key] of parts) await removeRow(userId, table, key);
  await removeRow(userId, 'client_profiles', profile.id);
  await saveRows(userId, [
    ['data_requests', { id: newId(), coach_id: profile.coach_id, profile_id: null, person_name: profile.name, kind: 'delete', requested_on: new Date().toISOString().slice(0, 10), done_at: new Date().toISOString() }],
    ['activity_log', { id: newId(), actor_id: userId, actor_name: '', kind: 'delete', summary: `deleted ${profile.name}’s data.`, item: {} }],
  ]);
}

/** A workshop's public page, by its key. Null when there is no such page. */
export async function loadWorkshopPage(key) {
  const { data, error } = await supabase.rpc('workshop_page', { p_key: key });
  if (error) throw refuse(error);
  return data;
}

export async function registerForWorkshop(key, name, email, answers) {
  const { data, error } = await supabase.rpc('workshop_register', { p_key: key, p_name: name, p_email: email, p_answers: answers });
  if (error) throw refuse(error);
  return data;
}

export async function loadWorkshopSurvey(key) {
  const { data, error } = await supabase.rpc('workshop_survey', { p_key: key });
  if (error) throw refuse(error);
  return data;
}

export async function answerWorkshopSurvey(key, answers) {
  const { data, error } = await supabase.rpc('workshop_survey_answer', { p_key: key, p_answers: answers });
  if (error) throw refuse(error);
  return data;
}

export { noteRows };
