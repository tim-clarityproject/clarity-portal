import { useEffect, useState, useSyncExternalStore } from 'react';
import { supabase } from '../supabase';
import { newId, saveOrQueue, waitingToSend } from '../syncQueue';
import { isMissingTable, tableReady } from '../performance/tableReady';
import { parseDbTimestamp } from '../dateFormatter';
import { deviceKey, readJson, writeJson } from '../deviceStore';
import { addDayKey } from '../performance/dayPlan';
import { localToday } from '../performance/rows';
import { ANSWER_MAX, MAX_PER_TOOL, cleanWording, freePlace, hasWords, isTool, occasionOf } from './model';
import { tidyAnswer, tidyQuestion, tidyState } from './tidy';

export { tidyState };

// Where a person's own questions, their answers and their coach's
// suggestions are kept (migration 055: own_questions, own_question_answers,
// own_question_suggestions; Phase 6a run 7).
//
// Device first, as peakMoments/store.js: every change is kept on the
// device at once, so the page shows it, offline too. Until Tim has run 055
// that is all, with no error shown. Once the tables are there a change is
// sent through the offline queue ("Saved", or "Will sync" while it waits),
// whatever waits on the device from before is moved across once (questions
// before their answers), and a load brings the device's copy up to date.
//
// The device copy is clarity-own-questions-local:<person>, which a Sign
// out never clears (like the peak moments' copy: clearAppStorage.js), so
// nothing waiting for 055 is lost. It carries the person's id, so nobody
// else signing in here is shown it.
//
//   { questions: { [id]: question }, answers: { ['question:occasion']: answer },
//     suggestions: { [id]: suggestion } }
// A question or answer may carry `sent: true` (the table has it), `gone:
// true` (an answer taken away here, still to be sent) and `refused` (the
// database refused it: kept here, unsent; 'full' when another tab or
// device filled the tool's 2 places first).

export const QUESTIONS_TABLE = 'own_questions';
export const ANSWERS_TABLE = 'own_question_answers';
export const SUGGESTIONS_TABLE = 'own_question_suggestions';
const NEVER = new Set(['42501', '23503', '23514', '23505', '22001', '22023', 'CC409']);
const NOT_YET_KEY = 'clarity-own-questions-not-yet';
const NOT_YET_MS = 60 * 60 * 1000;
/** How far back answers are read (the debrief needs its week; summaries their day). */
const ANSWERS_DAYS = 70;

const keyFor = (userId) => deviceKey('own-questions-local', userId);
const EMPTY = Object.freeze({ questions: {}, answers: {}, suggestions: {} });

const iso = (v) => {
  if (!v) return null;
  const d = parseDbTimestamp(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
// ---------------------------------------------------------------- the device copy, shared by every part of the page

const listeners = new Set();
const cache = new Map();

function read(userId) {
  if (!userId) return EMPTY;
  if (!cache.has(userId)) cache.set(userId, tidyState(readJson(keyFor(userId))));
  return cache.get(userId);
}

function write(userId, next) {
  cache.set(userId, next);
  const ok = writeJson(keyFor(userId), next);
  listeners.forEach((fn) => fn());
  return ok;
}

function subscribe(fn) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// Another tab's change (the storage event) shows here too.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (!e.key || !e.key.startsWith('clarity-own-questions-local:')) return;
    const userId = e.key.slice('clarity-own-questions-local:'.length);
    cache.set(userId, tidyState(readJson(e.key)));
    listeners.forEach((fn) => fn());
  });
}

/** Whether anything kept here is still to be sent (Sign out keeps the device copy then). */
export function ownQuestionsWaiting(userId) {
  const s = read(userId);
  return Object.values(s.questions).some((q) => !q.sent)
    || Object.values(s.answers).some((a) => !a.sent)
    || Object.values(s.suggestions).some((x) => x.unsent);
}

// ---------------------------------------------------------------- whether 055 is there

function notYet() {
  try {
    const at = Number(window.localStorage.getItem(NOT_YET_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < NOT_YET_MS && Date.now() >= at;
  } catch {
    return false;
  }
}

function noteNotYet(missing) {
  try {
    if (missing) window.localStorage.setItem(NOT_YET_KEY, String(Date.now()));
    else window.localStorage.removeItem(NOT_YET_KEY);
  } catch {
    // Storage blocked: it is asked again next time.
  }
}

let asking = null;

/** Whether 055's tables are there: true, false (not yet), or null when it can't be told (offline). */
export async function ownReady() {
  if (notYet()) return false;
  if (!asking) {
    asking = (async () => {
      try {
        const there = await tableReady(QUESTIONS_TABLE);
        if (there === false) noteNotYet(true);
        if (there === true) noteNotYet(false);
        return there;
      } catch {
        return null;
      }
    })().finally(() => { asking = null; });
  }
  return asking;
}

// ---------------------------------------------------------------- rows

function questionRow(userId, q) {
  return {
    id: q.id,
    user_id: userId,
    tool: q.tool,
    wording: cleanWording(q.wording).trim(),
    answer_type: q.answerType,
    scale: q.answerType === 'rating' ? q.scale : null,
    position: q.position,
    from_suggestion: q.fromSuggestion || null,
    deleted_at: q.deletedAt || null,
  };
}

function questionFrom(row) {
  return tidyQuestion({
    id: row.id,
    tool: row.tool,
    wording: row.wording,
    answerType: row.answer_type,
    scale: row.scale,
    position: row.position,
    fromSuggestion: row.from_suggestion,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    deletedAt: iso(row.deleted_at),
    sent: true,
  }, row.id);
}

function answerRow(userId, a) {
  return {
    ...(a.id ? { id: a.id } : {}),
    user_id: userId,
    question_id: a.questionId,
    tool: a.tool,
    occasion: a.occasion,
    on_date: a.tool === 'weekly_debrief' ? null : a.occasion,
    sprint_id: a.tool === 'weekly_debrief' ? a.sprintId : null,
    week: a.tool === 'weekly_debrief' ? a.week : null,
    wording: cleanWording(a.wording).trim(),
    answer_type: a.answerType,
    scale: a.answerType === 'rating' ? a.scale : null,
    written: a.answerType === 'written' ? a.written.trim() : null,
    yes_no: a.answerType === 'yes_no' ? a.yesNo : null,
    rating: a.answerType === 'rating' ? a.rating : null,
  };
}

function answerFrom(row) {
  return tidyAnswer({
    id: row.id,
    questionId: row.question_id,
    tool: row.tool,
    occasion: row.occasion,
    date: row.on_date,
    sprintId: row.sprint_id,
    week: row.week,
    wording: row.wording,
    answerType: row.answer_type,
    scale: row.scale,
    written: row.written,
    yesNo: row.yes_no,
    rating: row.rating,
    updatedAt: iso(row.updated_at),
    sent: true,
  }, `${row.question_id}:${row.occasion}`);
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------- sending

async function sendQuestion(userId, q) {
  const r = await saveOrQueue(userId, { table: QUESTIONS_TABLE, kind: 'upsert', onConflict: 'id', values: questionRow(userId, q) });
  const s = read(userId);
  const now = s.questions[q.id];
  if (r?.status === 'saved' && now && now.updatedAt === q.updatedAt) {
    write(userId, { ...s, questions: { ...s.questions, [q.id]: { ...now, sent: true, refused: false } } });
  }
  return r?.status === 'queued' ? 'queued' : 'saved';
}

async function sendAnswer(userId, key, a) {
  const op = a.gone
    ? { table: ANSWERS_TABLE, kind: 'delete', match: { question_id: a.questionId, occasion: a.occasion, user_id: userId } }
    : { table: ANSWERS_TABLE, kind: 'upsert', onConflict: 'question_id,occasion', values: answerRow(userId, a) };
  const r = await saveOrQueue(userId, op);
  const s = read(userId);
  const now = s.answers[key];
  if (r?.status === 'saved' && now && now.updatedAt === a.updatedAt) {
    const answers = { ...s.answers };
    if (now.gone) delete answers[key];
    else answers[key] = { ...now, sent: true };
    write(userId, { ...s, answers });
  }
  return r?.status === 'queued' ? 'queued' : 'saved';
}

function markRefused(userId, kind, key, updatedAt, why) {
  const cur = read(userId);
  const had = cur[kind][key];
  if (had && had.updatedAt === updatedAt) write(userId, { ...cur, [kind]: { ...cur[kind], [key]: { ...had, refused: why || true } } });
}

async function quietly(fn, onRefused) {
  try {
    return await fn();
  } catch (error) {
    if (isMissingTable(error)) return 'device';
    const code = `${error?.code || ''}`;
    if (NEVER.has(code)) {
      onRefused?.(code);
      return code === '23505' ? 'full' : 'refused';
    }
    throw error;
  }
}

// ---------------------------------------------------------------- questions

/**
 * Save one question (new or edited): on the device at once, then sent when
 * 055 is there. A new one takes the tool's first free place; with none it
 * is refused here ('full'), and the database refuses a third from another
 * tab the same way.
 * @returns {Promise<'saved'|'queued'|'device'|'full'|'refused'>}
 */
export async function saveQuestion(userId, question) {
  if (!userId || !question?.id || !isTool(question.tool)) return 'device';
  const s = read(userId);
  const had = s.questions[question.id];
  const live = Object.values(s.questions);
  let position = had && !had.deletedAt ? had.position : question.position;
  if (!had || had.deletedAt || had.refused) {
    const others = live.filter((q) => q.id !== question.id);
    const free = freePlace(others, question.tool);
    if (free == null) return 'full';
    position = others.some((q) => q.tool === question.tool && !q.deletedAt && !q.refused && q.position === position) || !position ? free : position;
  }
  if (!hasWords(question.wording)) return 'device';
  const now = new Date().toISOString();
  const q = tidyQuestion({
    ...had,
    ...question,
    position,
    createdAt: had?.createdAt || now,
    updatedAt: now,
    deletedAt: question.deletedAt ?? null,
    sent: false,
    refused: false,
  }, question.id);
  if (!write(userId, { ...read(userId), questions: { ...read(userId).questions, [q.id]: q } })) throw new Error('The device has no room to keep this.');
  if (!(await ownReady())) return 'device';
  return quietly(() => sendQuestion(userId, q), (code) => markRefused(userId, 'questions', q.id, q.updatedAt, code === '23505' ? 'full' : true));
}

/** Delete a question there and then (Undo: restoreQuestion). Its past answers stay, under the words they were given to. */
export async function deleteQuestion(userId, id) {
  const s = read(userId);
  const had = s.questions[id];
  if (!had) return 'device';
  const now = new Date().toISOString();
  // Never sent and refused or never there: nothing to take away from the table.
  const q = { ...had, deletedAt: now, updatedAt: now, sent: false };
  write(userId, { ...s, questions: { ...s.questions, [id]: q } });
  if (had.refused || !hasWords(had.wording) || !(await ownReady())) return 'device';
  return quietly(() => sendQuestion(userId, q), () => markRefused(userId, 'questions', id, q.updatedAt));
}

/** Undo a delete: back in its place, or the other free place; 'full' when both are taken since. */
export async function restoreQuestion(userId, id) {
  const had = read(userId).questions[id];
  if (!had) return 'device';
  return saveQuestion(userId, { ...had, deletedAt: null });
}

// ---------------------------------------------------------------- answers

/**
 * Save one answer to one question for one day (or sprint week). An empty
 * written answer, or none, takes any earlier answer away: a skipped
 * question has no row. The words are the question's as they are now, kept
 * with the answer so a later edit never rewrites it.
 */
export async function saveAnswer(userId, question, when, value) {
  const occasion = occasionOf(question?.tool, when);
  if (!userId || !question?.id || !occasion) return 'device';
  const key = `${question.id}:${occasion}`;
  const s = read(userId);
  const had = s.answers[key];
  const now = new Date().toISOString();
  const empty = value == null || (question.answerType === 'written' && !String(value).trim());
  if (empty) {
    if (!had) return 'device';
    if (!had.sent) {
      const answers = { ...s.answers };
      delete answers[key];
      write(userId, { ...s, answers });
      // It may already be on its way in the queue: take it away there too.
      if (!(await ownReady())) return 'device';
    }
    const gone = { ...had, gone: true, updatedAt: now };
    const cur = read(userId);
    write(userId, { ...cur, answers: { ...cur.answers, [key]: gone } });
    if (!(await ownReady())) return 'device';
    return quietly(() => sendAnswer(userId, key, gone), () => markRefused(userId, 'answers', key, now));
  }
  const a = tidyAnswer({
    id: had?.id || newId(),
    questionId: question.id,
    tool: question.tool,
    occasion,
    date: question.tool === 'weekly_debrief' ? null : occasion,
    sprintId: question.tool === 'weekly_debrief' ? when.sprintId : null,
    week: question.tool === 'weekly_debrief' ? when.week : null,
    wording: question.wording,
    answerType: question.answerType,
    scale: question.scale,
    written: question.answerType === 'written' ? String(value).slice(0, ANSWER_MAX) : null,
    yesNo: question.answerType === 'yes_no' ? Boolean(value) : null,
    rating: question.answerType === 'rating' ? Number(value) : null,
    updatedAt: now,
  }, key);
  if (!a) return 'device';
  if (!write(userId, { ...s, answers: { ...s.answers, [key]: a } })) throw new Error('The device has no room to keep this.');
  if (!(await ownReady())) return 'device';
  return quietly(async () => {
    const q = read(userId).questions[question.id];
    if (q && !q.sent && !q.refused) await sendQuestion(userId, q);
    return sendAnswer(userId, key, a);
  }, () => markRefused(userId, 'answers', key, now));
}

// ---------------------------------------------------------------- suggestions

async function sendSuggestionChoice(userId, s) {
  const values = { status: s.status, ...(s.homeSeenAt ? { home_seen_at: s.homeSeenAt } : {}) };
  const r = await saveOrQueue(userId, { table: SUGGESTIONS_TABLE, kind: 'update', match: { id: s.id, user_id: userId }, values });
  const cur = read(userId);
  if (r?.status === 'saved' && cur.suggestions[s.id]) {
    write(userId, { ...cur, suggestions: { ...cur.suggestions, [s.id]: { ...cur.suggestions[s.id], unsent: false } } });
  }
  return r?.status === 'queued' ? 'queued' : 'saved';
}

/** The client's choice on a suggestion: 'added' or 'not_now'. The coach is never told. */
export async function decideSuggestion(userId, id, status) {
  const s = read(userId);
  const had = s.suggestions[id];
  if (!had || had.status !== 'waiting') return 'device';
  const next = { ...had, status, unsent: true };
  write(userId, { ...s, suggestions: { ...s.suggestions, [id]: next } });
  if (!(await ownReady())) return 'device';
  return quietly(() => sendSuggestionChoice(userId, next), () => {
    const cur = read(userId);
    if (cur.suggestions[id]) write(userId, { ...cur, suggestions: { ...cur.suggestions, [id]: { ...cur.suggestions[id], unsent: false } } });
  });
}

/**
 * Add it: the suggestion becomes the person's own question (in the free
 * place, or in place of the question they chose to replace).
 * @returns {Promise<'saved'|'queued'|'device'|'full'|'refused'>}
 */
export async function addSuggestion(userId, id, { replace = null } = {}) {
  const s = read(userId).suggestions[id];
  if (!s) return 'device';
  if (replace) {
    const old = read(userId).questions[replace];
    if (old && !old.deletedAt) await deleteQuestion(userId, replace);
  }
  const r = await saveQuestion(userId, {
    id: newId(),
    tool: s.tool,
    wording: s.wording,
    answerType: s.answerType,
    scale: s.scale,
    fromSuggestion: s.id,
  });
  if (r === 'full' || r === 'refused') return r;
  await decideSuggestion(userId, id, 'added');
  return r;
}

/** Home's line is shown once: marked seen as it shows. */
export async function seeSuggestion(userId, id) {
  const s = read(userId);
  const had = s.suggestions[id];
  if (!had || had.homeSeenAt) return 'device';
  const next = { ...had, homeSeenAt: new Date().toISOString(), unsent: true };
  write(userId, { ...s, suggestions: { ...s.suggestions, [id]: next } });
  if (!(await ownReady())) return 'device';
  return quietly(() => sendSuggestionChoice(userId, next));
}

/**
 * A coach suggests a question to their own client (055's own_question_suggest).
 * Needs 055 and a connection: 'needs_055' or 'offline' otherwise.
 */
export async function suggestQuestion({ clientUserId, tool, wording, answerType, scale }) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  const { error } = await supabase.rpc('own_question_suggest', {
    p_client: clientUserId,
    p_tool: tool,
    p_wording: cleanWording(wording).trim(),
    p_answer_type: answerType,
    p_scale: answerType === 'rating' ? scale : null,
  });
  if (!error) return 'saved';
  if (error.code === 'PGRST202' || error.code === '42883' || isMissingTable(error)) return 'needs_055';
  throw error;
}

// ---------------------------------------------------------------- moving across and loading

let moving = null;

/** Once 055 is there: everything still waiting on this device is sent across, questions first. Quiet. */
export function moveOwnQuestions(userId) {
  if (!userId) return Promise.resolve(0);
  if (moving) return moving;
  moving = (async () => {
    if (waitingToSend(userId)) return 0;
    const s = read(userId);
    const questions = Object.values(s.questions).filter((q) => !q.sent && !q.refused && hasWords(q.wording));
    const answers = Object.entries(s.answers).filter(([, a]) => !a.sent && !a.refused);
    const choices = Object.values(s.suggestions).filter((x) => x.unsent);
    if ((!questions.length && !answers.length && !choices.length) || !(await ownReady())) return 0;
    let moved = 0;
    for (const q of questions.sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)))) {
      try {
        await sendQuestion(userId, q);
        moved += 1;
      } catch (error) {
        const code = `${error?.code || ''}`;
        if (!NEVER.has(code)) return moved;
        markRefused(userId, 'questions', q.id, q.updatedAt, code === '23505' ? 'full' : true);
      }
    }
    for (const [key, a] of answers) {
      try {
        await sendAnswer(userId, key, a);
        moved += 1;
      } catch (error) {
        if (!NEVER.has(`${error?.code || ''}`)) return moved;
        markRefused(userId, 'answers', key, a.updatedAt);
      }
    }
    for (const c of choices) {
      try {
        await sendSuggestionChoice(userId, c);
        moved += 1;
      } catch (error) {
        if (!NEVER.has(`${error?.code || ''}`)) return moved;
      }
    }
    return moved;
  })().catch(() => 0).finally(() => { moving = null; });
  return moving;
}

/** Bring the device's copy up to date with the tables. Never replaces a change still to be sent. Never throws. */
export async function refreshOwnQuestions(userId) {
  if (!userId || !(await ownReady())) return false;
  try {
    await moveOwnQuestions(userId);
    const waitingBefore = waitingToSend(userId);
    const since = addDayKey(localToday(), -ANSWERS_DAYS);
    const [qRes, aRes, sRes] = await Promise.all([
      supabase.from(QUESTIONS_TABLE).select('*').eq('user_id', userId),
      supabase.from(ANSWERS_TABLE).select('*').eq('user_id', userId).or(`on_date.gte.${since},tool.eq.weekly_debrief`),
      supabase.from(SUGGESTIONS_TABLE).select('*').eq('user_id', userId).eq('status', 'waiting'),
    ]);
    if (qRes.error) throw qRes.error;
    if (aRes.error) throw aRes.error;
    if (waitingBefore || waitingToSend(userId)) return false;
    const s = read(userId);
    const questions = { ...s.questions };
    const qIds = new Set();
    for (const row of qRes.data || []) {
      const q = questionFrom(row);
      if (!q) continue;
      qIds.add(q.id);
      const here = questions[q.id];
      if (!here || here.sent) questions[q.id] = q;
      else if (same(questionRow(userId, here), questionRow(userId, q))) questions[q.id] = { ...here, sent: true, refused: false };
    }
    for (const q of Object.values(questions)) if (!qIds.has(q.id) && q.sent) delete questions[q.id];
    const answers = { ...s.answers };
    const aKeys = new Set();
    for (const row of aRes.data || []) {
      const a = answerFrom(row);
      if (!a) continue;
      const key = `${a.questionId}:${a.occasion}`;
      aKeys.add(key);
      const here = answers[key];
      if (!here || here.sent) answers[key] = a;
      else if (!here.gone && same({ ...answerRow(userId, here), id: null }, { ...answerRow(userId, a), id: null })) answers[key] = { ...here, id: a.id, sent: true };
    }
    for (const [key, a] of Object.entries(answers)) {
      const old = a.tool !== 'weekly_debrief' && a.occasion < since;
      if (!aKeys.has(key) && (a.sent || a.gone) && !old) delete answers[key];
    }
    const suggestions = {};
    if (!sRes.error) {
      for (const row of sRes.data || []) {
        const here = s.suggestions[row.id];
        suggestions[row.id] = here?.unsent ? here : {
          id: row.id,
          tool: row.tool,
          wording: cleanWording(row.wording),
          answerType: row.answer_type,
          scale: row.scale,
          coachFirstName: row.coach_first_name,
          status: row.status,
          createdAt: iso(row.created_at),
          homeSeenAt: iso(row.home_seen_at),
          unsent: false,
        };
      }
      // A choice still on its way stays until the table has it.
      for (const x of Object.values(s.suggestions)) if (x.unsent && !suggestions[x.id]) suggestions[x.id] = x;
    }
    write(userId, { questions, answers, suggestions: sRes.error ? s.suggestions : suggestions });
    return true;
  } catch {
    return false;
  }
}

const listOf = (state) => ({
  questions: Object.values(state.questions),
  answers: Object.values(state.answers).filter((a) => !a.gone),
  suggestions: Object.values(state.suggestions),
});

/**
 * The person's own questions, answers and suggestions, kept up to date: the
 * device's copy at once, then the tables' quietly (once 055 is there).
 */
export function useOwnQuestions(userId) {
  const state = useSyncExternalStore(subscribe, () => read(userId), () => EMPTY);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    let live = true;
    if (!userId) return undefined;
    refreshOwnQuestions(userId).finally(() => { if (live) setChecked(true); });
    return () => { live = false; };
  }, [userId]);
  return { ...listOf(state), checked };
}

/** For pages that read without subscribing (a tool's first draw). */
export const ownState = (userId) => listOf(read(userId));

/** For tests: forget the in-memory copy, so the next read is from storage. */
export function forgetOwnCache() {
  cache.clear();
}

export { MAX_PER_TOOL };
