import { getLocalDateKey, parseDbTimestamp, formatSavedDate } from './dateFormatter';
import { STANDARD_AREAS, areaName } from './wheelOfLife';
import { CHECKIN_ROUTE, checkinMonth, checkinPath, checkinTitle } from './performance/checkin';

// My Plans and My Reviews (Phase 4 step 4): one list each across the three
// areas, every saved item in it, old and new. This file only turns rows
// read from the database (savedItemsApi.js) into list rows, so the pages,
// the hubs' recent lists and the tests all name things the same way.
//
// Writing rule 60 (Tim, 23 Oct, 19:51): every row has a name in words
// saying what it was about, the tool under it, and the date on the right.
// Never a date as the name. Day plans read "Today’s plan", "Yesterday’s
// plan", then "Daily plan" (reviews the same, "Daily review"); debriefs "Sprint 4, week 3";
// the Life balance review the area chosen ("Focus on sleep"), otherwise
// "October review"; the Hardware and Software check-in "October check-in",
// the first one "First review"; a journal "Journal entry", never its first words; the
// other tools what was typed first. Tool names follow CLAUDE.md rule 26.
//
// Each row: { id (unique in the list), dbId, source, area, title,
// typeLabel (the tool), sortAt, dateLabel, isDraft, canEdit, canDelete,
// canReview, reviewed, version, team, to: { path, state }, edit }.

export const AREAS = [
  { id: 'personal', label: 'Personal' },
  { id: 'interpersonal', label: 'Interpersonal' },
  { id: 'strategic', label: 'Strategic' },
];

export const TOOL_NAME = {
  daily_plan: 'Daily plan',
  plan_meeting: 'Meeting planner',
  if_then_planning: 'Pressure plan',
  stop_doing_audit: 'Time audit',
  grow: 'Get unstuck',
  inversion: 'Pre-mortem',
  'tough-conversation': 'Give difficult feedback',
  'difficult-conversation': 'Prepare for a difficult conversation',
  'strategic-alignment': 'Strategic Alignment Health Check',
};

// Saved items kept in tool_answers, by their tool: the name, the area and
// the address that opens one (its id in the page's state).
const TOOL_ANSWERS = {
  team_check: { name: 'Team performance check', area: 'interpersonal', path: '/team-performance-check' },
};

const DECISION_AREA = {
  plan_meeting: 'interpersonal',
  'tough-conversation': 'interpersonal',
  'difficult-conversation': 'interpersonal',
  'strategic-alignment': 'strategic',
};

// The old My Plans opened these with the whole saved row in its state; the
// old My decisions list opened the rest with the id only. Both kept.
const SUMMARY_WITH_ROW = {
  daily_plan: '/daily-plan-summary',
  plan_meeting: '/meeting-summary',
  if_then_planning: '/pressure-plan/summary',
  stop_doing_audit: '/time-audit/summary',
  // Get unstuck opens in its own tool, on Your plan (M9; Tim, 13 Nov).
  grow: '/get-unstuck',
  'tough-conversation': '/give-difficult-feedback/summary',
};
const SUMMARY_BY_ID = {
  inversion: '/pre-mortem/summary',
};
const EDIT_ROUTE = {
  daily_plan: '/plan-my-day',
  plan_meeting: '/plan-meeting',
  if_then_planning: '/pressure-plan',
  stop_doing_audit: '/time-audit',
  grow: '/get-unstuck',
  inversion: '/pre-mortem',
  'tough-conversation': '/give-difficult-feedback',
  'strategic-alignment': '/goal-setting',
};

/** Plan types with a "Review this plan" page (prompt 8). */
export const REVIEWABLE_TYPES = new Set(['daily_plan', 'plan_meeting', 'if_then_planning', 'tough-conversation', 'inversion']);

// A plan-review's tool line, by the kind of plan it reviews.
const PLAN_REVIEW_TOOL = {
  daily_plan: 'Daily review',
  plan_meeting: 'Meeting review',
  if_then_planning: 'Pressure plan review',
  inversion: 'Pre-mortem review',
  'tough-conversation': 'Feedback review',
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const isDayKey = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Milliseconds for sorting: a plain day at its noon, a saved timestamp as saved. */
export function sortTime(value) {
  if (!value) return 0;
  if (isDayKey(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d, 12).getTime();
  }
  const t = parseDbTimestamp(value).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function addDays(dayKey, n) {
  const [y, m, d] = dayKey.split('-').map(Number);
  return getLocalDateKey(new Date(y, m - 1, d + n, 12));
}

/** "Today’s plan", "Yesterday’s plan", then "Daily plan" or "Daily review" (kind 'plan' or 'review'). */
export function dayName(dayKey, today, kind) {
  if (dayKey === today) return `Today’s ${kind}`;
  if (dayKey && dayKey === addDays(today, -1)) return `Yesterday’s ${kind}`;
  return kind === 'plan' ? 'Daily plan' : 'Daily review';
}

function parseJson(text) {
  try {
    return JSON.parse(text) || {};
  } catch {
    return {};
  }
}

const filled = (...values) => values.some((v) => (Array.isArray(v) ? v.length > 0 : v != null && `${v}`.trim() !== ''));

function base(today, { at, day, ...rest }) {
  const when = day || at;
  return {
    canEdit: false,
    canDelete: false,
    isDraft: false,
    ...rest,
    sortAt: sortTime(when),
    dateLabel: formatSavedDate(when, today),
    date: when,
  };
}

// ------------------------------------------------------------- My Plans

function decisionRow(d, reviews, today) {
  const tool = d.tool_type;
  const isDraft = Boolean(d.draft || d.status === 'draft');
  const dayKey = getLocalDateKey(parseDbTimestamp(d.created_at));
  const reviewable = REVIEWABLE_TYPES.has(tool) && !isDraft;
  const review = reviewable
    ? reviews.find((r) => r.data?.planKind === tool && r.data?.planId === d.id) || null
    : null;
  let to;
  if (SUMMARY_WITH_ROW[tool]) to = { path: SUMMARY_WITH_ROW[tool], state: { decisionId: d.id, ...d } };
  else to = { path: SUMMARY_BY_ID[tool] || '/decision-summary', state: { decisionId: d.id } };
  return base(today, {
    id: `decision:${d.id}`,
    dbId: d.id,
    source: 'decision',
    tool,
    area: DECISION_AREA[tool] || 'personal',
    title: tool === 'daily_plan' ? dayName(dayKey, today, 'plan') : ((d.title || '').trim() || 'Untitled'),
    typeLabel: TOOL_NAME[tool] || 'Saved plan',
    at: d.created_at,
    isDraft,
    canEdit: true,
    canDelete: true,
    canReview: reviewable,
    reviewed: Boolean(review && !(review.status === 'draft' || review.data?.draft === true)),
    reviewEntryId: review?.id || null,
    to,
    edit: { path: EDIT_ROUTE[tool] || '/personal/plan', state: { decisionId: d.id, ...(d.form_data || {}), problemTitle: d.title } },
    raw: d,
  });
}

/** The Health Check's versions: "Version 3" for a team's third, oldest first. */
function numberHealthChecks(rows) {
  const byTeam = new Map();
  rows.filter((r) => r.tool === 'strategic-alignment')
    .sort((a, b) => a.sortAt - b.sortAt)
    .forEach((r) => {
      const team = r.title;
      const key = team.toLowerCase();
      const n = (byTeam.get(key) || 0) + 1;
      byTeam.set(key, n);
      r.team = team;
      r.version = `Version ${n}`;
    });
}

/**
 * Every saved plan, as list rows. `data` is what loadSavedPlans returns:
 * { decisions, planReviews, plans, sprints, dayPlans, missions }.
 */
export function planRows(data, today = getLocalDateKey()) {
  if (!data) return [];
  const reviews = data.planReviews || [];
  const out = (data.decisions || []).map((d) => decisionRow(d, reviews, today));
  numberHealthChecks(out);

  // The tools that keep their own answers (tool_answers, migration 043; on
  // the device until it has run): the Team performance check.
  (data.toolAnswers || []).filter((r) => TOOL_ANSWERS[r.tool]).forEach((r) => {
    const meta = TOOL_ANSWERS[r.tool];
    const isDraft = r.status !== 'completed';
    const to = { path: meta.path, state: { checkId: r.id } };
    out.push(base(today, {
      id: `tool:${r.id}`,
      dbId: r.id,
      source: 'tool-answers',
      tool: r.tool,
      area: meta.area,
      title: (r.title || '').trim() || meta.name,
      typeLabel: meta.name,
      at: r.finishedAt || r.updatedAt || r.createdAt,
      isDraft,
      canEdit: true,
      to,
      edit: to,
    }));
  });

  (data.plans || []).forEach((p) => {
    out.push(base(today, {
      id: `plan:${p.id}`,
      dbId: p.id,
      source: 'plan',
      area: 'personal',
      title: `Version ${p.major}.${p.minor}`,
      typeLabel: 'Individual Performance Plan',
      at: p.updated_at || p.created_at,
      to: { path: p.status === 'active' ? '/performance-plan' : '/performance-plan/history' },
    }));
  });

  (data.sprints || []).forEach((s) => {
    out.push(base(today, {
      id: `sprint:${s.id}`,
      dbId: s.id,
      source: 'sprint',
      area: 'personal',
      title: (s.label || '').trim() || `Sprint ${s.number}`,
      typeLabel: 'Performance Sprint',
      day: s.start_on,
      to: { path: s.status === 'running' ? '/performance-sprint' : '/performance-sprint/year' },
    }));
  });

  (data.dayPlans || [])
    .filter((p) => p.status === 'finished' || filled(p.grateful_for, p.way_of_being, p.biggest_risk, p.risk_response))
    .forEach((p) => {
      const draft = p.status !== 'finished';
      const to = { path: `/daily-plan/${p.local_date}` };
      out.push(base(today, {
        id: `day-plan:${p.id}`,
        dbId: p.id,
        source: 'day-plan',
        area: 'personal',
        title: dayName(p.local_date, today, 'plan'),
        typeLabel: 'Daily plan',
        day: p.local_date,
        isDraft: draft,
        canEdit: draft,
        to,
        edit: draft ? to : null,
      }));
    });

  (data.missions || []).forEach((m) => {
    out.push(base(today, {
      id: `pop:${m.id}`,
      dbId: m.id,
      source: 'pop',
      area: 'personal',
      title: (m.title || '').trim() || 'Personal Operating Plan',
      typeLabel: 'Personal Operating Plan',
      at: m.updated_at || m.created_at,
      to: { path: m.archived_at ? `/personal-operating-plan-archived/${m.id}` : '/personal-operating-plan' },
    }));
  });

  return out;
}

// ----------------------------------------------------------- My Reviews

const JOURNAL_ENTRY = {
  'weekly-momentum': { tool: 'Weekly check-in', fallback: 'Weekly check-in' },
  'after-action': { tool: 'After-action review', fallback: 'After-action review' },
  progress: { tool: 'Progress review', fallback: 'Progress review' },
};

// Old weekly check-ins were titled "Weekly momentum check-in, week of 29
// Sep", a date as the name: they read "Weekly check-in", the date on the right.
const GENERATED_WEEKLY = /^weekly momentum check-in, week of /i;

function journalEntryRow(e, today) {
  if (e.review_type === 'plan-review') {
    const c = parseJson(e.content);
    const kind = c.planKind || 'daily_plan';
    const isDay = kind === 'daily_plan' || !c.planId;
    const day = c.dateKey || e.entry_date || null;
    const draft = e.status === 'draft' || c.draft === true;
    return base(today, {
      id: `entry:${e.id}`,
      dbId: e.id,
      source: 'day',
      area: DECISION_AREA[kind] || 'personal',
      title: isDay ? dayName(day, today, 'review') : ((e.title || '').trim() || 'Review'),
      typeLabel: isDay ? 'Daily review' : (PLAN_REVIEW_TOOL[kind] || 'Review'),
      at: e.created_at,
      isDraft: draft,
      canEdit: true,
      canDelete: true,
      to: { path: '/review-plan-summary', state: { entryId: e.id } },
      raw: e,
    });
  }
  const meta = JOURNAL_ENTRY[e.review_type];
  if (!meta) return null;
  const typed = (e.title || '').trim();
  return base(today, {
    id: `entry:${e.id}`,
    dbId: e.id,
    source: e.review_type === 'weekly-momentum' ? 'weekly' : 'after-action',
    area: 'personal',
    title: !typed || GENERATED_WEEKLY.test(typed) ? meta.fallback : typed,
    typeLabel: meta.tool,
    at: e.created_at,
    isDraft: e.status === 'draft',
    canEdit: true,
    canDelete: true,
    to: { path: '/review-summary', state: { entryId: e.id } },
    edit: { path: '/my-journal', state: { entryId: e.id, reviewType: e.review_type } },
    raw: e,
  });
}

// "Focus on sleep": the area chosen to work on. A standard area by the
// first half of its name, in lower case ("Health / Fitness" is "health";
// "Purpose / Meaning" is "meaning", rule 8); someone's own area as typed.
function focusWords(area) {
  if (STANDARD_AREAS.some((a) => a.key === area.key)) {
    const name = areaName(area);
    if (area.key === 'meaning') return 'meaning';
    return name.split(' / ')[0].toLowerCase();
  }
  return (area.label || '').trim();
}

function wheelName(c) {
  const area = c.focusAreaKey ? (c.areas || []).find((a) => a.key === c.focusAreaKey) : null;
  const words = area ? focusWords(area) : '';
  if (words) return `Focus on ${words}`;
  const day = c.date || getLocalDateKey(parseDbTimestamp(c.checkinAt));
  return `${MONTHS[Number(day.slice(5, 7)) - 1]} review`;
}

/**
 * Every saved review, as list rows. `data` is what loadSavedReviews
 * returns: { entries, missionReviews, journals, checkins, dayReviews,
 * debriefs, sprints, sprintReviews }.
 */
export function reviewRows(data, today = getLocalDateKey()) {
  if (!data) return [];
  const out = [];
  (data.entries || []).forEach((e) => {
    const r = journalEntryRow(e, today);
    if (r) out.push(r);
  });

  (data.missionReviews || []).forEach((r) => {
    out.push(base(today, {
      id: `pop-review:${r.id}`,
      dbId: r.id,
      source: 'plan',
      area: 'personal',
      title: r.review_data?.mission_title || 'Personal operating plan',
      typeLabel: 'POP review',
      at: r.created_at,
      version: r.version || null,
      isDraft: r.status === 'draft',
      // Retired in Phase 3, step 4: read only, so no pencil or Continue.
      canDelete: true,
      to: { path: '/mission-progress-review', state: { reviewId: r.id } },
    }));
  });

  (data.journals || []).forEach((j) => {
    out.push(base(today, {
      id: `journal:${j.id}`,
      dbId: j.id,
      source: 'journal',
      area: 'personal',
      title: 'Journal entry',
      typeLabel: 'Journal',
      day: j.journal_date,
      canEdit: true,
      canDelete: true,
      to: { path: `/daily-journals/${j.journal_date}` },
      edit: { path: '/daily-journal', state: { date: j.journal_date } },
    }));
  });

  (data.checkins || []).forEach((c) => {
    out.push(base(today, {
      id: `wheel:${c.id}`,
      dbId: c.id,
      source: 'wheel',
      area: 'personal',
      title: wheelName(c),
      typeLabel: 'Life balance review',
      at: c.checkinAt,
      canDelete: true,
      to: { path: `/life-balance-review/results?to=${c.date}` },
    }));
  });

  (data.dayReviews || [])
    .filter((r) => r.status === 'finished' || filled(r.way_of_being_rating, r.where_it_showed, r.went_well, r.differently, r.tomorrow, r.on_my_mind))
    .forEach((r) => {
      const draft = r.status !== 'finished';
      const to = { path: `/daily-review/${r.local_date}` };
      out.push(base(today, {
        id: `day-review:${r.id}`,
        dbId: r.id,
        source: 'day-review',
        area: 'personal',
        title: dayName(r.local_date, today, 'review'),
        typeLabel: 'Daily review',
        day: r.local_date,
        isDraft: draft,
        canEdit: draft,
        to,
        edit: draft ? to : null,
      }));
    });

  const sprints = new Map((data.sprints || []).map((s) => [s.id, s]));
  (data.debriefs || [])
    .filter((d) => d.status === 'finished' || filled(d.stress, d.went_well, d.got_in_way, d.adjust))
    .forEach((d) => {
      const s = sprints.get(d.sprint_id);
      if (!s) return;
      const draft = d.status !== 'finished';
      const to = { path: `/performance-sprint/debrief/${d.sprint_id}/${d.sprint_week}` };
      out.push(base(today, {
        id: `debrief:${d.id}`,
        dbId: d.id,
        source: 'debrief',
        area: 'personal',
        title: `Sprint ${s.number}, week ${d.sprint_week}`,
        typeLabel: 'Weekly performance debrief',
        // The week's last day (M3: "Sprint 4, week 3", Sun 18 Oct).
        day: addDays(s.start_on, d.sprint_week * 7 - 1),
        isDraft: draft,
        canEdit: draft,
        to,
        edit: draft ? to : null,
      }));
    });

  (data.sprintReviews || []).forEach((r) => {
    const s = sprints.get(r.sprint_id);
    if (!s) return;
    out.push(base(today, {
      id: `sprint-review:${r.sprint_id}`,
      dbId: r.sprint_id,
      source: 'sprint-review',
      area: 'personal',
      title: `Sprint ${s.number}`,
      typeLabel: 'End-of-sprint review',
      at: r.finished_at || s.actual_end_on || s.planned_end_on,
      to: { path: `/performance-sprint/review/${r.sprint_id}` },
    }));
  });

  // The Hardware and Software check-in (Phase 5): every finished one, and
  // this month's while it's half done (a draft from an earlier month
  // can't be finished any more, so it isn't listed).
  const month = checkinMonth(today);
  (data.hsCheckins || [])
    .filter((c) => c.status === 'finished' || c.month === month)
    .forEach((c) => {
      const draft = c.status !== 'finished';
      out.push(base(today, {
        id: `hs-checkin:${c.id}`,
        dbId: c.id,
        source: 'hs-checkin',
        area: 'personal',
        title: checkinTitle(c),
        typeLabel: 'Monthly Hardware and Software review',
        at: c.finished_at || c.updated_at,
        isDraft: draft,
        canEdit: draft,
        to: { path: draft ? CHECKIN_ROUTE : checkinPath(c.month) },
        edit: draft ? { path: CHECKIN_ROUTE } : null,
      }));
    });

  return out;
}

// -------------------------------------------------------------- filters

/** "Which area?" first, then "Which tool?" (Strategic: "Which team?"), from the rows there are. */
export function listFilters(rows) {
  const filters = AREAS.map((a) => ({ id: a.id, label: a.label, match: (r) => r.area === a.id }));
  const subFilters = {};
  const subLabels = {};
  AREAS.forEach((a) => {
    const inArea = rows.filter((r) => r.area === a.id);
    const byTeam = a.id === 'strategic';
    const seen = new Map();
    inArea.forEach((r) => {
      const label = byTeam ? r.team : r.typeLabel;
      if (label && !seen.has(label.toLowerCase())) seen.set(label.toLowerCase(), label);
    });
    if (!seen.size) return;
    subLabels[a.id] = byTeam ? 'Which team?' : 'Which tool?';
    subFilters[a.id] = [...seen.values()].sort((x, y) => x.localeCompare(y)).map((label) => ({
      id: label,
      label,
      match: (r) => (byTeam ? r.team : r.typeLabel)?.toLowerCase() === label.toLowerCase(),
    }));
  });
  return { filters, subFilters, subLabels };
}

/**
 * A hub's recent saved items (M3): the newest `n` finished ones in an area.
 * Journal entries never show (M3 note: never on a shared screen), and the
 * plan and the sprint already have their tiles at the top of Plan.
 */
export function recentRows(rows, area, n = 3) {
  return rows
    .filter((r) => r.area === area && !r.isDraft && !['journal', 'plan', 'sprint', 'pop'].includes(r.source))
    .sort((a, b) => b.sortAt - a.sortAt)
    .slice(0, n);
}

/** Strategic's saved teams (M3): "Leadership team", "3 versions, latest Mon 12 Oct". */
export function healthCheckTeams(rows, today = getLocalDateKey()) {
  const teams = new Map();
  rows.filter((r) => r.tool === 'strategic-alignment').forEach((r) => {
    const key = r.team.toLowerCase();
    const t = teams.get(key) || { team: r.team, count: 0, latest: 0, latestDate: null };
    t.count += 1;
    if (r.sortAt >= t.latest) {
      t.latest = r.sortAt;
      t.latestDate = r.date;
    }
    teams.set(key, t);
  });
  return [...teams.values()]
    .sort((a, b) => b.latest - a.latest)
    .map((t) => ({
      team: t.team,
      line: t.count === 1
        ? `1 version, ${formatSavedDate(t.latestDate, today)}`
        : `${t.count} versions, latest ${formatSavedDate(t.latestDate, today)}`,
    }));
}

// -------------------------------------------------------------- search

/** Lower case, accents and curly quotes made plain, spaces squeezed: "Today’s Plan" and "todays plan" meet. */
function plainWords(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’ʼ']/g, '')
    .replace(/[“”"]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The rows whose name or tool hold every word typed (Phase 5 step 4: the
 * search in My Plans and My Reviews). It works on the rows already on
 * the device, so it works offline too. Nothing typed keeps every row.
 */
export function searchRows(rows, query) {
  const words = plainWords(query).split(' ').filter(Boolean);
  if (!words.length) return rows;
  return rows.filter((r) => {
    const hay = plainWords([r.title, r.typeLabel, r.team].filter(Boolean).join(' '));
    return words.every((w) => hay.includes(w));
  });
}

/** The line when nothing matches: "Nothing matches “sales”." */
export function noMatchLine(query) {
  return `Nothing matches “${String(query || '').trim()}”.`;
}
