// Network's rules (src/lib/coach/network.js) are the JavaScript twin of
// migration 052: the page, the device-first copy and the tests' stand-in
// all use them. Each check here has the same answer as its twin in
// supabase/052_coach_crm_test.sql (named beside it), so the two can't
// drift apart unnoticed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dueOn, focusOf, FOCUS_LISTS, importRow, MAP_LIMIT, mergedPerson, monthsOn, NETWORK_PAGE, networkCounts, networkDuplicates, networkMap, networkPage,
  RATINGS, readyToArchive, withWorkedOut } from '../../src/lib/coach/network.js';

const TODAY = '2026-11-19';
const f = (i, t, v, g) => focusOf({ influence: i, trust: t, value_delivery: v, what_you_get: g }) || 'none';
const daysBefore = (day, n) => new Date(new Date(`${day}T12:00:00Z`).getTime() - n * 86400000).toISOString().slice(0, 10);

test('Where to focus: Keep close is trust 7 or more and what you get 7 or more, checked first (9a)', () => {
  assert.deepEqual([f(0, 7, 0, 7), f(10, 7, 0, 7), f(10, 10, 10, 10), f(5, 6, 5, 7), f(5, 7, 5, 6)], ['keep_close', 'keep_close', 'keep_close', 'none', 'none']);
});

test('Where to focus: Invest is influence 7 or more with trust or value delivery 6 or less, before Maintain (9b)', () => {
  assert.deepEqual([f(7, 6, 10, 5), f(7, 10, 6, 5), f(7, 6, 6, 5), f(6, 6, 6, 5), f(7, 7, 6, 6), f(10, 0, 0, 0)], ['invest', 'invest', 'invest', 'none', 'invest', 'invest']);
});

test('Where to focus: Maintain is influence, trust and value delivery all 7 or more (9c)', () => {
  assert.deepEqual([f(7, 7, 7, 6), f(7, 7, 7, 0), f(10, 10, 10, 6), f(7, 7, 7, 7)], ['maintain', 'maintain', 'maintain', 'keep_close']);
});

test('Where to focus: Rebalance? is influence 4 or less and what you get 4 or less (9d)', () => {
  assert.deepEqual([f(4, 10, 10, 4), f(0, 0, 0, 0), f(5, 5, 5, 4), f(4, 5, 5, 5), f(5, 5, 5, 5)], ['rebalance', 'rebalance', 'none', 'none', 'none']);
});

test('Where to focus: nobody is on a list until all four are rated, and a rating is a whole number from 0 to 10 (9e)', () => {
  assert.deepEqual([f(null, 9, 9, 9), f(9, 9, 9, null), f(null, null, null, null), f(9, 11, 9, 9), f(9, 7.5, 9, 9), f('9', 9, 9, 9)], ['none', 'none', 'none', 'none', 'none', 'none']);
  assert.equal(focusOf(null), null);
});

test('Where to focus: every one of the 14,641 sets of ratings lands on the list the four rules give, in their order', () => {
  const counts = { keep_close: 0, invest: 0, maintain: 0, rebalance: 0, none: 0 };
  for (let i = 0; i <= 10; i += 1) for (let t = 0; t <= 10; t += 1) for (let v = 0; v <= 10; v += 1) for (let g = 0; g <= 10; g += 1) {
    const want = t >= 7 && g >= 7 ? 'keep_close' : i >= 7 && (t <= 6 || v <= 6) ? 'invest' : i >= 7 && t >= 7 && v >= 7 ? 'maintain' : i <= 4 && g <= 4 ? 'rebalance' : 'none';
    assert.equal(f(i, t, v, g), want, `${i} ${t} ${v} ${g}`);
    counts[want] += 1;
  }
  assert.deepEqual(counts, { keep_close: 1936, invest: 4172, maintain: 448, rebalance: 3025, none: 5060 });
  assert.deepEqual(FOCUS_LISTS, ['keep_close', 'maintain', 'invest', 'rebalance']);
});

test('M11’s own people land on M11’s lists', () => {
  const m11 = [['Sofia Marsh', 7, 4, 5, 6, 'invest'], ['Dana Whitfield', 9, 8, 6, 7, 'keep_close'], ['Hannah Wells', 5, 8, 8, 9, 'keep_close'], ['Jamal Irwin', 1, 4, 8, 7, 'none'],
    ['Vera Ellis', 9, 1, 8, 0, 'invest'], ['Rosa Price', 4, 6, 0, 2, 'rebalance'], ['Erin Banks', 10, 8, 6, 0, 'invest'], ['Kate Banks', 4, 7, 2, 9, 'keep_close'],
    ['Yusuf Lyle', 4, 7, 2, 3, 'rebalance'], ['Zara Fraser', 7, 9, 8, 4, 'maintain'], ['Finn Moss', 7, 8, 5, 3, 'invest'], ['Maya Kerr', 0, 9, 8, 8, 'keep_close'],
    ['Farid Okoro', 2, 10, 3, 4, 'rebalance'], ['David Stark', 9, 6, 7, 7, 'invest'], ['Dan Reid', 6, 9, 7, 8, 'keep_close']];
  for (const [name, i, t, v, g, want] of m11) assert.equal(f(i, t, v, g), want, name);
});

test('months are counted as the database counts them: the same day, or the month’s last (9g)', () => {
  assert.equal(monthsOn('2026-01-31', 3), '2026-04-30');
  assert.equal(monthsOn('2026-08-10', 3), '2026-11-10');
  assert.equal(monthsOn('2024-02-29', 12), '2025-02-28');
  assert.equal(monthsOn('2026-11-19', -18), '2025-05-19');
  assert.equal(monthsOn('2026-03-31', -1), '2026-02-28');
  assert.equal(monthsOn('2026-12-15', 1), '2027-01-15');
  assert.equal(monthsOn('not a day', 1), null);
});

test('a catch-up is due the rhythm after you last spoke; "Not now" moves it; no rhythm, no due day (9f, 9g)', () => {
  assert.equal(dueOn({ rhythm_months: 3, last_spoke_on: '2026-08-10' }), '2026-11-10'); // Sofia: 9 days overdue on Thu 19 Nov
  assert.equal(dueOn({ rhythm_months: 3, last_spoke_on: '2026-08-17' }), '2026-11-17'); // Dan: 2 days overdue
  assert.equal(dueOn({ rhythm_months: 3, last_spoke_on: '2026-08-10', snoozed_until: '2026-12-03' }), '2026-12-03');
  assert.equal(dueOn({ rhythm_months: 3, last_spoke_on: '2026-08-10', snoozed_until: '2026-09-01' }), '2026-11-10');
  assert.equal(dueOn({ rhythm_months: null, last_spoke_on: '2026-08-10', snoozed_until: '2026-12-03' }), null);
  assert.equal(dueOn({ rhythm_months: 3, last_spoke_on: null, added_on: '2026-01-31' }), '2026-04-30');
  assert.equal(dueOn({ rhythm_months: 3 }), null);
  assert.deepEqual(withWorkedOut({ influence: 6, trust: 9, value_delivery: 7, what_you_get: 8, rhythm_months: 3, last_spoke_on: '2026-08-17' }).focus, 'keep_close');
});

// The SQL test's 125 people (9l to 9t): Dan, Sofia, 120 numbered people, two long quiet and one possible duplicate.
function world() {
  const person = (id, name, extra = {}) => ({ id, coach_id: 'me', name, organisation: null, role: null, email: null, phone: null, influence: null, trust: null, value_delivery: null, what_you_get: null,
    rhythm_months: null, last_spoke_on: null, snoozed_until: null, added_on: TODAY, own: {}, archived_at: null, keep: false, merged_into: null, given_count: 0, asked_count: 0, created_at: '2026-01-01T00:00:00Z', ...extra });
  const people = [
    person('dan', 'Dan Reid', { organisation: 'Harbour Lane', role: 'Referrer', email: 'dan@example.invalid', influence: 6, trust: 9, value_delivery: 7, what_you_get: 8, rhythm_months: 3, last_spoke_on: '2026-08-17', given_count: 1, asked_count: 1, own: { col: 'Sport' } }),
    person('sofia', 'Sofia Marsh', { organisation: 'Citadel', role: 'Key contact', email: 'sofia@example.invalid', influence: 7, trust: 4, value_delivery: 5, what_you_get: 6, rhythm_months: 3, last_spoke_on: '2026-08-10' }),
  ];
  for (let i = 1; i <= 120; i += 1) {
    people.push(person(`p${String(i).padStart(3, '0')}`, `Person ${String(i).padStart(3, '0')}`, {
      organisation: i % 3 === 0 ? 'Kestrel Group' : i % 3 === 1 ? 'Vale Health' : 'Ashby Rugby', role: i % 2 === 0 ? 'Sponsor' : 'Client', email: `person${i}@example.invalid`,
      influence: i <= 60 ? i % 11 : null, trust: i <= 60 ? (i * 3) % 11 : null, value_delivery: i <= 60 ? (i * 5) % 11 : null, what_you_get: i <= 60 ? (i * 7) % 11 : null,
      rhythm_months: i <= 110 ? [1, 2, 3, 6, 12][i % 5] : null, last_spoke_on: i <= 110 ? daysBefore(TODAY, i * 3) : '2025-03-07', added_on: '2025-01-01',
    }));
  }
  people.push(person('old', 'Zara Nash', { organisation: 'Orbital Health', last_spoke_on: '2025-05-12', added_on: '2025-01-01' }));
  people.push(person('old2', 'Bea Reeves', { organisation: 'Harbour City FC', added_on: '2025-03-07' }));
  people.push(person('dup', 'Daniel Reid', { organisation: 'Harbour Lane Partners', email: 'dan.reid@example.invalid', phone: '07700 900141', influence: 5, created_at: '2026-02-01T00:00:00Z' }));
  return people;
}
const page = (people, query = {}, columns = []) => networkPage(people, { today: TODAY, ...query }, columns);

test('a page is 50 people, by name, with the count of everyone; Show 50 more carries on to the end (9l, 9m)', () => {
  const people = world();
  const first = page(people);
  assert.deepEqual([first.total, first.all, first.rows.length, first.rows[0].name, first.rows[49].name], [125, 125, 50, 'Bea Reeves', 'Person 047']);
  assert.equal(NETWORK_PAGE, 50);
  assert.deepEqual([page(people, { offset: 50 }).rows.length, page(people, { offset: 50 }).rows[0].name], [50, 'Person 048']);
  const last = page(people, { offset: 100 });
  assert.deepEqual([last.rows.length, last.rows[24].name], [25, 'Zara Nash']);
  assert.equal(page(people, { limit: 100000 }).rows.length, 125); // 200 at most at once; here there are only 125
  assert.equal(page(people, { limit: 0 }).rows.length, 1);
});

test('search is by name or organisation, whatever its capitals; a % or _ is only itself (9n)', () => {
  const people = world();
  assert.deepEqual([page(people, { search: '  KESTREL ' }).total, page(people, { search: '  KESTREL ' }).all], [40, 125]);
  assert.deepEqual(['reid', 'no such person', '%', 'person 00_'].map((search) => page(people, { search }).total), [2, 0, 0, 0]);
});

test('every heading sorts, both ways, blanks last; a heading that isn’t one sorts by name (9o)', () => {
  const people = world();
  const top = (query) => page(people, { limit: 1, ...query }, [{ id: 'col', kind: 'text' }]).rows[0];
  assert.equal(top({ sort: 'influence', desc: true }).influence, 10);
  assert.equal(top({ sort: 'influence' }).influence, 0);
  assert.equal(top({ sort: 'due' }).name, 'Person 110');
  assert.notEqual(top({ sort: 'due', desc: true }).due_on, null);
  assert.equal(top({ sort: 'given', desc: true }).name, 'Dan Reid');
  assert.equal(top({ sort: 'focus' }).focus, 'keep_close');
  assert.equal(top({ sort: 'last_spoke', desc: true }).name, 'Person 001');
  assert.equal(top({ sort: 'own:col' }).name, 'Dan Reid');
  assert.equal(top({ sort: 'no such heading; drop table' }).name, 'Bea Reeves');
  assert.equal(top({ sort: 'own:not-a-column' }).name, 'Bea Reeves');
  // Blanks are last both ways: the unrated never lead a sort by a rating.
  assert.equal(page(people, { sort: 'trust', desc: true, limit: 200 }).rows.at(-1).trust, null);
  assert.equal(page(people, { sort: 'trust', limit: 200 }).rows.at(-1).trust, null);
});

test('Show only narrows it: a list, no list, a role, a rhythm, an organisation, and two at once (9p)', () => {
  const people = world();
  const total = (only) => page(people, { only }).total;
  assert.equal(total({ focus: ['keep_close'] }), people.filter((p) => focusOf(p) === 'keep_close').length);
  assert.equal(total({ focus: ['none'] }), people.filter((p) => !focusOf(p)).length);
  assert.deepEqual([total({ role: ['Referrer'] }), total({ rhythm: [12] }), total({ rhythm: [0] }), total({ organisation: ['Citadel'] }), total({ organisation: ['Kestrel Group'], role: ['Sponsor'] }),
    total({ rhythm: ['twelve; drop'] }), networkPage(people, { only: 'not an object', today: TODAY }).total], [1, 22, 13, 1, 20, 0, 125]);
});

test('Actions: Due now, most overdue first; Coming up, soonest first (9q)', () => {
  const people = world();
  const due = page(people, { sort: 'due', only: { due: 'now' }, limit: 8 });
  assert.equal(due.rows[0].name, 'Person 110');
  assert.equal(due.total, people.filter((p) => dueOn(p) && dueOn(p) <= TODAY).length);
  assert.ok(due.rows.every((p, i) => i === 0 || due.rows[i - 1].due_on <= p.due_on));
  const coming = page(people, { sort: 'due', only: { due: 'coming' }, limit: 4 });
  assert.ok(coming.rows.length === 4 && coming.rows.every((p) => p.due_on > TODAY));
  assert.equal(networkCounts(people, TODAY).due, due.total);
});

test('Ready to archive? is no contact for 18 months and no focus list; someone kept is never suggested again (9r, 9s, 9t)', () => {
  const people = world();
  const ready = page(people, { only: { ready: true } });
  assert.equal(ready.rows.map((p) => p.name).join(','), 'Bea Reeves,Person 111,Person 112,Person 113,Person 114,Person 115,Person 116,Person 117,Person 118,Person 119,Person 120,Zara Nash');
  assert.deepEqual(networkCounts(people, TODAY), { active: 125, archived: 0, due: networkCounts(people, TODAY).due, ready: 12 });
  // The edge: 18 months to the day is not yet ready; the day before is.
  assert.equal(readyToArchive({ last_spoke_on: '2025-05-19', added_on: '2020-01-01' }, TODAY), false);
  assert.equal(readyToArchive({ last_spoke_on: '2025-05-18', added_on: '2020-01-01' }, TODAY), true);
  assert.equal(readyToArchive({ last_spoke_on: '2020-01-01', influence: 9, trust: 9, value_delivery: 9, what_you_get: 9 }, TODAY), false);
  assert.equal(readyToArchive({ last_spoke_on: '2020-01-01', keep: true }, TODAY), false);
  // "Archive 11", keeping Zara Nash.
  const after = people.map((p) => (p.id === 'old' ? { ...p, keep: true } : ready.rows.some((r) => r.id === p.id) ? { ...p, archived_at: '2026-11-19T10:00:00Z' } : p));
  assert.deepEqual(networkCounts(after, TODAY), { active: 114, archived: 11, due: networkCounts(people, TODAY).due, ready: 0 });
  assert.deepEqual([page(after).total, page(after, { archived: true }).total, page(after, { archived: true }).rows[0].name, networkMap(after).total], [114, 11, 'Bea Reeves', 114]);
});

test('the map shows up to 150 people with a spot: Keep close, Maintain and Invest first, then who you spoke to most recently (9A)', () => {
  const people = world();
  const twenty = networkMap(people, { limit: 20 });
  assert.equal(twenty.rows.length, 20);
  assert.equal(twenty.total, 125);
  assert.equal(twenty.placed, people.filter((p) => p.influence != null && p.trust != null).length);
  assert.ok(twenty.rows.every((p) => ['keep_close', 'maintain', 'invest'].includes(p.focus)));
  assert.equal(networkMap(people, { show: 'rebalance' }).placed, people.filter((p) => focusOf(p) === 'rebalance').length);
  assert.ok(networkMap(people, { show: 'none' }).rows.every((p) => p.focus === null));
  // The cap: 300 fully rated people, 150 shown; every focus-list person comes before anyone on no list.
  const many = Array.from({ length: 300 }, (_, i) => ({ id: `m${i}`, name: `Many ${i}`, influence: i % 11, trust: (i * 3) % 11, value_delivery: (i * 5) % 11, what_you_get: (i * 7) % 11, last_spoke_on: daysBefore(TODAY, i) }));
  const shown = networkMap(many);
  assert.deepEqual([shown.rows.length, shown.total, shown.placed, MAP_LIMIT], [150, 300, 300, 150]);
  const firstOther = shown.rows.findIndex((p) => !['keep_close', 'maintain', 'invest'].includes(p.focus));
  assert.ok(firstOther === -1 || shown.rows.slice(firstOther).every((p) => !['keep_close', 'maintain', 'invest'].includes(p.focus)));
  const lists = shown.rows.filter((p) => ['keep_close', 'maintain', 'invest'].includes(p.focus));
  assert.ok(lists.every((p, i) => i === 0 || lists[i - 1].last_spoke_on >= p.last_spoke_on));
  assert.equal(networkMap(many, { limit: 100000 }).rows.length, 300); // 500 at most; here there are only 300
});

test('import: possible duplicates show first (the same email, or the same name whatever its capitals) (9y)', () => {
  const got = networkDuplicates(world(), [{ name: 'Brand New', email: 'brand.new@example.invalid' }, { name: 'dan reid' }, { name: 'Somebody Else', email: 'SOFIA@example.invalid' }, { name: '' }]);
  assert.deepEqual(got.map((d) => `${d.index} ${d.name} ${d.by}`), ['1 Dan Reid name', '2 Sofia Marsh email']);
});

test('import: a row is trimmed, its email lower-cased, an impossible rating left empty, and a row with no name is nobody (9z)', () => {
  assert.deepEqual(importRow({ name: ' Brand New ', email: 'Brand.New@Example.invalid', organisation: 'Quillmark', role: 'Referrer', trust: '8', what_you_get: 12, rhythm_months: 3, last_spoke_on: '2026-10-01' }),
    { name: 'Brand New', organisation: 'Quillmark', role: 'Referrer', email: 'brand.new@example.invalid', phone: null, influence: null, trust: 8, value_delivery: null, what_you_get: null, rhythm_months: 3,
      last_spoke_on: '2026-10-01', notes: null, own: {} });
  assert.equal(importRow({ name: '   ' }), null);
  assert.equal(importRow({ email: 'x@example.invalid' }), null);
  assert.deepEqual([importRow({ name: 'A', rhythm_months: 30 }).rhythm_months, importRow({ name: 'A', last_spoke_on: '1 Oct' }).last_spoke_on], [null, null]);
});

test('a merge keeps the kept person’s own values, fills blanks, and takes the chosen fields from the other (9v)', () => {
  const people = world();
  const merged = mergedPerson(people.find((p) => p.id === 'dan'), people.find((p) => p.id === 'dup'), { organisation: true });
  assert.deepEqual([merged.name, merged.organisation, merged.email, merged.phone, merged.influence, merged.own.col], ['Dan Reid', 'Harbour Lane Partners', 'dan@example.invalid', '07700 900141', 6, 'Sport']);
  assert.equal(merged.last_spoke_on, '2026-08-17');
  assert.deepEqual(RATINGS, ['influence', 'trust', 'value_delivery', 'what_you_get']);
});
