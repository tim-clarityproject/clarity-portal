import { ANSWER_MAX, cleanWording, isTool, scaleOf } from './model';

// Reading what a device kept (clarity-own-questions-local:<person>), so that
// nothing kept by another version, or damaged, stops a page (run 7). Kept
// apart from store.js so it can be tested without the database.

const plainObject = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

export function tidyQuestion(q, id) {
  if (!q || typeof q !== 'object' || q.id !== id || !isTool(q.tool)) return null;
  const answerType = ['written', 'yes_no', 'rating'].includes(q.answerType) ? q.answerType : 'written';
  const position = q.position === 2 ? 2 : 1;
  return {
    id,
    tool: q.tool,
    wording: cleanWording(q.wording),
    answerType,
    scale: answerType === 'rating' ? scaleOf(q.scale).key : null,
    position,
    fromSuggestion: typeof q.fromSuggestion === 'string' ? q.fromSuggestion : null,
    createdAt: typeof q.createdAt === 'string' ? q.createdAt : null,
    updatedAt: typeof q.updatedAt === 'string' ? q.updatedAt : null,
    deletedAt: typeof q.deletedAt === 'string' ? q.deletedAt : null,
    sent: q.sent === true,
    refused: typeof q.refused === 'string' || q.refused === true ? q.refused : false,
  };
}

export function tidyAnswer(a, key) {
  if (!a || typeof a !== 'object' || typeof a.questionId !== 'string' || !isTool(a.tool) || typeof a.occasion !== 'string') return null;
  if (key !== `${a.questionId}:${a.occasion}`) return null;
  const answerType = ['written', 'yes_no', 'rating'].includes(a.answerType) ? a.answerType : 'written';
  return {
    id: typeof a.id === 'string' ? a.id : null,
    questionId: a.questionId,
    tool: a.tool,
    occasion: a.occasion,
    date: typeof a.date === 'string' ? a.date : null,
    sprintId: typeof a.sprintId === 'string' ? a.sprintId : null,
    week: Number.isInteger(a.week) ? a.week : null,
    wording: cleanWording(a.wording),
    answerType,
    scale: answerType === 'rating' ? scaleOf(a.scale).key : null,
    written: answerType === 'written' && typeof a.written === 'string' ? a.written.slice(0, ANSWER_MAX) : null,
    yesNo: answerType === 'yes_no' && typeof a.yesNo === 'boolean' ? a.yesNo : null,
    rating: answerType === 'rating' && Number.isInteger(a.rating) && a.rating >= 1 && a.rating <= 5 ? a.rating : null,
    updatedAt: typeof a.updatedAt === 'string' ? a.updatedAt : null,
    sent: a.sent === true,
    gone: a.gone === true,
    refused: a.refused === true,
  };
}

/** What the device keeps, read so that nothing kept by another version stops a page. */
export function tidyState(raw) {
  const r = plainObject(raw);
  const questions = {};
  for (const [id, q] of Object.entries(plainObject(r.questions))) {
    if (id === '__proto__') continue;
    const t = tidyQuestion(q, id);
    if (t) questions[id] = t;
  }
  const answers = {};
  for (const [k, a] of Object.entries(plainObject(r.answers))) {
    if (k === '__proto__') continue;
    const t = tidyAnswer(a, k);
    if (t) answers[k] = t;
  }
  const suggestions = {};
  for (const [id, s] of Object.entries(plainObject(r.suggestions))) {
    if (id === '__proto__' || !s || typeof s !== 'object' || s.id !== id || !isTool(s.tool)) continue;
    suggestions[id] = {
      id,
      tool: s.tool,
      wording: cleanWording(s.wording),
      answerType: ['written', 'yes_no', 'rating'].includes(s.answerType) ? s.answerType : 'written',
      scale: s.answerType === 'rating' ? scaleOf(s.scale).key : null,
      coachFirstName: typeof s.coachFirstName === 'string' ? s.coachFirstName : '',
      status: ['waiting', 'added', 'not_now', 'replaced'].includes(s.status) ? s.status : 'waiting',
      createdAt: typeof s.createdAt === 'string' ? s.createdAt : null,
      homeSeenAt: typeof s.homeSeenAt === 'string' ? s.homeSeenAt : null,
      unsent: s.unsent === true,
    };
  }
  return { questions, answers, suggestions };
}

