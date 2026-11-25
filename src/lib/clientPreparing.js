import { useEffect } from 'react';
import { useCachedLoad } from './pageCache';
import { setPortalPreparing, usePortalPreparing } from './portalPreparing';
import { loadActivePlan } from './performance/api';
import { loadMyCoach } from './performance/myCoach';
import { loadAgreements } from './coaching/agreements';
import { loadMySessions } from './coach/bookingActions';
import { isPreparing } from './preparingRule.js';

// "A brand-new client" (polish 1): a coaching client whose coach hasn't set anything up yet sees
// "Your portal is still being prepared." on every page that would be empty, and the menu shows
// Home and My Account only (setPortalPreparing, src/lib/portalPreparing.js).
//
// What truly means "not set up yet", from the client's own reads (the database decides what they
// see): they have a coach (my_coach), and the coach has sent them nothing: no agreement, sent or
// signed (my_agreements), no coaching session booked (my_sessions_coming), and no plan of their
// own (the active Individual Performance Plan). Sam, a client under way, has an agreement and
// sessions, so never matches; someone with no coach never matches either (they build their own
// plan from Home). A read that didn't answer counts as "not known", never as preparing.

export { isPreparing };

export const PREPARING_CACHE = 'portal-preparing';

async function readFacts(userId) {
  const known = (p) => p.then((v) => v, () => undefined);
  const [coach, plan, agreements, sessions] = await Promise.all([
    known(loadMyCoach()),
    known(loadActivePlan(userId)),
    known(loadAgreements(userId)),
    known(loadMySessions()),
  ]);
  return {
    hasCoach: coach === undefined ? null : Boolean(coach),
    hasPlan: plan === undefined ? null : Boolean(plan),
    // Before 061 (no agreements on the database) nothing can be said either way.
    hasAgreement: agreements === undefined || !agreements.ready ? null : agreements.agreements.length > 0,
    hasSessions: sessions === undefined || !sessions.there ? null : sessions.data.length > 0,
    coachName: coach?.firstName || null,
  };
}

/**
 * Works the rule out for the signed-in client (the device's copy first, then fresh), tells the
 * frame (menu: Home and My Account only) and returns { preparing, known, coachName }.
 */
export function useClientPreparing(userId) {
  const facts = useCachedLoad({ userId, name: PREPARING_CACHE, load: () => readFacts(userId) });
  const preparing = Boolean(facts.data && isPreparing(facts.data));
  useEffect(() => {
    if (!facts.data) return;
    setPortalPreparing(preparing);
  }, [facts.data, preparing]);
  return { preparing, known: Boolean(facts.data), coachName: facts.data?.coachName || null };
}

export { usePortalPreparing };
