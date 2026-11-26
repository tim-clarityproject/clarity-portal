// The client's agreements, signing and Billing (Phase 6b run 1, mock-up M13 A1 to A8): what
// my_agreements() and my_invoices() (migration 061) answer, tidied into what the screens draw.
// Pure rules only (src/lib/coaching/agreementRules.js); nothing here reads a database.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALREADY_SIGNED, BILLING, NEEDS, OFFLINE_SIGN, agreementRows, agreementSections, billingLine, billingView, currentAgreement, fundsLine,
  agreementTitle, canSignVersion, glanceRows, investedSoFar, isSignatureImage, nameOk, nextInvoice, readyLine, readyToSign, sentLabel, showsBilling, signError, signProblems,
  signatureFor, signedLabel, signedVersions, termsFor, thankYou, tidyAgreements, tidyInvoice, versionTitle, waitingToSign,
} from '../../src/lib/coaching/agreementRules.js';
import { clauses, mainPoints } from '../../src/lib/billing/agreementText.js';

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TODAY = '2026-10-28';
const BEN_TERMS = {
  coaching: '4-month coaching', sessions: 10, minutes: 60, place: 'Zoom', rhythm: 'every 2 weeks', startsOn: '2026-09-24', endsOn: '2027-01-15',
  currency: 'GBP', total_minor: 200000, instalments: 5, clientName: 'Ben Carter', clientEmail: 'ben@example.invalid', coachName: 'Dr. Tim Dutton', coachFirst: 'Tim',
};
// What my_agreements() gives a funded client: the database has already cut the money keys.
const PRIYA_TERMS = {
  coaching: '6-month coaching', sessions: 12, minutes: 60, place: 'Zoom', rhythm: 'every 2 weeks', startsOn: '2026-08-27', endsOn: '2027-03-31',
  clientName: 'Priya Shah', clientEmail: 'priya@example.invalid', coachName: 'Dr. Tim Dutton', coachFirst: 'Tim',
};
const version = (n, over = {}) => ({
  id: id(n), agreement_id: id(100), reference: 'CLARITY-AG-0007', version: 1, status: 'sent', current: true,
  sent_at: '2026-10-27T09:00:00+00:00', client_signed_at: null, coach_signed_at: '2026-10-27T08:59:00+00:00',
  funded_by: null, currency: 'GBP', fx_rate: null, fx_at: null, total_minor: 200000, terms: BEN_TERMS, clauses: clauses(BEN_TERMS),
  changes: [], signed_name: null, signed_email: null, fingerprint: null, ...over,
});
const invoice = (n, over = {}) => ({
  id: id(n), number: `CLARITY-${1200 + n}`, status: 'sent', currency: 'GBP', total_minor: 40000, paid_minor: 0,
  due_on: '2026-11-02', issued_on: '2026-10-19', paid_at: null, hosted_url: `https://invoice.stripe.com/i/${n}`, lines: [], kind: 'instalment', ...over,
});

test('versions from my_agreements(): tidied, anything that can’t be drawn left out', () => {
  const rows = agreementRows([version(1), null, { id: 'nope' }, version(2, { version: 0 }), version(3, { status: 'draft' }), 'x']);
  assert.equal(rows.length, 1);
  const [v] = rows;
  assert.equal(v.version, 1);
  assert.equal(v.totalMinor, 200000);
  assert.equal(v.currency, 'GBP');
  assert.deepEqual(agreementRows(null), []);
  assert.deepEqual(tidyAgreements(undefined), { tidied: true, ready: false, agreements: [], invoices: [] });
});

test('the version ready to sign is the sent, current, unsigned one; signed ones are rows, newest first', () => {
  const rows = agreementRows([
    version(3, { version: 3 }),
    version(2, { version: 2, status: 'superseded', current: false, client_signed_at: '2026-08-27T10:00:00Z' }),
    version(1, { version: 1, status: 'superseded', current: false, client_signed_at: '2025-03-03T10:00:00Z' }),
  ]);
  assert.equal(readyToSign(rows).version, 3);
  assert.deepEqual(signedVersions(rows).map((v) => v.version), [2, 1]);
  assert.equal(currentAgreement(rows).version, 3);
  // A sent version that isn't the current one is never offered.
  assert.equal(readyToSign(agreementRows([version(4, { current: false })])), null);
  // Once signed, nothing is waiting, and the signed one sets out the coaching.
  const after = agreementRows([version(3, { version: 3, status: 'signed', client_signed_at: '2026-10-28T18:40:00Z' })]);
  assert.equal(readyToSign(after), null);
  assert.equal(currentAgreement(after).version, 3);
});

test('two separate agreements waiting: either can be signed, each by its own name; a newer version of the same one blocks the older (F1, P9)', () => {
  const rows = agreementRows([
    version(5, { version: 1, agreement_id: id(200), terms: { ...BEN_TERMS, coaching: '', kind: 'hours', hours: { work: 'leadership offsite support' } } }),
    version(3, { version: 2 }),
    version(2, { version: 1, status: 'superseded', current: false }),
  ]);
  assert.deepEqual(waitingToSign(rows).map((v) => v.id), [id(5), id(3)]);
  assert.equal(canSignVersion(rows, id(5)), true);
  assert.equal(canSignVersion(rows, id(3)), true);
  assert.equal(canSignVersion(rows, id(2)), false, 'the older version of the same agreement waits behind its newer one');
  assert.equal(agreementTitle(rows[0]), 'Leadership offsite support');
  assert.equal(agreementTitle({ terms: { kind: 'hours' } }), 'Block of hours');
  assert.equal(agreementTitle({ terms: {} }), 'Coaching agreement');
  assert.equal(readyLine(rows[0]), 'Your agreement for Leadership offsite support is ready to sign.');
  assert.equal(readyLine({ version: 2, terms: { coaching: '6-month coaching' } }), 'Version 2 of your agreement for 6-month coaching is ready to sign.');
  assert.equal(readyLine({ version: 1, terms: { coaching: 'Leadership Accelerator, 6 months' } }), 'Your agreement for Leadership Accelerator, 6 months is ready to sign.');
  assert.equal(readyLine({ version: 1, terms: { kind: 'hours' } }), 'Your agreement for a block of hours is ready to sign.');
  assert.equal(versionTitle({ version: 2, terms: { coaching: '6-month coaching' } }), '6-month coaching, version 2');
});

test('At a glance is the wording’s Main points, with the investment for a self-funded client', () => {
  const [v] = agreementRows([version(1)]);
  assert.deepEqual(glanceRows(v), mainPoints({ ...BEN_TERMS, fundedBy: null }));
  assert.ok(glanceRows(v).some((r) => r.label === 'Your investment' && r.value === '£2,000, in 5 monthly instalments of £400'));
});

test('a funded client sees who funds it and never an amount: glance, sections, terms and Billing', () => {
  // Even if an amount slipped into the answer, it is cut again here.
  const raw = version(5, { funded_by: 'Larkfield Health', currency: 'GBP', total_minor: 999900, terms: { ...PRIYA_TERMS, total_minor: 999900, instalments: 3, payment: 'x' },
    clauses: clauses({ ...PRIYA_TERMS, fundedBy: 'Larkfield Health', total_minor: 999900 }, { seesMoney: true }) });
  const [v] = agreementRows([raw]);
  assert.equal(v.totalMinor, null);
  assert.equal(v.currency, null);
  const t = termsFor(v);
  for (const k of ['total_minor', 'instalments', 'payment', 'currency']) assert.equal(k in t, false, k);
  const glance = glanceRows(v);
  assert.ok(glance.some((r) => r.label === 'Funded by' && r.value === 'Larkfield Health'));
  assert.equal(glance.some((r) => r.label === 'Your investment'), false);
  const sections = agreementSections(v);
  assert.equal(sections.some((c) => c.title === 'Your investment'), false);
  assert.equal(/£|9,999/.test(JSON.stringify({ glance, sections })), false);
  // Numbered on with none missing.
  assert.deepEqual(sections.filter((c) => c.number).map((c) => c.number), sections.filter((c) => c.number).map((_, i) => i + 1));
  const view = billingView({ agreements: [v], invoices: [] }, TODAY);
  assert.deepEqual(view, { funded: 'Larkfield Health' });
  assert.equal(fundsLine(view.funded), 'Larkfield Health funds your coaching.');
  assert.equal(BILLING.nothing, 'There’s nothing for you to settle.');
  assert.equal(showsBilling({ agreements: [v], invoices: [] }), false);
});

test('sections are the clauses kept with the version, numbered as read, else the wording from its terms', () => {
  const [kept] = agreementRows([version(1)]);
  const sections = agreementSections(kept);
  assert.equal(sections[0].title, null);
  assert.equal(sections[1].number, 1);
  assert.equal(sections[1].title, 'Purpose');
  assert.ok(sections.some((c) => c.title === 'Your investment'));
  const [bare] = agreementRows([version(2, { clauses: [] })]);
  assert.deepEqual(agreementSections(bare).map((c) => c.title), clauses(BEN_TERMS).map((c) => c.title));
});

test('the lines the screens say', () => {
  const [v] = agreementRows([version(1, { version: 3 })]);
  assert.equal(sentLabel(v, 'Tim', TODAY), 'Version 3, sent by Tim yesterday');
  assert.equal(sentLabel({ ...v, sentAt: '2026-10-19T09:00:00Z' }, 'Tim', TODAY), 'Version 3, sent by Tim on Mon 19 Oct');
  assert.equal(sentLabel({ ...v, sentAt: '2026-10-28T09:00:00Z' }, '', TODAY), 'Version 3, sent by your coach today');
  assert.match(signedLabel('2026-10-28T17:40:00Z', TODAY), /^Signed Wed 28 Oct at \d\d:40$/);
  assert.equal(thankYou('Ben Carter'), 'Thank you, Ben.');
  assert.equal(thankYou(''), 'Thank you.');
  assert.equal(versionTitle(3), 'Coaching agreement, version 3');
  assert.equal(readyLine(3), 'Version 3 of your coaching agreement is ready to sign.');
  // Clients invest and settle, never pay (the brief over M13).
  const all = JSON.stringify(BILLING);
  assert.equal(/\b[Pp]ay|[Pp]aid\b/.test(all), false);
  assert.equal(BILLING.meta, 'Invoices from The Clarity Project LTD');
  assert.equal(BILLING.settle, 'Settle my invoice');
  assert.equal(BILLING.invested, 'Invested so far');
});

test('invoices: the next one to settle, Invested so far, and each row’s status', () => {
  const invs = [
    invoice(43, { due_on: '2026-11-02' }),
    invoice(42, { status: 'paid', paid_minor: 40000, paid_at: '2026-10-02T09:00:00Z', due_on: '2026-10-02' }),
    invoice(31, { status: 'paid', paid_minor: 40000, paid_at: '2026-09-02T09:00:00Z', due_on: '2026-09-02' }),
    invoice(44, { due_on: '2026-12-02', paid_minor: 10000 }),
  ].map(tidyInvoice);
  assert.equal(nextInvoice(invs).number, 'CLARITY-1243');
  assert.equal(investedSoFar(invs), 90000);
  assert.equal(billingLine(invs, TODAY), 'Invoice CLARITY-1243 is due on Mon 2 Nov.');
  const [v] = agreementRows([version(1, { status: 'signed', client_signed_at: '2026-09-24T10:00:00Z' })]);
  const view = billingView({ agreements: [v], invoices: invs }, TODAY);
  assert.equal(view.funded, null);
  assert.equal(view.next.amount, '£400');
  assert.equal(view.next.line, 'It’s due on Mon 2 Nov.');
  assert.equal(view.invested.amount, '£900');
  assert.equal(view.invested.total, '£2,000');
  assert.equal(view.invested.share, 0.45);
  assert.deepEqual(view.rows.map((r) => [r.number, r.amount, r.state.text, r.state.good]), [
    ['CLARITY-1244', '£400', 'Due Wed 2 Dec', false],
    ['CLARITY-1243', '£400', 'Due Mon 2 Nov', false],
    ['CLARITY-1242', '£400', 'Settled Fri 2 Oct', true],
    ['CLARITY-1231', '£400', 'Settled Wed 2 Sep', true],
  ]);
  assert.equal(showsBilling({ agreements: [v], invoices: invs }), true);
  // Nothing left to settle: no next invoice and no line.
  const settled = invs.filter((i) => i.status === 'paid');
  assert.equal(nextInvoice(settled), null);
  assert.equal(billingLine(settled, TODAY), '');
  assert.equal(billingView({ agreements: [v], invoices: settled }, TODAY).next, null);
});

test('an invoice page opens only over https; a broken row is left out', () => {
  assert.equal(tidyInvoice(invoice(1, { hosted_url: 'http://example.com/x' })).hostedUrl, null);
  assert.equal(tidyInvoice(invoice(1, { hosted_url: 'javascript:alert(1)' })).hostedUrl, null);
  assert.equal(tidyInvoice(invoice(1)).hostedUrl, 'https://invoice.stripe.com/i/1');
  assert.equal(tidyInvoice(invoice(1, { number: '0156' })), null);
  assert.equal(tidyInvoice(invoice(1, { status: 'draft' })), null);
});

test('signing: what is missing is said under its part, and the button is never greyed out', () => {
  assert.deepEqual(signProblems({ mode: 'draw', ink: false, name: 'Ben Carter', ticked: true }), { signature: NEEDS.draw, name: null, tick: null });
  assert.deepEqual(signProblems({ mode: 'draw', ink: true, name: 'Ben Carter', ticked: true }).signature, NEEDS.use);
  assert.deepEqual(signProblems({ mode: 'saved', saved: true, name: 'Be', ticked: false }), { signature: null, name: NEEDS.name, tick: NEEDS.tick });
  assert.equal(signProblems({ mode: 'saved', saved: true, name: 'Ben Carter', ticked: true }), null);
  assert.equal(signProblems({ mode: 'typed', name: 'Ben Carter', ticked: true }), null);
  assert.equal(signProblems({ mode: 'typed', name: '  B ', ticked: true }).name, NEEDS.name);
  assert.equal(nameOk('Ben'), true);
  assert.equal(nameOk('x'.repeat(161)), false);
});

test('a drawn signature fits 061’s check: a PNG data URL of 200 to 300,000 characters', () => {
  const ok = `data:image/png;base64,${'A'.repeat(300)}`;
  assert.equal(isSignatureImage(ok), true);
  assert.equal(isSignatureImage('data:image/png;base64,AAAA'), false);
  assert.equal(isSignatureImage(`data:image/png;base64,${'A'.repeat(300001)}`), false);
  assert.equal(isSignatureImage(`data:image/svg+xml;base64,${'A'.repeat(300)}`), false);
  assert.equal(isSignatureImage(`data:image/png;base64,${'A'.repeat(298)}<>`), false);
});

test('a refused signing says the database’s own sentence; offline keeps everything with M13’s words', () => {
  assert.deepEqual(signError({ code: 'CC409', message: ALREADY_SIGNED }), { kind: 'signed', lines: [ALREADY_SIGNED] });
  const changed = 'This agreement changed since you opened it. Open it again to read the newest version.';
  assert.deepEqual(signError({ code: 'CC409', message: changed }), { kind: 'refused', lines: [changed] });
  assert.deepEqual(signError({ code: '42501', message: 'Confirm your email address to sign.' }).lines, ['Confirm your email address to sign.']);
  assert.deepEqual(signError(new TypeError('Failed to fetch'), { online: false }), { kind: 'offline', lines: [...OFFLINE_SIGN] });
  assert.deepEqual(OFFLINE_SIGN, ['That didn’t send, because you’re offline.', 'Your signature and tick are kept, so try again when you’re back online.']);
  // Raw technical text is never shown.
  assert.deepEqual(signError({ code: 'XX000', message: 'internal error at line 4' }).kind, 'problem');
});

test('the signed PDF finds the signature it was signed with', () => {
  const [v] = agreementRows([version(1, { status: 'signed', client_signed_at: '2026-10-28T18:40:00.5Z' })]);
  const sigs = [
    { id: id(9), kind: 'drawn', created_at: '2026-10-29T10:00:00Z' },
    { id: id(8), kind: 'typed', created_at: '2026-10-28T18:40:00.2Z' },
    { id: id(7), kind: 'drawn', created_at: '2026-10-01T10:00:00Z' },
  ];
  assert.equal(signatureFor(v, sigs).id, id(8));
  assert.equal(signatureFor({ ...v, signatureId: id(7) }, sigs).id, id(7));
  assert.equal(signatureFor({ ...v, signedAt: null }, sigs), null);
});

test('tidied twice is the same as tidied once (UI tester, 6b run 1: a second pass lost every amount, day and funder)', async () => {
  const { tidyAgreements } = await import('../../src/lib/coaching/agreementRules.js');
  const raw = { ready: true, agreements: [{ id: '11111111-1111-4111-8111-111111111111', agreement_id: '22222222-2222-4222-8222-222222222222', version: 1, status: 'signed', current: true,
    sent_at: '2026-09-04T09:00:00Z', client_signed_at: '2026-09-07T10:00:00Z', coach_signed_at: '2026-09-04T09:00:00Z', funded_by: null, currency: 'GBP', total_minor: 1800000, terms: {}, clauses: [] }],
  invoices: [{ id: '33333333-3333-4333-8333-333333333333', number: 'CLARITY-1243', status: 'sent', currency: 'GBP', total_minor: 300000, paid_minor: 0, due_on: '2026-11-17', hosted_url: 'https://invoice.stripe.example/1' }] };
  const once = tidyAgreements(raw);
  const twice = tidyAgreements(once);
  assert.deepEqual(twice, once);
  assert.equal(twice.invoices[0].totalMinor, 300000);
  assert.equal(twice.invoices[0].dueOn, '2026-11-17');
});

test('functionality tester, 6b run 1: a due day already gone reads "was due"', async () => {
  const { dueLine, billingLine } = await import('../../src/lib/coaching/agreementRules.js');
  const inv = { id: 'x', number: 'CLARITY-1208', status: 'sent', dueOn: '2026-11-17', totalMinor: 300000, paidMinor: 0, currency: 'GBP' };
  assert.match(dueLine(inv, '2026-11-24'), /^It was due on /);
  assert.match(dueLine(inv, '2026-11-10'), /^It’s due on /);
  assert.match(billingLine([inv], '2026-11-24'), /^Invoice CLARITY-1208 was due on /);
});

test('break-it tester, 6b run 1: a name of only invisible marks, or with markup, isn\'t a name; letters in any script are', async () => {
  const { nameOk, cleanName } = await import('../../src/lib/coaching/agreementRules.js');
  assert.equal(nameOk('​​​‮'), false);
  assert.equal(nameOk('<b>Sam</b>'), false);
  assert.equal(nameOk('123'), false);
  assert.equal(nameOk('Sam Reid'), true);
  assert.equal(nameOk('שלום כהן'), true);
  assert.equal(cleanName('Sam ‏Reid'), 'Sam Reid');
});
