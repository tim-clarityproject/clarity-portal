// Polish 1, Stage C: the functionality tester's faults in the agreements engine (FX4), each proved here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { agreementsApi, sendAs } from '../../api/_routes/coach-agreements.js';
import { blankTerms } from '../../src/lib/agreements/terms.js';
import { forStorage } from '../../src/lib/agreements/clauses.js';
import { futureSessionRows, sessionRanges } from '../../src/lib/agreements/coolingOff.js';
import { fakeDb065, numberRpc } from './_fakeDb065.mjs';

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const COACH = { id: U(1), role: 'owner', active: true, user_id: U(2) };
const LIVE = { VERCEL_ENV: 'production', RESEND_API_KEY: 're_stub_only', COACH_EMAIL_FROM: 'The Clarity Portal <portal@example.invalid>' };
const terms = (extra = {}) => ({ ...blankTerms('sessions'), coaching: '6-month coaching', clientName: 'Sam Reid', clientFirst: 'Sam', coachName: 'Dr. Tim Dutton', coachFirst: 'Tim',
  totalMinor: 1800000, settle: 'full', ...extra });

// ---------------------------------------------------------------- F1: cancelling one agreement keeps another's sessions

test('F1: the ranges: a session is the cancelled agreement’s only inside its term and outside every other running agreement', () => {
  const a = { id: 'a1', profile_id: 'p', status: 'signed' };
  const b = { id: 'a2', profile_id: 'p', status: 'signed' };
  const old = { id: 'a0', profile_id: 'p', status: 'ended' };
  const versions = [
    { agreement_id: 'a1', version: 1, status: 'signed', client_signed_at: '2026-11-20T10:00:00Z', terms: terms({ startsOn: '2026-12-14', endsOn: '2027-06-11' }) },
    { agreement_id: 'a2', version: 1, status: 'signed', client_signed_at: '2026-09-01T10:00:00Z', terms: terms({ startsOn: '2026-09-07', endsOn: '2026-12-11' }) },
    { agreement_id: 'a0', version: 1, status: 'signed', client_signed_at: '2026-01-01T10:00:00Z', terms: terms({ startsOn: '2026-01-05', endsOn: '2026-12-31' }) },
  ];
  const r = sessionRanges({ agreement: a, agreements: [a, b, old], versions });
  assert.deepEqual(r.own, { from: '2026-11-20', to: '2027-06-11' });
  assert.deepEqual(r.others, [{ from: '2026-09-01', to: '2026-12-11' }], 'the ended one protects nothing');
  const sessions = ['2026-12-01', '2026-12-10', '2026-12-15', '2027-03-01', '2027-07-01'].map((d, i) => ({ id: `s${i}`, profile_id: 'p', kind: 'coaching', starts_at: `${d}T10:00:00Z` }));
  const out = futureSessionRows('p', { sessions, now: Date.parse('2026-11-25T12:00:00Z'), ranges: r, zone: 'Europe/London' });
  assert.deepEqual(out.sessions.map((s) => s.id), ['s2', 's3'], 'the other running agreement’s (to 11 Dec) and after the end stay');
});

test('F1: a renewal cancelled within 14 days takes only its own next term, never the running term’s sessions', () => {
  const run = { id: 'r1', profile_id: 'p', status: 'signed' };
  const renewal = { id: 'r2', profile_id: 'p', status: 'signed', renews_id: 'r1' };
  const versions = [
    { agreement_id: 'r1', version: 1, status: 'signed', client_signed_at: '2026-06-01T10:00:00Z', terms: terms({ startsOn: '2026-06-08', endsOn: '2026-12-04' }) },
    { agreement_id: 'r2', version: 1, status: 'signed', client_signed_at: '2026-11-20T10:00:00Z', terms: terms({ startsOn: '2026-12-07', endsOn: '2027-06-04' }) },
  ];
  const sessions = ['2026-11-27', '2026-12-03', '2026-12-08', '2027-01-05'].map((d, i) => ({ id: `s${i}`, profile_id: 'p', kind: 'coaching', starts_at: `${d}T10:00:00Z` }));
  const r = sessionRanges({ agreement: renewal, agreements: [run, renewal], versions });
  const out = futureSessionRows('p', { sessions, now: Date.parse('2026-11-25T12:00:00Z'), ranges: r });
  assert.deepEqual(out.sessions.map((s) => s.id), ['s2', 's3']);
});

function world() {
  const t = terms({ startsOn: '2026-12-14', endsOn: '2027-06-11' });
  const db = fakeDb065({
    coaches: [{ id: COACH.id, user_id: COACH.user_id, role: 'owner', display_first_name: 'Tim', email: 'tim@example.invalid', active: true }],
    client_profiles: [{ id: U(10), coach_id: COACH.id, name: 'Sam Reid', email: 'sam@example.invalid', time_zone: 'Europe/London', user_id: U(11) }],
    agreements: [
      { id: U(30), coach_id: COACH.id, kind: 'coaching', profile_id: U(10), status: 'signed', current_version: 1, agreement_kind: 'sessions' },
      { id: U(40), coach_id: COACH.id, kind: 'coaching', profile_id: U(10), status: 'signed', current_version: 1, agreement_kind: 'hours' },
    ],
    agreement_versions: [
      { id: U(31), agreement_id: U(30), coach_id: COACH.id, version: 1, status: 'signed', terms: t, clauses: forStorage(t), currency: 'GBP', funded_by: null,
        client_signed_at: '2026-11-20T10:00:00Z', start_now: true, settle_choice: 'plan' },
      { id: U(41), agreement_id: U(40), coach_id: COACH.id, version: 1, status: 'signed', terms: terms({ kind: 'hours', startsOn: '2026-10-05', endsOn: '2027-01-29' }), clauses: [], currency: 'GBP', funded_by: null,
        client_signed_at: '2026-10-01T10:00:00Z' },
    ],
    invoices: [],
    coach_sessions: [
      { id: U(50), coach_id: COACH.id, profile_id: U(10), kind: 'coaching', starts_at: '2026-12-01T10:00:00Z', minutes: 60, outcome: null }, // the other agreement's: stays
      { id: U(51), coach_id: COACH.id, profile_id: U(10), kind: 'coaching', starts_at: '2027-02-01T10:00:00Z', minutes: 60, outcome: null }, // its own: goes
    ],
    coach_cal_items: [{ id: U(80), coach_id: COACH.id, session_id: U(50), kind: 'client_call' }, { id: U(81), coach_id: COACH.id, session_id: U(51), kind: 'client_call' }],
    coach_cal_guests: [],
  }, { unique: { agreement_cancellations: [['agreement_id']], credit_notes: [['number']] }, rpc: { invoice_take_number: numberRpc() } });
  const send = async (e, msg) => sendAs(e, msg, { fetcher: async () => ({ ok: true, status: 200 }) });
  return { db, api: agreementsApi({ db, server: db, coach: COACH, env: LIVE, send, now: () => new Date('2026-11-25T12:00:00Z') }) };
}

test('F1 on the server: cancelling one of a client’s two agreements leaves the other’s sessions and calls', async () => {
  const w = world();
  const out = await w.api.cancel14({ agreementId: U(30) });
  assert.equal(out.sessionsOff, 1);
  assert.deepEqual(w.db.tables.coach_sessions.map((x) => x.id), [U(50)], 'the block of hours’ session stays');
  assert.deepEqual(w.db.tables.coach_cal_items.map((x) => x.id), [U(80)], 'its call stays');
  assert.deepEqual(out.removed, [['coach_cal_items', U(81)], ['coach_sessions', U(51)]]);
});

// ---------------------------------------------------------------- F2: the commitment follows the term's months

test('F2: the Commitment row and End early say the term’s own months, as clause 8 does', async () => {
  const { mainPoints, buildClauses } = await import('../../src/lib/agreements/clauses.js');
  const { endEarlySentence } = await import('../../src/lib/agreements/duringAgreement.js');
  for (const months of [3, 6, 12]) {
    const t = terms({ priceMode: 'monthly', months, monthlyMinor: 100000, fullTerm: true, startsOn: '2027-01-04', endsOn: '2027-06-25' });
    const row = mainPoints(t).find((r) => r.label === 'Commitment');
    assert.equal(row.value, `The full ${months} months, unless something exceptional happens`);
    assert.match(endEarlySentence(t), new RegExp(`^A ${months}-month agreement ends early`));
    const words = JSON.stringify(buildClauses(t));
    assert.ok(words.includes(`runs for its full ${months} months`), `clause 8 says ${months}`);
  }
});

// ---------------------------------------------------------------- F5: a package's total is kept exactly

test('F5: a package’s total goes through the questionnaire exactly, and its instalments add up to it', async () => {
  const { asQuestionnaire, answer } = await import('../../src/lib/agreements/questions.js');
  const { planTotal } = await import('../../src/lib/agreements/pricing.js');
  const { schedule } = await import('../../src/lib/agreements/settling.js');
  for (const [total, months] of [[584000, 3], [1048000, 6], [1748000, 12]]) {
    const t = asQuestionnaire(terms({ priceMode: 'total', totalMinor: total, months, settle: 'equal', offerUpfront: false, startsOn: '2027-01-04' }));
    assert.equal(t.priceMode, 'monthly');
    assert.equal(planTotal(t), total, `£${total / 100} stays £${total / 100}`);
    const plan = schedule(t, { signedDay: '2026-12-01', choice: 'plan' });
    assert.equal(plan.length, months, 'one instalment a month of the term');
    assert.equal(plan.reduce((a, p) => a + p.amount, 0), total, 'the instalments add up to the total, to the penny');
    // Through the money questions in pounds, the total holds; a new fee prices by the month again.
    const same = answer(answer(t, 'cur', 'GBP'), 'fee', t.gbpMinor);
    assert.equal(planTotal(same), total);
    assert.equal(planTotal(answer(t, 'fee', 200000)), 200000 * months, 'a fee typed: by the month');
    assert.equal(planTotal(answer(t, 'term', months === 6 ? 12 : 6)), t.monthlyMinor * (months === 6 ? 12 : 6), 'another term: by the month');
  }
});

// ---------------------------------------------------------------- Q2: instalments follow the term

test('Q2: monthly instalments are one for each month of the term, a total price’s included', async () => {
  const { equalCount, schedule } = await import('../../src/lib/agreements/settling.js');
  const t = terms({ priceMode: 'total', totalMinor: 1748000, months: 12, settle: 'equal', offerUpfront: false });
  assert.equal(equalCount(t), 12);
  const plan = schedule(t, { signedDay: '2026-12-01', choice: 'plan' });
  assert.deepEqual([plan.length, plan.at(-1).of, plan.reduce((a, p) => a + p.amount, 0)], [12, 12, 1748000]);
  assert.equal(equalCount(blankTerms('retainer')), 6, 'other kinds as before');
});

test('Q2: the questionnaire’s term ends with its months (the Friday of the last session’s week), not 8 months on', async () => {
  const { asQuestionnaire } = await import('../../src/lib/agreements/questions.js');
  const t = asQuestionnaire(terms({ priceMode: 'total', totalMinor: 1748000, months: 12, rhythm: 'Every 2 weeks', startsOn: '2027-01-04', endsOn: '2027-08-20' }));
  assert.ok(t.endsOn > '2027-12-01' && t.endsOn <= '2028-01-07', `ends ${t.endsOn}`);
});

// ---------------------------------------------------------------- F3: a team programme's people are never invoiced by the hour

test('F3: an organisation’s hourly invoice never lists sessions its signed team programme covers', async () => {
  const { scheduledProfiles, orgInvoiceRows } = await import('../../src/lib/agreements/duringAgreement.js');
  const team = { id: 't1', profile_id: null, organisation_id: 'o', kind: 'sponsor', status: 'signed' };
  const tv = { agreement_id: 't1', version: 1, status: 'signed', sponsor_signed_at: '2026-09-08T11:20:00Z',
    terms: { ...blankTerms('team'), startsOn: '2026-09-16', endsOn: '2027-03-12', team: { ...blankTerms('team').team, people: [{ name: 'Ana', profileId: 'p1' }, { name: 'Ben', email: 'ben@example.invalid', profileId: null }] } } };
  const clients = [{ id: 'p1', name: 'Ana', organisation_id: 'o' }, { id: 'p2', name: 'Ben', email: 'Ben@example.invalid', organisation_id: 'o' }, { id: 'p3', name: 'Cy', organisation_id: 'o' }];
  const covered = scheduledProfiles([team], [tv], clients);
  assert.deepEqual([...covered.keys()].sort(), ['p1', 'p2'], 'named by profile, or by email');
  const s = (id, profile, day) => ({ id, profile_id: profile, starts_at: `${day}T10:00:00Z`, minutes: 60, outcome: 'held' });
  const rows = orgInvoiceRows({ organisationId: 'o', clients, covered, now: Date.parse('2027-06-01T00:00:00Z'),
    sessions: [s('a', 'p1', '2026-11-02'), s('b', 'p2', '2026-11-03'), s('c', 'p3', '2026-11-04'), s('d', 'p1', '2027-04-01')] });
  assert.deepEqual(rows.map((r) => r.id), ['c', 'd'], 'the team’s people inside its dates stay off; after its end and others’ go on');
  assert.equal(scheduledProfiles([{ ...team, status: 'sent' }], [{ ...tv, status: 'sent', sponsor_signed_at: null }], clients).size, 0, 'not signed: nothing covered');
});

// ---------------------------------------------------------------- F4: a new currency never carries the old one's figure or rate

test('F4: switching the client’s currency starts from the £ figure at the new rate, and never carries the old figure or rate', async () => {
  const { asQuestionnaire, answer, mainPrice } = await import('../../src/lib/agreements/questions.js');
  const { versionFields } = await import('../../src/lib/coach/agreementBuilder.js');
  let t = asQuestionnaire(terms({ priceMode: 'monthly', months: 3, monthlyMinor: 200000, startsOn: '2027-01-04' }));
  t = answer(t, 'cur', 'USD', { rate: 1.25 });
  assert.equal(t.currency, 'USD');
  assert.ok(mainPrice(t) >= 250000, 'rounded up from £2,000 at the dollar’s rate');
  t = { ...versionFields(t, { rate: { unitsPerGbp: 1.25 } }).terms };
  assert.equal(t.fxRate, 1.25);
  t = answer(t, 'local', { mode: 'own', minor: 235000 });
  const eur = answer(t, 'cur', 'EUR', { rate: 1.18 });
  assert.equal(eur.localMode, 'up', 'their own figure was for dollars: back to rounded up');
  assert.equal(eur.fxRate, null, 'the dollar rate is not carried');
  const { localFor } = await import('../../src/lib/agreements/fx.js');
  assert.equal(mainPrice(eur), localFor('up', 200000, 'EUR', 1.18), 'from £2,000 at the euro’s own rate');
  assert.notEqual(mainPrice(eur), 235000);
  const f = versionFields(eur, { rate: { unitsPerGbp: 1.18 } });
  assert.deepEqual([f.currency, f.fx_rate, f.terms.fxRate], ['EUR', 1.18, 1.18], 'the version’s currency and rate are the chosen currency’s');
  const aud = answer(eur, 'cur', 'AUD', { rate: null });
  assert.deepEqual([aud.currency, mainPrice(aud), aud.fxRate], ['AUD', 0, null], 'no rate: no figure carried from euros');
  const back = answer(aud, 'cur', 'GBP', {});
  assert.equal(mainPrice(back), 200000, 'back in pounds: the £ figure');
});

// ---------------------------------------------------------------- Q1, Q9, Q10: the words

test('Q1: before the client chooses, the Read states both ways truthfully; once chosen, only that one', async () => {
  const { forStorage, resolveChoice, mainPoints } = await import('../../src/lib/agreements/clauses.js');
  const t = terms({ totalMinor: 1048000, settle: 'equal', months: 6, startsOn: '2027-01-04', endsOn: '2027-06-25', offerUpfront: true });
  const both = resolveChoice(forStorage(t), 'either').find((c) => c.key === 'investment').paragraphs[0].text;
  assert.equal(both, 'Your investment is £9,956, in full, up front, with 5% off, or £10,480, in 6 monthly instalments, the first £1,746.70 and then £1,746.66. You choose which when you sign.');
  assert.match(mainPoints(t, { choice: 'either' }).find((r) => r.label === 'Your investment').value, /up front, with 5% off, or £10,480, in 6 monthly instalments/);
  assert.match(resolveChoice(forStorage(t), 'plan').find((c) => c.key === 'investment').paragraphs[0].text, /^Your investment is £10,480, in 6 monthly/);
  const noChoice = { ...t, offerUpfront: false };
  assert.match(mainPoints(noChoice, { choice: 'either' }).find((r) => r.label === 'Your investment').value, /^£10,480, in 6 monthly instalments/, 'no up front offered: the coach’s way only');
});

test('Q9: a team programme’s Purpose names its people in the third person for the sponsor', async () => {
  const { buildClauses } = await import('../../src/lib/agreements/clauses.js');
  const purpose = buildClauses({ ...blankTerms('team'), orgName: 'Brightwater', startsOn: '2027-01-04', endsOn: '2027-06-25' }).find((c) => c.key === 'purpose');
  const words = purpose.paragraphs.map((p) => p.text).join(' ');
  assert.ok(!/\byou\b|\byour\b/i.test(words), words);
  assert.match(words, /each person in the programme/);
});

test('Q10: an organisation’s overdue reminder says Pay the invoice; a client’s keeps Settle my invoice', async () => {
  const { invoiceReminderEmail } = await import('../../src/lib/email/billingEmails.js');
  const base = { stage: 7, firstName: 'Priya', number: 'CLARITY-1243', amountWords: '£3,000', dueDayWords: 'Mon 16 Nov', coachFirst: 'Tim', settleLink: 'https://invoice.stripe.com/x' };
  const org = invoiceReminderEmail({ ...base, toOrganisation: true });
  const own = invoiceReminderEmail(base);
  assert.equal(org.blocks.find((b) => b?.type === 'button').label, 'Pay the invoice');
  assert.ok(org.blocks.some((b) => b?.text === 'Could you pay it this week?'));
  assert.equal(own.blocks.find((b) => b?.type === 'button').label, 'Settle my invoice');
  assert.equal(invoiceReminderEmail({ ...base, coachee: 'Sam Reid' }).blocks.find((b) => b?.type === 'button').label, 'Pay the invoice', 'named coachee: an organisation');
});

// ---------------------------------------------------------------- P4, P5: the drafts New agreement makes

test('P4: an untouched draft is found again; an answered, sent or renewal one is not', async () => {
  const { untouchedDraft, isUntouched } = await import('../../src/lib/coach/agreementBuilder.js');
  const a = (id, extra = {}) => ({ id, profile_id: 'p', status: 'draft', created_at: `2026-11-2${id.length}T10:00:00Z`, ...extra });
  const v = (agreementId, extra = {}) => ({ agreement_id: agreementId, version: 1, status: 'draft', terms: {}, ...extra });
  const agreements = [a('x'), a('yy'), a('zzz', { status: 'sent' }), a('wwww', { renews_id: 'x' })];
  const versions = [v('x'), v('yy', { terms: { answered: true } }), v('zzz', { status: 'sent' }), v('wwww')];
  assert.equal(untouchedDraft({ agreements, versions, profileId: 'p' })?.id, 'x');
  assert.equal(isUntouched(agreements[1], versions), false, 'answered');
  assert.equal(untouchedDraft({ agreements, versions, profileId: 'other' }), null);
  assert.equal(isUntouched(a('q'), [v('q'), v('q', { version: 2 })]), false, 'a second version');
});

test('P5: an organisation’s client starts from the organisation’s billing profile', async () => {
  const { newDraft } = await import('../../src/lib/coach/agreementBuilder.js');
  const pkg = { id: 'k', name: 'Leadership Sprint, 3 months', agreement_kind: 'sessions', personal_price_minor: 584000, org_price_minor: 746000, currency: 'GBP',
    defaults: { blocks: [{ n: 1, minutes: 90 }, { n: 6, minutes: 60 }], rhythm: 'Every 2 weeks', priceMode: 'total', settle: 'equal', months: 3, offerUpfront: true, dueDays: 14 } };
  const org = { id: 'o', name: 'Halden' };
  const billing = { organisation: org, row: { organisation_id: 'o', needs_po: true, terms_days: 30, invoices_email: 'ap@halden.example' }, po: { number: 'PO-448120' } };
  const d = newDraft({ pkg, who: { profile: { id: 'p', name: 'Jordan Hale', organisation_id: 'o' } }, coach: { id: 'c' }, ids: { agreementId: 'a', versionId: 'v' }, todayKey: '2026-11-26', billing });
  const t = d.version.terms;
  assert.deepEqual([t.funder, t.fundedBy, t.needsPO, t.poNumber, t.poAnswer, t.dueDays, t.invoicesEmail, t.totalMinor],
    ['org', 'Halden', true, 'PO-448120', 'yes', 30, 'ap@halden.example', 746000]);
  assert.equal(d.version.funded_by, 'Halden');
  const own = newDraft({ pkg, who: { profile: { id: 'p', name: 'Jordan Hale', organisation_id: 'o' } }, coach: { id: 'c' }, ids: { agreementId: 'a', versionId: 'v' }, todayKey: '2026-11-26' });
  assert.equal(own.version.terms.funder, 'self', 'no billing profile: as before');
});

// ---------------------------------------------------------------- P6, P9, P10: Sent's money and words

test('P6, P10: Sent shows the £ figure beside another currency, the amount chosen once signed, and Signed with its time', async () => {
  const { sentFacts } = await import('../../src/lib/coach/money.js');
  const { agreementStatus } = await import('../../src/lib/agreements/status.js');
  const usd = sentFacts({ fx_rate: 1.25, terms: { kind: 'retainer', currency: 'USD', retainer: { feeMinor: 250000 } } });
  assert.deepEqual([usd.price, usd.gbp], ['US$2,500', 'About £2,000']);
  const t = { kind: 'sessions', priceMode: 'total', totalMinor: 1048000, settle: 'equal', months: 6, offerUpfront: true, currency: 'GBP', blocks: [{ n: 12, minutes: 60 }] };
  const signed = sentFacts({ status: 'signed', client_signed_at: '2026-11-25T19:30:00Z', settle_choice: 'upfront', terms: t });
  assert.deepEqual([signed.price, signed.unit, signed.gbp], ['£9,956', 'in all, up front', '']);
  assert.equal(sentFacts({ status: 'signed', client_signed_at: '2026-11-25T19:30:00Z', settle_choice: 'plan', terms: t }).price, '£10,480', 'the plan: its total');
  const rows = agreementStatus({ version: { sent_at: '2026-11-24T08:00:00Z', client_signed_at: '2026-11-25T19:30:00Z' }, now: new Date('2026-11-26T12:00:00Z') });
  assert.match(rows.find((r) => r.label === 'Signed').value, /^Yesterday, \d\d:\d\d$/);
});

test('P9: a block of hours in words, never "h"', async () => {
  const { entryLength } = await import('../../src/lib/agreements/hours.js');
  assert.equal(`${entryLength(660)} of ${entryLength(800)} used`, '11 hours of 13 hours 20 minutes used');
});

// ---------------------------------------------------------------- P14: a refund off the live site

test('P14: a refund or credit off the live site takes its stand-in, never a connection problem', async () => {
  const { askWith } = await import('../../src/lib/agreements/asks.js');
  const send = async () => ({ status: 404, json: async () => null });
  const r = await askWith({ route: 'billing', kind: 'refund', body: { invoiceId: 'i', amount: 100 }, token: 't', send, live: false });
  assert.deepEqual([r.ok, r.standIn], [true, true]);
  const live = await askWith({ route: 'billing', kind: 'refund', body: { invoiceId: 'i', amount: 100 }, token: 't', send, live: true });
  assert.equal(live.ok, false, 'the live site never takes a stand-in');
});

// ---------------------------------------------------------------- lead's follow-up: P7 and the monthly line

test('P7: "The full £X" for one payment that settles it all, "The first £X" only where more follows; never "Nothing more to settle."', async () => {
  const { buildClauses } = await import('../../src/lib/agreements/clauses.js');
  const { quoteRows } = await import('../../src/lib/agreements/quote.js');
  const { restLine } = await import('../../src/lib/agreements/settling.js');
  const t = terms({ totalMinor: 1048000, settle: 'equal', months: 6, offerUpfront: true, startsOn: '2027-01-04', endsOn: '2027-06-25' });
  const para = (choice) => buildClauses(t, { choice }).find((c) => c.key === 'investment').paragraphs.map((p) => p.text).find((x) => /settled when you sign/.test(x));
  assert.equal(para('upfront'), 'The full £9,956 is settled when you sign, to confirm your place.');
  assert.equal(para('plan'), 'The first £1,746.70 is settled when you sign, to confirm your place.');
  assert.match(quoteRows(t, [], 'upfront').hint, /The full £9,956 is settled when you sign\.$/);
  assert.match(quoteRows(t, [], 'plan').hint, /The first £1,746\.70 is settled when you sign\.$/);
  assert.equal(restLine({ ...t, settle: 'full', offerUpfront: false }, 'plan'), 'This settles your agreement in full.');
  assert.ok(!/Nothing more to settle/.test(restLine(t, 'upfront')));
});

test('the monthly line names the first instalment where they don’t divide evenly, so the figures agree', async () => {
  const { equalLabel, settleOptions } = await import('../../src/lib/agreements/settling.js');
  assert.equal(equalLabel(1748000, 12), '12 monthly instalments, the first £1,456.74 and then £1,456.66');
  assert.equal(equalLabel(1530000, 6), '6 monthly instalments of £2,550');
  const t = terms({ totalMinor: 1748000, settle: 'equal', months: 12, offerUpfront: false });
  assert.equal(settleOptions(t).find((o) => o.value === 'equal').label, '12 monthly instalments, the first £1,456.74 and then £1,456.66');
});
