import { supabase } from '../supabase';
import { isNetworkError } from '../connection';

// Tables Phase 3 adds in migration 038 (sprint_reviews, tool_work_strategies)
// are used only once Tim has run it. Until then the app keeps what they
// would hold on the device, with no error shown, and moves it across once
// the table is there.

const known = new Map(); // table -> true once it has answered

/** The database's answer for a table it doesn't have (PostgREST, or Postgres itself). */
export function isMissingTable(error) {
  const code = error?.code || '';
  return code === 'PGRST205' || code === '42P01' || /could not find the table|does not exist/i.test(`${error?.message || ''}`);
}

/**
 * Whether a table is there: true, false (not yet: 038 hasn't run), or null
 * when it can't be told (offline). Only "there" is remembered, so a table
 * Tim adds while the app is open is found on the next look.
 */
export async function tableReady(table) {
  if (known.get(table)) return true;
  const { error } = await supabase.from(table).select('id').limit(1);
  if (!error) {
    known.set(table, true);
    return true;
  }
  if (isMissingTable(error)) return false;
  if (isNetworkError(error)) return null;
  return null; // anything else: don't guess, keep the device copy
}
