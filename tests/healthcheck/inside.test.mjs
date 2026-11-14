// The Health Check inside the portal (M7 version 8.2): teams from saved
// rows, the older pages' shape, a new version from the last, a new team,
// and Compare two versions (its sentence and its swap).
// Run: npm run test:healthcheck
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE, SHAPE, TOOL_TYPE, claimedTip, compareVersions, copiedLine, draftFromOld, formFrom, hasAnswers, isNewShape, isWhole, nameTaken,
  newTeamVersion, newVersionFrom, oldTeamId, rowFrom, shortHeadline, teamsFrom, versionDate, versionFromRow, versionName,
} from '../../src/lib/healthCheck/inside.js';
import { cleanItems, dataFromDraft } from '../../src/pages/alignment/alignmentFlow.js';
import { resultRows } from '../../src/health-check/words.js';

const TODAY = '2026-11-14';

// M7's Leadership team, three versions (its TEAMS, invented data).
const CSF = ['Win and keep enterprise clients', 'A product customers recommend', 'A team with the right skills in the right roles', 'Cash to invest ahead of growth'];
function data(projects, levels = [3, 2, 2, 1], line = 50) {
  return {
    objective: 'Double recurring revenue by 2028 while keeping client satisfaction above 9 out of 10.',
    csfs: CSF.map((text, i) => ({ id: `f${i}`, text, level: levels[i] })),
    projects: projects.map((p) => ({ id: p.id, text: p.t, ...(p.s ? { started: p.s } : {}), ...(p.f ? { due: p.f } : {}) })),
    ratings: { owner: Object.fromEntries(projects.map((p) => [p.id, { contrib: Object.fromEntries(p.c.map((v, k) => [`f${k}`, v])), progress: p.p, resource: p.r }])) },
    importantLine: line,
    completedAt: '2026-10-27T10:00:00Z',
  };
}
const LT3 = [
  { id: 'p1', t: 'Enterprise sales team', c: [3, 2, 2, 3], p: 2, r: 5, s: '2025-09', f: '2026-12' },
  { id: 'p2', t: 'Customer success programme', c: [3, 3, 1, 2], p: 4, r: 3 },
  { id: 'p3', t: 'Pricing review', c: [2, 2, 0, 3], p: 3, r: 2 },
  { id: 'p4', t: 'Hiring plan for 2027', c: [2, 1, 2, 2], p: 1, r: 4 },
  { id: 'p5', t: 'Partner channel', c: [2, 1, 1, 1], p: 3, r: 3 },
  { id: 'p6', t: 'New office fit-out', c: [0, 0, 1, 1], p: 4, r: 4 },
  { id: 'p7', t: 'Data platform', c: [1, 3, 1, 2], p: 5, r: 3 },
];
const LT2 = [
  { id: 'p1', t: 'Enterprise sales team', c: [3, 2, 2, 3], p: 3, r: 4 },
  { id: 'p2', t: 'Customer success programme', c: [3, 3, 1, 2], p: 3, r: 3 },
  { id: 'p3', t: 'Pricing review', c: [2, 2, 0, 3], p: 2, r: 2 },
  { id: 'p5', t: 'Partner channel', c: [2, 1, 1, 1], p: 3, r: 3 },
  { id: 'p6', t: 'New office fit-out', c: [0, 0, 1, 1], p: 3, r: 4 },
  { id: 'p7', t: 'Data platform', c: [1, 3, 1, 2], p: 4, r: 3 },
  { id: 'p8', t: 'Rebrand', c: [1, 2, 0, 1], p: 4, r: 3 },
];
const team = { id: 'team-lt', name: 'Leadership team' };
const row = (id, date, projects, extra = {}) => ({
  id,
  tool_type: TOOL_TYPE,
  title: team.name,
  status: 'completed',
  draft: false,
  created_at: `${date} 09:00:00`,
  updated_at: `${date} 09:00:00`,
  form_data: { shape: SHAPE, team, date, made: 'version', data: data(projects, date === '2026-10-27' ? [3, 2, 2, 1] : [2, 2, 2, 2]), shared_with_coach: true, ...extra },
});

test('the address and the shape', () => {
  assert.equal(BASE, '/strategic-alignment');
  assert.ok(isNewShape(row('a', '2026-10-27', LT3).form_data));
  assert.ok(!isNewShape({ goal: 'x', factors: [], projects: [] }));
});

test('an older page’s Health Check opens as a team with one version, filled as those pages showed it', () => {
  const old = {
    id: 'old-1',
    tool_type: TOOL_TYPE,
    title: 'Board',
    status: 'completed',
    draft: false,
    created_at: '2025-03-12 08:00:00',
    form_data: {
      goal: 'Grow',
      risks: ['Cash'],
      strategies: [],
      factors: ['Sales', '', 'Product'],
      projects: ['CRM', 'Website', ''],
      matrix: { '0-0': 3, '0-2': 1, '1-0': 2 },
      progress: { 1: 5 },
    },
  };
  const v = versionFromRow(old);
  assert.equal(v.old, true);
  assert.equal(v.teamName, 'Board');
  assert.equal(v.teamId, oldTeamId('Board'));
  assert.equal(v.status, 'completed');
  assert.equal(v.date, '2025-03-12');
  const d = v.draft;
  assert.equal(d.objective, 'Grow');
  assert.deepEqual(cleanItems(d.csfs).map((f) => f.text), ['Sales', 'Product']);
  assert.deepEqual(cleanItems(d.projects).map((p) => p.text), ['CRM', 'Website']);
  // a contribution never set reads None; a progress never moved reads Fair; resource was never asked
  assert.deepEqual(d.ratings['old-p0'].contrib, { 'old-f0': 3, 'old-f2': 1 });
  assert.deepEqual(d.ratings['old-p1'].contrib, { 'old-f0': 2, 'old-f2': 0 });
  assert.equal(d.ratings['old-p0'].progress, 3);
  assert.equal(d.ratings['old-p1'].progress, 5);
  assert.equal(d.ratings['old-p0'].resource, null);
  assert.equal(isWhole(d), false);
  // the same ids each time it is read
  assert.deepEqual(versionFromRow(old).draft.ratings, d.ratings);
  // the results can be drawn: two rows, both rated for importance
  assert.equal(resultRows(d).length, 2);
  // saved again only when changed: the older keys it had no place for are kept
  const form = formFrom(v);
  assert.equal(form.shape, SHAPE);
  assert.deepEqual(form.risks, ['Cash']);
  assert.equal(form.team.name, 'Board');
  // a damaged row still opens
  assert.doesNotThrow(() => versionFromRow({ id: 'x', tool_type: TOOL_TYPE, title: '', form_data: null }));
  assert.equal(versionFromRow({ id: 'x', tool_type: TOOL_TYPE, title: '', form_data: 'nonsense' }).teamName, 'Your team');
});

test('teams from rows: finished versions newest first, the draft apart, newest team first', () => {
  const rows = [
    row('lt1', '2026-04-03', LT2),
    row('lt3', '2026-10-27', LT3),
    row('lt2', '2026-07-14', LT2),
    { ...row('lt4', '2026-11-13', LT3), status: 'draft', draft: true },
    { id: 'old-1', tool_type: TOOL_TYPE, title: 'Product team', created_at: '2026-09-02 08:00:00', form_data: { goal: 'g', factors: ['a'], projects: ['b'], matrix: {}, progress: {} } },
    { id: 'other', tool_type: 'grow', title: 'x', form_data: {} },
  ];
  const teams = teamsFrom(rows);
  assert.equal(teams.length, 2);
  assert.equal(teams[0].name, 'Leadership team');
  assert.deepEqual(teams[0].versions.map((v) => v.id), ['lt3', 'lt2', 'lt1']);
  assert.equal(teams[0].draft.id, 'lt4');
  assert.equal(teams[1].name, 'Product team');
  assert.equal(teams[1].versions.length, 1);
  assert.ok(nameTaken(teams, ' leadership TEAM '));
  assert.ok(!nameTaken(teams, 'Leadership team', 'team-lt'));
});

test('names, dates and the headline under a version', () => {
  const v = versionFromRow(row('lt3', '2026-10-27', LT3));
  assert.equal(versionName(v), 'October Health Check');
  assert.equal(versionDate('2026-10-27', TODAY), 'Tue 27 Oct');
  assert.equal(versionDate('2025-04-03', TODAY), '3 Apr 2025');
  assert.match(shortHeadline(v.draft), /^\d+ of \d+ important projects (is|are) moving well\.$/);
  assert.equal(shortHeadline(newTeamVersion().draft), 'None of the important projects is under way yet.');
});

test('a new version carries the last version’s answers, every rating blank (M7 version 8.2)', () => {
  const last = versionFromRow(row('lt3', '2026-10-27', LT3, { shared_with_coach: false }));
  const v = newVersionFrom(last, { id: 'n1', today: TODAY });
  assert.equal(v.id, 'n1');
  assert.equal(v.teamId, 'team-lt');
  assert.equal(v.date, TODAY);
  assert.equal(v.from, 'lt3');
  assert.equal(v.made, 'version');
  assert.equal(v.status, 'new');
  assert.equal(v.shared, false, 'who sees it carries over');
  const d = v.draft;
  assert.equal(d.objective, last.draft.objective);
  assert.deepEqual(cleanItems(d.csfs), cleanItems(last.draft.csfs), 'the Success Factors with their levels and ids');
  assert.deepEqual(cleanItems(d.projects), cleanItems(last.draft.projects), 'the projects with their dates and ids');
  assert.equal(d.importantLine, 50);
  assert.deepEqual(d.ratings, {}, 'every rating starts blank');
  assert.equal(d.completedAt, null);
  assert.deepEqual(last.draft.ratings.p1.contrib, { f0: 3, f1: 2, f2: 2, f3: 3 }, 'the earlier version keeps its ratings');
  assert.equal(copiedLine(d), 'Your objective, 4 Success Factors with their weights, and 7 projects with their dates are copied in.');
  assert.ok(hasAnswers(d));
  assert.ok(!isWhole(d));
});

test('a new team starts empty, named first, shared as asked', () => {
  const v = newTeamVersion({ id: 'n2', teamId: 't2', today: TODAY, shared: true });
  assert.equal(v.made, 'team');
  assert.equal(v.teamName, '');
  assert.ok(!hasAnswers(v.draft));
  const saved = rowFrom({ ...v, teamName: ' Sales team ' }, 'user-1', 'draft', { screen: 'objective' });
  assert.equal(saved.title, 'Sales team');
  assert.equal(saved.tool_type, TOOL_TYPE);
  assert.equal(saved.status, 'draft');
  assert.equal(saved.draft, true);
  assert.deepEqual(saved.form_data.step, { screen: 'objective' });
  assert.equal(saved.form_data.team.id, 't2');
  assert.equal(saved.form_data.shared_with_coach, true);
  // a finished version keeps no step
  assert.equal(rowFrom({ ...v, teamName: 'Sales team' }, 'user-1', 'completed', { screen: 'objective' }).form_data.step, null);
  // the saved answers read back the same
  const back = versionFromRow({ ...saved, created_at: '2026-11-14 10:00:00' });
  assert.deepEqual(dataFromDraft(back.draft), saved.form_data.data);
  assert.equal(back.teamName, 'Sales team');
  assert.equal(back.status, 'draft');
});

test('compare: one sentence, the counts, how progress moved, added and removed, and the swap', () => {
  const lt2 = versionFromRow(row('lt2', '2026-07-14', LT2));
  const lt3 = versionFromRow(row('lt3', '2026-10-27', LT3));
  const m = compareVersions(lt2, lt3, TODAY);
  assert.equal(m.earlier.id, 'lt2');
  assert.equal(m.later.id, 'lt3');
  assert.equal(m.swapped, false);
  assert.match(m.sentence, /^(\d+ (more|fewer) important projects? (is|are) moving well than on Tue 14 Jul\.|The same number of important projects is moving well as on Tue 14 Jul\.)$/);
  assert.match(m.counts, /^\d+ of \d+ (is|are) moving well on Tue 27 Oct, and \d+ of \d+ (was|were) on Tue 14 Jul\.$/);
  // rises first, the biggest first, then falls
  assert.deepEqual(m.up.map((x) => x.text), ['Customer success programme', 'Pricing review', 'New office fit-out', 'Data platform']);
  assert.deepEqual(m.up[0], { id: 'p2', text: 'Customer success programme', from: 'Fair', to: 'Good' });
  assert.deepEqual(m.down.map((x) => `${x.text}: ${x.from} to ${x.to}`), ['Enterprise sales team: Fair to Bad']);
  assert.equal(m.same, 1);
  assert.equal(m.sameLine, '1 project is at the same stage as before.');
  assert.deepEqual(m.added, ['Hiring plan for 2027']);
  assert.deepEqual(m.gone, ['Rebrand']);
  assert.equal(m.was.p1.progress, 3);
  assert.equal(m.notes.p4, 'It’s new since Tue 14 Jul.');
  assert.equal(m.notes.p1, 'On Tue 14 Jul, its progress was “Fair”.');
  // chosen the other way round: swapped, so the words still agree
  const s = compareVersions(lt3, lt2, TODAY);
  assert.equal(s.swapped, true);
  assert.equal(s.earlier.id, 'lt2');
  assert.equal(s.sentence, m.sentence);
  // projects matched by name for older rows with other ids
  const renamed = versionFromRow(row('lt2b', '2026-07-14', LT2.map((p) => ({ ...p, id: `x${p.id}` }))));
  assert.deepEqual(compareVersions(renamed, lt3, TODAY).added, ['Hiring plan for 2027']);
});

test('compare says the same number in words, never a figure', () => {
  const a = versionFromRow(row('a', '2026-07-14', LT3));
  const b = versionFromRow(row('b', '2026-10-27', LT3));
  const m = compareVersions(a, b, TODAY);
  assert.equal(m.sentence, 'The same number of important projects is moving well as on Tue 14 Jul.');
  assert.equal(m.up.length + m.down.length, 0);
  assert.equal(m.sameLine, '7 projects are at the same stage as before.');
});

test('the one-off tip about an outside Health Check that joined a team', () => {
  const rows = [row('lt1', '2026-04-03', LT2, { from_outside: { at: '2026-04-03T10:00:00Z' } }), row('lt3', '2026-10-27', LT3)];
  const teams = teamsFrom(rows);
  assert.deepEqual(claimedTip(teams), { id: 'lt1', text: 'Your April Health Check, done outside the portal, is now with the Leadership team.' });
  assert.equal(claimedTip(teams, (id) => id === 'lt1'), null, 'once closed, never again');
  assert.equal(claimedTip(teamsFrom([row('lt3', '2026-10-27', LT3)])), null);
  // the marker is kept when the version is saved again
  assert.deepEqual(formFrom(teams[0].versions[1]).from_outside, { at: '2026-04-03T10:00:00Z' });
});
