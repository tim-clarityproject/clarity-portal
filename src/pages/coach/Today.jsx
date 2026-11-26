import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AddLink, Button, Card, Loading, MoreLink, PageOpening, Row, Rows, useIsPhone, useToast } from '../../components/design';
import { dayTitle } from '../../components/design/Blocks';
import { COACH_TODAY, coachTodayLine, openSessionWords } from '../../content/pageLines/coach';
import { birthdaysOn, firstName, possessive } from '../../lib/coach/model';
import { loadCoach, rowsOf } from '../../lib/coach/store';
import {
  ATTENTION_FIRST, attentionRows, callsOn, clockTime, coveringRows, dayLoad, OFFERS, recapNudgeLine, todayOffer, todayTodos,
} from '../../lib/coach/day';
import { usePressure } from '../../lib/coach/dayData';
import { clockChangeLines, coachZoneOf } from '../../lib/coach/calendar';
import { deviceZone } from '../../lib/time/index.js';
import { InlineLink, TextLink, useCoachPortal } from './parts';
import { TodoBulkBar, TodoQuickAdd, TodoList, TodoPanel, useTodoPicks } from './todoParts';
import {
  ThisMonthCard, ThisWeekRows, ClosePanel, EnergyPanel, MovePanel, OverLine, OverPanel, PlanPanel,
  ReviewPanel, useCallWords, useDayRows,
} from './todayParts';
import NameNote from './NameNote';
import { YourHoursAndPay } from './AssociatePay';
import { checkInsDue, checkInsOn } from '../../lib/coach/pastClients';
import { networkPath, TODAY_KEEP_IN_TOUCH, todayKeepInTouch } from '../../lib/coach/network';
import { useNetworkDue } from './networkParts';
import { CheckInPanel } from './pastParts';
import './today.css';
import NeedsYou from './needsYou/NeedsYou';
import { attentionInvoices } from '../../lib/agreements/duringAgreement';
import { countFigure } from '../../lib/coach/numbers';

// Today (M11; Phase 6a run 2, step 3), top to bottom: the date and any
// quiet lines (a birthday, a recap still unsent a day after its call), the
// one offer row (Plan my day, Close the day, the Weekly review, Rate my
// energy), today's calls, the coach's own to-dos with the over-full line,
// who needs attention (coaching facts only), the clients the coach covers
// for another coach with the dates (tidy follow-up 3), Keep in touch (past clients'
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

export default function Today() {
  const { state, clients, groups, todos, sessions, sessionPeople, sessionsOlder, settings, todayKey, now, coach, coaches, isOwner, calItems, checkIns, organisations, partial, whole, invoices, admin, invoiceReminders, reminderPauses, userId } = useCoachPortal();
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

  // A first visit draws Today's calls, to-dos, Who needs attention and capacity from its first screen (store.js, 060);
  // the quiet lines and sections drawn from the rest (birthdays, Covering, Keep in touch) follow once it is in, so none
  // shows a partial list for a moment (coach first screen run).
  const abouts = rowsOf(state, 'client_about').filter((a) => a.coach_id === coach.id);
  const birthdays = partial ? [] : birthdaysOn(abouts, clients, todayKey);
  const nudge = recapNudgeLine({ sessions, clients, groups, older: sessionsOlder, now, todayKey });
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
    sessions, people: sessionPeople, older: sessionsOlder, now, todayKey,
    // Overdue invoices (Phase 6b run 1; 061): the coach's own, and for the owner every associate's, on the payer's clock.
    // Not those Needs you lists (an overdue invoice whose reminder waits for Send; Phase 6b run 3, risk 11).
    invoices: attentionInvoices(invoices, { reminders: invoiceReminders || [], pauses: reminderPauses || [], coachId: coach.id, today: todayKey }),
    coachId: coach.id, isOwner, admin, organisations, coaches, coachZone: coachZoneOf(settings, deviceZone()),
    reminders: invoiceReminders || [],
  }), [clients, state, coach.id, sessions, sessionPeople, sessionsOlder, now, todayKey, invoices, isOwner, admin, organisations, coaches, settings, invoiceReminders, reminderPauses]);
  const attentionShown = allAttention ? attention : attention.slice(0, ATTENTION_FIRST);
  // Send again, for one of the coach's own reminders whose sending couldn't be confirmed, once checked (follow-up 5).
  const toast = useToast();
  const sending = useRef(false);
  const sendAgain = async (reminderId) => {
    if (sending.current) return; // one request per press
    sending.current = true;
    try {
      const { coachBilling } = await import('../../lib/coach/financeActions');
      const answer = await coachBilling(userId, { kind: 'send_reminder', reminderId, again: true });
      if (answer.ok && answer.sent) toast.saved({ message: 'Reminder sent, with the payment link.' });
      else if (answer.ok && answer.settled) toast.show('That invoice has been settled, so no reminder is needed.');
      else if (answer.ok) toast.show('That reminder has already gone.');
      // The row goes once the device's copy knows (break-it tester, follow-up 5).
      if (answer.ok) loadCoach(userId, { again: true }).catch(() => {});
      else toast.error(answer.message || 'That reminder didn’t send. Check your connection and try again.');
    } catch { toast.error('That reminder didn’t send. Check your connection and try again.'); } finally { sending.current = false; }
  };
  // The clients this coach covers for another coach, with the dates (tidy follow-up 3, run 6's 14).
  const covering = useMemo(() => (partial ? [] : coveringRows({ covers: rowsOf(state, 'coach_cover'), coachId: coach.id, profiles: rowsOf(state, 'client_profiles'), coaches, todayKey })), [state, coach.id, coaches, todayKey, partial]);
  const pressure = usePressure(clients, todayKey);
  // Keep in touch (run 4): past clients' check-ins that are due, one quiet line each (each coach's own). The people in
  // Network who are due a catch-up join this same section (`due`: network.js's todayDueQuery, the owner's alone).
  const [checkInId, setCheckInId] = useState(null);
  const dueCheckIns = useMemo(() => (!partial && checkInsOn(settings) ? checkInsDue(checkIns, clients.filter((p) => p.status === 'past'), { todayKey, organisations }) : []), [settings, checkIns, clients, todayKey, organisations, partial]);
  const networkDue = useNetworkDue(whole);
  const keep = partial ? null : todayKeepInTouch({ due: networkDue, checkIns: dueCheckIns.slice(0, TODAY_KEEP_IN_TOUCH), today: todayKey });

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
  const openCall = (s, w) => (w.group ? w.to && navigate(w.to) : openBrief(s.id));

  // The page opening (polish 1, rule 12; the example's Coach Today): the date, TODAY, one line, and the next session's
  // main button. The line waits while only the first screen is here, so it never counts what hasn't come yet (rule 49).
  const [needsCount, setNeedsCount] = useState(null);
  const nowMs = now instanceof Date ? now.getTime() : Number(now) || Date.now();
  // The next session still to come: today's, else the next one booked (never a cancelled or moved one).
  const nextCall = useMemo(() => {
    const ends = (x) => new Date(x.starts_at).getTime() + (Number(x.minutes) || 60) * 60000;
    return calls.find((x) => ends(x) > nowMs)
      || [...(sessions || [])].filter((x) => x.starts_at && ends(x) > nowMs && (!x.outcome || x.outcome === 'held')).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))[0]
      || null;
  }, [calls, sessions, nowMs]);
  const nextWords = nextCall ? callWords(nextCall) : null;
  const line = partial || needsCount === null ? null : coachTodayLine({ sessions: calls.length, needs: needsCount });
  // The page's one main action (Tim's walk, item 23): the next session's, as the example; with no session today, the
  // offer for now (Plan my day, Close my day, Rate my energy, the Weekly review) as the button, "Not now" a quiet link
  // beside it. With a session, the offer is a quiet link beside the button.
  const offerWords = offer ? COACH_TODAY.offerButtons[offer] || OFFERS[offer].title : null;
  const notNow = offer ? <MoreLink bare className="cc-today-notnow" onClick={() => putOff(offer)}>{COACH_TODAY.offerNotNow}</MoreLink> : null;
  const action = nextCall && nextWords ? (
    <span className="cc-today-act">
      <Button variant="primary" onClick={() => openCall(nextCall, nextWords)}>
        {openSessionWords({ first: firstName(nextWords.name), group: nextWords.group ? nextWords.name : null })}
      </Button>
      {offer && <MoreLink className="cc-today-offerlink" onClick={() => setPanel(offer)}>{offerWords}</MoreLink>}
      {notNow}
    </span>
  ) : offer ? (
    <span className="cc-today-act">
      <Button variant="primary" onClick={() => setPanel(offer)}>{offerWords}</Button>
      {notNow}
    </span>
  ) : null;

  const needsCard = <NeedsYou todayKey={todayKey} partial={partial} onCount={setNeedsCount} />;
  const sessionsCard = (
    <Card label={COACH_TODAY.sessionsLabel} className="cc-part cc-today-sessions">
      {calls.length === 0 ? <p className="cc-quiet">{COACH_TODAY.sessionsNone}</p> : (
        <Rows label="Today’s calls" className="cc-today-calls">
          {calls.map((s) => {
            const w = callWords(s);
            return <Row key={s.id} name={w.name} value={[clockTime(s.starts_at), w.facts[w.facts.length - 1]].filter(Boolean).join(', ')} onClick={() => openCall(s, w)} />;
          })}
        </Rows>
      )}
    </Card>
  );
  const todosCard = (
    <Card
      label={COACH_TODAY.todosLabel}
      className="cc-part cc-today-todos"
      quickAdd={<TodoQuickAdd open={panel === 'add'} onClose={close} defaultDay={todayKey} />}
      add={(
        <span className="cc-today-heads">
          <MoreLink small onClick={() => navigate('/coach/todos')} aria-label="View all to-dos">{COACH_TODAY.todosAll}</MoreLink>
          <AddLink label="Add to-do" expanded={panel === 'add'} onClick={() => setPanel('add')} />
        </span>
      )}
    >
      <h3 className="ds-sr" ref={todosRef} tabIndex={-1}>{COACH_TODAY.todosLabel}</h3>
      {today.work.length === 0 && today.afterWork.length === 0 && <p className="cc-quiet">{COACH_TODAY.todosNone}</p>}
      {today.work.length > 0 && <TodoList todos={today.work} view="today" label="To-dos" picks={picks} onOpen={setOpenId} reorder dropPatch={{ after_work: false }} />}
      <OverLine over={load.over} onOpen={() => setPanel('over')} />
      {today.afterWork.length > 0 && (
        <>
          <h3 className="cc-todo-group">After work</h3>
          <TodoList todos={today.afterWork} view="today" label="After work" picks={picks} onOpen={setOpenId} reorder dropPatch={{ after_work: true }} />
        </>
      )}
    </Card>
  );
  const attentionCard = (attention.length > 0 || partial) && (
    <Card label={COACH_TODAY.attentionLabel} className="cc-part cc-today-attention">
      {/* While only the first screen is here the list waits on its crosshair: overdue invoices come with the rest
          and go first, so rows drawn now would be pushed out (coach rule 49; functionality tester, follow-up 5). */}
      {partial ? <Loading label="Loading who needs attention" /> : (
        <Rows className="cc-today-atts">
          {attentionShown.map((r) => {
            const act = r.reminderId ? <TextLink onClick={() => sendAgain(r.reminderId)}>{r.action}</TextLink>
              : r.to && r.action && (!r.later || !LIVE) ? <TextLink onClick={() => navigate(r.to, r.state ? { state: r.state } : undefined)}>{r.action}</TextLink> : null;
            return <Row key={r.key} name={r.name} sub={r.line} value={act} className="cc-today-attrow" />;
          })}
        </Rows>
      )}
      {/* The count waits while only the first screen is here: overdue invoices (061) and every coach's clients come
          with the rest, so "Show all" would count up a moment later (first screen check, Phase 6b run 2). */}
      {attention.length > ATTENTION_FIRST && !partial && (
        <div className="cc-acts cc-today-more"><TextLink aria-expanded={allAttention} onClick={() => setAllAttention((v) => !v)}>{allAttention ? 'Show fewer' : `Show all ${countFigure(attention.length)}`}</TextLink></div>
      )}
    </Card>
  );

  return (
    <div className="cc-page cc-today-page">
      <div className="cc-col cc-today-col">
        <PageOpening label={dayTitle(todayKey)} title="Today" line={line} action={action} />
        {(birthdays.length > 0 || clockLines.length > 0 || nudge) && (
          <div className="cc-today-quiet">
            {birthdays.map((p) => (
              <p key={p.id} className="cc-quiet">
                It’s <InlineLink onClick={() => setNote(p)}>{possessive(p.name)}</InlineLink> birthday today.
              </p>
            ))}
            {clockLines.map((l) => <p key={l} className="cc-quiet">{l}</p>)}
            {nudge && (
              <p className="cc-quiet cc-today-recap">
                <span>{nudge.line}</span>
                <TextLink onClick={() => navigate(`/coach/sessions/${nudge.session.id}`)}>Send the recap</TextLink>
              </p>
            )}
          </div>
        )}


        {/* Two columns on a laptop (the example's .cols): what needs the coach and today's work on the left, the month,
            the week and the quieter lists on the right. On a phone the right column comes first, as the example draws. */}
        <div className="ds-cols ds-cols--needs-first cc-today-cols">
          <div>
            {needsCard}
            {sessionsCard}
            {todosCard}
            {attentionCard}
            {covering.length > 0 && (
              <Card label="Covering" className="cc-part">
                <Rows label="Clients you’re covering">
                  {covering.map((r) => <Row key={r.id} name={r.title} sub={r.facts.filter(Boolean).join(', ')} />)}
                </Rows>
              </Card>
            )}
          </div>
          <div>
            {/* The owner's month (Phase 6b run 2; M11 C1): waits unshown while only a first screen is here (rule 49). */}
            {isOwner && !partial && <ThisMonthCard />}
            <Card label={COACH_TODAY.weekLabel} className="cc-part cc-today-week" link={{ children: COACH_TODAY.weekEdit, 'aria-label': 'Edit capacity', onClick: () => navigate('/coach/settings/hours') }}>
              <ThisWeekRows sessions={sessions} target={coach.capacity_hours_week} todayKey={todayKey} />
            </Card>
            {/* An associate's own hours and pay this month, never a business figure (Phase 6b run 2, step 5; M11 C13). */}
            {!isOwner && (
              <Card label="Your hours and pay" className="cc-part">
                <YourHoursAndPay />
              </Card>
            )}
            {keep && (
              <Card label={keep.title} className="cc-part cc-today-keep">
                {keep.people.length > 0 && (
                  <Rows>
                    {keep.people.map((p) => <Row key={p.id} name={p.name} sub={p.sub} label={p.line} onClick={() => navigate(networkPath({ person: p.id }))} />)}
                  </Rows>
                )}
                {keep.more && <div className="cc-acts cc-today-more"><TextLink onClick={() => navigate(networkPath())}>{keep.more}</TextLink></div>}
                {keep.checkIns.length > 0 && (
                  <Rows>
                    {keep.checkIns.map((c) => <Row key={c.id} name={c.name} sub={c.sub} value={c.when} label={c.line} onClick={() => setCheckInId(c.id)} />)}
                  </Rows>
                )}
                {dueCheckIns.length > keep.checkIns.length && <div className="cc-acts cc-today-more"><TextLink onClick={() => navigate('/coach/clients/past')}>Show all {countFigure(dueCheckIns.length)} check-ins</TextLink></div>}
              </Card>
            )}
            {pressure.length > 0 && (
              <Card label="Pressure forecast" className="cc-part">
                <Rows>
                  {pressure.map((r) => <Row key={r.key} name={r.name} sub={isPhone ? r.short : r.moment} value={r.when} onClick={() => navigate(`/coach/clients/${r.profileId}`)} />)}
                </Rows>
              </Card>
            )}
          </div>
        </div>

        <NameNote profile={note} reason="It’s their birthday today." onClose={() => setNote(null)} />
      </div>

      <CheckInPanel checkInId={checkInId} onClose={() => setCheckInId(null)} />
      <TodoBulkBar picks={picks} />
      <TodoPanel id={openId} onClose={() => setOpenId(null)} />
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
