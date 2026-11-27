// src/lib/agreements/endDate.js: the end date worked out (brief item 6; M28's builder, s-extend, s-pause).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as e from '../../src/lib/agreements/endDate.js';

test('the Friday of the last coaching session’s week, for each How often', () => {
  const mixed = [{ n: 1, minutes: 90 }, { n: 15, minutes: 60 }];
  assert.equal(e.lastSessionWeek('2027-01-04', 16, 'Weekly for 6 weeks, then every 2 weeks'), '2027-06-28');
  assert.equal(e.suggestEnd('2027-01-04', mixed, 'Weekly for 6 weeks, then every 2 weeks'), '2027-07-02', '16 sessions → Fri 2 Jul 2027');
  assert.equal(e.suggestEnd('2027-02-01', 12, 'Every 2 weeks'), '2027-07-09', '12 every 2 weeks → Fri 9 Jul 2027');
  assert.equal(e.suggestEnd('2027-01-04', 16, 'Weekly'), '2027-04-23');
  assert.equal(e.suggestEnd('2027-01-04', 6, 'Monthly'), '2027-05-28');
  assert.equal(e.suggestEnd('2027-02-01', 12, 'As we agree'), e.suggestEnd('2027-02-01', 12, 'Every 2 weeks'), '“As we agree” counts as every 2 weeks');
});

test('a last session on a Saturday ends the following Friday, never before it (risk 30)', () => {
  assert.equal(e.suggestEnd('2027-01-02', 1, 'Weekly'), '2027-01-08');
  assert.equal(e.fridayOnOrAfter('2027-07-02'), '2027-07-02');
});

test('the builder’s choices and its line', () => {
  const o = e.endOptions('2027-07-02');
  assert.deepEqual(o.map((x) => x.label), ['Fri 2 Jul 2027, suggested', 'Fri 16 Jul 2027, 2 weeks spare', 'Fri 30 Jul 2027, 4 weeks spare', 'Fri 27 Aug 2027, 8 weeks spare']);
  assert.equal(e.endHint({ start: '2027-01-04', count: 16, rhythm: 'Weekly for 6 weeks, then every 2 weeks', end: '2027-07-02', picked: false }),
    'Worked out: the last coaching session is in the week of Mon 28 Jun 2027.');
  assert.equal(e.endHint({ start: '2027-01-04', count: 16, rhythm: 'Weekly for 6 weeks, then every 2 weeks', end: '2027-07-30', picked: true }),
    'You chose this. Suggested: Fri 2 Jul 2027.');
  assert.deepEqual(e.extendOptions('2027-07-02').map((x) => x.value), ['2027-07-16', '2027-07-30', '2027-08-27', '2027-09-24']);
  assert.deepEqual(e.extendOptions('2027-07-02').map((x) => x.label), ['Fri 16 Jul 2027', 'Fri 30 Jul 2027', 'Fri 27 Aug 2027', 'Fri 24 Sep 2027']);
  // On screen, this year's dates leave their year out (writing rule 28).
  assert.deepEqual(e.extendOptions('2026-11-20', '2026-11-26').map((x) => x.label), ['Fri 4 Dec', 'Fri 18 Dec', 'Fri 15 Jan 2027', 'Fri 12 Feb 2027']);
});

test('pausing Mon 1 Mar to Fri 26 Mar moves the end by 4 weeks, to Fri 30 Jul 2027', () => {
  const p = e.pauseMove('2027-07-02', '2027-03-01', '2027-03-26');
  assert.equal(p.end, '2027-07-30');
  assert.equal(p.line, 'Coaching pauses for 4 weeks, so the end date moves to Fri 30 Jul 2027.');
  assert.equal(e.pauseMove('2027-07-02', '2027-03-26', '2027-03-01').line, 'Choose an Until date after From.');
  assert.equal(e.pauseMove('2027-07-02', '2027-03-01', '2027-03-26', '2027-02-24').line, 'Coaching pauses for 4 weeks, so the end date moves to Fri 30 Jul.');
});

// Stage D item 16 (Tim, 27 Nov): one pause length for the end date and the invoices, and the coaching sessions booked
// inside a pause listed for the coach to move or cancel, none moved or cancelled by itself.
test('a pause moves the end date and the invoices by the same length, whole weeks from a Monday to a Friday', async () => {
  const { agreementSchedule } = await import('../../src/lib/agreements/settling.js');
  assert.equal(e.resumeDay('2027-03-26'), '2027-03-29', 'a Friday resumes on Monday');
  assert.equal(e.resumeDay('2027-03-27'), '2027-03-29', 'a Saturday resumes on Monday');
  assert.equal(e.resumeDay('2027-03-24'), '2027-03-25', 'a Wednesday resumes on Thursday');
  assert.equal(e.pauseDays('2027-03-01', '2027-03-26'), 28);
  assert.equal(e.pauseDays('2027-03-26', '2027-03-01'), 0);
  assert.equal(e.pauseMove('2027-07-02', '2027-03-01', '2027-03-26').days, 28);
  // A retainer invoiced monthly on the 4th: the invoice due inside the pause moves 28 days, as the end does.
  const t = { kind: 'retainer', retainer: { sessions: 'Up to 2 a month, 60 minutes each', feeMinor: 300000, invoice: 'monthly' }, startsOn: '2027-01-04', currency: 'GBP', dueDays: 14 };
  const v = { id: 'v1', version: 1, status: 'signed', terms: t, client_signed_at: '2027-01-04T10:00:00Z', settle_choice: 'plan' };
  const plain = agreementSchedule([v], { until: '2027-06-30', agreement: { status: 'signed' } });
  const paused = agreementSchedule([v], { until: '2027-06-30', agreement: { status: 'signed', paused_from: '2027-03-01', paused_to: '2027-03-26' } });
  const moved = paused.filter((p) => p.n > 1 && plain.find((q) => q.n === p.n).day >= '2027-03-01');
  assert.ok(moved.length > 0);
  for (const p of moved) assert.equal(daysBetweenKeys(plain.find((q) => q.n === p.n).day, p.day), e.pauseDays('2027-03-01', '2027-03-26'));
});

const daysBetweenKeys = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

test('the coaching sessions booked inside a pause: the client’s, still to come, by their day on the zone’s clock', () => {
  const now = Date.parse('2027-02-24T12:00:00Z');
  const S = (id, at, extra = {}) => ({ id, profile_id: 'sam', kind: 'coaching', starts_at: at, ...extra });
  const sessions = [
    S('late', '2027-03-22T10:00:00Z'), S('first', '2027-03-08T10:00:00Z'),
    S('before', '2027-02-26T10:00:00Z'), S('after', '2027-03-29T10:00:00Z'),
    S('edge-start', '2027-03-01T00:30:00Z'), // Mon 1 Mar 00:30 in London, still Sun 28 Feb 19:30 in Toronto
    S('edge-end', '2027-03-26T23:30:00Z'), // Fri 26 Mar 23:30 in London
    S('chemistry', '2027-03-10T10:00:00Z', { kind: 'chemistry' }), S('someone', '2027-03-10T10:00:00Z', { profile_id: 'jo' }),
    S('said', '2027-03-15T10:00:00Z', { outcome: 'happened' }),
  ];
  const ids = (list) => list.map((s) => s.id);
  assert.deepEqual(ids(e.sessionsInPause(sessions, { from: '2027-03-01', to: '2027-03-26', profileId: 'sam', zone: 'Europe/London', now })),
    ['edge-start', 'first', 'late', 'edge-end']);
  assert.deepEqual(ids(e.sessionsInPause(sessions, { from: '2027-03-01', to: '2027-03-26', profileId: 'sam', zone: 'America/Toronto', now })),
    ['first', 'late', 'edge-end'], 'the day on the zone’s own clock');
  assert.deepEqual(ids(e.sessionsInPause(sessions, { from: '2027-03-01', to: '2027-03-26', profileId: 'sam', zone: 'Europe/London', now: Date.parse('2027-03-10T00:00:00Z') })),
    ['late', 'edge-end'], 'only those still to come');
  assert.deepEqual(e.sessionsInPause(sessions, { from: '2027-03-26', to: '2027-03-01' }), []);
  // Nothing is changed: the rows come back as they were.
  assert.equal(e.sessionsInPause(sessions, { from: '2027-03-01', to: '2027-03-26', profileId: 'sam', now })[1], sessions[1]);
});
