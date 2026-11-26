import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BoldCrosshair, Button, Checkbox, Chevron, Dropdown, MonthGrid, MoreLink, PageOpening, TextBox, TextField } from '../../components/design';
import { dayTitle, monthTitle } from '../../components/design/Blocks';
import { getLocalDateKey } from '../../lib/dateFormatter';
import { BOOKING, bookingLine } from '../../content/pageLines/coach';
import { clockWords, deviceZone, zoneLabel } from '../../lib/time/index.js';
import { clean, isEmail } from '../../lib/coach/model';
import {
  BOOK_PATHS, bookButtonWords, bookedNextLine, bookedWhenWords, bookingFootLine, bookingWords, BOOKING_WORDS, bothTimes, callPlaceLine, EARLY_AND_LATE_LABEL, freeDays, guestLateLine, holidayLineFor, icsFile, icsName,
  pollOptionWords, questionLabel, sociableStarts, visitorDay, visitorZones,
} from '../../lib/coach/calendar';
import {
  askBookingEmail, cancelBooking, loadBookingPage, loadFreeTimes, loadMoveTimes, loadMyBooking, loadPollPage, makeBooking, moveBooking, sendPollVotes,
} from '../../lib/coach/bookingActions';
import { visitorCalendar } from '../../lib/coach/connect/visitorCalendar';
import './coach.css';
import './booking.css';

// The booking pages outside the portal (Phase 6a run 3; M11's two booking
// page screens), for people with no account:
//   /book/<a call type's page key>     the Discovery call or the Connection Call (each its own link; neither shows the other)
//   /book/link/<a single-use link>     the same page for one person, once
//   /book/mine/<the guest's own key>   their booking: Add to calendar, move it or cancel it
//   /poll/<a person's own key>         a poll's times, to tick the ones they can make
// They reach only migration 051's checked functions: the free times are
// worked out in the database, so nobody here ever sees the calendar. Times
// are in the visitor's own zone with its city's name, 07:00 to 20:00 unless
// they choose "Show early and late times", and a public holiday where they
// are is said before they book. Like the other outside pages they follow
// the device, light or dark. Before 051 has run each says one calm line.

const NO_CONNECTION = 'This needs a connection, so try again when you’re back online.';
const NO_ANSWER = 'That didn’t go through. Try again in a moment.';
const DAY_MS = 86400000;
const failed = () => (navigator.onLine === false ? NO_CONNECTION : NO_ANSWER);

// One left edge (Tim, 23 Nov 2026, 17:40; sign-in rule 49): a page with a form or
// a list is on the column's left edge; a short message (a title, a line or two and
// at most its one button and link) is centred throughout (`message`).
// Polish 1 (25 Nov; the example's booking page): one 480px column, the real crosshair
// at its top (28px; 40px and centred on a message such as "You're booked"), then the
// shared page opening.
function Frame({ children, message = false, mark = true }) {
  return (
    <div className={`ui-root cc-public cc-book${message ? ' cc-public--message cc-book--message' : ''}`}>
      <main className="cc-book-col" data-align={message ? 'centre' : 'start'}>
        {mark && <span className="cc-book-mark" aria-hidden="true"><BoldCrosshair size={message ? 40 : 28} /></span>}
        <span className="ds-sr">The Clarity Project</span>
        {children}
      </main>
    </div>
  );
}
const Calm = ({ title, children }) => <Frame message><PageOpening title={title} /><p className="cc-quiet" role="status">{children}</p></Frame>;

/** Add to calendar: the call as an .ics file made here in the page. */
function AddToCalendar({ uid, title, startsAt, endsAt, location = '', description = '' }) {
  const save = () => {
    const blob = new Blob([icsFile({ uid, title, startsAt, endsAt, location, description })], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = icsName(title);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <Button variant="outline" onClick={save}>Add to calendar</Button>;
}

const monthOf = (key) => `${key.slice(0, 7)}-01`;
const stepMonth = (key, by) => { const [y, m] = key.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + by, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`; };

/**
 * The days with a free time and that day's times, in the visitor's own zone (polish 1, rule 17; the example's
 * booking page): the month as a plain grid, days with no free time faded, the chosen day outlined; under it the
 * day's name as a small grey label and its free times as answer boxes. `starts` is every free start the database gave.
 */
function TimePicker({ starts, zone, minutes, chosen, onChoose, earlyLate, setEarlyLate, visitor = null }) {
  const [dayKey, setDayKey] = useState(null);
  const [month, setMonth] = useState(null);
  const [mine, setMine] = useState(false);
  const [events, setEvents] = useState([]);
  const kept = useMemo(() => sociableStarts(starts, zone, minutes, earlyLate), [starts, zone, minutes, earlyLate]);
  const days = useMemo(() => freeDays(kept.shown, zone), [kept, zone]);
  const day = days.find((d) => d.day === dayKey) || days[0] || null;
  const free = useMemo(() => new Set(days.map((d) => d.day)), [days]);
  const shownMonth = month || (day ? monthOf(day.day) : monthOf(getLocalDateKey()));
  const firstMonth = days.length ? monthOf(days[0].day) : shownMonth;
  const lastMonth = days.length ? monthOf(days[days.length - 1].day) : shownMonth;
  useEffect(() => {
    let live = true;
    if (!mine || !visitor || !day) { setEvents([]); return undefined; }
    visitor.eventsOn(day.day, zone).then((list) => { if (live) setEvents(list); }).catch(() => { if (live) setEvents([]); });
    return () => { live = false; };
  }, [mine, visitor, day?.day, zone]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (
    <button type="button" className="ds-link" aria-pressed={earlyLate} onClick={() => setEarlyLate(!earlyLate)}>{earlyLate ? 'Hide early and late times' : EARLY_AND_LATE_LABEL}</button>
  );
  // No free time at all (or only early and late ones): the month still shows as a grid with no day open, and the line
  // under it says why (Tim's walk of Stage A: the grid used to disappear).
  const noneLine = kept.hidden > 0 ? 'The free times are early or late where you are.' : 'There are no free times at the moment. Try again in a few days.';
  const time = (s) => (
    <button key={s.getTime()} type="button" role="radio" aria-checked={chosen?.getTime() === s.getTime()} className="ds-answer ds-answer--box cc-book-time" onClick={() => onChoose(s)}>{clockWords(s, zone)}</button>
  );
  const lay = mine && visitor && day ? visitorDay({ starts: day.starts, events, zone, minutes }) : null;
  const pct = (m) => `${((m - lay.fromMin) / (lay.toMin - lay.fromMin)) * 100}%`;
  const goMonth = (by) => {
    const next = stepMonth(shownMonth, by);
    setMonth(next);
    const first = days.find((d) => monthOf(d.day) === next);
    if (first) { setDayKey(first.day); onChoose(null); }
  };
  return (
    <>
      <div className="cc-book-monthbar">
        <h2 className="ds-q">{monthTitle(shownMonth)}</h2>
        <div className="cc-book-monthnav">
          <button type="button" className="ds-btn ds-btn--outline ds-btn--square" aria-label="Previous month" disabled={shownMonth <= firstMonth} onClick={() => goMonth(-1)}><Chevron direction="left" /></button>
          <button type="button" className="ds-btn ds-btn--outline ds-btn--square" aria-label="Next month" disabled={shownMonth >= lastMonth} onClick={() => goMonth(1)}><Chevron direction="right" /></button>
        </div>
      </div>
      <MonthGrid
        month={shownMonth}
        today={getLocalDateKey()}
        selected={day ? day.day : null}
        available={(k) => free.has(k)}
        onSelect={(k) => { if (free.has(k)) { setDayKey(k); onChoose(null); } }}
        label={`${monthTitle(shownMonth)}. ${BOOKING.dayLabel}`}
      />
      {!day && <p className="cc-quiet cc-book-none" role="status">{noneLine}</p>}
      {day && <div className="ds-open-label cc-book-dayname">{dayTitle(day.day)}</div>}
      {day && !lay && <div className="ds-choices cc-book-times" role="radiogroup" aria-label={`Times on ${day.title}, ${zoneLabel(zone)}`}>{day.starts.map(time)}</div>}
      {lay && (
        <div className="cc-book-both" style={{ '--book-hours': lay.hours.length }}>
          <div className="cc-book-both-head"><span /><span>Free times</span><span>{visitor.label}</span></div>
          <div className="cc-book-both-body">
            <div className="cc-book-both-hours" aria-hidden="true">{lay.hours.map((h) => <span key={h}>{h}</span>)}</div>
            <div className="cc-book-both-col" role="radiogroup" aria-label={`Times on ${day.title}, ${zoneLabel(zone)}`}>
              {lay.free.map((f) => <div key={f.start.getTime()} className="cc-book-both-slot" style={{ top: pct(f.fromMin), height: `calc(${pct(f.toMin)} - ${pct(f.fromMin)})` }}>{time(f.start)}</div>)}
            </div>
            <div className="cc-book-both-col" role="list" aria-label={visitor.label}>
              {lay.busy.map((b) => <div key={`${b.title}:${b.fromMin}`} role="listitem" className="cc-book-both-busy" style={{ top: pct(b.fromMin), height: `calc(${pct(b.toMin)} - ${pct(b.fromMin)})` }}>{b.title}</div>)}
            </div>
          </div>
        </div>
      )}
      <div className="cc-acts cc-book-toggles">
        {visitor && day && <button type="button" className="ds-link" aria-pressed={mine} onClick={() => setMine(!mine)}>{mine ? 'Hide my calendar' : 'Show my calendar'}</button>}
        {(kept.hidden > 0 || earlyLate) && toggle}
      </div>
    </>
  );
}

/** "Times are in New York time." with a quiet link that opens the time zone's drop-down. */
function ZoneLine({ zone, onZone }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="cc-book-zoneline">
      <p className="cc-book-note">
        {BOOKING.zoneLine(zoneLabel(zone))}{' '}
        {!open && <button type="button" className="ds-link cc-book-zonelink" aria-expanded={false} onClick={() => setOpen(true)}>{BOOKING.zoneEdit}</button>}
      </p>
      {open && <div className="cc-field cc-book-zone"><Dropdown label="Your time zone" options={visitorZones(deviceZone(), [zone])} value={zone} onChange={onZone} /></div>}
    </div>
  );
}

/** The holiday line for a chosen time, where the visitor is: "That’s Thanksgiving in the US." */
function useHolidayLine(start, zone) {
  const [line, setLine] = useState(null);
  const at = start ? start.getTime() : null;
  useEffect(() => {
    let live = true;
    setLine(null);
    if (at == null) return undefined;
    holidayLineFor(new Date(at), zone).then((l) => { if (live) setLine(l); }).catch(() => {});
    return () => { live = false; };
  }, [at, zone]);
  return line;
}

// ---------------------------------------------------------------- a booking page, or a single-use link

export function BookingPage() {
  const { key } = useParams();
  const [page, setPage] = useState(undefined); // undefined: loading; { there, data }
  const [starts, setStarts] = useState(null);
  const [zone, setZone] = useState(() => deviceZone());
  const [earlyLate, setEarlyLate] = useState(false);
  const [chosen, setChosen] = useState(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [answers, setAnswers] = useState({});
  const [problem, setProblem] = useState(null);
  const [booked, setBooked] = useState(null);
  const [emailed, setEmailed] = useState(false);
  const [step, setStep] = useState('time'); // 'time', then 'details' (the example's two screens)
  const busy = useRef(false);
  const visitor = useMemo(() => visitorCalendar(), []);
  const data = page?.data || null;
  const ahead = data?.ahead_weeks || 4;

  const loadTimes = useCallback(async () => {
    try {
      const now = Date.now();
      const answer = await loadFreeTimes(key, new Date(now), new Date(now + Math.min(45, ahead * 7) * DAY_MS));
      setStarts(answer.data);
    } catch { setStarts([]); }
  }, [key, ahead]);
  useEffect(() => {
    let live = true;
    loadBookingPage(key).then((p) => { if (live) { setPage(p); if (p.data?.for_name) setName(p.data.for_name); } }).catch(() => { if (live) setPage({ there: true, data: null, down: true }); });
    return () => { live = false; };
  }, [key]);
  const isOpen = data?.state === 'open';
  useEffect(() => { if (isOpen) loadTimes(); }, [isOpen, loadTimes]);
  useEffect(() => { document.title = data?.name ? `${data.name}, The Clarity Project` : 'The Clarity Project'; }, [data]);
  const holiday = useHolidayLine(chosen, zone);

  if (page === undefined) return <Frame message><div role="status" aria-label="Loading" /></Frame>;
  if (!page.there) return <Calm title="Book a call">{BOOKING_WORDS.not_ready}</Calm>;
  if (page.down) return <Calm title="Book a call">{failed()}</Calm>;
  if (!data) return <Calm title="Book a call">{BOOKING_WORDS.not_found}</Calm>;
  const who = data.coach_first_name ? `With ${data.coach_first_name}` : null;
  const meta = [who, callPlaceLine(data.minutes, data.place_kind)].filter(Boolean);
  if (booked) {
    const title = who ? `${data.name} ${who.toLowerCase()}` : data.name;
    // "You're booked": a centred short message (sign-in rule 49), its one button and one link.
    return (
      <Frame message>
        <PageOpening title={BOOKING.bookedTitle} line={`${bookedWhenWords(booked.starts_at, booked.time_zone)}. ${bookedNextLine(emailed)}`} />
        <span className="ds-sr" role="status">You’re booked for {bookedWhenWords(booked.starts_at, booked.time_zone)}.</span>
        <div className="cc-acts cc-book-after">
          <AddToCalendar uid={booked.guest_key} title={title} startsAt={booked.starts_at} endsAt={booked.ends_at} location={data.place_kind === 'zoom' ? 'Zoom' : ''} />
          <a className="ds-link" href={BOOK_PATHS.mine(booked.guest_key)}>Move or cancel this call</a>
        </div>
      </Frame>
    );
  }
  if (!isOpen) return <Frame message><PageOpening label={meta.join(', ')} title={data.name} /><p className="cc-quiet" role="status">{bookingWords(data.state)}</p></Frame>;

  const questions = (Array.isArray(data.questions) ? data.questions : []).filter((q) => questionLabel(q));
  const at = (k) => (problem?.at === k ? <p className="cc-problem" role="alert">{problem.line}</p> : null);
  const book = async (e) => {
    e.preventDefault();
    if (busy.current) return;
    if (!chosen) { setStep('time'); setProblem({ at: 'times', line: BOOKING_WORDS.pick }); return; }
    if (!clean(name)) { setProblem({ at: 'name', line: BOOKING_WORDS.name }); return; }
    if (!isEmail(clean(email).toLowerCase())) { setProblem({ at: 'email', line: BOOKING_WORDS.email }); return; }
    const missing = questions.find((q) => q.required && !clean(answers[q.id]));
    if (missing) { setProblem({ at: missing.id, line: 'Answer this one to carry on.' }); return; }
    busy.current = true;
    try {
      const given = Object.fromEntries(questions.map((q) => [questionLabel(q), clean(answers[q.id]).slice(0, 2000)]).filter(([, v]) => v));
      const answer = await makeBooking(key, { start: chosen, name: clean(name), email: clean(email).toLowerCase(), zone, answers: given, earlyAndLate: earlyLate });
      const status = answer.there ? answer.data?.status : 'not_ready';
      if (status === 'booked') {
        setBooked(answer.data);
        window.history.replaceState(null, '', BOOK_PATHS.mine(answer.data.guest_key));
        askBookingEmail(answer.data.guest_key, 'booked').then((r) => setEmailed(r.sent));
      } else if (status === 'taken') {
        setChosen(null);
        setStep('time');
        setProblem({ at: 'times', line: bookingWords('taken') });
        loadTimes();
      } else setProblem({ at: ['name', 'email'].includes(status) ? status : 'form', line: bookingWords(status) });
    } catch {
      setProblem({ at: 'form', line: failed() });
    } finally { busy.current = false; }
  };
  // The coach's full name with any title, as they typed it in Settings ("Dr Tim Dutton"; Tim's walk, item 28): 066 gives it.
  // Not set (or before 066): nothing there.
  const label = data.coach_full_name || null;

  if (step === 'details' && chosen) {
    return (
      <Frame mark={false}>
        <MoreLink back className="cc-book-back" onClick={() => { setStep('time'); setProblem(null); }}>{BOOKING.back}</MoreLink>
        <PageOpening label={<span className="cc-book-when" role="status">{bothTimes(chosen, zone, data.coach_time_zone || zone)}</span>} title={BOOKING.detailsTitle} line={BOOKING.detailsLine(data.coach_first_name)} />
        {holiday && <p className="cc-book-read" role="status">{holiday}</p>}
        <form className="cc-book-form" onSubmit={book} noValidate>
          <div className="cc-field"><TextField label={BOOKING.name} value={name} autoComplete="name" maxLength={120} onChange={(e) => { setName(e.target.value); setProblem(null); }} />{at('name')}</div>
          <div className="cc-field"><TextField label={BOOKING.email} type="email" value={email} autoComplete="email" onChange={(e) => { setEmail(e.target.value); setProblem(null); }} />{at('email')}</div>
          {questions.map((q) => (
            <div key={q.id} className="cc-field">
              {q.kind === 'short'
                ? <TextField label={questionLabel(q)} value={answers[q.id] || ''} maxLength={300} onChange={(e) => { setAnswers({ ...answers, [q.id]: e.target.value }); setProblem(null); }} />
                : <TextBox label={questionLabel(q)} value={answers[q.id] || ''} maxLength={2000} onChange={(v) => { setAnswers({ ...answers, [q.id]: v }); setProblem(null); }} />}
              {at(q.id)}
            </div>
          ))}
          {at('form')}
          <Button variant="primary" type="submit" className="cc-book-go">Book my call</Button>
        </form>
      </Frame>
    );
  }

  return (
    <Frame>
      <PageOpening label={label} title={data.name} line={bookingLine({ minutes: data.minutes, zoom: data.place_kind === 'zoom', description: data.description })} />
      {starts === null ? <div role="status" aria-label="Loading" /> : (
        <TimePicker starts={starts} zone={zone} minutes={data.minutes} chosen={chosen} onChoose={(s) => { setChosen(s); setProblem(null); }} earlyLate={earlyLate} setEarlyLate={(v) => { setEarlyLate(v); setChosen(null); }} visitor={visitor} />
      )}
      <ZoneLine zone={zone} onZone={(z) => { setZone(z); setChosen(null); setProblem(null); }} />
      {at('times')}
      {at('form')}
      {starts && starts.length > 0 && <Button variant="primary" className="cc-book-go" onClick={() => { if (!chosen) { setProblem({ at: 'times', line: BOOKING_WORDS.pick }); return; } setProblem(null); setStep('details'); }}>{BOOKING.continue}</Button>}
      <p className="cc-book-note cc-book-foot">{bookingFootLine(data.notice_hours ?? 24, ahead)}</p>
    </Frame>
  );
}

// ---------------------------------------------------------------- a guest's own booking: Add to calendar, move it, cancel it

export function BookingMine() {
  const { key } = useParams();
  const [mine, setMine] = useState(undefined);
  const [mode, setMode] = useState(null); // 'move' | 'cancel'
  const [starts, setStarts] = useState(null);
  const [chosen, setChosen] = useState(null);
  const [earlyLate, setEarlyLate] = useState(false);
  const [problem, setProblem] = useState(null);
  const [said, setSaid] = useState(null);
  const busy = useRef(false);
  const load = useCallback(() => loadMyBooking(key).then(setMine).catch(() => setMine({ there: true, data: null, down: true })), [key]);
  useEffect(() => { load(); }, [load]);
  const b = mine?.data || null;
  useEffect(() => { document.title = b?.call_name ? `${b.call_name}, The Clarity Project` : 'The Clarity Project'; }, [b]);
  const holiday = useHolidayLine(chosen, b?.time_zone);

  if (mine === undefined) return <Frame message><div role="status" aria-label="Loading" /></Frame>;
  if (!mine.there) return <Calm title="Your call">{BOOKING_WORDS.not_ready}</Calm>;
  if (mine.down) return <Calm title="Your call">{failed()}</Calm>;
  if (!b) return <Calm title="Your call">{BOOKING_WORDS.not_found}</Calm>;
  const zone = b.time_zone;
  const who = b.coach_first_name ? `With ${b.coach_first_name}` : null;
  const meta = [who, callPlaceLine(b.minutes, b.place_kind)].filter(Boolean);
  const title = who ? `${b.call_name} ${who.toLowerCase()}` : b.call_name;
  const head = <PageOpening label={meta.join(', ')} title={b.call_name} />;
  if (b.status !== 'booked') return <Frame message>{head}<p className="cc-quiet" role="status">{said || BOOKING_WORDS.cancelled}</p></Frame>;
  const when = <p className="cc-book-done" role="status">{said ? `${said} ` : ''}Your call is on {bookedWhenWords(b.starts_at, zone)}.</p>;
  if (b.past) return <Frame message>{head}{when}</Frame>;

  const startMove = async () => {
    setMode('move'); setChosen(null); setProblem(null); setStarts(null);
    try { const now = Date.now(); setStarts((await loadMoveTimes(key, new Date(now), new Date(now + Math.min(45, (b.ahead_weeks || 4) * 7) * DAY_MS))).data); } catch { setStarts([]); }
  };
  const move = async () => {
    if (busy.current) return;
    if (!chosen) { setProblem(BOOKING_WORDS.pick); return; }
    busy.current = true;
    try {
      const answer = await moveBooking(key, chosen, earlyLate);
      const status = answer.there ? answer.data?.status : 'not_ready';
      if (status === 'moved') { setMode(null); setSaid('Moved.'); await load(); askBookingEmail(key, 'moved'); } else { setProblem(bookingWords(status)); if (status === 'taken') { setChosen(null); startMove(); } }
    } catch { setProblem(failed()); } finally { busy.current = false; }
  };
  const cancel = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const answer = await cancelBooking(key);
      const status = answer.there ? answer.data?.status : 'not_ready';
      if (status === 'cancelled') { setMode(null); setSaid(BOOKING_WORDS.cancelled); await load(); } else setProblem(bookingWords(status));
    } catch { setProblem(failed()); } finally { busy.current = false; }
  };
  const late = guestLateLine(b.starts_at, new Date());
  return (
    <Frame>
      {head}
      {when}
      {b.meeting_link && /^https:\/\//.test(b.meeting_link) && <div className="cc-acts"><a className="ds-link" href={b.meeting_link} target="_blank" rel="noreferrer">Join on Zoom</a></div>}
      {b.location && <p className="cc-quiet">{b.location}</p>}
      {!mode && (
        <div className="cc-acts cc-book-after">
          <AddToCalendar uid={key} title={title} startsAt={b.starts_at} endsAt={b.ends_at} location={b.location || (b.place_kind === 'zoom' ? 'Zoom' : '')} />
          <button type="button" className="ds-link" onClick={startMove}>Move it</button>
          <button type="button" className="ds-link" onClick={() => { setMode('cancel'); setProblem(null); }}>Cancel it</button>
        </div>
      )}
      {mode === 'move' && (
        <section className="cc-book-move" aria-label="Move it">
          <p className="cc-quiet">Choose a new time, in {zoneLabel(zone)}.{late ? ` ${late}` : ''}</p>
          {starts === null ? <div role="status" aria-label="Loading" /> : <TimePicker starts={starts} zone={zone} minutes={b.minutes} chosen={chosen} onChoose={(s) => { setChosen(s); setProblem(null); }} earlyLate={earlyLate} setEarlyLate={(v) => { setEarlyLate(v); setChosen(null); }} />}
          {holiday && <p className="cc-book-read" role="status">{holiday}</p>}
          {problem && <p className="cc-problem" role="alert">{problem}</p>}
          <div className="cc-acts cc-book-after">
            <Button variant="primary" onClick={move}>{chosen ? bookButtonWords(chosen, zone).replace(/^Book/, 'Move to') : 'Move my call'}</Button>
            <button type="button" className="ds-link" onClick={() => setMode(null)}>Keep my time</button>
          </div>
        </section>
      )}
      {mode === 'cancel' && (
        <section className="cc-book-move" aria-label="Cancel it">
          <p className="cc-quiet">{late ? `${late} ` : ''}Cancelling frees the time for someone else.</p>
          {problem && <p className="cc-problem" role="alert">{problem}</p>}
          <div className="cc-acts cc-book-after">
            <Button variant="outline" onClick={cancel}>Cancel my call</Button>
            <button type="button" className="ds-link" onClick={() => setMode(null)}>Keep my call</button>
          </div>
        </section>
      )}
    </Frame>
  );
}

// ---------------------------------------------------------------- a poll, for one person asked

export function PollVote() {
  const { key } = useParams();
  const [page, setPage] = useState(undefined);
  const [zone, setZone] = useState(null);
  const [can, setCan] = useState({});
  const [problem, setProblem] = useState(null);
  const [sent, setSent] = useState(false);
  const busy = useRef(false);
  useEffect(() => {
    let live = true;
    loadPollPage(key).then((p) => {
      if (!live) return;
      setPage(p);
      if (p.data) { setZone(p.data.time_zone || deviceZone()); setCan(Object.fromEntries((p.data.options || []).map((o) => [o.id, o.can === true]))); }
    }).catch(() => { if (live) setPage({ there: true, data: null, down: true }); });
    return () => { live = false; };
  }, [key]);
  const p = page?.data || null;
  useEffect(() => { document.title = p?.title ? `${p.title}, The Clarity Project` : 'The Clarity Project'; }, [p]);
  if (page === undefined) return <Frame message><div role="status" aria-label="Loading" /></Frame>;
  if (!page.there) return <Calm title="Times for a call">{BOOKING_WORDS.not_ready}</Calm>;
  if (page.down) return <Calm title="Times for a call">{failed()}</Calm>;
  if (!p) return <Calm title="Times for a call">{BOOKING_WORDS.not_found}</Calm>;
  const meta = [p.coach_first_name ? `With ${p.coach_first_name}` : null, callPlaceLine(p.minutes, p.place_kind)].filter(Boolean);
  const head = <PageOpening label={meta.join(', ')} title={p.title} />;
  if (p.status === 'confirmed' && p.confirmed) {
    return (
      <Frame message>
        {head}
        <p className="cc-book-done" role="status">It’s confirmed for {bookedWhenWords(p.confirmed.starts_at, zone)}.</p>
        <div className="cc-acts cc-book-after"><AddToCalendar uid={`${key}-poll`} title={p.title} startsAt={p.confirmed.starts_at} endsAt={p.confirmed.ends_at} location={p.place_kind === 'zoom' ? 'Zoom' : ''} /></div>
      </Frame>
    );
  }
  if (p.status !== 'open') return <Frame message>{head}<p className="cc-quiet" role="status">This poll has closed. Ask {p.coach_first_name || 'whoever sent it'} for a new one.</p></Frame>;
  const send = async (e) => {
    e.preventDefault();
    if (busy.current) return;
    busy.current = true;
    try {
      const answer = await sendPollVotes(key, Object.fromEntries(p.options.map((o) => [o.id, can[o.id] === true])));
      const status = answer.there ? answer.data : 'not_ready';
      if (status === 'saved') { setSent(true); setProblem(null); } else setProblem(status === 'closed' ? 'This poll has closed.' : bookingWords(status));
    } catch { setProblem(failed()); } finally { busy.current = false; }
  };
  return (
    <Frame>
      {head}
      <p className="cc-quiet">{p.name ? `${p.name.split(' ')[0]}, which` : 'Which'} of these can you make?</p>
      <div className="cc-field cc-book-zone"><Dropdown label="Your time zone" options={visitorZones(deviceZone(), [zone])} value={zone} onChange={setZone} /></div>
      <form onSubmit={send} noValidate>
        <div className="cc-poll-ticks">
          {p.options.map((o) => <Checkbox key={o.id} checked={can[o.id] === true} onChange={(on) => { setCan({ ...can, [o.id]: on }); setSent(false); }}>{pollOptionWords(o.starts_at, zone)}</Checkbox>)}
        </div>
        {problem && <p className="cc-problem" role="alert">{problem}</p>}
        {sent && <p className="cc-quiet" role="status">Thank you. Your answers are in, and you can change them here.</p>}
        <div className="cc-acts"><Button variant="primary" type="submit">{p.voted || sent ? 'Save my answers' : 'Send my answers'}</Button></div>
      </form>
      <p className="cc-note">Leave a time unticked when you can’t make it.</p>
    </Frame>
  );
}
