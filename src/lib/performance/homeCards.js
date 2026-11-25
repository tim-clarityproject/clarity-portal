import { addDays, clockWords, dayIn, dayKeyWords, dayWords, wallClock } from '../time/index.js';

// Home's two cards on the right (Polish 1, example-pages-25nov.html "Home"): What needs you (what's
// waiting on the client: an agreement to sign, an invoice to settle, a review that's due, a
// session's prep, something new from the coach) and Upcoming (the coaching sessions to come and due
// dates). Plain rules on what the page has already read, so every row is tested
// (tests/performance/home-cards.test.mjs). Clients settle, never pay (agreements rule 2).

const PREP_TIME = '~2 minutes';

/** Where a session falls for the reader: { when: 'today' | 'tomorrow' | 'later', day, time }. */
export function sessionWhen(startsAt, zone, now = new Date()) {
  const today = dayIn(zone, now);
  const day = wallClock(startsAt, zone).date;
  return {
    when: day === today ? 'today' : day === addDays(today, 1) ? 'tomorrow' : 'later',
    day: dayWords(startsAt, zone),
    time: clockWords(startsAt, zone),
  };
}

/** The sessions still to come, soonest first (my_sessions_coming rows). */
export function comingSessions(rows, now = new Date()) {
  return (Array.isArray(rows) ? rows : [])
    .filter((s) => s && s.starts_at && Date.parse(s.starts_at) > now.getTime() - 60 * 60000)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}

/**
 * What needs you, in the order it matters.
 *   agreement   the version waiting to be signed (readyToSign), or null
 *   invoice     the next invoice the client settles themselves (nextInvoice), or null
 *   checkin     checkinPrompt() while a review is due, or null
 *   sessions    comingSessions(); prep is asked for the next one when it's today or tomorrow
 *   prepWritten whether something is already written for the next session
 *   news        coachingNews(): an invite, a request or a recap that's new, or null
 */
export function homeNeeds({ agreement = null, invoice = null, checkin = null, sessions = [], prepWritten = false, news = null, today, zone, now = new Date() } = {}) {
  const out = [];
  if (agreement) {
    out.push({ key: 'agreement', name: 'Sign your coaching agreement', value: agreement.sentDay ? `Sent ${dayKeyWords(agreement.sentDay)}` : null, to: `/coaching/agreement/${agreement.id}` });
  }
  if (invoice) {
    const due = invoice.dueOn ? `${invoice.dueOn < today ? 'Was due' : 'Due'} ${dayKeyWords(invoice.dueOn)}` : 'Ready to settle';
    out.push({ key: 'invoice', name: `Settle invoice ${invoice.number}`, value: due, to: '/my-account/invoices' });
  }
  if (checkin?.action?.to) {
    out.push({ key: 'checkin', name: checkin.first ? 'Your first review' : 'Your monthly review', value: checkin.time || null, to: checkin.action.to });
  }
  const next = sessions[0];
  if (next && !prepWritten) {
    const at = sessionWhen(next.starts_at, zone, now);
    if (at.when !== 'later') out.push({ key: 'prep', name: `Prepare for ${at.when === 'today' ? 'today’s' : 'tomorrow’s'} session`, value: PREP_TIME, to: '/coaching' });
  }
  if (news?.lines?.length && news.action?.to) {
    out.push({ key: 'news', name: news.lines[0], value: null, to: news.action.to });
  }
  return out;
}

/**
 * Upcoming: the three soonest coaching sessions and the sprint's own dates in the next four weeks
 * (the week's debrief, the sprint's last day), soonest first.
 */
export function homeUpcoming({ sessions = [], sprint = null, today, zone, now = new Date() } = {}) {
  const until = addDays(today, 28);
  const out = sessions.slice(0, 3).map((s) => ({
    key: `session:${s.session_id || s.starts_at}`,
    name: s.coach_first_name ? `Coaching session with ${s.coach_first_name}` : 'Coaching session',
    value: `${dayWords(s.starts_at, zone)}, ${clockWords(s.starts_at, zone)}`,
    at: wallClock(s.starts_at, zone).date,
  }));
  void now;
  if (sprint?.endsOn && sprint.endsOn >= today && sprint.endsOn <= until) {
    out.push({ key: 'sprint-end', name: `${sprint.name} ends`, value: dayKeyWords(sprint.endsOn), at: sprint.endsOn });
  }
  return out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}
