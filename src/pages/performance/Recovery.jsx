import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import DesignHeader from '../../components/DesignHeader';
import { BackLink } from '../../components/ui/DiscardLink';
import {
  Button,
  Checkbox,
  Choice,
  DayCounter,
  ErrorMessage,
  Loading,
  NumberField,
  PageHeader,
  RecoveryBanner,
  RecoveryLinks,
  SlidePanel,
  TextBox,
  Tile,
  WhoSees,
  useToast,
} from '../../components/design';
import { useRecoveryPage } from '../../lib/performance/hooks';
import { loadSleep, saveRechargeAnswer, saveSleep } from '../../lib/performance/api';
import {
  daysLeftWords,
  dayCountWords,
  greeting,
  localToday,
  RECHARGE_MAX,
  RECOVERY_MAX_DAYS,
  RECOVERY_MIN_DAYS,
  RECOVERY_SUGGESTED_DAYS,
  recoveryView,
} from '../../lib/performance';
import { useDraft } from '../../lib/drafts';
import { friendlyError } from '../../lib/friendlyError';
import { useRecoveryActions } from './recoveryActions';
import './performance.css';

// Recovery, started any time (mock-up M15; Tim, 26 Oct, 12:03 to 16:30),
// for when someone is overwhelmed, overworked or close to burnout, even
// mid-sprint. Three screens:
//
//   /recovery            Take a recovery week: how long (the day counter,
//                        1 to 30 days, 1 week suggested), what changes,
//                        "Let [coach] know" (ticked; left out with no
//                        coach), Start my recovery.
//   /recovery/today      The recovery day (M15 "Home in recovery", here
//                        until Home is rebuilt in Phase 4): the banner,
//                        "What would help you recharge today?", Sleep and
//                        Breathe, Add a few more days, I'm ready to go again.
//   /recovery/check-in   The end check-in, "How are you feeling?", which
//                        shows once the chosen end has come; with ?add=1,
//                        Add a few more days on the same counter.
//
// The sprint clock pauses and its end moves later (methods M0.4, through
// src/lib/performance); scores and standards are hidden on every page
// until "Show my results" (that visit only). The coach sees only that it
// started and until when, and only when "Let [coach] know" is ticked
// (recovery_periods' rules); never why.

function Shell({ back, children }) {
  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="plan-page ipp-page rec-page">
        {back && <div className="plan-back-row"><BackLink onClick={back.onClick} label={back.label} /></div>}
        {children}
      </div>
    </div>
  );
}

function useRecovery() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const loaded = useRecoveryPage(userId);
  const today = localToday();
  const view = useMemo(() => (loaded.data ? recoveryView(loaded.data, { today }) : null), [loaded.data, today]);
  return { ...loaded, view, today, userId };
}

function Waiting({ loading, error, label }) {
  if (loading) return <Loading label={label} className="ds-loading--page" />;
  if (error) {
    return (
      <div className="ipp-gap">
        <ErrorMessage keepsHappening>That didn’t load. Check your connection and try again.</ErrorMessage>
      </div>
    );
  }
  return null;
}

// ---------------------------------------------------------------- Take a recovery week

export default function RecoveryStart() {
  const navigate = useNavigate();
  const { view, loading, error, setData, today } = useRecovery();
  const actions = useRecoveryActions({ setData });
  const [days, setDays] = useState(RECOVERY_SUGGESTED_DAYS);
  const [tell, setTell] = useState(true);
  const back = { label: 'Performance Sprint', onClick: () => navigate('/performance-sprint') };
  // The days chosen and the tick survive Back, Forward and a refresh
  // (break-it tester); starting it clears them.
  const { clear: clearDraft } = useDraft({
    userId: actions.userId,
    name: 'recovery-start',
    value: { days, tell },
    ready: Boolean(view) && view.state !== 'open',
    onRestore: (d) => {
      if (Number.isInteger(d?.days)) setDays(Math.min(RECOVERY_MAX_DAYS, Math.max(RECOVERY_MIN_DAYS, d.days)));
      if (typeof d?.tell === 'boolean') setTell(d.tell);
    },
  });

  if (!view) {
    return <Shell back={back}><Waiting loading={loading} error={error} label="Loading" /></Shell>;
  }
  // One Recovery at a time: an open one goes to its day.
  if (view.state === 'open') return <Navigate to="/recovery/today" replace />;

  const coach = view.coach;
  const pauses = view.sprint
    ? 'Your sprint pauses, and picks up where it left off when you’re back.'
    : 'No sprint is running, so your next one waits until you’re back.';
  return (
    <Shell back={back}>
      <p className="rec-label">Recovery</p>
      <h1 className="ds-question rec-question">How long would you like to recover for?</h1>
      <p className="rec-nudge">Pick what feels right.</p>
      <p className="rec-nudge">You can end it early or add a few days.</p>
      <div className="rec-counter">
        <DayCounter
          value={days}
          onChange={setDays}
          min={RECOVERY_MIN_DAYS}
          max={RECOVERY_MAX_DAYS}
          words={dayCountWords}
          suggested={RECOVERY_SUGGESTED_DAYS}
          label="How many days?"
        />
      </div>
      <p className="rec-note" aria-live="polite">{`Your recovery ends on ${view.endsOn(days)}.`}</p>
      <div className="rec-box">
        <p className="rec-box-title">While you’re in recovery</p>
        <ul className="rec-list">
          <li>{pauses}</li>
          <li>Your scores and standards are hidden, so nothing counts against you.</li>
          <li>Plan, review and logging reminders pause, and coaching session reminders carry on.</li>
        </ul>
      </div>
      {coach && (
        <div className="rec-tick">
          <Checkbox checked={tell} onChange={setTell}>
            <span className="rec-tick-name">{`Let ${coach} know`}</span>
            <span className="rec-tick-line">{`${coach} will see that you’ve started a recovery week, and until when.`}</span>
          </Checkbox>
        </div>
      )}
      <div className="ds-actions rec-actions">
        <Button
          variant="primary"
          disabled={actions.working}
          onClick={() => actions.start({ sprintId: view.sprintId, today, days, letCoachKnow: Boolean(coach) && tell, onStarted: clearDraft })}
        >
          Start my recovery
        </Button>
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------- the recovery day

const SAVE_DELAY_MS = 800;
const QUALITY = [
  { value: 'very_poor', label: 'Very poor' },
  { value: 'poor', label: 'Poor' },
  { value: 'fair', label: 'Fair' },
  { value: 'good', label: 'Good' },
  { value: 'very_good', label: 'Very good' },
];

/** The hour on the device's own clock (M0.2: the person's day is the device's). */
function localHour() {
  return new Date().getHours();
}

export function RecoveryToday() {
  const navigate = useNavigate();
  const toast = useToast();
  const { view, data, loading, error, setData, today, userId } = useRecovery();
  const actions = useRecoveryActions({ setData });
  const open = view?.state === 'open' ? view.recovery : null;
  const [text, setText] = useState(null);
  const [shared, setShared] = useState(null);
  const [save, setSave] = useState(null);
  const [sleepOpen, setSleepOpen] = useState(false);
  const timer = useRef(null);
  const latest = useRef({});

  const saved = view?.answer || null;
  const shownText = text ?? saved?.answer ?? '';
  const shownShared = shared ?? saved?.shared ?? false;
  latest.current = { text: shownText, shared: shownShared, recoveryId: open?.id || null, today, savedId: saved?.id || null };

  const { clear } = useDraft({
    userId,
    name: `recharge:${open?.id || 'none'}:${today}`,
    value: text,
    ready: Boolean(open),
    onRestore: (d) => {
      if (typeof d === 'string' && d !== (saved?.answer || '')) {
        setText(d);
        queueSave(d, shownShared);
      }
    },
  });

  // Read through a ref, so a save sent on leaving the page still knows
  // which Recovery and day it is for.
  const send = async (value, isShared) => {
    const { recoveryId, today: day, savedId } = latest.current;
    if (!recoveryId) return;
    setSave('saving');
    try {
      const r = await saveRechargeAnswer(userId, recoveryId, day, value, isShared);
      // Superseded: another window changed it first; the page shows the latest.
      if (r?.status === 'superseded') {
        setSave('idle');
        return;
      }
      setSave(r?.status === 'queued' ? 'offline' : 'saved');
      const t = (value || '').trim();
      setData((d) => (d ? {
        ...d,
        answers: [
          ...(d.answers || []).filter((a) => !(a.recovery_id === recoveryId && a.local_date === day)),
          ...(t ? [{ id: savedId || `device-${day}`, recovery_id: recoveryId, local_date: day, answer: t, shared: isShared }] : []),
        ],
      } : d));
      clear();
    } catch (e) {
      setSave(null);
      toast.error(friendlyError(e, 'That didn’t save. Check your connection and try again.'));
      throw e;
    }
  };

  function queueSave(value, isShared) {
    clearTimeout(timer.current);
    setSave('saving');
    timer.current = setTimeout(() => {
      timer.current = null;
      send(value, isShared).catch(() => {});
    }, SAVE_DELAY_MS);
  }

  // Leaving the page sends what is still waiting for its delay.
  useEffect(() => () => {
    if (timer.current) {
      clearTimeout(timer.current);
      send(latest.current.text, latest.current.shared).catch(() => {});
    }
    // Once, on leaving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!view) {
    return <Shell><Waiting loading={loading} error={error} label="Loading" /></Shell>;
  }
  if (!open) return <Navigate to={view.state === 'none' ? '/recovery' : '/performance-sprint'} replace />;
  // The chosen end has come: the check-in asks how they are (audit 4.7).
  if (view.due) return <Navigate to="/recovery/check-in" replace />;

  const name = view.firstName ? `${greeting(localHour())}, ${view.firstName}` : greeting(localHour());
  const coach = view.coach;
  const changeWho = async (audience) => {
    const next = audience === 'coach';
    setShared(next);
    // With nothing written yet, the choice waits for the answer.
    if (shownText.trim()) {
      clearTimeout(timer.current);
      timer.current = null;
      await send(shownText, next);
    }
  };
  return (
    <Shell back={{ label: 'Performance Sprint', onClick: () => navigate('/performance-sprint') }}>
      <PageHeader title={name} />
      <RecoveryBanner className="rec-banner" until={`You’re in recovery until ${view.untilText}.`} left={daysLeftWords(view.daysLeft)} />

      <section className="rec-q" aria-labelledby="rec-q">
        <h2 id="rec-q" className="rec-qh">What would help you recharge today?</h2>
        <TextBox
          className="rec-text"
          ariaLabel="What would help you recharge today?"
          placeholder="e.g. An evening with no screens"
          maxLength={RECHARGE_MAX}
          value={shownText}
          onChange={(v) => { setText(v); queueSave(v, shownShared); }}
          saveState={save || undefined}
        />
        <div className="rec-qfoot">
          <p className="rec-hint">This is optional, like everything here.</p>
          {coach
            ? <WhoSees audience={shownShared ? 'coach' : 'me'} coachName={coach} name="Your recharge notes" onChange={changeWho} />
            : <WhoSees audience="me" />}
        </div>
      </section>

      <div className="rec-tiles">
        <Tile name="Sleep" description="How did you sleep last night?" note="~1 minute" onClick={() => setSleepOpen(true)} />
        <Tile name="Breathe" description="Slow your breathing to settle your body." note="1, 3 or 5 minutes" onClick={() => navigate('/breathe')} />
      </div>

      <RecoveryLinks
        className="rec-links"
        links={[
          { label: 'Add a few more days', onClick: () => navigate('/recovery/check-in?add=1') },
          { label: 'I’m ready to go again', onClick: () => actions.end(open, today), disabled: actions.working },
        ]}
      />

      <SleepPanel open={sleepOpen} onClose={() => setSleepOpen(false)} userId={userId} today={today} />
    </Shell>
  );
}

/** "How did you sleep last night?" (M15's Sleep tile): total hours and quality, on today's day plan. */
function SleepPanel({ open, onClose, userId, today }) {
  const toast = useToast();
  const [hours, setHours] = useState('');
  const [quality, setQuality] = useState(null);
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !userId) return;
    let live = true;
    loadSleep(userId, today).then((row) => {
      if (!live || !row) return;
      if (row.sleep_hours != null) setHours(String(Number(row.sleep_hours)));
      if (row.sleep_quality) setQuality(row.sleep_quality);
    }).catch(() => {});
    return () => { live = false; };
  }, [open, userId, today]);

  const keep = async () => {
    const typed = hours.replace(',', '.');
    const n = typed === '' ? null : Number(typed);
    if (n != null && (!Number.isFinite(n) || n < 0 || n > 24)) {
      setProblem('Any figure from 0 to 24.');
      return;
    }
    if (n == null && !quality) {
      setProblem('Add your hours or how well you slept, or close this.');
      return;
    }
    setBusy(true);
    try {
      await saveSleep(userId, today, { hours: n == null ? null : Math.round(n * 2) / 2, quality });
      toast.show('Saved');
      onClose();
    } catch (e) {
      toast.error(friendlyError(e, 'That didn’t save. Check your connection and try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SlidePanel
      open={open}
      onClose={() => { setProblem(null); onClose(); }}
      title={<span className="ipp-panel-title">How did you sleep last night?</span>}
      footer={<Button variant="primary" disabled={busy} onClick={keep}>Save my sleep</Button>}
    >
      <div className="rec-sleep">
        <div className="rec-sleep-row">
          <span className="ds-label-row-text" id="rec-hours">Total hours</span>
          <NumberField value={hours} onChange={(v) => { setHours(v); setProblem(null); }} decimals maxDigits={4} unit="hours" label="Total hours" size="box" />
        </div>
        {problem && <p className="rec-problem" role="alert">{problem}</p>}
        <Choice label="Quality" options={QUALITY} value={quality} onChange={(v) => { setQuality(v); setProblem(null); }} form="rows" />
        <div className="rec-sleep-who"><WhoSees audience="me" /></div>
      </div>
    </SlidePanel>
  );
}

// ---------------------------------------------------------------- the end check-in

export function RecoveryCheckIn() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const adding = params.get('add') === '1';
  const { view, loading, error, setData, today } = useRecovery();
  const actions = useRecoveryActions({ setData });
  const [feel, setFeel] = useState(adding ? 'more' : null);
  const [more, setMore] = useState(3);

  if (!view) {
    return <Shell><Waiting loading={loading} error={error} label="Loading" /></Shell>;
  }
  const open = view.state === 'open' ? view.recovery : null;
  if (!open) return <Navigate to={view.state === 'none' ? '/performance-sprint' : '/recovery'} replace state={location.state} />;

  // Back to where "Add a few more days" was tapped: the sprint or the recovery day.
  const back = location.state?.back || { label: 'Recovery', to: '/recovery/today' };
  const max = view.moreMax;
  const count = Math.min(more, Math.max(1, max));
  const sprint = view.sprint && !view.sprint.notStarted && !view.sprint.complete ? view.sprint : null;
  const counter = max > 0 ? (
    <>
      <div className="rec-counter">
        <DayCounter value={count} onChange={setMore} min={1} max={max} words={dayCountWords} label="How many more days?" />
      </div>
      <p className="rec-note" aria-live="polite">{`Your recovery would now end on ${view.endsAfter(count)}.`}</p>
    </>
  ) : (
    <p className="rec-note">Your recovery has had all the extra days it can.</p>
  );

  // Add a few more days, on its own (from the recovery day or the sprint).
  if (adding && !view.due) {
    return (
      <Shell back={{ label: back.label, onClick: () => navigate(back.to) }}>
        <p className="rec-label">Recovery</p>
        <h1 className="ds-question rec-question">How many more days?</h1>
        <p className="rec-nudge">{`Your recovery ends on ${view.untilText}.`}</p>
        {counter}
        <div className="ds-actions rec-actions">
          <Button variant="primary" disabled={actions.working || max <= 0} onClick={() => actions.extend(open, count, today)}>Add the days</Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="rec-label">Recovery</p>
      <h1 className="ds-question rec-question">How are you feeling?</h1>
      <p className="rec-nudge">
        {sprint ? 'Choose whether to pick up your sprint or take a few more days.' : 'Choose whether to come back now or take a few more days.'}
      </p>
      <div className="rec-feel">
        <Choice
          ariaLabel="How are you feeling?"
          options={[{ value: 'ready', label: 'I’m ready to go again' }, { value: 'more', label: 'A few more days' }]}
          value={feel}
          onChange={setFeel}
          form="rows"
        />
      </div>
      {feel === 'more' && (
        <>
          <p className="rec-q2">How many more days?</p>
          {counter}
        </>
      )}
      {feel && (
        <div className="ds-actions rec-actions">
          {feel === 'ready' ? (
            <Button variant="primary" disabled={actions.working} onClick={() => actions.end(open, today)}>
              {sprint ? 'Pick up my sprint' : 'I’m ready to go again'}
            </Button>
          ) : (
            <Button variant="primary" disabled={actions.working || max <= 0} onClick={() => actions.extend(open, count, today)}>Add the days</Button>
          )}
        </div>
      )}
    </Shell>
  );
}
