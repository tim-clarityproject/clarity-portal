// Converting existing clients' plans (phase-1-data-model-spec.md section 13).
//
// Pure code: given one person's old Personal Operating Plan (their live
// mission, its strategies and tactics, and how many versions and reviews it
// has), proposes the new Individual Performance Plan: the role mission, the
// Strategies, and what each tactic becomes (a habit, a to-do, a milestone or
// an objective measure), each with its reason. Nothing is decided here: the
// proposal is checked with Tim, client by client, before go-live, and
// Outcome Objectives are set with the coach.

export const LIMITS = Object.freeze({ mission: 120, name: 80, todo: 300 });

const RECURRING = /\b(daily|every|each|weekly|per (day|week|month)|a (day|week)|times? a|x a|routine|habit|morning|evening|nightly|always|regularly|each day|every day)\b/i;
const FREQUENCY_UNIT = /^(times?|sessions?|minutes?|mins?|hours?|hrs?|calls?|days?|workouts?|runs?|meetings?|conversations?|pages?|steps|km|miles?|reps?|glasses?|units?)$/i;
const PER = /\b(per|a|each|every)\s+(day|week|month|working day)\b|\b(daily|weekly|monthly)\b/i;
const OUTCOME_UNIT = /^(£|\$|€|%|percent|k|m|gbp|usd|eur|clients?|customers?|revenue|sales|nps|points?|score|leads?|deals?|people|staff|hires?|retention|margin|profit|kg|lbs?)$/i;
const MILESTONE = /\b(launch|complete|finish|deliver|hire|recruit|sign|publish|achieve|reach|open|close|win|secure|ship|go live|roll out|implement|set up|build|create|write|by (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|q[1-4]|the end|end of)[a-z]*)\b/i;

const COUNTABLE = /^(times?|sessions?|calls?|meetings?|conversations?|workouts?|runs?|reps?|days?)$/i;
// "3 per week" counts; "20 minutes a day" is an amount in minutes.
function habitMeasure(unit, target, perDay) {
  const base = (unit || '').replace(/\b(per|a|each|every)\s+(working\s+)?(day|week|month)\b|\b(daily|weekly|monthly)\b/gi, '').trim();
  const count = !base || COUNTABLE.test(base);
  return { measure: count ? 'count' : 'amount', target: target ?? null, targetPer: perDay ? 'day' : 'week', unit: count ? (base || null) : base };
}

const trimTo = (text, max) => {
  const t = (text || '').trim();
  return t.length <= max ? { text: t, cut: false } : { text: t.slice(0, max).replace(/\s+\S*$/, '').trim(), cut: true };
};

/**
 * What one old tactic becomes, with the reason.
 * @param {{ action: string, type: 'tickable'|'measurable', target_value, unit, current_value, is_done }} t
 * @returns {{ becomes: 'habit'|'todo'|'milestone'|'objective_measure'|'history', confidence: 'clear'|'check',
 *   reason: string, habit?: object, objective?: object, todo?: object }}
 */
export function proposeTactic(t) {
  const words = `${t.action || ''} ${t.unit || ''}`;
  if (t.type === 'measurable') {
    const unit = (t.unit || '').trim();
    const frequency = PER.test(words) || FREQUENCY_UNIT.test(unit) || RECURRING.test(words);
    const outcome = OUTCOME_UNIT.test(unit) || /\b(revenue|sales|profit|clients?|customers?|retention|nps|turnover|margin|growth)\b/i.test(t.action || '');
    if (frequency && !outcome) {
      const perDay = /\b(per day|a day|daily|each day|every day|per working day)\b/i.test(words);
      return {
        becomes: 'habit', confidence: 'clear',
        reason: `A number done again and again ("${t.action}"${unit ? `, ${unit}` : ''}), so it becomes a habit counted ${perDay ? 'each working day' : 'each week'}.`,
        habit: habitMeasure(unit, t.target_value, perDay),
      };
    }
    if (outcome || t.target_value != null) {
      return {
        becomes: 'objective_measure', confidence: outcome ? 'clear' : 'check',
        reason: outcome
          ? `A result to move ("${t.action}"${unit ? `, ${unit}` : ''}), so it becomes the measure of an Outcome Objective, starting at ${t.current_value ?? 'its current figure'} with a target of ${t.target_value ?? 'one to agree'}.`
          : `A number with a target but no sign of how often, so it is most likely a result: proposed as an Outcome Objective's measure. Check with the coach.`,
        objective: { kind: 'number', direction: 'up', start: t.current_value ?? null, target: t.target_value ?? null, unit: unit || null },
      };
    }
    return { becomes: 'habit', confidence: 'check', reason: 'A number with no target or unit: proposed as a habit to count each week. Check with the coach.', habit: { measure: 'count', target: null, targetPer: 'week', unit: null } };
  }
  // tickable
  if (RECURRING.test(words)) {
    const weekly = /\b(weekly|per week|a week|each week|every week|once a week)\b/i.test(words);
    return {
      becomes: 'habit', confidence: 'clear',
      reason: `Something done ${weekly ? 'every week' : 'again and again'} ("${t.action}"), so it becomes a habit: ${weekly ? 'yes or no once a week' : 'yes or no each working day'}.`,
      habit: { measure: weekly ? 'yes_no_weekly' : 'yes_no_days_target', target: null, targetPer: null, unit: null },
    };
  }
  if (t.is_done) {
    return { becomes: 'history', confidence: 'clear', reason: `Already done ("${t.action}"), so it stays in the old plan's history and isn't planned again.` };
  }
  if (MILESTONE.test(t.action || '')) {
    return {
      becomes: 'milestone', confidence: 'check',
      reason: `A one-off result with an end point ("${t.action}"), so it is proposed as a milestone. If it is a step towards a bigger result, it may be a to-do instead.`,
      objective: { kind: 'milestone' },
    };
  }
  return { becomes: 'todo', confidence: 'clear', reason: `A one-off action ("${t.action}"), so it becomes a to-do in its Strategy.`, todo: {} };
}

/**
 * The whole proposal for one person.
 * @param {{ person: { id, name }, mission: { title } | null, strategies: [{ id, name, description, sort_order,
 *   tactics: [...] }], versions: number, reviews: number, archivedMissions: number }} plan
 */
export function proposePlan(plan) {
  const flags = [];
  const mission = trimTo(plan.mission?.title, LIMITS.mission);
  if (!plan.mission) flags.push('No live mission: the role mission is set with the coach.');
  if (mission.cut) flags.push(`The mission is longer than ${LIMITS.mission} characters: shortened at a word break, for the client to reword.`);
  const strategies = (plan.strategies || []).map((s) => {
    const name = trimTo(s.name, LIMITS.name);
    if (name.cut) flags.push(`The Strategy "${s.name.slice(0, 40)}…" is longer than ${LIMITS.name} characters: shortened.`);
    const tactics = (s.tactics || []).map((t) => {
      const p = proposeTactic(t);
      const label = trimTo(t.action, p.becomes === 'todo' ? LIMITS.todo : LIMITS.name);
      return { from: { id: t.id, action: t.action, type: t.type, target_value: t.target_value ?? null, unit: t.unit ?? null, current_value: t.current_value ?? null, is_done: Boolean(t.is_done) },
        name: label.text, nameCut: label.cut, ...p };
    });
    if (!tactics.length) flags.push(`The Strategy "${name.text}" has no tactics: the plan will flag it until something is added.`);
    return { from: { id: s.id, name: s.name }, name: name.text, description: s.description ?? null, tactics };
  });
  const all = strategies.flatMap((s) => s.tactics);
  const count = (k) => all.filter((t) => t.becomes === k).length;
  const objectiveMeasures = all.filter((t) => t.becomes === 'objective_measure' || t.becomes === 'milestone');
  if (!objectiveMeasures.length) flags.push('No tactic looks like a result: all Outcome Objectives are set with the coach.');
  if (strategies.length > 6) flags.push(`${strategies.length} Strategies: 3 to 6 are recommended.`);
  return {
    person: plan.person,
    mission: mission.text || null,
    strategies,
    summary: {
      strategies: strategies.length,
      habits: count('habit'), todos: count('todo'), milestones: count('milestone'), objectiveMeasures: count('objective_measure'), history: count('history'),
      toCheck: all.filter((t) => t.confidence === 'check').length,
    },
    keptAsHistory: { versions: plan.versions || 0, reviews: plan.reviews || 0, archivedMissions: plan.archivedMissions || 0 },
    flags,
  };
}

/** "1 habit", "2 habits", "1 Strategy", "2 Strategies". */
export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

/** The proposal's counts in words. */
export function summaryText(s) {
  return `${plural(s.strategies, 'Strategy', 'Strategies')}; ${plural(s.habits, 'habit', 'habits')}, ${plural(s.todos, 'to-do', 'to-dos')}, `
    + `${plural(s.milestones, 'milestone', 'milestones')}, ${plural(s.objectiveMeasures, 'objective measure', 'objective measures')}, `
    + `${s.history} kept as history. ${s.toCheck} to check.`;
}

/** The per-person report, in plain English, for the check with Tim. */
export function reportFor(p) {
  const L = [];
  L.push(`# Plan conversion proposal: ${p.person.name}`);
  L.push('');
  L.push('A proposal only. Nothing changes until it has been checked with Tim and the client. Outcome Objectives are set with the coach.');
  L.push('');
  L.push(`**Role mission:** ${p.mission ?? '(none: to set with the coach)'}`);
  L.push('');
  const s = p.summary;
  L.push(`**In short:** ${summaryText(s)}`);
  L.push('');
  if (p.flags.length) {
    L.push('**To look at first:**');
    for (const f of p.flags) L.push(`- ${f}`);
    L.push('');
  }
  for (const st of p.strategies) {
    L.push(`## Strategy: ${st.name}`);
    L.push('');
    if (!st.tactics.length) L.push('No tactics yet.');
    for (const t of st.tactics) {
      const label = { habit: 'Habit', todo: 'To-do', milestone: 'Milestone', objective_measure: 'Objective measure', history: 'History' }[t.becomes];
      L.push(`- **${label}${t.confidence === 'check' ? ' (to check)' : ''}:** ${t.name}${t.nameCut ? ' (shortened)' : ''}`);
      L.push(`  - Why: ${t.reason}`);
    }
    L.push('');
  }
  const h = p.keptAsHistory;
  L.push(`**Kept as read-only history:** ${plural(h.versions, 'plan version', 'plan versions')}, ${plural(h.reviews, 'review', 'reviews')} and ${plural(h.archivedMissions, 'archived mission', 'archived missions')}.`);
  L.push('');
  return L.join('\n');
}
