// The Coaching page's rules (Phase 6a run 2): pure functions only, so each
// is a unit test (tests/performance/coaching.test.mjs). The loaders and
// saves are in coaching.js, which hands these on.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UNSEEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;
export const PREP_MAX = 2000;
export const NO_COACH_NAME = 'Your coach';
export const EMPTY_LINE = 'Nothing from your coach yet.';

/** Text as kept: nothing that can't be seen, and no longer than `max`. */
export const seenText = (value, max = 4000) => (typeof value === 'string' ? value.replace(UNSEEN, '').slice(0, max) : '');
const name = (value) => seenText(value, 60).replace(/\s+/g, ' ').trim();
const list = (value) => (Array.isArray(value) ? value : []);

/** A saved timestamp as milliseconds: one with no time-zone ending is UTC (CLAUDE.md rule 19). NaN for none. */
export function instantMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== 'string' || !value.trim()) return NaN;
  const v = value.trim().replace(' ', 'T');
  return new Date(/(Z|[+-]\d{2}(:?\d{2})?)$/i.test(v) ? v : `${v}Z`).getTime();
}

export const EMPTY_COACHING = Object.freeze({ invites: [], views: [], covers: [], recaps: [], prep: null, asks: false, day: false });

/**
 * Whatever the database answered, or the device kept, as something the page
 * can draw: every row with the id and fields it needs, anything else left
 * out. (A stand-in or an older version never stops the page.)
 */
export function tidyCoaching(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const prep = r.prep && typeof r.prep === 'object' && seenText(r.prep.body, PREP_MAX).trim() ? { body: seenText(r.prep.body, PREP_MAX), noted_at: r.prep.noted_at || null } : null;
  return {
    asks: r.asks === true,
    day: r.day === true,
    invites: list(r.invites).filter((i) => i && UUID.test(String(i.profile_id || ''))).map((i) => ({ profile_id: i.profile_id, coach_first_name: name(i.coach_first_name), invited_at: i.invited_at || null })),
    views: list(r.views).filter((v) => v && UUID.test(String(v.request_id || ''))).map((v) => ({ request_id: v.request_id, coach_first_name: name(v.coach_first_name), asked_at: v.asked_at || null, answered_at: v.answered_at || null, allowed: v.allowed === true ? true : v.allowed === false ? false : null, expires_at: v.expires_at || null })),
    covers: list(r.covers).filter((c) => c && UUID.test(String(c.cover_id || '')) && DAY.test(String(c.starts_on || '')) && DAY.test(String(c.ends_on || '')))
      .map((c) => ({ cover_id: c.cover_id, coach_first_name: name(c.coach_first_name), cover_first_name: name(c.cover_first_name), starts_on: c.starts_on, ends_on: c.ends_on, agreed_at: c.agreed_at || null })),
    recaps: list(r.recaps).filter((s) => s && UUID.test(String(s.session_id || '')) && Number.isFinite(instantMs(s.starts_at)))
      .map((s) => ({
        session_id: s.session_id,
        starts_at: s.starts_at,
        coach_first_name: name(s.coach_first_name),
        group_name: name(s.group_name),
        recap: seenText(s.recap, 12000),
        sent_at: s.sent_at || null,
        actions: list(s.actions).filter((a) => a && UUID.test(String(a.id || '')) && seenText(a.title, 300).trim())
          .map((a) => ({ id: a.id, title: seenText(a.title, 300).trim(), goes_to: a.goes_to === 'backlog' ? 'backlog' : 'week', done: a.done === true, placed: a.placed === true })),
      }))
      .sort((a, b) => instantMs(b.starts_at) - instantMs(a.starts_at)),
    prep,
  };
}

/**
 * What a coach is asking, as the page shows it now:
 *   invites  open invites, without any put off until tomorrow (Not now)
 *   views    a request still to answer, or a yes while its 30 minutes run
 *            ({ ...request, state: 'ask' | 'yes' }); an older answer shows nothing
 *   covers   cover that hasn't ended ({ ...cover, agreed })
 * `notNow`: the device's list of "<day>|<profile id>" from Not now (asked
 * again tomorrow) and "closed|<profile id>" (an invite that can't be taken).
 */
export function coachAsks(data, { now = new Date(), today = '', notNow = [] } = {}) {
  const d = tidyCoaching(data);
  const at = new Date(now).getTime();
  const put = new Set(list(notNow));
  return {
    invites: d.invites.filter((i) => !put.has(`${today}|${i.profile_id}`) && !put.has(`closed|${i.profile_id}`)),
    views: d.views
      .map((v) => {
        if (!v.answered_at) return { ...v, state: 'ask' };
        return v.allowed === true && instantMs(v.expires_at) > at ? { ...v, state: 'yes' } : null;
      })
      .filter(Boolean),
    covers: d.covers.filter((c) => !today || c.ends_on >= today).map((c) => ({ ...c, agreed: Boolean(c.agreed_at) })),
  };
}

/** Is there anything from a coach at all? (With nothing, the page says one calm line and nothing links to it.) */
export function coachingEmpty(data, opts = {}) {
  const d = tidyCoaching(data);
  const asks = coachAsks(d, opts);
  return !asks.invites.length && !asks.views.length && !asks.covers.length && !d.recaps.length && !d.prep;
}

/**
 * Home's one quiet line, only when something on the Coaching page is new:
 * an invite, a View as client request or cover still to answer ("Tim has
 * sent something for you."), or a recap sent since the page was last
 * opened on this device ("Tim sent a recap of your session."). Null when
 * nothing is new. `seenAt`: when the page was last opened (ms), or null.
 */
export function coachingNews(data, { now = new Date(), today = '', notNow = [], seenAt = null } = {}) {
  const d = tidyCoaching(data);
  const asks = coachAsks(d, { now, today, notNow });
  const waiting = [...asks.invites, ...asks.views.filter((v) => v.state === 'ask'), ...asks.covers.filter((c) => !c.agreed)];
  if (waiting.length) return { key: 'coaching', lines: [`${waiting[0].coach_first_name || NO_COACH_NAME} has sent something for you.`], action: { label: 'Open', to: COACHING_PATH } };
  const seen = Number.isFinite(seenAt) ? seenAt : -Infinity;
  const fresh = d.recaps.filter((r) => instantMs(r.sent_at) > seen).sort((a, b) => instantMs(b.sent_at) - instantMs(a.sent_at))[0];
  if (fresh) return { key: 'coaching', lines: [`${fresh.coach_first_name || NO_COACH_NAME} sent a recap of your session.`], action: { label: 'Open', to: COACHING_PATH } };
  return null;
}

export const COACHING_PATH = '/coaching';

/** What the person reads after Accept, for each of the database's three answers. */
export function acceptWords(answer, coach) {
  const who = coach || 'your coach';
  if (answer === 'linked') return `You’re now working with ${who}.`;
  // 'already_linked' (this account already works with a coach's page) and 'has_another_coach'.
  return `You already have a coach in The Clarity Portal, so nothing changed. Ask ${coach || 'your coach'} if that isn’t right.`;
}

/** The button that adds a recap's action to the client's to-dos, as the coach chose. */
export const addWords = (action) => (action.goes_to === 'backlog' ? 'Add to my backlog' : 'Add to this week');

/** Where an added action is, said as the tools say it; `where` is what this device remembers ('week' | 'backlog'), if anything. */
export function placedLine(where) {
  if (where === 'week') return 'It’s in this week’s sprint.';
  if (where === 'backlog') return 'It’s in your backlog.';
  return 'It’s in your to-dos.';
}

/** The data with one recap action changed (ticked, or added to the to-dos), for the screen before the database answers. */
export function withAction(data, actionId, change) {
  const d = tidyCoaching(data);
  return { ...d, recaps: d.recaps.map((r) => ({ ...r, actions: r.actions.map((a) => (a.id === actionId ? { ...a, ...change } : a)) })) };
}

/** The database's answer for a function or table it doesn't have (the migration hasn't run). */
export function isNotThere(error) {
  const code = error?.code || '';
  return ['PGRST202', 'PGRST205', '42883', '42P01'].includes(code) || /could not find the (function|table)|does not exist/i.test(`${error?.message || ''}`);
}
