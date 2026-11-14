import { supabase } from '../supabase';
import { cleanCode } from './rules';

// Guest links (migration 035: any tool without an account, through a
// coach's link). The page reaches the guest's own rows only through 035's
// checked functions, exactly as they are written:
//
//   guest_open(p_token, p_email, p_code)
//     -> { ok: true, visit, tool, tool_label, coach_name, link_expires_at, confirmed }
//     -> { ok: false, error: 'invalid' | 'locked' | 'closed' | 'has_account', message }
//   guest_rows(p_visit, p_table)            -> [row…] (each with _from)
//   guest_save(p_visit, p_table, p_row)     -> the saved row
//   guest_delete_link_answers(p_visit)      -> how many rows went
//   guest_finish(p_visit)                   -> true
// and migration 042's, for the start page before the code is typed:
//   guest_link_info(p_token) -> { ok: true, tool, tool_label, coach_name, open } | { ok: false }
//
// The link is /guest/<token> (guest_link_create's link_path): 64
// characters, 0 to 9 and a to f. The code is 6 characters with no 0, O, 1,
// I or L. The visit key the database hands back is kept for this tab only
// (sessionStorage), never in the address.
//
// Until Tim has run 035 the functions aren't there: every call then fails
// calmly, with one line (guestError), and nothing is kept.

export * from './rules';

async function call(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}

/**
 * What the start page says before the code is typed: the tool and the
 * coach's first name. Null when it can't be asked (042 not run yet, no
 * connection, a link the database doesn't know): the page then says "your
 * coach", and opening the link still gives the real answer.
 */
export async function guestLinkInfo(token) {
  try {
    const info = await call('guest_link_info', { p_token: token });
    return info && info.ok ? { tool: info.tool, toolLabel: info.tool_label || '', coachName: (info.coach_name || '').trim(), open: info.open !== false } : null;
  } catch {
    return null;
  }
}

export function guestOpen(token, email, code) {
  return call('guest_open', { p_token: token, p_email: email, p_code: cleanCode(code) });
}

export async function guestRows(visit, table = 'decisions') {
  const rows = await call('guest_rows', { p_visit: visit, p_table: table });
  return Array.isArray(rows) ? rows : [];
}

export function guestSave(visit, table, row) {
  return call('guest_save', { p_visit: visit, p_table: table, p_row: row });
}

export function guestDeleteLinkAnswers(visit) {
  return call('guest_delete_link_answers', { p_visit: visit });
}

export function guestFinish(visit) {
  return call('guest_finish', { p_visit: visit });
}

