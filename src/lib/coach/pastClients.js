// Past clients stay warm: their check-ins at 3, 6 and 12 months (Phase 6a run 4; coach rule 40), moved here from
// crm.js unchanged in tidy follow-up 4 (part 1, item 1), so Today's first screen, which lists the check-ins due, never
// waits for the rest of the CRM's rules. crm.js still names every one of them, so nothing that takes them from there
// changes. Pure functions only (tests/performance/coach-crm.test.mjs).
import { addDays, CHANGED_ELSEWHERE_CODE, clean, cut, dayWords, firstName, quickContacts } from './model.js';
import { monthsOn } from './network.js';

// ---------------------------------------------------------------- past clients stay warm

/** Check-ins are suggested this many months after coaching ends. */
export const CHECK_IN_MONTHS = [3, 6, 12];
/** A check-in shows as due from this many days before its day. */
export const CHECK_IN_AHEAD = 30;
export const CHECK_INS_SWITCH = 'Suggest check-ins at 3, 6 and 12 months';
export const checkInsOn = (settings) => settings?.crm?.suggest_check_ins !== false;
/** "6-month check-in". */
export const checkInName = (months) => `${months}-month check-in`;

/**
 * The check-ins to suggest when coaching ends: one at 3, 6 and 12 months
 * after the day it ended (one a client and month mark; any already there
 * are left alone).
 * @returns {object[]} client_check_ins rows to add
 */
export function checkInsFor(profile, { coachId, newId, existing = [] }) {
  if (!profile?.ended_on) return [];
  return CHECK_IN_MONTHS.filter((m) => !existing.some((c) => c.profile_id === profile.id && c.months === m))
    .map((m) => ({ id: newId(), coach_id: coachId, profile_id: profile.id, months: m, due_on: monthsOn(profile.ended_on, m), done_at: null, skipped_at: null, note: null, ask: null }));
}

/**
 * Check-ins due: not done, not skipped, and due within 30 days (or
 * already past), the soonest first. One a past client: their next.
 * @param {object[]} checkIns
 * @param {object[]} profiles the coach's clients (past ones are read)
 * @param {{ todayKey: string, organisations?: object[] }} ctx
 * @returns {{ id: string, profileId: string, name: string, what: string, sub: string, when: string, overdue: boolean, dueOn: string }[]}
 */
export function checkInsDue(checkIns, profiles, { todayKey, organisations = [] } = {}) {
  const until = addDays(todayKey, CHECK_IN_AHEAD);
  const people = new Map((profiles || []).filter((p) => !p.merged_into).map((p) => [p.id, p]));
  const seen = new Set();
  return (checkIns || []).filter((c) => !c.done_at && !c.skipped_at && c.due_on && c.due_on <= until && people.has(c.profile_id))
    .sort((a, b) => a.due_on.localeCompare(b.due_on) || a.months - b.months)
    .filter((c) => (seen.has(c.profile_id) ? false : (seen.add(c.profile_id), true)))
    .map((c) => {
      const p = people.get(c.profile_id);
      return { id: c.id, profileId: p.id, name: p.name, what: checkInName(c.months), sub: (organisations || []).find((o) => o.id === p.organisation_id)?.name || 'Self-funded',
        when: `Due ${c.due_on === todayKey ? 'today' : dayWords(c.due_on, todayKey)}`, overdue: c.due_on < todayKey, dueOn: c.due_on };
    });
}

/** The ask a check-in can carry, at the right moment: a testimonial first, a referral from 6 months. Tim chooses each one. */
export const suggestedAsk = (months) => (months >= 6 ? 'referral' : 'testimonial');
export const ASK_BUTTONS = {
  referral: { add: 'Add referral ask', remove: 'Take out the referral ask' },
  testimonial: { add: 'Add testimonial ask', remove: 'Take out the testimonial ask' },
};
const ASK_LINES = {
  referral: 'If anyone you know is facing something similar, I’d be glad to be introduced.',
  testimonial: 'If you’d be happy to say a few words about our work together, I’d be grateful.',
};

/**
 * A note to a past client, for the coach to edit and send from their own
 * email app. Nothing is sent from the portal.
 * @param {object} profile
 * @param {{ months: number, ask?: 'referral'|'testimonial'|null }} checkIn
 * @param {{ coachFirstName?: string }} [o]
 * @returns {{ subject: string, body: string }}
 */
export function checkInNote(profile, checkIn, { coachFirstName = '' } = {}) {
  const first = firstName(profile?.name) || 'there';
  const since = checkIn.months === 12 ? 'a year' : `${checkIn.months} months`;
  const lines = [`Hi ${first},`, '', `It’s been ${since} since we finished working together, and I’ve been wondering how things are going.`, 'How are you getting on?'];
  if (ASK_LINES[checkIn.ask]) lines.push('', ASK_LINES[checkIn.ask]);
  if (clean(coachFirstName)) lines.push('', clean(coachFirstName));
  return { subject: 'How are things?', body: lines.join('\n') };
}
/** "Open in my email": the mailto link (nothing without an email address), and the check-in marked done with its note. */
export function checkInSend(profile, checkIn, note, nowIso) {
  const mail = quickContacts({ email: profile?.email }, { subject: note.subject, body: note.body }).find((c) => c.key === 'email') || null;
  return { href: mail ? mail.href : null, checkIn: { ...checkIn, done_at: nowIso, note: cut(String(note.body || ''), 6000) || null },
    toast: mail ? `Your email opens with this note to ${firstName(profile.name)}. Nothing is sent until you send it.` : `${firstName(profile?.name) || 'This client'} has no email address yet. Add one, then try again.` };
}
/** Not now: the check-in moves two weeks on. */
export function checkInLater(checkIn, todayKey) {
  const on = addDays(todayKey, 14);
  return { checkIn: { ...checkIn, due_on: on }, toast: `Moved to ${dayWords(on, todayKey)}.`, undo: checkIn };
}
/** The check-in's panel: its meta lines. */
export const checkInMeta = (profile, checkIn, todayKey) => [`${checkInName(checkIn.months)}, due ${dayWords(checkIn.due_on, todayKey)}`, profile?.ended_on ? `Ended ${dayWords(profile.ended_on, todayKey)}` : ''].filter(Boolean);

// ---------------------------------------------------------------- past clients' pages

/**
 * The check-ins still to suggest: for a past client (or each of several),
 * the 3, 6 and 12 month ones that aren't there yet and haven't passed.
 * Called when coaching ends, and when the switch is turned back on.
 * @returns {object[]} client_check_ins rows to add
 */
export function checkInsToSuggest(profiles, { coachId, newId, existing = [], todayKey }) {
  return (profiles || []).filter((p) => p && p.status === 'past' && p.ended_on && !p.merged_into)
    .flatMap((p) => checkInsFor(p, { coachId, newId, existing }).filter((c) => c.due_on && c.due_on >= todayKey));
}
/** Past clients' words. */
export const PAST_WORDS = { due: 'Check-ins due', everyone: 'Everyone', note: (first) => `A note to ${first}`, open: 'Open in my email', later: 'Not now', switchedOff: 'Check-ins won’t be suggested.', switchedOn: 'Check-ins will be suggested.' };
/** A check-in's note with its ask put in or taken out (the coach's own edits to the rest are kept when the ask's line can be found). */
export function checkInAsk(note, ask, on) {
  const line = ASK_LINES[ask];
  if (!line) return note;
  const body = String(note.body || '');
  if (!on) return { ...note, body: body.replace(`\n\n${line}`, '').replace(line, '').replace(/\n{3,}/g, '\n\n') };
  if (body.includes(line)) return note;
  // Before the sign-off (the last short line), when there is one; otherwise at the end.
  const lines = body.split('\n');
  const lastAt = lines.length - 1;
  const signed = lastAt > 1 && lines[lastAt].trim() && lines[lastAt].trim().length <= 30 && lines[lastAt - 1].trim() === '';
  return { ...note, body: signed ? [...lines.slice(0, lastAt - 1), '', line, '', lines[lastAt]].join('\n') : `${body.replace(/\s+$/, '')}\n\n${line}` };
}

// ---------------------------------------------------------------- the calm line for a save that didn't go (moved from crm.js)

export const CRM_SAVE_PROBLEM = 'That didn’t save. Check your connection and try again.';
const REFUSALS = new Set(['23514', '23505', '23503', '23001', '22023', '22P02', '22003', '23502', 'PGRST204', CHANGED_ELSEWHERE_CODE]);
/**
 * The calm line for an error from a save on Leads, the boards, automations or past clients.
 * A sentence the app or the database wrote for people ("One of these has already been merged.") is shown as it is; a
 * refusal in the database's own words (a check, a key, row security) becomes one calm line; anything else is the
 * connection's line.
 * @param {{ code?: string, message?: string }|null} error
 * @returns {string}
 */
export function crmProblem(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '').trim();
  const technical = /violates|constraint|relation\s|duplicate key|invalid input|permission denied|row-level security|null value|out of range|syntax|column\s|PGRST|JSON/i.test(message);
  if (message && !technical && !/fetch|network|load failed|timeout/i.test(message) && /[.!?]$/.test(message) && message.length <= 200) return message;
  if (code === '42501') return 'That didn’t save, because it is the owner’s to change.';
  if (REFUSALS.has(code)) return 'That couldn’t be kept as it is. It may have just changed in another tab, so check it and try again.';
  return CRM_SAVE_PROBLEM;
}
/** Database refusals: a save the database answered with one of these won't go however often it is sent. */
export const isRefusal = (error) => error?.code === '42501' || REFUSALS.has(String(error?.code || ''));
