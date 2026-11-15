// The Strategic Alignment Health Check inside the portal (mock-up M7
// version 8.2): teams, each with its dated versions. Pure helpers, no React
// and no network, so the pages, the lists and the tests read the same.
//
// Where it is kept (no migration): one `decisions` row per version, tool
// type 'strategic-alignment' (as the older pages saved it), its title the
// team's name (so My Plans and the Strategic hub group it as before), and
// form_data in this shape:
//
//   {
//     shape: 2,                       this shape (the older pages' rows have none)
//     team: { id, name },             the team; its id stays the same across versions
//     date: 'YYYY-MM-DD',             the version's own day (its name and date)
//     made: 'version' | 'team',       how it was started (a new version, or a new team)
//     from: '<version id>' | null,    the version it was copied from
//     data: { objective, csfs, projects, ratings: { owner }, importantLine, completedAt },
//                                     the answers, in the outside Health Check's saved
//                                     shape (alignmentFlow.js dataFromDraft)
//     step: { screen, … } | null,     where a draft was left (flow.js stepToJson)
//     shared_with_coach: boolean,     who can see it (the eye): true is "You and Tim"
//     from_outside: { at, organisation? } | undefined
//                                     set by the claim of an outside Health Check
//                                     (a later migration): the version came from an
//                                     outside Health Check with the same confirmed email;
//                                     the team list shows its one-off tip once
//   }
//
// The older pages' rows ({ goal, risks, strategies, factors: [text],
// projects: [text], matrix: { 'p-f': 0..3 }, progress: { p: 1..5 } }) open as
// a team named by the row's title, one version each, read by draftFromOld
// below. They are never written back unless the person changes something.

import { cleanItems, draftFromData, dataFromDraft, emptyDraft, newId as flowId } from '../../pages/alignment/alignmentFlow.js';
import { resultRows } from '../../health-check/words.js';
import { m20Headline, m20ImportantLine } from '../scores/m20.js';
import { getLocalDateKey, parseDbTimestamp } from '../dateFormatter.js';

export const TOOL_TYPE = 'strategic-alignment';
export const TOOL_NAME = 'Strategic Alignment Health Check';
export const SHAPE = 2;
export const BASE = '/strategic-alignment';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const isDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Is this saved form the inside Health Check's own shape? */
export const isNewShape = (form) => isObj(form) && form.shape === SHAPE && isObj(form.data);

/** A team's key for an older row, from its name (the older pages grouped by the title). */
export const oldTeamId = (name) => `named:${String(name || '').trim().toLowerCase()}`;

/**
 * An older page's saved Health Check as the answers' draft. What it never
 * had is filled as those pages showed and scored it: a contribution never
 * set is None (the pages' matrix started at None), a progress never moved is
 * Fair (their slider started at 3). Resource required and the dates were
 * never asked, so they stay empty ("Not rated"; a dot of middle size). Every
 * Success Factor is Very important, the line is 50%, as for any Health Check
 * without them. The ids are made from the order, so they stay the same each
 * time the row is read.
 */
export function draftFromOld(form) {
  const f = isObj(form) ? form : {};
  const texts = (list) => (Array.isArray(list) ? list.map((t) => (typeof t === 'string' ? t : '')) : []);
  const factors = texts(f.factors);
  const projects = texts(f.projects);
  const matrix = isObj(f.matrix) ? f.matrix : {};
  const progress = isObj(f.progress) ? f.progress : {};
  const csfs = factors.map((text, i) => ({ id: `old-f${i}`, text })).filter((x) => x.text.trim());
  const rows = projects.map((text, i) => ({ id: `old-p${i}`, text, i })).filter((x) => x.text.trim());
  const ratings = {};
  rows.forEach((p) => {
    const contrib = {};
    csfs.forEach((c) => {
      const fi = Number(c.id.slice(5));
      const v = Number(matrix[`${p.i}-${fi}`]);
      contrib[c.id] = [0, 1, 2, 3].includes(v) ? v : 0;
    });
    const pg = Number(progress[p.i]);
    ratings[p.id] = { contrib, progress: [1, 2, 3, 4, 5].includes(pg) ? pg : 3, resource: null };
  });
  const draft = draftFromData({
    objective: typeof f.goal === 'string' ? f.goal : '',
    csfs: csfs.map(({ id, text }) => ({ id, text })),
    projects: rows.map(({ id, text }) => ({ id, text })),
    ratings: { owner: ratings },
  });
  // draftFromData keeps only answers it can read; resource stays empty.
  return draft;
}

/** "Tue 27 Oct" this year, "3 Apr 2025" in another (M7's dates). */
export function versionDate(dayKey, today = getLocalDateKey()) {
  if (!isDay(dayKey)) return '';
  const [y, m, d] = dayKey.split('-').map(Number);
  if (y === Number(today.slice(0, 4))) return `${DAYS[new Date(y, m - 1, d, 12).getDay()]} ${d} ${MON[m - 1]}`;
  return `${d} ${MON[m - 1]} ${y}`;
}

/** A version's name in words: "October Health Check" (writing rule 60). */
export function versionName(version) {
  const m = isDay(version?.date) ? Number(version.date.slice(5, 7)) : 0;
  return m ? `${MONTHS[m - 1]} Health Check` : 'Health Check';
}

/** The headline as M7's team list shows it under a version's name. */
export function shortHeadline(draft) {
  const h = m20Headline(resultRows(draft), { line: m20ImportantLine(draft) });
  if (!h.important) return 'None of the important projects is under way yet.';
  return `${h.movingWell} of ${h.important} important projects ${h.movingWell === 1 ? 'is' : 'are'} moving well.`;
}

/** Has every question an answer, so the results are whole? */
export function isWhole(draft) {
  const factors = cleanItems(draft.csfs);
  const projects = cleanItems(draft.projects);
  if (!draft.objective.trim() || !factors.length || !projects.length) return false;
  return projects.every((p) => {
    const r = draft.ratings[p.id] || {};
    return r.progress != null && r.resource != null && factors.every((f) => r.contrib?.[f.id] != null);
  });
}

/** Has anything been answered beyond what a new start already holds? */
export function hasAnswers(draft) {
  return Boolean(draft.objective.trim() || cleanItems(draft.csfs).length || cleanItems(draft.projects).length);
}

/**
 * One saved row as a version: { id, teamId, teamName, date, createdAt,
 * updatedAt, status, shared, draft, step, made, from, fromOutside, old, row }.
 */
export function versionFromRow(row) {
  const form = isObj(row?.form_data) ? row.form_data : {};
  const created = row?.created_at ? getLocalDateKey(parseDbTimestamp(row.created_at)) : getLocalDateKey();
  const isDraftRow = Boolean(row?.draft || row?.status === 'draft');
  if (isNewShape(form)) {
    const team = isObj(form.team) ? form.team : {};
    const name = typeof team.name === 'string' && team.name.trim() ? team.name.trim() : (row.title || '').trim();
    return {
      id: row.id,
      teamId: typeof team.id === 'string' && team.id ? team.id : oldTeamId(name),
      teamName: name,
      date: isDay(form.date) ? form.date : created,
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null,
      status: isDraftRow ? 'draft' : 'completed',
      shared: form.shared_with_coach !== false,
      draft: draftFromData(form.data),
      step: isObj(form.step) ? form.step : null,
      made: form.made === 'team' ? 'team' : 'version',
      from: typeof form.from === 'string' ? form.from : null,
      fromOutside: isObj(form.from_outside) ? form.from_outside : null,
      old: false,
      row,
    };
  }
  const name = (row?.title || '').trim() || 'Your team';
  return {
    id: row.id,
    teamId: oldTeamId(name),
    teamName: name,
    date: created,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    status: isDraftRow ? 'draft' : 'completed',
    // The older pages had no eye: the portal's default for this Health Check.
    shared: form.shared_with_coach !== false,
    draft: draftFromOld(form),
    step: null,
    made: 'team',
    from: null,
    fromOutside: null,
    old: true,
    row,
  };
}

const newestFirst = (a, b) => (b.date === a.date ? String(b.createdAt || '').localeCompare(String(a.createdAt || '')) : b.date.localeCompare(a.date));

/**
 * The teams, each with its finished versions newest first and its version
 * still being made (the newest draft), newest team first.
 * @returns {{ id, name, versions: Object[], draft: Object|null, latest: string }[]}
 */
export function teamsFrom(rows) {
  const teams = new Map();
  (rows || []).filter((r) => r && r.tool_type === TOOL_TYPE).map(versionFromRow).forEach((v) => {
    const t = teams.get(v.teamId) || { id: v.teamId, name: v.teamName, versions: [], drafts: [] };
    (v.status === 'draft' ? t.drafts : t.versions).push(v);
    teams.set(v.teamId, t);
  });
  return [...teams.values()].map((t) => {
    t.versions.sort(newestFirst);
    t.drafts.sort(newestFirst);
    const draft = t.drafts[0] || null;
    // The name the team last had.
    const name = (t.versions[0] || draft)?.teamName || t.name;
    const latest = [t.versions[0]?.date, draft?.date].filter(Boolean).sort().pop() || '';
    return { id: t.id, name, versions: t.versions, draft, drafts: t.drafts, latest };
  }).sort((a, b) => b.latest.localeCompare(a.latest) || a.name.localeCompare(b.name));
}

/** The team a version belongs to, from the teams. */
export const teamOf = (teams, versionId) => teams.find((t) => t.versions.some((v) => v.id === versionId) || t.drafts.some((v) => v.id === versionId)) || null;

/** Is this name another team's already (A to Z lower-cased, trimmed)? */
export function nameTaken(teams, name, exceptId = null) {
  const key = String(name || '').trim().toLowerCase();
  return Boolean(key) && teams.some((t) => t.id !== exceptId && t.name.trim().toLowerCase() === key);
}

/**
 * A new version from a team's latest (M7 version 8.2, its script and its
 * note "From a copy, ratings blank"): the objective, the Success Factors with
 * their levels, the projects with their dates and the line are copied, with
 * the same ids, so Compare matches them; every rating starts blank, and the
 * earlier ratings stay with the earlier version.
 */
export function newVersionFrom(source, { id = flowId(), today = getLocalDateKey() } = {}) {
  const src = source.draft;
  const data = dataFromDraft(src);
  const draft = draftFromData({ ...data, ratings: {}, completedAt: null });
  return {
    id,
    teamId: source.teamId,
    teamName: source.teamName,
    date: today,
    createdAt: null,
    updatedAt: null,
    status: 'new',
    shared: source.shared,
    draft,
    step: null,
    made: 'version',
    from: source.id,
    fromOutside: null,
    old: false,
    row: null,
  };
}

/** A Health Check for a new team: its name comes first (M7 "New team"). */
export function newTeamVersion({ id = flowId(), teamId = flowId(), today = getLocalDateKey(), shared = true } = {}) {
  return {
    id,
    teamId,
    teamName: '',
    date: today,
    createdAt: null,
    updatedAt: null,
    status: 'new',
    shared,
    draft: emptyDraft(),
    step: null,
    made: 'team',
    from: null,
    fromOutside: null,
    old: false,
    row: null,
  };
}

/** What a version keeps in form_data (the shape at the top of this file). */
export function formFrom(version, step = null) {
  const extra = {};
  // An older row keeps what the older pages held that has no place here
  // (their risks and strategies), so nothing they typed is lost.
  const form = isObj(version.row?.form_data) && !isNewShape(version.row.form_data) ? version.row.form_data : null;
  if (form && Array.isArray(form.risks)) extra.risks = form.risks;
  if (form && Array.isArray(form.strategies)) extra.strategies = form.strategies;
  return {
    shape: SHAPE,
    team: { id: version.teamId, name: version.teamName.trim() },
    date: version.date,
    made: version.made,
    from: version.from || null,
    data: dataFromDraft(version.draft),
    step: step || null,
    shared_with_coach: version.shared !== false,
    ...(version.fromOutside ? { from_outside: version.fromOutside } : {}),
    ...extra,
  };
}

/** The decisions row to save for a version. */
export function rowFrom(version, userId, status, step = null) {
  return {
    id: version.id,
    user_id: userId,
    tool_type: TOOL_TYPE,
    title: version.teamName.trim() || 'Your team',
    form_data: formFrom(version, status === 'draft' ? step : null),
    status,
    draft: status === 'draft',
    ...(version.createdAt ? { created_at: version.createdAt } : {}),
    updated_at: new Date().toISOString(),
  };
}

/** The version's answers keyed for Compare: by id, and by name for older rows. */
function matcher(draft) {
  const rows = resultRows(draft);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const byName = new Map(rows.map((r) => [r.text.trim().toLowerCase(), r]));
  return (row) => byId.get(row.id) || byName.get(row.text.trim().toLowerCase()) || null;
}

/**
 * Compare two versions (M7 "Compare two versions"): the earlier and the later
 * (swapped when chosen the other way round, so the words always agree), one
 * sentence on the change in important projects moving well (never a figure),
 * the counts line, how progress moved (rises first, the biggest first, then
 * falls), how many stayed, what was added and what is no longer listed, and
 * where each project was (the chart's dashed rings).
 */
export function compareVersions(first, second, today = getLocalDateKey()) {
  const swap = first.date > second.date || (first.date === second.date && String(first.createdAt || '') > String(second.createdAt || ''));
  const a = swap ? second : first;
  const b = swap ? first : second;
  // In the order the projects were listed (M7 lists them so, not ranked).
  const listed = (rows) => rows.slice().sort((x, y) => x.index - y.index);
  const ra = listed(resultRows(a.draft));
  const rb = listed(resultRows(b.draft));
  const findA = matcher(a.draft);
  const findB = matcher(b.draft);
  const ha = m20Headline(ra, { line: m20ImportantLine(a.draft) });
  const hb = m20Headline(rb, { line: m20ImportantLine(b.draft) });
  const da = versionDate(a.date, today);
  const db = versionDate(b.date, today);
  const diff = hb.movingWell - ha.movingWell;
  const sentence = diff > 0
    ? `${diff} more important project${diff === 1 ? ' is' : 's are'} moving well than on ${da}.`
    : diff < 0
      ? `${-diff} fewer important project${diff === -1 ? ' is' : 's are'} moving well than on ${da}.`
      : `The same number of important projects is moving well as on ${da}.`;
  const counts = `${hb.movingWell} of ${hb.important} ${hb.movingWell === 1 ? 'is' : 'are'} moving well on ${db}, and ${ha.movingWell} of ${ha.important} ${ha.movingWell === 1 ? 'was' : 'were'} on ${da}.`;
  const both = rb.map((r) => ({ now: r, then: findA(r) })).filter((x) => x.then && x.now.progress != null && x.then.progress != null);
  const up = both.filter((x) => x.now.progress > x.then.progress).sort((x, y) => (y.now.progress - y.then.progress) - (x.now.progress - x.then.progress));
  const down = both.filter((x) => x.now.progress < x.then.progress);
  const same = both.length - up.length - down.length;
  const added = rb.filter((r) => !findA(r)).map((r) => r.text);
  const gone = ra.filter((r) => !findB(r)).map((r) => r.text);
  const was = {};
  both.forEach((x) => { was[x.now.id] = { progress: x.then.progress, importance: x.then.importance, size: x.then.size }; });
  // A project new since the earlier version says so in its pop-up.
  const notes = {};
  rb.forEach((r) => {
    const t = findA(r);
    notes[r.id] = t && t.progress != null ? `On ${da}, its progress was “${PROGRESS[t.progress]}”.` : `It’s new since ${da}.`;
  });
  return {
    earlier: a,
    later: b,
    swapped: swap,
    earlierDate: da,
    laterDate: db,
    sentence,
    counts,
    up: up.map((x) => ({ id: x.now.id, text: x.now.text, from: PROGRESS[x.then.progress], to: PROGRESS[x.now.progress] })),
    down: down.map((x) => ({ id: x.now.id, text: x.now.text, from: PROGRESS[x.then.progress], to: PROGRESS[x.now.progress] })),
    same,
    sameLine: same ? `${same} project${same === 1 ? ' is' : 's are'} at the same stage as before.` : '',
    added,
    gone,
    was,
    notes,
    line: m20ImportantLine(b.draft),
  };
}

const PROGRESS = ['', 'Embryonic', 'Bad', 'Fair', 'Good', 'Excellent'];

/**
 * A team's name inside a sentence: "the Leadership team" (M7), but a name
 * that isn't "… team" (an organisation's, which an outside Health Check
 * claimed into the portal takes, 044) or already says whose it is stands
 * alone: "Northfield Logistics", "My team".
 */
export function teamWords(name) {
  const n = String(name || '').trim();
  return /\bteam$/i.test(n) && !/^(my|the|our|your)\b/i.test(n) ? `the ${n}` : n;
}

/**
 * The one-off tip about an outside Health Check that joined a team (M7
 * "Your teams"): the newest version marked from_outside, until its tip is
 * closed. `seen(versionId)` says whether it was closed.
 */
export function claimedTip(teams, seen = () => false) {
  const found = teams.flatMap((t) => t.versions.filter((v) => v.fromOutside).map((v) => ({ v, t })))
    .sort((x, y) => newestFirst(x.v, y.v))
    .find((x) => !seen(x.v.id));
  if (!found) return null;
  const month = MONTHS[Number(found.v.date.slice(5, 7)) - 1];
  return { id: found.v.id, text: `Your ${month} Health Check, done outside the portal, is now with ${teamWords(found.t.name)}.` };
}

/** "Your objective, 4 Success Factors with their weights, and 7 projects with their dates are copied in." */
export function copiedLine(draft) {
  const f = cleanItems(draft.csfs).length;
  const p = cleanItems(draft.projects).length;
  const factors = f === 1 ? '1 Success Factor with its weight' : `${f} Success Factors with their weights`;
  const projects = p === 1 ? '1 project with its dates' : `${p} projects with their dates`;
  return `Your objective, ${factors}, and ${projects} are copied in.`;
}
