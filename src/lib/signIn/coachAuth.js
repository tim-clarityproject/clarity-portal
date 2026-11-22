// The coach authenticator's rules and words (Phase 6a run 5; M26 seq 7,
// "Coach authenticator (18 Nov)", from "Coach sign in, authenticator code"
// to "Tim resets an associate's authenticator"; the run's prompt wins over
// M26). Pure functions only: no page works out a count line, a date's words,
// a code's shape or a wait for itself. The data calls are in
// coachAuthData.js; the database's own rules are migration 053.
//
// Supabase's own TOTP factor does the 6-digit codes. Recovery codes and the
// owner's reset are ours. Clients never see any of this.
//
// "6-digit" is written with a plain hyphen: neither font has the
// non-breaking one, so a screen keeps it whole with `.si-nowrap`, as
// CoachCode.jsx does.
import { formatDocDate, formatFileDate, formatClockTime } from '../dateFormatter';
import { CODE_SIX_DIGITS, DIDNT_SIGN_IN, DIDNT_SAVE } from './words';

/** Codes in a set. */
export const RECOVERY_CODE_COUNT = 10;
/** The 32 characters a recovery code is made of (053's alphabet): no i, l, o or 1, so none is read as another. */
export const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz023456789';
/** Wrong codes in a row before the wait. */
export const WRONG_IN_A_ROW = 5;
/** The wait after them, in seconds. */
export const WAIT_SECONDS = 30;
/** At this many recovery codes or fewer, the coach is told once after signing in. */
export const LOW_CODES = 2;

// ---------------------------------------------------------------- words

/** Where each app is got (M26's links, as drawn). Each is its own 44px row. */
export const AUTHENTICATOR_APPS = [
  { name: 'Google Authenticator', href: 'https://support.google.com/accounts/answer/1066447' },
  { name: 'Microsoft Authenticator', href: 'https://www.microsoft.com/en-gb/security/mobile-authenticator-app' },
  { name: '1Password', href: 'https://1password.com/' },
];

/**
 * Every word the screens use, exactly as M26 has them (and the prompt where
 * it adds to M26). Words M26 doesn't draw are marked "Claude's".
 */
export const COACH_AUTH_WORDS = {
  code: {
    title: 'Enter your code',
    lines: ['Open your authenticator app for the 6-digit code.', 'You’re only asked on a new phone or computer.'],
    label: 'Code',
    button: 'Sign in',
    lost: 'Lost your authenticator app?',
  },
  setUp: {
    title: 'Set up your authenticator',
    lines: ['Coach accounts use a 6-digit code as well as your password.', 'You only need it when you sign in on a new phone or computer. After that, you stay signed in.'],
    stepApp: 'Open an authenticator app on your phone. No app yet? Any of these works:',
    apps: AUTHENTICATOR_APPS,
    stepScan: 'Scan this code with it.',
    qrLabel: 'QR code for your authenticator app',
    cantScan: 'Can’t scan it? Type this key instead:',
    copyKey: 'Copy the key',
    label: 'Code',
    button: 'Turn it on',
  },
  codes: {
    title: 'Save your recovery codes',
    lines: ['If you lose your phone, you can’t get your 6-digit code.', 'Each of these codes gets you in once instead. Save them in your password manager, or print them, and keep them away from your phone.'],
    download: 'Download',
    copyCodes: 'Copy the codes',
    listLabel: 'Your recovery codes', // Claude's: the list's name for screen readers
    tick: 'I’ve saved them somewhere safe.',
    tickLabel: 'I’ve saved them somewhere safe',
    button: 'Open the coach portal', // unavailable until ticked: the prompt says so
    back: 'Back',
  },
  lost: {
    title: 'Lost your authenticator app?',
    line: 'Use one of your recovery codes instead.',
    label: 'Recovery code',
    button: 'Sign in',
    back: 'Back',
  },
  in: {
    title: 'You’re in',
    setUpLine: 'Set up your authenticator on your new phone, so your next sign-in is quick.',
    // Claude's (run 7): a recovery code ends every other sign-in, because the lost phone may be in someone else's hands.
    othersEnded: 'Your other sign-ins have ended.',
    button: 'Set it up',
  },
  security: {
    title: 'Sign-in security',
    back: 'My Account',
    link: 'Sign-in security', // Claude's: My Account's row that opens it
    linkButton: 'Edit my sign-in security', // Claude's: that row's link (rule 29am: Edit)
    app: 'Authenticator app',
    newPhone: 'Set up on a new phone',
    codes: 'Recovery codes',
    makeNew: 'Make new codes',
    makeNewNote: 'Making new codes stops the old ones working.',
    // Claude's: "needs a current 6-digit code first" (the prompt), not drawn in M26.
    currentCodeTitle: 'Enter your code',
    currentCodeLine: 'Type the 6-digit code from your authenticator app to carry on.',
    notOnYet: 'Not set up yet', // Claude's
    codesNotYet: 'Recovery codes come with the next update.', // Claude's: before 053 runs
    currentCodeButton: 'Carry on', // Claude's: the current-code step's one button
    newPhoneSaved: 'Your authenticator is on your new phone.', // Claude's: back on Sign-in security
    codesSaved: 'Your new recovery codes are in force.', // Claude's: back on Sign-in security
  },
  // Claude's: the 2-or-fewer line after a sign-in with the 6-digit code
  // shows once on You're in, with this one button.
  low: { title: 'You’re in', button: 'Open the coach portal' },
  // One calm line for each screen with no connection (needsConnection's subject).
  offline: {
    code: 'Signing in',
    setUp: 'Setting up your authenticator',
    codes: 'Making your recovery codes',
    lost: 'Signing in',
    security: 'Sign-in security',
    reset: 'Resetting an authenticator',
  },
  reset: {
    menu: 'Reset authenticator',
    back: 'Coaches',
    button: 'Reset it',
    keep: 'Keep it',
  },
  copied: 'Copied.',
};

// Messages: what happened, then what to do, one per line. None says which
// part was wrong, or whether a recovery code was once real and is used.
/** A wrong 6-digit code (the prompt's words). */
export const CODE_DIDNT_WORK = ['That code didn’t work.', 'Check the time on your phone and try again.'];
/** A wrong or already used recovery code: the same words either way (Claude's). */
export const RECOVERY_DIDNT_WORK = ['That recovery code didn’t work.', 'Check it and try again, or use another one.'];
/** Nothing typed, or not 6 digits. */
export const TYPE_SIX_DIGITS = CODE_SIX_DIGITS;
/** Nothing that could be a recovery code typed (Claude's). */
export const TYPE_RECOVERY_CODE = 'Type one of your recovery codes to carry on.';
/** No connection, or the database didn't answer. */
export const SIGN_IN_DIDNT_GO = DIDNT_SIGN_IN;
export const SAVE_DIDNT_GO = DIDNT_SAVE;
/** Supabase didn't start the set-up (Claude's): what happened, then what to do. */
export const SET_UP_DIDNT_START = ['Your authenticator couldn’t be set up just now.', 'Reload the page and try again.'];
/** The codes couldn't be made (Claude's). */
export const CODES_DIDNT_MAKE = ['Your recovery codes couldn’t be made just now.', 'Reload the page and try again.'];
/** The copy icon couldn't reach the clipboard (Claude's). */
export const COPY_DIDNT_GO = 'That didn’t copy. Select it and copy it yourself.';
/** The codes on this page were replaced by newer ones made in another tab (Claude's; the break-it tester, 21 Nov). */
export const CODES_REPLACED = ['These codes stopped working, because newer ones were made in another window.', 'Reload this page for a new set, and save that one.'];
/** A sign-in from before the owner's reset (Claude's): shown on Coach sign in. */
export const SIGNED_OUT_BY_RESET = ['You’ve been signed out, because your authenticator was reset.', 'Sign in again to set it up.'];
/** A sign-in ended because a recovery code was used on another one (Claude's, run 7): shown on Coach sign in. */
export const SIGNED_OUT_BY_RECOVERY = ['You’ve been signed out, because one of your recovery codes was used to sign in elsewhere.', 'Sign in again to carry on.'];
/** Why Coach sign in says a sign-in was ended: coach_auth_state's ended_by ('recovery', else the reset's words). */
export function signedOutWords(endedBy) {
  return endedBy === 'recovery' ? SIGNED_OUT_BY_RECOVERY : SIGNED_OUT_BY_RESET;
}
/** The codes couldn't be made because 053 isn't there yet (Claude's). */
export const CODES_NOT_YET = ['Recovery codes aren’t ready yet.', 'You can still sign in with your authenticator app.'];

// ---------------------------------------------------------------- counts

/** "You have 9 left.", "You have 1 left.", "You have none left." */
export function youHaveLeft(left) {
  const n = Math.max(0, Math.floor(Number(left) || 0));
  if (n === 0) return 'You have none left.';
  return `You have ${n} left.`;
}

/** You're in: "That recovery code is now used. You have 9 left." */
export function usedCodeLine(left) {
  return `That recovery code is now used. ${youHaveLeft(left)}`;
}

/**
 * The line after You're in's own, when the codes are running out (Claude's):
 * "Then make new codes in My Account, under Sign-in security." Null with
 * more than 2 left.
 */
export function makeNewCodesLine(left) {
  return Number(left) <= LOW_CODES ? 'Then make new codes in My Account, under Sign-in security.' : null;
}

/**
 * The 2-or-fewer line, shown once after a sign-in with the 6-digit code
 * (the prompt's "the same line", reworded for a sign-in that used no
 * recovery code): "You have 2 recovery codes left. Make new codes in My
 * Account, under Sign-in security." Null with more than 2 left.
 */
export function lowCodesLine(left) {
  const n = Math.max(0, Math.floor(Number(left) || 0));
  if (n > LOW_CODES) return null;
  const count = n === 0 ? 'You have no recovery codes left.' : `You have ${n} recovery code${n === 1 ? '' : 's'} left.`;
  return `${count} Make new codes in My Account, under Sign-in security.`;
}

/** My Account: "9 of 10 left"; "None left" at 0. */
export function codesLeftSummary(left, total = RECOVERY_CODE_COUNT) {
  const n = Math.max(0, Math.floor(Number(left) || 0));
  if (n === 0) return 'None left';
  return `${n} of ${Math.max(n, Number(total) || RECOVERY_CODE_COUNT)} left`;
}

/**
 * Whether to show the 2-or-fewer line now: once after each sign-in (the
 * sign-in's own session id), only once 053 is there, only for a coach with
 * a set of codes, and only at 2 or fewer.
 * @param {{ ready: boolean, made: boolean, left: number, sessionKey: string, toldFor: string|null }} p
 */
export function shouldTellLowCodes({ ready, made, left, sessionKey, toldFor }) {
  return Boolean(ready && made && sessionKey) && Number(left) <= LOW_CODES && toldFor !== sessionKey;
}

const TOLD_KEY = 'clarity-coach-low-codes-told';
/** The sign-in the 2-or-fewer line was last shown for, on this device. */
export function lowCodesToldFor(storage = globalThis.localStorage) {
  try { return storage?.getItem(TOLD_KEY) || null; } catch { return null; }
}
/** Notes that the 2-or-fewer line has been shown for this sign-in. */
export function noteLowCodesTold(sessionKey, storage = globalThis.localStorage) {
  try { storage?.setItem(TOLD_KEY, String(sessionKey)); } catch { /* shown again next time: harmless */ }
}

// ---------------------------------------------------------------- dates

/**
 * "On since Wed 2 Dec", through the portal's date words, with the year only
 * when it isn't this year ("On since Fri 2 Oct 2025"). Empty with no date.
 */
export function onSinceLine(turnedOnAt, today = new Date()) {
  const words = formatDocDate(turnedOnAt);
  if (!words) return '';
  const year = String(today.getFullYear());
  return `On since ${words.endsWith(` ${year}`) ? words.slice(0, -(year.length + 1)) : words}`;
}

// ---------------------------------------------------------------- the set-up key

/** The key as typed into an app: capitals, no spaces. */
export function plainKey(secret) {
  return String(secret ?? '').replace(/[\s-]+/g, '').toUpperCase();
}

/** The key in groups of four, as M26 shows it: "JBSW Y3DP EHPK 3PXP". */
export function keyInGroups(secret) {
  return (plainKey(secret).match(/.{1,4}/g) || []).join(' ');
}

// ---------------------------------------------------------------- recovery codes

const NOT_CODE = new RegExp(`[^${CODE_ALPHABET}]`);

/**
 * A typed recovery code as 053 reads it: whatever case, with or without
 * spaces, dashes (any kind) or full-width letters, "o" read as the zero it
 * must be. Returns the 8 characters, or '' when it can't be a code.
 */
export function readRecoveryCode(typed) {
  const plain = String(typed ?? '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/o/g, '0');
  return plain.length === 8 && !NOT_CODE.test(plain) ? plain : '';
}

/** A code as it is shown: "k7q2-9fmd". */
export function showRecoveryCode(code) {
  const plain = String(code ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return plain.length === 8 ? `${plain.slice(0, 4)}-${plain.slice(4)}` : plain;
}

/** The ten codes in two columns, first column first (M26: 1 to 5, then 6 to 10). */
export function codesInColumns(codes) {
  const list = (codes || []).map(showRecoveryCode);
  const half = Math.ceil(list.length / 2);
  return [list.slice(0, half), list.slice(half)];
}

/** The copied text: one code a line. */
export function codesForCopy(codes) {
  return (codes || []).map(showRecoveryCode).join('\n');
}

/** The downloaded file's name, in words: "The Clarity Portal recovery codes, 21 Nov 2026.txt". */
export function codesFileName(date = new Date()) {
  return `The Clarity Portal recovery codes, ${formatFileDate(date)}.txt`;
}

/** The downloaded file's text: what they are, when they were made, and the codes. Full sentences, no email address. */
export function codesFileText(codes, date = new Date()) {
  return [
    'The Clarity Portal: your recovery codes',
    '',
    `These were made on ${formatDocDate(date)} at ${formatClockTime(date)}.`,
    'If you lose your phone, each code gets you in once instead of your 6-digit code.',
    'Keep them somewhere safe, away from your phone.',
    'Making new codes in My Account, under Sign-in security, stops these working.',
    '',
    ...(codes || []).map((code, i) => `${String(i + 1).padStart(2, ' ')}. ${showRecoveryCode(code)}`),
    '',
  ].join('\n');
}

// ---------------------------------------------------------------- wrong codes in a row

/** A fresh count. */
export const NO_WRONG_TRIES = Object.freeze({ tries: 0, waitUntil: 0 });

/**
 * After a wrong code: one more in the row, and at the 5th the 30 seconds'
 * wait starts (the count starts again after it).
 * @param {{ tries: number, waitUntil: number }} state
 * @param {number} now milliseconds
 */
export function afterWrongCode(state = NO_WRONG_TRIES, now = Date.now()) {
  const tries = (state?.tries || 0) + 1;
  if (tries >= WRONG_IN_A_ROW) return { tries: 0, waitUntil: now + WAIT_SECONDS * 1000 };
  return { tries, waitUntil: state?.waitUntil || 0 };
}

/** Whole seconds still to wait, 0 when none. */
export function waitSecondsLeft(state, now = Date.now()) {
  const left = (state?.waitUntil || 0) - now;
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

/**
 * The calm wait words (Claude's). `justNow`: the 5th wrong code was this
 * one. ["That was 5 wrong codes in a row.", "Wait 30 seconds, then try again."]
 */
export function waitWords(seconds, { justNow = false } = {}) {
  const n = Math.max(1, Math.ceil(Number(seconds) || 0));
  const wait = `Wait ${n} second${n === 1 ? '' : 's'}, then try again.`;
  return justNow ? [`That was ${WRONG_IN_A_ROW} wrong codes in a row.`, wait] : [wait];
}

const TRIES_KEY = 'clarity-sign-in-code-tries';
/**
 * The wrong 6-digit codes in a row on this device: a reload or a new tab
 * doesn't start the count again (the break-it tester, 21 Nov: it was kept
 * per tab, so a second tab skipped the wait). Sign out clears it. The
 * 6-digit code is Supabase's to check, so Supabase's own limit is behind it.
 */
export function readTries(storage = globalThis.localStorage) {
  try {
    const kept = JSON.parse(storage?.getItem(TRIES_KEY) || 'null');
    return kept && Number.isFinite(kept.tries) && Number.isFinite(kept.waitUntil) ? kept : NO_WRONG_TRIES;
  } catch {
    return NO_WRONG_TRIES;
  }
}
/** Keeps the count (NO_WRONG_TRIES after a right code). */
export function keepTries(state, storage = globalThis.localStorage) {
  try {
    if (!state || (!state.tries && !state.waitUntil)) storage?.removeItem(TRIES_KEY);
    else storage?.setItem(TRIES_KEY, JSON.stringify({ tries: state.tries, waitUntil: state.waitUntil }));
  } catch { /* the count starts again: Supabase still limits tries */ }
}

// ---------------------------------------------------------------- the owner

/**
 * "Lost your codes too?" from the data, never a written-in name:
 *   an associate: "Lost your codes too? Ask Tim to reset your authenticator. Tim checks it’s you on a video call first."
 *   no name known (before 053): the owner, unnamed (Claude's).
 *   the owner themself: their way back (Claude's, from M26's note).
 */
export function lostCodesLine({ ownerFirstName, isOwner = false } = {}) {
  if (isOwner) return 'Lost your codes too? Use the second phone you set up in Sign-in security.';
  const name = String(ownerFirstName ?? '').trim();
  if (!name) return 'Lost your codes too? Ask the owner of The Clarity Project to reset your authenticator. They check it’s you on a video call first.';
  return `Lost your codes too? Ask ${name} to reset your authenticator. ${name} checks it’s you on a video call first.`;
}

/** "Maya’s" (always ’s, as UK style has it for a name ending in s too: "James’s"). */
export const possessive = (name) => `${String(name ?? '').trim()}’s`;

/** The owner's reset panel: its title and M26's two lines (they and them). */
export function resetWords(firstName) {
  const name = String(firstName ?? '').trim();
  return {
    title: `Reset ${possessive(name)} authenticator?`,
    lines: [`Only do this after a video call with ${name}, to check it’s them.`, 'Their next sign-in asks them to set it up again, and their old recovery codes stop working.'],
    button: COACH_AUTH_WORDS.reset.button,
    keep: COACH_AUTH_WORDS.reset.keep,
    // Claude's. No Undo: a reset can't be put back (the factor is gone); the panel asks first.
    done: `${possessive(name)} authenticator is reset.`,
  };
}

// ---------------------------------------------------------------- where a coach must stop

/** Proposed addresses for the screens (builder B wires them into SIGN_IN_PATHS). */
export const COACH_AUTH_PATHS = {
  code: '/coach/sign-in/code',
  setUp: '/coach/sign-in/set-up',
  codes: '/coach/sign-in/recovery-codes',
  lost: '/coach/sign-in/help',
  in: '/coach/sign-in/in',
  security: '/my-account/sign-in-security',
};

/**
 * The stop a coach owes before the coach portal opens, or null. This
 * replaces the rule that a coach with no authenticator gets in after the
 * password.
 *   'signedOut' a sign-in from before the owner's reset: sign out here.
 *   'code'      an authenticator, and this sign-in hasn't given its code.
 *   'setup'     no authenticator yet (a new coach, after a reset, or after
 *               a recovery code removed the lost phone's).
 *   'codes'     the authenticator is on, 053 is there, and the codes in
 *               force haven't been ticked as saved (typing the coach
 *               portal's address doesn't skip it).
 * Not a coach, or nothing could be told (offline): null, and the older rule
 * (signInStop) still asks for the code where there is an authenticator.
 * @param {{ isCoach: boolean|null, hasFactor: boolean, level: string|null, ready: boolean, codesSaved: boolean, sessionOk: boolean }} s
 */
export function coachAuthStop({ isCoach, hasFactor, level, ready, codesSaved, sessionOk = true }) {
  if (isCoach !== true) return null;
  if (ready && sessionOk === false) return 'signedOut';
  if (hasFactor && level !== 'aal2') return 'code';
  if (!hasFactor) return 'setup';
  if (ready && !codesSaved) return 'codes';
  return null;
}

/** True for an address in the coach portal (never its sign-in pages, which aren't behind the stop). */
export function isCoachPlace(path) {
  const p = String(path || '');
  return /^\/coach(\/|$|\?|#)/.test(p) && !/^\/coach\/sign-in(\/|$|\?|#)/.test(p);
}

/** The sign-in's own session id, from its access token (the low-codes line is shown once per sign-in). */
export function sessionKeyOf(accessToken) {
  try {
    const part = String(accessToken || '').split('.')[1] || '';
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    return json.session_id || null;
  } catch {
    return null;
  }
}

/** The address for a stop. */
export function coachStopPath(stop) {
  return { code: COACH_AUTH_PATHS.code, setup: COACH_AUTH_PATHS.setUp, codes: COACH_AUTH_PATHS.codes, signedOut: '/coach/sign-in' }[stop] || null;
}
