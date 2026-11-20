// Network's rules (src/lib/coach/network.js) are the JavaScript twin of
// migration 052: the page, the device-first copy and the tests' stand-in
// all use them. Each check here has the same answer as its twin in
// supabase/052_coach_crm_test.sql (named beside it), so the two can't
// drift apart unnoticed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ASKED_KINDS, dueOn, focusOf, FOCUS_LISTS, GAVE_KINDS, importRow, MAP_LIMIT, mergedPerson, monthsOn, NETWORK_PAGE, NETWORK_SORTS, networkCounts, networkDuplicates, networkMap, networkPage,
  RATINGS, readyToArchive, withWorkedOut } from '../../src/lib/coach/network.js';

const NETWORK_SORTS_HAS = (key) => NETWORK_SORTS.includes(key);

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

// =============================================================================
// The words and the pages' rules (builder B): the four lists at every
// boundary in the prompt's order, Actions, Ready to archive?, the table's
// queries and cells, the map's dots and pop-up card, give and ask, rating
// history, one person, Today's lines and the menu's count.
// =============================================================================
import * as net from '../../src/lib/coach/network.js';
import { matchColumns, sheetRows } from '../../src/lib/coach/crm.js';

const person = (id, name, ratings, extra = {}) => ({ id, coach_id: 'c1', name, organisation: null, role: null, email: null, phone: null,
  influence: ratings?.[0] ?? null, trust: ratings?.[1] ?? null, value_delivery: ratings?.[2] ?? null, what_you_get: ratings?.[3] ?? null,
  rhythm_months: null, last_spoke_on: null, snoozed_until: null, added_on: '2026-01-01', given_count: 0, asked_count: 0, own: {}, archived_at: null, keep: false, merged_into: null, ...extra });

test('Where to focus at EVERY boundary, checked in the prompt’s order: Keep close, Invest, Maintain, Rebalance?', () => {
  // Every combination of the four ratings just under, on and just over each threshold (3, 4, 5, 6, 7, 8), against the rule written out.
  const marks = [0, 3, 4, 5, 6, 7, 8, 10];
  let checked = 0;
  for (const i of marks) for (const t of marks) for (const v of marks) for (const g of marks) {
    const want = t >= 7 && g >= 7 ? 'keep_close' : i >= 7 && (t <= 6 || v <= 6) ? 'invest' : i >= 7 && t >= 7 && v >= 7 ? 'maintain' : i <= 4 && g <= 4 ? 'rebalance' : 'none';
    assert.equal(f(i, t, v, g), want, `influence ${i}, trust ${t}, value delivery ${v}, what you get ${g}`);
    checked += 1;
  }
  assert.equal(checked, 4096);
  // The order matters where two rules both hold.
  assert.equal(f(9, 8, 6, 7), 'keep_close'); // Keep close before Invest (M11's Dana Whitfield)
  assert.equal(f(7, 7, 6, 6), 'invest'); // Invest before Maintain: value delivery is 6
  assert.equal(f(7, 7, 7, 6), 'maintain'); // one more on value delivery and it's Maintain
  assert.equal(f(4, 7, 0, 7), 'keep_close'); // Keep close before Rebalance?
  assert.equal(f(4, 6, 9, 4), 'rebalance');
  assert.equal(f(5, 6, 9, 4), 'none');
  assert.equal(f(4, 6, 9, 5), 'none');
  // Until all four are rated, no list.
  assert.equal(focusOf({ influence: 9, trust: 9, value_delivery: 9 }), null);
});

test('the lists, the ratings and the rhythm read the same everywhere', () => {
  assert.deepEqual(net.NETWORK_TABS.map(([, label]) => label), ['Actions', 'Table', 'Map']);
  assert.deepEqual(FOCUS_LISTS.map(net.focusLabel), ['Keep close', 'Maintain', 'Invest', 'Rebalance?']);
  assert.deepEqual(net.howItIs(person('p', 'P', [9, 6, 7, 7])), { label: 'Invest', line: 'They matter, and there’s room to build trust.' });
  assert.equal(net.howItIs(person('p', 'P', [5, 5, 5, 5])).label, 'No list');
  assert.equal(net.howItIs(person('p', 'P', [5, 5, null, 5])).label, 'Not rated yet');
  assert.deepEqual(RATINGS.map((k) => net.RATING_WORDS[k].label), ['Influence', 'Trust in you', 'Value delivery', 'What you get']);
  assert.equal(net.RATING_WORDS.trust.question, 'How much do they trust you?');
  assert.deepEqual([net.RATING_CHOICES[0], net.RATING_CHOICES.length, net.ratingOutOf(0), net.ratingOutOf(8), net.ratingOutOf(null)], [0, 11, '0/10', '8/10', '']);
  assert.deepEqual([1, 2, 3, 6, 12, null].map(net.rhythmWords), ['Every month', 'Every 2 months', 'Every 3 months', 'Every 6 months', 'Every year', '']);
  assert.equal(net.rhythmChoices().slice(-1)[0].label, 'No rhythm');
});

test('when a catch-up is due reads "9 days overdue", "1 day overdue", "Due today", or the day', () => {
  assert.deepEqual([net.dueWords('2026-11-10', TODAY), net.dueWords('2026-11-18', TODAY), net.dueWords(TODAY, TODAY), net.dueWords('2027-01-16', TODAY), net.dueWords(null, TODAY)],
    ['9 days overdue', '1 day overdue', 'Due today', 'Sat 16 Jan 2027', '']);
  assert.deepEqual([net.dueLine('2026-11-10', TODAY), net.dueLine('2026-12-02', TODAY)], ['9 days overdue', 'Due Wed 2 Dec']);
  assert.deepEqual([net.catchUpWords('2026-11-10', TODAY), net.catchUpWords(TODAY, TODAY), net.catchUpWords('2026-12-02', TODAY), net.catchUpWords(null, TODAY)], ['Due now', 'Due now', 'Wed 2 Dec', 'No rhythm']);
  assert.deepEqual(['2026-08-17', '2026-10-13', '2026-11-10', '2026-11-18', TODAY, null, '2025-11-19', '2024-05-01'].map((d) => net.sinceWords(d, TODAY)),
    ['3 months since you spoke', '5 weeks since you spoke', '9 days since you spoke', '1 day since you spoke', 'You spoke today', 'You haven’t spoken yet', 'A year since you spoke', '2 years since you spoke']);
});

test('Actions: Due now is most overdue first and folds after 8, Coming up is soonest first and folds after 4', () => {
  const spoke = (months, overdueBy) => daysBefore(TODAY, overdueBy + months * 30);
  const list = [
    ...[9, 7, 5, 3, 3, 3, 3, 3, 2, 1].map((over, i) => person(`d${i}`, `Due ${i}`, [5, 5, 5, 5], { rhythm_months: 1, last_spoke_on: monthsOn(daysBefore(TODAY, over), -1), role: 'Key contact' })),
    ...[40, 3, 90, 12, 25].map((ahead, i) => person(`c${i}`, `Coming ${i}`, [5, 5, 5, 5], { rhythm_months: 3, last_spoke_on: monthsOn(daysBefore(TODAY, -ahead), -3) })),
    person('none', 'No rhythm', [5, 5, 5, 5], { last_spoke_on: spoke(1, 100) }),
    person('arch', 'Archived', [5, 5, 5, 5], { rhythm_months: 1, last_spoke_on: spoke(1, 50), archived_at: '2026-10-01T00:00:00Z' }),
  ];
  const due = networkPage(list, net.dueNowQuery(TODAY));
  assert.deepEqual([due.total, due.rows.length], [10, net.DUE_FOLD]);
  assert.deepEqual(due.rows.map((p) => net.actionRow(p, TODAY).when), ['9 days overdue', '7 days overdue', '5 days overdue', '3 days overdue', '3 days overdue', '3 days overdue', '3 days overdue', '3 days overdue']);
  assert.deepEqual(net.actionRow(due.rows[0], TODAY), { id: 'd0', name: 'Due 0', role: 'Key contact', rhythm: 'Every month', when: '9 days overdue', overdue: true });
  const fold = net.folded(due.rows, due.total, net.DUE_FOLD);
  assert.deepEqual([fold.rows.length, fold.more], [8, 'Show all 10']);
  const all = networkPage(list, net.dueNowQuery(TODAY, { all: true }));
  assert.deepEqual([all.rows.length, net.folded(all.rows, all.total, net.DUE_FOLD, true).more], [10, '']);
  const coming = networkPage(list, net.comingUpQuery(TODAY));
  assert.deepEqual([coming.total, coming.rows.map((p) => p.id)], [5, ['c1', 'c3', 'c4', 'c0']]);
  assert.equal(net.folded(coming.rows, coming.total, net.COMING_FOLD).more, 'Show all 5');
  assert.equal(net.actionRow(coming.rows[0], TODAY).when, `Due ${net.dueWords(coming.rows[0].due_on, TODAY)}`);
  assert.equal(net.folded([], 0, net.DUE_FOLD).more, '');
  // "Not now, in 2 weeks" takes someone out of Due now until then.
  const later = list.map((p) => (p.id === 'd0' ? { ...p, ...net.notNow(p, TODAY).patch } : p));
  assert.equal(networkPage(later, net.dueNowQuery(TODAY)).rows[0].id, 'd1');
});

test('Ready to archive?: 18 months with no contact and on no focus list; unticked people are never suggested again', () => {
  const edge = monthsOn(TODAY, -18);
  const list = [
    person('r1', 'Long ago', null, { last_spoke_on: daysBefore(edge, 1) }),
    person('r2', 'Exactly 18 months', null, { last_spoke_on: edge }),
    person('r3', 'On a list', [9, 9, 9, 9], { last_spoke_on: daysBefore(edge, 200) }),
    person('r4', 'Rated, no list', [5, 5, 5, 5], { last_spoke_on: daysBefore(edge, 30) }),
    person('r5', 'Never spoken, added long ago', null, { added_on: daysBefore(edge, 10) }),
    person('r6', 'Kept before', null, { last_spoke_on: daysBefore(edge, 300), keep: true }),
    person('r7', 'Archived', null, { last_spoke_on: daysBefore(edge, 300), archived_at: '2026-01-01T00:00:00Z' }),
  ];
  const ready = networkPage(list, net.readyQuery(TODAY));
  // The longest out of touch first; someone never spoken to has no day, so they come last.
  assert.deepEqual(ready.rows.map((p) => p.id), ['r4', 'r1', 'r5']);
  assert.equal(networkCounts(list, TODAY).ready, 3);
  assert.deepEqual([net.readyCardLine(34), net.readyCardLine(1)], ['34 people have had no contact for 18 months and aren’t in a focus list.', '1 person has had no contact for 18 months and isn’t in a focus list.']);
  assert.deepEqual(net.readyRow(list[0], TODAY), { id: 'r1', name: 'Long ago', organisation: '', last: 'Last spoke Sun 18 May 2025' });
  assert.equal(net.readyRow(list[4], TODAY).last, 'Never spoken');
  // Review them: everyone ticked; untick one to keep, then "Archive 2".
  const plan = net.archivePlan(['r5', 'r4', 'r1'], ['r4']);
  assert.deepEqual(plan, { archive: ['r5', 'r1'], keep: ['r4'], button: 'Archive 2', toast: 'Archived 2.', needs: '' });
  assert.match(net.archivePlan(['r1'], ['r1']).needs, /nobody will be archived/);
  // What network_archive(ids, keep) leaves: the kept one isn't suggested again, ever.
  const after = list.map((p) => (plan.archive.includes(p.id) ? { ...p, archived_at: '2026-11-19T10:00:00Z' } : plan.keep.includes(p.id) ? { ...p, keep: true } : p));
  assert.deepEqual([networkCounts(after, TODAY).ready, networkPage(after, net.readyQuery(TODAY)).total], [0, 0]);
  assert.equal(readyToArchive(after.find((p) => p.id === 'r4'), '2030-01-01'), false);
  // The card: shown while someone is ready, hidden for 30 days after Not now.
  assert.equal(net.showReadyCard({ ready: 3 }, {}, TODAY), true);
  assert.equal(net.showReadyCard({ ready: 0 }, {}, TODAY), false);
  const put = net.withArchiveNotNow({ network_hidden: ['phone'] }, TODAY);
  assert.deepEqual(put, { network_hidden: ['phone'], archive_not_now: TODAY });
  assert.deepEqual([net.showReadyCard({ ready: 3 }, put, '2026-12-18'), net.showReadyCard({ ready: 3 }, put, '2026-12-19')], [false, true]);
  assert.deepEqual([net.archivedLink(37), net.archivedLink(0)], ['Archived, 37', '']);
});

test('the table’s state is one query for the paging function: search, sort, Show only, 50 at a time', () => {
  const state = { search: '  Kestrel ', sort: 'trust', desc: true, only: { focus: ['keep_close', 'none'], role: [], rhythm: [1, 0] }, pages: 3 };
  assert.deepEqual(net.tableQuery(state, TODAY), { search: 'Kestrel', sort: 'trust', desc: true, only: { focus: ['keep_close', 'none'], rhythm: [1, 0] }, archived: false, limit: 50, offset: 100, today: TODAY });
  assert.equal(net.tableQuery({ sort: 'drop table' }, TODAY).sort, 'name');
  assert.equal(net.tableQuery({ sort: 'own:col-1' }, TODAY).sort, 'own:col-1');
  // Every heading sorts, by a key the paging function knows, with words that fit the column.
  for (const c of net.NETWORK_COLUMNS) { assert.ok(NETWORK_SORTS_HAS(c.sort), c.key); assert.equal(c.sorts.length, 2); }
  const words = Object.fromEntries(net.NETWORK_COLUMNS.map((c) => [c.label, c.sorts.map(([, w]) => w)]));
  assert.deepEqual([words['Where to focus'], words.Rhythm, words['Last spoke'], words['Next due'], words.Influence, words.Name],
    [['Keep close first', 'Rebalance? first'], ['Most often first', 'Least often first'], ['Most recent first', 'Longest ago first'], ['Most overdue first', 'Furthest away first'], ['Highest first', 'Lowest first'], ['A to Z', 'Z to A']]);
  // Show only, where it fits: Organisation, Role, Where to focus and Rhythm.
  assert.deepEqual(net.NETWORK_COLUMNS.filter((c) => c.only).map((c) => c.label), ['Organisation', 'Role', 'Where to focus', 'Rhythm']);
  assert.deepEqual(net.FOCUS_ONLY.map(([, l]) => l), ['Keep close', 'Maintain', 'Invest', 'Rebalance?', 'No list']);
  assert.deepEqual(net.MAP_SHOW.map(([, l]) => l), ['Everyone', 'Keep close', 'Maintain', 'Invest', 'Rebalance?', 'No list']);
  let s = net.withOnly({ pages: 4 }, 'focus', 'keep_close', true);
  assert.deepEqual([s.only.focus, s.pages, net.headingLabel(net.NETWORK_COLUMNS[5], s), net.headingLabel(net.NETWORK_COLUMNS[1], s)], [['keep_close'], 1, 'Where to focus, 1', 'Organisation']);
  s = net.withSort(s, net.NETWORK_COLUMNS[11], true);
  assert.deepEqual([s.sort, s.desc], ['last_spoke', true]);
  assert.equal(net.isNarrowed(s), true);
  assert.equal(net.isNarrowed(net.withoutOnly(s, 'focus')), false);
  assert.deepEqual(net.cleared({ ...s, search: 'x' }).only, {});
  // The query really narrows and sorts (the device's own twin of the database).
  const list = [person('a', 'Ann', [9, 9, 9, 9], { organisation: 'Kestrel Group', rhythm_months: 1 }), person('b', 'Bob', [5, 5, 5, 5], { organisation: 'Kestrel Group' }), person('c', 'Cy', [9, 8, 9, 9], { organisation: 'Citadel', rhythm_months: 1 })];
  assert.deepEqual(networkPage(list, net.tableQuery({ search: 'kestrel', sort: 'trust', desc: true, only: { focus: ['keep_close', 'none'], rhythm: [1, 0] } }, TODAY)).rows.map((p) => p.id), ['a', 'b']);
});

test('the count, the foot of the table and the columns you can show or hide', () => {
  assert.deepEqual(net.tableCount({ total: 1139, all: 1139 }, {}), { words: '1,139 people', clear: false });
  assert.deepEqual(net.tableCount({ total: 64, all: 1176 }, { search: 'kes' }), { words: '64 of 1,176 people', clear: true });
  assert.deepEqual(net.tableCount({ total: 4, all: 11 }, { only: { focus: ['keep_close'] } }), { words: '4 of 11 people', clear: true });
  assert.deepEqual(net.tableCount({ total: 37, all: 37 }, { archived: true }), { words: '37 archived', clear: false });
  assert.deepEqual(net.tableCount({ total: 1, all: 1 }, {}).words, '1 person');
  assert.deepEqual(net.tableFoot(50, 1139), { showing: 'Showing 50 of 1,139', more: 'Show 50 more' });
  assert.deepEqual(net.tableFoot(1100, 1139), { showing: 'Showing 1,100 of 1,139', more: 'Show 39 more' });
  assert.deepEqual(net.tableFoot(20, 20), { showing: '', more: '' });
  const own = [{ id: 'col-2', name: 'Sector', kind: 'text', position: 1, hidden: false, note: 'The sector they work in.' }, { id: 'col-1', name: 'Children', kind: 'number', position: 0, hidden: true }];
  const cols = net.tableColumns(own, { network_hidden: ['phone', 'name'] });
  assert.deepEqual(cols.all.map((c) => c.label), ['Name', 'Organisation', 'Role', 'Email', 'Phone', 'Where to focus', 'Influence', 'Trust in you', 'Value delivery', 'What you get', 'Rhythm', 'Last spoke', 'Next due', 'Given', 'Asked', 'Children', 'Sector']);
  // Name can never be hidden; a hidden column of your own carries its own switch.
  assert.deepEqual(cols.shown.map((c) => c.label).filter((l) => ['Name', 'Phone', 'Children', 'Sector'].includes(l)), ['Name', 'Sector']);
  assert.deepEqual([cols.all[2].note, cols.all[7].note, cols.all[12].note, cols.all[16].note, cols.all[15].note], ['How you know them.', 'How much they trust you, 0 to 10.', 'Worked out from the rhythm and when you last spoke.', 'The sector they work in.', 'Your own column.']);
  assert.deepEqual([net.withColumnShown({ network_hidden: ['phone'] }, 'email', false).network_hidden, net.withColumnShown({ network_hidden: ['phone'] }, 'phone', true).network_hidden, net.withColumnShown({}, 'name', false).network_hidden], [['phone', 'email'], [], []]);
  assert.equal(net.columnProblem('', own), 'Type the column’s name to carry on.');
  assert.equal(net.columnProblem('trust in you', own), 'There’s already a column called Trust in you. Choose another name.');
  assert.equal(net.columnProblem('sector', own), 'There’s already a column called Sector. Choose another name.');
  assert.equal(net.columnProblem('Sector', own, 'col-2'), '');
  const made = net.newColumn({ id: 'col-3', coachId: 'c1', name: ' City ', columns: own });
  assert.deepEqual([made.name, made.kind, made.position, made.hidden], ['City', 'text', 2, false]);
});

test('a cell changed in place saves with "Saved." and what Undo puts back; worked-out columns are never typed', () => {
  const dana = person('dana', 'Dana Whitfield', [9, 8, 6, 7], { organisation: 'Kestrel Group', organisation_id: 'org-k', role: 'Sponsor', rhythm_months: 1, last_spoke_on: '2026-10-12', own: { 'col-1': '2' } });
  const col = (key) => net.NETWORK_COLUMNS.find((c) => c.key === key);
  assert.deepEqual(net.cellChange(dana, col('trust'), 6, TODAY), { patch: { id: 'dana', trust: 6 }, undo: { id: 'dana', trust: 8 }, toast: 'Saved.' });
  // The change moves her from Keep close to Invest: Where to focus, Actions and the Map follow the saved row.
  assert.deepEqual([focusOf(dana), focusOf({ ...dana, trust: 6 })], ['keep_close', 'invest']);
  assert.equal(net.cellChange(dana, col('trust'), 8, TODAY), null);
  assert.deepEqual(net.cellChange(dana, col('trust'), 11, TODAY), { error: 'Choose a number from 0 to 10.' });
  assert.deepEqual(net.cellChange(dana, col('influence'), '', TODAY).patch, { id: 'dana', influence: null });
  assert.deepEqual(net.cellChange(dana, col('rhythm_months'), 3, TODAY).patch, { id: 'dana', rhythm_months: 3 });
  assert.deepEqual(net.cellChange(dana, col('rhythm_months'), 0, TODAY).patch, { id: 'dana', rhythm_months: null });
  assert.deepEqual(net.cellChange(dana, col('last_spoke_on'), 'Mon 16 Nov', TODAY).patch, { id: 'dana', last_spoke_on: '2026-11-16' });
  assert.deepEqual(net.cellChange(dana, col('last_spoke_on'), 'next week', TODAY), { error: 'Type a date, such as 12 Oct or 12 Oct 2025.' });
  assert.deepEqual(net.cellChange(dana, col('last_spoke_on'), '25 Dec', TODAY), { error: 'That day hasn’t happened yet. Type today or an earlier day.' });
  assert.deepEqual(net.cellChange(dana, col('email'), 'Dana@Example.invalid', TODAY).patch, { id: 'dana', email: 'dana@example.invalid' });
  assert.deepEqual(net.cellChange(dana, col('email'), 'dana at kestrel', TODAY), { error: 'That email doesn’t look right. Check it and try again.' });
  assert.deepEqual(net.cellChange(dana, col('organisation'), 'Kestrel Holdings', TODAY), { patch: { id: 'dana', organisation: 'Kestrel Holdings', organisation_id: null }, undo: { id: 'dana', organisation: 'Kestrel Group', organisation_id: 'org-k' }, toast: 'Saved.' });
  for (const key of ['focus', 'due_on', 'given_count', 'asked_count', 'name']) assert.equal(net.cellChange(dana, col(key), 'x', TODAY), null);
  // Your own columns.
  const kids = net.ownColumnHead({ id: 'col-1', name: 'Children', kind: 'number' });
  assert.deepEqual(net.cellChange(dana, kids, '3', TODAY), { patch: { id: 'dana', own: { 'col-1': '3' } }, undo: { id: 'dana', own: { 'col-1': '2' } }, toast: 'Saved.' });
  assert.deepEqual(net.cellChange(dana, kids, 'three', TODAY), { error: 'Type a number.' });
  assert.deepEqual(net.cellChange(dana, kids, '', TODAY).patch, { id: 'dana', own: {} });
  assert.deepEqual([net.cellWords(dana, col('focus'), TODAY), net.cellWords(dana, col('rhythm_months'), TODAY), net.cellWords(dana, col('last_spoke_on'), TODAY), net.cellWords(dana, col('due_on'), TODAY), net.cellWords(dana, col('given_count'), TODAY), net.cellWords(dana, kids, TODAY), net.cellWords(dana, col('email'), TODAY)],
    ['Keep close', 'Every month', 'Mon 12 Oct', '7 days overdue', '0', '2', '']);
});

test('a spreadsheet’s rows become Network people: odd columns fill your own, unreadable ratings stay blank', () => {
  const table = [['Full name', 'Company', 'Relationship', 'E-mail', 'Influence', 'Trust', 'Every', 'Last contact', 'Sector', 'Shoe size'],
    ['Dan Reid', 'Harbour Lane', 'Referrer', 'DAN@example.invalid', '6', '11', 'Quarterly', '17 Aug 2026', 'Property', '9'], ['', 'Nobody Ltd', '', '', '', '', '', '', '', ''], ['Ana Silva', '', '', 'not an email', 'high', '7', '90 days', '25 Dec 2026', '', '']];
  const matched = matchColumns(table[0], net.NETWORK_IMPORT_FIELDS);
  assert.deepEqual(matched.columns.map((c) => c.field), ['name', 'organisation', 'role', 'email', 'influence', 'trust', 'rhythm_months', 'last_spoke_on', null, null]);
  const { rows, skipped } = sheetRows(table.slice(1), matched.columns);
  assert.equal(skipped, 1);
  const extra = (i) => Object.fromEntries(matched.columns.filter((c) => !c.field).map((c) => [c.heading, table[1 + (i ? 2 : 0)][c.index]]));
  const out = net.importRows(rows.map((r, i) => ({ ...r, extra: extra(i) })), { today: TODAY, columns: [{ id: 'col-s', name: 'sector' }] });
  assert.deepEqual([out[0].name, out[0].organisation, out[0].role, out[0].email, out[0].influence, out[0].trust, out[0].rhythm_months, out[0].last_spoke_on, out[0].own], ['Dan Reid', 'Harbour Lane', 'Referrer', 'dan@example.invalid', 6, null, 3, '2026-08-17', { 'col-s': 'Property' }]);
  // A date still to come is no last spoke; "high" is no rating.
  assert.deepEqual([out[1].email, out[1].influence, out[1].trust, out[1].rhythm_months, out[1].last_spoke_on], [null, null, 7, 3, null]);
  assert.equal(focusOf(out[0]), null);
  assert.deepEqual(['3', 'Every 6 months', 'monthly', 'Yearly', '45 days', 'whenever', '30'].map(net.typedRhythm), [3, 6, 1, 12, 2, null, null]);
  // Duplicates first, as the database answers them.
  const dupes = networkDuplicates([person('k1', 'Dan Reid', null, { email: 'dan@example.invalid', organisation: 'Harbour Lane' })], out);
  assert.deepEqual(dupes.map((d) => net.duplicateLine(d)), ['Dan Reid, Harbour Lane, is already in your Network, with the same email.']);
  assert.deepEqual([net.importButtonWords(41), net.importedToast(1)], ['Add 41 people', '1 person added.']);
  const exported = net.exportRows([person('dana', 'Dana Whitfield', [9, 8, 6, 7], { rhythm_months: 1, last_spoke_on: '2026-10-12', own: { c: '4' } })], [{ id: 'c', name: 'Children', kind: 'number' }], TODAY);
  assert.deepEqual([exported[0].slice(-2), exported[1].slice(5, 13), exported[1].slice(-1)], [['Notes', 'Children'], ['Keep close', 9, 8, 6, 7, 'Every month', 'Mon 12 Oct', 'Thu 12 Nov'], [4]]);
});

test('the map shows up to 150: Keep close, Maintain and Invest first, then whoever you spoke to most recently', () => {
  const list = [];
  for (let i = 0; i < 60; i += 1) list.push(person(`k${i}`, `Keep ${i}`, [5, 8, 5, 8], { last_spoke_on: '2025-01-01' }));
  for (let i = 0; i < 40; i += 1) list.push(person(`m${i}`, `Maintain ${i}`, [8, 8, 8, 3], { last_spoke_on: '2025-01-01' }));
  for (let i = 0; i < 30; i += 1) list.push(person(`i${i}`, `Invest ${i}`, [8, 3, 3, 3], { last_spoke_on: '2025-01-01' }));
  for (let i = 0; i < 200; i += 1) list.push(person(`n${i}`, `None ${String(i).padStart(3, '0')}`, [5, 5, 5, 5], { last_spoke_on: daysBefore(TODAY, i) }));
  for (let i = 0; i < 100; i += 1) list.push(person(`r${i}`, `Rebalance ${i}`, [2, 2, 2, 2], { last_spoke_on: daysBefore(TODAY, 300 + i) }));
  for (let i = 0; i < 9; i += 1) list.push(person(`u${i}`, `Unrated ${i}`, null));
  list.push(person('gone', 'Archived', [9, 9, 9, 9], { archived_at: '2026-01-01T00:00:00Z' }));
  const map = networkMap(list);
  assert.deepEqual([map.total, map.placed, map.rows.length], [439, 430, MAP_LIMIT]);
  // All 130 on the three lists are there, then the 20 spoken to most recently.
  assert.equal(map.rows.filter((p) => ['keep_close', 'maintain', 'invest'].includes(p.focus)).length, 130);
  assert.deepEqual(map.rows.slice(130).map((p) => p.id), Array.from({ length: 20 }, (_, i) => `n${i}`));
  assert.equal(net.mapLine(map), 'Showing 150 of 439 people: your focus lists first, then who you spoke to most recently.');
  // Show narrows it; under the cap there's no "Showing" line, just the count.
  const reb = networkMap(list, { show: 'rebalance' });
  assert.deepEqual([reb.rows.length, net.mapLine(reb, 'rebalance')], [100, '100 of 439 people']);
  const none = networkMap(list, { show: 'none' });
  assert.equal(net.mapLine(none, 'none'), 'Showing 150 of 200 people: your focus lists first, then who you spoke to most recently.');
  assert.equal(net.mapLine(networkMap(list.slice(0, 20))), '');
  assert.equal(net.mapLine({ total: 1139, placed: 1139, rows: new Array(150) }), 'Showing 150 of 1,139 people: your focus lists first, then who you spoke to most recently.');
  assert.deepEqual(net.MAP_CHART, { up: 'Influence', across: 'Trust', min: 0, max: 10, lineAt: 7, lineLabel: '7 or more' });
});

test('one dot per spot, with the number inside when people share it, and a style for each list, mixed and none', () => {
  const rows = networkMap([
    person('a', 'Leon Banks', [10, 7, 9, 9], { organisation: 'Ridgeway Trust', rhythm_months: 6, last_spoke_on: '2026-07-16' }),
    person('b', 'Ben Jensen', [10, 7, 9, 3], { organisation: 'Tessaly Foods' }),
    person('c', 'Ben Egan', [10, 7, 6, 3], { organisation: 'Arden Vale' }),
    person('d', 'Dana Whitfield', [9, 8, 6, 7], { organisation: 'Kestrel Group', rhythm_months: 1, last_spoke_on: '2026-10-12' }),
    person('e', 'Max One', [8, 8, 8, 3]), person('f', 'Max Two', [8, 8, 9, 2]),
    person('g', 'Out One', [8, 3, 3, 3]), person('h', 'Reb One', [2, 2, 2, 2]), person('i', 'Plain One', [5, 5, 5, 5]), person('j', 'Half Rated', [6, 6, null, null]),
  ]).rows;
  const spots = net.mapSpots(rows);
  const at = (trust, influence) => spots.find((s) => s.trust === trust && s.influence === influence);
  assert.equal(spots.length, 7);
  assert.deepEqual([at(7, 10).count, at(7, 10).number, at(7, 10).style], [3, '3', 'mixed']);
  assert.deepEqual([at(8, 8).count, at(8, 8).number, at(8, 8).style], [2, '2', 'maintain']);
  assert.deepEqual([at(8, 9).number, at(8, 9).style, at(3, 8).style, at(2, 2).style, at(5, 5).style, at(6, 6).style], ['', 'keep_close', 'invest', 'rebalance', 'none', 'none']);
  assert.equal(at(8, 9).label, 'Dana Whitfield, Keep close. Influence 9 out of 10, trust 8 out of 10.');
  assert.equal(at(7, 10).label, '3 people. Influence 10 out of 10, trust 7 out of 10. Choose to see who.');
  // The pop-up card: a title, the organisation and the list, then label and value rows.
  assert.deepEqual(net.spotCard(at(8, 9), rows, TODAY), { title: 'Dana Whitfield', sub: ['Kestrel Group', 'Keep close'], rows: [['Influence', '9/10'], ['Trust', '8/10'], ['Catch-up', 'Due now']], foot: '' });
  assert.deepEqual(net.spotCard(at(7, 10), rows, TODAY), { title: '3 people', sub: ['Several lists'], rows: [['Influence', '10/10'], ['Trust', '7/10']], foot: 'Choose to see who' });
  assert.deepEqual([net.spotCard(at(8, 8), rows, TODAY).sub, net.spotCard(at(5, 5), rows, TODAY).sub, net.spotCard(at(5, 5), rows, TODAY).rows[2]], [['Maintain'], [], ['Catch-up', 'No rhythm']]);
  assert.equal(net.spotLine(at(8, 9), rows, TODAY), 'Dana Whitfield, Kestrel Group, Keep close, Due now');
  // A numbered dot opens the list of names at that spot: by list, then by name.
  assert.deepEqual(net.spotTitle(at(7, 10)), { title: '3 people', meta: 'Trust 7/10, influence 10/10' });
  assert.deepEqual(net.spotPeople(rows, at(7, 10), TODAY).map((p) => [p.name, p.organisation, p.list, p.due]), [['Leon Banks', 'Ridgeway Trust', 'Keep close', 'Due Sat 16 Jan 2027'], ['Ben Jensen', 'Tessaly Foods', 'Maintain', ''], ['Ben Egan', 'Arden Vale', 'Invest', '']]);
  // No dot style is ever coral, and there are exactly the six.
  assert.deepEqual([...new Set(spots.map((s) => s.style))].sort(), ['invest', 'keep_close', 'maintain', 'mixed', 'none', 'rebalance']);
  assert.equal(net.MAP_HELP.length, 8);
  assert.deepEqual(net.MAP_HELP[4], ['A dashed grey outline', 'Rebalance? A lot of your time may be going in.']);
});

test('Find someone adds them to the map and rings their dot, or says what’s needed when they have no spot', () => {
  const rows = networkMap([person('a', 'Ann', [9, 9, 9, 9]), person('b', 'Bob', [9, 9, 9, 9])]).rows;
  const ben = person('ben', 'Ben Ortiz', [3, 6, 5, 5], { organisation: 'Self-funded' });
  const found = net.withFound(rows, ben);
  assert.deepEqual([found.placed, found.rows.length], [true, 3]);
  const spot = net.mapSpots(found.rows, { foundId: 'ben' }).find((s) => s.found);
  assert.deepEqual([spot.name, spot.trust, spot.influence, spot.number], ['Ben Ortiz', 6, 3, '']);
  // Someone already on the map isn't added twice; in a shared spot their dot is still the one that's ringed.
  assert.equal(net.withFound(rows, { ...rows[0] }).rows.length, 2);
  assert.deepEqual([net.mapSpots(rows, { foundId: 'a' })[0].found, net.mapSpots(rows, { foundId: 'a' })[0].name, net.mapSpots(rows, { foundId: 'a' })[0].number], [true, 'Ann', '2']);
  assert.deepEqual(net.withFound(rows, person('x', 'Zara Nash', null)), { rows, placed: false, line: 'Zara isn’t on the map yet. Rate their influence and trust to place them.' });
});

test('give and ask: the kinds, the counts and the line in words', () => {
  assert.deepEqual(GAVE_KINDS.map((k) => net.GAVE_WORDS[k]), ['An idea', 'An article or resource', 'An introduction', 'A favour', 'Something else']);
  assert.deepEqual(ASKED_KINDS.map((k) => net.ASKED_WORDS[k]), ['An introduction', 'A referral', 'Advice', 'A favour', 'Something else']);
  assert.deepEqual([net.giveAskLine(2, 1), net.giveAskLine(1, 0), net.giveAskLine(0, 0), net.giveAskLine(0, 2), net.giveAskLine(3, 12), net.giveAskLine(1, 1)],
    ['You’ve given twice and asked once.', 'You’ve given once and haven’t asked yet.', 'Nothing logged yet.', 'You’ve asked twice and haven’t given yet.', 'You’ve given 3 times and asked 12 times.', 'You’ve given once and asked once.']);
  // The portal's apostrophe, never a straight one.
  assert.doesNotMatch(net.giveAskLine(2, 1) + net.giveAskLine(0, 2) + net.GIVE_WORDS.gave.title + net.GIVE_WORDS.asked.title, /'/);
  const gives = [{ id: 'g1', person_id: 'dan', direction: 'gave', kind: 'introduction', note: 'Introduced Dan to Kestrel.', happened_on: '2026-09-20' }, { id: 'g2', person_id: 'dan', direction: 'asked', kind: 'referral', note: 'Asked who else is building a team.', happened_on: '2026-10-05' },
    { id: 'g3', person_id: 'dan', direction: 'gave', kind: 'idea', note: 'A different approach.', happened_on: TODAY }, { id: 'g4', person_id: 'dana', direction: 'gave', kind: 'resource', note: null, happened_on: TODAY }];
  assert.deepEqual(net.giveCounts(gives, 'dan'), { given: 2, asked: 1 });
  assert.equal(net.giveAskLine(...Object.values(net.giveCounts(gives, 'dan'))), 'You’ve given twice and asked once.');
  assert.deepEqual(net.giveRows(gives.filter((g) => g.person_id === 'dan'), 'gave', TODAY), [{ id: 'g3', kind: 'An idea', note: 'A different approach.', when: 'Today' }, { id: 'g1', kind: 'An introduction', note: 'Introduced Dan to Kestrel.', when: 'Sun 20 Sep' }]);
  assert.deepEqual([net.GIVE_WORDS.gave.log, net.GIVE_WORDS.asked.log, net.GIVE_WORDS.asked.none], ['Log what you gave', 'Log an ask', 'Nothing asked yet.']);
  const made = net.newGive({ id: 'g9', coachId: 'c1', personId: 'dan', direction: 'asked', kind: 'advice', note: ' How do they choose partners? ', today: TODAY });
  assert.deepEqual(made, { give: { id: 'g9', person_id: 'dan', coach_id: 'c1', direction: 'asked', kind: 'advice', note: 'How do they choose partners?', happened_on: TODAY }, toast: 'Logged.' });
  // An ask can't be an idea, and a give can't be advice (the database's own check).
  assert.equal(net.newGive({ id: 'x', coachId: 'c1', personId: 'dan', direction: 'asked', kind: 'idea', today: TODAY }).error, 'Choose one to carry on.');
  assert.equal(net.newGive({ id: 'x', coachId: 'c1', personId: 'dan', direction: 'gave', kind: 'advice', today: TODAY }).error, 'Choose one to carry on.');
  assert.equal(net.newGive({ id: 'x', coachId: 'c1', personId: 'dan', direction: 'gave', kind: 'other', today: TODAY }).error, 'Type what you gave to carry on.');
});

test('every change to a rating is kept with its date, one value a rating and day', () => {
  const dana = person('dana', 'Dana Whitfield', [9, 8, 6, 7]);
  const change = net.ratingsChange(dana, { influence: 9, trust: 6, value_delivery: '', what_you_get: 8 }, { today: TODAY, coachId: 'c1' });
  assert.deepEqual(change.patch, { id: 'dana', trust: 6, value_delivery: null, what_you_get: 8 });
  assert.deepEqual(change.undo, { id: 'dana', trust: 8, value_delivery: 6, what_you_get: 7 });
  assert.deepEqual(change.history.map((h) => [h.rating, h.value, h.rated_on]), [['trust', 6, TODAY], ['what_you_get', 8, TODAY]]);
  assert.equal(net.ratingsChange(dana, { influence: 9 }, { today: TODAY, coachId: 'c1' }), null);
  assert.deepEqual(net.ratingsChange(dana, { trust: 10.5 }, { today: TODAY, coachId: 'c1' }), { error: 'Choose a number from 0 to 10.' });
  const history = net.withRatings([{ person_id: 'dana', rating: 'trust', rated_on: '2026-06-01', value: 5 }, { person_id: 'dana', rating: 'trust', rated_on: '2026-09-01', value: 8 }, { person_id: 'dana', rating: 'trust', rated_on: TODAY, value: 7 }], change.history);
  assert.equal(history.filter((h) => h.rating === 'trust' && h.rated_on === TODAY).length, 1);
  assert.deepEqual(net.ratingHistory(history, 'trust', TODAY), [{ value: '6/10', when: 'Today', change: 'Down from 8' }, { value: '8/10', when: 'Tue 1 Sep', change: 'Up from 5' }, { value: '5/10', when: 'Mon 1 Jun', change: '' }]);
  assert.equal(net.RATINGS_HELP, 'Every change is kept with its date.');
});

test('one person: last spoke, I spoke to them today, Not now, Stop, contact details, and Email and WhatsApp in the coach’s own apps', () => {
  const david = person('david', 'David Stark', [9, 6, 7, 7], { organisation: 'Citadel', role: 'Chief medical officer', email: 'david@example.invalid', phone: '+1 212 555 0147', rhythm_months: 2, last_spoke_on: '2026-09-01' });
  assert.deepEqual([net.personSub(david), net.lastSpokeLine(david, TODAY), net.lastSpokeLine({ ...david, last_spoke_on: TODAY }, TODAY), net.lastSpokeLine({}, TODAY), net.spokeLabel(david)],
    ['Chief medical officer, Citadel', 'You last spoke on Tue 1 Sep.', 'You last spoke today.', 'You haven’t spoken yet.', 'I spoke to David today']);
  assert.deepEqual(net.spokeToday({ ...david, snoozed_until: '2026-12-01' }, TODAY), { patch: { id: 'david', last_spoke_on: TODAY, snoozed_until: null }, undo: { id: 'david', last_spoke_on: '2026-09-01', snoozed_until: '2026-12-01' }, toast: 'Logged. Next time is Tue 19 Jan 2027.' });
  assert.equal(net.spokeToday({ ...david, rhythm_months: null }, TODAY).toast, 'Logged.');
  assert.deepEqual([net.notNow(david, TODAY).patch, net.notNow(david, TODAY).toast], [{ id: 'david', snoozed_until: '2026-12-03' }, 'Moved to Thu 3 Dec.']);
  assert.deepEqual([net.stopKeeping(david).patch, net.stopKeeping(david).toast], [{ id: 'david', rhythm_months: null, snoozed_until: null }, 'Stopped. They stay in your Network.']);
  // Email and WhatsApp open the coach's own apps; iMessage only for +1; a UK number written 07… still opens WhatsApp. Nothing is sent.
  assert.deepEqual(net.personContacts(david).map((c) => [c.label, c.href]), [['Email', 'mailto:david@example.invalid'], ['WhatsApp', 'https://wa.me/12125550147'], ['iMessage', 'sms:+12125550147']]);
  assert.deepEqual(net.personContacts({ phone: '07700 900141' }).map((c) => [c.label, c.href]), [['WhatsApp', 'https://wa.me/447700900141']]);
  assert.deepEqual([net.mobileForLinks('0044 7700 900141'), net.mobileForLinks('ext. 204'), net.mobileForLinks('')], ['+447700900141', '', '']);
  assert.deepEqual(net.personContacts({ phone: 'ask reception' }), []);
  assert.deepEqual(net.contactChange(david, { email: 'D.Stark@Example.invalid', phone: ' ' }), { patch: { id: 'david', email: 'd.stark@example.invalid', phone: null }, undo: { id: 'david', email: 'david@example.invalid', phone: '+1 212 555 0147' }, toast: 'Saved.' });
  assert.equal(net.contactChange(david, { email: 'nope', phone: '' }).error, 'That email doesn’t look right. Check it and try again.');
  assert.equal(net.contactChange(david, { email: david.email, phone: david.phone }), null);
  const added = net.newPerson({ id: 'n1', coachId: 'c1', name: ' Ruth  Adeyemi ', role: 'Referrer', rhythm: 3, today: TODAY });
  assert.deepEqual([added.person.name, added.person.role, added.person.rhythm_months, added.person.added_on, added.person.keep, added.toast], ['Ruth Adeyemi', 'Referrer', 3, TODAY, false, 'Added. You’ll see them here when it’s time.']);
  // Never spoken counts from the day they were added.
  assert.equal(dueOn(added.person), monthsOn(TODAY, 3));
  assert.equal(net.newPerson({ id: 'n2', coachId: 'c1', name: '', today: TODAY }).error, 'Type their name to carry on.');
  assert.deepEqual([net.PERSON_WORDS.moveToLeads, net.PERSON_WORDS.archive, net.PERSON_WORDS.restore, net.PERSON_WORDS.editContact], ['Move to Leads', 'Archive', 'Restore', 'Edit contact details']);
});

test('Today’s Keep in touch: one quiet line each for the people due and the check-ins, and the menu’s count', () => {
  const list = [9, 7, 5, 3, 2].map((over, i) => person(`d${i}`, ['Sofia Marsh', 'Dana Whitfield', 'Hannah Wells', 'Jamal Irwin', 'Dan Reid'][i], [5, 5, 5, 5], { role: ['Key contact', 'Sponsor', 'Client', 'Client', 'Referrer'][i], rhythm_months: 3, last_spoke_on: monthsOn(daysBefore(TODAY, over), -3) }));
  const due = networkPage(list, net.todayDueQuery(TODAY));
  assert.deepEqual([due.total, due.rows.length], [5, 3]);
  const checkIns = [{ id: 'ci1', profileId: 'p-grace', name: 'Grace Liu', what: '6-month check-in', when: 'Due Sat 12 Dec' }];
  const kit = net.todayKeepInTouch({ due, checkIns, today: TODAY });
  assert.equal(kit.title, 'Keep in touch');
  assert.deepEqual(kit.people.map((p) => [p.name, p.sub]), [['Sofia Marsh', 'Key contact'], ['Dana Whitfield', 'Sponsor'], ['Hannah Wells', 'Client']]);
  assert.equal(kit.people[0].line, 'Sofia Marsh: 3 months since you spoke.');
  assert.equal(kit.more, 'Show all 5');
  assert.deepEqual(kit.checkIns, [{ id: 'ci1', profileId: 'p-grace', name: 'Grace Liu', sub: '6-month check-in', when: 'Due Sat 12 Dec', line: 'Grace Liu: 6-month check-in, due Sat 12 Dec.' }]);
  assert.equal(net.todayKeepInTouch({ due: { total: 2, rows: due.rows.slice(0, 2) }, today: TODAY }).more, '');
  assert.equal(net.todayKeepInTouch({ due: { total: 0, rows: [] }, checkIns: [], today: TODAY }), null);
  assert.equal(net.todayKeepInTouch({ checkIns, today: TODAY }).people.length, 0);
  // The menu's count is how many people are due a catch-up.
  assert.deepEqual(net.menuCount(networkCounts(list, TODAY)), { count: '5', spoken: '5 due a catch-up' });
  assert.deepEqual(net.menuCount({ due: 1139 }), { count: '1,139', spoken: '1,139 due a catch-up' });
  assert.deepEqual(net.menuCount({ due: 0 }), { count: '', spoken: '' });
});
