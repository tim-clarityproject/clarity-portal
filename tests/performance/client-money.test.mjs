// src/lib/coaching/clientMoney.js and src/lib/levels.js: the client's agreement, settling and money lines (Phase 6b run 3,
// Group C; M28 version 4 s-q-client, s-c-sign, s-c-change, s-c-asked, s-c-pay, s-c-signed, s-s-sign, s-s-signed,
// s-h-client, s-acct, s-payments, s-levels, s-cancel, s-locked; brief items 8, 11 to 14, 19 to 21, 24, 36 and 37).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as m from '../../src/lib/coaching/clientMoney.js';
import * as lv from '../../src/lib/levels.js';
import { blankTerms } from '../../src/lib/agreements/terms.js';
import { START_NOW_LINE, SETTLE_LINE } from '../../src/lib/agreements/coolingOff.js';

// M28's Sam: 1 × 90 then 15 × 60 minutes, £18,000 with 15% off for a returning client, 6 equal instalments.
const sam = { ...blankTerms('sessions'), coaching: '6-month coaching', totalMinor: 1800000, discounts: [{ type: 'returning', percent: 15 }], settle: 'equal',
  blocks: [{ n: 1, minutes: 90 }, { n: 15, minutes: 60 }], startsOn: '2027-01-04', endsOn: '2027-07-02', clientName: 'Sam Reid', clientFirst: 'Sam', coachName: 'Dr. Tim Dutton', coachFirst: 'Tim' };
const funded = { ...sam, funder: 'org', fundedBy: 'Northfield Logistics' };

test('the cover: prepared for and by, the version or the quote number, and the coach’s note (M28 s-c-sign, s-q-client)', () => {
  assert.equal(m.preparedLine({ clientName: 'Sam Reid', coachName: 'Dr. Tim Dutton', version: 1 }), 'Prepared for Sam Reid by Dr. Tim Dutton · Version 1');
  assert.equal(m.preparedLine({ clientName: 'Sam Reid', coachName: 'Dr. Tim Dutton', quoteNo: 42 }), 'Prepared for Sam Reid by Dr. Tim Dutton · Quote Q-0042');
  assert.equal(m.noteText('  It was good to talk on Thursday. '), 'It was good to talk on Thursday.');
  assert.equal(m.noteText(''), 'Here is everything we agreed.');
});

test('signing waits while a change is unanswered, naming the clause by its number (item 36)', () => {
  const clauses = [{ key: 'purpose', number: 1, title: 'Purpose' }, { key: 'ending', number: 8, title: 'Ending and changes' }];
  const clause = m.pendingClause({ clause_key: 'ending' }, clauses);
  assert.equal(clause, '8. Ending and changes');
  assert.equal(m.pendingLine(clause, 'Tim'), 'You asked for a change to 8. Ending and changes. Tim will look at it and send you a new version to sign.');
  assert.equal(m.pendingClause({ clause_key: 'gone', title: 'Old clause' }, clauses), 'Old clause');
  assert.equal(m.askedLine('Tim'), 'Sent to Tim. You’ll get a new version to sign.');
  assert.equal(m.sendChangeWords('Tim'), 'Send to Tim');
});

test('what is missing before signing, one line at a time in M28’s order', () => {
  assert.equal(m.signNeeds({}), 'Tick the box to say you agree.');
  assert.equal(m.signNeeds({ agreed: true, name: ' ' }), 'Add your full name.');
  assert.equal(m.signNeeds({ agreed: true, name: 'Sam Reid' }), 'Draw or type your signature.');
  assert.equal(m.signNeeds({ agreed: true, name: 'Sam Reid', hasSignature: true }), null);
});

test('self-funded signs and continues to settle; a funded client signs and has no Settle step', () => {
  assert.equal(m.signButton(sam), 'Sign and continue');
  assert.equal(m.signButton(funded), 'Sign my agreement');
  assert.deepEqual(m.stepsFor(sam), ['Read', 'Sign', 'Settle']);
  assert.deepEqual(m.stepsFor(funded), ['Read', 'Sign']);
  assert.equal(m.afterSigning(sam, 'upfront'), 'settle');
  assert.equal(m.afterSigning(funded, 'upfront'), 'welcome');
});

test('up front is the starting choice where the client chooses, else the signed one (item 37)', () => {
  assert.equal(m.choiceFor(sam, null), 'upfront');
  assert.equal(m.choiceFor(sam, 'plan'), 'plan');
  assert.equal(m.choiceFor({ ...sam, settle: 'full' }, null), 'upfront');
});

test('settling: up front £14,535 with nothing more; instalments with Direct Debit for the rest; the 14-day line (items 8, 14)', () => {
  const up = m.settleView(sam, 'upfront');
  assert.equal(up.title, 'Your investment');
  assert.equal(up.amount, '£14,535');
  assert.equal(up.button, 'Settle £14,535');
  assert.equal(up.rest, 'Nothing more to settle. You saved £765.');
  assert.equal(up.bacs, false);
  assert.equal(up.cooling, 'You can still change your mind within 14 days.');
  const plan = m.settleView(sam, 'plan');
  assert.equal(plan.title, 'First instalment');
  assert.equal(plan.amount, '£2,550');
  assert.equal(plan.rest, 'Then 5 more monthly instalments of £2,550, collected the same way.');
  assert.equal(plan.bacs, true);
  assert.equal(m.settleView({ ...sam, currency: 'EUR' }, 'plan').bacs, false, 'Bacs is pounds only (risk 16)');
  assert.equal(m.settleView(sam, 'plan', 255000).amount, '£2,550', 'the server’s own amount wins when it answers');
  assert.equal(SETTLE_LINE, 'You can still change your mind within 14 days.');
  assert.equal(START_NOW_LINE, 'Start my coaching straight away. If I cancel within 14 days, I’m only charged for the coaching sessions I’ve had.');
});

test('the welcome: no pay word, and the first day a coaching session can be booked', () => {
  assert.equal(m.welcomeTitle('Sam'), 'You’re in, Sam.');
  assert.equal(m.welcomeLine({ coachFirst: 'Tim', settled: '£14,535' }), 'Tim has your signed agreement, and your first £14,535 is settled. Your receipt is in your email.');
  assert.equal(m.welcomeLine({ coachFirst: 'Tim' }), 'Tim has your signed agreement. Your receipt is in your email.');
  // Signed Wed 25 Nov 2026, starting Mon 4 Jan 2027: the start date, ticked or not.
  assert.equal(m.firstSessionLine({ terms: sam, signedDay: '2026-11-25', startNow: false }), 'From Mon 4 Jan 2027');
  // Starting sooner than the 14 days: without the tick, the day after them (Thu 10 Dec); with it, the start date.
  const soon = { ...sam, startsOn: '2026-11-30' };
  assert.equal(m.firstSessionLine({ terms: soon, signedDay: '2026-11-25', startNow: false }), 'From Thu 10 Dec 2026');
  assert.equal(m.firstSessionLine({ terms: soon, signedDay: '2026-11-25', startNow: true }), 'From Mon 30 Nov 2026');
  // Never a day already passed (UI finding 7).
  assert.equal(m.firstSessionLine({ terms: { ...soon, startsOn: '2026-11-16' }, signedDay: '2026-11-20', startNow: true, today: '2026-11-25' }), 'From Wed 25 Nov 2026');
  assert.equal(m.welcomeRows({ terms: sam }).map((r) => r.title).join(' | '), 'Book your first coaching session | Your welcome pack | Your signed agreement and receipt');
});

test('the sponsor’s words (M28 s-s-sign, s-s-signed)', () => {
  assert.equal(m.sponsorTick('Northfield Logistics'), 'I’ve read this agreement and I agree to it for Northfield Logistics.');
  assert.equal(m.sponsorButton('Northfield Logistics'), 'Sign for Northfield Logistics');
  assert.equal(m.sponsorSignedLine('Tim'), 'Signed. Tim has a copy, and we’ve emailed yours to you.');
});

test('the block of hours: meter, balance and entries, newest first (item 24; M28 s-h-client)', () => {
  const v = m.hoursView({ agreement_id: 'a', work: 'The team Health Check', block_minutes: 800, used_minutes: 640, entries: [
    { day: '2026-11-10', minutes: 90, note: 'Outline agreed with Adie' }, { day: '2026-11-23', minutes: 120, note: 'Scoring for the team report' },
  ] }, '2026-11-25');
  assert.equal(v.share, 0.8);
  assert.equal(v.line, '10 hours 40 minutes used of 13 hours 20 minutes, 2 hours 40 minutes left.');
  assert.deepEqual(v.entries.map((e) => [e.title, e.meta, e.length]), [['Scoring for the team report', 'Mon 23 Nov', '2 h 00'], ['Outline agreed with Adie', 'Tue 10 Nov', '1 h 30']]);
  assert.equal(m.hoursMeta({ block_minutes: 800, used_minutes: 640 }), '80% used');
});

test('invoices: to settle first, Overdue once past due, then settled (M28 s-payments)', () => {
  const list = m.invoiceList([
    { id: '1', number: 'CLARITY-1238', status: 'paid', currency: 'GBP', totalMinor: 300000, paidDay: '2026-10-19', hostedUrl: 'https://x/1' },
    { id: '2', number: 'CLARITY-1243', status: 'sent', currency: 'GBP', totalMinor: 300000, dueOn: '2026-11-16', hostedUrl: 'https://x/2' },
    { id: '3', number: 'CLARITY-1250', status: 'sent', currency: 'EUR', totalMinor: 125000, dueOn: '2026-12-09', hostedUrl: null },
  ], '2026-11-25');
  assert.deepEqual(list.map((r) => [r.number, r.meta, r.overdue, r.settled]), [
    ['CLARITY-1243', '£3,000, due Mon 16 Nov', true, false],
    ['CLARITY-1250', '€1,250, due Wed 9 Dec', false, false],
    ['CLARITY-1238', '£3,000, settled Mon 19 Oct', false, true],
  ]);
});

test('My Account’s rows only where there is something behind them; Your plan only once plans are on', () => {
  assert.deepEqual(m.accountRows({}), []);
  const rows = m.accountRows({ hasAgreement: true, seesInvoices: true, hours: [{ block_minutes: 800, used_minutes: 640 }] });
  assert.deepEqual(rows.map((r) => [r.title, r.to]), [['Coaching', '/coaching'], ['Invoices', '/my-account/invoices'], ['Block of hours', '/my-account/hours']]);
  assert.equal(m.accountRows({ planLine: 'Individual' })[0].title, 'Your plan');
});

test('levels: gating off by default, so nothing is ever locked (plan risk 20)', () => {
  assert.equal(lv.GATING_ON, false);
  assert.equal(lv.isLocked(['individual', 'executive'], 'free'), false);
  assert.equal(lv.isLocked(['individual', 'executive'], 'free', true), true);
  assert.equal(lv.isLocked(['individual', 'executive'], 'executive', true), false);
  assert.equal(lv.onPlans(['individual', 'executive']), 'On Individual and Executive');
  assert.deepEqual(lv.levelOf([]), { level: 'free', endsOn: null, source: 'self', periodEnd: null });
  assert.equal(lv.levelOf([{ level: 'individual', status: 'active', created_at: '2026-10-01' }, { level: 'free', status: 'cancelled', created_at: '2026-11-01' }]).level, 'individual');
  assert.equal(lv.cancelLine('individual', '2026-12-18'), 'Your Individual plan ends on Fri 18 Dec.');
  assert.equal(lv.chooseWords('executive'), 'Choose Executive');
  assert.match(lv.PLANS[0].line, /Daily plan, the Daily review/, 'the daily tools’ names (CLAUDE.md rule 26a)');
});

test('no client-facing string in Group C’s files says pay, paid or payment (Apple Pay is a product name), or Opened', () => {
  const files = [
    'src/lib/coaching/clientMoney.js', 'src/lib/levels.js', 'src/pages/coaching/SignAgreement.jsx', 'src/pages/coaching/Settle.jsx',
    'src/pages/coaching/Welcome.jsx', 'src/pages/coaching/SignBox.jsx', 'src/components/design/LockedTile.jsx',
    ...readdirSync('src/pages/agreementLink').map((f) => `src/pages/agreementLink/${f}`),
    ...readdirSync('src/pages/account').map((f) => `src/pages/account/${f}`),
  ];
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1'); // comments are for builders, not clients
    const strings = [...src.matchAll(/'((?:[^'\\\n]|\\.)*)'|`([^`]*)`|>([^<>{}\n]+)</g)].map((x) => x[1] ?? x[2] ?? x[3]).filter(Boolean);
    for (const s of strings) {
      if (/^[./@]|^[a-z_-]+$|^\w+:\/\/|className|^\$\{/.test(s)) continue; // paths, keys and classes
      assert.ok(!/\b(pay|pays|paid|paying|unpaid|payment)\b/i.test(s.replace(/Apple Pay/g, '')), `${f}: ${s}`);
      assert.ok(!/\bOpened\b/.test(s), `${f}: ${s}`);
    }
  }
});

test('Read, Sign and Settle in focus mode (Polish 1, Stage C, C3; M28 v6 "sign" and "quote")', () => {
  assert.equal(m.FLOW.readNext, 'I’ve read it');
  assert.equal(m.FLOW.signNext, 'Sign');
  assert.equal(m.FLOW.doneTitle, 'You’re all set');
  assert.equal(m.clauseCount(16), '16 clauses');
  assert.equal(m.clauseCount(1), '1 clause');
  assert.equal(m.preparedFor({ clientFirst: 'Sam', clientName: 'Sam Carter', coachName: 'Dr. Tim Dutton' }), 'Prepared for Sam by Dr. Tim Dutton');
  assert.equal(m.preparedFor({ clientName: 'Sam Carter', coachName: 'Alex Morgan' }), 'Prepared for Sam by Alex Morgan');
  assert.equal(m.preparedFor({}), 'Your coaching agreement');
  assert.equal(m.doneLine({ coachFirst: 'Tim' }), 'Tim has your signed agreement. A copy is on its way to your email.');
  assert.equal(m.doneLine({ coachFirst: 'Tim', settled: '£750' }), 'Tim has your signed agreement, and your first £750 is settled. A copy is on its way to your email.');
  assert.equal(m.quoteLabel({ number: 42, validUntil: '2026-12-25' }), 'Quotation Q-0042 · Valid until Fri 25 Dec');
  assert.equal(m.quoteLabel({}), 'Quotation');
  assert.equal(m.FLOW.askSent('Tim'), 'Sent to Tim. You can sign once they reply with a new version.');
  // The switch: short words in it, the full words of the one chosen under it (nothing wraps inside a control).
  const opts = m.settleSwitchOptions(sam, '6 monthly instalments of £2,550', []);
  assert.deepEqual(opts.map((o) => o.short), ['Up front, 5% off', 'Monthly']);
  assert.ok(opts.every((o) => o.short.length <= 18));
  assert.match(opts[0].long, /^Up front, £[\d,]+, 5% off$/);
  assert.equal(opts[1].long, '6 monthly instalments of £2,550');
  assert.equal(m.settleSwitchOptions({ ...sam, settle: 'deposit' }, 'x', [])[1].short, 'Deposit, then monthly');
});
