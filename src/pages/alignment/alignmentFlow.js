// Strategic Alignment Health Check: pure helpers (no React, no network).
// The page keeps ONE draft of the answers; screens only read and write it.
//
// draft  = { objective, csfs: [{id, text}], projects: [{id, text}], ratings }
//          rows may be blank while typing; ratings = ratings.owner of the saved
//          data: { [projectId]: { contrib: {[csfId]: 0..3}, progress, resource } }
// step   = { screen, pi, mode, highlight }
//          screen: welcome | objective | factors | projects | contrib | progress | resource | done
//          pi: project index (among the non-blank projects)
//          mode: 'full' (three screens per project) | 'revisit' (Contribution only,
//                after a Critical Success Factor was added to rated projects)
//          highlight: factor ids to point out in revisit mode

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

/** Non-blank rows only, text trimmed. These are the real items. */
export function cleanItems(rows) {
  return rows
    .filter((r) => r.text.trim())
    .map((r) => ({ id: r.id, text: r.text.trim() }));
}

/** A fresh draft (three blank boxes each). */
export function emptyDraft() {
  return {
    objective: '',
    csfs: padRows([]),
    projects: padRows([]),
    ratings: {},
    completedAt: null,
  };
}

/** Builds the draft from saved data. */
export function draftFromData(data) {
  const d = data || {};
  const items = (list) => (Array.isArray(list) ? list.map((i) => ({ id: String(i.id), text: String(i.text ?? '') })) : []);
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
    ...(draft.completedAt ? { completedAt: draft.completedAt } : {}),
  };
}

/** Is this project rated on everything? */
const isFullyRated = (draft, factors, p) => {
  const r = draft.ratings[p.id] || {};
  return factors.every((f) => r.contrib?.[f.id] != null) && r.progress != null && r.resource != null;
};

/** The JSON saved as current_step. */
export function stepToJson(step) {
  const out = { screen: step.screen };
  if (RATING_SCREENS.includes(step.screen)) {
    out.project = step.pi;
    out.mode = step.mode;
    if (step.mode === 'revisit' && step.highlight?.length) out.highlight = step.highlight;
  } else if (step.screen === 'done' && step.mode === 'revisit') {
    // So Back from the end screen returns to the right kind of rating screen.
    out.mode = 'revisit';
    if (step.highlight?.length) out.highlight = step.highlight;
  }
  return out;
}

const KNOWN = ['objective', 'factors', 'projects', 'contrib', 'progress', 'resource', 'done'];

/** Reads a saved current_step back into a valid step for this draft. */
export function stepFromJson(json, draft, complete = false) {
  if (complete) {
    return {
      screen: 'done',
      pi: 0,
      mode: json?.mode === 'revisit' ? 'revisit' : 'full',
      highlight: Array.isArray(json?.highlight) ? json.highlight : [],
    };
  }
  const screen = KNOWN.includes(json?.screen) ? json.screen : 'objective';
  const step = {
    screen,
    pi: Number.isInteger(json?.project) ? json.project : 0,
    mode: json?.mode === 'revisit' ? 'revisit' : 'full',
    highlight: Array.isArray(json?.highlight) ? json.highlight : [],
  };
  return clampStep(step, draft);
}

/** Keeps a step valid when the answers underneath it changed. */
export function clampStep(step, draft) {
  const projects = cleanItems(draft.projects);
  if (RATING_SCREENS.includes(step.screen) || step.screen === 'done') {
    if (step.screen === 'done') return step;
    if (projects.length === 0) return { ...step, screen: 'projects', pi: 0 };
    return { ...step, pi: Math.min(Math.max(step.pi, 0), projects.length - 1) };
  }
  return step;
}

/** Which step Continue leads to from the Projects screen. */
function afterProjects(draft) {
  const factors = cleanItems(draft.csfs);
  const projects = cleanItems(draft.projects);
  const gaps = projects.filter((p) => !isFullyRated(draft, factors, p));
  if (gaps.length === 0) return { screen: 'done', pi: 0, mode: 'full', highlight: [] };

  const onlyContribMissing = gaps.every((p) => {
    const r = draft.ratings[p.id] || {};
    return r.progress != null && r.resource != null;
  });
  if (onlyContribMissing) {
    const highlight = factors
      .filter((f) => gaps.some((p) => draft.ratings[p.id]?.contrib?.[f.id] == null))
      .map((f) => f.id);
    return { screen: 'contrib', pi: 0, mode: 'revisit', highlight };
  }
  return { screen: 'contrib', pi: projects.indexOf(gaps[0]), mode: 'full', highlight: [] };
}

/** The step after Continue. */
export function nextStep(step, draft) {
  const n = cleanItems(draft.projects).length;
  const rate = (screen, pi) => ({ screen, pi, mode: step.mode, highlight: step.highlight });
  switch (step.screen) {
    case 'objective': return { screen: 'factors', pi: 0, mode: 'full', highlight: [] };
    case 'factors': return { screen: 'projects', pi: 0, mode: 'full', highlight: [] };
    case 'projects': return afterProjects(draft);
    case 'contrib':
      if (step.mode === 'revisit') return step.pi < n - 1 ? rate('contrib', step.pi + 1) : { screen: 'done', pi: 0, mode: 'revisit', highlight: step.highlight };
      return rate('progress', step.pi);
    case 'progress': return rate('resource', step.pi);
    case 'resource':
      return step.pi < n - 1 ? { screen: 'contrib', pi: step.pi + 1, mode: step.mode, highlight: [] } : { screen: 'done', pi: 0, mode: 'full', highlight: [] };
    default: return step;
  }
}

/** The step after Back; null means the Welcome screen. */
export function prevStep(step, draft) {
  const n = cleanItems(draft.projects).length;
  const rate = (screen, pi) => ({ screen, pi, mode: step.mode, highlight: step.highlight });
  switch (step.screen) {
    case 'objective': return null;
    case 'factors': return { screen: 'objective', pi: 0, mode: 'full', highlight: [] };
    case 'projects': return { screen: 'factors', pi: 0, mode: 'full', highlight: [] };
    case 'contrib':
      if (step.pi === 0) return { screen: 'projects', pi: 0, mode: 'full', highlight: [] };
      return step.mode === 'revisit' ? rate('contrib', step.pi - 1) : rate('resource', step.pi - 1);
    case 'progress': return rate('contrib', step.pi);
    case 'resource': return rate('progress', step.pi);
    case 'done':
      if (n === 0) return { screen: 'projects', pi: 0, mode: 'full', highlight: [] };
      return step.mode === 'revisit' ? { screen: 'contrib', pi: n - 1, mode: 'revisit', highlight: step.highlight } : { screen: 'resource', pi: n - 1, mode: 'full', highlight: [] };
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
  const at = { objective: 1, factors: 2, projects: 3, contrib: 4, progress: 4, resource: 4, done: 5 }[step.screen] || 0;
  return [1, 2, 3, 4].map((i) => {
    if (step.screen === 'done') return 1;
    if (i < at) return 1;
    if (i > at) return 0;
    if (!RATING_SCREENS.includes(step.screen)) return 1;
    if (step.mode === 'revisit') return (step.pi + 1) / n;
    return (step.pi * 3 + RATING_SCREENS.indexOf(step.screen) + 1) / (3 * n);
  });
}
