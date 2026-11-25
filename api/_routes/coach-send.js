// Clarity Coach: the emails a coach sends by pressing a button (Phase 6a
// run 2). Nothing here sends by itself.
//   POST /api/coach-send  { kind: 'recap', sessionId }                a session's recap (M11 "After a call")
//   POST /api/coach-send  { kind: 'invite', profileId }               Invite to the portal
//   POST /api/coach-send  { kind: 'workshop_follow_up', workshopId }  a workshop's follow-up (and its survey)
// with the coach's own sign-in as the Authorization header.
//
// Everything is read and done WITH THE CALLER'S OWN SIGN-IN, so the
// database's rules decide: the session, its ticked actions and who it goes
// to (session_recap_people); the client's profile (its coach alone reads
// it) and client_invite; the workshop and workshop_follow_up_claim. No
// server key is used, and the browser never says who an email goes to or
// what it says.
//
// It sends only from the live site (maySend): on a preview or a developer's
// machine it answers { sent: false, reason: 'preview' } before asking the
// database or the email provider anything, so a test there can never email
// a person, and nothing is claimed.
//
// Each goes once where once matters, decided by the database BEFORE the
// email provider is asked:
//   recap     session_recap_email_claim (050): true the first time for a
//             sent recap, false ever after.
//   follow-up workshop_follow_up_claim (050): it records the send and
//             returns who gets it, once; a second press returns nobody.
//   invite    goes each time the coach presses Invite (to someone with no
//             account yet): that press is the coach's own choice.
//
// Answers. Errors are generic, no address is ever sent back, and nothing is
// logged: no address, name or word of a recap.
//   200 { sent: true, people: 6 }           it went
//   200 { sent: false, reason: 'preview' }  this deployment never sends
//   200 { sent: false, reason }             'setup' (no email provider yet), 'nobody' (no address to send to),
//                                           'already' (it has gone before), 'not_sent' (the recap hasn't been sent),
//                                           'not_ready' (migration 050's function isn't there yet),
//                                           'has_account' (an invite to someone already in the portal),
//                                           'early' (a follow-up before the workshop has started)
//   400 the request is the wrong shape      401 not signed in
//   404 not this coach's to send            502 the database or the email provider didn't answer
//
// Environment variables (Vercel): RESEND_API_KEY, COACH_EMAIL_FROM (or
// GUEST_EMAIL_FROM, or ALIGNMENT_EMAIL_FROM), and the Supabase URL and anon
// key the app already has.
import { maySend, oneAddress } from '../_guestEmails.js';
import { codeRefusal } from '../_coachCode.js';
import { portalOrigin } from '../_portalOrigin.js';
import { UUID, asCallerClient, canSend, emailFrom, isMissingFunction, isMissingTable, onePerAddress, sendEach, supabaseOf } from '../_coachEmails.js';
import { clientInviteEmail, sessionRecapEmail, workshopFollowUpEmail } from '../../src/lib/email/emails.js';
import { dayWords, isZone } from '../../src/lib/time/index.js';

// A workshop's follow-up can go to a full room, two at a time.
export const config = { maxDuration: 60 };

const RECAP_PEOPLE_MAX = 60;
const WORKSHOP_PEOPLE_MAX = 2000;
const KINDS = { recap: 'sessionId', invite: 'profileId', workshop_follow_up: 'workshopId' };
const DIDNT_SEND = 'That didn’t send. Try again in a moment.';

/** A set-up link's token (064): 64 lower-case hex characters. */
export const INVITE_TOKEN = /^[0-9a-f]{64}$/;
/** The welcome email's set-up link: Create your account, carrying the link's own token. */
export const inviteLink = (origin, token) => `${origin}/auth/sign-up?invite=${token}`;

const reply = (res, status, body) => { res.status(status).setHeader('Cache-Control', 'no-store'); res.json(body); };

/** What Resend is given for one person: the subject, both versions and the inline image. */
// Draft-2's "Summary ready": the email says the summary is ready, and the recap and its actions are read on the
// client's Coaching page, never carried in the email (recap and actions are taken and left out).
// Someone with no portal account (a group member never invited) gets the recap and its actions in the email itself
// (follow-up 5, item 3): `inPortal` false.
export function recapEmail({ origin, coach, at = null, zone = null, dateText, now = new Date(), inPortal = true, recap = '', actions = [] }) {
  return emailFrom(sessionRecapEmail({ origin, coach, at, zone, dateText, now, inPortal, recap, actions }));
}

/** Who a recap goes to: 064's session_recap_readers (with whether each reads it in the portal), else 050's people. */
async function recapReaders(asCaller, sessionId) {
  const readers = await asCaller.rpc('session_recap_readers', { p_session: sessionId });
  if (!readers.error || !isMissingFunction(readers.error)) return readers;
  const people = await asCaller.rpc('session_recap_people', { p_session: sessionId });
  return { ...people, data: (people.data || []).map((p) => ({ ...p, has_account: true })) };
}

/** The request's kind and the id it names, or null when it is the wrong shape. */
export function askedFor(body) {
  const b = body && typeof body === 'object' ? body : {};
  const field = Object.hasOwn(KINDS, b.kind) ? KINDS[b.kind] : null;
  const id = field ? b[field] : null;
  return field && typeof id === 'string' && UUID.test(id) ? { kind: b.kind, id } : null;
}

const coachName = async (asCaller, userId) => {
  const { data } = await asCaller.from('coaches').select('display_first_name').eq('user_id', userId).limit(1);
  return data?.[0]?.display_first_name || '';
};

// ---------------------------------------------------------------- a session's recap
async function sendRecap({ env, req, res, asCaller, userId, id }) {
  const { data: session, error: sessionError } = await asCaller.from('coach_sessions').select('id,profile_id,group_id,starts_at,recap,recap_sent_at').eq('id', id).maybeSingle();
  if (sessionError) return reply(res, 502, { sent: false, message: DIDNT_SEND });
  if (!session) return reply(res, 404, { sent: false, message: 'That session isn’t yours.' });
  if (!session.recap_sent_at) return reply(res, 200, { sent: false, reason: 'not_sent' });

  // Everything the email needs is read first, so nothing is claimed for an email that can't be made.
  const [{ data: people, error: peopleError }, { data: actions, error: actionsError }, coach, { data: profile }, { data: settings }] = await Promise.all([
    recapReaders(asCaller, session.id),
    asCaller.from('coach_session_actions').select('title,position').eq('session_id', session.id).eq('send', true).order('position', { ascending: true }).limit(60),
    coachName(asCaller, userId),
    session.profile_id ? asCaller.from('client_profiles').select('time_zone').eq('id', session.profile_id).maybeSingle() : Promise.resolve({ data: null }),
    asCaller.from('coach_settings').select('time_zone').limit(1),
  ]);
  if (peopleError || actionsError) return reply(res, 502, { sent: false, message: DIDNT_SEND });
  const to = onePerAddress(people, RECAP_PEOPLE_MAX);
  if (!to.length) return reply(res, 200, { sent: false, reason: 'nobody' });

  // Strictly once: the database says whether this is the first time (050), before anything is sent.
  const { data: first, error: claimError } = await asCaller.rpc('session_recap_email_claim', { p_session: session.id });
  if (claimError) return isMissingFunction(claimError) ? reply(res, 200, { sent: false, reason: 'not_ready' }) : reply(res, 502, { sent: false, message: DIDNT_SEND });
  if (first !== true) return reply(res, 200, { sent: false, reason: 'already' });

  // The session's day in words, on the reader's own calendar where it is known (a client's zone), otherwise the coach's.
  const zone = [profile?.time_zone, settings?.[0]?.time_zone, 'Europe/London'].find((z) => isZone(z));
  const made = {
    // Only ever one of the portal's own addresses, never the request's host.
    origin: portalOrigin(req.headers, env),
    coach,
    at: session.starts_at,
    zone,
    dateText: dayWords(session.starts_at, zone),
    recap: session.recap,
    actions: (actions || []).map((a) => a.title),
  };
  const inPortal = recapEmail(made);
  const inEmail = recapEmail({ ...made, inPortal: false });
  // has_account is true only for someone who reads their summaries in the portal; anyone else gets it in the email.
  const went = await sendEach(env, to, (person) => (person.has_account === true ? inPortal : inEmail));
  if (!went) return reply(res, 502, { sent: false, message: DIDNT_SEND });
  return reply(res, 200, { sent: true, people: went });
}

// ---------------------------------------------------------------- Invite to the portal
async function sendInvite({ env, req, res, asCaller, userId, id }) {
  // The coach's own client only: the database's rules let nobody else read the profile.
  const { data: profile, error: profileError } = await asCaller.from('client_profiles').select('id,name,email,user_id,merged_into').eq('id', id).maybeSingle();
  if (profileError) return reply(res, 502, { sent: false, message: DIDNT_SEND });
  if (!profile || profile.merged_into) return reply(res, 404, { sent: false, message: 'That client isn’t yours.' });
  if (profile.user_id) return reply(res, 200, { sent: false, reason: 'has_account' });
  const to = oneAddress(profile.email).toLowerCase();
  if (!to) return reply(res, 200, { sent: false, reason: 'nobody' });

  // The invite is recorded first (only the client's own coach), so the person's Coaching page has it to accept by the
  // time the email arrives. 064's client_invite_link also makes the email's own set-up link, which ends after 7 days
  // ("The link works for 7 days."), and ends every older one: Send it again is this same press.
  const origin = portalOrigin(req.headers, env);
  let link = null;
  const { data: token, error: linkError } = await asCaller.rpc('client_invite_link', { p_profile: profile.id });
  if (linkError) {
    if (linkError.code === '42501') return reply(res, 404, { sent: false, message: 'That client isn’t yours.' });
    if (linkError.code === 'CC409') return reply(res, 200, { sent: false, reason: 'has_account' });
    if (!isMissingFunction(linkError)) return reply(res, 502, { sent: false, message: DIDNT_SEND });
    // Before 064: the invite as 049 records it, and the email's button opens Create your account.
    const { error: inviteError } = await asCaller.rpc('client_invite', { p_profile: profile.id });
    if (inviteError) {
      if (inviteError.code === '42501') return reply(res, 404, { sent: false, message: 'That client isn’t yours.' });
      return reply(res, isMissingFunction(inviteError) ? 200 : 502, isMissingFunction(inviteError) ? { sent: false, reason: 'not_ready' } : { sent: false, message: DIDNT_SEND });
    }
  } else if (typeof token === 'string' && INVITE_TOKEN.test(token)) {
    link = inviteLink(origin, token);
  }
  const email = emailFrom(clientInviteEmail({ origin, link, coach: await coachName(asCaller, userId), firstName: String(profile.name || '').trim().split(/\s+/)[0] || '' }));
  const went = await sendEach(env, [{ email: to }], () => email);
  if (!went) return reply(res, 502, { sent: false, message: DIDNT_SEND });
  return reply(res, 200, { sent: true, people: 1 });
}

// ---------------------------------------------------------------- a workshop's follow-up
async function sendFollowUp({ env, req, res, asCaller, id }) {
  // The coach's own workshop only (049's rules).
  const { data: workshop, error: workshopError } = await asCaller.from('workshops').select('id,title,follow_up').eq('id', id).maybeSingle();
  if (workshopError) return reply(res, 502, { sent: false, message: DIDNT_SEND });
  if (!workshop) return reply(res, 404, { sent: false, message: 'That workshop isn’t yours.' });

  // Once: the database records the send and returns who gets it; a second press returns nobody (050).
  const { data: gone, error: goneError } = await asCaller.from('workshop_sends').select('id').eq('workshop_id', workshop.id).eq('kind', 'follow_up').limit(1);
  if (goneError) return isMissingTable(goneError) ? reply(res, 200, { sent: false, reason: 'not_ready' }) : reply(res, 502, { sent: false, message: DIDNT_SEND });
  if (gone?.length) return reply(res, 200, { sent: false, reason: 'already' });
  const { data: people, error: claimError } = await asCaller.rpc('workshop_follow_up_claim', { p_workshop: workshop.id });
  if (claimError) {
    if (isMissingFunction(claimError)) return reply(res, 200, { sent: false, reason: 'not_ready' });
    if (claimError.code === '42501') return reply(res, 404, { sent: false, message: 'That workshop isn’t yours.' });
    if (claimError.code === '22023') return reply(res, 200, { sent: false, reason: 'early' });
    return reply(res, 502, { sent: false, message: DIDNT_SEND });
  }
  const to = onePerAddress(people, WORKSHOP_PEOPLE_MAX, (p) => p?.attendee_email);
  if (!to.length) return reply(res, 200, { sent: false, reason: (people || []).length ? 'nobody' : 'already' });

  const origin = portalOrigin(req.headers, env);
  const went = await sendEach(env, to, (person) => emailFrom(workshopFollowUpEmail({
    title: workshop.title,
    words: workshop.follow_up || '',
    // Each person's own survey link, only when the survey goes with it.
    surveyLink: person.kind === 'follow_up_survey' && UUID.test(String(person.survey_key || '')) ? `${origin}/workshop/survey/${person.survey_key}` : null,
  })));
  if (!went) return reply(res, 502, { sent: false, message: DIDNT_SEND });
  return reply(res, 200, { sent: true, people: went });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return reply(res, 405, { sent: false, message: 'That didn’t work. Try again in a moment.' });
  const env = process.env;
  const asked = askedFor(req.body);
  if (!asked) return reply(res, 400, { sent: false, message: 'That didn’t work. Try again in a moment.' });

  // The first line of defence: only the live site ever sends, or claims a send.
  if (!maySend(env)) return reply(res, 200, { sent: false, reason: 'preview' });

  const { url, anon } = supabaseOf(env);
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!url || !anon || !token) return reply(res, 401, { sent: false, message: 'Sign in again to carry on.' });
  if (!canSend(env)) return reply(res, 200, { sent: false, reason: 'setup' });

  // Asked as the caller: the database's rules decide what is read.
  const asCaller = asCallerClient(env, token);
  const { data: who, error: whoError } = await asCaller.auth.getUser(token);
  if (whoError || !who?.user?.id) return reply(res, 401, { sent: false, message: 'Sign in again to carry on.' });
  // Only a sign-in that has given its 6-digit code (054).
  const noCode = codeRefusal(token, { sent: false });
  if (noCode) return reply(res, noCode.status, noCode.body);

  const ctx = { env, req, res, asCaller, userId: who.user.id, id: asked.id };
  if (asked.kind === 'invite') return sendInvite(ctx);
  if (asked.kind === 'workshop_follow_up') return sendFollowUp(ctx);
  return sendRecap(ctx);
}
