import { useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { InlineChoice, SlidePanel } from '../../components/design';
import { dayIn, dayKeyWords } from '../../lib/time/index.js';
import { chosenValue, isOver, NOT_YET_LINE, usedLine, WHAT_HAPPENED, WHAT_HAPPENED_QUESTION, withOutcome } from '../../lib/agreements/sessionOutcome';
import { agreementSessions, isSigned, sessionsIn, versionInForce } from '../../lib/agreements/duringAgreement';
import { TextLink } from './parts';
import './needsYou/needsyou.css';

// What happened? (Phase 6b run 3, Group D; M28 s-cal-session; brief items 44 to 46), mounted by Group A in
// calendarPanels.jsx. A coaching session past its time with nothing said yet opens this pop-up from the calendar
// (instead of its own page): It happened, Cancelled late (counts as used), Rearranged (not counted), Not sure yet. The
// choice counts against the agreement ("7 of 16 coaching sessions used.") and feeds the drafted invoices (as delivered,
// an organisation's). A Fathom summary marks it as happened by itself once Phase 6c wires it in, and says so; the coach
// can change it. Saved through the calendar's one save (useCalendar().run), with Undo for 10 seconds. No-show stays on
// the session's own page (risk 27), so the pop-up links there. An agreement's or invoice's session row opens it in one
// click through /coach/calendar?item=<session id> (CalendarDeepLink).

const CHOICES = WHAT_HAPPENED.map((o) => ({ value: o.value ?? 'open', label: o.label }));
const WORDS = { held: 'Marked as happened.', late_cancel: 'Marked as cancelled late. It counts as used.', moved: 'Marked as rearranged. It isn’t counted.', open: 'Marked as not sure yet.' };

/** True when a tap on this entry opens "What happened?": a client's coaching session that is over and not said yet (or asked for by its link). */
export function opensWhatHappened(entry, now) {
  const s = entry?.session;
  if (!s || !s.profile_id || (s.kind && s.kind !== 'coaching')) return false;
  if (!isOver(s, typeof now === 'number' ? now : Date.parse(now) || Date.now())) return false;
  return Boolean(entry.whatHappened) || !s.outcome;
}

/** The agreement this session counts against, with its used line ("7 of 16 coaching sessions used."). */
function useAgreementLine(cal, session) {
  return useMemo(() => {
    if (!session?.profile_id) return '';
    const zone = cal.coachZone || 'Europe/London';
    for (const a of (cal.agreements || []).filter((x) => x.profile_id === session.profile_id)) {
      const v = versionInForce(cal.agreementVersions, a.id);
      if (!isSigned(v)) continue;
      const total = sessionsIn(v.terms);
      if (!total) continue;
      const list = agreementSessions({ agreement: a, terms: v.terms, sessions: cal.sessions, zone });
      if (list.some((s) => s.id === session.id)) return usedLine(list, total);
    }
    return '';
  }, [cal.agreements, cal.agreementVersions, cal.sessions, cal.coachZone, session?.id, session?.profile_id]);
}

/** The choice itself, saved at once through the calendar's run (Undo in its message). */
function Choice({ cal, session }) {
  const busy = useRef(false);
  const now = typeof cal.now === 'number' ? cal.now : Date.now();
  if (!isOver(session, now)) return <p className="cc-quiet">{NOT_YET_LINE}</p>;
  const value = chosenValue(session) ?? 'open';
  const choose = async (v) => {
    if (busy.current || v === value) return;
    busy.current = true;
    const next = withOutcome(session, v === 'open' ? null : v);
    await cal.run({ save: [['coach_sessions', next]], remove: [], undo: { save: [['coach_sessions', session]], remove: [] }, problem: null, words: WORDS[v] });
    busy.current = false;
  };
  return (
    <div className="ny-happened">
      <InlineChoice label={WHAT_HAPPENED_QUESTION} options={CHOICES} value={value} onChange={choose} semantics="radio" />
      {session.outcome === 'held' && session.outcome_source === 'fathom' && <p className="cc-note">Marked as happened when its Fathom summary arrived. Change it if that’s wrong.</p>}
      {session.outcome === 'no_show' && <p className="cc-note">Marked as missed on its own page, so it counts as used.</p>}
    </div>
  );
}

/** The pop-up "What happened?" for a session in the calendar (M28 s-cal-session). */
export function WhatHappenedPanel({ cal, entry, onClose }) {
  const navigate = useNavigate();
  const shown = useRef(entry);
  if (entry) shown.current = entry;
  const e = shown.current;
  // The session as the device holds it now, so a choice made here shows at once.
  const s = e?.session ? (cal.sessions || []).find((x) => x.id === e.session.id) || e.session : null;
  const line = useAgreementLine(cal, s);
  const client = s ? (cal.clients || []).find((c) => c.id === s.profile_id) : null;
  const zone = cal.coachZone || 'Europe/London';
  return (
    <SlidePanel open={Boolean(entry && s)} onClose={onClose} title={s ? dayKeyWords(dayIn(zone, new Date(s.starts_at))) : 'A coaching session'}>
      {s && (
        <div className="ny-panel">
          <p className="ny-meta"><span>{client?.name || e.title}</span><span>{`${s.minutes || 60} minutes`}</span><span>{e.sub || (s.place && !/^https?:/i.test(s.place) ? 'In person' : 'Zoom')}</span></p>
          <Choice cal={cal} session={s} />
          {line && <p className="ny-hint">{line}</p>}
          <div className="cc-acts"><TextLink onClick={() => { onClose(); navigate(`/coach/sessions/${s.id}`); }}>Open the session</TextLink></div>
        </div>
      )}
    </SlidePanel>
  );
}

/** The same choice inside the calendar item's own panel, for an item with a coaching session that is over. */
export function WhatHappened({ cal, entry }) {
  const s = entry?.session ? (cal.sessions || []).find((x) => x.id === entry.session.id) || entry.session : null;
  const line = useAgreementLine(cal, s);
  if (!s || !s.profile_id || !isOver(s, typeof cal.now === 'number' ? cal.now : Date.now())) return null;
  return (
    <>
      <Choice cal={cal} session={s} />
      {line && <p className="cc-note">{line}</p>}
    </>
  );
}

/** /coach/calendar?item=<session id>: opens that session's pop-up once, then takes the address back to the calendar's. */
export function CalendarDeepLink({ cal, open }) {
  const [params, setParams] = useSearchParams();
  const id = params.get('item');
  const done = useRef(null);
  const s = id ? (cal.sessions || []).find((x) => x.id === id) : null;
  useEffect(() => {
    if (!id || !s || done.current === id) return;
    done.current = id;
    const zone = cal.coachZone || 'Europe/London';
    const day = dayIn(zone, new Date(s.starts_at));
    let e = null;
    try { e = cal.entriesFor(day, day, { showTodos: false }).find((x) => x.session?.id === id) || null; } catch { e = null; }
    const client = (cal.clients || []).find((c) => c.id === s.profile_id);
    const startsAt = new Date(s.starts_at);
    const entry = { ...(e || { key: `session:${s.id}`, type: 'session', kind: 'client_call', colour: 'client', title: client?.name || 'Session', startsAt, endsAt: new Date(startsAt.getTime() + (Number(s.minutes) || 60) * 60000), fromDay: day, isCall: true }), session: s, whatHappened: true };
    open(entry);
    const next = new URLSearchParams(params);
    next.delete('item');
    setParams(next, { replace: true });
  }, [id, s, cal, open, params, setParams]);
  return null;
}
