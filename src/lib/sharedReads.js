import { supabase } from './supabase';

// One select per table for the reads several parts of a page make of the
// person's own row (the scale check, fixer C; 22 Nov 2026). The header
// (AuthContext, MissionContext), the menu (menuPins.js) and the pages'
// loaders (performance/api.js) each asked for the same row with their own
// columns, so Home sent three reads of profiles and two or three of
// person_settings. Asked for here with one column list, the reads are the
// same address, so readShare.js sends one and hands each its copy.
//
// Every column here is from migration 024 or 026, so none can be missing
// on a database the portal runs on. Each caller takes only what it needs.

const PROFILE_COLS = 'email, first_name, last_name, terms_accepted, show_mission_in_header';
const SETTINGS_COLS = 'user_id, time_zone, units, describes_you, page_preferences, updated_at';

/** The person's own profiles row, as one shared read (an array of at most one row). */
export function ownProfileQuery(userId) {
  return supabase.from('profiles').select(PROFILE_COLS).eq('id', userId).limit(1);
}

/** The person's own person_settings row, as one shared read (an array of at most one row). */
export function ownSettingsQuery(userId) {
  return supabase.from('person_settings').select(SETTINGS_COLS).eq('user_id', userId).limit(1);
}
