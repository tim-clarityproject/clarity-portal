import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  ButtonNote,
  CalmCard,
  CoachContext,
  GuestEye,
  GuestFrame,
  GuestTitle,
  PdfDownload,
  TextField,
  titleWithAside,
  useToast,
} from '../../components/design';
import { newId } from '../../lib/syncQueue';
import { TOOLS } from '../../lib/navigation';
import {
  GUEST_WORDS,
  cleanCode,
  cleanEmail,
  emailFromSearch,
  forgetVisit,
  guestDeleteLinkAnswers,
  guestEmailConfirm,
  guestError,
  guestWords,
  guestFinish,
  guestLinkInfo,
  guestOpen,
  guestRows,
  guestSave,
  guestSetSharing,
  guestSharing,
  keepVisit,
  openProblem,
  readVisit,
  tokenFrom,
  visitEnded,
  visitFrom,
} from '../../lib/guest/api';
import { sendGuestCode, sendGuestCopy } from '../../lib/guest/copyEmail';
import { functionMissing, keptChoice, openingChoice, saveChoice, sendKeptChoice } from '../../lib/guest/sharing';
import { TOOL_NAME, emptyPlan, hasAnswers, planContent, planFrom, planTitle, savedForm, tidyPlan } from '../../lib/getUnstuck/model';
import GetUnstuckTool from '../getUnstuck/GetUnstuckTool';
import '../performance/performance.css';

// A tool used without an account, through a coach's link (mock-up M9,
// "Guest start" and "Guest end"; migration 035's guest links). The address
// is /guest/<token>, as guest_link_create makes it; the link may carry the
// person's email (?email=…), which then shows already filled in.
//
//   start  the bold crosshair alone, the tool's name, Email and Access
//          code (one plain box), "Only you and Tim will see your answers.",
//          "Start my plan" with "~15 minutes", the two legal links
//   tool   the same guided tool as signed in, with no sprint lines
//   end    "Here’s what you’ll do next.", the next steps, the PDF, the
//          free account offer and "Delete my answers"
//
// The answers are saved through 035's checked functions with the visit
// key the database hands back, kept for this tab only. Every call fails
// calmly until Tim has run 035 (one line; nothing is lost from the tab).
//
// Tools a guest link can open here: Get unstuck ('grow'). A link for a
// tool with no guest page yet says so.

const AUTOSAVE_MS = 1500;
const TOOL_PAGES = { grow: { name: TOOL_NAME, time: TOOLS.grow.time, start: 'Start my plan' } };
const NOT_HERE_YET = 'This tool can’t be used from a link yet. Ask your coach to send it another way.';

const rowOf = (item, status) => ({
  id: item.id,
  title: planTitle(item.plan),
  form_data: savedForm(item.plan),
  status,
  draft: status === 'draft',
});

export default function GuestLink() {
  const { token: raw } = useParams();
  const token = tokenFrom(raw);
  if (!token) {
    return (
      <div className="ui-root">
        <GuestFrame>
          <GuestTitle>{TOOL_NAME}</GuestTitle>
          <div className="ds-error ds-guest-problem" role="alert">
            <span className="ds-error-mark" aria-hidden="true">!</span>
            <span>{GUEST_WORDS.wrongLink}</span>
          </div>
        </GuestFrame>
      </div>
    );
  }
  return <Guest key={token} token={token} />;
}

function Guest({ token }) {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const [kept] = useState(() => readVisit(token));
  const [visit, setVisit] = useState(() => (kept ? { visit: kept.visit, email: kept.email, tool: kept.tool, toolLabel: kept.toolLabel, coachName: kept.coachName } : null));
  const [phase, setPhase] = useState(() => (kept?.phase === 'end' || kept?.phase === 'tool' ? kept.phase : 'start'));
  // What the tab kept is read into a plan the screens can always draw.
  const [item, setItem] = useState(() => (kept?.item && typeof kept.item === 'object' && typeof kept.item.id === 'string' && kept.item.id && kept.item.plan
    ? { id: kept.item.id, plan: tidyPlan(kept.item.plan, newId), status: kept.item.status === 'completed' ? 'completed' : 'draft' }
    : { id: newId(), plan: emptyPlan(), status: 'draft' }));
  const [info, setInfo] = useState(null); // the tool and the coach, before the code is typed
  const [copySent, setCopySent] = useState(Boolean(kept?.copySent));
  const [startMessage, setStartMessage] = useState(null);
  const itemRef = useRef(item);
  itemRef.current = item;
  const visitRef = useRef(visit);
  visitRef.current = visit;
  // The guest's choice of who sees the answers, kept for this visit until the database has it (044).
  const shareId = `guest:${token}`;

  useEffect(() => {
    let live = true;
    guestLinkInfo(token).then((v) => { if (live) setInfo(v); });
    return () => { live = false; };
  }, [token]);

  // This tab keeps the visit, where the person is and what they've typed.
  useEffect(() => {
    if (!visit) return;
    keepVisit(token, { ...visit, phase: phase === 'deleted' ? 'start' : phase, item, copySent });
  }, [token, visit, phase, item, copySent]);

  // The visit has ended (12 hours, or the work has moved into an account):
  // back to the start, saying so.
  const heldRef = useRef(null); // the answers on the screen when a visit ended, and whose they were
  const ended = useCallback((error) => {
    const was = visitRef.current;
    if (was) heldRef.current = { email: `${was.email || ''}`.trim().toLowerCase(), item: itemRef.current };
    forgetVisit(token);
    setVisit(null);
    setPhase('start');
    setStartMessage(guestError(error, GUEST_WORDS.open));
  }, [token]);

  // Who sees the answers (Tim, 14 Nov, 09:52): saved on the link through
  // 044 (guest_set_sharing). Until 044 has run it is kept for the visit and
  // sent when it can be; nothing alarming is said.
  const sendChoice = useCallback(async (value) => {
    const v = visitRef.current;
    if (!v) return { ok: false };
    try {
      const r = await guestSetSharing(v.visit, value);
      return { ok: r?.ok === true };
    } catch (error) {
      if (visitEnded(error)) {
        ended(error);
        return { ok: false };
      }
      return { ok: false, missing: functionMissing(error) };
    }
  }, [ended]);

  // Saved a moment after each change, so the coach's copy keeps up.
  const dirty = useRef(false);
  const saving = useRef(Promise.resolve());
  const saveNow = useCallback((status) => {
    const v = visitRef.current;
    if (!v) return Promise.resolve(null);
    const now = itemRef.current;
    dirty.current = false;
    saving.current = saving.current.catch(() => null).then(() => guestSave(v.visit, 'decisions', rowOf(now, status || now.status)));
    return saving.current;
  }, []);
  // A save that didn't go (no connection) is tried again when the
  // connection is back, not only at the next word typed.
  const [again, setAgain] = useState(0);
  useEffect(() => {
    const online = () => setAgain((n) => n + 1);
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, []);
  useEffect(() => {
    if (phase !== 'tool' || !visit || !dirty.current || !hasAnswers(item.plan)) return undefined;
    const timer = setTimeout(() => {
      // Saved meanwhile (Save my edit, or closing): nothing new to send.
      if (!dirty.current) return;
      saveNow().catch((error) => {
        dirty.current = true;
        if (visitEnded(error)) ended(error);
      });
    }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [item, phase, visit, saveNow, ended, again]);

  const onPlan = useCallback((fn) => {
    dirty.current = true;
    setItem((s) => ({ ...s, plan: fn(s.plan) }));
  }, []);

  // The choice is also kept in the saved item (form_data.shared_with_coach).
  const onShare = useCallback(async (next) => {
    onPlan((p) => ({ ...p, shared: next }));
    await saveChoice(shareId, next, sendChoice);
  }, [onPlan, shareId, sendChoice]);

  const toolKey = visit?.tool || info?.tool || 'grow';
  const page = TOOL_PAGES[toolKey];
  const coachName = visit?.coachName || info?.coachName || '';

  // Opening the link again after choosing Only you (046): the earlier
  // answers show once the email is confirmed with the code emailed to it,
  // never an empty tool. The coach knows the link's code, so that alone
  // never shows them.
  const [codeSent, setCodeSent] = useState(null); // 'sent' | 'unsent' | 'never' | 'limit'
  const askCode = useCallback(async (v) => {
    const r = await sendGuestCode(v.visit);
    setCodeSent(r.sent ? 'sent' : r.never ? 'never' : r.limit ? 'limit' : 'unsent');
    return r;
  }, []);

  const opened = async (answer, email) => {
    const v = visitFrom(answer, email);
    if (v.earlierHidden) {
      visitRef.current = v;
      setVisit(v);
      setStartMessage(null);
      setCodeSent(null);
      setPhase('confirm');
      askCode(v);
      return;
    }
    await enter(v);
  };

  const confirmed = async () => {
    const v = visitRef.current;
    if (v) await enter({ ...v, earlierHidden: false });
  };

  const enter = async (v) => {
    const email = v.email || '';
    let next = { id: newId(), plan: emptyPlan(), status: 'draft' };
    // The visit ended while this tab still held the answers (the tab was
    // left open past the visit's 12 hours), and the same email has opened
    // the link again: the answers stay on the screen. A new visit can't
    // see or change the earlier visit's row until the email is confirmed
    // (035), so they are saved as a new row (the break-it tester, 14 Nov:
    // the tool opened empty and everything typed was gone from the page).
    const held = heldRef.current;
    if (held && held.email === email.trim().toLowerCase() && hasAnswers(held.item.plan)) {
      next = { id: newId(), plan: held.item.plan, status: 'draft' };
      dirty.current = true;
    }
    heldRef.current = null;
    try {
      // What this visit may see of the link's earlier work (its own rows).
      const rows = await guestRows(v.visit, 'decisions');
      const row = rows[rows.length - 1];
      if (row?.form_data) {
        next = { id: row.id, plan: planFrom(row.form_data, newId), status: row.status === 'completed' ? 'completed' : 'draft' };
        dirty.current = false;
      }
    } catch {
      // A new plan; saving says so if the link can't be used.
    }
    // Who sees it: a choice kept on this device and not yet sent wins (and
    // is sent now); otherwise the link's (044), then the device's, then You
    // and the coach.
    const kept = keptChoice(shareId);
    let fromLink = null;
    try {
      const r = await guestSharing(v.visit);
      if (r?.ok && typeof r.shared_with_coach === 'boolean') fromLink = r.shared_with_coach;
    } catch {
      // 044 not run yet, or no connection: the device's choice, or the default.
    }
    const choice = openingChoice(kept, fromLink);
    if (next.plan.shared !== choice) {
      next = { ...next, plan: { ...next.plan, shared: choice } };
      if (hasAnswers(next.plan)) dirty.current = true;
    }
    visitRef.current = v;
    if (kept && !kept.sent) sendKeptChoice(shareId, sendChoice);
    setItem(next);
    setVisit(v);
    setStartMessage(null);
    setPhase('tool');
  };

  const close = async () => {
    try {
      if (hasAnswers(itemRef.current.plan)) await saveNow();
      toast.show('Saved');
      setPhase('start');
    } catch (error) {
      dirty.current = true; // still to be saved: tried again when the connection is back
      if (visitEnded(error)) ended(error);
      else toast.error(guestError(error, GUEST_WORDS.save));
    }
  };

  // "Save my edit" on the guest's plan: saved there and then, as it says.
  const edited = async () => {
    try {
      await saveNow();
      toast.show('Saved');
    } catch (error) {
      dirty.current = true;
      if (visitEnded(error)) ended(error);
      else toast.error(guestError(error, GUEST_WORDS.save));
    }
  };

  const finish = async () => {
    const v = visitRef.current;
    const before = itemRef.current.status;
    try {
      setItem((s) => ({ ...s, status: 'completed' }));
      itemRef.current = { ...itemRef.current, status: 'completed' };
      await saveNow('completed');
      await guestFinish(v.visit).catch(() => null);
    } catch (error) {
      // Not finished after all: a later save keeps it as it was.
      setItem((s) => ({ ...s, status: before }));
      dirty.current = true;
      if (visitEnded(error)) ended(error);
      else toast.error(guestError(error, GUEST_WORDS.save));
      return false;
    }
    setPhase('end');
    // A choice still on the device goes now (the coach's lists read it).
    sendKeptChoice(shareId, sendChoice);
    // The copy by email: only said once the server has sent it.
    sendGuestCopy(v.visit).then((r) => { if (r?.sent) setCopySent(true); });
    return true;
  };

  const removing = useRef(false); // one request per press
  const remove = async () => {
    if (removing.current) return;
    const v = visitRef.current;
    const gone = itemRef.current;
    removing.current = true;
    try {
      await guestDeleteLinkAnswers(v.visit);
    } catch (error) {
      if (visitEnded(error)) ended(error);
      else toast.error(guestError(error, GUEST_WORDS.remove));
      return;
    } finally {
      removing.current = false;
    }
    setPhase('deleted');
    setItem({ id: newId(), plan: emptyPlan(), status: 'draft' });
    toast.saved({
      message: 'Deleted',
      // Undo saves the same answers again through the same link.
      onUndo: async () => {
        try {
          await guestSave(v.visit, 'decisions', rowOf(gone, 'completed'));
          await guestFinish(v.visit).catch(() => null);
          setItem(gone);
          setPhase('end');
        } catch (error) {
          toast.error(guestError(error, GUEST_WORDS.save));
        }
      },
    });
  };

  if (phase === 'tool' && visit && page) {
    return (
      <div className="ui-root plan-builder-wait">
        <CoachContext.Provider value={null}>
          <GetUnstuckTool
            guest
            plan={item.plan}
            onPlan={onPlan}
            coachName={coachName}
            draftKey={`guest-${token.slice(0, 16)}`}
            initialStep={item.status === 'completed' ? 'sum' : undefined}
            onShare={onShare}
            onClose={close}
            onFinish={finish}
            onEdited={edited}
          />
        </CoachContext.Provider>
      </div>
    );
  }

  if (phase === 'end' && visit) {
    const content = planContent(item.plan);
    return (
      <div className="ui-root">
        <GuestFrame>
          <EndHeading coachName={coachName} shared={item.plan.shared !== false} onShare={onShare}>Here’s what you’ll do next.</EndHeading>
          {copySent && <p className="ds-guest-sub">{`A copy is on its way to ${visit.email}.`}</p>}
          {content.nextSteps.length > 0 && (
            <ul className="ds-guest-list">
              {content.nextSteps.map((step, j) => (
                // The steps have no ids here; their order is their identity.
                // eslint-disable-next-line react/no-array-index-key
                <li key={j}>{step}</li>
              ))}
            </ul>
          )}
          <PdfDownload
            className="ds-guest-pdf"
            variant="primary"
            placement="down"
            label="Download my PDF"
            getDocument={async () => {
              const { getUnstuckPdf } = await import('../../lib/pdf/docs/getUnstuck');
              return getUnstuckPdf({ plan: item.plan, guest: true });
            }}
          />
          <CalmCard
            line="Plan this into your week with The Clarity Portal, your personal performance tool."
            sub="It’s free, and this plan moves into it."
          >
            <Button onClick={() => navigate(`/auth/sign-up?email=${encodeURIComponent(visit.email)}`)}>Create my free account</Button>
          </CalmCard>
          <div className="ds-guest-legal">
            <Button variant="text" onClick={remove}>Delete my answers</Button>
          </div>
        </GuestFrame>
      </div>
    );
  }

  if (phase === 'confirm' && visit) {
    return (
      <ConfirmEmail
        title={page?.name || visit.toolLabel || TOOL_NAME}
        visit={visit}
        sent={codeSent}
        onSendAgain={() => askCode(visit)}
        onConfirmed={confirmed}
        onEnded={ended}
      />
    );
  }

  if (phase === 'deleted') {
    return (
      <div className="ui-root">
        <GuestFrame>
          <h1 className="ds-guest-question">Your answers have been deleted.</h1>
          <p className="ds-guest-sub">You can close this page now.</p>
        </GuestFrame>
      </div>
    );
  }

  return (
    <Start
      token={token}
      page={page}
      title={page?.name || visit?.toolLabel || info?.toolLabel || TOOL_NAME}
      coachName={coachName}
      startEmail={visit?.email || emailFromSearch(location.search)}
      carryOn={visit && page ? () => setPhase(item.status === 'completed' ? 'end' : 'tool') : null}
      message={startMessage}
      onOpened={opened}
    />
  );
}

// The end page's heading, with the eye in it (M9): the guest's choice of
// who sees the answers (Tim, 14 Nov, 09:52), You and the coach by default.
function EndHeading({ children, coachName, shared, onShare }) {
  const eye = <GuestEye coachName={coachName} shared={shared} onShare={onShare} />;
  return <h1 className="ds-guest-question">{titleWithAside(children, eye)}</h1>;
}

function Start({ token, page, title, coachName, startEmail, carryOn, message, onOpened }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState(startEmail || '');
  const [code, setCode] = useState('');
  const [problem, setProblem] = useState(message ? { at: 'code', text: message } : null);
  const busy = useRef(false); // one request per press
  const emailRef = useRef(null);
  const codeRef = useRef(null);

  const start = async (e) => {
    e?.preventDefault();
    if (busy.current) return;
    // This tab already holds the visit (the tool was closed part-way): straight back in.
    if (carryOn && !code && cleanEmail(email) === startEmail) {
      carryOn();
      return;
    }
    const address = cleanEmail(email);
    if (!address) {
      setProblem({ at: 'email', text: GUEST_WORDS.emailFirst });
      emailRef.current?.focus();
      return;
    }
    if (cleanCode(code).length < 6) {
      setProblem({ at: 'code', text: GUEST_WORDS.codeFirst });
      codeRef.current?.focus();
      return;
    }
    if (!page) {
      setProblem({ at: 'code', text: NOT_HERE_YET });
      return;
    }
    busy.current = true;
    setProblem(null);
    try {
      const answer = await guestOpen(token, address, code);
      if (!answer?.ok) {
        setProblem({ at: 'code', text: openProblem(answer) });
        codeRef.current?.focus();
        return;
      }
      await onOpened(answer, address);
    } catch (error) {
      setProblem({ at: 'code', text: guestError(error, GUEST_WORDS.open) });
    } finally {
      busy.current = false;
    }
  };

  const said = (at) => problem?.at === at && (
    <div className="ds-error ds-guest-problem" role="alert">
      <span className="ds-error-mark" aria-hidden="true">!</span>
      <span>{problem.text}</span>
    </div>
  );

  return (
    <div className="ui-root">
      <GuestFrame>
        <form onSubmit={start} noValidate>
          <GuestTitle>{title}</GuestTitle>
          <TextField
            ref={emailRef}
            className="ds-guest-field"
            label="Email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); if (problem?.at === 'email') setProblem(null); }}
          />
          {said('email')}
          <TextField
            ref={codeRef}
            className="ds-guest-field"
            label="Access code"
            autoComplete="one-time-code"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            value={code}
            onChange={(e) => { setCode(cleanCode(e.target.value)); if (problem?.at === 'code') setProblem(null); }}
          />
          {said('code')}
          <p className="ds-guest-sentence">{`Only you and ${coachName || 'your coach'} will see your answers.`}</p>
          <ButtonNote beside note={page?.time}>
            <Button variant="primary" type="submit">{page?.start || 'Start'}</Button>
          </ButtonNote>
          <div className="ds-guest-legal">
            <Button variant="text" onClick={() => navigate('/legal/privacy')}>Privacy Policy</Button>
            <Button variant="text" onClick={() => navigate('/legal/data-storage')}>Data Storage Notice</Button>
          </div>
        </form>
      </GuestFrame>
    </div>
  );
}

// "Type the code we emailed you" (046): a guest who chose Only you and opens
// their link again sees their answers once their email is confirmed.
function ConfirmEmail({ title, visit, sent, onSendAgain, onConfirmed, onEnded }) {
  const [code, setCode] = useState('');
  const [problem, setProblem] = useState(null);
  const [again, setAgain] = useState(false);
  const busy = useRef(false); // one request per press
  const codeRef = useRef(null);
  const line = sent === 'sent' ? GUEST_WORDS.codeSent(visit.email)
    : sent === 'never' ? GUEST_WORDS.codeNoEmail
      : sent === 'limit' ? GUEST_WORDS.codeLimit
        : sent === 'unsent' ? GUEST_WORDS.codeUnsent : null;

  const show = async (e) => {
    e?.preventDefault();
    if (busy.current) return;
    if (code.replace(/\D/g, '').length < 6) {
      setProblem(GUEST_WORDS.confirmFirst);
      codeRef.current?.focus();
      return;
    }
    busy.current = true;
    setProblem(null);
    try {
      const answer = await guestEmailConfirm(visit.visit, code);
      if (!answer?.ok) {
        setProblem(guestWords(answer?.message) || GUEST_WORDS.open);
        codeRef.current?.focus();
        return;
      }
      await onConfirmed();
    } catch (error) {
      if (visitEnded(error)) onEnded(error);
      else setProblem(guestError(error, GUEST_WORDS.open));
    } finally {
      busy.current = false;
    }
  };

  const sendAgain = async () => {
    if (again) return;
    setAgain(true);
    try { await onSendAgain(); } finally { setAgain(false); }
  };

  return (
    <div className="ui-root">
      <GuestFrame>
        <form onSubmit={show} noValidate>
          <GuestTitle>{title}</GuestTitle>
          <p className="ds-guest-sentence">{GUEST_WORDS.onlyYou}</p>
          {line && <p className="ds-guest-sub" role="status">{line}</p>}
          <TextField
            ref={codeRef}
            className="ds-guest-field"
            label="Code"
            autoComplete="one-time-code"
            inputMode="numeric"
            value={code}
            onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setProblem(null); }}
          />
          {problem && (
            <div className="ds-error ds-guest-problem" role="alert">
              <span className="ds-error-mark" aria-hidden="true">!</span>
              <span>{problem}</span>
            </div>
          )}
          <div className="ds-guest-go">
            <Button variant="primary" type="submit">Show my answers</Button>
          </div>
          <div className="ds-guest-legal">
            <Button variant="text" onClick={sendAgain}>{sent === 'unsent' ? 'Send it again' : 'Didn’t get it? Send it again'}</Button>
          </div>
        </form>
      </GuestFrame>
    </div>
  );
}
