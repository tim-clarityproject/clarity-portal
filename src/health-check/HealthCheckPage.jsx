import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { openSession, createSaveQueue, readBackup, clearBackup, setSharing, SAVE_REFUSED } from '../lib/alignmentApi';
import { keepChoice, keptChoice, mayTellCoach, openingChoice, saveChoice, sendKeptChoice } from '../lib/guest/sharing';
import { loadWithReload } from '../lib/loadWithReload';
import { requestAlignmentEmail } from '../lib/alignmentEmail';
import { formatDocDate, getLocalDateKey, parseDbTimestamp } from '../lib/dateFormatter';
import { emptyDraft, draftFromData, dataFromDraft } from '../pages/alignment/alignmentFlow';
import { at, clampStep, stepFromJson, stepToJson } from './flow';
import { READING } from './words';
import { Button } from '../components/design/Button';
import ButtonNote from '../components/design/ButtonNote';
import { CalmCard, GuestFrame, GuestMark, GuestTitle } from '../components/design/GuestPage';
import PdfPanel from '../components/design/PdfPanel';
import { ResultsSection } from '../components/design/Results';
import { ErrorMessage, Loading } from '../components/design/Status';
import { SentenceInfo } from '../components/design/TermInfo';
import TextField from '../components/design/TextField';
import { useToast } from '../components/design/toastContext';
import { BackLink, ExampleReport, GuideCard, GuidePanel, HealthCheckEye, HealthCheckTool, readWatched } from '../pages/healthCheck';
import { ReadingPanel } from './Reading';

// The outside Strategic Alignment Health Check, built to the approved mock-up
// (M7b version 51, read in full with its notes) from the portal's shared
// parts: the guest frame (the bold crosshair alone, centred) for the
// welcome, the email and code screen and the example report, and the shared
// Health Check tool (src/pages/healthCheck) for the guided screens and the
// results. Its answers, saving, backup and emails use the same code and
// database functions as before (src/lib/alignmentApi.js and friends).

const SITE = 'https://theclarityproject.co.uk';
const SITE_LABEL = 'The Clarity Project website, opens in a new tab';
const PAGE_TITLE = 'Strategic Alignment Health Check';
const looksLikeEmail = (v) => /^\S+@\S+\.\S+$/.test(v.trim());
/** The access code as typed: letters and digits only, in capitals, 6 at most. */
const cleanCode = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

const accessKey = (token) => `alignment-access:${token}`;
const lastSavedKey = (token) => `hc-last-saved:${token}`;
const seenKey = (token) => `hc-seen:${token}`;
// The guest's choice of who sees the answers, kept for this visit (src/lib/guest/sharing.js).
const shareId = (token) => `hc:${token}`;
// Kept on this device (not only this tab), so the link opened again in a new
// tab still knows Only you was chosen and never asks for the coach's email
// (the break-it tester, 15 Nov). Only the choice is kept, never the answers.
const shareStore = () => { try { return window.localStorage; } catch { return null; } };
// The coach's first name from the last time this link opened on this device,
// so the email and code screen can name them on a return visit. A new name
// from 036 on: before it, an older link was named from 034 although its
// answers go to the owner list, so a name kept then is never read.
const coachKey = (token) => `hc-coach-036:${token}`;
const store = {
  get(area, key) { try { return window[area].getItem(key); } catch { return null; } },
  set(area, key, v) { try { window[area].setItem(key, v); } catch { /* storage blocked: nothing kept */ } },
  del(area, key) { try { window[area].removeItem(key); } catch { /* nothing to clear */ } },
};
/**
 * Sends whatever waits and resolves how it went: 'saved' (nothing waits),
 * 'waiting' (kept on the device, sent again by the queue) or 'refused'.
 * Gives up waiting after 15 seconds, as 'waiting'.
 */
function settledSave(queue) {
  if (!queue) return Promise.resolve('saved');
  return new Promise((resolve) => {
    let off = () => {};
    let timer = null;
    const end = (outcome) => { off(); clearTimeout(timer); resolve(outcome); };
    const read = (status, detail = {}) => {
      if (status === 'saving') return false;
      if (status === 'error') end(detail.retryable === false ? 'refused' : 'waiting');
      else end('saved');
      return true;
    };
    off = queue.on('status', (status, detail) => { read(status, detail); });
    timer = setTimeout(() => end('waiting'), 15000);
    queue.flush();
    // Nothing waited: no status follows the flush.
    const now = queue.getStatus();
    if (now !== 'saving') read(now, now === 'error' ? { retryable: true } : {});
  });
}
// The coach's completion email asked for on this visit (044 sends it once
// whatever; before 044 the page is what keeps it to once).
const toldKey = (token) => `hc-told:${token}`;
const readAccess = (token) => { try { return JSON.parse(store.get('sessionStorage', accessKey(token)) || 'null'); } catch { return null; } };

/** "Tue 27 Oct", with the year when it isn't this year. */
function shortDate(value) {
  if (!value) return '';
  const full = formatDocDate(value);
  const year = String(new Date().getFullYear());
  return full.endsWith(` ${year}`) ? full.slice(0, -5) : full;
}

// Two terms together, so the side panel (Tim, 16 Nov, 23:31).
const HOW_KEPT = {
  title: 'How your answers are kept',
  terms: [
    { term: 'Saved as you go', meaning: 'You can stop and come back with the same email and access code.' },
    { term: 'Kept securely', meaning: 'Your answers are kept for 2 years after your last visit.' },
  ],
};


function Page() {
  const { token } = useParams();
  const toast = useToast();
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
  const [reached, setReached] = useState(false);
  const [organisation, setOrganisation] = useState(null);
  const [coachName, setCoachName] = useState(() => store.get('localStorage', coachKey(token)) || null);
  const [serverCompletedAt, setServerCompletedAt] = useState(null);
  const [panel, setPanel] = useState(null); // 'guide' | 'pdf' | 'doc:privacy' | 'doc:dataStorage'
  const [linkMail, setLinkMail] = useState({ status: 'idle' });
  // Only you has replaced the access code (045): 'sent' (on its way to the
  // guest's email), 'changed' (a preview, which never sends), 'unsent' (the
  // email didn't go) or 'waiting' (the page met the replaced code: its own
  // change's answer was lost, or it was opened again later).
  const [newCode, setNewCode] = useState('');
  const oldCodeRef = useRef(null); // the code the page had, only to ask for the new one again
  const leaveRef = useRef(() => {});
  // Who sees the answers (Tim, 14 Nov, 09:52): You and the coach unless the guest chose Only you.
  const [shared, setShared] = useState(() => openingChoice(keptChoice(shareId(token), shareStore()), null));
  const sharedRef = useRef(shared);
  // The tool opens on a step once; a new opening (or another window's answers) starts it again there.
  const [tool, setTool] = useState({ n: 0, step: at('objective') });

  const queueRef = useRef(null);
  const credsRef = useRef(firstAccess);
  const draftRef = useRef(draft);
  const stepRef = useRef(tool.step);
  const notifyRef = useRef(false);
  const completeRef = useRef(false);
  const headingRef = useRef(null);

  // ---- page chrome ----
  useEffect(() => {
    const previous = document.title;
    document.title = PAGE_TITLE;
    return () => { document.title = previous; };
  }, []);

  // Each screen outside the tool starts at its top, with focus on its heading.
  const showPhase = useCallback((next) => {
    setPhase(next);
    window.scrollTo(0, 0);
    requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
  }, []);

  /** Records the answers and the step, and saves them. */
  const commit = useCallback((nextDraft, step, immediate = true) => {
    let d = nextDraft;
    if (step.screen === 'results' && !d.completedAt) {
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
      currentStep: stepToJson(step),
      complete: step.screen === 'results',
    }, { immediate });
  }, []);

  const onDraft = useCallback((fn, immediate = false) => {
    const next = fn(draftRef.current);
    if (next === draftRef.current) return;
    commit(next, stepRef.current, immediate);
  }, [commit]);

  // The tool says which step is showing: the place is saved with the answers.
  const onStep = useCallback((step) => {
    const before = stepRef.current;
    const same = before.screen === step.screen && before.pi === step.pi && before.fi === step.fi;
    stepRef.current = step;
    if (step.screen === 'results') setReached(true);
    if (same && !(step.screen === 'results' && !draftRef.current.completedAt)) return;
    commit(draftRef.current, step, true);
  }, [commit]);

  // ---- who sees the answers ----
  // Only you replaced the code (045), whichever way the choice was sent (now,
  // or later when the connection came back): the coach was given the old code
  // with the link, so it stops here. The new one goes to the guest's own
  // email, and the page asks for it.
  const onNewCode = useCallback(async (old) => {
    oldCodeRef.current = { email: old.email, code: old.code };
    leaveRef.current('');
    setNewCode('changed');
    const mail = await requestAlignmentEmail({ token, email: old.email, code: old.code, kind: 'code' });
    // Only a preview answers sent: false; a failure says so, with Send it again.
    setNewCode((n) => (n ? (mail.ok ? (mail.sent !== false ? 'sent' : 'changed') : 'unsent') : n));
  }, [token]);
  // The replaced code met anywhere (a save, the choice, opening): ask for the new one.
  const onReplaced = useCallback((old) => {
    if (old) oldCodeRef.current = { email: old.email, code: old.code };
    leaveRef.current('');
    setNewCode('waiting');
  }, []);

  const sendChoice = useCallback(async (value) => {
    const creds = credsRef.current;
    if (!creds) return { ok: false };
    const r = await setSharing(token, creds.email, creds.code, value);
    if (r.ok && r.newCode) onNewCode(creds);
    // The answer to this page's own change was lost, and the code had changed.
    if (!r.ok && r.error === 'new_code') onReplaced(creds);
    return r;
  }, [token, onNewCode, onReplaced]);

  // The coach's completion email, asked for only while the guest's choice is
  // You and the coach, and only after any choice kept on the device has
  // reached the database (044 then refuses it for Only you as well). The
  // server sends it once only, so a repeat does no harm; a failure isn't shown.
  const tellCoach = useCallback(async () => {
    await sendKeptChoice(shareId(token), sendChoice, shareStore());
    const creds = credsRef.current;
    if (!creds || !mayTellCoach(sharedRef.current)) return;
    store.set('sessionStorage', toldKey(token), '1');
    requestAlignmentEmail({ token, email: creds.email, code: creds.code, kind: 'complete' });
  }, [token, sendChoice]);

  const onShare = useCallback(async (next) => {
    // Only you may replace the code (045), after which the old one saves
    // nothing: whatever waits is sent first.
    if (!next) await settledSave(queueRef.current);
    sharedRef.current = next;
    setShared(next);
    const r = await saveChoice(shareId(token), next, sendChoice, shareStore());
    if (r.newCode) return { say: 'Saved' }; // the page now asks for the new code
    // Back to You and the coach after finishing: the coach hears now, once.
    // Asked for once on this visit: a second switch back doesn't ask again (the
    // functionality tester, 15 Nov), whether or not 044 says it went.
    const told = r.notified === true || store.get('sessionStorage', toldKey(token)) === '1';
    if (next && completeRef.current && !told && sharedRef.current) tellCoach();
    // Not sent (no connection): kept on the device and sent when the
    // connection is back, so it says "Will sync" (Smoothness). Before 044 it
    // is kept on the device with nothing alarming said.
    return { say: r.sent || r.missing ? 'Saved' : 'Will sync' };
  }, [token, sendChoice, tellCoach]);

  // A choice kept on the device and not yet sent goes when the connection is
  // back; a choice made in another tab shows here too (the break-it tester,
  // 15 Nov).
  useEffect(() => {
    const resend = () => {
      if (!credsRef.current) return;
      sendKeptChoice(shareId(token), sendChoice, shareStore()).catch(() => {});
    };
    const onStorage = (e) => {
      if (e.key !== `clarity-share:${shareId(token)}`) return;
      const kept = keptChoice(shareId(token), shareStore());
      if (kept && kept.shared !== sharedRef.current) {
        sharedRef.current = kept.shared;
        setShared(kept.shared);
      }
    };
    window.addEventListener('online', resend);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('online', resend);
      window.removeEventListener('storage', onStorage);
    };
  }, [token, sendChoice]);

  // ---- opening the Health Check ----
  const leave = useCallback((message) => {
    queueRef.current?.destroy();
    queueRef.current = null;
    credsRef.current = null;
    store.del('sessionStorage', accessKey(token));
    setCode('');
    setOpenError(message || '');
    setRet(true);
    showPhase('signin');
  }, [token, showPhase]);
  leaveRef.current = leave;

  const resendBusy = useRef(false);
  const resendCode = async () => {
    const old = oldCodeRef.current;
    if (!old || resendBusy.current) return;
    resendBusy.current = true;
    const r = await requestAlignmentEmail({ token, email: old.email, code: old.code, kind: 'code' });
    resendBusy.current = false;
    if (r.ok) { toast.show('Sent'); if (r.sent !== false) setNewCode('sent'); }
    else if (r.error === 'limit') toast.error('That’s as many as can be sent for now. Try again in an hour.');
    else toast.error();
  };

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
    // The choice: one kept on this device and not yet sent wins, and is sent
    // now; otherwise the database's (044), then the device's, then the default.
    const kept = keptChoice(shareId(token), shareStore());
    const choice = openingChoice(kept, session.sharedWithCoach);
    sharedRef.current = choice;
    setShared(choice);
    if (kept && !kept.sent) sendKeptChoice(shareId(token), sendChoice, shareStore());
    else if (typeof session.sharedWithCoach === 'boolean') keepChoice(shareId(token), session.sharedWithCoach, true, shareStore());
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
    stepRef.current = s;
    setTool((t) => ({ n: t.n + 1, step: s }));
    const queue = createSaveQueue({ token, email: creds.email, code: creds.code, session });
    queueRef.current = queue;
    queue.on('status', (state, detail) => {
      if (state === 'saved') store.set('localStorage', lastSavedKey(token), new Date().toISOString());
      if (state === 'saved' && notifyRef.current && credsRef.current) {
        // A conflict is reported straight after 'saved': wait a moment, so it can cancel this.
        setTimeout(() => {
          if (!notifyRef.current || !credsRef.current) return;
          notifyRef.current = false;
          tellCoach();
        }, 0);
      }
      if (state === 'error' && detail?.retryable === false) {
        // Answers the server refuses can never be saved: drop the browser copy,
        // or every reopen would send them again and be refused again.
        if (detail.message === SAVE_REFUSED) clearBackup(token);
        // The code was replaced (045): unsaved answers stay on the device for
        // when the new code opens it.
        if (detail.error === 'new_code') onReplaced(credsRef.current);
        else leave(detail.message);
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
      setPanel(null);
      setTool((t) => ({ n: t.n + 1, step: s2 }));
      toast.show('Another window changed your answers.');
    });
    if (applyBackup) queue.queueSave({ data: dataFromDraft(d), currentStep: stepToJson(s), complete: s.screen === 'results' }, { immediate: true });
    setPhase('flow');
  }, [token, leave, toast, tellCoach, sendChoice, onReplaced]);

  const openingRef = useRef(false); // one request per press
  const open = useCallback(async (e, c) => {
    if (openingRef.current) return;
    if (!looksLikeEmail(e) || cleanCode(c).length !== 6) {
      setOpenError('Enter your email and the 6-character access code from your email.');
      return;
    }
    openingRef.current = true;
    setOpening(true);
    setOpenError('');
    const result = await openSession(token, e.trim(), cleanCode(c));
    openingRef.current = false;
    setOpening(false);
    if (!result.ok) {
      store.del('sessionStorage', accessKey(token));
      if (result.error === 'new_code') {
        // The replaced code: the new one is on its way to their email.
        oldCodeRef.current = { email: e.trim(), code: cleanCode(c) };
        setCode('');
        setOpenError('');
        setNewCode('waiting');
      } else setOpenError(result.message);
      setPhase('signin');
      return;
    }
    setNewCode('');
    oldCodeRef.current = null;
    start(result.session, { email: e.trim(), code: cleanCode(c) });
  }, [token, start]);

  // A reload in the same tab opens straight away.
  useEffect(() => {
    if (phase === 'boot' && firstAccess) open(firstAccess.email, firstAccess.code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    };
  }, []);

  // ---- leaving the guided screens ----
  // Back on the first question: the email and code screen, as M7b.
  const backOut = () => {
    queueRef.current?.flush();
    setRet(false);
    showPhase('signin');
  };
  // Close: everything is saved as it is typed, so it says so and waits on
  // the return screen, where the same email and code carry on (M7b's close
  // says "Saved"; the mock-up has nowhere to go).
  // "Saved" only once the save has reached the server; a save still waiting
  // (no connection: it is kept on the device and sent when the connection is
  // back) says "Will sync" (Smoothness; the functionality tester, 15 Nov).
  const close = async () => {
    const outcome = await settledSave(queueRef.current);
    setPanel(null);
    setRet(true);
    showPhase('signin');
    if (outcome === 'saved') toast.show('Saved');
    else if (outcome === 'waiting') toast.show('Will sync');
    else toast.error();
  };

  // ---- results actions ----
  const pdfDocument = async () => {
    const { healthCheckPdf } = await loadWithReload(() => import('../lib/pdf/docs/healthCheck'));
    const done = serverCompletedAt || draftRef.current.completedAt || null;
    return healthCheckPdf({ draft: draftRef.current, completedAt: done, updatedAt: null, organisation });
  };
  const mailBusy = useRef(false);
  const emailLink = async () => {
    const creds = credsRef.current;
    if (!creds || mailBusy.current) return;
    mailBusy.current = true;
    setLinkMail({ status: 'sending' });
    // The finished answers reach the database first, so the email carries the results PDF (follow-up 5).
    await settledSave(queueRef.current);
    let timeZone = null;
    try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { /* the PDF's paper then follows the browser's language alone */ }
    const r = await requestAlignmentEmail({ token, email: creds.email, code: creds.code, kind: 'link', timeZone });
    mailBusy.current = false;
    // A preview never sends (api/_routes/alignment-email.js), so it claims nothing.
    if (r.ok && r.sent === false) { setLinkMail({ status: 'idle' }); return; }
    setLinkMail({ status: r.ok ? 'sent' : (r.error === 'limit' ? 'limit' : 'error'), to: creds.email });
  };
  const createAccount = () => {
    const e = credsRef.current?.email || '';
    window.open(`/auth/sign-up?email=${encodeURIComponent(e)}`, '_blank', 'noopener');
  };

  const frame = { markHref: SITE, markLabel: SITE_LABEL };
  const guide = <GuidePanel open={panel === 'guide'} onClose={() => setPanel(null)} onWatched={() => setWatched(true)} />;
  const reading = <ReadingPanel doc={panel?.startsWith('doc:') ? READING[panel.slice(4)] : null} onClose={() => setPanel(null)} />;

  if (phase === 'welcome') {
    return (
      <div className="ui-root">
        <GuestFrame narrow="wide" {...frame}>
          <div>
          <GuestTitle headingRef={headingRef}>Strategic Alignment Health Check</GuestTitle>
          <p className="hc-lead">Check whether the work your team does every day aligns with what it’s trying to achieve.</p>
          {/* One job: watch the Quick guide. Begin stays quiet until it has been watched. */}
          <GuideCard onWatched={() => setWatched(true)} onOpenPanel={() => setPanel('guide')} />
          <div className="hc-begin">
            <ButtonNote beside note="~15 minutes">
              <Button variant={watched ? 'primary' : 'outline'} onClick={() => { setRet(false); showPhase('signin'); }}>Begin the Health Check</Button>
            </ButtonNote>
          </div>
          </div>
        </GuestFrame>
        {guide}
      </div>
    );
  }

  if (phase === 'signin') {
    return (
      <div className="ui-root">
        <GuestFrame {...frame}>
          <form noValidate onSubmit={(e) => { e.preventDefault(); open(email, code); }}>
            {!ret && <BackLink onClick={() => showPhase('welcome')} />}
            {ret
              ? <GuestTitle headingRef={headingRef}>Welcome back</GuestTitle>
              : <h1 ref={headingRef} tabIndex={-1} className="ds-guest-question">What’s your email and access code?</h1>}
            <p className="ds-guest-sub hc-sub">
              {newCode === 'sent' ? 'We’ve emailed you a new access code, so only you can open your answers. Type it to carry on.'
                : newCode === 'changed' ? 'Your access code has changed, so only you can open your answers. Type the new one to carry on.'
                  : newCode === 'unsent' ? 'Your access code has changed, but the email with the new one didn’t go. Send it again to carry on.'
                    : newCode === 'waiting' ? 'Your access code has changed, so only you can open your answers. Check your email for the new one.'
                  : ret ? 'Enter the same email and access code to pick up where you left off.' : 'Find your access code in the email with your link.'}
            </p>
            <TextField className="ds-guest-field hc-first-field" label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <TextField
              className="ds-guest-field"
              label="Access code"
              autoComplete="one-time-code"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={6}
              value={code}
              onChange={(e) => setCode(cleanCode(e.target.value))}
            />
            {openError && <div className="ds-guest-problem"><ErrorMessage>{openError}</ErrorMessage></div>}
            {['sent', 'unsent', 'waiting'].includes(newCode) && <p className="ds-guest-sentence"><Button variant="text" onClick={resendCode}>{newCode === 'unsent' ? 'Send it again' : 'Didn’t get it? Send it again'}</Button></p>}
            <p className="ds-guest-sentence">
              <SentenceInfo explain={HOW_KEPT} helpKey="hc-how-kept" label="How your answers are kept">{shared === false ? 'Only you will see your answers.' : `Only you and ${coachName || 'your coach'} will see your answers.`}</SentenceInfo>
            </p>
            <Button variant="primary" type="submit" className="hc-wide-btn" aria-busy={opening || undefined}>{ret ? 'Pick up where you left off' : 'Start the Health Check'}</Button>
          </form>
          <div className="ds-guest-legal">
            {!ret && <Button variant="text" onClick={() => showPhase('example')}>See an example report</Button>}
            {[READING.privacy, READING.dataStorage].map((d) => (
              <a
                key={d.key}
                className="ds-link"
                href={d.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-haspopup="dialog"
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // a new tab when asked for one
                  e.preventDefault();
                  setPanel(`doc:${d.key}`);
                }}
              >
                {d.title}
              </a>
            ))}
          </div>
        </GuestFrame>
        {reading}
      </div>
    );
  }

  if (phase === 'example') {
    return (
      <div className="ui-root">
        <GuestFrame narrow={false} {...frame}>
          {/* Back returns to the email and code screen, where the example was opened. */}
          <BackLink onClick={() => showPhase('signin')} />
          <GuestTitle headingRef={headingRef}>Example report</GuestTitle>
          <ExampleReport onEdit={() => toast.show('The example can’t be edited.')} />
          <div className="hc-end"><Button variant="primary" onClick={() => showPhase('signin')}>Start my Health Check</Button></div>
        </GuestFrame>
      </div>
    );
  }

  if (phase === 'boot') {
    return (
      <div className="ui-root">
        <GuestFrame message {...frame}><div className="hc-loading"><Loading label="Loading" /></div></GuestFrame>
      </div>
    );
  }

  const done = serverCompletedAt || draft.completedAt;
  const keep = (
    <ResultsSection row title="Keep your results">
      <div className="hc-keep">
        <p>We’ll email you a link, so you can find your results again at any time.</p>
        <Button variant="outline" onClick={emailLink}>Email my link</Button>
        {linkMail.status === 'sent' && <p className="hc-keep-note" role="status">We’ve sent your link to {linkMail.to}.</p>}
        {linkMail.status === 'limit' && <p className="hc-keep-note" role="status">You’ve asked for this a few times already. Try again tomorrow.</p>}
        {linkMail.status === 'error' && <p className="hc-keep-note" role="status">That didn’t send. Check your connection and try again.</p>}
      </div>
      <CalmCard line="Keep all your work in The Clarity Portal, your personal performance tool." sub="It’s free, and this Health Check moves into it.">
        <Button variant="outline" onClick={createAccount}>Create my free account</Button>
      </CalmCard>
    </ResultsSection>
  );
  return (
    <div className="ui-root">
      <HealthCheckTool
        key={tool.n}
        draft={draft}
        onDraft={onDraft}
        reached={reached}
        initialStep={tool.step}
        onStep={onStep}
        // The guest chooses who sees the answers (Tim, 14 Nov, 09:52).
        eye={<HealthCheckEye coachName={coachName} shared={shared} onShare={onShare} />}
        onGuide={() => setPanel('guide')}
        resultsTop={<GuestMark href={SITE} label={SITE_LABEL} />}
        resultsMeta={[organisation, done ? shortDate(done) : null]}
        // The Timing question counts months from the completed date, or today.
        asOf={done ? parseDbTimestamp(done) : getLocalDateKey()}
        resultsAfter={keep}
        onPdf={() => setPanel('pdf')}
        onClose={close}
        onBack={backOut}
      />
      {guide}
      <PdfPanel open={panel === 'pdf'} onClose={() => setPanel(null)} getDocument={pdfDocument} />
    </div>
  );
}

export default function HealthCheckPage() {
  return <Page />;
}
