// Help that can be dismissed, in the client portal (Tim, 19 Nov; tidy pass,
// item 13): every explanation panel ends with "Don’t show me this again",
// which hides the link or ⓘ that opens it, with Undo. My Account,
// Appearance has "Hidden help" with "Show it again". The coach portal keeps
// its own in coach_settings.hidden_help (src/pages/coach/help.jsx).
//
// A signed-in person's hidden help is kept in the account
// (person_settings.page_preferences.hidden_help, { key: true }), this
// device's copy first, through the offline queue (menuPins.js); with nobody
// signed in (the outside Health Check), on this device only. No migration:
// page_preferences is JSON.

export const HIDDEN_HELP_PREFERENCE = 'hidden_help';
export const DEVICE_HIDDEN_HELP_KEY = 'clarity-hidden-help';
const MAX_KEY = 80;

/** What is hidden, cleaned: only keys set to true (never a stray value or a prototype name). */
export function cleanHidden(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (v === true && typeof k === 'string' && k && k.length <= MAX_KEY) out[k] = true;
  }
  return out;
}

/** The key one explanation is hidden under: its own, or one made from its title ("How to read the chart" → "how-to-read-the-chart"). */
export function helpKeyFor(explain, own = null) {
  if (typeof own === 'string' && own.trim()) return own.trim().slice(0, MAX_KEY);
  const title = typeof explain?.title === 'string' ? explain.title : '';
  const key = title.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return key ? key.slice(0, MAX_KEY) : null;
}

export const isHelpHidden = (hidden, key) => Boolean(key) && cleanHidden(hidden)[key] === true;
export const withHelpHidden = (hidden, key) => (key ? { ...cleanHidden(hidden), [key]: true } : cleanHidden(hidden));
export function withHelpShown(hidden, key) {
  const next = { ...cleanHidden(hidden) };
  delete next[key];
  return next;
}
export const hiddenHelpCount = (hidden) => Object.keys(cleanHidden(hidden)).length;

/** My Account's line under "Hidden help" (the coach portal's Settings, Look, says the same). */
export function hiddenHelpWords(count) {
  if (!count) return 'Nothing is hidden.';
  return count === 1 ? '1 explanation is hidden.' : `${count} explanations are hidden.`;
}

export const HIDDEN_HELP_TOAST = 'Hidden. My Account, Appearance shows it again.';
export const SHOWN_AGAIN_TOAST = 'Help shows again';
