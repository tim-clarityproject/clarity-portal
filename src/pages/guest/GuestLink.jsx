import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  ButtonNote,
  CalmCard,
  CoachContext,
  GuestFrame,
  GuestTitle,
  PdfDownload,
  TextField,
  WhoSees,
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
  guestError,
  guestFinish,
  guestLinkInfo,
  guestOpen,
  guestRows,
  guestSave,
  keepVisit,
  openProblem,
  readVisit,
  tokenFrom,
  visitEnded,
  visitFrom,
} from '../../lib/guest/api';
import { sendGuestCopy } from '../../lib/guest/copyEmail';
import { TOOL_NAME, emptyPlan, hasAnswers, planContent, planFrom, planTitle, savedForm } from '../../lib/getUnstuck/model';
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
  const [item, setItem] = useState(() => (kept?.item?.plan ? kept.item : { id: newId(), plan: emptyPlan(), status: 'draft' }));
  const [info, setInfo] = useState(null); // the tool and the coach, before the code is typed
  const [copySent, setCopySent] = useState(Boolean(kept?.copySent));
  const [startMessage, setStartMessage] = useState(null);
  const itemRef = useRef(item);
  itemRef.current = item;
  const visitRef = useRef(visit);
  visitRef.current = visit;

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

  // The visit has ended (2 hours, or the work has moved into an account):
  // back to the start, saying so.
  const ended = useCallback((error) => {
    forgetVisit(token);
    setVisit(null);
    setPhase('start');
    setStartMessage(guestError(error, GUEST_WORDS.open));
  }, [token]);

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
  useEffect(() => {
    if (phase !== 'tool' || !visit || !dirty.current || !hasAnswers(item.plan)) return undefined;
    const timer = setTimeout(() => {
      saveNow().catch((error) => {
        dirty.current = true;
        if (visitEnded(error)) ended(error);
      });
    }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [item, phase, visit, saveNow, ended]);

  const onPlan = useCallback((fn) => {
    dirty.current = true;
    setItem((s) => ({ ...s, plan: fn(s.plan) }));
  }, []);

  const toolKey = visit?.tool || info?.tool || 'grow';
  const page = TOOL_PAGES[toolKey];
  const coachName = visit?.coachName || info?.coachName || '';

  const opened = async (answer, email) => {
    const v = visitFrom(answer, email);
    let next = { id: newId(), plan: emptyPlan(), status: 'draft' };
    try {
      // What this visit may see of the link's earlier work (its own rows).
      const rows = await guestRows(v.visit, 'decisions');
      const row = rows[rows.length - 1];
      if (row?.form_data) next = { id: row.id, plan: planFrom(row.form_data, newId), status: row.status === 'completed' ? 'completed' : 'draft' };
    } catch {
      // A new plan; saving says so if the link can't be used.
    }
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
    try {
      setItem((s) => ({ ...s, status: 'completed' }));
      itemRef.current = { ...itemRef.current, status: 'completed' };
      await saveNow('completed');
      await guestFinish(v.visit).catch(() => null);
    } catch (error) {
      if (visitEnded(error)) ended(error);
      else toast.error(guestError(error, GUEST_WORDS.save));
      return false;
    }
    setPhase('end');
    // The copy by email: only said once the server has sent it.
    sendGuestCopy(v.visit).then((r) => { if (r?.sent) setCopySent(true); });
    return true;
  };

  const remove = async () => {
    const v = visitRef.current;
    const gone = itemRef.current;
    try {
      await guestDeleteLinkAnswers(v.visit);
    } catch (error) {
      if (visitEnded(error)) ended(error);
      else toast.error(guestError(error, GUEST_WORDS.remove));
      return;
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
          <EndHeading coachName={coachName}>Here’s what you’ll do next.</EndHeading>
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

// The end page's heading, with the eye in it (M9): the coach who sent the link sees the answers.
function EndHeading({ children, coachName }) {
  const eye = (
    <WhoSees
      audience="coach"
      coachName={coachName || undefined}
      note={`Your answers go to ${coachName || 'your coach'}, who sent you the link.`}
    />
  );
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
