import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import DesignHeader from '../../components/DesignHeader';
import {
  AddButton,
  Bar,
  Button,
  ChartTable,
  CheckinChart,
  Choice,
  Collapsible,
  GuidedTool,
  HabitEditor,
  LoadError,
  Loading,
  NotePanel,
  PageHeader,
  Section,
  SlidePanel,
  Stat,
  StatGroup,
  StatementPanel,
  TextBox,
  WhoSees,
  clearGuideDraft,
  useToast,
} from '../../components/design';
import { useCachedLoad, readCache, writeCache } from '../../lib/pageCache';
import { clearDraft, useDraft } from '../../lib/drafts';
import { friendlyError } from '../../lib/friendlyError';
import { newId, keepForLater, saveOrQueue, useQueueState } from '../../lib/syncQueue';
import { deviceKey, readJson, writeJson } from '../../lib/deviceStore';
import {
  addSprintHabit,
  checkinAnswersOp,
  createCheckin,
  loadCheckinPage,
  loadCheckinRow,
  saveSharing,
  saveTodo,
} from '../../lib/performance/api';
import { useLatestWhenSuperseded, useSprintPage } from '../../lib/performance/hooks';
import {
  CHECKIN_TIME,
  CLOSE_TOAST,
  HARDWARE_SOFTWARE,
  LATER_TOAST,
  NAME_MAX,
  SCORE_LINES,
  UNITS_GUIDE,
  addedLine,
  checkinKind,
  checkinMonth,
  checkinPath,
  checkinPoints,
  checkinResults,
  checkinTitle,
  cleanAnswers,
  cleanGoals,
  finishToastWords,
  goalQuestions,
  habitComplete,
  habitRow,
  localToday,
  monthFromParam,
  monthFull,
  noSprintLine,
  previousCheckin,
  questionsFor,
  sprintPageView,
  tripsWords,
  whoSeesLines,
  whyLines,
  withMeasure,
} from '../../lib/performance';
import { exampleRole } from '../../content/planBuilder';
import pageText from '../../content/pageText';
import { formatSavedDate, getLocalDateKey, parseDbTimestamp } from '../../lib/dateFormatter';
import './performance.css';

// The Hardware and Software check-in (mock-up M12 version 14, read in full
// with its notes; Phase 5 step 1). Two flows on one guided tool, one
// question per screen with the % complete bar:
//   First check-in  coaching clients who have never finished one: "What
//                   would make coaching useful for you?", the five goal
//                   questions, then the check-in; Do this later saves and
//                   closes ("Home will ask you to finish before your
//                   first session.")
//   Monthly         everyone else: "Ready to look back on your month?",
//                   then the same questions; Skip leaves one unanswered
// One tap on an answer moves on (the arrow keys only change it); Back
// always works. The results come last: Hardware and Software out of 100,
// last month's figure beside each (only here, never before answering,
// experience rule 50), what improved (up to three, mint), one thing to
// work on with Add to my sprint, the two-line graph and the areas folded.
// Every figure comes from src/lib/scores (methods M13) through
// src/lib/performance/checkin.js.
//
// Saving (Phase 0e, as the weekly debrief): the answers go into this
// month's checkins row a moment after each tap, through the offline queue
// with the version it was based on ("Saving", "Will sync", "Saved"); the
// answers are also a draft on the device and the step is remembered, so
// a half-done check-in is never lost. Finishing sets it finished, once
// (the row is found by person and month, so a resend writes the same
// row). The database works out the scores again (029's checkins_score)
// and, for a coaching client sharing the check-in, makes the coach's
// flags with the answer that caused each (029's checkins_flag). The
// client never sees a flag or a note unless the coach sends one (rule 51);
// the coach's side is Phase 6a.
//
// /check-in             this month's (its results once finished)
// /check-in/2026-10     a month's results (a saved item in My Reviews)
// /check-in/2026-10/answers  change a month's answers (experience rule 7)

export const CHECKIN_CACHE = 'checkin-page';
const SAVE_AFTER_MS = 600;
const ADVANCE_MS = 380; // M12: a tap shows as chosen for a moment, then the next question
const SAVE_ERROR = 'That didn’t save. Check your connection and try again.';

/** A finished or changed check-in: the device's copies learn it at once, so Home and the lists show it offline too. */
function noteCheckinOnDevice(userId, row) {
  const page = readCache(userId, CHECKIN_CACHE)?.v;
  if (page?.checkins) {
    const others = page.checkins.filter((c) => c.month !== row.month);
    writeCache(userId, CHECKIN_CACHE, { ...page, checkins: [{ ...(page.checkins.find((c) => c.month === row.month) || {}), ...row }, ...others] });
  }
  const list = readCache(userId, 'checkins')?.v;
  if (Array.isArray(list)) {
    const others = list.filter((c) => c.month !== row.month);
    writeCache(userId, 'checkins', [{ ...(list.find((c) => c.month === row.month) || {}), ...row }, ...others]);
  }
}

export default function CheckIn() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const params = useParams();
  const location = useLocation();
  const [today] = useState(() => localToday());
  const loaded = useCachedLoad({ userId, name: CHECKIN_CACHE, load: () => loadCheckinPage(userId) });
  useLatestWhenSuperseded(loaded.reload);
  const current = checkinMonth(today);
  const asked = params.month ? monthFromParam(params.month) : current;
  const changing = /\/answers$/.test(location.pathname);

  if (!loaded.data && loaded.error) {
    return (
      <Shell>
        <LoadError>Your check-in didn’t load. Check your connection and try again.</LoadError>
      </Shell>
    );
  }
  if (!loaded.data) {
    return <div className="ui-root plan-builder-wait"><Loading label="Loading your check-in" className="ds-loading--page" /></div>;
  }
  const row = asked ? loaded.data.checkins.find((c) => c.month === asked) || null : null;
  if (!asked || (asked !== current && !row)) {
    return (
      <Shell>
        <p className="ck-quiet">There’s no check-in saved for that month.</p>
        <OpenThisMonth />
      </Shell>
    );
  }
  if (row?.status === 'finished' && !changing) {
    if (!params.month) return <Navigate to={checkinPath(row.month)} replace state={location.state} />;
    return <CheckinRead userId={userId} today={today} loaded={loaded} row={row} />;
  }
  return <CheckinFlow key={asked} userId={userId} today={today} month={asked} loaded={loaded} />;
}

function Shell({ children }) {
  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="plan-page ipp-page">
        <PageHeader title="Hardware and Software check-in" info={pageText.checkIn} />
        {children}
      </div>
    </div>
  );
}

function OpenThisMonth() {
  const navigate = useNavigate();
  return (
    <div className="ds-actions ipp-actions">
      <Button variant="primary" onClick={() => navigate('/check-in')}>Open this month’s check-in</Button>
    </div>
  );
}

// ------------------------------------------------------------------ the eye

/**
 * Who sees the answers (M12: "You and Tim" under the answers on every
 * screen). With a coach it can be tapped to change who sees it, there and
 * then (26 Oct rule 7), using My Account's setting for the check-in.
 */
function useCheckinEye(userId, loaded) {
  const { data, setData } = loaded;
  const coach = data.coach?.firstName || null;
  const sharing = Boolean(coach) && data.sharingOn !== false;
  const change = async (audience) => {
    const on = audience === 'coach';
    setData((d) => ({ ...d, sharingOn: on }));
    try {
      await saveSharing(userId, 'checkin', on);
      return true;
    } catch (e) {
      setData((d) => ({ ...d, sharingOn: !on }));
      throw e;
    }
  };
  const eye = coach
    ? <WhoSees audience={sharing ? 'coach' : 'me'} coachName={coach} name="Your check-in" onChange={change} />
    : <WhoSees audience="me" />;
  return { coach, sharing, eye };
}

// ------------------------------------------------------------------ the flow

function CheckinFlow({ userId, today, month, loaded }) {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const queue = useQueueState();
  const sprint = useSprintPage(userId);
  const { data, setData } = loaded;
  const row = data.checkins.find((c) => c.month === month) || null;
  const { coach, sharing, eye } = useCheckinEye(userId, loaded);
  const [kind] = useState(() => row?.kind || checkinKind({ hasCoach: Boolean(coach), checkins: data.checkins, month }));
  const first = kind === 'first';
  const role = exampleRole(data.describesYou);

  const [answers, setAnswers] = useState(() => ({ ...(row?.answers || {}) }));
  const [goals, setGoals] = useState(() => ({ ...(row?.goals || {}) }));
  const [save, setSave] = useState('idle');
  const checkinId = useRef(row?.id || null);
  const creating = useRef(null);
  const typedYet = useRef(false);
  const timer = useRef(null);
  const waiting = useRef(false);
  const latest = useRef({ answers, goals });
  useEffect(() => { latest.current = { answers, goals }; }, [answers, goals]);
  useEffect(() => { if (row?.id) checkinId.current = row.id; }, [row?.id]);
  // Another device's answers, until this one changes something.
  useEffect(() => {
    if (!typedYet.current && row?.updated_at) {
      setAnswers({ ...(row.answers || {}) });
      setGoals({ ...(row.goals || {}) });
    }
  }, [row?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (save === 'offline' && queue.waiting === 0 && queue.failed === 0) setSave('saved');
    if (save === 'offline' && queue.failed > 0) setSave('failed');
  }, [save, queue.waiting, queue.failed]);

  const draftName = `checkin:${month}`;
  const { clear: clearAnswersDraft } = useDraft({
    userId,
    name: draftName,
    value: { answers, goals },
    ready: true,
    onRestore: (d) => {
      if (!d || typeof d !== 'object') return;
      typedYet.current = true;
      setAnswers((a) => ({ ...a, ...(d.answers || {}) }));
      setGoals((g) => ({ ...g, ...(d.goals || {}) }));
    },
  });

  // ---------------------------------------------------------------- saving

  const sent = async (fn) => {
    setSave('saving');
    try {
      const r = await fn();
      if (r?.status === 'superseded') {
        setSave('idle');
        return false;
      }
      setSave((s) => (r?.status === 'queued' || s === 'offline' ? 'offline' : 'saved'));
      return true;
    } catch (e) {
      setSave('idle');
      toast.error(friendlyError(e, SAVE_ERROR));
      return false;
    }
  };

  // This month's row, made once with its id from the device.
  const ensureCheckin = () => {
    if (checkinId.current) return Promise.resolve(checkinId.current);
    if (!creating.current) {
      creating.current = (async () => {
        const id = newId();
        const r = await createCheckin(userId, id, month, kind);
        let real = id;
        if (r?.status === 'saved' && !r.data?.length) real = (await loadCheckinRow(userId, month))?.id || id;
        checkinId.current = real;
        setData((d) => ({
          ...d,
          checkins: d.checkins.some((c) => c.month === month)
            ? d.checkins.map((c) => (c.month === month ? { ...c, id: real } : c))
            : [{ id: real, kind, month, status: 'draft', answers: {}, goals: null }, ...d.checkins],
        }));
        return real;
      })().catch((e) => {
        creating.current = null;
        throw e;
      });
    }
    return creating.current;
  };

  const values = (extra = {}) => {
    const { answers: a, goals: g } = latest.current;
    return { kind, answers: cleanAnswers(a), ...(first ? { goals: cleanGoals(g) } : {}), ...extra };
  };

  const send = (extra = {}) => {
    clearTimeout(timer.current);
    timer.current = null;
    waiting.current = false;
    const v = values(extra);
    return sent(async () => {
      await ensureCheckin();
      const patch = { month, ...v };
      setData((d) => ({ ...d, checkins: d.checkins.map((c) => (c.month === month ? { ...c, ...patch } : c)) }));
      noteCheckinOnDevice(userId, patch);
      return saveOrQueue(userId, checkinAnswersOp(userId, month, v));
    });
  };

  useEffect(() => {
    if (!typedYet.current) return;
    setSave('saving');
    waiting.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => send(), SAVE_AFTER_MS);
    // Only when the answers change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, goals]);

  // Closing or refreshing with a save still waiting: kept on the device and sent next time.
  useEffect(() => {
    const onHide = () => {
      if (!waiting.current || !checkinId.current) return;
      keepForLater(userId, checkinAnswersOp(userId, month, values()));
      waiting.current = false;
      clearTimeout(timer.current);
    };
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      if (waiting.current) {
        clearTimeout(timer.current);
        waiting.current = false;
        const v = values();
        ensureCheckin().then(() => saveOrQueue(userId, checkinAnswersOp(userId, month, v))).catch(() => null);
      }
    };
    // Once, for the page's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const answer = (code, value) => {
    // The same answer again (moving on with one tap) changes nothing, so nothing is saved.
    if (latest.current.answers[code] === value) return;
    typedYet.current = true;
    setAnswers((a) => ({ ...a, [code]: value }));
  };
  const setGoal = (code, value) => {
    typedYet.current = true;
    setGoals((g) => ({ ...g, [code]: value }));
  };

  // ---------------------------------------------------------------- the steps

  const previous = previousCheckin(data.checkins, month);
  const results = useMemo(() => checkinResults({ answers, previous }), [answers, previous]);
  const points = useMemo(() => checkinPoints(data.checkins, { month, answers }), [data.checkins, month, answers]);
  const eyeLine = <div className="ck-eye">{eye}</div>;
  const goalQs = goalQuestions(coach);

  const intro = first
    ? {
      key: 'start',
      name: 'Start',
      question: 'What would make coaching useful for you?',
      nudges: ['Let’s start with 5 questions about that.', 'Then your first Hardware and Software check-in.'],
      nudgeInfo: { label: 'What are hardware and software?', text: [...HARDWARE_SOFTWARE] },
      nextLabel: 'Start with my goals',
      render: () => <WhoSeesFold coach={coach} sharing={sharing} />,
    }
    : {
      key: 'start',
      name: 'Start',
      label: CHECKIN_TIME,
      question: 'Ready to look back on your month?',
      nudges: ['Answer for the past month, on average.'],
      nextLabel: 'Start my check-in',
      // No Skip here: skipping the opening screen would only open the first question.
      required: true,
      render: () => <WhoSeesFold coach={coach} sharing={sharing} />,
    };

  const goalSteps = first ? goalQs.map((g) => ({
    key: g.code,
    name: 'Goals',
    label: 'Your goals',
    question: g.question,
    nudges: g.nudges,
    example: g.example,
    render: () => (g.three ? (
      <div className="ck-three">
        {[0, 1, 2].map((i) => (
          <div key={i} className="ck-three-row">
            <span className="ck-three-n" aria-hidden="true">{i + 1}</span>
            <TextBox
              lines="one"
              ariaLabel={`Thing ${i + 1}`}
              maxLength={150}
              value={(Array.isArray(goals.G3) ? goals.G3 : [])[i] || ''}
              onChange={(v) => setGoal('G3', [0, 1, 2].map((j) => (j === i ? v : ((Array.isArray(goals.G3) ? goals.G3 : [])[j] || ''))))}
            />
          </div>
        ))}
        {eyeLine}
      </div>
    ) : (
      <div>
        <TextBox ariaLabel={g.question} focusMode maxLength={1000} value={goals[g.code] || ''} onChange={(v) => setGoal(g.code, v)} />
        {eyeLine}
      </div>
    )),
  })) : [];

  const questionSteps = questionsFor(answers).map((q) => ({
    key: q.code,
    name: q.label.replace(' · ', ', '),
    // M12 draws "Hardware · Sleep"; no dots between items (26 Oct rule 5),
    // so the two are separate labels, 20px apart.
    label: <AreaLabel label={q.label} />,
    info: q.why ? whyLines(q.why, sharing ? coach : null) : undefined,
    question: q.question,
    nudges: q.nudges,
    render: (tool) => (
      <QuestionBody q={q} value={answers[q.code] ?? null} onAnswer={(v) => answer(q.code, v)} onNext={() => tool.go(tool.index + 1)} eye={eyeLine} />
    ),
  }));

  const resultsStep = {
    key: 'results',
    name: 'Results',
    title: first || !results.compared ? 'Your starting point' : 'Your month',
    nudges: [first || !results.compared ? 'Next month’s check-in will show what’s changed.' : 'Here’s how this month compares with last month.'],
    nextLabel: first ? 'Finish my first check-in' : 'Finish my check-in',
    render: () => (
      <Results
        userId={userId}
        today={today}
        kind={kind}
        coach={coach}
        results={results}
        points={points}
        goals={first ? goals : null}
        note={data.notes?.find((n) => n.month === month)?.note || null}
        sprint={sprint}
        checkinId={checkinId}
        ensureCheckin={ensureCheckin}
        month={month}
        eye={eyeLine}
      />
    ),
  };

  const steps = [intro, ...goalSteps, ...questionSteps, resultsStep];
  const backTo = location.state?.from || '/welcome';
  const draftKey = `checkin-${userId}-${month}`;
  const finishedBefore = row?.status === 'finished';

  const leave = (words) => {
    if (waiting.current) send();
    if (!finishedBefore) toast.show(words);
    navigate(backTo, { replace: true });
  };

  const finish = async () => {
    const ok = await send({ status: 'finished' });
    if (!ok) return false; // the tool lets Finish be tapped again
    const done = { month, status: 'finished', finished_at: row?.finished_at || new Date().toISOString() };
    setData((d) => ({ ...d, checkins: d.checkins.map((c) => (c.month === month ? { ...c, ...done } : c)) }));
    noteCheckinOnDevice(userId, done);
    clearAnswersDraft();
    clearDraft(userId, draftName);
    clearGuideDraft(draftKey);
    toast.show(finishToastWords({ kind, coachName: coach, sharing }));
    navigate(backTo, { replace: true });
    return true;
  };

  return (
    <div className="ui-root plan-builder-wait">
      <GuidedTool
        name={first ? 'First check-in' : 'Monthly check-in'}
        steps={steps}
        progress="percent"
        role={role}
        skipLabel={first ? 'Do this later' : 'Skip'}
        skipMoves={!first}
        onSkip={first ? () => leave(LATER_TOAST) : undefined}
        finishLabel={first ? 'Finish my first check-in' : 'Finish my check-in'}
        saveState={save}
        draftKey={draftKey}
        initialStep={finishedBefore ? questionSteps[0]?.key : undefined}
        onClose={() => leave(CLOSE_TOAST)}
        onFinish={finish}
      />
    </div>
  );
}

/**
 * One question (M12 klist): the statement for a Software one, the answer
 * rows, the eye under them. A tap moves on after a moment (M12: 380ms);
 * leaving the screen first (Back) cancels it, as the screen goes.
 */
function QuestionBody({ q, value, onAnswer, onNext, eye }) {
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <div className="ck-q">
      {q.statement && <StatementPanel>{q.statement}</StatementPanel>}
      <Choice
        ariaLabel={q.statement || q.question}
        options={q.options}
        value={value}
        onChange={onAnswer}
        onChoose={() => {
          clearTimeout(timer.current);
          timer.current = setTimeout(onNext, ADVANCE_MS);
        }}
        form="rows"
      />
      {eye}
      {q.units && <UnitsFold />}
    </div>
  );
}

/** "Who sees my answers?" (M12 whoSees): a quiet fold on the opening screen. */
function WhoSeesFold({ coach, sharing }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ck-who">
      <button type="button" className="ds-guide-example-link" aria-expanded={open} aria-controls="ck-who-lines" onClick={() => setOpen((v) => !v)}>
        Who sees my answers?
      </button>
      {open && (
        <div id="ck-who-lines" className="ds-guide-example ck-who-lines">
          {whoSeesLines({ coachName: coach, sharing }).map((l) => <p key={l}>{l}</p>)}
        </div>
      )}
    </div>
  );
}

/** "What’s a unit?" (M12): folds away until wanted. */
function UnitsFold() {
  const [open, setOpen] = useState(false);
  return (
    <div className="ck-units-fold">
      <button type="button" className="ds-guide-example-link" aria-expanded={open} aria-controls="ck-units" onClick={() => setOpen((v) => !v)}>
        What’s a unit?
      </button>
      {open && (
        <div id="ck-units" className="ck-units">
          <p>{UNITS_GUIDE.lead}</p>
          {UNITS_GUIDE.rows.map(([what, units]) => (
            <div key={what} className="ck-units-row"><span>{what}</span><em>{units}</em></div>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ results

function AreaFold({ title, fold }) {
  if (!fold.rows.length) return null;
  return (
    <div className="ck-fold">
      <Collapsible summary={(
        <span className="ck-fold-head">
          <span className="ck-fold-title">{title}</span>
          <span className="ck-fold-line">{fold.lowest}</span>
        </span>
      )}
      >
        <div className="ck-areas">
          {fold.rows.map((r) => (
            <div key={r.key} className="ck-area">
              <span className="ck-area-name">{r.name}</span>
              <Bar value={r.value / 100} className="ck-area-bar" />
              <span className="ck-area-value">{`${r.value}/100`}</span>
            </div>
          ))}
        </div>
      </Collapsible>
    </div>
  );
}

function ChangeNote({ change }) {
  if (!change) return null;
  return (
    <>
      {change.lead}
      {change.up && <span className="ck-up">{change.up}</span>}
      {change.rest}
    </>
  );
}

/**
 * The results (M12 kresults and mresults), shared by the tool's last
 * screen and the saved check-in's page.
 */
function Results({ userId, today, kind, coach, results, points, goals, note, sprint, checkinId, ensureCheckin, month, eye }) {
  const first = kind === 'first';
  const r = results;
  return (
    <div className="ck-results">
      {note && coach && <NotePanel label={`From ${coach}`} className="ck-note">{note}</NotePanel>}
      <StatGroup className="ck-scores">
        {r.hardware && (
          <Stat panel label="Hardware score" value={String(r.hardware.value)} unit="/100" note={r.compared ? <ChangeNote change={r.hardware.change} /> : SCORE_LINES.hardware} />
        )}
        {r.software && (
          <Stat panel label="Software score" value={String(r.software.value)} unit="/100" note={r.compared ? <ChangeNote change={r.software.change} /> : SCORE_LINES.software} />
        )}
      </StatGroup>
      {/* M12's line, one sentence per line (writing rule 49). */}
      {!r.compared && (
        <div className="ck-hint">
          <p>Your graph starts here.</p>
          <p>Each monthly check-in adds a point.</p>
        </div>
      )}

      {r.compared && (
        <Section title="What improved" as="h3" className="ck-sec">
          {r.improved.length ? (
            <ul className="ck-improved">
              {r.improved.map((x) => <li key={x.key}><i aria-hidden="true" />{x.line}</li>)}
            </ul>
          ) : <p className="ck-plain">{r.improvedEmpty}</p>}
        </Section>
      )}

      {r.workOn && (
        <Section title="One thing to work on" as="h3" className="ck-sec">
          <WorkOn userId={userId} today={today} kind={kind} coach={coach} workOn={r.workOn} sprint={sprint} checkinId={checkinId} ensureCheckin={ensureCheckin} month={month} />
        </Section>
      )}

      {r.compared && (
        <Section title="Over time" as="h3" className="ck-sec">
          <CheckinChart points={points} />
          {points.length >= 2 && (
            <ChartTable
              caption="Hardware score and Software score by month"
              columns={[
                { key: 'month', label: 'Month' },
                { key: 'hw', label: 'Hardware score' },
                { key: 'sw', label: 'Software score' },
                ...(points.some((p) => p.trips) ? [{ key: 'trips', label: 'Travel' }] : []),
              ]}
              rows={points.map((p) => ({
                key: p.month,
                cells: { month: p.when, hw: p.hardware == null ? 'Not answered' : `${p.hardware}/100`, sw: p.software == null ? 'Not answered' : `${p.software}/100`, trips: tripsWords(p.trips) },
              }))}
            />
          )}
        </Section>
      )}

      <AreaFold title="Hardware areas" fold={r.hardwareAreas} />
      <AreaFold title="Software areas" fold={r.softwareAreas} />

      {first && goals && <MyGoals goals={goals} />}
      {eye}
    </div>
  );
}

function MyGoals({ goals }) {
  const three = (Array.isArray(goals.G3) ? goals.G3 : []).filter((t) => (t || '').trim());
  if (!(goals.G1 || '').trim() && !three.length) return null;
  return (
    <Section title="My goals" as="h3" className="ck-sec">
      <div className="ck-goals">
        {(goals.G1 || '').trim() && (
          <div className="ck-goal"><span className="ck-goal-label">In 12 months’ time</span><span className="ck-goal-text">{goals.G1}</span></div>
        )}
        {three.length > 0 && (
          <div className="ck-goal">
            <span className="ck-goal-label">3 things I want from coaching</span>
            {/* One per line, never joined by dots (M12 joined them with " · "). */}
            {three.map((t, i) => <span key={i} className="ck-goal-text">{t}</span>)}
          </div>
        )}
      </div>
    </Section>
  );
}

/** A question's area and topic ("Hardware", "Sleep") as two labels, never with a dot. */
function AreaLabel({ label }) {
  const parts = label.split(' · ');
  return <span className="ck-topic">{parts.map((p) => <span key={p}>{p}</span>)}</span>;
}

// ------------------------------------------------------------------ one thing to work on, and Add to my sprint

const addedKey = (userId, month) => deviceKey('checkin-added', userId, month);

function WorkOn({ userId, today, kind, coach, workOn, sprint, checkinId, ensureCheckin, month }) {
  const toast = useToast();
  const view = useMemo(() => (sprint.data ? sprintPageView(sprint.data, { today }) : null), [sprint.data, today]);
  const running = view?.state === 'running' && (sprint.data?.strategies || []).length > 0;
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState(() => readJson(addedKey(userId, month)));
  const [tip, ...lines] = workOn.tip;
  const s = workOn.suggestion;
  const sprintName = view?.name;
  const habitFrom = running && view.current < view.lengthWeeks ? view.current + 1 : null;
  // Already in this sprint (from this check-in): never offered twice.
  const inSprint = added?.sprintId && added.sprintId === view?.sprintId ? added
    : running && (sprint.data.todos || []).some((t) => t.source === 'other_tool' && t.source_id && t.source_id === checkinId.current)
      ? { as: 'todo' } : null;

  const strategies = (sprint.data?.strategies || []).map((x) => ({ value: x.id, label: x.name }));
  const emptyForm = () => ({
    as: s.as === 'habit' && habitFrom ? 'habit' : 'todo',
    strategyId: strategies.length === 1 ? strategies[0].value : null,
    habit: { id: null, name: s.habit?.name || tip, measure: s.habit?.measure || 'count', target: s.habit?.target ?? '', unit: '', per: s.habit?.per || 'week', direction: 'higher', impact: 2, topNumber: null },
    todo: s.todo || tip,
  });
  const [form, setForm] = useState(emptyForm);
  const { clear: clearFormDraft } = useDraft({
    userId,
    name: `checkin-add:${month}`,
    value: open ? form : null,
    ready: running,
    onRestore: (d) => { if (d?.as) { setForm(d); setOpen(true); } },
  });

  const add = async () => {
    const sprintId = view.sprintId;
    let ok;
    if (form.as === 'habit') {
      const shaped = habitRow({ ...form.habit, id: newId(), strategyId: form.strategyId }, (sprint.data.sprintHabits || []).length);
      const sh = { sprintHabitId: newId(), settingId: newId(), sprintId, strategyId: form.strategyId, name: shaped.name, sortOrder: shaped.sortOrder, fromWeek: habitFrom, ...shaped };
      sprint.setData((d) => ({
        ...d,
        sprintHabits: [...(d.sprintHabits || []), { id: sh.sprintHabitId, sprint_id: sprintId, habit_id: null, strategy_id: sh.strategyId, name: sh.name, sort_order: sh.sortOrder }],
        sprintSettings: [...(d.sprintSettings || []), {
          id: sh.settingId, sprint_habit_id: sh.sprintHabitId, from_week: habitFrom, measure: sh.measure, unit: sh.unit, target: sh.target, target_per: sh.targetPer,
          limit_value: sh.limit, limit_per: sh.limitPer, direction: sh.direction, top_number: sh.topNumber, impact: sh.impact,
        }],
      }));
      try {
        const r = await addSprintHabit(userId, sh);
        ok = r?.status !== 'superseded';
      } catch (e) {
        toast.error(friendlyError(e, SAVE_ERROR));
        ok = false;
      }
      if (!ok) {
        sprint.setData((d) => ({ ...d, sprintHabits: (d.sprintHabits || []).filter((x) => x.id !== sh.sprintHabitId), sprintSettings: (d.sprintSettings || []).filter((x) => x.id !== sh.settingId) }));
        return;
      }
    } else {
      const id = newId();
      const text = form.todo.trim();
      try {
        const source = await ensureCheckin();
        sprint.setData((d) => ({
          ...d,
          todos: [...(d.todos || []), { id, strategy_id: form.strategyId, text, impact: 2, sprint_id: sprintId, planned_week: view.current, created_on: today, done_on: null, source: 'other_tool', source_id: source, move_on: null, deleted_at: null }],
        }));
        const r = await saveTodo(userId, { id, strategyId: form.strategyId, text, impact: 2, sprintId, week: view.current, createdOn: today, source: 'other_tool', sourceId: source });
        ok = r?.status !== 'superseded';
      } catch (e) {
        toast.error(friendlyError(e, SAVE_ERROR));
        ok = false;
      }
      if (!ok) {
        sprint.setData((d) => ({ ...d, todos: (d.todos || []).filter((t) => t.id !== id) }));
        return;
      }
    }
    const done = { as: form.as, sprintId, sprintName };
    writeJson(addedKey(userId, month), done);
    setAdded(done);
    setOpen(false);
    clearFormDraft();
    toast.show(`Added to ${sprintName} as a ${form.as === 'todo' ? 'to-do' : 'habit'}.`);
  };

  const ready = Boolean(form.strategyId) && (form.as === 'habit'
    ? habitComplete({ ...form.habit, strategyId: form.strategyId }) && (form.habit.name || '').trim().length <= NAME_MAX
    : Boolean(form.todo.trim()));
  const strategyName = strategies.find((x) => x.value === form.strategyId)?.label;

  return (
    <div className="ck-one">
      <span className="ck-one-area">{workOn.name}</span>
      <span className="ck-one-tip">{tip}</span>
      {lines.map((l) => <p key={l} className="ck-one-line">{l}</p>)}
      {inSprint && (
        <>
          <p className="ck-one-added">{addedLine(inSprint.sprintName || sprintName, inSprint.as)}</p>
          {inSprint.as === 'habit' && <p className="ck-one-line">It starts next week.</p>}
        </>
      )}
      {!inSprint && running && <AddButton className="ck-one-add" onClick={() => { setForm((f) => (f.as ? f : emptyForm())); setOpen(true); }}>Add to my sprint</AddButton>}
      {!inSprint && !running && <p className="ck-one-next">{noSprintLine({ kind, coachName: coach })}</p>}
      {running && (
        <SlidePanel
          open={open}
          onClose={() => setOpen(false)}
          title="Add to my sprint"
          footer={(
            <div className="ds-panel-actions">
              <Button onClick={() => setOpen(false)}>Cancel</Button>
              <Button variant="primary" disabled={!ready} onClick={() => ready && add()}>Add to my sprint</Button>
            </div>
          )}
        >
          <div className="ds-panel-form">
            {habitFrom && (
              <Choice
                label="How do you want to add it?"
                options={[{ value: 'habit', label: 'As a habit' }, { value: 'todo', label: 'As a to-do' }]}
                value={form.as}
                onChange={(as) => setForm((f) => ({ ...f, as }))}
                form="pills"
              />
            )}
            {form.as === 'habit' ? (
              <>
                <HabitEditor
                  habit={form.habit}
                  onChange={(patch) => setForm((f) => ({ ...f, habit: patch.measure ? withMeasure({ ...f.habit, ...patch }, patch.measure) : { ...f.habit, ...patch } }))}
                />
                <p className="ds-panel-note">It starts in week {habitFrom}, so this week’s score stays as it is.</p>
              </>
            ) : (
              <TextBox label="What needs doing?" who="me" lines="one" maxLength={300} value={form.todo} onChange={(todo) => setForm((f) => ({ ...f, todo }))} />
            )}
            <Choice
              label={strategyName ? 'Which Strategy does it serve?' : 'Which Strategy?'}
              options={strategies}
              value={form.strategyId}
              onChange={(strategyId) => setForm((f) => ({ ...f, strategyId }))}
              form="rows"
            />
          </div>
        </SlidePanel>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ a saved check-in

function CheckinRead({ userId, today, loaded, row }) {
  const navigate = useNavigate();
  const sprint = useSprintPage(userId);
  const { data } = loaded;
  const { coach, eye } = useCheckinEye(userId, loaded);
  const previous = previousCheckin(data.checkins, row.month);
  const results = useMemo(() => checkinResults({ answers: row.answers || {}, previous }), [row.answers, previous]);
  const points = useMemo(() => checkinPoints(data.checkins.filter((c) => c.month <= row.month)), [data.checkins, row.month]);
  const checkinId = useRef(row.id);
  const when = row.finished_at ? formatSavedDate(getLocalDateKey(parseDbTimestamp(row.finished_at)), today) : monthFull(row.month);
  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="plan-page ipp-page ck-page">
        <PageHeader title={checkinTitle(row)} meta={['Hardware and Software check-in', when]} info={pageText.checkIn} />
        <Results
          userId={userId}
          today={today}
          kind={row.kind}
          coach={coach}
          results={results}
          points={points}
          goals={row.kind === 'first' ? row.goals || {} : null}
          note={data.notes?.find((n) => n.month === row.month)?.note || null}
          sprint={sprint}
          checkinId={checkinId}
          ensureCheckin={() => Promise.resolve(row.id)}
          month={row.month}
          eye={<div className="ck-eye">{eye}</div>}
        />
        <div className="ck-change">
          <Button onClick={() => navigate(`${checkinPath(row.month)}/answers`, { state: { from: checkinPath(row.month) } })}>Change my answers</Button>
        </div>
      </div>
    </div>
  );
}
