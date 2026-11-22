// Your own questions (mock-up "Your own questions", version 3; Phase 6a
// run 7, Tim, 22 Nov 2026). Every rule and word in one place: no page works
// out a tool's name, a scale, a count, the worry line or a week's summary
// for itself. Tested by tests/performance/own-questions.test.mjs.
//
// Up to 2 questions of a person's own in the Daily plan, the Daily review
// and the Weekly performance debrief, set only in My Account, Settings.
// In each tool they come last, just before the summary, one per screen.
// A rating maps to 0, 25, 50, 75 and 100 (methods 1.5) and is stored, but
// nothing reads it yet: no Performance score, streak or pattern.
//
// Names follow the portal's language rules over the mock-up's: the mock-up
// says "Plan my day" and "Review my day", which are the Daily plan and the
// Daily review everywhere (CLAUDE.md rule 26a).

export const MAX_PER_TOOL = 2;
export const WORDING_MAX = 120;
/** The count shows only in the last 20 characters ("101 of 120"). */
export const COUNT_FROM = WORDING_MAX - 20;
export const ANSWER_MAX = 4000;

export const TOOLS = [
  { key: 'daily_plan', name: 'Daily plan', inSentence: 'the Daily plan' },
  { key: 'daily_review', name: 'Daily review', inSentence: 'the Daily review' },
  { key: 'weekly_debrief', name: 'Weekly performance debrief', inSentence: 'the weekly debrief' },
];
export const TOOL_KEYS = TOOLS.map((t) => t.key);
export const toolName = (key) => TOOLS.find((t) => t.key === key)?.name || '';
export const isTool = (key) => TOOL_KEYS.includes(key);

/** The six five-word scales (Vagias 2006; rule 29i): never numbers. */
export const SCALES = [
  { key: 'often', name: 'How often', words: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'] },
  { key: 'much', name: 'How much', words: ['Not at all', 'Slightly', 'Moderately', 'Very', 'Extremely'] },
  { key: 'good', name: 'How good', words: ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'] },
  { key: 'agree', name: 'How much you agree', words: ['Strongly disagree', 'Disagree', 'Neither agree nor disagree', 'Agree', 'Strongly agree'] },
  { key: 'satisfied', name: 'How satisfied', words: ['Very dissatisfied', 'Dissatisfied', 'Unsure', 'Satisfied', 'Very satisfied'] },
  { key: 'likely', name: 'How likely', words: ['Extremely unlikely', 'Unlikely', 'Neutral', 'Likely', 'Extremely likely'] },
];
/** How often is picked first: most reflective questions are about how often. */
export const DEFAULT_SCALE = 'often';
export const scaleOf = (key) => SCALES.find((s) => s.key === key) || SCALES[0];
/** "How often: Never to Always", each choice with its first and last word. */
export const scaleLabel = (key) => {
  const s = scaleOf(key);
  return `${s.name}: ${s.words[0]} to ${s.words[4]}`;
};
export const SCALE_OPTIONS = SCALES.map((s) => ({ value: s.key, label: scaleLabel(s.key) }));

export const ANSWER_TYPES = [
  { value: 'written', label: 'Written' },
  { value: 'yes_no', label: 'Yes or no' },
  { value: 'rating', label: 'A rating' },
];

/** The grey line under a question's words: "Written", "Yes or no", "A rating, Never to Always". */
export function kindLine(q) {
  if (q?.answerType === 'yes_no') return 'Yes or no';
  if (q?.answerType === 'rating') {
    const s = scaleOf(q.scale);
    return `A rating, ${s.words[0]} to ${s.words[4]}`;
  }
  return 'Written';
}

/** The help line under the box, per tool. */
export const HINTS = {
  daily_plan: 'Questions that start with What or How, and look ahead to today, work best.',
  daily_review: 'Questions that start with What or How give you the most to think about.',
  weekly_debrief: 'Questions that start with What or How, and look back on the week, work best.',
};

/**
 * Writing rule 52: tools that look ahead never ask about stress, tension or
 * worry. Advice only, in the same quiet grey: the person owns their questions.
 */
export const WORRY_LINE = 'The Daily plan looks ahead, so questions about stress or worry work better in the Daily review.';
const WORRY = /\b(stress|worr|anxi|nervous|dread)/i;
export const soundsLikeWorry = (text) => WORRY.test(String(text || ''));
export const hintFor = (tool, wording) => (tool === 'daily_plan' && soundsLikeWorry(wording) ? WORRY_LINE : HINTS[tool] || '');

/** The example inside the box, by role (Leader unless told). */
export const EXAMPLES = {
  daily_plan: { leader: 'What would make today a win?', ceo: 'What decision matters most today?', coach: 'Who needs my full attention today?' },
  daily_review: { leader: 'What did I learn about my team today?', ceo: 'What did I notice about the business today?', coach: 'Where did I listen best today?' },
  weekly_debrief: { leader: 'Where did my team grow this week?', ceo: 'What did I spend my best hours on this week?', coach: 'What did I learn from my clients this week?' },
};
export const exampleFor = (tool, role) => {
  const set = EXAMPLES[tool] || EXAMPLES.daily_review;
  return `e.g. ${set[role === 'ceo' || role === 'coach' ? role : 'leader']}`;
};

// Characters nobody can see (as sign-in rule 38's cleanName): taken out, so
// a question of only those is no question.
const UNSEEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F­​-‏‪-‮⁠-⁤﻿]/g;
/** The words as kept: unseen characters out, line breaks to spaces, at most 120. */
export function cleanWording(text) {
  return String(text || '').replace(UNSEEN, '').replace(/\s*[\r\n]+\s*/g, ' ').slice(0, WORDING_MAX);
}
export const hasWords = (text) => cleanWording(text).trim().length > 0;
/** "101 of 120", only in the last 20. */
export const countLine = (text) => {
  const n = cleanWording(text).length;
  return n > COUNT_FROM ? `${n} of ${WORDING_MAX}` : null;
};

/** The person's live questions for one tool, in place order. */
export function questionsFor(questions, tool) {
  return (questions || [])
    .filter((q) => q.tool === tool && !q.deletedAt && !q.refused && hasWords(q.wording))
    .sort((a, b) => a.position - b.position || String(a.createdAt).localeCompare(String(b.createdAt)));
}

/** "1 of 2" */
export const placesLine = (n) => `${Math.min(n, MAX_PER_TOOL)} of ${MAX_PER_TOOL}`;

/** The first free place (1 or 2), or null when the tool is full. */
export function freePlace(questions, tool) {
  const used = new Set(questionsFor(questions, tool).map((q) => q.position));
  for (let p = 1; p <= MAX_PER_TOOL; p += 1) if (!used.has(p)) return p;
  return null;
}

// ---------------------------------------------------------------- answers

/** Where an answer belongs: the day (Daily plan and review), or the sprint week (debrief). */
export function occasionOf(tool, when) {
  if (tool === 'weekly_debrief') return when?.sprintId && when?.week ? `${when.sprintId}:${when.week}` : null;
  return /^\d{4}-\d{2}-\d{2}$/.test(when?.date || '') ? when.date : null;
}

/** A rating 1 to 5 scores 0, 25, 50, 75 or 100 (methods 1.5). */
export const ratingScore = (rating) => (Number.isInteger(rating) && rating >= 1 && rating <= 5 ? (rating - 1) * 25 : null);

/** Whether an answer holds something (a skipped question has none). */
export function answered(a) {
  if (!a || a.gone) return false;
  if (a.answerType === 'written') return typeof a.written === 'string' && a.written.trim().length > 0;
  if (a.answerType === 'yes_no') return typeof a.yesNo === 'boolean';
  if (a.answerType === 'rating') return Number.isInteger(a.rating) && a.rating >= 1 && a.rating <= 5;
  return false;
}

/** The answer in words: the text, "Yes", "No" or the rating's word. */
export function answerWords(a) {
  if (!answered(a)) return '';
  if (a.answerType === 'written') return a.written.trim();
  if (a.answerType === 'yes_no') return a.yesNo ? 'Yes' : 'No';
  return scaleOf(a.scale).words[a.rating - 1];
}

/** The summary's rows for one day: answered questions only, in place order, each under the words it was answered with. */
export function daySummaryRows(questions, answers, tool, occasion) {
  const rows = [];
  for (const q of questionsFor(questions, tool)) {
    const a = (answers || []).find((x) => x.questionId === q.id && x.occasion === occasion);
    if (!answered(a)) continue;
    rows.push({ id: q.id, label: a.wording || q.wording, value: answerWords(a) });
  }
  return rows;
}

const times = (n) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);

/**
 * The debrief's "Your own questions": the debrief's own questions' answers
 * for the week, then each daily question answered on the week's working
 * days: a rating as the answer given most ("“Often” on 3 of 5 days."), a yes
 * or no as a count ("Yes on 3 of 5 days."), written answers as "You answered
 * on 4 of 5 days." with Read your answers. Skipped questions don't appear.
 *
 * @param questions  every question the person has (deleted ones too: a
 *                   question deleted mid-week still shows its week's answers)
 * @param answers    every answer the device holds
 * @param week       { sprintId, week, workingDays: ['YYYY-MM-DD', ...] }
 */
export function weekSummaryRows(questions, answers, week) {
  const rows = [];
  const all = questions || [];
  const occasion = occasionOf('weekly_debrief', week);
  for (const q of questionsFor(all, 'weekly_debrief')) {
    const a = (answers || []).find((x) => x.questionId === q.id && x.occasion === occasion);
    if (answered(a)) rows.push({ id: q.id, kind: 'week', label: a.wording || q.wording, value: answerWords(a) });
  }
  const days = [...new Set(week?.workingDays || [])].sort();
  const total = days.length;
  if (!total) return rows;
  const inWeek = new Set(days);
  for (const tool of ['daily_plan', 'daily_review']) {
    const byQ = new Map();
    for (const a of answers || []) {
      if (a.tool !== tool || !inWeek.has(a.occasion) || !answered(a)) continue;
      if (!byQ.has(a.questionId)) byQ.set(a.questionId, []);
      byQ.get(a.questionId).push(a);
    }
    const order = all.filter((q) => q.tool === tool).sort((x, y) => (x.deletedAt ? 1 : 0) - (y.deletedAt ? 1 : 0) || x.position - y.position);
    for (const q of order) {
      const list = (byQ.get(q.id) || []).sort((x, y) => x.occasion.localeCompare(y.occasion));
      if (!list.length) continue;
      const label = q.deletedAt ? list[list.length - 1].wording : q.wording;
      const n = list.length;
      if (q.answerType === 'rating' || list[0].answerType === 'rating') {
        const ratings = list.filter((a) => a.answerType === 'rating');
        const count = new Map();
        for (const a of ratings) count.set(`${a.scale}:${a.rating}`, (count.get(`${a.scale}:${a.rating}`) || 0) + 1);
        // The answer given most; a tie goes to the later answer given, so it reads as the week now.
        let best = null;
        for (const a of ratings) {
          const k = `${a.scale}:${a.rating}`;
          if (!best || count.get(k) >= count.get(best.k)) best = { k, a };
        }
        if (best) {
          rows.push({ id: q.id, kind: 'rating', label, value: `“${answerWords(best.a)}” on ${count.get(best.k)} of ${total} days.` });
          continue;
        }
      }
      if (q.answerType === 'yes_no' || list[0].answerType === 'yes_no') {
        const yes = list.filter((a) => a.answerType === 'yes_no' && a.yesNo).length;
        rows.push({ id: q.id, kind: 'yes_no', label, value: `Yes on ${yes} of ${total} days.` });
        continue;
      }
      rows.push({
        id: q.id,
        kind: 'written',
        label,
        value: `You answered on ${n} of ${total} days.`,
        answers: list.map((a) => ({ date: a.occasion, wording: a.wording, text: a.written.trim() })),
      });
    }
  }
  return rows;
}

export const _forTests = { times };

// ---------------------------------------------------------------- suggestions

/** "Suggested by Tim": the coach's first name always from the data. */
export const suggestedBy = (s) => `Suggested by ${String(s?.coachFirstName || '').trim() || 'your coach'}`;
/** Home's one quiet link, shown once. */
export const homeSuggestionLine = (s) => `See the question ${String(s?.coachFirstName || '').trim() || 'your coach'} suggested`;

/** A suggestion waits in its tool's place while there is one free; with 2 there, Add it offers Replace. */
export const waitingSuggestions = (suggestions, tool) => (suggestions || [])
  .filter((s) => s.status === 'waiting' && (!tool || s.tool === tool))
  .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
