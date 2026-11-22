import { supabase } from '../supabase';
import { coachCrmReady, loadCoach, noteRows } from './store';
import { CHANGED_ELSEWHERE_CODE } from './model.js';

// The CRM's few checked functions (migration 052; Phase 6a run 4), each
// asked only once 052 is there. Before that every one resolves null, and
// the page does the same thing device first with the rules in crm.js and
// the store's saveRows: nothing here ever shows an error for "not yet".
//
// Everything else of Leads, boards, automations, emails, check-ins and the
// account map is plain rows in the coach store (useCoachPortal()).
// Network's people are in networkData.js.

const ready = async () => (await coachCrmReady()) === true;

/**
 * The five starting stages (New 10%, Call booked 25%, Proposal sent 50%,
 * Deciding 70%, Won 100%), made once by the database, which also puts any
 * lead a booking made into the first.
 * @returns {Promise<object[]|null>} the owner's stages in order; null before 052 (make them with saveRows)
 */
export async function leadStagesStart(userId) {
  if (!(await ready())) return null;
  const { data, error } = await supabase.rpc('coach_lead_stages_start');
  if (error) throw error;
  noteRows(userId, (data || []).map((row) => ['coach_lead_stages', row]));
  await loadCoach(userId);
  return data || [];
}

/**
 * The keys of the owner's two addresses (kind 'log': the copy-in address;
 * kind 'todo': forward emails to to-dos), made once by the database.
 * @returns {Promise<object[]|null>} null before 052: there is no address yet
 */
export async function emailAddressesStart(userId) {
  if (!(await ready())) return null;
  const { data, error } = await supabase.rpc('coach_email_addresses_start');
  if (error) throw error;
  noteRows(userId, (data || []).map((row) => ['coach_email_addresses', row]));
  return data || [];
}

/**
 * Logs one email as the database does (kept once; put on the timeline of
 * everyone it names who is a lead, a client, a Network person or a contact;
 * anyone else on its To or From line waits on Leads).
 * @param {object} email { external_id, source, direction, from, to, cc, subject, snippet, body, sent_at, thread_key, link }
 * @returns {Promise<{ email_id: string, new: boolean, links: number, waiting: number }|null>} null before 052
 */
export async function logEmail(userId, email) {
  if (!(await ready())) return null;
  const { data, error } = await supabase.rpc('coach_email_add', { p_email: email });
  if (error) throw error;
  await loadCoach(userId);
  return data;
}

/**
 * Merges two leads into one in the database (timelines, to-dos, emails,
 * tags and fields join). `values` names the fields to keep from the one
 * merged away. Returns the merge's id: leadUnmerge(id) is its Undo.
 * @returns {Promise<string|null>} null before 052
 */
export async function leadMerge(userId, keepId, dropId, values = {}) {
  if (!(await ready())) return null;
  const { data, error } = await supabase.rpc('lead_merge', { p_keep: keepId, p_drop: dropId, p_values: values });
  if (error) throw error;
  await loadCoach(userId);
  return data;
}

/** The Undo of a merge: both leads are put back exactly as they were. Resolves false before 052. */
export async function leadUnmerge(userId, mergeId) {
  if (!(await ready())) return false;
  const { error } = await supabase.rpc('lead_unmerge', { p_merge: mergeId });
  if (error) throw error;
  await loadCoach(userId);
  return true;
}

/**
 * Undo Won, Undo Cold, or bring a cold lead back (run 6, item 8). From 054
 * an ordinary save never takes a lead's Won or Cold away (a tab left open
 * would otherwise undo one set in another tab), so this asks the database
 * first, and only while the lead is still Won (or Cold) at the moment this
 * tab saw it set. Resolves 'undone' (the page then saves the lead as it
 * was, as before), or 'device' before 052 and 'older' before 054 (nothing
 * guards it there). Rejects with code CC409 when the lead changed in
 * another tab, which crmProblem says calmly; nothing is undone.
 * @param {object} lead the lead as this tab saw it Won or Cold (its won_at or cold_at)
 * @param {'won'|'cold'} kind
 * @returns {Promise<'undone'|'device'|'older'>}
 */
export async function leadUnsettle(userId, lead, kind) {
  if (!(await ready())) return 'device';
  const at = kind === 'won' ? lead?.won_at : lead?.cold_at;
  if (!at) return 'undone';
  const { data, error, status } = await supabase.rpc('lead_unsettle', { p_lead: lead.id, p_kind: kind, p_at: at });
  if (error && (error.code === 'PGRST202' || status === 404)) return 'older';
  if (error) throw error;
  if (data === 'changed') {
    loadCoach(userId).catch(() => {});
    throw Object.assign(new Error(''), { code: CHANGED_ELSEWHERE_CODE });
  }
  return 'undone';
}
