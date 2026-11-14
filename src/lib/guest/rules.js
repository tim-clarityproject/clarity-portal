import { friendlyError } from '../friendlyError';

// Guest links: the rules with no database call in them (see api.js), so
// the page and the tests read one answer.

export const GUEST_TOKEN = /^[0-9a-f]{64}$/;
export const CODE_LENGTH = 6;

export const GUEST_WORDS = {
  open: 'That didn’t open. Check your connection and try again.',
  save: 'That didn’t save. Check your connection and try again.',
  remove: 'That didn’t delete. Check your connection and try again.',
  notReady: 'This link isn’t ready to use yet. Ask your coach to send it again.',
  wrongLink: 'This link doesn’t look right. Open it again from the message your coach sent.',
  emailFirst: 'Type your email to carry on.',
  codeFirst: 'Type the 6-character code your coach gave you to carry on.',
  // 035 says "use your email to come back", which has no page yet: the
  // page says what the person can do today.
  closed: 'This link has closed. Ask your coach to send a new one.',
};

/** 035 writes its messages with a plain apostrophe; the page shows the portal's own (’). */
export function guestWords(text) {
  return `${text || ''}`.replace(/'/g, '’').trim();
}

/** What the start page says when guest_open answers that it didn't open. */
export function openProblem(answer) {
  if (answer?.error === 'closed') return GUEST_WORDS.closed;
  return guestWords(answer?.message) || GUEST_WORDS.open;
}

/** The token from /guest/<token>, or null when the address isn't a guest link. */
export function tokenFrom(value) {
  const t = String(value || '').trim().toLowerCase();
  return GUEST_TOKEN.test(t) ? t : null;
}

/** The code as the database reads it: capitals, no spaces or dashes, 6 at most. */
export function cleanCode(value) {
  return String(value || '').normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
}

/** An email as typed, trimmed, with nothing unseen in it; '' when it can't be one. */
export function cleanEmail(value) {
  const e = String(value || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254 ? e : '';
}

/** The email a link carries (?email=…), for the start page's box. */
export function emailFromSearch(search) {
  try {
    return cleanEmail(new URLSearchParams(search || '').get('email'));
  } catch {
    return '';
  }
}

// 035's own refusals are written for the person (errcode 42501 or 22023):
// they are shown as they are. Anything else gets the page's calm line.
const OURS = new Set(['42501', '22023']);
const functionMissing = (error) => error?.code === 'PGRST202' || error?.code === '42883' || error?.status === 404;

/** True when the visit has ended (or its work has moved into an account): the start page shows again. */
export function visitEnded(error) {
  return error?.code === '42501' && /visit has ended|moved into an account|link has closed/i.test(error?.message || '');
}

/** One calm line for anything a guest call refuses. */
export function guestError(error, fallback) {
  if (functionMissing(error)) return GUEST_WORDS.notReady;
  const text = guestWords(error?.message);
  if (error?.code === '42501' && /link has closed/i.test(text)) return GUEST_WORDS.closed;
  if (OURS.has(error?.code) && text && !/permission denied|function|relation|column/i.test(text)) return text;
  return friendlyError(error, fallback, 'Using this link');
}

// ------------------------------------------------------------ this tab's visit

const KEY = 'clarity-guest:';

/** What this tab keeps of a link: { visit, email, tool, toolLabel, coachName, draft }. */
export function readVisit(token) {
  try {
    const raw = window.sessionStorage.getItem(KEY + token);
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v === 'object' && typeof v.visit === 'string' ? v : null;
  } catch {
    return null;
  }
}

export function keepVisit(token, value) {
  try {
    window.sessionStorage.setItem(KEY + token, JSON.stringify(value));
  } catch {
    // Storage blocked: the visit lasts until the page is closed.
  }
}

export function forgetVisit(token) {
  try {
    window.sessionStorage.removeItem(KEY + token);
  } catch {
    // Nothing to forget.
  }
}

/** What guest_open's answer gives the page, in the page's own names. */
export function visitFrom(answer, email) {
  return {
    visit: answer.visit,
    email,
    tool: answer.tool,
    toolLabel: answer.tool_label || '',
    coachName: (answer.coach_name || '').trim(),
  };
}
