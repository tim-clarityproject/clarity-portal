import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AddButton, OfferRow, PageHeader, useIsPhone } from '../../components/design';
import { birthdaysOn, dayWords, possessive } from '../../lib/coach/model';
import { rowsOf } from '../../lib/coach/store';
import {
  ATTENTION_FIRST, attentionRows, callLength, callsOn, clockTime, dayLoad, OFFERS, recapNudgeLine, todayOffer, todayTodos,
} from '../../lib/coach/day';
import { usePressure } from '../../lib/coach/dayData';
import { clockChangeLines, coachZoneOf } from '../../lib/coach/calendar';
import { deviceZone } from '../../lib/time/index.js';
import { InlineLink, Row, TextLink, useCoachPortal } from './parts';
import { QuickAddPanel, TodoBulkBar, TodoList, TodoPanel, useTodoPicks } from './todoParts';
import {
  CallRow, CapacityFigures, ClosePanel, EnergyPanel, FINANCES_EXAMPLE, FinancesLine, financesShown, MovePanel, OverLine, OverPanel, PlanPanel,
  ReviewPanel, useCallWords, useDayRows,
} from './todayParts';
import NameNote from './NameNote';
import { checkInsDue, checkInsOn } from '../../lib/coach/crm';
import { TODAY_KEEP_IN_TOUCH, todayKeepInTouch } from '../../lib/coach/network';
import { CheckInPanel } from './pastParts';
import './today.css';

// Today (M11; Phase 6a run 2, step 3), top to bottom: the date and any
// quiet lines (a birthday, a recap still unsent a day after its call), the
// one offer row (Plan my day, Close the day, the Weekly review, Rate my
// energy), today's calls, the coach's own to-dos with the over-full line,
// who needs attention (coaching facts only), Keep in touch (past clients'
// check-ins that are due: run 4), the pressure forecast (shared
// work peak moments in the next 7 days) and capacity. The owner's Finances
// line waits for Phase 6b; an associate's Supervision and Your hours and
// pay come with later runs. The calendar is run 3: sessions are added from
// a client's page for now.

const LIVE = typeof __CLARITY_LIVE__ !== 'undefined' && __CLARITY_LIVE__;
// The brief before a call (its own builder's file): opened from a call's row.
const BriefPanel = lazy(() => import('./Brief').then((m) => ({ default: m.BriefPanel || m.default })));
const OFF_KEY = 'clarity-coach-offer-off';

/** The offers put off with Not now: kept for the visit (this tab) and for today only. */
function usePutOff(todayKey) {
  const read = () => {
    try { const kept = JSON.parse(window.sessionStorage.getItem(OFF_KEY) || 'null'); return kept && kept.day === todayKey && Array.isArray(kept.off) ? kept.off : []; } catch { return []; }
  };
  const [off, setOff] = useState(read);
  useEffect(() => { setOff(read()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [todayKey]);
  const putOff = (key) => setOff((list) => {
    const next = [...new Set([...list, key])];
    try { window.sessionStorage.setItem(OFF_KEY, JSON.stringify({ day: todayKey, off: next })); } catch { /* for this page only */ }
    return next;
  });
  return [off, putOff];
}

function Section({ title, aside, headRef, children }) {
  return (
    <section className="ds-section cc-part cc-today-part">
      <div className="ds-section-head cc-today-head"><h2 className="ds-section-title" ref={headRef} tabIndex={headRef ? -1 : undefined}>{title}</h2>{aside}</div>
      {children}
    </section>
  );
}

export default function Today() {
  const { state, clients, groups, todos, sessions, sessionPeople, settings, todayKey, now, coach, isOwner, calItems, checkIns, organisations } = useCoachPortal();
  const navigate = useNavigate();
  const isPhone = useIsPhone();
  const { day, week } = useDayRows();
  const callWords = useCallWords();
  const picks = useTodoPicks();
  const [note, setNote] = useState(null);
  const [panel, setPanel] = useState(null); // 'plan' | 'close' | 'review' | 'energy' | 'over' | 'move' | 'add'
  const [openId, setOpenId] = useState(null);
  const [briefId, setBriefId] = useState(null);
  const [briefAsked, setBriefAsked] = useState(false);
  const [allAttention, setAllAttention] = useState(false);
  const [off, putOff] = usePutOff(todayKey);

  const abouts = rowsOf(state, 'client_about').filter((a) => a.coach_id === coach.id);
  const birthdays = birthdaysOn(abouts, clients, todayKey);
  const nudge = recapNudgeLine({ sessions, clients, groups, now, todayKey });
  // A clock-change week (time-zone-safeguards.md, rule 1): one quiet line from the Monday before, saying which calls move for the coach.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const clockLines = useMemo(() => clockChangeLines({ items: calItems, sessions, clients, now, coachZone: coachZoneOf(settings, deviceZone()) }), [calItems, sessions, clients, settings, todayKey]);

  const offer = todayOffer({ now, todayKey, day, week, settings, putOff: off });
  const calls = useMemo(() => callsOn(sessions, todayKey), [sessions, todayKey]);
  const today = useMemo(() => todayTodos(todos, todayKey), [todos, todayKey]);
  const load = dayLoad({ sessions, todos, settings, dayKey: todayKey });

  const attention = useMemo(() => attentionRows({
    clients,
    engagements: rowsOf(state, 'engagements').filter((e) => e.coach_id === coach.id),
    packs: rowsOf(state, 'engagement_packs'),
    entries: rowsOf(state, 'time_entries'),
    sessions, people: sessionPeople, now, todayKey,
  }), [clients, state, coach.id, sessions, sessionPeople, now, todayKey]);
  const attentionShown = allAttention ? attention : attention.slice(0, ATTENTION_FIRST);
  const pressure = usePressure(clients, todayKey);
  // Keep in touch (run 4): past clients' check-ins that are due, one quiet line each (each coach's own). The people in
  // Network who are due a catch-up join this same section (`due`: network.js's todayDueQuery, the owner's alone).
  const [checkInId, setCheckInId] = useState(null);
  const dueCheckIns = useMemo(() => (checkInsOn(settings) ? checkInsDue(checkIns, clients.filter((p) => p.status === 'past'), { todayKey, organisations }) : []), [settings, checkIns, clients, todayKey, organisations]);
  const keep = todayKeepInTouch({ due: null, checkIns: dueCheckIns.slice(0, TODAY_KEEP_IN_TOUCH), today: todayKey });

  const close = () => setPanel(null);
  // Choose what to move opens from the over-full panel, whose own opener is the line's link. When it closes,
  // the keyboard goes back to that link, or to the To-dos heading once the day fits and the line has gone.
  const todosRef = useRef(null);
  const wasPanel = useRef(null);
  useEffect(() => {
    const before = wasPanel.current;
    wasPanel.current = panel;
    if (before !== 'move' || panel) return undefined;
    const frame = requestAnimationFrame(() => {
      if (document.activeElement && document.activeElement !== document.body) return;
      (document.querySelector('.cc-today-over .cc-inline-link') || todosRef.current)?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [panel]);
  const openBrief = (id) => { setBriefAsked(true); setBriefId(id); };

  return (
    <div className="cc-page">
      <div className="cc-col">
        <PageHeader title="Today" meta={[dayWords(todayKey, todayKey)]} />
        {isOwner && financesShown() && <FinancesLine {...FINANCES_EXAMPLE} onOpen={LIVE ? undefined : () => navigate('/coach/finances')} />}
        {birthdays.map((p) => (
          <p key={p.id} className="cc-quiet">
            It’s <InlineLink onClick={() => setNote(p)}>{possessive(p.name)}</InlineLink> birthday today.
          </p>
        ))}
        {clockLines.map((line) => <p key={line} className="cc-quiet">{line}</p>)}
        {nudge && (
          <p className="cc-quiet cc-today-recap">
            <span>{nudge.line}</span>
            <TextLink onClick={() => navigate(`/coach/sessions/${nudge.session.id}`)}>Send the recap</TextLink>
          </p>
        )}

        {offer && <OfferRow className="cc-today-offer" action={OFFERS[offer].title} detail={OFFERS[offer].time} onTake={() => setPanel(offer)} onNotNow={() => putOff(offer)} />}

        <Section title="Calls">
          {calls.length === 0 && <p className="cc-quiet">No calls today.</p>}
          {calls.length > 0 && (
            <div className="cc-today-calls" role="list" aria-label="Today’s calls">
              {calls.map((s) => {
                const w = callWords(s);
                const length = callLength(s);
                return (
                  <CallRow
                    key={s.id}
                    time={clockTime(s.starts_at)}
                    name={w.name}
                    facts={w.facts}
                    length={length}
                    label={`${clockTime(s.starts_at)}, ${w.name}, ${[...w.facts, length].join(', ')}. ${w.group ? 'Open the group' : 'Open the brief'}`}
                    onOpen={() => (w.group ? w.to && navigate(w.to) : openBrief(s.id))}
                  />
                );
              })}
            </div>
          )}
        </Section>

        <Section title="To-dos" headRef={todosRef} aside={<TextLink onClick={() => navigate('/coach/todos')}>View all to-dos</TextLink>}>
          {today.work.length === 0 && today.afterWork.length === 0 && <p className="cc-quiet">Nothing is planned for today.</p>}
          {today.work.length > 0 && <TodoList todos={today.work} view="today" label="To-dos" picks={picks} onOpen={setOpenId} reorder dropPatch={{ after_work: false }} />}
          <OverLine over={load.over} onOpen={() => setPanel('over')} />
          {today.afterWork.length > 0 && (
            <>
              <h3 className="cc-todo-group">After work</h3>
              <TodoList todos={today.afterWork} view="today" label="After work" picks={picks} onOpen={setOpenId} reorder dropPatch={{ after_work: true }} />
            </>
          )}
          <div className="cc-add"><AddButton onClick={() => setPanel('add')}>Add to-do</AddButton></div>
        </Section>

        {attention.length > 0 && (
          <Section title="Who needs attention">
            <div className="cc-today-atts" role="list" aria-label="Who needs attention">
              {attentionShown.map((r) => (
                <div key={r.key} className="cc-today-att" role="listitem">
                  <b>{r.name}</b>
                  <small>{r.line}</small>
                  {(!r.later || !LIVE) && <TextLink onClick={() => navigate(r.to)}>{r.action}</TextLink>}
                </div>
              ))}
            </div>
            {attention.length > ATTENTION_FIRST && (
              <div className="cc-acts cc-today-more"><TextLink aria-expanded={allAttention} onClick={() => setAllAttention((v) => !v)}>{allAttention ? 'Show fewer' : `Show all ${attention.length}`}</TextLink></div>
            )}
          </Section>
        )}

        {keep && (
          <Section title={keep.title}>
            <div className="cc-rows cc-today-rows">
              {keep.checkIns.map((c) => <Row key={c.id} title={c.name} facts={[c.sub]} when={c.when} label={`${c.line} Open the note`} onClick={() => setCheckInId(c.id)} />)}
            </div>
            {dueCheckIns.length > keep.checkIns.length && <div className="cc-acts cc-today-more"><TextLink onClick={() => navigate('/coach/clients/past')}>Show all {dueCheckIns.length} check-ins</TextLink></div>}
          </Section>
        )}

        {pressure.length > 0 && (
          <Section title="Pressure forecast">
            <div className="cc-rows cc-today-rows">
              {pressure.map((r) => (
                <Row key={r.key} title={r.name} facts={[isPhone ? r.short : r.moment]} when={r.when} label={`${r.name}, ${r.moment}, ${r.when}`} onClick={() => navigate(`/coach/clients/${r.profileId}`)} />
              ))}
            </div>
          </Section>
        )}

        <Section title="Capacity" aside={<TextLink aria-label="Edit capacity" onClick={() => navigate('/coach/settings/hours')}>Edit</TextLink>}>
          <CapacityFigures sessions={sessions} target={coach.capacity_hours_week} todayKey={todayKey} />
        </Section>

        <NameNote profile={note} reason="It’s their birthday today." onClose={() => setNote(null)} />
      </div>

      <CheckInPanel checkInId={checkInId} onClose={() => setCheckInId(null)} />
      <TodoBulkBar picks={picks} />
      <TodoPanel id={openId} onClose={() => setOpenId(null)} />
      <QuickAddPanel open={panel === 'add'} onClose={close} defaultDay={todayKey} />
      <PlanPanel open={panel === 'plan'} onClose={close} />
      <ClosePanel open={panel === 'close'} onClose={close} />
      <ReviewPanel open={panel === 'review'} onClose={close} />
      <EnergyPanel open={panel === 'energy'} onClose={close} />
      <OverPanel open={panel === 'over'} onClose={close} onMove={() => setPanel('move')} />
      <MovePanel open={panel === 'move'} onClose={close} />
      {briefAsked && <Suspense fallback={null}><BriefPanel sessionId={briefId} onClose={() => setBriefId(null)} /></Suspense>}
    </div>
  );
}
