// Each client's next coaching session, for the Clients list, board and table (Polish 1, Stage B: every client read
// "Not booked" because the list never looked; clientData.js's nextAt was always null). Pure, so it is tested on its
// own (tests/performance/coach-next-session.test.mjs).
//
// A session counts while it is still to come or under way (it hasn't ended), and while nothing has been written up
// about it: a cancelled, moved or no-show one never does (day.js's nextSession reads it the same way). A client is in a
// session when it is theirs (profile_id) or when they are one of its people (a group's call, coach_session_people).

const endsAt = (s) => new Date(s.starts_at).getTime() + (Number(s.minutes) || 0) * 60000;

/**
 * The soonest session still to come for every client, as a Map of profile id to its start (the saved timestamp).
 * @param {{ id, profile_id?, starts_at, minutes?, outcome? }[]} sessions the coach's own
 * @param {{ session_id, profile_id }[]} people who is in each session (a group's)
 * @param {Date|number|string} now
 */
export function nextSessionStarts(sessions = [], people = [], now = Date.now()) {
  const t = new Date(now).getTime();
  const whose = new Map();
  for (const p of people || []) {
    if (!p?.session_id || !p.profile_id) continue;
    if (!whose.has(p.session_id)) whose.set(p.session_id, new Set());
    whose.get(p.session_id).add(p.profile_id);
  }
  const next = new Map();
  for (const s of sessions || []) {
    if (!s?.starts_at || s.outcome || !(endsAt(s) > t)) continue;
    const start = new Date(s.starts_at).getTime();
    if (Number.isNaN(start)) continue;
    const ids = new Set(whose.get(s.id) || []);
    if (s.profile_id) ids.add(s.profile_id);
    for (const id of ids) {
      const had = next.get(id);
      if (!had || start < new Date(had).getTime()) next.set(id, s.starts_at);
    }
  }
  return next;
}

/**
 * The owner's view of an associate's client: 058's sessions name the client, not their id, so a session is theirs
 * when its coach and its client's name match the row's (the owner's admin facts carry no more).
 * @param {{ coach_id, client_name, starts_at, minutes? }[]} assoc
 * @returns {Map<string, string>} keyed `${coach_id}|${name}`
 */
export function associateNextStarts(assoc = [], now = Date.now()) {
  const t = new Date(now).getTime();
  const next = new Map();
  for (const s of assoc || []) {
    if (!s?.starts_at || !s.client_name || !(endsAt(s) > t)) continue;
    const key = `${s.coach_id}|${s.client_name}`;
    const had = next.get(key);
    if (!had || new Date(s.starts_at) < new Date(had)) next.set(key, s.starts_at);
  }
  return next;
}
