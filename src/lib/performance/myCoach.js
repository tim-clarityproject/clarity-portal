import { supabase } from '../supabase';

/**
 * The person's own coach (my_coach), or null. Online only. contactWays
 * are the coach's allowed ways to be reached ('email', 'whatsapp',
 * 'imessage'; coaches.contact_ways), with the mobile they use.
 */
export async function loadMyCoach() {
  // One read per visit (Tim, 10 Nov: a page load was asking 8 or more
  // times, once for the header and once for each page's own loader). The
  // answer in flight, or already back, is reused for the same person until
  // the portal is next opened; a read that didn't work is forgotten, so
  // the next caller tries again.
  const { data: auth } = await supabase.auth.getSession();
  const userId = auth?.session?.user?.id || null;
  if (coachVisit.userId !== userId || !coachVisit.promise) {
    coachVisit.userId = userId;
    const promise = readMyCoach();
    coachVisit.promise = promise;
    promise.catch(() => { if (coachVisit.promise === promise) coachVisit.promise = null; });
  }
  return coachVisit.promise;
}

const coachVisit = { userId: null, promise: null };

async function readMyCoach() {
  const { data, error } = await supabase.rpc('my_coach');
  if (error) throw error;
  const c = Array.isArray(data) ? data[0] : data;
  return c ? {
    id: c.coach_id,
    firstName: c.first_name,
    awayUntil: c.away_until,
    mobile: c.mobile || null,
    contactWays: Array.isArray(c.contact_ways) ? c.contact_ways : [],
  } : null;
}
