// Strategic Alignment Health Check: pure helpers (no React, no network).
// The page keeps ONE draft of the answers; screens only read and write it.
//
// draft  = { objective, csfs: [{id, text, level?}], projects: [{id, text, ...dates}], ratings, importantLine }
//          dates: started, startedOn, due, dueOn, all optional (src/lib/projectDates.js)
//          level: a CSF's level, 3 Critical, 2 Very important, 1 Important;
//          none saved reads as 2 (csfLevel in src/lib/alignmentScore.js)
//          importantLine: the line for important, 30 to 80, or null when none
//          is saved, which reads as 50 (importantLine in alignmentScore.js)
//          rows may be blank while typing; ratings = ratings.owner of the saved
//          data: { [projectId]: { contrib: {[csfId]: 0..3}, progress, resource } }
// step   = { screen, pi, mode, highlight }
//          screen: welcome | objective | factors | projects | contrib | progress | resource | done
//          pi: project index (among the non-blank projects)
//          mode: 'full' (three screens per project, first run)
//                | 'revisit' (Contribution only, a factor added before the first one-pager)
//                | 'gaps' (editing after the one-pager: only the projects in `queue`)
//                | 'project' (one project opened from the one-pager)
//          highlight: factor ids to point out when a new factor needs rating
//          queue: for 'gaps' / 'project': numbers, project index * 2 + kind
//                 (kind 1 = all three screens, 0 = Contribution only)

import { DATE_FIELDS, checkProjectDates, projectDates } from '../../lib/projectDates.js';
import { LINE_CHOICES } from '../../lib/alignmentScore.js';

export const OWNER = 'owner';
export const MAX_FACTORS = 12;
export const MAX_PROJECTS = 40;
export const MAX_OBJECTIVE = 500;
export const MAX_ITEM = 300;
const MIN_ROWS = 3;

export const RATING_SCREENS = ['contrib', 'progress', 'resource'];

export const CONTRIB = [[0, 'None'], [1, 'Low'], [2, 'Medium'], [3, 'High']];
export const PROGRESS = [[1, 'Embryonic stage'], [2, 'Bad'], [3, 'Fair'], [4, 'Good'], [5, 'Excellent']];
export const RESOURCE = [[1, 'Minimal'], [2, 'Low'], [3, 'Moderate'], [4, 'High'], [5, 'Very high']];

/** A stable id for a new factor or project. */
export function newId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    // fall through to the fallback
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export const blankRow = () => ({ id: newId(), text: '' });

function padRows(rows) {
  const out = rows.slice();
  while (out.length < MIN_ROWS) out.push(blankRow());
  return out;
}

/** A CSF's saved level, kept only when it is 1, 2 or 3. */
const keptLevel = (item) => ([1, 2, 3].includes(item.level) ? { level: item.level } : {});

/** The saved line for important, kept only when it is one of the choices. */
const keptLine = (value) => (LINE_CHOICES.includes(value) ? value : null);

/**
 * Non-blank rows only, text trimmed. These are the real items. A project's
 * valid dates and a CSF's valid level are kept; anything else on an item is
 * dropped.
 */
export function cleanItems(rows) {
  return rows
    .filter((r) => r.text.trim())
    .map((r) => ({ id: r.id, text: r.text.trim(), ...projectDates(r), ...keptLevel(r) }));
}

/**
 * Sets one project's dates after checking them (real months and dates, years
 * 1990 to 2100, an exact date inside its month, the finish not before the
 * start). Blank fields clear that date.
 * @returns {{ok: true, draft: Object} | {ok: false, field: string, message: string}}
 */
export function setProjectDates(draft, projectId, input) {
  const check = checkProjectDates(input);
  if (!check.ok) return check;
  const projects = draft.projects.map((row) => {
    if (row.id !== projectId) return row;
    const next = { ...row };
    DATE_FIELDS.forEach((field) => { delete next[field]; });
    return { ...next, ...check.dates };
  });
  return { ok: true, draft: { ...draft, projects } };
}

/** A fresh draft (three blank boxes each). */
export function emptyDraft() {
  return {
    objective: '',
    csfs: padRows([]),
    projects: padRows([]),
    ratings: {},
    importantLine: null,
    completedAt: null,
  };
}

/** Builds the draft from saved data. */
export function draftFromData(data) {
  const d = data || {};
  // A damaged item (not an object) is skipped rather than stopping the page.
  const items = (list) => (Array.isArray(list)
    ? list.filter((i) => i && typeof i === 'object')
      .map((i) => ({ id: String(i.id), text: String(i.text ?? ''), ...projectDates(i), ...keptLevel(i) }))
    : []);
  const owner = d.ratings?.[OWNER] || {};
  const ratings = {};
  Object.keys(owner).forEach((pid) => {
    const r = owner[pid] || {};
    ratings[pid] = { contrib: { ...(r.contrib || {}) }, progress: r.progress ?? null, resource: r.resource ?? null };
  });
  return {
    objective: typeof d.objective === 'string' ? d.objective : '',
    csfs: padRows(items(d.csfs)),
    projects: padRows(items(d.projects)),
    ratings,
    importantLine: keptLine(d.importantLine),
    // When the Health Check was first completed (kept in the answers: the
    // open/save functions do not return completed_at).
    completedAt: typeof d.completedAt === 'string' ? d.completedAt : null,
  };
}

/**
 * The data to save: blank rows dropped, ratings kept only for factors and
 * projects that still exist, keyed by id under ratings.owner.
 */
export function dataFromDraft(draft) {
  const csfs = cleanItems(draft.csfs);
  const projects = cleanItems(draft.projects);
  const factorIds = new Set(csfs.map((f) => f.id));
  const owner = {};
  projects.forEach((p) => {
    const r = draft.ratings[p.id];
    if (!r) return;
    const entry = {};
    const contrib = {};
    Object.keys(r.contrib || {}).forEach((fid) => {
      if (factorIds.has(fid) && r.contrib[fid] != null) contrib[fid] = r.contrib[fid];
    });
    if (Object.keys(contrib).length) entry.contrib = contrib;
    if (r.progress != null) entry.progress = r.progress;
    if (r.resource != null) entry.resource = r.resource;
    if (Object.keys(entry).length) owner[p.id] = entry;
  });
  return {
    objective: draft.objective.trim(),
    csfs,
    projects,
    ratings: { [OWNER]: owner },
    ...(keptLine(draft.importantLine) != null ? { importantLine: draft.importantLine } : {}),
    ...(draft.completedAt ? { completedAt: draft.completedAt } : {}),
  };
}

const isQueued = (step) => step.mode === 'gaps' || step.mode === 'project';
const at = (screen, extra = {}) => ({ screen, pi: 0, mode: 'full', highlight: [], queue: [], ...extra });

/** The JSON saved as current_step (kept small: the database limits it to 2 KB). */
export function stepToJson(step) {
  const out = { screen: step.screen };
  const rating = RATING_SCREENS.includes(step.screen);
  if (rating) out.project = step.pi;
  if (rating || step.screen === 'done') {
    if (step.mode !== 'full') out.mode = step.mode;
    if (step.highlight?.length) out.highlight = step.highlight;
    if (isQueued(step) && step.queue?.length) out.queue = step.queue;
  }
  return out;
}

const KNOWN = ['objective', 'factors', 'projects', 'contrib', 'progress', 'resource', 'done'];
const MODES = ['full', 'revisit', 'gaps', 'project'];

/** Reads a saved current_step back into a valid step for this draft. */
export function stepFromJson(json, draft, complete = false) {
  // A completed link opens the one-pager unless it was left part-way through an edit.
  const known = KNOWN.includes(json?.screen);
  if (complete && (!known || json.screen === 'done')) {
    return clampStep({
      ...at('done'),
      mode: MODES.includes(json?.mode) ? json.mode : 'full',
      highlight: Array.isArray(json?.highlight) ? json.highlight : [],
      queue: Array.isArray(json?.queue) ? json.queue : [],
    }, draft);
  }
  const step = {
    screen: known ? json.screen : 'objective',
    pi: Number.isInteger(json?.project) ? json.project : 0,
    mode: MODES.includes(json?.mode) ? json.mode : 'full',
    highlight: Array.isArray(json?.highlight) ? json.highlight : [],
    queue: Array.isArray(json?.queue) ? json.queue.filter(Number.isInteger) : [],
  };
  return clampStep(step, draft);
}

/** Keeps a step valid when the answers underneath it changed. */
export function clampStep(step, draft) {
  const n = cleanItems(draft.projects).length;
  if (step.screen === 'done') {
    if (isQueued(step)) return { ...step, queue: step.queue.filter((e) => (e >> 1) < n) };
    return step;
  }
  if (!RATING_SCREENS.includes(step.screen)) return step;
  if (n === 0) return at('projects');
  const queue = isQueued(step) ? step.queue.filter((e) => (e >> 1) < n) : [];
  if (isQueued(step) && queue.length === 0) return { ...step, mode: 'full', queue: [], pi: Math.min(Math.max(step.pi, 0), n - 1) };
  return { ...step, queue, pi: Math.min(Math.max(step.pi, 0), n - 1) };
}

/** Is this project rated on everything? */
const isFullyRated = (draft, factors, p) => {
  const r = draft.ratings[p.id] || {};
  return factors.every((f) => r.contrib?.[f.id] != null) && r.progress != null && r.resource != null;
};

/**
 * What still needs an answer: the projects with a missing rating, as a queue
 * (index * 2 + kind) and the factors to point out. A project missing only
 * Contribution scores (a new factor) gets that screen alone; a project with
 * nothing rated gets all three.
 */
export function missingWork(draft) {
  const factors = cleanItems(draft.csfs);
  const projects = cleanItems(draft.projects);
  const queue = [];
  const flagged = new Set();
  projects.forEach((p, i) => {
    if (isFullyRated(draft, factors, p)) return;
    const r = draft.ratings[p.id] || {};
    const onlyContrib = r.progress != null && r.resource != null;
    queue.push(i * 2 + (onlyContrib ? 0 : 1));
    if (onlyContrib) factors.forEach((f) => { if (r.contrib?.[f.id] == null) flagged.add(f.id); });
  });
  return { queue, highlight: [...flagged] };
}

/** Anything that stops the one-pager being complete? (objective, factors, projects, ratings) */
export function hasMissingAnswers(draft) {
  return draft.objective.trim() === ''
    || cleanItems(draft.csfs).length === 0
    || cleanItems(draft.projects).length === 0
    || missingWork(draft).queue.length > 0;
}

/** A project opened from the one-pager: its three screens, then back. */
export function projectStep(pi) {
  return { screen: 'contrib', pi, mode: 'project', highlight: [], queue: [pi * 2 + 1] };
}

/** The step for the fourth progress segment: the first project with a gap, else the first. */
export function ratingsEntryStep(draft, editing) {
  const { queue, highlight } = missingWork(draft);
  const pi = queue.length ? queue[0] >> 1 : 0;
  if (!editing) return { screen: 'contrib', pi, mode: 'full', highlight: [], queue: [] };
  if (queue.length) return { screen: 'contrib', pi, mode: 'gaps', highlight, queue };
  return projectStep(0);
}

/** Which step Continue leads to from Step 1, 2 or 3. */
function afterEdits(draft, editing) {
  const work = missingWork(draft);
  if (work.queue.length === 0) return at('done');
  if (editing) {
    return { screen: 'contrib', pi: work.queue[0] >> 1, mode: 'gaps', highlight: work.highlight, queue: work.queue };
  }
  // First run: every project in order (or, after a factor was added to rated
  // projects, their Contribution screens only).
  const factors = cleanItems(draft.csfs);
  const projects = cleanItems(draft.projects);
  const gaps = projects.filter((p) => !isFullyRated(draft, factors, p));
  const onlyContribMissing = gaps.every((p) => {
    const r = draft.ratings[p.id] || {};
    return r.progress != null && r.resource != null;
  });
  if (onlyContribMissing) {
    return { screen: 'contrib', pi: 0, mode: 'revisit', highlight: work.highlight, queue: [] };
  }
  return { screen: 'contrib', pi: projects.indexOf(gaps[0]), mode: 'full', highlight: [], queue: [] };
}

const queueIndex = (step) => step.queue.findIndex((e) => (e >> 1) === step.pi);
const screensFor = (step) => {
  const entry = step.queue[queueIndex(step)];
  return entry != null && entry % 2 === 1 ? RATING_SCREENS : ['contrib'];
};

/**
 * The step after Continue.
 * @param {boolean} editing true once the one-pager has been reached
 */
export function nextStep(step, draft, editing = false) {
  const n = cleanItems(draft.projects).length;
  const keep = (screen, pi) => ({ ...step, screen, pi });
  const done = (mode = 'full') => ({ ...at('done'), mode, highlight: step.highlight, queue: step.queue });
  switch (step.screen) {
    case 'objective': return editing ? afterEdits(draft, true) : at('factors');
    case 'factors': return editing ? afterEdits(draft, true) : at('projects');
    case 'projects': return afterEdits(draft, editing);
    case 'contrib':
    case 'progress':
    case 'resource': {
      if (isQueued(step)) {
        const screens = screensFor(step);
        const pos = screens.indexOf(step.screen);
        if (pos < screens.length - 1) return keep(screens[pos + 1], step.pi);
        const qi = queueIndex(step);
        if (qi >= 0 && qi < step.queue.length - 1) return { ...step, screen: 'contrib', pi: step.queue[qi + 1] >> 1 };
        return done(step.mode);
      }
      if (step.screen === 'contrib') {
        if (step.mode === 'revisit') {
          return step.pi < n - 1 ? keep('contrib', step.pi + 1) : done('revisit');
        }
        return keep('progress', step.pi);
      }
      if (step.screen === 'progress') return keep('resource', step.pi);
      return step.pi < n - 1 ? { ...step, screen: 'contrib', pi: step.pi + 1, highlight: [] } : done('full');
    }
    default: return step;
  }
}

/** The step after Back; null means the Welcome screen. */
export function prevStep(step, draft) {
  const n = cleanItems(draft.projects).length;
  const keep = (screen, pi) => ({ ...step, screen, pi });
  switch (step.screen) {
    case 'objective': return null;
    case 'factors': return at('objective');
    case 'projects': return at('factors');
    case 'contrib':
    case 'progress':
    case 'resource': {
      if (isQueued(step)) {
        const screens = screensFor(step);
        const pos = screens.indexOf(step.screen);
        if (pos > 0) return keep(screens[pos - 1], step.pi);
        const qi = queueIndex(step);
        if (qi > 0) {
          const prev = step.queue[qi - 1];
          return { ...step, screen: prev % 2 === 1 ? 'resource' : 'contrib', pi: prev >> 1 };
        }
        return step.mode === 'project' ? at('done') : at('projects');
      }
      if (step.screen === 'progress') return keep('contrib', step.pi);
      if (step.screen === 'resource') return keep('progress', step.pi);
      if (step.pi === 0) return at('projects');
      return step.mode === 'revisit' ? keep('contrib', step.pi - 1) : { ...step, screen: 'resource', pi: step.pi - 1 };
    }
    case 'done': {
      if (n === 0) return at('projects');
      if (isQueued(step) && step.queue.length) {
        const last = step.queue[step.queue.length - 1];
        return { ...step, screen: last % 2 === 1 ? 'resource' : 'contrib', pi: last >> 1 };
      }
      return step.mode === 'revisit'
        ? { ...step, screen: 'contrib', pi: n - 1 }
        : { ...at('resource'), pi: n - 1 };
    }
    default: return step;
  }
}

/** Is the current screen complete enough to Continue? */
export function isStepValid(step, draft) {
  const factors = cleanItems(draft.csfs);
  const projects = cleanItems(draft.projects);
  const p = projects[step.pi];
  const r = (p && draft.ratings[p.id]) || {};
  switch (step.screen) {
    case 'objective': return draft.objective.trim().length > 0;
    case 'factors': return factors.length > 0;
    case 'projects': return projects.length > 0;
    case 'contrib': return !!p && factors.length > 0 && factors.every((f) => r.contrib?.[f.id] != null);
    case 'progress': return !!p && r.progress != null;
    case 'resource': return !!p && r.resource != null;
    default: return true;
  }
}

/** The four progress segments, each 0..1 (the fourth fills project by project). */
export function progressFills(step, draft) {
  const n = Math.max(cleanItems(draft.projects).length, 1);
  const place = { objective: 1, factors: 2, projects: 3, contrib: 4, progress: 4, resource: 4, done: 5 }[step.screen] || 0;
  return [1, 2, 3, 4].map((i) => {
    if (step.screen === 'done') return 1;
    if (i < place) return 1;
    if (i > place) return 0;
    if (!RATING_SCREENS.includes(step.screen)) return 1;
    if (isQueued(step)) {
      const total = step.queue.reduce((sum, e) => sum + (e % 2 === 1 ? 3 : 1), 0) || 1;
      const qi = Math.max(queueIndex(step), 0);
      const before = step.queue.slice(0, qi).reduce((sum, e) => sum + (e % 2 === 1 ? 3 : 1), 0);
      return (before + RATING_SCREENS.indexOf(step.screen) + 1) / total;
    }
    if (step.mode === 'revisit') return (step.pi + 1) / n;
    return (step.pi * 3 + RATING_SCREENS.indexOf(step.screen) + 1) / (3 * n);
  });
}
