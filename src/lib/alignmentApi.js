// Strategic Alignment Health Check: data layer (no UI).
//
// Talks to the alignment_open / alignment_save functions in Supabase. The
// respondent has no login, so every call carries the link token, their email
// and the 6-character access code. The access code is held in memory only and
// is never written to localStorage.

import { supabase } from './supabase';

/** Wait times between retries: 1s, 2s, 5s, then every 10s. */
const RETRY_DELAYS_MS = [1000, 2000, 5000, 10000];
/** How long typing must pause before a save is sent. */
const TYPING_DEBOUNCE_MS = 1000;

const GENERIC_ERROR = 'Those details don’t match. Check the email and access code you were sent.';
const NETWORK_ERROR = 'We couldn’t reach the server. Check your connection and try again.';

/**
 * @typedef {Object} AlignmentData
 * @property {string} [objective]
 * @property {{id: string, text: string}[]} [csfs]
 * @property {{id: string, text: string}[]} [projects]
 * @property {Object<string, Object<string, {contrib?: Object<string, number>, progress?: number, resource?: number}>>} [ratings]
 *   Keyed rater -> project id -> ratings. Rater key is "owner" for now.
 */

/**
 * @typedef {Object} AlignmentSession
 * @property {'invited'|'in_progress'|'complete'} status
 * @property {Object|null} currentStep  Screen name and project index, e.g. {screen: 'rate', project: 2}
 * @property {AlignmentData} data
 * @property {number} version
 * @property {string} updatedAt
 */

/**
 * @typedef {'idle'|'saving'|'saved'|'error'} SaveStatus
 */

const backupKey = (token) => `alignment-backup:${token}`;

/**
 * Reads the browser backup copy for a session, or null. Never contains the access code.
 * @param {string} token
 * @returns {{data: AlignmentData, currentStep: Object|null, version: number, savedAt: string, unsaved: boolean}|null}
 */
export function readBackup(token) {
  try {
    const raw = localStorage.getItem(backupKey(token));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeBackup(token, backup) {
  try {
    localStorage.setItem(backupKey(token), JSON.stringify(backup));
  } catch {
    // Storage may be blocked or full; the server copy is the one that matters.
  }
}

/**
 * Removes the browser backup copy for a session.
 * @param {string} token
 */
export function clearBackup(token) {
  try {
    localStorage.removeItem(backupKey(token));
  } catch {
    // ignore
  }
}

function toSession(row) {
  return {
    status: row.status,
    currentStep: row.current_step ?? null,
    data: row.data ?? {},
    version: row.version,
    updatedAt: row.updated_at,
  };
}

/**
 * Checks the link token, email and access code, and loads the session.
 * One generic message is returned whatever part was wrong.
 *
 * @param {string} token  From the link.
 * @param {string} email
 * @param {string} code   6-character access code (kept in memory only).
 * @returns {Promise<{ok: true, session: AlignmentSession} | {ok: false, error: 'invalid'|'locked'|'network', message: string}>}
 */
export async function openSession(token, email, code) {
  try {
    const { data, error } = await supabase.rpc('alignment_open', {
      p_token: token,
      p_email: email,
      p_code: code,
    });
    if (error || !data) {
      return { ok: false, error: 'network', message: NETWORK_ERROR };
    }
    if (!data.ok) {
      return { ok: false, error: data.error || 'invalid', message: data.message || GENERIC_ERROR };
    }
    return { ok: true, session: toSession(data) };
  } catch {
    return { ok: false, error: 'network', message: NETWORK_ERROR };
  }
}

/**
 * Creates the save queue for one open session. Saves are sent one at a time,
 * in order, always with the latest data and the latest known version.
 *
 * Events (subscribe with `on`):
 *  - 'status'   (status: SaveStatus, detail: {message?: string, retryable?: boolean})
 *  - 'conflict' ({data, currentStep, version, updatedAt, status}) the server had a newer
 *               copy; it has been taken and nothing was overwritten.
 *
 * @param {Object} options
 * @param {string} options.token
 * @param {string} options.email
 * @param {string} options.code     Held in memory only.
 * @param {AlignmentSession} options.session  The session returned by openSession.
 * @returns {{
 *   queueSave: (changes: {data?: AlignmentData, currentStep?: Object|null, complete?: boolean}, opts?: {immediate?: boolean}) => void,
 *   on: (event: 'status'|'conflict', fn: Function) => () => void,
 *   getStatus: () => SaveStatus,
 *   getVersion: () => number,
 *   flush: () => void,
 *   destroy: () => void,
 * }}
 */
export function createSaveQueue({ token, email, code, session }) {
  let version = session.version;
  let latest = { data: session.data, currentStep: session.currentStep };
  let wantComplete = false;
  let dirty = false;
  let inFlight = false;
  let status = 'idle';
  let attempt = 0;
  let debounceTimer = null;
  let retryTimer = null;
  let destroyed = false;
  let halted = false; // stopped on an error that retrying cannot fix
  const listeners = { status: new Set(), conflict: new Set() };

  const emit = (event, ...args) => {
    listeners[event].forEach((fn) => {
      try {
        fn(...args);
      } catch {
        // a faulty listener must not break saving
      }
    });
  };

  const setStatus = (next, detail = {}) => {
    status = next;
    emit('status', next, detail);
  };

  const persistBackup = (unsaved) => {
    writeBackup(token, {
      data: latest.data,
      currentStep: latest.currentStep,
      version,
      savedAt: new Date().toISOString(),
      unsaved,
    });
  };

  const clearTimers = () => {
    clearTimeout(debounceTimer);
    clearTimeout(retryTimer);
    debounceTimer = null;
    retryTimer = null;
  };

  async function send() {
    if (destroyed || inFlight || !dirty || halted) return;
    inFlight = true;
    clearTimeout(retryTimer);
    retryTimer = null;
    setStatus('saving');

    // Snapshot exactly what this request carries, so edits made while it is in
    // flight are not marked as saved when it returns.
    const sent = { data: latest.data, currentStep: latest.currentStep, complete: wantComplete };

    let result;
    try {
      const { data, error } = await supabase.rpc('alignment_save', {
        p_token: token,
        p_email: email,
        p_code: code,
        p_data: sent.data,
        p_current_step: sent.currentStep ?? null,
        p_expected_version: version,
        p_complete: sent.complete,
      });
      result = error || !data ? { ok: false, error: 'network' } : data;
    } catch {
      result = { ok: false, error: 'network' };
    }

    inFlight = false;
    if (destroyed) return;

    if (result.ok) {
      version = result.version;
      attempt = 0;
      const changedSince = latest.data !== sent.data || latest.currentStep !== sent.currentStep
        || (wantComplete && !sent.complete);
      if (changedSince) {
        persistBackup(true);
        send();
      } else {
        dirty = false;
        persistBackup(false);
        setStatus('saved');
      }
      return;
    }

    if (result.conflict) {
      // Take the server copy. Do not overwrite it.
      version = result.version;
      latest = { data: result.data ?? {}, currentStep: result.current_step ?? null };
      dirty = false;
      wantComplete = false;
      attempt = 0;
      persistBackup(false);
      setStatus('saved');
      emit('conflict', {
        data: latest.data,
        currentStep: latest.currentStep,
        version,
        updatedAt: result.updated_at,
        status: result.status,
      });
      return;
    }

    if (result.error === 'network') {
      const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
      attempt += 1;
      setStatus('error', { message: 'Not saved yet, retrying', retryable: true });
      retryTimer = setTimeout(send, delay);
      return;
    }

    // invalid / locked / invalid_data: retrying will not help.
    halted = true;
    setStatus('error', { message: result.message || GENERIC_ERROR, retryable: false });
  }

  const handleOnline = () => {
    if (dirty && !inFlight && !halted) {
      attempt = 0;
      send();
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
  }

  return {
    /**
     * Records the latest answers and schedules a save.
     * @param {{data?: AlignmentData, currentStep?: Object|null, complete?: boolean}} changes
     *   `data` is the FULL answers object (the screens keep one shared copy).
     *   Always pass a new object, not a mutated one, so edits made during a save are noticed.
     * @param {{immediate?: boolean}} [opts] immediate: true for rating taps and Continue;
     *   false/omitted for typing, which waits about 1 second after the last keystroke.
     */
    queueSave(changes, { immediate = false } = {}) {
      if (destroyed) return;
      if (changes.data !== undefined) latest = { ...latest, data: changes.data };
      if (changes.currentStep !== undefined) latest = { ...latest, currentStep: changes.currentStep };
      if (changes.complete) wantComplete = true;
      dirty = true;
      halted = false;
      persistBackup(true);

      clearTimeout(debounceTimer);
      if (immediate) {
        debounceTimer = null;
        if (!inFlight) {
          clearTimeout(retryTimer);
          retryTimer = null;
          send();
        }
        // If a save is in flight, the follow-up send happens when it returns.
      } else {
        debounceTimer = setTimeout(send, TYPING_DEBOUNCE_MS);
      }
    },

    /**
     * Subscribes to 'status' or 'conflict'. Returns an unsubscribe function.
     * @param {'status'|'conflict'} event
     * @param {Function} fn
     */
    on(event, fn) {
      listeners[event].add(fn);
      return () => listeners[event].delete(fn);
    },

    /** @returns {SaveStatus} */
    getStatus: () => status,

    /** @returns {number} The last version the server confirmed. */
    getVersion: () => version,

    /** Sends any waiting changes now (for example when leaving the page). */
    flush() {
      clearTimeout(debounceTimer);
      debounceTimer = null;
      send();
    },

    /** Stops timers and listeners. Call when the page unmounts. */
    destroy() {
      destroyed = true;
      clearTimers();
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
      }
      listeners.status.clear();
      listeners.conflict.clear();
    },
  };
}
