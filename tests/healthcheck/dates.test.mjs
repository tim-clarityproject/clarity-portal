// Project dates (methods M20.1, "Project dates"): the check, the saved values
// and the words. Run with npm run test:healthcheck.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkProjectDates, projectDates, projectDatesText } from '../../src/lib/projectDates.js';
import { cleanItems, dataFromDraft, draftFromData, setProjectDates } from '../../src/pages/alignment/alignmentFlow.js';

test('words: month only, exact dates, open-ended, blank', () => {
  assert.deepEqual(projectDatesText({ started: '2025-03', due: '2027-06' }), ['Started Mar 2025', 'Due to finish Jun 2027']);
  assert.deepEqual(projectDatesText({ started: '2025-03', startedOn: '2025-03-03', due: '2027-06', dueOn: '2027-06-30' }),
    ['Started 3 Mar 2025', 'Due to finish 30 Jun 2027']);
  assert.deepEqual(projectDatesText({ started: '2025-03', due: 'open' }), ['Started Mar 2025', 'Open-ended, with no agreed finish date']);
  assert.deepEqual(projectDatesText({ due: 'open' }), ['Open-ended, with no agreed finish date']);
  assert.deepEqual(projectDatesText({ due: '2027-06' }), ['Due to finish Jun 2027']);
  assert.deepEqual(projectDatesText({}), []);
  assert.deepEqual(projectDatesText({ id: 'p', text: 'Old project' }), []);
});

test('the check accepts good dates and leaves blanks out', () => {
  assert.deepEqual(checkProjectDates({ started: '2025-03', startedOn: '', due: 'open', dueOn: null }),
    { ok: true, dates: { started: '2025-03', due: 'open' } });
  assert.deepEqual(checkProjectDates({}), { ok: true, dates: {} });
  assert.deepEqual(checkProjectDates({ started: '1990-01', due: '2100-12', dueOn: '2100-12-31' }),
    { ok: true, dates: { started: '1990-01', due: '2100-12', dueOn: '2100-12-31' } });
  // An exact date alone takes its month from the date.
  assert.deepEqual(checkProjectDates({ startedOn: '2024-02-29' }), { ok: true, dates: { started: '2024-02', startedOn: '2024-02-29' } });
  // Finishing in the month it started is fine.
  assert.equal(checkProjectDates({ started: '2025-03', due: '2025-03' }).ok, true);
  assert.equal(checkProjectDates({ startedOn: '2025-03-10', dueOn: '2025-03-10' }).ok, true);
});

test('the check refuses odd months, days and years', () => {
  const bad = [
    [{ started: '2025-13' }, 'started'],
    [{ started: '2025-00' }, 'started'],
    [{ started: '1989-12' }, 'started'],
    [{ due: '2101-01' }, 'due'],
    [{ due: '25-03' }, 'due'],
    [{ due: 'soon' }, 'due'],
    [{ startedOn: '2025-02-29' }, 'startedOn'],
    [{ startedOn: '2025-04-31' }, 'startedOn'],
    [{ dueOn: '2025-06-00' }, 'dueOn'],
    [{ started: '2025-03', startedOn: '2025-04-01' }, 'startedOn'],
    [{ due: '2027-06', dueOn: '2027-07-01' }, 'dueOn'],
    [{ due: 'open', dueOn: '2027-06-30' }, 'dueOn'],
    [{ started: 202503 }, 'started'],
  ];
  bad.forEach(([input, field]) => {
    const result = checkProjectDates(input);
    assert.equal(result.ok, false, JSON.stringify(input));
    assert.equal(result.field, field, JSON.stringify(input));
  });
});

test('a finish before the start is refused with the calm line', () => {
  const result = checkProjectDates({ started: '2025-03', due: '2025-02' });
  assert.deepEqual(result, { ok: false, field: 'due', message: 'The finish date can’t be before the start date.' });
  assert.equal(checkProjectDates({ startedOn: '2025-03-10', dueOn: '2025-03-09' }).message, 'The finish date can’t be before the start date.');
});

test('bad saved values read as blank, never as an error', () => {
  assert.deepEqual(projectDates({ started: '2025-13', due: 'open' }), { due: 'open' });
  assert.deepEqual(projectDates({ startedOn: '2025-03-03' }), {}); // an exact date without its month
  assert.deepEqual(projectDates({ started: '2025-03', startedOn: '2025-04-03' }), { started: '2025-03' });
  assert.deepEqual(projectDates({ due: 'open', dueOn: '2027-06-30' }), { due: 'open' });
  assert.deepEqual(projectDates({ started: '2025-03', due: '2024-01', dueOn: '2024-01-05' }), { started: '2025-03' });
  assert.deepEqual(projectDates({ started: { y: 2025 }, due: ['2027-06'] }), {});
  assert.deepEqual(projectDates(null), {});
  assert.deepEqual(projectDatesText({ started: 'nonsense', due: '2027-99' }), []);
});

test('the four dates survive the draft, cleanItems, the save and reopening; anything else is dropped', () => {
  const saved = {
    objective: 'Grow',
    csfs: [{ id: 'f1', text: 'Win enterprise customers in the US' }],
    projects: [
      { id: 'p1', text: 'Data platform', started: '2025-03', startedOn: '2025-03-03', due: '2027-06', dueOn: '2027-06-30', colour: 'red' },
      { id: 'p2', text: 'Hiring', due: 'open' },
      { id: 'p3', text: 'Old project' },
    ],
    ratings: { owner: { p1: { contrib: { f1: 2 }, progress: 1, resource: 5 } } },
  };
  const draft = draftFromData(saved);
  const data = dataFromDraft(draft);
  assert.deepEqual(data.projects, [
    { id: 'p1', text: 'Data platform', started: '2025-03', startedOn: '2025-03-03', due: '2027-06', dueOn: '2027-06-30' },
    { id: 'p2', text: 'Hiring', due: 'open' },
    { id: 'p3', text: 'Old project' },
  ]);
  // Reopened again: the same.
  assert.deepEqual(dataFromDraft(draftFromData(data)), data);
  // The copy the email reads.
  assert.deepEqual(cleanItems(saved.projects), data.projects);
});

test('old Health Checks with no dates save exactly as before', () => {
  const old = {
    objective: 'Grow',
    csfs: [{ id: 'f1', text: 'A' }],
    projects: [{ id: 'p1', text: 'B' }],
    ratings: { owner: { p1: { contrib: { f1: 3 }, progress: 4, resource: 2 } } },
    completedAt: '2026-10-01T10:00:00.000Z',
  };
  assert.deepEqual(dataFromDraft(draftFromData(old)), old);
});

test('setProjectDates checks, sets and clears one project', () => {
  const draft = draftFromData({ projects: [{ id: 'p1', text: 'A', started: '2025-01' }, { id: 'p2', text: 'B' }] });
  const set = setProjectDates(draft, 'p2', { started: '2025-03', due: 'open' });
  assert.equal(set.ok, true);
  assert.deepEqual(dataFromDraft(set.draft).projects, [{ id: 'p1', text: 'A', started: '2025-01' }, { id: 'p2', text: 'B', started: '2025-03', due: 'open' }]);
  const cleared = setProjectDates(set.draft, 'p2', { started: '', due: '' });
  assert.deepEqual(dataFromDraft(cleared.draft).projects[1], { id: 'p2', text: 'B' });
  const refused = setProjectDates(draft, 'p1', { started: '2025-03', due: '2025-01' });
  assert.equal(refused.ok, false);
  assert.equal(refused.message, 'The finish date can’t be before the start date.');
});

test('null or odd input to the check reads as blank', () => {
  assert.deepEqual(checkProjectDates(null), { ok: true, dates: {} });
  assert.deepEqual(checkProjectDates('2025-03'), { ok: true, dates: {} });
});

test('a damaged saved item is skipped, not fatal', () => {
  const draft = draftFromData({ projects: [null, 'text', { id: 'p1', text: 'A', due: 'open' }] });
  assert.deepEqual(dataFromDraft(draft).projects, [{ id: 'p1', text: 'A', due: 'open' }]);
});
