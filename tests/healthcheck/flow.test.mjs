// The new page's steps (src/health-check/flow.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { at, isValid, nextStep, percent, prevStep, sequence, stepFromJson, stepToJson } from '../../src/health-check/flow.js';

const draft = (contribFor, extra = {}) => ({
  objective: 'Grow',
  csfs: [{ id: 'f1', text: 'A' }, { id: 'f2', text: 'B' }],
  projects: [{ id: 'p1', text: 'One' }, { id: 'p2', text: 'Two' }],
  ratings: {
    p1: { contrib: contribFor('p1'), progress: 2, resource: 3 },
    p2: { contrib: contribFor('p2'), progress: 4, resource: 3 },
  },
  ...extra,
});

test('after the results, a new CSF asks only its Contribution screens', () => {
  const d = draft(() => ({ f1: 3 })); // f2 added later, not rated
  let s = nextStep(at('projects'), d, true);
  const seen = [];
  while (s.screen !== 'results') {
    seen.push(`${s.screen}:${s.pi}:${s.fi}`);
    // answer it
    if (s.screen === 'contrib') d.ratings[d.projects[s.pi].id].contrib[d.csfs[s.fi].id] = 1;
    s = nextStep(s, d, true);
  }
  assert.deepEqual(seen, ['contrib:0:1', 'contrib:1:1']);
});

test('after the results, a new project gets all its screens, When included', () => {
  const d = draft(() => ({ f1: 3, f2: 2 }));
  d.projects.push({ id: 'p3', text: 'Three' });
  let s = nextStep(at('projects'), d, true);
  const seen = [];
  while (s.screen !== 'results') {
    seen.push(`${s.screen}:${s.pi}`);
    const r = (d.ratings.p3 ||= { contrib: {} });
    if (s.screen === 'contrib') r.contrib[d.csfs[s.fi].id] = 1;
    if (s.screen === 'progress') r.progress = 3;
    if (s.screen === 'resource') r.resource = 3;
    s = nextStep(s, d, true);
  }
  assert.deepEqual(seen, ['contrib:2', 'contrib:2', 'when:2', 'progress:2', 'resource:2']);
});

test('an older saved Contribution step opens on the first CSF still to rate', () => {
  const d = draft((p) => (p === 'p2' ? { f1: 2 } : { f1: 2, f2: 2 }));
  assert.deepEqual(stepFromJson({ screen: 'contrib', project: 1, mode: 'revisit' }, d), at('contrib', { pi: 1, fi: 1, mode: 'full' }));
  assert.equal(stepFromJson({ screen: 'contrib', project: 1, factor: 0 }, d).fi, 0);
  assert.equal(stepFromJson({ screen: 'factors' }, d).screen, 'csf');
  assert.equal(stepFromJson({ screen: 'done' }, d, true).screen, 'results');
});

test('the % complete counts each CSF and reaches 100 only on the results', () => {
  const d = draft(() => ({}));
  assert.equal(percent(at('objective'), d), 0);
  assert.ok(percent(at('contrib', { pi: 0, fi: 1 }), d) > percent(at('contrib', { pi: 0, fi: 0 }), d));
  assert.ok(percent(at('resource', { pi: 1 }), d) < 100);
  assert.equal(percent(at('results'), d), 100);
});

// Health Check 3 (mock-up version 46): the CSF weight screen comes after the CSFs.
test('the CSF weight screen sits between the CSFs and the projects, both ways', () => {
  const d = draft(() => ({}));
  assert.deepEqual(sequence(d).slice(0, 5).map((s) => s.screen), ['objective', 'csf', 'weight', 'projects', 'contrib']);
  assert.equal(nextStep(at('csf'), d, false).screen, 'weight');
  assert.equal(nextStep(at('weight'), d, false).screen, 'projects');
  assert.equal(prevStep(at('projects'), d).screen, 'weight');
  assert.equal(prevStep(at('weight'), d).screen, 'csf');
  // After the results, Change on the CSFs still passes through the weights.
  assert.equal(nextStep(at('csf'), d, true).screen, 'weight');
});

test('the % complete counts the weight screen, as the mock-up does', () => {
  const d = draft(() => ({}));
  // 2 projects, 2 CSFs: 4 list screens and 5 a project (mock-up pctNow: 4 + (nf + 3) x n).
  const total = 4 + (2 + 3) * 2;
  assert.equal(percent(at('weight'), d), Math.round((2 / total) * 100));
  assert.equal(percent(at('projects'), d), Math.round((3 / total) * 100));
  assert.ok(percent(at('weight'), d) > percent(at('csf'), d));
});

test('a saved weight step opens there, or on the CSFs when there are none', () => {
  const d = draft(() => ({}));
  assert.deepEqual(stepFromJson({ screen: 'weight' }, d), at('weight'));
  assert.deepEqual(stepToJson(at('weight')), { screen: 'weight' });
  assert.equal(stepFromJson({ screen: 'weight' }, { ...d, csfs: [] }).screen, 'csf');
  assert.equal(isValid(at('weight'), d), true);
  assert.equal(isValid(at('weight'), { ...d, csfs: [] }), false);
});
