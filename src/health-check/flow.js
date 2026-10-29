// The Health Check's steps (mock-up M7b version 46): Objective, Critical
// Success Factors, CSF weight, Projects, then for each project Contribution
// (one factor per screen), When, Progress and Resource required, then the
// results.
// Pure helpers, no React. The answers use the saved shape from
// src/pages/alignment/alignmentFlow.js (draftFromData and dataFromDraft).
//
// step = { screen, pi, fi, mode }
//   screen: objective | csf | weight | projects | contrib | when | progress | resource | results
//   pi: project index among the non-blank projects; fi: factor index (contrib)
//   mode: 'full' (the first run), 'gaps' (after the results: only what's
//   missing) or 'edit' (one project chosen on the results)

import { cleanItems } from '../pages/alignment/alignmentFlow.js';

export const LIST_SCREENS = ['objective', 'csf', 'weight', 'projects'];
export const PROJECT_SCREENS = ['contrib', 'when', 'progress', 'resource'];
const KNOWN = [...LIST_SCREENS, ...PROJECT_SCREENS, 'results'];

export const at = (screen, extra = {}) => ({ screen, pi: 0, fi: 0, mode: 'full', ...extra });

/** Every step of a full run, in order. */
export function sequence(draft) {
  const factors = cleanItems(draft.csfs);
  const projects = cleanItems(draft.projects);
  const out = LIST_SCREENS.map((s) => at(s));
  projects.forEach((_, pi) => {
    factors.forEach((__, fi) => out.push(at('contrib', { pi, fi })));
    ['when', 'progress', 'resource'].forEach((s) => out.push(at(s, { pi })));
  });
  return out;
}

const same = (a, b) => a.screen === b.screen && (a.pi || 0) === (b.pi || 0) && (a.fi || 0) === (b.fi || 0);
const indexOf = (seq, step) => {
  if (!PROJECT_SCREENS.includes(step.screen)) return seq.findIndex((s) => s.screen === step.screen);
  return seq.findIndex((s) => same(s, step));
};

/** Is this step's answer missing? (When is optional, so never missing.) */
export function isMissing(step, draft) {
  const factors = cleanItems(draft.csfs);
  const projects = cleanItems(draft.projects);
  const p = projects[step.pi];
  const r = (p && draft.ratings[p.id]) || {};
  if (step.screen === 'contrib') return !!p && !!factors[step.fi] && r.contrib?.[factors[step.fi].id] == null;
  if (step.screen === 'progress') return !!p && r.progress == null;
  if (step.screen === 'resource') return !!p && r.resource == null;
  return false;
}

/** Can the person go on from this step? */
export function isValid(step, draft) {
  switch (step.screen) {
    case 'objective': return draft.objective.trim().length > 0;
    case 'csf': case 'weight': return cleanItems(draft.csfs).length > 0;
    case 'projects': return cleanItems(draft.projects).length > 0;
    case 'contrib': case 'progress': case 'resource': return !isMissing(step, draft) && !!cleanItems(draft.projects)[step.pi];
    default: return true;
  }
}

/**
 * Does this step need visiting to fill a gap? A missing answer does; so does
 * When for a project whose progress isn't rated yet (a new project).
 */
const needed = (s, draft) => isMissing(s, draft) || (s.screen === 'when' && isMissing({ screen: 'progress', pi: s.pi }, draft));

/** The first step to fill a gap after (or, with from = -1, anywhere in) the run. */
function firstMissing(seq, draft, from = -1) {
  for (let i = from + 1; i < seq.length; i += 1) {
    const s = seq[i];
    if (PROJECT_SCREENS.includes(s.screen) && needed(s, draft)) return s;
  }
  return null;
}

/** Anything still to answer before the results are complete? */
export function hasGaps(draft) {
  return !draft.objective.trim() || !cleanItems(draft.csfs).length || !cleanItems(draft.projects).length
    || !!firstMissing(sequence(draft), draft);
}

/**
 * The step after Next.
 * @param {boolean} reached the results have been seen before
 */
export function nextStep(step, draft, reached) {
  const seq = sequence(draft);
  const i = indexOf(seq, step);
  if (step.mode === 'edit') {
    const n = seq[i + 1];
    return n && n.pi === step.pi && PROJECT_SCREENS.includes(n.screen) ? { ...n, mode: 'edit' } : at('results');
  }
  if (step.screen === 'projects' && reached) {
    const gap = firstMissing(seq, draft);
    return gap ? { ...gap, mode: 'gaps' } : at('results');
  }
  if (step.mode === 'gaps') {
    // Only what's missing: straight on to the next gap.
    const gap = firstMissing(seq, draft, i);
    return gap ? { ...gap, mode: 'gaps' } : at('results');
  }
  if (reached && LIST_SCREENS.includes(step.screen)) return seq[i + 1] || at('results');
  return seq[i + 1] || at('results');
}

/** The step after Back; null means leave the steps (to the sign-in screen). */
export function prevStep(step, draft) {
  const seq = sequence(draft);
  if (step.screen === 'results') {
    const last = seq[seq.length - 1];
    return last && PROJECT_SCREENS.includes(last.screen) ? last : at('projects');
  }
  const i = indexOf(seq, step);
  if (i <= 0) return null;
  const p = seq[i - 1];
  if (step.mode === 'edit') return p.pi === step.pi && PROJECT_SCREENS.includes(p.screen) ? { ...p, mode: 'edit' } : at('results');
  return { ...p, mode: step.mode === 'gaps' && PROJECT_SCREENS.includes(p.screen) ? 'gaps' : 'full' };
}

/** Is Next on this step the last one before the results ("See my results")? */
export function isLast(step, draft, reached) {
  if (!PROJECT_SCREENS.includes(step.screen)) return false;
  return nextStep(step, draft, reached).screen === 'results';
}

/** The % complete: every screen counts, each factor included. */
export function percent(step, draft) {
  if (step.screen === 'results') return 100;
  const seq = sequence(draft);
  const i = Math.max(0, indexOf(seq, step));
  return Math.round((i / Math.max(1, seq.length)) * 100);
}

/** The JSON saved as current_step (the database limits it to 2 KB). */
export function stepToJson(step) {
  const out = { screen: step.screen === 'results' ? 'done' : step.screen };
  if (PROJECT_SCREENS.includes(step.screen)) {
    out.project = step.pi;
    if (step.screen === 'contrib') out.factor = step.fi;
  }
  if (step.mode && step.mode !== 'full') out.mode = step.mode;
  return out;
}

/**
 * A saved current_step back into a valid step: also reads the older page's
 * names ('factors', 'done', its modes), so a Health Check started before the
 * change opens where it was left.
 */
export function stepFromJson(json, draft, complete = false) {
  const name = { factors: 'csf', done: 'results' }[json?.screen] || json?.screen;
  if (complete && (!KNOWN.includes(name) || name === 'results')) return at('results');
  if (!KNOWN.includes(name)) return at('objective');
  if (name === 'results') return at(complete ? 'results' : 'objective');
  const projects = cleanItems(draft.projects);
  const factors = cleanItems(draft.csfs);
  if (name === 'weight' && !factors.length) return at('csf');
  if (!PROJECT_SCREENS.includes(name)) return at(name);
  if (!projects.length) return at('projects');
  const pi = Math.min(Math.max(Number.isInteger(json.project) ? json.project : 0, 0), projects.length - 1);
  const fi = Math.min(Math.max(Number.isInteger(json.factor) ? json.factor : 0, 0), Math.max(0, factors.length - 1));
  const mode = ['gaps', 'edit'].includes(json.mode) ? json.mode : (complete ? 'gaps' : 'full');
  if (name === 'contrib' && !factors.length) return at('csf');
  if (name === 'contrib' && !Number.isInteger(json.factor)) {
    // The older page saved no CSF number: open on the first one still to rate.
    const r = draft.ratings[projects[pi].id] || {};
    const gap = factors.findIndex((f) => r.contrib?.[f.id] == null);
    return at(name, { pi, fi: Math.max(0, gap), mode });
  }
  return at(name, { pi, fi: name === 'contrib' ? fi : 0, mode });
}

/** Keeps a step valid when the answers underneath it change. */
export function clampStep(step, draft) {
  if (!PROJECT_SCREENS.includes(step.screen)) return step;
  const n = cleanItems(draft.projects).length;
  const nf = cleanItems(draft.csfs).length;
  if (!n) return at('projects');
  if (step.screen === 'contrib' && !nf) return at('csf');
  return { ...step, pi: Math.min(step.pi, n - 1), fi: Math.min(step.fi || 0, Math.max(0, nf - 1)) };
}
