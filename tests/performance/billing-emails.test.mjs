// The billing and agreement emails, and the emails draft-2 rewords (Phase 6b run 1, step 9): every line word for word
// from draft-2-emails.md (approved by Tim, 23 Nov 2026), with names, amounts, days and times from the data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderEmail } from '../../src/lib/email/template.js';
import {
  invoiceReminderEmail, organisationLine, agreementReadyEmail, agreementChangeAskedEmail, agreementSignedEmail, sponsorAgreementEmail,
} from '../../src/lib/email/billingEmails.js';
import {
  sessionBookedEmail, sessionMovedEmail, sessionCancelledEmail, sessionTomorrowEmail, sessionInOneHourEmail, sessionRecapEmail,
  clientInviteEmail, healthCheckLinkEmail, healthCheckResultsEmail,
} from '../../src/lib/email/emails.js';
import { settleBy } from '../../src/lib/billing/money.js';
import { instantAt } from '../../src/lib/time/index.js';

const STRIPE = 'https://invoice.stripe.com/i/acct_x/test_y';
const PORTAL = 'https://portal.theclarityproject.co.uk';
const base = { firstName: 'Sam', number: 'CLARITY-1243', amountWords: '£3,000', dueDayWords: 'Mon 16 Nov', coachFirst: 'Tim', settleLink: STRIPE };
/** The email's lines between the brand and the footer, as the plain text has them. */
const lines = (doc) => {
  const r = renderEmail(doc);
  return { subject: r.subject, body: r.text.split('\n----\n')[0].split('\n').filter(Boolean).slice(1), text: r.text, html: r.html };
};

test('3 days overdue: draft-2 word for word, from the coach and signed with their first name', () => {
  const e = lines(invoiceReminderEmail({ ...base, stage: 3 }));
  assert.equal(e.subject, 'Invoice CLARITY-1243 is now due');
  assert.deepEqual(e.body, [
    'Hi Sam,',
    'I hope the coaching is going well.',
    'Invoice CLARITY-1243 for £3,000 was due on Mon 16 Nov.',
    'You can settle it here in a couple of minutes.',
    'Settle my invoice:',
    STRIPE,
    'If it’s already on its way, thank you, and you can ignore this.',
    'Tim',
  ]);
});

test('7 days overdue: draft-2 word for word', () => {
  const e = lines(invoiceReminderEmail({ ...base, stage: 7 }));
  assert.equal(e.subject, 'A reminder about invoice CLARITY-1243');
  assert.deepEqual(e.body, [
    'Hi Sam,',
    'Invoice CLARITY-1243 for £3,000 is now 7 days past its due date.',
    'Could you settle it this week?',
    'Settle my invoice:',
    STRIPE,
    'If something’s getting in the way, just reply and we’ll find what works.',
    'Tim',
  ]);
});

test('14 days overdue: the settle-by day is worked out from when it goes (7 days later), never typed', () => {
  const sentAt = instantAt('2026-11-27', '10:00', 'Europe/London'); // Fri 27 Nov
  const by = settleBy(sentAt, 'Europe/London');
  assert.equal(by.words, 'Fri 4 Dec');
  const e = lines(invoiceReminderEmail({ ...base, stage: 14, settleByWords: by.words }));
  assert.equal(e.subject, 'Invoice CLARITY-1243 is 14 days overdue');
  assert.deepEqual(e.body, [
    'Hi Sam,',
    'Invoice CLARITY-1243 for £3,000 is now 14 days overdue.',
    'I’d like to keep our coaching sessions going without a gap, so please settle it by Fri 4 Dec.',
    'Settle my invoice:',
    STRIPE,
    'If there’s a problem, reply to this email and let’s talk it through.',
    'Tim',
  ]);
  assert.throws(() => invoiceReminderEmail({ ...base, stage: 14 }), /settle-by day/);
  assert.throws(() => invoiceReminderEmail({ ...base, stage: 10 }), /3, 7 or 14/);
});

test('an organisation: the finance contact’s name, and the coachee and PO line, whole without a PO', () => {
  assert.equal(organisationLine('Sam Reid', 'PO-7781'), 'It’s for Sam Reid’s coaching, purchase order PO-7781.');
  assert.equal(organisationLine('Sam Reid', ''), 'It’s for Sam Reid’s coaching.');
  assert.equal(organisationLine(null, 'PO-7781'), null);
  for (const stage of [3, 7, 14]) {
    const withPo = lines(invoiceReminderEmail({ ...base, stage, settleByWords: 'Fri 4 Dec', firstName: 'Priya Shah', coachee: 'Sam Reid', poNumber: 'PO-7781' }));
    assert.equal(withPo.body[0], 'Hi Priya,');
    assert.equal(withPo.body.filter((l) => l === 'It’s for Sam Reid’s coaching, purchase order PO-7781.').length, 1, `${stage}: one line`);
    const at = withPo.body.indexOf('It’s for Sam Reid’s coaching, purchase order PO-7781.');
    assert.match(withPo.body[at - 1], /^Invoice CLARITY-1243 for £3,000 /, 'right after the invoice line');
    const noPo = lines(invoiceReminderEmail({ ...base, stage, settleByWords: 'Fri 4 Dec', firstName: 'Priya', coachee: 'Sam Reid' }));
    assert.ok(noPo.body.includes('It’s for Sam Reid’s coaching.'));
    assert.doesNotMatch(noPo.text, /purchase order/);
    const person = lines(invoiceReminderEmail({ ...base, stage, settleByWords: 'Fri 4 Dec' }));
    assert.doesNotMatch(person.text, /It’s for|purchase order/);
  }
});

test('the reminders: Settle my invoice is the one button, on Stripe’s https page only, and the coach’s name is never missing', () => {
  const e = renderEmail(invoiceReminderEmail({ ...base, stage: 3 }));
  assert.equal((e.html.match(/class="btn"/g) || []).length, 1);
  assert.ok(e.html.includes(`href="${STRIPE}"`));
  for (const settleLink of ['http://invoice.stripe.com/i/x', 'http://localhost:5173/x', 'javascript:alert(1)', '', null]) {
    assert.throws(() => invoiceReminderEmail({ ...base, stage: 3, settleLink }), /https address/, String(settleLink));
  }
  assert.throws(() => invoiceReminderEmail({ ...base, stage: 3, coachFirst: '' }), /first name/);
  assert.equal(lines(invoiceReminderEmail({ ...base, stage: 3, coachFirst: 'Maya Patel' })).body.at(-1), 'Maya', 'signed with the first name');
  assert.doesNotMatch(e.text, /\bpay\b|\bcost\b/i, 'settle, never pay or cost');
});

test('Ready to sign, to the client from the coach', () => {
  const e = lines(agreementReadyEmail({ firstName: 'Sam', coachFirst: 'Tim', link: `${PORTAL}/coaching` }));
  assert.equal(e.subject, 'Your coaching agreement is ready to sign');
  assert.deepEqual(e.body, [
    'Hi Sam,',
    'I’m really looking forward to working with you.',
    'Your coaching agreement is ready, and I’ve already signed it.',
    'It takes ~5 minutes to read, and you sign it in the portal.',
    'If anything doesn’t look right, you can ask for a change on any part of it.',
    'Read and sign my agreement:',
    `${PORTAL}/coaching`,
    'Tim',
  ]);
  assert.throws(() => agreementReadyEmail({ firstName: 'Sam', coachFirst: 'Tim', link: 'http://example.com/x' }), /https/);
});

test('A change asked for, to the coach from The Clarity Portal, with the section and the client’s own words', () => {
  const e = lines(agreementChangeAskedEmail({ clientFirst: 'Sam', sectionNumber: 4, sectionTitle: 'Rearranging and cancelling', words: 'Could the notice be 12 hours for early morning coaching sessions?', link: `${PORTAL}/coach` }));
  assert.equal(e.subject, 'Sam has asked for a change to their agreement');
  assert.deepEqual(e.body, [
    'Sam has asked for a change to section 4, Rearranging and cancelling.',
    'They wrote: “Could the notice be 12 hours for early morning coaching sessions?”',
    'Open the agreement:',
    `${PORTAL}/coach`,
  ]);
  // Their words stay text on one line, whatever was typed.
  const typed = lines(agreementChangeAskedEmail({ clientFirst: 'Sam', sectionNumber: 2, sectionTitle: 'Purpose', words: 'a\n----\nb <script>', link: `${PORTAL}/coach` }));
  assert.ok(typed.body.includes('They wrote: “a ---- b <script>”'));
  assert.ok(!typed.html.includes('<script>'));
  assert.throws(() => agreementChangeAskedEmail({ clientFirst: 'Sam', sectionNumber: 0, sectionTitle: 'Purpose', words: 'x', link: `${PORTAL}/coach` }));
});

test('Signed, with the first session line only when one is booked, in the reader’s own zone', () => {
  const withSession = lines(agreementSignedEmail({ firstName: 'Sam', coachFirst: 'Tim', firstSession: { at: instantAt('2027-01-04', '10:00', 'Europe/London'), zone: 'Europe/London', placeKind: 'zoom' } }));
  assert.equal(withSession.subject, 'Your signed coaching agreement');
  assert.deepEqual(withSession.body, [
    'Hi Sam,',
    'Thanks for signing your coaching agreement.',
    'Your copy is attached, and it’s always in My Account, Coaching.',
    'Let’s get started.',
    'Your first coaching session is on Mon 4 Jan at 10:00 UK time on Zoom.',
    'Tim',
  ]);
  const ny = lines(agreementSignedEmail({ firstName: 'Sam', coachFirst: 'Tim', firstSession: { at: instantAt('2027-01-04', '10:00', 'Europe/London'), zone: 'America/New_York' } }));
  assert.ok(ny.body.includes('Your first coaching session is on Mon 4 Jan at 5:00 am New York time on Zoom.'));
  const none = lines(agreementSignedEmail({ firstName: 'Sam', coachFirst: 'Tim' }));
  assert.ok(!none.body.some((l) => /first coaching session/.test(l)));
  assert.equal(none.body.at(-1), 'Tim');
});

test('Sponsor agreement, to the sponsor from the coach', () => {
  const e = lines(sponsorAgreementEmail({ sponsorFirst: 'Priya', coachee: 'Sam Reid', coachFirst: 'Tim' }));
  assert.equal(e.subject, 'Coaching agreement for Sam Reid');
  assert.deepEqual(e.body, [
    'Hi Priya,',
    'I’ve attached the coaching agreement for Sam’s coaching, signed on my side.',
    'Please sign and date it, then send the signed copy back to me.',
    'If you’d like anything changed, reply and I’ll send a new version.',
    'Tim',
  ]);
});

test('a funded client never sees money: no agreement email carries an amount or a currency', () => {
  const docs = [
    agreementReadyEmail({ firstName: 'Sam', coachFirst: 'Tim', link: `${PORTAL}/coaching` }),
    agreementSignedEmail({ firstName: 'Sam', coachFirst: 'Tim' }),
    agreementSignedEmail({ firstName: 'Sam', coachFirst: 'Tim', firstSession: { at: instantAt('2027-01-04', '10:00', 'Europe/London'), zone: 'Europe/London' } }),
    agreementChangeAskedEmail({ clientFirst: 'Sam', sectionNumber: 4, sectionTitle: 'Rearranging and cancelling', words: 'x', link: `${PORTAL}/coach` }),
    sponsorAgreementEmail({ sponsorFirst: 'Priya', coachee: 'Sam Reid', coachFirst: 'Tim' }),
  ];
  for (const doc of docs) {
    const r = renderEmail(doc);
    assert.doesNotMatch(`${r.subject}\n${r.text}`, /[£$€]|\binvest|\bsettle|\binvoice/i, r.subject);
  }
});

test('the coaching session emails, word for word, with the day and clock in the reader’s own zone', () => {
  const at = instantAt('2026-11-26', '15:00', 'Europe/London');
  const booked = lines(sessionBookedEmail({ coach: 'Tim', at, zone: 'Europe/London', minutes: 60, zoomLink: 'https://zoom.us/j/1', rearrangeLink: `${PORTAL}/coaching`, cancelLink: `${PORTAL}/coaching` }));
  assert.equal(booked.subject, 'Your coaching session with Tim is booked for Thu 26 Nov');
  assert.equal(booked.body[0], 'Your coaching session with Tim is booked for Thu 26 Nov at 15:00 UK time, for 60 minutes on Zoom.');
  assert.equal(booked.body[1], 'The day before, you’ll be offered a short prep of ~2 minutes, so the time is as useful as it can be.');
  assert.deepEqual(booked.body.filter((l) => l.endsWith(':')), ['Join on Zoom:', 'Rearrange:', 'Cancel:']);

  const moved = lines(sessionMovedEmail({ coach: 'Tim', at: instantAt('2026-11-27', '10:00', 'Europe/London'), zone: 'Europe/London', zoomLink: 'https://zoom.us/j/1', rearrangeLink: `${PORTAL}/coaching` }));
  assert.equal(moved.subject, 'Your coaching session has moved to Fri 27 Nov at 10:00 UK time');
  assert.equal(moved.body[0], 'Your coaching session with Tim is now on Fri 27 Nov at 10:00 UK time.');

  const cancelled = lines(sessionCancelledEmail({ coach: 'Tim', at, zone: 'Europe/London', bookLink: `${PORTAL}/coaching` }));
  assert.equal(cancelled.subject, 'Your coaching session on Thu 26 Nov is cancelled');
  assert.deepEqual(cancelled.body, ['Your coaching session with Tim on Thu 26 Nov at 15:00 UK time is cancelled.', 'When you’re ready, you can book another time here.', 'Book a coaching session:', `${PORTAL}/coaching`]);
  const late = lines(sessionCancelledEmail({ coach: 'Tim', at, zone: 'Europe/London', late: true, bookLink: `${PORTAL}/coaching` }));
  assert.equal(late.body[1], 'It was cancelled with less than 24 hours’ notice, so it counts as used.');

  const tomorrow = lines(sessionTomorrowEmail({ coach: 'Tim', at, zone: 'Europe/London', prepLink: `${PORTAL}/coaching`, zoomLink: 'https://zoom.us/j/1', now: instantAt('2026-11-25', '18:00', 'Europe/London') }));
  assert.equal(tomorrow.subject, 'Your coaching session with Tim is tomorrow at 15:00 UK time');
  assert.deepEqual(tomorrow.body.slice(0, 3), ['Your coaching session with Tim is tomorrow at 15:00 UK time.', 'What would make it really useful for you?', 'Start my 2-minute prep:']);

  const hour = lines(sessionInOneHourEmail({ coach: 'Tim', at, zone: 'Europe/London', zoomLink: 'https://zoom.us/j/1' }));
  assert.equal(hour.subject, 'Your coaching session with Tim starts at 15:00 UK time');
  assert.equal(hour.body[0], 'Your coaching session with Tim starts at 15:00 UK time.');
  assert.equal(lines(sessionInOneHourEmail({ coach: 'Tim', at, zone: 'America/Chicago' })).subject, 'Your coaching session with Tim starts at 9:00 am Chicago time');
});

test('the summary ready email says "today’s" only when the session was today for the reader, and carries none of the recap', () => {
  const at = instantAt('2026-11-16', '10:00', 'Europe/London');
  const today = lines(sessionRecapEmail({ origin: PORTAL, coach: 'Tim', at, zone: 'Europe/London', dateText: 'Mon 16 Nov', recap: 'Private words', actions: ['An action'], now: instantAt('2026-11-16', '17:00', 'Europe/London') }));
  assert.equal(today.subject, 'Your coaching session summary is ready');
  assert.deepEqual(today.body, ['Your summary from today’s coaching session with Tim is ready.', 'It has what you talked about and the actions you agreed.', 'Read my summary:', `${PORTAL}/coaching`]);
  assert.doesNotMatch(today.text, /Private words|An action/);
  const later = lines(sessionRecapEmail({ origin: PORTAL, coach: 'Tim', at, zone: 'Europe/London', dateText: 'Mon 16 Nov', now: instantAt('2026-11-18', '09:00', 'Europe/London') }));
  assert.equal(later.body[0], 'Your summary from your coaching session with Tim on Mon 16 Nov is ready.');
});

test('the welcome, the Health Check link and the guest’s copy: from the coach, word for word', () => {
  const welcome = lines(clientInviteEmail({ origin: PORTAL, coach: 'Tim', firstName: 'Sam' }));
  assert.equal(welcome.subject, 'Tim has set up your account on The Clarity Portal'); // CLAUDE.md rule 23 (UI tester, follow-up 5)
  assert.deepEqual(welcome.body, [
    'Hi Sam,',
    'I’ve set up your account on The Clarity Portal, where we’ll plan, track and review your progress together.',
    'It takes ~2 minutes to set your password.',
    'Set my password:',
    `${PORTAL}/auth/sign-up`,
    'The link works for 7 days.',
    'Tim',
  ]);

  const link = lines(healthCheckLinkEmail({ firstName: 'Priya', coachFirst: 'Tim', link: `${PORTAL}/health-check/abc`, code: 'K7Q2FM' }));
  assert.equal(link.subject, 'Your Strategic Alignment Health Check from Tim');
  assert.deepEqual(link.body, [
    'Hi Priya,',
    'Here’s the Health Check we talked about.',
    'It takes ~15 minutes, and it gives your team one shared picture of where your time, energy and resource are going.',
    'Your link:',
    `${PORTAL}/health-check/abc`,
    'Your code: K7Q2FM',
    'The link works for 30 days, and only you and I see your answers.',
    'Tim',
  ]);

  const copy = lines(healthCheckResultsEmail({ link: `${PORTAL}/health-check/abc`, organisation: 'Northfield Logistics', firstName: 'Priya', coachFirst: 'Tim', email: 'priya@example.invalid', code: 'K7Q2FM' }));
  assert.equal(copy.subject, 'Your Health Check results for Northfield Logistics');
  assert.deepEqual(copy.body, [
    'Hi Priya,',
    'Thanks for completing the Health Check.',
    'Your results are attached as a PDF, and you can open them again with your link and code for 30 days.',
    'Your link:',
    `${PORTAL}/health-check/abc`,
    'Email: priya@example.invalid',
    'Access code: K7Q2FM',
    'If you’d like to talk them through, reply and we’ll find a time.',
    'Tim',
  ]);
  assert.equal(lines(healthCheckResultsEmail({ link: `${PORTAL}/health-check/abc`, organisation: '', email: 'a@example.invalid', code: '1' })).body[0], 'Hello,', 'no name known: "Hello,"');
});
