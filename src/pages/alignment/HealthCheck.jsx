import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import AuthShell from '../../components/auth/AuthShell';
import BigLogo from '../../components/auth/BigLogo';
import { AuthTextField } from '../../components/auth/AuthField';
import { AuthPrimaryButton } from '../../components/auth/AuthButton';
import LegalFooterLinks from '../../components/legal/LegalFooterLinks';
import OnePager from './OnePager';
import AccessCodeInput, { cleanCode } from './AccessCodeInput';
import { Crosshair, Loading, TextBox, PdfChoice, savePdf, PDF_ERROR } from '../../components/design';
import { formatUkDate } from '../../lib/dateFormatter';
import { requestAlignmentEmail } from '../../lib/alignmentEmail';
import { healthCheckPdf } from '../../lib/pdf/docs/healthCheck';
import { openSession, createSaveQueue, readBackup, clearBackup } from '../../lib/alignmentApi';
import { strategicImportance, roundPct } from '../../lib/alignmentScore';
import {
  CONTRIB, PROGRESS, RESOURCE, MAX_FACTORS, MAX_PROJECTS, MAX_OBJECTIVE, MAX_ITEM, RATING_SCREENS,
  blankRow, cleanItems, emptyDraft, draftFromData, dataFromDraft, stepToJson, stepFromJson, clampStep,
  nextStep, prevStep, isStepValid, progressFills, hasMissingAnswers, projectStep, ratingsEntryStep,
} from './alignmentFlow';
import '../../styles/alignment.css';

// The logo mark links here, in a new tab. One constant so it is easy to change.
const CLARITY_PROJECT_URL = 'https://theclarityproject.co.uk';
const PAGE_TITLE = 'Strategic Alignment Health Check';

const HINTS = {
  objective: 'Write your objective to continue',
  factors: 'Add at least one factor',
  projects: 'Add at least one project',
  contrib: 'Rate each factor to continue',
  progress: 'Choose one to continue',
  resource: 'Choose one to continue',
};

const SUBTITLE = {
  contrib: 'How much does this project contribute to your Critical Success Factors?',
  progress: 'How far along is it?',
  resource: 'How much resource will it need to deliver in time, people, money and technology?',
};
const SUB_LABEL = { contrib: 'Contribution', progress: 'Progress', resource: 'Resource required' };

const START = { screen: 'objective', pi: 0, mode: 'full', highlight: [], queue: [] };
const RESULTS = { screen: 'done', pi: 0, mode: 'full', highlight: [], queue: [] };
const STEP_NAMES = ['Objective', 'Critical Success Factors', 'Projects', 'Rate projects'];
const pad = (n) => (n < 10 ? `0${n}` : String(n));
const looksLikeEmail = (v) => /^\S+@\S+\.\S+$/.test(v.trim());
const accessKey = (token) => `alignment-access:${token}`;

function readAccess(token) {
  try {
    const raw = sessionStorage.getItem(accessKey(token));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeAccess(token, creds) {
  try {
    sessionStorage.setItem(accessKey(token), JSON.stringify(creds));
  } catch {
    // sessionStorage may be blocked; the person just enters details again after a refresh
  }
}
function clearAccess(token) {
  try {
    sessionStorage.removeItem(accessKey(token));
  } catch {
    // ignore
  }
}

const BinIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 7h14M10 7V4.5h4V7M7 7l.8 12.5h8.4L17 7M10.5 11v5M13.5 11v5" />
  </svg>
);
const TickIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);

function SaveStatus({ state }) {
  const text = { saving: 'Saving', saved: 'Saved', error: 'Not saved yet, retrying' }[state] || '';
  const cls = state === 'saving' ? ' al-save--busy' : state === 'error' ? ' al-save--error' : '';
  return (
    <span className={`al-save${state !== 'idle' ? ' al-save--on' : ''}${cls}`} role="status" aria-live="polite">
      {state === 'saved' && <TickIcon />}
      <span>{text}</span>
    </span>
  );
}

// One numbered box list, used for both Critical Success Factors and projects.
function NumberedRows({ rows, kind, label, placeholder, max, focusId, onChange, onRemove, onAdd }) {
  const refs = useRef({});
  useEffect(() => {
    if (focusId && refs.current[focusId]) refs.current[focusId].focus();
  }, [focusId]);

  return (
    <>
      {rows.map((row, i) => (
        <div key={row.id} className={`al-row${row.text.trim() ? ' al-row--done' : ''}`}>
          <b>{pad(i + 1)}</b>
          <TextBox
            ref={(el) => { refs.current[row.id] = el; }}
            lines="one"
            value={row.text}
            maxLength={MAX_ITEM}
            placeholder={i === 0 ? placeholder : ''}
            ariaLabel={`${label} ${i + 1}`}
            autoComplete="off"
            onChange={(v) => onChange(row.id, v)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              if (i === rows.length - 1) onAdd(); else refs.current[rows[i + 1].id]?.focus();
            }}
          />
          <button
            type="button"
            className="al-icon"
            aria-label={`Remove ${label} ${i + 1}`}
            disabled={rows.length < 2}
            onClick={() => onRemove(row.id)}
          >
            <BinIcon />
          </button>
        </div>
      ))}
      {rows.length < max && (
        <button type="button" className="al-add" onClick={onAdd} data-kind={kind}>
          <Crosshair size="sm" />
          Add another
        </button>
      )}
    </>
  );
}

export default function HealthCheck() {
  const { token } = useParams();

  // 'boot' while a refresh quietly re-opens the session, then 'welcome' | 'flow'.
  const [phase, setPhase] = useState(() => (readAccess(token) ? 'boot' : 'welcome'));
  const [email, setEmail] = useState(() => readAccess(token)?.email || '');
  const [code, setCode] = useState('');
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState('');
  const [returning] = useState(() => !!readBackup(token) || !!readAccess(token));

  const [draft, setDraft] = useState(emptyDraft);
  const [step, setStep] = useState(START);
  const [saveState, setSaveState] = useState('idle');
  const [notice, setNotice] = useState('');
  const [focusId, setFocusId] = useState(null);

  const draftRef = useRef(draft);
  const stepRef = useRef(step);
  const queueRef = useRef(null);
  const credsRef = useRef(null); // { email, code } of the open session: memory only
  const unsavedRef = useRef(false);
  const bootedRef = useRef(false);
  const reachedRef = useRef(false); // the one-pager has been reached (the session is complete)
  const [resultsReached, setResultsReached] = useState(false);
  const [serverCompletedAt, setServerCompletedAt] = useState(null);
  const [pdf, setPdf] = useState({ busy: false, message: '' });
  const [emailState, setEmailState] = useState({ status: 'idle', sentTo: '' });
  const [pdfMenu, setPdfMenu] = useState(null); // 'footer' | null: the one Download PDF button's choice
  const footerMenuRef = useRef(null);
  const footerButtonRef = useRef(null);
  const notifyRef = useRef(false); // send the completion email after the completing save lands
  const [openedAt, setOpenedAt] = useState(null); // updated_at when the session was opened (date fallback)
  const changedAtRef = useRef(null); // when the answers last changed in this visit (the PDF's "Updated" line)

  // ---- page chrome: title and robots meta for this route only ----
  useEffect(() => {
    const previousTitle = document.title;
    document.title = PAGE_TITLE;
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => {
      document.title = previousTitle;
      meta.remove();
    };
  }, []);

  const applyDraft = (next) => { draftRef.current = next; setDraft(next); };
  const applyStep = (next) => { stepRef.current = next; setStep(next); };

  // ---- saving ----
  const commit = useCallback((draftIn, nextStep, immediate) => {
    let nextDraft = draftIn;
    if (nextStep.screen === 'done' && !nextDraft.completedAt) {
      nextDraft = { ...nextDraft, completedAt: new Date().toISOString() };
      notifyRef.current = true; // first completion: tell Tim and AD once the save is confirmed
    }
    applyDraft(nextDraft);
    applyStep(nextStep);
    setNotice('');
    changedAtRef.current = new Date().toISOString();
    const queue = queueRef.current;
    if (!queue) return;
    unsavedRef.current = true;
    queue.queueSave({
      data: dataFromDraft(nextDraft),
      currentStep: stepToJson(nextStep),
      complete: nextStep.screen === 'done',
    }, { immediate });
  }, []);

  const leaveToWelcome = useCallback((message) => {
    queueRef.current?.destroy();
    queueRef.current = null;
    credsRef.current = null;
    clearAccess(token);
    setCode('');
    setOpenError(message || '');
    setPhase('welcome');
  }, [token]);

  const startFlow = useCallback((session, creds) => {
    queueRef.current?.destroy();
    credsRef.current = creds;
    reachedRef.current = session.status === 'complete';
    setResultsReached(session.status === 'complete');
    setServerCompletedAt(session.completedAt || null);
    setOpenedAt(session.updatedAt || null);
    writeAccess(token, creds);

    // Backup rule: the browser copy is applied only if it holds unsaved changes
    // made against the SAME version the server returned. Otherwise the server
    // copy wins and the backup is cleared.
    const backup = readBackup(token);
    let data = session.data;
    let currentStep = session.currentStep;
    let applyBackup = false;
    if (backup) {
      if (backup.unsaved && backup.version === session.version) {
        applyBackup = true;
        data = backup.data;
        currentStep = backup.currentStep;
      } else if (backup.version !== session.version || !backup.unsaved) {
        clearBackup(token);
      }
    }

    const nextDraft = draftFromData(data);
    const complete = session.status === 'complete' && !applyBackup;
    const nextStep = stepFromJson(currentStep, nextDraft, complete);
    applyDraft(nextDraft);
    applyStep(nextStep);

    const queue = createSaveQueue({ token, email: creds.email, code: creds.code, session });
    queueRef.current = queue;
    queue.on('status', (state, detail) => {
      if (state === 'saved') {
        unsavedRef.current = false;
        if (notifyRef.current && credsRef.current) {
          notifyRef.current = false;
          // The server's once-only rule makes a repeat harmless; failures are not shown.
          requestAlignmentEmail({ token, email: credsRef.current.email, code: credsRef.current.code, kind: 'complete' });
        }
      }
      setSaveState(state);
      if (state === 'error' && detail?.retryable === false) {
        leaveToWelcome(detail.message);
      }
    });
    queue.on('conflict', ({ data: serverData }) => {
      const serverDraft = draftFromData(serverData);
      applyDraft(serverDraft);
      applyStep(clampStep(stepRef.current, serverDraft));
      unsavedRef.current = false;
      // Stays on the current screen (clamped above if it no longer exists).
      setNotice('Your answers were updated in another window.');
    });

    if (applyBackup) {
      unsavedRef.current = true;
      queue.queueSave({
        data: dataFromDraft(nextDraft),
        currentStep: stepToJson(nextStep),
        complete: nextStep.screen === 'done',
      }, { immediate: true });
    }
    setSaveState('idle');
    setPhase('flow');
  }, [token, leaveToWelcome]);

  // ---- opening the session ----
  const open = useCallback(async (nextEmail, nextCode) => {
    setOpening(true);
    setOpenError('');
    const result = await openSession(token, nextEmail.trim(), nextCode);
    setOpening(false);
    if (!result.ok) {
      clearAccess(token);
      setOpenError(result.message);
      setPhase('welcome');
      return;
    }
    startFlow(result.session, { email: nextEmail.trim(), code: nextCode });
  }, [token, startFlow]);

  // A refresh keeps the person in the flow: re-open with the details held in
  // sessionStorage (cleared when the tab closes).
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    const saved = readAccess(token);
    if (saved?.email && saved?.code) open(saved.email, saved.code);
  }, [token, open]);

  const begin = (e) => {
    e?.preventDefault();
    if (opening) return;
    if (!looksLikeEmail(email) || code.length !== 6) return;
    const creds = credsRef.current;
    if (queueRef.current && creds && creds.email === email.trim() && creds.code === code) {
      setPhase('flow'); // Back from Step 1: the session is already open
      return;
    }
    open(email, code);
  };

  // ---- leaving the page ----
  useEffect(() => {
    const flush = () => queueRef.current?.flush();
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    const onBeforeUnload = (e) => {
      if (unsavedRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', onBeforeUnload);
      queueRef.current?.destroy();
    };
  }, []);

  // New screen: open at the top.
  const screenKey = `${phase}-${step.screen}-${step.pi}-${step.mode}`;
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [screenKey]);

  // ---- derived ----
  const factors = useMemo(() => cleanItems(draft.csfs), [draft.csfs]);
  const projects = useMemo(() => cleanItems(draft.projects), [draft.projects]);
  const project = projects[step.pi];
  const ownerRating = (project && draft.ratings[project.id]) || {};
  const valid = isStepValid(step, draft);

  // ---- actions ----
  const setText = (kind, id, value) => {
    const list = kind === 'csf' ? 'csfs' : 'projects';
    commit({ ...draftRef.current, [list]: draftRef.current[list].map((r) => (r.id === id ? { ...r, text: value } : r)) }, stepRef.current, false);
  };
  const addRow = (kind) => {
    const list = kind === 'csf' ? 'csfs' : 'projects';
    const max = kind === 'csf' ? MAX_FACTORS : MAX_PROJECTS;
    if (draftRef.current[list].length >= max) return;
    const row = blankRow();
    setFocusId(row.id);
    commit({ ...draftRef.current, [list]: [...draftRef.current[list], row] }, stepRef.current, true);
  };
  const removeRow = (kind, id) => {
    const list = kind === 'csf' ? 'csfs' : 'projects';
    if (draftRef.current[list].length < 2) return;
    const next = { ...draftRef.current, [list]: draftRef.current[list].filter((r) => r.id !== id) };
    // Removing a factor or project removes its ratings.
    if (kind === 'proj') {
      const { [id]: _gone, ...rest } = next.ratings;
      next.ratings = rest;
    } else {
      const ratings = {};
      Object.keys(next.ratings).forEach((pid) => {
        const { [id]: _g, ...contrib } = next.ratings[pid].contrib || {};
        ratings[pid] = { ...next.ratings[pid], contrib };
      });
      next.ratings = ratings;
    }
    commit(next, stepRef.current, true);
  };
  const rate = (field, value, factorId) => {
    if (!project) return;
    const current = draftRef.current.ratings[project.id] || { contrib: {}, progress: null, resource: null };
    const next = field === 'contrib'
      ? { ...current, contrib: { ...current.contrib, [factorId]: value } }
      : { ...current, [field]: value };
    commit({ ...draftRef.current, ratings: { ...draftRef.current.ratings, [project.id]: next } }, stepRef.current, true);
  };

  // Once the one-pager has been reached, editing works through shortcuts.
  const isEditing = () => reachedRef.current || !!draftRef.current.completedAt;
  const goNext = () => {
    if (!isStepValid(stepRef.current, draftRef.current)) return;
    commit(draftRef.current, nextStep(stepRef.current, draftRef.current, isEditing()), true);
  };
  const goBack = () => {
    const prev = prevStep(stepRef.current, draftRef.current);
    if (prev === null) {
      if (isEditing()) {
        commit(draftRef.current, RESULTS, true);
        return;
      }
      // Back from Step 1 shows the Welcome screen again; the session stays open.
      setPhase('welcome');
      return;
    }
    commit(draftRef.current, prev, true);
  };
  const backToResults = () => {
    if (hasMissingAnswers(draftRef.current)) return;
    commit(draftRef.current, RESULTS, true);
  };
  const editSection = (target) => {
    commit(draftRef.current, { ...START, screen: target }, true);
  };
  const openProject = (id) => {
    const index = cleanItems(draftRef.current.projects).findIndex((p) => p.id === id);
    if (index < 0) return;
    commit(draftRef.current, projectStep(index), true);
  };
  const jumpToStep = (i) => {
    const d = draftRef.current;
    if (i === 3) {
      commit(d, ratingsEntryStep(d, isEditing()), true);
      return;
    }
    commit(d, { ...START, screen: ['objective', 'factors', 'projects'][i] }, true);
  };

  // ---- screens ----
  const onWelcome = phase !== 'flow';
  const onDone = !onWelcome && step.screen === 'done';
  const total = projects.length || 1;

  // One-pager card actions.
  const pdfBusyRef = useRef(false); // a double tap never makes two files
  const handleDownloadPdf = async (variant = 'light') => {
    if (pdfBusyRef.current) return;
    pdfBusyRef.current = true;
    setPdf({ busy: true, message: '' });
    try {
      const done = serverCompletedAt || draftRef.current.completedAt || openedAt || null;
      await savePdf(() => healthCheckPdf({
        draft: draftRef.current,
        completedAt: done,
        updatedAt: changedAtRef.current || openedAt,
        organisation: null, // the client's organisation is not sent to this page yet
      }), variant);
      setPdf({ busy: false, message: '' });
    } catch (error) {
      console.error('[HealthCheck] the PDF was not made:', error);
      setPdf({ busy: false, message: PDF_ERROR });
    } finally {
      pdfBusyRef.current = false;
    }
  };
  const handleEmailLink = async () => {
    const creds = credsRef.current;
    if (!creds || emailState.status === 'sending') return;
    setEmailState({ status: 'sending', sentTo: creds.email });
    const result = await requestAlignmentEmail({ token, email: creds.email, code: creds.code, kind: 'link' });
    setEmailState({
      status: result.ok ? 'sent' : (result.error === 'limit' ? 'limit' : 'error'),
      sentTo: creds.email,
    });
  };
  const handleCreateAccount = () => {
    // Sign-up opens in a new tab with the email filled in. Results stay separate for now.
    const email = credsRef.current?.email || '';
    window.open(`/auth/sign-up?email=${encodeURIComponent(email)}`, '_blank', 'noopener');
  };

  const topBarContent = (
    <div className="al-bar">
      <span className="al-step">
        {onWelcome ? '' : onDone ? 'Complete' : `Step ${{ objective: 1, factors: 2, projects: 3 }[step.screen] || 4} of 4`}
      </span>
      <a
        className="al-mark"
        href={CLARITY_PROJECT_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="The Clarity Project website (opens in a new tab)"
      >
        <BigLogo />
      </a>
      {onWelcome ? <span /> : <SaveStatus state={saveState} />}
    </div>
  );

  let shellProps;
  let body;

  if (phase === 'boot') {
    return (
      <div className="ui-root" style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
        <Loading label="Loading your health check" className="ds-loading--page" />
      </div>
    );
  }

  if (onWelcome) {
    const ready = looksLikeEmail(email) && code.length === 6;
    shellProps = {
      align: 'center',
      headline: returning ? 'Welcome back.' : 'Strategic Alignment Health Check',
      sub: returning
        ? 'Your answers were saved. Enter the same email and access code to carry on where you left off.'
        : 'Check the alignment between what your team is trying to achieve and the work you do every day.',
      columnClassName: 'al-col-welcome',
    };
    body = [
      !returning && <p key="dur" className="al-dur">This will take ~15 minutes.</p>,
      <form key="form" onSubmit={begin} noValidate>
        <AuthTextField
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
        />
        <AccessCodeInput value={code} onChange={(next) => setCode(cleanCode(next))} />
        {openError && <p className="auth-field-error" role="alert" data-testid="open-error">{openError}</p>}
        <AuthPrimaryButton type="submit" disabled={!ready} loading={opening}>
          {returning ? 'Continue' : 'Begin'}
        </AuthPrimaryButton>
      </form>,
      <p key="privacy" className="al-privacy">
        Your answers are stored securely by The Clarity Project and kept for two years after your last visit.
      </p>,
      <div key="legal" className="auth-legal-footer-spacing">
        <LegalFooterLinks align="center" newTab />
      </div>,
    ].filter(Boolean);
  } else if (step.screen === 'objective') {
    shellProps = { align: 'left', headline: 'What is your team trying to achieve?', headlineSize: 'md', columnClassName: 'al-col', letterStaggerMs: 28 };
    body = [
      <div key="o" className="al-body">
        <TextBox
          lines="one"
          value={draft.objective}
          maxLength={MAX_OBJECTIVE}
          placeholder="Type your objective here"
          ariaLabel="Your team’s objective"
          autoFocus
          onChange={(v) => commit({ ...draftRef.current, objective: v }, stepRef.current, false)}
          onKeyDown={(e) => { if (e.key === 'Enter' && valid) { e.preventDefault(); goNext(); } }}
        />
      </div>,
    ];
  } else if (step.screen === 'factors') {
    shellProps = { align: 'left', headline: 'Critical Success Factors', headlineSize: 'md', columnClassName: 'al-col', letterStaggerMs: 28 };
    body = [
      <p key="d" className="al-def">A Critical Success Factor is something that has to be true for your team’s objective to be met.</p>,
      <p key="e" className="al-eg">For example: <i>Customers feel no dip in service.</i></p>,
      <div key="r" className="al-body">
        <p className="auth-field-label">Your Critical Success Factors</p>
        <NumberedRows
          rows={draft.csfs}
          kind="csf"
          label="Critical Success Factor"
          placeholder="What must go right?"
          max={MAX_FACTORS}
          focusId={focusId}
          onChange={(id, v) => setText('csf', id, v)}
          onRemove={(id) => removeRow('csf', id)}
          onAdd={() => addRow('csf')}
        />
      </div>,
    ];
  } else if (step.screen === 'projects') {
    shellProps = {
      align: 'left',
      headline: 'What is your team working on?',
      headlineSize: 'md',
      columnClassName: 'al-col',
      letterStaggerMs: 28,
      sub: 'List every project or line of effort that your team is doing now or has in the pipeline: anything that takes your team’s time, money or people.',
    };
    body = [
      <div key="r" className="al-body">
        <NumberedRows
          rows={draft.projects}
          kind="proj"
          label="Project"
          placeholder="e.g. New CRM roll-out"
          max={MAX_PROJECTS}
          focusId={focusId}
          onChange={(id, v) => setText('proj', id, v)}
          onRemove={(id) => removeRow('proj', id)}
          onAdd={() => addRow('proj')}
        />
        <p className="al-count" aria-live="polite">
          {projects.length ? `${projects.length} project${projects.length === 1 ? '' : 's'}` : ''}
        </p>
      </div>,
    ];
  } else if (RATING_SCREENS.includes(step.screen) && project) {
    const name = project.text;
    shellProps = {
      align: 'left',
      headline: name,
      headlineSize: 'md',
      columnClassName: 'al-col',
      letterStaggerMs: Math.max(4, Math.min(28, Math.floor(1200 / Math.max(name.length, 1)))),
      sub: SUBTITLE[step.screen],
      beforeHeadline: (
        <span className="al-tag">
          {`Project ${step.pi + 1} of ${total} · ${SUB_LABEL[step.screen]}`}
        </span>
      ),
    };
    if (step.screen === 'contrib') {
      const importance = strategicImportance(ownerRating.contrib, factors.map((f) => f.id));
      const revisit = step.mode !== 'full' && step.highlight.length > 0;
      body = [
        ...factors.map((f, i) => {
          const isNew = revisit && step.highlight.includes(f.id);
          const value = ownerRating.contrib?.[f.id];
          return (
            <div key={f.id} className={`al-factor${isNew ? ' al-factor--new' : ''}${revisit && !isNew ? ' al-factor--old' : ''}`}>
              <div className="al-factor-text">
                <b>{pad(i + 1)}</b>
                <span>{f.text}{isNew && <em className="al-new">New</em>}</span>
              </div>
              <div className="al-seg" role="radiogroup" aria-label={f.text}>
                {CONTRIB.map(([n, label]) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={value === n}
                    onClick={() => rate('contrib', n, f.id)}
                  >
                    <b>{n}</b>
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        }),
        <div key="score" className="al-score">
          <div className="al-score-top">
            <span className="al-score-label">Strategic importance</span>
            <span className="al-score-value" data-testid="importance">{roundPct(importance)}%</span>
          </div>
          <div className="al-score-track">
            <span className="al-score-fill" style={{ transform: `scaleX(${importance / 100})` }} />
          </div>
        </div>,
      ];
    } else {
      const field = step.screen;
      const options = field === 'progress' ? PROGRESS : RESOURCE;
      body = [
        <div key="o" className="al-opts al-body" role="radiogroup" aria-label={SUB_LABEL[field]}>
          {options.map(([n, label]) => (
            <button
              key={n}
              type="button"
              role="radio"
              className="al-opt"
              aria-checked={ownerRating[field] === n}
              onClick={() => rate(field, n)}
            >
              <b>{n}</b>
              <span>{label}</span>
            </button>
          ))}
        </div>,
      ];
    }
  } else if (onDone) {
    shellProps = {
      align: 'left',
      headline: 'Strategic Alignment Health Check',
      headlineSize: 'md',
      columnClassName: 'al-col al-col--wide',
      letterStaggerMs: 28,
      headlineAside: (
        <span className="al-opd">
          {formatUkDate(serverCompletedAt || draft.completedAt || openedAt || new Date().toISOString())}
        </span>
      ),
    };
    body = [
      <div key="onepager" className="al-onepager">
        <OnePager
          draft={draft}
          onEmailLink={handleEmailLink}
          onCreateAccount={handleCreateAccount}
          email={emailState}
          onEdit={editSection}
          onOpenProject={openProject}
        />
      </div>,
    ];
  } else {
    // A rating screen with no projects left: send them back to add one.
    shellProps = { align: 'left', headline: 'What is your team working on?', headlineSize: 'md', columnClassName: 'al-col' };
    body = [<p key="n" className="al-note">Add a project first.</p>];
  }

  if (!onWelcome && notice) {
    body = [...body, <p key="notice" className="al-note" role="status">{notice}</p>];
  }

  const fills = onWelcome ? [0, 0, 0, 0] : progressFills(step, draft);
  const editing = resultsReached || !!draft.completedAt;
  const missing = hasMissingAnswers(draft);

  // The four segments are buttons for any step already reached.
  const place = { objective: 0, factors: 1, projects: 2, contrib: 3, progress: 3, resource: 3 }[step.screen];
  const reachable = [
    true,
    draft.objective.trim() !== '',
    draft.objective.trim() !== '' && factors.length > 0,
    draft.objective.trim() !== '' && factors.length > 0 && projects.length > 0,
  ];
  const progressActions = onWelcome || onDone ? undefined : [0, 1, 2, 3].map((i) => (
    i === place || !(editing || reachable[i])
      ? null
      : { label: `Go to Step ${i + 1}, ${STEP_NAMES[i]}`, onClick: () => jumpToStep(i) }
  ));
  const hintText = !valid ? (HINTS[step.screen] || '') : (editing && missing ? 'Rate the new items first' : '');

  const footer = onWelcome ? null : (
    <div className={`al-foot${onDone ? ' al-foot--wide' : ''}`}>
      <div className="al-foot-left">
        <button type="button" className="al-back" onClick={goBack}>← Back</button>
        {editing && !onDone && (
          <button
            type="button"
            className="al-back"
            disabled={missing}
            title={missing ? 'Rate the new items first' : undefined}
            onClick={backToResults}
          >
            Back to results
          </button>
        )}
      </div>
      {onDone ? (
        <div className="ds-pdfmenu ds-pdfmenu--end" ref={footerMenuRef}>
          <AuthPrimaryButton
            ref={footerButtonRef}
            loading={pdf.busy}
            aria-haspopup="dialog"
            aria-expanded={pdfMenu === 'footer'}
            onClick={() => { if (!pdf.busy) setPdfMenu((m) => (m === 'footer' ? null : 'footer')); }}
          >
            Download PDF
          </AuthPrimaryButton>
          <PdfChoice
            open={pdfMenu === 'footer'}
            onClose={() => setPdfMenu(null)}
            onChoose={(v) => handleDownloadPdf(v)}
            containerRef={footerMenuRef}
            returnFocusRef={footerButtonRef}
          />
          {pdf.message && <p className="ds-pdfmessage" role="alert">{pdf.message}</p>}
        </div>
      ) : (
        <div className="al-foot-right">
          <span className={`al-hint${hintText ? ' al-hint--on' : ''}`}>{hintText}</span>
          <AuthPrimaryButton disabled={!valid} onClick={goNext}>Continue</AuthPrimaryButton>
        </div>
      )}
    </div>
  );

  return (
    <AuthShell
      topBarContent={topBarContent}
      progress={fills}
      progressHidden={onWelcome || onDone}
      progressActions={progressActions}
      contentKey={screenKey}
      footer={footer}
      {...shellProps}
    >
      {body}
    </AuthShell>
  );
}
