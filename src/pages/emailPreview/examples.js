// Every email, with invented people only, for the hidden test page
// (/email-preview, local development and previews only) and the checks in
// tests/email. The names and figures are the mock-up's own
// (email-template.html): Northfield Logistics, Jordan, Sam, Jess, Tim.
import {
  healthCheckFinishedForCoachEmail, healthCheckResultsEmail, healthCheckNewCodeEmail, guestEmailCodeEmail, healthCheckFinishedNoteEmail,
  sessionTomorrowEmail, sessionInOneHourEmail, leadingIdeasClientEmail, leadingIdeasPublicEmail,
  confirmEmailEmail, resetPasswordEmail, changeEmailEmail, inviteEmail, guestPlanCopyEmail,
  workshopTomorrowEmail, workshopInOneHourEmail, workshopFollowUpEmail, sessionRecapEmail, clientInviteEmail, bookingConfirmedEmail, callTomorrowEmail, callInOneHourEmail,
} from '../../lib/email/emails.js';
import { instantAt } from '../../lib/time/index.js';

const PORTAL = 'https://portal.theclarityproject.co.uk';
const HEALTH_CHECK = `${PORTAL}/health-check/invented-example-link`;
// The preferences page comes with Phase 6a; until then the link opens My Account.
const PREFERENCES = `${PORTAL}/my-account`;
const ZOOM = 'https://zoom.us/j/0000000000';
const NOW = new Date('2026-11-10T15:00:00Z'); // Tue 10 Nov 2026

const leadingIdeas = {
  issue: 32,
  theme: 'high standards, real support',
  quote: 'The best way to motivate people is by setting high standards and helping them meet them.',
  by: 'Tony Robbins',
  question: 'How are you balancing challenge and support in how you lead others?',
  shareLink: 'https://theclarityproject.co.uk/leading-ideas',
};

/** key, name on the test page, who it is from and to, whether it sends today, and its document. */
export const EMAIL_EXAMPLES = [
  {
    key: 'health-check-coach',
    name: 'Health Check finished, to the coach',
    from: 'From The Clarity Portal, to Tim',
    sends: 'Sent today, when a Health Check is finished.',
    doc: () => healthCheckFinishedForCoachEmail({
      link: HEALTH_CHECK,
      organisation: 'Northfield Logistics',
      email: 'jordan@northfield.example',
      finishedText: 'Tue 10 Nov 2026, 14:05 UK time',
      objective: 'Grow recurring revenue to £4m by the end of 2027.',
      summary: {
        line: 50,
        headline: '2 of 4 important projects are moving well. 2 need attention.',
        questions: [
          { label: 'Timing', question: 'What would it take to finish the new depot on time?', reason: 'They rated its progress “Bad”, and it’s due to finish in 2 months.' },
          { label: 'Resource', question: 'Is “the driver app” worth the resource it takes?', reason: 'They rated its resource requirements “High”, and its strategic importance is 15%.' },
        ],
      },
    }),
  },
  {
    key: 'health-check-person',
    name: 'Health Check results, to the person',
    from: 'From The Clarity Portal, to Jordan',
    sends: 'Sent today, when the person asks for their link.',
    doc: () => healthCheckResultsEmail({ link: HEALTH_CHECK, organisation: 'Northfield Logistics', dateText: 'Tue 10 Nov 2026', email: 'jordan@northfield.example', code: '482913' }),
  },
  {
    key: 'health-check-new-code',
    name: 'Health Check new access code, to the person',
    from: 'From The Clarity Portal, to Jordan',
    sends: 'Sent when the person chooses Only you (migration 045).',
    doc: () => healthCheckNewCodeEmail({ link: HEALTH_CHECK, organisation: 'Northfield Logistics', email: 'jordan@northfield.example', code: 'K7MPQ2' }),
  },
  {
    key: 'guest-email-code',
    name: 'Guest link: the code that shows earlier answers',
    from: 'From The Clarity Portal, to Jordan',
    sends: 'Sent when a guest who chose Only you opens their link again (migration 046).',
    doc: () => guestEmailCodeEmail({ toolName: 'Get unstuck', code: '482913' }),
  },
  {
    key: 'health-check-owner-note',
    name: 'Health Check finished, the owner’s note',
    from: 'From The Clarity Portal, to Tim',
    sends: 'Sent today, when another coach’s link is finished. It never holds the answers or the sign-in details.',
    doc: () => healthCheckFinishedNoteEmail({ organisation: 'Northfield Logistics', dateText: 'Tue 10 Nov 2026' }),
  },
  {
    key: 'guest-plan-copy',
    name: 'Get unstuck plan, a guest’s copy',
    from: 'From The Clarity Portal, to Alex, a guest',
    sends: 'Sent only from the live site, when a guest finishes Get unstuck through a coach’s link (after migrations 035 and 042). Never from a preview.',
    doc: () => guestPlanCopyEmail({
      origin: PORTAL,
      toolName: 'Get unstuck',
      coachName: 'Tim',
      goal: 'Cut our time to hire to 30 days by March',
      nextSteps: ['Agree a 48-hour feedback rule with the four hiring managers', 'Ask Priya to show the other teams her one-day loop'],
    }),
  },
  {
    key: 'session-tomorrow',
    name: 'Coaching session tomorrow',
    from: 'From The Clarity Portal, to Sam',
    sends: 'Sent only from the live site, once, by the scheduled job (api/coach-reminders.js) from 18:00 the day before in the client’s own time, when its switch is on (after migration 051). Shown for a client in Chicago whose coach has ticked them as a frequent traveller.',
    doc: () => sessionTomorrowEmail({ coach: 'Jess', at: instantAt('2026-11-11', '10:00', 'America/Chicago'), zone: 'America/Chicago', frequentTraveller: true, prepLink: `${PORTAL}/welcome`, zoomLink: ZOOM, preferencesLink: PREFERENCES, now: NOW }),
  },
  {
    key: 'session-tomorrow-uk',
    name: 'Coaching session tomorrow, a UK client',
    from: 'From The Clarity Portal, to Sam',
    sends: 'Sent only from the live site, once, by the scheduled job (api/coach-reminders.js) from 18:00 the day before in the client’s own time, when its switch is on (after migration 051). Shown for a client in the UK who isn’t ticked as a frequent traveller: a 24-hour time and no travel line.',
    doc: () => sessionTomorrowEmail({ coach: 'Tim', at: instantAt('2026-11-11', '15:00', 'Europe/London'), zone: 'Europe/London', prepLink: `${PORTAL}/welcome`, zoomLink: ZOOM, preferencesLink: PREFERENCES, now: NOW }),
  },
  {
    key: 'session-one-hour',
    name: 'Session in 1 hour',
    from: 'From The Clarity Portal, to Sam',
    sends: 'Sent only from the live site, once, by the scheduled job (api/coach-reminders.js) 1 hour before, when its switch is on (after migration 051). It never gives a clock time.',
    doc: () => sessionInOneHourEmail({ coach: 'Tim', zoomLink: ZOOM, preferencesLink: PREFERENCES }),
  },
  {
    key: 'booking-confirmed',
    name: 'A call booked through a booking page',
    from: 'From The Clarity Project, to the person who booked',
    sends: 'Sent only from the live site, once for each time booked (api/booking-email.js claims the send in the database first; after migration 051). The time is in the reader’s own zone: 12-hour for the US and Canada.',
    doc: () => bookingConfirmedEmail({ name: 'Grace Liu', callName: 'Chemistry Call', coach: 'Tim', at: instantAt('2026-11-18', '11:30', 'America/New_York'), zone: 'America/New_York', zoomLink: ZOOM, mineLink: `${PORTAL}/book/mine/3f1c0a52-7b1e-4c0a-9a57-2d0f6b1c8e11`, now: NOW }),
  },
  {
    key: 'booking-moved',
    name: 'A booked call moved by the person who booked it',
    from: 'From The Clarity Project, to the person who booked',
    sends: 'Sent only from the live site, once for each move. A reader outside the US and Canada sees a 24-hour time.',
    doc: () => bookingConfirmedEmail({ name: 'Nadia Osei', callName: 'Connection Call', coach: 'Tim', at: instantAt('2026-11-24', '14:15', 'Europe/London'), zone: 'Europe/London', mineLink: `${PORTAL}/book/mine/3f1c0a52-7b1e-4c0a-9a57-2d0f6b1c8e12`, moved: true, now: NOW }),
  },
  {
    key: 'call-tomorrow',
    name: 'A booked call tomorrow',
    from: 'From The Clarity Project, to the person who booked',
    sends: 'Sent only from the live site, once, by the scheduled job (api/coach-reminders.js) from 18:00 the day before in the reader’s own time, when its switch is on (after migration 051).',
    doc: () => callTomorrowEmail({ name: 'Grace Liu', callName: 'Chemistry Call', coach: 'Tim', at: instantAt('2026-11-11', '11:30', 'America/New_York'), zone: 'America/New_York', zoomLink: ZOOM, mineLink: `${PORTAL}/book/mine/3f1c0a52-7b1e-4c0a-9a57-2d0f6b1c8e11`, now: NOW }),
  },
  {
    key: 'call-one-hour',
    name: 'A booked call in 1 hour',
    from: 'From The Clarity Project, to the person who booked',
    sends: 'Sent only from the live site, once, by the scheduled job (api/coach-reminders.js) 1 hour before, when its switch is on. It never gives a clock time.',
    doc: () => callInOneHourEmail({ callName: 'Chemistry Call', coach: 'Tim', zoomLink: ZOOM }),
  },
  {
    key: 'workshop-tomorrow',
    name: 'Workshop tomorrow',
    from: 'From The Clarity Project, to someone registered',
    sends: 'Sent only from the live site, once, by the scheduled job (api/workshop-emails.js) from 07:00 the day before in the workshop’s own time zone, when its switch is on (after migration 050).',
    doc: () => workshopTomorrowEmail({ title: 'Leading under pressure', at: instantAt('2026-11-11', '09:30', 'Europe/London'), zone: 'Europe/London', place: 'In person, Leeds', now: NOW }),
  },
  {
    key: 'workshop-one-hour',
    name: 'Workshop in 1 hour',
    from: 'From The Clarity Project, to someone registered',
    sends: 'Sent only from the live site, once, by the scheduled job about 1 hour before, when its switch is on (after migration 050). It never gives a clock time.',
    doc: () => workshopInOneHourEmail({ title: 'Leading under pressure', place: 'In person, Leeds' }),
  },
  {
    key: 'workshop-follow-up',
    name: 'Workshop follow-up, with the survey',
    from: 'From The Clarity Project, to someone who came',
    sends: 'Sent only from the live site, once, when the coach presses Send the follow-up on the workshop’s page (after migration 050). Never from a preview, and never by itself.',
    doc: () => workshopFollowUpEmail({ title: 'Decide who decides', words: 'Thank you for Tuesday. Here are the slides and the decision rights canvas.\nYou’re also welcome to a free Clarity Portal account, to keep using the tools.', surveyLink: `${PORTAL}/workshop/survey/00000000-0000-4000-8000-000000000001` }),
  },
  {
    key: 'session-recap',
    name: 'Session recap',
    from: 'From The Clarity Portal, to Hannah',
    sends: 'Sent only from the live site, once, when the coach presses Send the recap (after migration 050). Never from a preview, and never by itself.',
    doc: () => sessionRecapEmail({
      origin: PORTAL,
      coach: 'Tim',
      dateText: 'Mon 16 Nov 2026',
      recap: 'Thanks for today, Hannah.\n\nWe looked at the pricing launch and where your time goes in the week before it. You named two things only you can do: the investor call and the pricing story for the sales team.\n\nYou’re handing the rest of the launch plan to Femi, with a 15-minute check-in each morning.',
      actions: ['Hand the launch plan to Femi by Wednesday', 'Book a 15-minute check-in each morning'],
    }),
  },
  {
    key: 'client-invite',
    name: 'Invite to the portal',
    from: 'From The Clarity Portal, to Leo',
    sends: 'Sent only from the live site, when the coach presses Invite on a client’s page. Never from a preview, and never by itself.',
    doc: () => clientInviteEmail({ origin: PORTAL, coach: 'Tim' }),
  },
  {
    key: 'leading-ideas-client',
    name: 'Leading Ideas, clients',
    from: 'From The Clarity Project, to Sam',
    sends: 'A template only: nothing sends it yet.',
    doc: () => leadingIdeasClientEmail({ ...leadingIdeas, tailoredLine: 'Sam, with your sprint focused on delegating to your new leads, this one’s for you this week.', portalLink: PORTAL, preferencesLink: PREFERENCES }),
  },
  {
    key: 'leading-ideas-public',
    name: 'Leading Ideas, public list',
    from: 'From The Clarity Project, through Kit, to your public list',
    sends: 'A template only. Kit fills in its own unsubscribe link and the address saved in Kit, shown here as Kit’s placeholders.',
    doc: () => leadingIdeasPublicEmail({ ...leadingIdeas, signUpLink: `${PORTAL}/auth/sign-up`, unsubscribeLink: '{{ unsubscribe_url }}', address: '{{ address }}' }),
  },
  {
    key: 'confirm-email',
    name: 'Confirm your email',
    from: 'From The Clarity Portal, to a new person',
    sends: 'Sent today by Supabase when someone signs up. Its template is saved in Supabase, not in the portal’s code.',
    doc: () => confirmEmailEmail({ link: `${PORTAL}/auth/confirmed` }),
  },
  {
    key: 'reset-password',
    name: 'Choose a new password',
    from: 'From The Clarity Portal, to Sam',
    sends: 'Sent today by Supabase when someone asks for a new password. Its template is saved in Supabase, not in the portal’s code.',
    doc: () => resetPasswordEmail({ link: `${PORTAL}/auth/reset-password` }),
  },
  {
    key: 'change-email',
    name: 'Confirm your change of email',
    from: 'From The Clarity Portal, to Sam’s current address and to the new one',
    sends: 'Sent by Supabase when someone saves a new email in My Account: the same email to both addresses, each with its own link. Its template is saved in Supabase, not in the portal’s code.',
    doc: () => changeEmailEmail({ link: `${PORTAL}/my-account/email` }),
  },
  {
    key: 'invite',
    name: 'Set up your account',
    from: 'From The Clarity Portal, to someone a coach has invited',
    sends: 'Nothing sends this yet. Its words are a stand-in until the coach portal’s invite email is drawn. Its template is saved in Supabase, not in the portal’s code.',
    doc: () => inviteEmail({ link: `${PORTAL}/auth/invite` }),
  },
];
