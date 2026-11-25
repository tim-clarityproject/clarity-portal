// Tidy follow-up 4, part 2 (25 Nov): counts in the person's number format ("3,629 more"), full-word units ("30
// minutes", never "30 min"), ids from the address matched whatever their case, and what a client shares found
// however many clients the coach has. Run with npm run test:performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { countFigure, countWords } from '../../src/lib/coach/numbers.js';
import { idFromAddress } from '../../src/lib/coach/address.js';
import { findClientShare, shareOf } from '../../src/lib/coach/clientShare.js';
import { minutesWords } from '../../src/lib/coach/model.js';
import { estimateWords, recapNudgeLine } from '../../src/lib/coach/day.js';
import { monthCell } from '../../src/lib/coach/calendar.js';

test('a count has a thousands comma: "3,629 more", never "3629 more"', () => {
  assert.equal(countFigure(3629), '3,629');
  assert.equal(countFigure(1000000), '1,000,000');
  assert.equal(countFigure(7), '7');
  assert.equal(countFigure(0), '0');
  assert.equal(countFigure(null), '0');
  assert.equal(countFigure('12'), '12');
  assert.equal(countWords(1, 'client'), '1 client');
  assert.equal(countWords(3629, 'client'), '3,629 clients');
  assert.equal(countWords(2, 'person', 'people'), '2 people');
});

test('units are full words: "30 minutes", "1 hour 30 minutes", never "min" or "h"', () => {
  assert.deepEqual([15, 30, 60, 90, 120, 480].map(estimateWords), ['15 minutes', '30 minutes', '1 hour', '1 hour 30 minutes', '2 hours', '8 hours']);
  assert.equal(estimateWords(null), '');
  assert.equal(minutesWords(130), '2 hours 10 minutes');
  assert.equal(minutesWords(1), '1 minute');
});

test('Today’s recap line counts the others with a comma: "and 3,629 more are waiting"', () => {
  const now = new Date('2026-11-25T12:00:00Z');
  const sessions = [{ id: 's1', profile_id: 'p1', outcome: 'held', starts_at: '2026-11-23T10:00:00Z', ends_at: '2026-11-23T11:00:00Z', recap_sent_at: null }];
  const r = recapNudgeLine({ sessions, clients: [{ id: 'p1', name: 'Sam Okafor' }], older: { nudges: 3629 }, now, todayKey: '2026-11-25' });
  assert.ok(r, 'the nudge shows');
  assert.match(r.line, /, and 3,629 more are waiting\.$/);
});

test('an id from the address matches whatever its case; other keys are left alone', () => {
  assert.equal(idFromAddress('3F2A9C1E-0B4D-4E5F-8A6B-7C8D9E0F1A2B'), '3f2a9c1e-0b4d-4e5f-8a6b-7c8d9e0f1a2b');
  assert.equal(idFromAddress(' 3f2a9c1e-0b4d-4e5f-8a6b-7c8d9e0f1a2b '), '3f2a9c1e-0b4d-4e5f-8a6b-7c8d9e0f1a2b');
  assert.equal(idFromAddress('AbCdEf'), 'AbCdEf');
  assert.equal(idFromAddress(undefined), undefined);
});

// A stand-in for coach_client_list: name order, 200 a page, the search over first and last name.
const lister = (rows, { fail = false } = {}) => {
  const asked = [];
  const rpc = async (name, args) => {
    asked.push(args);
    if (fail) return { data: null, error: { message: 'offline' } };
    const found = rows.filter((r) => !args.p_search || `${r.first_name} ${r.last_name}`.toLowerCase().includes(args.p_search.toLowerCase()));
    const page = found.slice(args.p_offset, args.p_offset + Math.min(args.p_limit, 200)).map((r) => ({ ...r, total: found.length }));
    return { data: page, error: null };
  };
  return { rpc, asked };
};
const people = Array.from({ length: 1000 }, (_, i) => ({ client_id: `c${String(i).padStart(4, '0')}`, first_name: `First${i}`, last_name: `Last${String(i).padStart(4, '0')}`, mission: i === 700 ? 'Lead with calm' : null, latest_week_score: i === 700 ? 88 : null }));

test('what a client shares is found by name first, in one ask', async () => {
  const { rpc, asked } = lister(people);
  assert.deepEqual(await findClientShare(rpc, 'c0700', 'First700 Last0700'), { known: true, shared: { mission: 'Lead with calm', latest_week_score: 88 } });
  assert.equal(asked.length, 1);
});

test('a client past the first 200 is still found when their name differs (the page reads on)', async () => {
  const { rpc, asked } = lister(people);
  assert.deepEqual(await findClientShare(rpc, 'c0700', 'Sam Someone'), { known: true, shared: { mission: 'Lead with calm', latest_week_score: 88 } });
  assert.equal(asked.length, 1 + 4); // the name, then pages at 0, 200, 400 and 600
});

test('a client who isn’t listed shares nothing, and an unreachable database keeps the copy', async () => {
  assert.deepEqual(await findClientShare(lister(people).rpc, 'nobody', ''), { known: true, shared: null });
  assert.deepEqual(await findClientShare(lister(people, { fail: true }).rpc, 'c0001', 'First1 Last0001'), { known: false });
  assert.deepEqual(await findClientShare(lister(people).rpc, null, 'x'), { known: true, shared: null });
  assert.equal(shareOf({ mission: '', latest_week_score: 0, email: 'x@example.com' }).latest_week_score, 0);
  assert.equal('email' in shareOf({ mission: 'm', email: 'x@example.com' }), false);
});

test('a month cell’s "more" counts with a comma', () => {
  const entries = Array.from({ length: 1003 }, (_, i) => ({ key: `e${i}`, type: 'event', startsAt: new Date(Date.UTC(2026, 10, 25, 9, 0) + i * 1000), fromDay: '2026-11-25', toDay: '2026-11-25', minutes: 30 }));
  const cell = monthCell(entries, '2026-11-25');
  assert.equal(cell.more, 1000);
  assert.equal(cell.moreWords, '1,000 more');
  assert.match(cell.label, /1,003 items$/);
});

test('capacity’s hours have a thousands comma too', async () => {
  const { capacity } = await import('../../src/lib/coach/day.js');
  const sessions = Array.from({ length: 3 }, (_, i) => ({ id: `s${i}`, profile_id: 'p', outcome: 'held', starts_at: `2026-11-2${3 + i}T09:00:00Z`, ends_at: `2026-11-2${3 + i}T10:30:00Z`, minutes: 90 }));
  const c = capacity(sessions, 0.001, '2026-11-25');
  assert.doesNotMatch(JSON.stringify(c), /\d{4}/);
  const big = capacity(Array.from({ length: 700 }, (_, i) => ({ id: `b${i}`, profile_id: 'p', outcome: 'held', starts_at: '2026-11-24T09:00:00Z', ends_at: '2026-11-25T09:00:00Z', minutes: 1440 })), 15, '2026-11-25');
  if (big.overWords) assert.match(big.overWords, /^\d{1,3}(,\d{3})*(\.\d)? over$/);
});

test('break-it tester: an address id that isn\'t a real id is never named in the loads', async () => {
  const { isRowId } = await import('../../src/lib/coach/address.js');
  for (const bad of ['5252ade7-d473-00d7-3795-41370433daae.', 'a'.repeat(36), "x' or 1=1--", '-'.repeat(36), 'x'.repeat(5000), null]) assert.equal(isRowId(bad), false, String(bad).slice(0, 40));
  assert.equal(isRowId('5252ade7-d473-00d7-3795-41370433daae'), true);
  // store.js's ensureClientSessions asks isRowId before naming an id in its loads.
  const { readFileSync } = await import('node:fs');
  assert.match(readFileSync(new URL('../../src/lib/coach/store.js', import.meta.url), 'utf8'), /ensureClientSessions\(userId, profileId\) \{\n[^]*?isRowId\(profileId\)/);
});
