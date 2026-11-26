import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Empty, InlineChoice, useToast } from '../../components/design';
import { clockWords, deviceZone, zoneLabel } from '../../lib/time/index.js';
import { BOOKING_WORDS, bookButtonWords, bookingWords, freeDays, lateLine, MY_BOOKING_DAYS, mySessionWords, sociableStarts, EARLY_AND_LATE_LABEL } from '../../lib/coach/calendar';
import { bookMySession, cancelMySession, loadMySessions, loadMyTimes, moveMySession } from '../../lib/coach/bookingActions';

// A client's own sessions on their Coaching page (Phase 6a run 3, step 4):
// the sessions still to come, each with Move and Cancel, and "Book a
// session" from their coach's weekly hours less anything busy. The free
// times are worked out in the database (migration 051's my_ functions), so
// a client never sees their coach's calendar. Times are in the client's own
// time, with its city's name. Moving or cancelling inside 24 hours says
// first that it uses a session (050's late cancellation). Before 051 has
// run the section says one calm line, and the database is asked once an hour.

const DAY_MS = 86400000;
const DAYS_SHOWN = 5;
const NO_ANSWER = 'That didn’t go through. Check your connection and try again.';

/** The days and times a client can choose, in their own time. */
function Times({ starts, zone, minutes, chosen, onChoose }) {
  const [dayKey, setDayKey] = useState(null);
  const [earlyLate, setEarlyLate] = useState(false);
  const kept = useMemo(() => sociableStarts(starts, zone, minutes, earlyLate), [starts, zone, minutes, earlyLate]);
  const days = useMemo(() => freeDays(kept.shown, zone), [kept, zone]);
  const day = days.find((d) => d.day === dayKey) || days[0] || null;
  const toggle = <Button variant="text" aria-pressed={earlyLate} onClick={() => { setEarlyLate(!earlyLate); onChoose(null); }}>{earlyLate ? 'Hide early and late times' : EARLY_AND_LATE_LABEL}</Button>;
  if (!day) return <><p className="ipp-muted">{kept.hidden > 0 ? 'The free times are early or late where you are.' : 'There are no free times in the next 2 weeks. Ask your coach about a time.'}</p>{(kept.hidden > 0 || earlyLate) && toggle}</>;
  const at = Math.max(0, Math.floor(days.indexOf(day) / DAYS_SHOWN) * DAYS_SHOWN);
  return (
    <>
      <InlineChoice ariaLabel="Day" form="pills" options={days.slice(at, at + DAYS_SHOWN).map((d) => ({ value: d.day, label: d.label }))} value={day.day} onChange={(v) => { setDayKey(v); onChoose(null); }} />
      {days.length > DAYS_SHOWN && (
        <div className="coaching-acts coaching-acts--links">
          {at > 0 && <Button variant="text" onClick={() => { setDayKey(days[at - DAYS_SHOWN].day); onChoose(null); }}>Earlier days</Button>}
          {at + DAYS_SHOWN < days.length && <Button variant="text" onClick={() => { setDayKey(days[at + DAYS_SHOWN].day); onChoose(null); }}>Later days</Button>}
        </div>
      )}
      <div className="coaching-times" role="radiogroup" aria-label={`Times on ${day.title}, ${zoneLabel(zone)}`}>
        {day.starts.map((s) => <button key={s.getTime()} type="button" role="radio" aria-checked={chosen?.getTime() === s.getTime()} className="ds-answer" onClick={() => onChoose(s)}>{clockWords(s, zone)}</button>)}
      </div>
      {(kept.hidden > 0 || earlyLate) && <div className="coaching-acts coaching-acts--links">{toggle}</div>}
    </>
  );
}

/**
 * "Your sessions": shown to someone with a coach.
 * @param {{ coachName?: string, ready: boolean }} props `ready`: the coaching day's tables are there (051 needs them), so the database can be asked
 */
export default function CoachingSessions({ coachName = null, ready = true }) {
  const toast = useToast();
  const [zone] = useState(() => deviceZone());
  const [state, setState] = useState(ready ? undefined : { there: false, data: [] });
  const [mode, setMode] = useState(null); // { kind: 'book' } | { kind: 'move'|'cancel', session, late? }
  const [starts, setStarts] = useState(null);
  const [chosen, setChosen] = useState(null);
  const [problem, setProblem] = useState(null);
  const busy = useRef(false);
  const load = useCallback(() => loadMySessions().then(setState).catch(() => setState((was) => was || { there: true, data: [], down: true })), []);
  useEffect(() => { if (ready) load(); }, [ready, load]);
  const who = coachName || 'your coach';

  const openTimes = async (next, minutes = null) => {
    setMode(next); setChosen(null); setProblem(null); setStarts(null);
    try { const now = Date.now(); setStarts((await loadMyTimes(new Date(now), new Date(now + MY_BOOKING_DAYS * DAY_MS), minutes)).data); } catch { setStarts([]); setProblem(NO_ANSWER); }
  };
  const done = async (words) => { setMode(null); setChosen(null); toast.show(words); await load(); };
  const once = async (work) => {
    if (busy.current) return;
    busy.current = true;
    try { await work(); } catch { setProblem(NO_ANSWER); } finally { busy.current = false; }
  };
  const book = () => once(async () => {
    if (!chosen) { setProblem(BOOKING_WORDS.pick); return; }
    const answer = await bookMySession(chosen);
    const status = answer.there ? answer.data?.status : 'not_ready';
    if (status === 'booked') { await done('Booked'); return; }
    setProblem(bookingWords(status));
    if (status === 'taken') openTimes({ kind: 'book' }).then(() => setProblem(bookingWords('taken')));
  });
  const move = (lateOk) => once(async () => {
    if (!chosen) { setProblem(BOOKING_WORDS.pick); return; }
    const answer = await moveMySession(mode.session.session_id, chosen, lateOk);
    const status = answer.there ? answer.data?.status : 'not_ready';
    if (status === 'moved') { await done('Moved'); return; }
    if (status === 'late') { setMode({ ...mode, late: true }); return; }
    setProblem(bookingWords(status));
  });
  const cancel = (lateOk) => once(async () => {
    const answer = await cancelMySession(mode.session.session_id, lateOk);
    const status = answer.there ? answer.data?.status : 'not_ready';
    if (status === 'cancelled') { await done('Your session is cancelled.'); return; }
    if (status === 'late') { setMode({ ...mode, late: true }); return; }
    setProblem(bookingWords(status));
  });

  let body;
  if (state === undefined) body = <div role="status" aria-label="Loading" />;
  else if (!state.there) body = <p className="ipp-muted">{BOOKING_WORDS.not_ready}</p>;
  else {
    const late = mode?.session ? lateLine(mode.session.starts_at, new Date(), mode.kind === 'cancel' ? 'cancel' : 'move') : null;
    body = (
      <>
        {state.data.length === 0 && !mode && <Empty>No sessions are booked with {who} yet.</Empty>}
        {state.data.length > 0 && (
          <ul className="coaching-sessions" aria-label="Sessions to come">
            {state.data.map((s) => (
              <li key={s.session_id} className="coaching-session">
                <span className="coaching-session-when">{mySessionWords(s, zone)}</span>
                {s.meeting_link && /^https:\/\//.test(s.meeting_link) && <a className="ds-link" href={s.meeting_link} target="_blank" rel="noreferrer">Join on Zoom</a>}
                {!mode && (
                  <span className="coaching-session-acts">
                    <Button variant="text" aria-label={`Move the session on ${mySessionWords(s, zone)}`} onClick={() => openTimes({ kind: 'move', session: s }, s.minutes)}>Move</Button>
                    <Button variant="text" aria-label={`Cancel the session on ${mySessionWords(s, zone)}`} onClick={() => { setMode({ kind: 'cancel', session: s }); setProblem(null); }}>Cancel</Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {!mode && <div className="coaching-acts"><Button variant="outline" onClick={() => openTimes({ kind: 'book' })}>Book a session</Button></div>}

        {mode && mode.kind !== 'cancel' && (
          <div className="coaching-book" role="group" aria-label={mode.kind === 'move' ? 'Move the session' : 'Book a session'}>
            <p className="coaching-ask-line">{mode.kind === 'move' ? `Choose a new time for ${mySessionWords(mode.session, zone)}.` : `Choose a time with ${who}.`}</p>
            <p className="coaching-note">The times are in {zoneLabel(zone)}.</p>
            {late && <p className="coaching-late" role="status">{late.line}</p>}
            {starts === null ? <div role="status" aria-label="Loading" /> : <Times starts={starts} zone={zone} minutes={mode.session?.minutes || 60} chosen={chosen} onChoose={(s) => { setChosen(s); setProblem(null); }} />}
            {problem && <p className="coaching-problem" role="alert">{problem}</p>}
            <div className="coaching-acts">
              {mode.kind === 'book' && <Button variant="outline" onClick={book}>{chosen ? bookButtonWords(chosen, zone) : 'Book my session'}</Button>}
              {mode.kind === 'move' && <Button variant="outline" onClick={() => move(Boolean(late))}>{late ? late.go : chosen ? bookButtonWords(chosen, zone).replace(/^Book/, 'Move to') : 'Move my session'}</Button>}
              <Button variant="text" onClick={() => setMode(null)}>{late ? late.stay : 'Not now'}</Button>
            </div>
          </div>
        )}
        {mode?.kind === 'cancel' && (
          <div className="coaching-book" role="group" aria-label="Cancel the session">
            <p className="coaching-ask-line">Cancel the session on {mySessionWords(mode.session, zone)}?</p>
            <p className="coaching-late" role="status">{late ? late.line : `${coachName || 'Your coach'} is told, and the time is free again.`}</p>
            {problem && <p className="coaching-problem" role="alert">{problem}</p>}
            <div className="coaching-acts">
              <Button variant="outline" onClick={() => cancel(Boolean(late))}>{late ? late.go : 'Cancel my session'}</Button>
              <Button variant="text" onClick={() => setMode(null)}>{late ? late.stay : 'Keep my session'}</Button>
            </div>
          </div>
        )}
      </>
    );
  }
  return <Card label="Your sessions" className="coaching-section">{body}</Card>;
}
