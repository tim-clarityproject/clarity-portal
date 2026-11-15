import { supabase } from '../supabase';
import { claimOutsideWork as claimWith } from './claimRules.js';

// Work done without an account moves into the account made with the same,
// confirmed email, once per sign-in per tab (guest_claim, 035; and
// alignment_claim, 044): see claimRules.js.

/** Resolves { guest, healthChecks }: how many moved in. */
export function claimOutsideWork(userId) {
  return claimWith(userId, { rpc: (name) => supabase.rpc(name) });
}
