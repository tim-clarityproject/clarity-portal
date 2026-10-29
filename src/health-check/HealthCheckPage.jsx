import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { openSession, createSaveQueue, readBackup, clearBackup, SAVE_REFUSED } from '../lib/alignmentApi';
import { loadWithReload } from '../lib/loadWithReload';
import { requestAlignmentEmail } from '../lib/alignmentEmail';
import { formatClockTime, formatDocDate, getLocalDateKey, parseDbTimestamp } from '../lib/dateFormatter';
import { projectDates } from '../lib/projectDates';
import {
  MAX_FACTORS, MAX_PROJECTS, MAX_OBJECTIVE, MAX_ITEM,
  blankRow, cleanItems, emptyDraft, draftFromData, dataFromDraft, setProjectDates,
} from '../pages/alignment/alignmentFlow';
import { at, clampStep, isLast, isValid, nextStep, percent, prevStep, stepFromJson, stepToJson, hasGaps } from './flow';
import { CON, CSF_LEVELS, PROG, READING, RES, csfLevel, howItWorks } from './words';
import { m20ImportantLine, m20WithCsfLevel, m20WithImportantLine } from '../lib/scores/m20.js';
import {
  BoldCross, Chev, Choices, CodeBoxes, Dropdown, GrowBox, IconRow, InfoButton, PctBar, Rows, SaveLine, Seg, Sheet, TipProvider, Toast, cleanCode, useIsPhone,
} from './parts';
import Results from './Results';
import { EXAMPLE } from './example';
import { GuideCard, GuidePanel, readWatched } from './QuickGuide';
import { ReadingPanel } from './Reading';

// The outside Strategic Alignment Health Check, built to the approved mock-up
// (M7b version 46). Its answers, saving, backup and emails use the same code
// and database functions as before (src/lib/alignmentApi.js and friends).

const SITE = 'https://theclarityproject.co.uk';
// The coach who sent the link, by first name (alignment_open, from migration
// 034), or "your coach" when the name is empty or not known yet.
const NO_COACH = 'your coach';
const PAGE_TITLE = 'Strategic Alignment Health Check';
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Keeps at most `max` characters (as the database counts them) without
// splitting an emoji or an accented letter in two.
const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('en', { granularity: 'grapheme' }) : null;
function clip(v, max) {
  if (Array.from(v).length <= max) return v;
  const parts = segmenter ? Array.from(segmenter.segment(v), (x) => x.segment) : Array.from(v);
  let out = '';
  for (const g of parts) { if (Array.from(out + g).length > max) break; out += g; }
  return out;
}
const looksLikeEmail = (v) => /^\S+@\S+\.\S+$/.test(v.trim());

const accessKey = (token) => `alignment-access:${token}`;
const lastSavedKey = (token) => `hc-last-saved:${token}`;
const seenKey = (token) => `hc-seen:${token}`;
// The coach's first name from the last time this link opened on this device,
// so the email and code screen can name them on a return visit.
const coachKey = (token) => `hc-coach:${token}`;
const store = {
  get(area, key) { try { return window[area].getItem(key); } catch { return null; } },
  set(area, key, v) { try { window[area].setItem(key, v); } catch { /* storage blocked: nothing kept */ } },
  del(area, key) { try { window[area].removeItem(key); } catch { /* nothing to clear */ } },
};
const readAccess = (token) => { try { return JSON.parse(store.get('sessionStorage', accessKey(token)) || 'null'); } catch { return null; } };

/** "Tue 27 Oct", with the year when it isn't this year. */
function shortDate(value) {
  if (!value) return '';
  const full = formatDocDate(value);
  const year = String(new Date().getFullYear());
  return full.endsWith(` ${year}`) ? full.slice(0, -5) : full;
}

/** The months offered for Started and Due to finish. */
function monthOptions(kind, current) {
  const y = new Date().getFullYear();
  const out = [{ value: '', label: 'Not sure' }];
  const add = (yy, mm) => out.push({ value: `${yy}-${String(mm).padStart(2, '0')}`, label: `${MON[mm - 1]} ${yy}` });
  if (kind === 's') {
    for (let yy = y + 1; yy >= y - 6; yy -= 1) for (let mm = 12; mm >= 1; mm -= 1) add(yy, mm);
  } else {
    out.push({ value: 'open', label: 'Open-ended, with no agreed finish date' });
    for (let yy = y - 1; yy <= y + 4; yy += 1) for (let mm = 1; mm <= 12; mm += 1) add(yy, mm);
  }
  if (current && !out.some((o) => o.value === current)) {
    const [yy, mm] = current.split('-').map(Number);
    out.splice(kind === 'f' ? 2 : 1, 0, { value: current, label: `${MON[mm - 1]} ${yy}` });
  }
  return out;
}

/** The exact date picker: the days of the chosen month. */
function DayPicker({ month, value, onPick, onClear }) {
  const [yy, mm] = month.split('-').map(Number);
  const days = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(yy, mm - 1, 1)).getUTCDay() + 6) % 7; // Monday first
  const chosen = value ? Number(value.slice(8)) : null;
  return (
    <>
      <p>{MON[mm - 1]} {yy}</p>
      <div className="cal">
        <div className="cal-head" aria-hidden="true">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <span key={d}>{d}</span>)}</div>
        <div className="cal-grid">
          {Array.from({ length: lead }, (_, i) => <span key={`l${i}`} />)}
          {Array.from({ length: days }, (_, i) => i + 1).map((d) => (
            <button key={d} type="button" aria-pressed={d === chosen} aria-label={`${d} ${MON[mm - 1]} ${yy}`} onClick={() => onPick(`${month}-${String(d).padStart(2, '0')}`)}>{d}</button>
          ))}
        </div>
      </div>
      <div className="acts2"><button type="button" className="ghost" onClick={onClear}>No exact date</button></div>
    </>
  );
}

function Page() {
  const { token } = useParams();
  const phone = useIsPhone();
  const firstAccess = useMemo(() => readAccess(token), [token]);
  const backup = useMemo(() => readBackup(token), [token]);
  const returning = useMemo(() => !!backup || !!store.get('localStorage', seenKey(token)) || !!firstAccess, [backup, token, firstAccess]);

  const [phase, setPhase] = useState(() => (firstAccess ? 'boot' : returning ? 'signin' : 'welcome'));
  const [ret, setRet] = useState(returning);
  const [email, setEmail] = useState(firstAccess?.email || '');
  const [code, setCode] = useState(firstAccess?.code || '');
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState('');
  const [watched, setWatched] = useState(readWatched);
  const [draft, setDraft] = useState(emptyDraft);
  const [step, setStep] = useState(at('objective'));
  const [reached, setReached] = useState(false);
  const [saveState, setSaveState] = useState('idle');
  const [organisation, setOrganisation] = useState(null);
  const [coachName, setCoachName] = useState(() => store.get('localStorage', coachKey(token)) || null);
  const coach = coachName || NO_COACH;
  const [serverCompletedAt, setServerCompletedAt] = useState(null);
  const [toast, setToast] = useState(null);
  const [panel, setPanel] = useState(null);
  const panelRef = useRef(null);
  const docLinkRef = useRef(null);
  useEffect(() => { panelRef.current = panel; }, [panel]); // 'who' | 'how' | 'guide' | 'exact:s' | 'exact:f' | 'doc:privacy' | 'doc:dataStorage'
  const [sort, setSort] = useState('att');
  const [dateMsg, setDateMsg] = useState({});
  const [pdf, setPdf] = useState({ busy: false, open: false });
  const [linkMail, setLinkMail] = useState({ status: 'idle' });
  const [enterKey, setEnterKey] = useState(0);
  const [focusChoices, setFocusChoices] = useState(false);

  const queueRef = useRef(null);
  const credsRef = useRef(firstAccess);
  const draftRef = useRef(draft);
  const stepRef = useRef(step);
  const notifyRef = useRef(false);
  const completeRef = useRef(false);
  const keyboardRef = useRef(false);
  const toastTimer = useRef(null);
  const undoRef = useRef(null);
  const advanceTimer = useRef(null);

  // ---- page chrome ----
  useEffect(() => {
    const previous = document.title;
    document.title = PAGE_TITLE;
    return () => { document.title = previous; };
  }, []);

  const showToast = useCallback((msg, undo = null) => {
    clearTimeout(toastTimer.current);
    undoRef.current = undo;
    setToast({ msg, undo: !!undo });
    toastTimer.current = setTimeout(() => { undoRef.current = null; setToast(null); }, undo ? 5000 : 2800);
  }, []);

  const go = useCallback((next, { focus = false } = {}) => {
    stepRef.current = next;
    setStep(next);
    setPanel(null);
    setDateMsg({});
    setEnterKey((k) => k + 1);
    setFocusChoices(focus);
    if (!focus) window.scrollTo(0, 0);
  }, []);

  /** Records the answers and the step, and saves them. */
  const commit = useCallback((nextDraft, nextStepValue, immediate = true) => {
    let d = nextDraft;
    if (nextStepValue.screen === 'results' && !d.completedAt) {
      d = { ...d, completedAt: new Date().toISOString() };
      // The first completion tells the coach once the save lands; a Health
      // Check the server already has as complete (an older one, saved
      // without completedAt) never asks again.
      if (!completeRef.current) notifyRef.current = true;
      completeRef.current = true;
    }
    draftRef.current = d;
    setDraft(d);
    queueRef.current?.queueSave({
      data: dataFromDraft(d),
      currentStep: stepToJson(nextStepValue),
      complete: nextStepValue.screen === 'results',
    }, { immediate });
  }, []);

  const moveTo = useCallback((next, opts) => {
    if (next.screen === 'results') setReached(true);
    commit(draftRef.current, next, true);
    go(next, opts);
  }, [commit, go]);

  // ---- opening the Health Check ----
  const leave = useCallback((message) => {
    queueRef.current?.destroy();
    queueRef.current = null;
    credsRef.current = null;
    store.del('sessionStorage', accessKey(token));
    setCode('');
    setOpenError(message || '');
    setRet(true);
    setPhase('signin');
  }, [token]);

  const start = useCallback((session, creds) => {
    queueRef.current?.destroy();
    credsRef.current = creds;
    store.set('sessionStorage', accessKey(token), JSON.stringify(creds));
    store.set('localStorage', seenKey(token), '1');
    if (session.updatedAt) store.set('localStorage', lastSavedKey(token), session.updatedAt);
    completeRef.current = session.status === 'complete';
    setOrganisation(session.organisation || null);
    setCoachName(session.coachName || null);
    if (session.coachName) store.set('localStorage', coachKey(token), session.coachName);
    else store.del('localStorage', coachKey(token));
    setServerCompletedAt(session.completedAt || null);
    // The browser copy is used only if it holds unsaved changes made against
    // the same version the server returned; otherwise the server copy wins.
    const saved = readBackup(token);
    let data = session.data;
    let currentStep = session.currentStep;
    let applyBackup = false;
    if (saved) {
      if (saved.unsaved && saved.version === session.version) {
        applyBackup = true;
        data = saved.data;
        currentStep = saved.currentStep;
      } else {
        clearBackup(token);
      }
    }
    const d = draftFromData(data);
    const complete = session.status === 'complete';
    const s = stepFromJson(currentStep, d, complete && !applyBackup);
    draftRef.current = d;
    setDraft(d);
    setReached(complete || !!d.completedAt);
    go(s);
    const queue = createSaveQueue({ token, email: creds.email, code: creds.code, session });
    queueRef.current = queue;
    queue.on('status', (state, detail) => {
      setSaveState(state);
      if (state === 'saved') store.set('localStorage', lastSavedKey(token), new Date().toISOString());
      if (state === 'saved' && notifyRef.current && credsRef.current) {
        // A conflict is reported straight after 'saved': wait a moment, so it can cancel this.
        setTimeout(() => {
          if (!notifyRef.current || !credsRef.current) return;
          notifyRef.current = false;
          // The server sends it once only, so a repeat does no harm; a failure isn't shown.
          requestAlignmentEmail({ token, email: credsRef.current.email, code: credsRef.current.code, kind: 'complete' });
        }, 0);
      }
      if (state === 'error' && detail?.retryable === false) {
        // Answers the server refuses can never be saved: drop the browser copy,
        // or every reopen would send them again and be refused again.
        if (detail.message === SAVE_REFUSED) clearBackup(token);
        leave(detail.message);
      }
    });
    queue.on('conflict', ({ data: serverData, currentStep: serverStep, status }) => {
      notifyRef.current = false;
      completeRef.current = status === 'complete';
      const sd = draftFromData(serverData);
      draftRef.current = sd;
      setDraft(sd);
      setReached(status === 'complete' || !!sd.completedAt);
      // Results that were never saved aren't shown: go where the server copy is.
      const s2 = stepRef.current.screen === 'results' && status !== 'complete'
        ? stepFromJson(serverStep, sd, false)
        : clampStep(stepRef.current, sd);
      stepRef.current = s2;
      setStep(s2);
      showToast('Your answers were updated in another window.');
    });
    if (applyBackup) queue.queueSave({ data: dataFromDraft(d), currentStep: stepToJson(s), complete: s.screen === 'results' }, { immediate: true });
    setSaveState('idle');
    setPhase('flow');
  }, [token, go, leave, showToast]);

  const open = useCallback(async (e, c) => {
    if (!looksLikeEmail(e) || cleanCode(c).length !== 6) {
      setOpenError('Enter your email and the 6-character access code from your email.');
      return;
    }
    setOpening(true);
    setOpenError('');
    const result = await openSession(token, e.trim(), cleanCode(c));
    setOpening(false);
    if (!result.ok) {
      store.del('sessionStorage', accessKey(token));
      setOpenError(result.message);
      setPhase('signin');
      return;
    }
    start(result.session, { email: e.trim(), code: cleanCode(c) });
  }, [token, start]);

  // A reload in the same tab opens straight away.
  useEffect(() => {
    if (phase === 'boot' && firstAccess) open(firstAccess.email, firstAccess.code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The Download PDF menu closes on Escape and on a click outside it.
  useEffect(() => {
    if (!pdf.open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setPdf((p) => ({ ...p, open: false })); };
    const onDown = (e) => { if (!e.target.closest?.('.pdfm')) setPdf((p) => ({ ...p, open: false })); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown); };
  }, [pdf.open]);

  // Each new screen puts focus on its heading, for keyboards and screen readers
  // (not when choosing by keyboard moves focus to the next choices).
  useEffect(() => {
    if (enterKey === 0) return;
    if (focusChoices) {
      // A keyboard choice moved on: the next screen's choices take focus; one with
      // none (When) gives it to its first drop-down.
      if (!document.querySelector('.hc-main .opts5')) document.querySelector('.hc-main .dd')?.focus({ preventScroll: true });
      return;
    }
    const h = document.querySelector('.hc-main .page h2');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }, [enterKey, focusChoices]);

  // Was the last thing done with the keyboard? (A tap or click also focuses a choice.)
  useEffect(() => {
    const onKey = () => { keyboardRef.current = true; };
    const onPointer = () => { keyboardRef.current = false; };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer, true);
    return () => { document.removeEventListener('keydown', onKey, true); document.removeEventListener('pointerdown', onPointer, true); };
  }, []);

  // Send anything waiting when the page is hidden or closed.
  useEffect(() => {
    const flush = () => queueRef.current?.flush();
    const onVis = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', flush);
      queueRef.current?.destroy();
      clearTimeout(advanceTimer.current);
    };
  }, []);

  // ---- editing the answers ----
  const edit = (d, immediate = false) => commit(d, stepRef.current, immediate);
  const listKey = { csf: 'csfs', projects: 'projects' };
  const changeRow = (kind, id, rawText) => {
    const text = clip(rawText, MAX_ITEM);
    const k = listKey[kind];
    edit({ ...draftRef.current, [k]: draftRef.current[k].map((r) => (r.id === id ? { ...r, text } : r)) });
  };
  const addRow = (kind) => {
    const k = listKey[kind];
    const row = blankRow();
    edit({ ...draftRef.current, [k]: [...draftRef.current[k], row] }, true);
    return row.id;
  };
  const removeRow = (kind, id) => {
    const k = listKey[kind];
    const list = draftRef.current[k];
    const index = list.findIndex((r) => r.id === id);
    const row = list[index];
    edit({ ...draftRef.current, [k]: list.filter((r) => r.id !== id) }, true);
    showToast('Deleted', () => {
      const now = draftRef.current[k];
      const back = [...now.slice(0, index), row, ...now.slice(index)];
      edit({ ...draftRef.current, [k]: back }, true);
    });
  };
  const undo = () => {
    const fn = undoRef.current;
    undoRef.current = null;
    clearTimeout(toastTimer.current);
    setToast(null);
    fn?.();
  };

  const projects = cleanItems(draft.projects);
  const factors = cleanItems(draft.csfs);
  const project = projects[step.pi];
  const rating = (project && draft.ratings[project.id]) || {};
  const setRating = (patch) => {
    const d = draftRef.current;
    const p = cleanItems(d.projects)[stepRef.current.pi];
    if (!p) return d;
    const r = d.ratings[p.id] || {};
    const next = { ...d, ratings: { ...d.ratings, [p.id]: { contrib: { ...(r.contrib || {}) }, progress: r.progress ?? null, resource: r.resource ?? null, ...patch(r) } } };
    commit(next, stepRef.current, true);
    return next;
  };
  const pickContribution = (v) => {
    const f = factors[stepRef.current.fi];
    const fromKeys = keyboardRef.current && !!document.activeElement?.closest?.('.opts5');
    setRating((r) => ({ contrib: { ...(r.contrib || {}), [f.id]: v } }));
    // Choosing one moves on by itself after about a third of a second.
    clearTimeout(advanceTimer.current);
    const here = stepRef.current;
    advanceTimer.current = setTimeout(() => {
      if (stepRef.current !== here || panelRef.current) return; // a panel opened meanwhile: Next moves on
      moveTo(nextStep(here, draftRef.current, reached), { focus: fromKeys });
    }, 320);
  };
  const setDates = (kind, value) => {
    const p = cleanItems(draftRef.current.projects)[stepRef.current.pi];
    const cur = projectDates(p);
    const input = { ...cur };
    if (kind === 's') { input.started = value; if (!value || !cur.startedOn?.startsWith(value)) delete input.startedOn; }
    if (kind === 'f') { input.due = value; if (!value || value === 'open' || !cur.dueOn?.startsWith(value)) delete input.dueOn; }
    if (kind === 'sOn') input.startedOn = value;
    if (kind === 'fOn') input.dueOn = value;
    const res = setProjectDates(draftRef.current, p.id, input);
    if (!res.ok) { setDateMsg({ [res.field === 'startedOn' || res.field === 'started' ? 's' : 'f']: res.message, panel: res.message }); return false; }
    setDateMsg({});
    commit(res.draft, stepRef.current, true);
    return true;
  };

  // ---- results actions ----
  const doPdf = async (variant) => {
    setPdf({ busy: true, open: false });
    try {
      const [{ downloadPdf }, { healthCheckPdf }] = await Promise.all([
        loadWithReload(() => import('../lib/pdf/download')),
        loadWithReload(() => import('../lib/pdf/docs/healthCheck')),
      ]);
      const done = serverCompletedAt || draftRef.current.completedAt || null;
      await downloadPdf(healthCheckPdf({ draft: draftRef.current, completedAt: done, updatedAt: null, organisation }), variant);
    } catch {
      showToast('Your PDF wasn’t made. Check your connection and try again.');
    }
    setPdf({ busy: false, open: false });
  };
  const emailLink = async () => {
    const creds = credsRef.current;
    if (!creds) return;
    setLinkMail({ status: 'sending' });
    const r = await requestAlignmentEmail({ token, email: creds.email, code: creds.code, kind: 'link' });
    setLinkMail({ status: r.ok ? 'sent' : (r.error === 'limit' ? 'limit' : 'error'), to: creds.email });
  };
  const createAccount = () => {
    const e = credsRef.current?.email || '';
    window.open(`/auth/sign-up?email=${encodeURIComponent(e)}`, '_blank', 'noopener');
  };

  // ---- the screens ----
  const head = (q, nudge) => (
    <>
      <PctBar pct={percent(step, draft)} />
      <IconRow coach={coach} style={{ '--i': 1 }} onWho={() => setPanel('who')} onGuide={() => setPanel('guide')} />
      <h2 className="qh rv" style={{ '--i': 1 }}>{q}</h2>
      <p className="nudge rv" style={{ '--i': 1 }}>{nudge}</p>
    </>
  );
  // A question about one project names it, with "Project 4 of 7" small above
  // it and no panel repeating the name (rule 64; Tim, 28 Oct, 14:11).
  const counter = `Project ${step.pi + 1} of ${projects.length}`;
  const projectHead = (before, after, nudge) => (
    <>
      <PctBar pct={percent(step, draft)} />
      <IconRow coach={coach} style={{ '--i': 1 }} onWho={() => setPanel('who')} onGuide={() => setPanel('guide')} />
      <p className="cnt2 rv" style={{ '--i': 1 }}><span>{counter}</span></p>
      <h2 className="qh rv" style={{ '--i': 1 }}>{before}“<bdi>{project?.text}</bdi>”{after}</h2>
      <p className="nudge rv" style={{ '--i': 1 }}>{nudge}</p>
    </>
  );
  const projectLabel = (before, after) => `${before}“${project?.text}”${after} ${counter}.`;

  let body = null;
  let wide = false;
  if (phase === 'welcome') {
    body = (
      <div className="wlc">
        <h2 className="t rv">Strategic Alignment Health Check</h2>
        <p className="lead rv" style={{ '--i': 1 }}>Check whether the work your team does every day matches what it’s trying to achieve.</p>
        <p className="dur rv" style={{ '--i': 1 }}>~15 minutes</p>
        <GuideCard style={{ '--i': 2 }} onWatched={() => setWatched(true)} />
        <button type="button" className={`btn full rv${watched ? '' : ' quiet'}`} style={{ '--i': 3 }} onClick={() => { setRet(false); setPhase('signin'); setEnterKey((k) => k + 1); }}>Begin the Health Check</button>
      </div>
    );
  } else if (phase === 'signin') {
    const savedAt = store.get('localStorage', lastSavedKey(token)) || backup?.savedAt;
    body = (
      <div className="wlc">
        {!ret && <button type="button" className="backl" onClick={() => setPhase('welcome')}><Chev dir="lf" />Back</button>}
        {ret ? (
          <>
            <h2 className="t rv">Welcome back</h2>
            {savedAt && <p className="dur rv" style={{ '--i': 1 }}>Your answers were last saved on {shortDate(savedAt)} at {formatClockTime(parseDbTimestamp(savedAt))}.</p>}
            <p className="nudge rv" style={{ '--i': 1 }}>Enter the same email and access code to pick up where you left off.</p>
          </>
        ) : (
          <>
            <h2 className="qh rv" style={{ marginTop: 8 }}>What’s your email and access code?</h2>
            <p className="nudge rv" style={{ '--i': 1 }}>Find your access code in the email with your link.</p>
          </>
        )}
        <form className="rv" style={{ '--i': 2 }} noValidate onSubmit={(e) => { e.preventDefault(); if (!opening) open(email, code); }}>
          <label className="fl" htmlFor="hc-email">Email</label>
          <input className="inp" id="hc-email" type="email" value={email} placeholder="you@company.com" autoComplete="email" onChange={(e) => setEmail(e.target.value)} />
          <label className="fl" htmlFor="hc-code">Access code</label>
          <CodeBoxes id="hc-code" value={code} onChange={setCode} onEnter={() => !opening && open(email, code)} />
          <p className="privl">Only you and {coach} see your answers.<InfoButton label="How your answers are kept" lines={[{ bold: 'Private and confidential' }, { line: 'Your answers are stored securely.' }, { line: 'They’re kept for 2 years after your last visit.' }]} /></p>
          <p className="privl">It saves as you go, so you can stop and come back.</p>
          {openError && <p className="err" role="alert">{openError}</p>}
          <button type="submit" className="btn full" aria-disabled={opening}>{ret ? 'Pick up where you left off' : 'Start the Health Check'}</button>
        </form>
        <div className="legal rv" style={{ '--i': 6 }}>
          {!ret && <button type="button" onClick={() => { setSort('att'); setPhase('example'); window.scrollTo(0, 0); }}>See an example report</button>}
          {[READING.privacy, READING.dataStorage].map((d) => (
            <a key={d.key} href={d.href} target="_blank" rel="noopener noreferrer" aria-haspopup="dialog" onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // a new tab when asked for one
              e.preventDefault();
              docLinkRef.current = e.currentTarget;
              setPanel(`doc:${d.key}`);
            }}>{d.title}</a>
          ))}
        </div>
      </div>
    );
  } else if (phase === 'example') {
    wide = true;
    body = (
      <>
        <button type="button" className="backl" onClick={() => setPhase('welcome')}><Chev dir="lf" />Back</button>
        <h2 className="t rv">Example report</h2>
        <div className="meta rv" style={{ '--i': 1 }}><span>{EXAMPLE.org}, leadership team</span><span>{EXAMPLE.date}</span></div>
        <div className="exb rv" style={{ '--i': 1 }}>
          <p>Quillmark is an invented software company, to show what you’ll get.</p>
          <p>It’s backed by private equity and is 2 years into a plan to double in size.</p>
          <p>Its leadership team rated 8 projects against 5 Critical Success Factors (CSFs).</p>
        </div>
        <Results draft={EXAMPLE.draft} asOf={EXAMPLE.asOf} theirs phone={phone} sort={sort} onSort={setSort}
          onExampleEdit={() => showToast('The example can’t be changed, so start your own to rate your projects.')} />
        <div className="acts"><button type="button" className="btn" onClick={() => { setPhase('welcome'); window.scrollTo(0, 0); }}>Start my Health Check</button></div>
      </>
    );
  } else if (phase === 'boot') {
    body = <div className="loading" role="status" aria-label="Loading"><span className="spin" aria-hidden="true" /></div>;
  } else if (step.screen === 'objective') {
    body = (
      <>
        {head('What is your team trying to achieve?', 'Write it in one sentence.')}
        <div className="rv" style={{ '--i': 2 }}>
          <GrowBox rows={2} style={{ marginTop: 22 }} aria-label="Objective" placeholder="e.g. Double recurring revenue by 2028"
            value={draft.objective} onChange={(v) => edit({ ...draftRef.current, objective: clip(v.replace(/\n/g, ' '), MAX_OBJECTIVE) })} />
        </div>
      </>
    );
  } else if (step.screen === 'csf') {
    body = (
      <>
        {head('How will you achieve your objective?', 'List the 3 to 6 medium to long-term approaches that are critical for achieving your outcome.')}
        <div className="rv" style={{ '--i': 2 }}>
          <span className="fl">Critical Success Factors (CSFs)<InfoButton label="What is a Critical Success Factor?" lines={[{ bold: 'What is a Critical Success Factor (CSF)?' }, { line: 'It’s one of the few things that must go right for you to reach your objective.' }]} /></span>
          <Rows kind="csf" rows={draft.csfs} placeholder="e.g. Win enterprise customers in the US" label="Critical Success Factor" max={MAX_FACTORS} maxItem={MAX_ITEM}
            addLabel="Add a CSF" onChange={(id, v) => changeRow('csf', id, v)} onAdd={() => addRow('csf')} onRemove={(id) => removeRow('csf', id)} />
        </div>
      </>
    );
  } else if (step.screen === 'weight') {
    // Not every CSF matters equally: each is Critical, Very important or
    // Important, Very important unless changed (Tim, 28 Oct, 14:27). Saved as you go.
    body = (
      <>
        {head('How much does each Critical Success Factor (CSF) matter to your objective?', 'Choose Critical for the one or two that matter most.')}
        <div className="wts rv" style={{ '--i': 2 }}>
          {factors.map((f, i) => (
            <div className="wrow" key={f.id}>
              <p><span className="n" aria-hidden="true">{i + 1}</span><bdi>{f.text}</bdi></p>
              <Seg label={f.text} value={csfLevel(f)} options={CSF_LEVELS.map((l) => ({ value: l.level, label: l.name }))}
                onPick={(level) => edit(m20WithCsfLevel(draftRef.current, f.id, level), true)} />
            </div>
          ))}
        </div>
      </>
    );
  } else if (step.screen === 'projects') {
    body = (
      <>
        <PctBar pct={percent(step, draft)} />
        <IconRow coach={coach} style={{ '--i': 1 }} onWho={() => setPanel('who')} onGuide={() => setPanel('guide')} />
        <h2 className="qh rv" style={{ '--i': 1 }}>What is your team working on?</h2>
        <p className="nudge rv" style={{ '--i': 1 }}>List every project or line of effort, now or in the pipeline.<InfoButton label="What counts as a project" lines={[{ bold: 'Projects' }, { line: 'Include anything that takes your team’s time, money or people.' }]} /></p>
        <div className="rv" style={{ '--i': 2 }}>
          <span className="fl">Projects</span>
          <Rows kind="projects" rows={draft.projects} placeholder="e.g. New CRM roll-out" label="Project" max={MAX_PROJECTS} maxItem={MAX_ITEM}
            addLabel="Add a project" onChange={(id, v) => changeRow('projects', id, v)} onAdd={() => addRow('projects')} onRemove={(id) => removeRow('projects', id)} />
        </div>
      </>
    );
  } else if (step.screen === 'contrib') {
    const f = factors[step.fi];
    body = (
      <>
        {/* The question names the project and the CSF, with small counters above it and no panel (Tim, 27 Oct, 23:35). */}
        <PctBar pct={percent(step, draft)} />
        <IconRow coach={coach} style={{ '--i': 1 }} onWho={() => setPanel('who')} onGuide={() => setPanel('guide')} />
        <p className="cnt2 rv" style={{ '--i': 1 }}><span>Project {step.pi + 1} of {projects.length}</span><span>CSF {step.fi + 1} of {factors.length}</span></p>
        <h2 className="qh rv" style={{ '--i': 1 }}>How much does “<bdi>{project?.text}</bdi>” contribute to “<bdi>{f?.text}</bdi>”?</h2>
        <p className="nudge rv" style={{ '--i': 1 }}>Rate the level of impact.</p>
        <Choices key={`${step.pi}:${step.fi}`} options={CON} value={rating.contrib?.[f?.id]} label={`How much does “${project?.text}” contribute to “${f?.text}”? Project ${step.pi + 1} of ${projects.length}, CSF ${step.fi + 1} of ${factors.length}.`} style={{ '--i': 3 }} focusFirst={focusChoices} onPick={pickContribution} />
      </>
    );
  } else if (step.screen === 'when') {
    const dates = projectDates(project);
    const exact = (kind) => {
      const month = kind === 's' ? dates.started : dates.due;
      const day = kind === 's' ? dates.startedOn : dates.dueOn;
      if (!month || month === 'open') return null;
      return (
        <div className="dto rv" style={{ '--i': 4 }}>
          {day && <span className="exact">{formatDocDate(day).slice(4)}</span>}
          <button type="button" className="text" onClick={() => setPanel(`exact:${kind}`)}>{day ? 'Change the exact date' : 'Add an exact date'}</button>
        </div>
      );
    };
    body = (
      <>
        {projectHead('When did ', ' start, and when is it due to finish?', 'Choose a month for each.')}
        <div className="dts rv" style={{ '--i': 3 }}>
          <div>
            <span className="fl" id="hc-started">Started</span>
            <Dropdown label="Started" title="Started" value={dates.started || ''} options={monthOptions('s', dates.started)} onChange={(v) => setDates('s', v)} />
            {dateMsg.s && <p className="fieldmsg" role="alert">{dateMsg.s}</p>}
            {dates.startedOn && (
              <div className="dto">
                <span className="exact">{formatDocDate(dates.startedOn).slice(4)}</span>
                <button type="button" className="text" onClick={() => setDates('sOn', undefined)}>Remove the exact start date</button>
              </div>
            )}
          </div>
          <div>
            <span className="fl" id="hc-due">Due to finish</span>
            <Dropdown label="Due to finish" title="Due to finish" value={dates.due || ''} options={monthOptions('f', dates.due)} onChange={(v) => setDates('f', v)} />
            {dateMsg.f && <p className="fieldmsg" role="alert">{dateMsg.f}</p>}
          </div>
        </div>
        {/* As the mock-up: one link under the pair, once Due to finish is a month. */}
        {exact('f')}
      </>
    );
  } else if (step.screen === 'progress') {
    body = (
      <>
        {projectHead('How far along is ', '?', 'Choose the one that fits best.')}
        <Choices key={`p${step.pi}`} options={PROG.slice(1)} start={1} value={rating.progress} label={projectLabel('How far along is ', '?')} style={{ '--i': 3 }} focusFirst={focusChoices} onPick={(v) => setRating(() => ({ progress: v }))} />
      </>
    );
  } else if (step.screen === 'resource') {
    body = (
      <>
        {projectHead('How much resource does ', ' need?', 'Consider time, people, money and technology.')}
        <Choices key={`r${step.pi}`} options={RES.slice(1)} start={1} value={rating.resource} label={projectLabel('How much resource does ', ' need?')} style={{ '--i': 3 }} onPick={(v) => setRating(() => ({ resource: v }))} />
      </>
    );
  } else if (step.screen === 'results') {
    wide = true;
    const done = serverCompletedAt || draft.completedAt;
    const todayKey = getLocalDateKey();
    body = (
      <>
        <h2 className="t rv">Strategic Alignment Health Check</h2>
        <div className="meta rv" style={{ '--i': 1 }}>{organisation && <span>{organisation}</span>}{done && <span>{shortDate(done)}</span>}</div>
        <IconRow coach={coach} style={{ '--i': 1 }} onWho={() => setPanel('who')} how={howItWorks(m20ImportantLine(draft))} onGuide={() => setPanel('guide')} />
        {/* The Timing question counts months from the completed date, or today. */}
        <Results draft={draft} asOf={done ? parseDbTimestamp(done) : todayKey} phone={phone} sort={sort} onSort={setSort}
          onLine={(line) => edit(m20WithImportantLine(draftRef.current, line), true)}
          onChange={(screen) => go(at(screen))}
          onEditProject={(id) => {
            const pi = cleanItems(draftRef.current.projects).findIndex((p) => p.id === id);
            if (pi >= 0) moveTo(at('contrib', { pi, fi: 0, mode: 'edit' }));
          }} />
        <div className="sec">
          <div className="sech"><div><h3>Keep your results</h3></div></div>
          <div className="kp">
            <div className="kc">
              <p>We’ll email you a link, so you can find your results again at any time.</p>
              <button type="button" className="ghost" disabled={linkMail.status === 'sending'} onClick={emailLink}>Email my link</button>
              {linkMail.status === 'sent' && <p className="note" role="status">We’ve sent your link to {linkMail.to}.</p>}
              {linkMail.status === 'limit' && <p className="note" role="status">You’ve asked for this a few times already. Try again tomorrow.</p>}
              {linkMail.status === 'error' && <p className="note" role="status">That didn’t send. Check your connection and try again.</p>}
            </div>
            <div className="kc">
              <p>Create a free account to keep all your work in one place, with this Health Check inside it.</p>
              <button type="button" className="ghost" onClick={createAccount}>Create my account</button>
            </div>
          </div>
        </div>
      </>
    );
  }

  const inFlow = phase === 'flow';
  const valid = isValid(step, draft);
  const last = isLast(step, draft, reached);
  const goNext = () => { if (valid) moveTo(nextStep(step, draft, reached)); };
  const goBack = () => {
    clearTimeout(advanceTimer.current);
    const p = prevStep(step, draft);
    if (!p) { queueRef.current?.flush(); setRet(false); setPhase('signin'); window.scrollTo(0, 0); return; }
    moveTo(p);
  };
  const footer = !inFlow ? null : step.screen === 'results' ? (
    <div className="ft">
      <button type="button" className="back" aria-label="Back" onClick={goBack}><Chev dir="lf" />Back</button>
      <div className="pdfm">
        <button type="button" className="btn" aria-haspopup="menu" aria-expanded={pdf.open} disabled={pdf.busy} style={{ width: phone ? '100%' : undefined }}
          onClick={() => setPdf((p) => ({ ...p, open: !p.open }))}>{pdf.busy ? 'Making your PDF' : 'Download PDF'}</button>
        {pdf.open && (
          <div className="pdfopts" role="menu">
            <button type="button" role="menuitem" autoFocus onClick={() => doPdf('light')}>Light, for printing</button>
            <button type="button" role="menuitem" onClick={() => doPdf('dark')}>Dark, for sharing</button>
          </div>
        )}
      </div>
    </div>
  ) : (
    <div className="ft">
      <button type="button" className="back" aria-label="Back" onClick={goBack}><Chev dir="lf" />Back</button>
      <div className="r">
        {reached && !last && <button type="button" className="text" onClick={() => moveTo(hasGaps(draft) ? nextStep(at('projects'), draft, true) : at('results'))}>Back to results</button>}
        <button type="button" className="btn" disabled={!valid} onClick={goNext}>{last ? 'See my results' : 'Next'}</button>
      </div>
    </div>
  );

  const quietBar = phase !== 'flow';
  return (
    <div className="ui-root hc">
      <header className={`obar${phase === 'welcome' || (inFlow && step.screen === 'results') ? ' notn' : ''}${phase === 'welcome' ? ' settle' : ''}`}>
        <span className="tn">Strategic Alignment Health Check</span>
        <a className="mk" href={SITE} target="_blank" rel="noopener noreferrer" aria-label="The Clarity Project website (opens in a new tab)"><BoldCross size={phone ? 24 : 26} /></a>
        <span className="sv">{!quietBar && <SaveLine state={saveState} />}</span>
      </header>
      <main className="hc-main">
        <div key={enterKey} className={`page${wide ? ' wide' : ''} enter`}>{body}</div>
      </main>
      {footer}
      <Toast toast={toast} onUndo={undo} />
      {panel === 'who' && (
        <Sheet title="Who can see this?" onClose={() => setPanel(null)}>
          <div className="wsr"><span>You and {coach}</span></div>
          <p>Your answers are shared with {coach}, who sent you this link.</p>
          <p>Nobody else can see them.</p>
        </Sheet>
      )}
      {panel === 'guide' && <GuidePanel onClose={() => setPanel(null)} />}
      {panel?.startsWith('doc:') && <ReadingPanel doc={READING[panel.slice(4)]} returnFocus={docLinkRef} onClose={() => setPanel(null)} />}
      {panel?.startsWith('exact:') && project && (() => {
        const kind = panel.slice(6);
        const d = projectDates(project);
        const month = kind === 's' ? d.started : d.due;
        if (!month || month === 'open') return null;
        return (
          <Sheet title={kind === 's' ? 'Exact start date' : 'Exact finish date'} onClose={() => setPanel(null)}>
            {dateMsg.panel && <p className="fieldmsg" role="alert">{dateMsg.panel}</p>}
            <DayPicker month={month} value={kind === 's' ? d.startedOn : d.dueOn}
              onPick={(v) => { if (setDates(`${kind}On`, v)) setPanel(null); }}
              onClear={() => { setDates(`${kind}On`, undefined); setPanel(null); }} />
          </Sheet>
        );
      })()}
    </div>
  );
}

export default function HealthCheckPage() {
  return <TipProvider><Page /></TipProvider>;
}
