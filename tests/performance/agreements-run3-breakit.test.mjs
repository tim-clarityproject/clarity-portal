// The break-it tester's findings for Phase 6b run 3, each as a check (agreements rule 12). The database's own lines
// (approval of one version as it stands, coach status moves, 061's signing, the 14-day guard's kinds, quote_open for a
// funded reader, the coach's own open, the question limit) are in supabase/065_agreements_engine_breakit_test.sql,
// section 7; the server's, end to end, in the tester's scripts on the local stand-in.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as d from '../../src/lib/agreements/duringAgreement.js';
import * as dl from '../../src/lib/agreements/delivered.js';
import { blankTerms } from '../../src/lib/agreements/terms.js';
import { forStorage, resolveChoice, withChoice } from '../../src/lib/agreements/clauses.js';
import { ENDED_STATUSES, choiceFor, endedLine, needsSettleCheck } from '../../src/lib/coaching/clientMoney.js';
import { tidyVersion } from '../../src/lib/coaching/agreementRules.js';
import { settleApi } from '../../api/_routes/agreement-settle.js';
import { canonical } from '../../api/_routes/coach-agreements.js';

const sessions = (extra = {}) => ({ ...blankTerms('sessions'), coaching: 'Coaching, 3 months', clientName: 'Ava Fairley', clientFirst: 'Ava',
  blocks: [{ n: 6, minutes: 60 }], rhythm: 'Every 2 weeks', priceMode: 'total', totalMinor: 600000, settle: 'equal', startsOn: '2026-11-26', endsOn: '2027-02-12', ...extra });

// A small stand-in for the server's Supabase client: eq, is, in and order on in-memory rows; select and maybeSingle.
function fakeServer(tables) {
  const from = (name) => {
    const filters = [];
    const q = {
      select() { return q; }, order() { return q; }, limit() { return q; },
      eq(k, v) { filters.push((r) => r[k] === v); return q; },
      is(k, v) { filters.push((r) => (r[k] ?? null) === v); return q; },
      in(k, vs) { filters.push((r) => vs.includes(r[k])); return q; },
      rows() { return (tables[name] || []).filter((r) => filters.every((f) => f(r))); },
      async maybeSingle() { return { data: q.rows()[0] || null, error: null }; },
      then(ok, bad) { return Promise.resolve({ data: q.rows(), error: null }).then(ok, bad); },
    };
    return q;
  };
  return { from };
}
const signedV = (id, version, terms, at, extra = {}) => ({ id, agreement_id: 'a1', coach_id: 'c1', version, status: 'signed', terms, currency: 'GBP',
  funded_by: null, client_signed_at: at, settle_choice: 'upfront', ...extra });
const mine = (v) => ({ id: v.id, status: 'signed', client_signed_at: v.client_signed_at, funded_by: null, terms: v.terms });

test('finding 1: a cancelled, run-out or ended agreement is never settled again, and the pages say so calmly', async () => {
  const v1 = signedV('v1', 1, sessions(), '2026-11-25T10:00:00+00:00');
  for (const status of ['cancelled', 'expired', 'ended', 'ended_not_renewed']) {
    const server = fakeServer({ agreement_versions: [v1], agreements: [{ id: 'a1', profile_id: 'p1', status }], client_profiles: [{ id: 'p1', name: 'Ava Fairley' }], invoices: [] });
    const api = settleApi({ server, stripe: {} });
    for (const kind of ['start', 'bacs', 'state']) {
      await assert.rejects(api[kind](mine(v1)), (e) => e.calm && e.status === 409 && e.ended === status && /nothing to settle/.test(e.message), `${status} ${kind}`);
    }
  }
  assert.deepEqual([...ENDED_STATUSES], ['cancelled', 'expired', 'ended', 'ended_not_renewed']);
  assert.equal(endedLine('cancelled', 'Vic'), 'This agreement was cancelled, so there’s nothing to settle. Talk to Vic if you’d like to start again.');
  assert.ok(!/\bpay\b/i.test(ENDED_STATUSES.map((x) => endedLine(x, 'Vic')).join(' ')));
  // The client's copy carries whether it still runs (my_agreements' agreement_status).
  const row = tidyVersion({ id: '11111111-1111-4111-8111-111111111111', agreement_id: '22222222-2222-4222-8222-222222222222', version: 1, status: 'signed', agreement_status: 'cancelled', terms: {}, clauses: [] });
  assert.equal(row?.agreementStatus, 'cancelled');
});

test('finding 2: signed, left before settling, then amended: the first payment is still due by the first signing', async () => {
  const v1 = signedV('v1', 1, sessions(), '2026-11-25T10:00:00+00:00', { status: 'superseded', settle_choice: 'upfront' });
  const v2 = signedV('v2', 2, sessions({ totalMinor: 650000, priceFrom: '2026-11-26' }), '2026-11-25T11:00:00+00:00');
  const tables = { agreement_versions: [v1, v2], agreements: [{ id: 'a1', profile_id: 'p1', status: 'signed' }], client_profiles: [{ id: 'p1', name: 'Uma Fairley' }], invoices: [] };
  const api = settleApi({ server: fakeServer(tables), stripe: {} });
  // £6,000 up front with 5% off, as the FIRST signing chose: never "settled" just because a later version was signed.
  assert.deepEqual(await api.state(mine(v2)), { settled: false, amountMinor: 570000, currency: 'GBP' });
  // Settled once the first signing's first invoice is paid: then the amendment needs nothing more.
  tables.invoices.push({ id: 'i1', agreement_id: 'a1', kind: 'first_payment', instalment_n: 1, status: 'paid', total_minor: 570000, currency: 'GBP', created_at: '2026-11-25T12:00:00Z' });
  const st = await api.state(mine(v2));
  assert.equal(st.settled, true);
  const start = await api.start(mine(v2));
  assert.equal(start.settled, true);
  assert.equal(start.amendment, true);
  assert.equal(start.amountMinor, 0, 'nothing more is asked');
  // Welcome asks for an amendment too (and for a version with something to settle); never for an organisation's.
  assert.equal(needsSettleCheck(sessions(), 'upfront', { amends: true }), true);
  assert.equal(needsSettleCheck({ ...sessions(), funder: 'org', fundedBy: 'Northfield' }, 'upfront', { amends: true }), false);
});

test('finding 4: an organisation is never invoiced for sessions or time a self-funded agreement already covers', () => {
  const t = sessions({ settle: 'full', startsOn: '2026-11-26', endsOn: '2027-02-12' });
  const v = signedV('v1', 1, t, '2026-11-25T10:00:00+00:00');
  for (const status of ['signed', 'cancelled', 'ended']) {
    const covered = d.scheduledProfiles([{ id: 'a1', profile_id: 'p1', status }], [v]);
    assert.ok(d.onSchedule(covered, 'p1', '2026-11-25'), `${status}: the signing day (start now ticked)`);
    assert.ok(d.onSchedule(covered, 'p1', '2027-02-12'), `${status}: the last day`);
    assert.ok(!d.onSchedule(covered, 'p1', '2027-02-13'), `${status}: after it ends`);
  }
  // The New invoice page leaves the prepaid session (and that client's logged time) out.
  const covered = d.scheduledProfiles([{ id: 'a1', profile_id: 'p1', status: 'signed' }], [v]);
  const rows = d.orgInvoiceRows({ organisationId: 'o1', clients: [{ id: 'p1', name: 'Uma Ashdown', organisation_id: 'o1' }],
    sessions: [{ id: 's1', profile_id: 'p1', starts_at: '2026-11-27T10:00:00Z', minutes: 60, outcome: 'held' }],
    entries: [{ id: 'e1', engagement_id: 'g1', started_at: '2026-11-27T12:00:00Z', ended_at: '2026-11-27T13:00:00Z' }],
    engagements: [{ id: 'g1', profile_id: 'p1', organisation_id: 'o1' }], covered, now: Date.parse('2026-12-01T00:00:00Z') });
  assert.deepEqual(rows, []);
  // An organisation-funded agreement stays as before: from its start, open-ended, while it runs.
  const f = signedV('v9', 1, { ...t, funder: 'org', fundedBy: 'Northfield' }, '2026-11-25T10:00:00+00:00', { agreement_id: 'a9', funded_by: 'Northfield' });
  assert.ok(d.scheduledProfiles([{ id: 'a9', profile_id: 'p9', status: 'signed' }], [f]).has('p9'));
  assert.ok(!d.scheduledProfiles([{ id: 'a9', profile_id: 'p9', status: 'cancelled' }], [f]).has('p9'));
  // The sessions settled at signing are the ones recorded against the first payment.
  const held = (id, day) => ({ id, profile_id: 'p1', kind: 'coaching', starts_at: `${day}T10:00:00Z`, minutes: 60, outcome: 'held' });
  const del = sessions({ settle: 'delivered' });
  assert.deepEqual(dl.prepaidSessions({ terms: del, sessions: [held('b', '2026-12-10'), held('a', '2026-11-27')], profileId: 'p1', now: Date.parse('2027-01-01T00:00:00Z') }).map((x) => x.id), ['a']);
});

test('finding 5: stored wording is compared with what the terms make, whatever order jsonb keeps its keys in', () => {
  const t = sessions();
  const built = forStorage(t);
  const reordered = JSON.parse(JSON.stringify(built)).map((c) => Object.fromEntries(Object.entries(c).reverse()));
  assert.equal(canonical(reordered), canonical(built));
  const forged = built.map((c) => (c.key === 'rearranging' ? { ...c, paragraphs: [{ text: 'Any coaching session cancelled is charged at £5,000.', why: null }] } : c));
  assert.notEqual(canonical(forged), canonical(built));
});

test('finding 7: a quote accepted with the plan is read, stored and signed with the plan', () => {
  const t = sessions({ choice: 'plan' });
  assert.equal(choiceFor(t, null), 'plan');
  assert.equal(choiceFor(sessions(), null), 'upfront');
  assert.equal(choiceFor(t, 'upfront'), 'upfront');
  const stored = withChoice(forStorage(t), 'plan');
  const inv = stored.find((c) => c.key === 'investment');
  assert.match(inv.paragraphs[0].text, /6 monthly instalments of £1,000/);
  assert.ok(inv.choices?.upfront && inv.choices?.plan, 'both texts stay for the signing block');
  assert.deepEqual(resolveChoice(stored, 'plan').find((c) => c.key === 'investment').paragraphs, inv.choices.plan);
  const plain = forStorage(t);
  assert.equal(withChoice(plain, null), plain, 'no choice: the clauses as they are');
});
