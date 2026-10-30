// The end-of-sprint review's answers and tool work tagged to a Strategy
// (migration 038, Tim 29 Oct): saved to their tables once Tim has run 038;
// until then kept on the device with no error, and moved across once.
// Against an in-memory stand-in for the database (fakes/supabase.mjs):
// 'without 038' is the table missing, as PostgREST answers.
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./fakes/swap-supabase.mjs', import.meta.url);

const store = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
  addEventListener() {},
  setInterval,
  clearInterval,
};

const fake = await import('./fakes/supabase.mjs');
const { saveSprintReviewAnswers, moveSprintReviewAnswers, ANSWERS_ON_DEVICE } = await import('../../src/lib/performance/sprintReviewAnswers.js');
const { linkToolWork, loadToolWork, moveToolWorkLinks, unlinkToolWork } = await import('../../src/lib/performance/toolWork.js');
const { readCache } = await import('../../src/lib/pageCache.js');

const ME = 'me';
const onDevice = () => readCache(ME, ANSWERS_ON_DEVICE)?.v || {};
const answers = { worked: 'Morning blocks before clients.', next: 'Fewer evening calls.', choice: 'sprint', at: '2026-10-21' };

beforeEach(() => {
  fake.reset();
  store.clear();
});

test('without 038: the answers stay on the device, with no error', async () => {
  fake.db.missing.add('sprint_reviews');
  const where = await saveSprintReviewAnswers(ME, 's1', answers);
  assert.equal(where, 'device');
  assert.equal(onDevice().s1.worked, answers.worked);
  assert.equal(onDevice().s1.choice, 'sprint');
  assert.equal(await moveSprintReviewAnswers(ME), 0, 'nothing to move while the table is missing');
  assert.ok(onDevice().s1, 'still on the device');
});

test('with 038: saved to sprint_reviews and taken off the device', async () => {
  const where = await saveSprintReviewAnswers(ME, 's2', answers);
  assert.equal(where, 'saved');
  const row = fake.db.tables.sprint_reviews.find((r) => r.sprint_id === 's2');
  assert.equal(row.worked_best, answers.worked);
  assert.equal(row.next_better, answers.next);
  assert.equal(row.next_choice, 'sprint');
  assert.ok(row.finished_at);
  assert.equal(onDevice().s2, undefined);
});

test('once 038 has run: a device copy moves across once, never over a saved answer', async () => {
  fake.db.missing.add('sprint_reviews');
  await saveSprintReviewAnswers(ME, 's3', answers);
  await saveSprintReviewAnswers(ME, 's4', { ...answers, worked: 'Kept on this device' });
  fake.db.missing.delete('sprint_reviews'); // Tim runs 038
  fake.put('sprint_reviews', { id: 'r4', user_id: ME, sprint_id: 's4', worked_best: 'Saved from another device' });
  assert.equal(await moveSprintReviewAnswers(ME), 2);
  assert.equal(fake.db.tables.sprint_reviews.find((r) => r.sprint_id === 's3').worked_best, answers.worked);
  assert.equal(fake.db.tables.sprint_reviews.find((r) => r.sprint_id === 's4').worked_best, 'Saved from another device');
  assert.deepEqual(onDevice(), {});
  assert.equal(await moveSprintReviewAnswers(ME), 0, 'once only');
  assert.equal(fake.db.tables.sprint_reviews.length, 2);
});

test('answers longer than 4000 characters are cut to fit the table', async () => {
  await saveSprintReviewAnswers(ME, 's5', { ...answers, worked: 'x'.repeat(4100) });
  assert.equal(fake.db.tables.sprint_reviews[0].worked_best.length, 4000);
});

test('tool work: without 038 the tags stay on the device; once it has run they move across once', async () => {
  fake.db.missing.add('tool_work_strategies');
  const a = await linkToolWork(ME, { decisionId: 'd1', strategyId: 'st1', sprintId: 'sp1', sprintWeek: 4, linkedOn: '2026-10-21' });
  const again = await linkToolWork(ME, { decisionId: 'd1', strategyId: 'st1', sprintId: 'sp1', sprintWeek: 4, linkedOn: '2026-10-21' });
  assert.equal(a.where, 'device');
  assert.equal(again.id, a.id, 'once per item and Strategy');
  await linkToolWork(ME, { journalEntryId: 'j1', strategyId: 'st1', linkedOn: '2026-10-22' });
  assert.equal((await loadToolWork(ME, { strategyId: 'st1' })).length, 2);
  assert.equal((await loadToolWork(ME, { sprintId: 'sp1', week: 4 })).length, 1);
  fake.db.missing.delete('tool_work_strategies');
  assert.equal(await moveToolWorkLinks(ME), 2);
  assert.equal(fake.db.tables.tool_work_strategies.length, 2);
  assert.equal(await moveToolWorkLinks(ME), 0, 'once only');
  assert.equal((await loadToolWork(ME, { strategyId: 'st1' })).length, 2);
});

test('tool work: with 038, tagged, read back and taken off', async () => {
  const t = await linkToolWork(ME, { decisionId: 'd2', strategyId: 'st2', linkedOn: '2026-10-21' });
  assert.equal(t.where, 'saved');
  assert.equal((await loadToolWork(ME, { strategyId: 'st2' }))[0].decision_id, 'd2');
  await unlinkToolWork(ME, t.id);
  assert.equal((await loadToolWork(ME, { strategyId: 'st2' })).length, 0);
});

test('tool work: exactly one item, and a sprint with its week', async () => {
  await assert.rejects(linkToolWork(ME, { strategyId: 'st', linkedOn: '2026-10-21' }));
  await assert.rejects(linkToolWork(ME, { decisionId: 'd', journalEntryId: 'j', strategyId: 'st', linkedOn: '2026-10-21' }));
  await assert.rejects(linkToolWork(ME, { decisionId: 'd', strategyId: 'st', sprintId: 'sp', linkedOn: '2026-10-21' }));
});
