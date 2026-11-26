import { useMemo } from 'react';
import { rowsOf } from '../../lib/coach/store';
import { boardStage } from '../../lib/coach/model';
import { withSessions } from '../../lib/coach/day';
import { useCoachPortal } from './parts';
import { associateSessionsKept, keptAssociateSessions } from '../../lib/coach/associateSessions';
import { associateNextStarts, nextSessionStarts } from './nextSessions';

// What the Clients list, board and table show for each client, worked out
// once: the profile, its current engagement, its tags and its stage. The
// owner's list also names associates' clients, from the admin facts only
// (name, coach, organisation, engagement and sessions): those rows can be
// moved to a coach, never opened.

/** The newest active engagement of a profile (or a group). */
export function currentEngagement(engagements, { profileId, groupId }) {
  return engagements
    .filter((e) => e.status !== 'ended' && (profileId ? e.profile_id === profileId : e.group_id === groupId))
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0] || null;
}

export function useClientRows({ past = false } = {}) {
  const { state, clients, admin, coach, isOwner, todayKey, coaches, sessions, sessionPeople, sessionsOlder, userId, now } = useCoachPortal();
  // Each client's next coaching session (Polish 1, Stage B): the coach's own sessions and who is in a group's, and for
  // the owner an associate's client from 058's sessions as the device last had them. Read again each minute (now).
  const minute = Math.floor(new Date(now || Date.now()).getTime() / 60000);
  return useMemo(() => {
    const at = minute * 60000;
    const nextOwn = nextSessionStarts(sessions, sessionPeople, at);
    const assocKnown = isOwner && !past && associateSessionsKept(userId);
    const nextTheirs = assocKnown ? associateNextStarts(keptAssociateSessions(userId), at) : new Map();
    const engagements = rowsOf(state, 'engagements');
    const packs = rowsOf(state, 'engagement_packs');
    const entries = rowsOf(state, 'time_entries');
    const links = rowsOf(state, 'coach_tag_links').filter((l) => l.item_kind === 'client');
    const values = rowsOf(state, 'coach_field_values');
    const own = clients.filter((p) => (past ? p.status === 'past' : p.status !== 'past')).map((p) => {
      // Sessions left follows each recorded session (day.js's withSessions): the list, the board and the table read it here.
      const engagement = withSessions(currentEngagement(engagements, { profileId: p.id }), sessions, sessionPeople, sessionsOlder);
      return { profile: p, engagement, tags: links.filter((l) => l.item_id === p.id).map((l) => l.tag_id), stage: boardStage(p, engagement, packs, todayKey), nextAt: nextOwn.get(p.id) || null, admin: false };
    });
    const mine = new Set(clients.map((p) => p.id));
    const theirs = isOwner && !past ? admin.filter((a) => a.coach_id !== coach.id && !mine.has(a.profile_id) && a.status !== 'past').map((a) => {
      const profile = { id: a.profile_id, name: a.name, organisation_id: a.organisation_id, coach_id: a.coach_id, status: a.status, stage: null };
      const engagement = a.engagement_kind ? { id: `admin-${a.profile_id}`, kind: a.engagement_kind, sessions_total: a.sessions_total, sessions_held: a.sessions_held, time_credit_minutes: a.time_credit_minutes, ends_on: a.ends_on } : null;
      const who = coaches.find((c) => c.coach_id === a.coach_id)?.first_name || a.coach_first_name;
      return { profile, engagement, tags: [], stage: boardStage(profile, engagement, [], todayKey), nextAt: nextTheirs.get(`${a.coach_id}|${a.name}`) || null, nextKnown: assocKnown, admin: true, coachName: who };
    }) : [];
    return { rows: [...own, ...theirs], packs, entries, values, engagements };
  }, [state, clients, admin, coach, isOwner, todayKey, coaches, past, sessions, sessionPeople, sessionsOlder, userId, minute]);
}
