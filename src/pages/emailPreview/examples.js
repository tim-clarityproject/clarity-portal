// Every email, with invented people only, for the hidden test page
// (/email-preview, local development and previews only) and the checks in
// tests/email. The names and figures are the mock-up's own
// (email-template.html): Northfield Logistics, Jordan, Sam, Jess, Tim.
import {
  healthCheckFinishedForCoachEmail, healthCheckResultsEmail, healthCheckFinishedNoteEmail,
  sessionTomorrowEmail, sessionInOneHourEmail, leadingIdeasClientEmail, leadingIdeasPublicEmail,
  confirmEmailEmail, resetPasswordEmail, changeEmailEmail, inviteEmail,
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
      code: '482913',
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
    key: 'health-check-owner-note',
    name: 'Health Check finished, the owner’s note',
    from: 'From The Clarity Portal, to Tim',
    sends: 'Sent today, when another coach’s link is finished. It never holds the answers or the sign-in details.',
    doc: () => healthCheckFinishedNoteEmail({ organisation: 'Northfield Logistics', dateText: 'Tue 10 Nov 2026' }),
  },
  {
    key: 'session-tomorrow',
    name: 'Coaching session tomorrow',
    from: 'From The Clarity Portal, to Sam',
    sends: 'A template only: nothing sends it yet. Shown for a client in Chicago whose coach has ticked them as a frequent traveller.',
    doc: () => sessionTomorrowEmail({ coach: 'Jess', at: instantAt('2026-11-11', '10:00', 'America/Chicago'), zone: 'America/Chicago', frequentTraveller: true, prepLink: `${PORTAL}/welcome`, zoomLink: ZOOM, preferencesLink: PREFERENCES, now: NOW }),
  },
  {
    key: 'session-tomorrow-uk',
    name: 'Coaching session tomorrow, a UK client',
    from: 'From The Clarity Portal, to Sam',
    sends: 'A template only. Shown for a client in the UK who isn’t ticked as a frequent traveller: a 24-hour time and no travel line.',
    doc: () => sessionTomorrowEmail({ coach: 'Tim', at: instantAt('2026-11-11', '15:00', 'Europe/London'), zone: 'Europe/London', prepLink: `${PORTAL}/welcome`, zoomLink: ZOOM, preferencesLink: PREFERENCES, now: NOW }),
  },
  {
    key: 'session-one-hour',
    name: 'Session in 1 hour',
    from: 'From The Clarity Portal, to Sam',
    sends: 'A template only. It never gives a clock time.',
    doc: () => sessionInOneHourEmail({ coach: 'Tim', zoomLink: ZOOM, preferencesLink: PREFERENCES }),
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
