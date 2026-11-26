import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { idFromAddress } from '../../lib/coach/address';
import {
  AddButton, BottomBar, Button, DatePicker, Dropdown, ErrorMessage, IconButton, InlineChoice, Loading, PageOpening, TextBox, TextField, useAutosave, useIsPhone, useToast,
} from '../../components/design';
import { sessionLine } from '../../content/pageLines/coach';
import { loadCoach, coachDayReadyNow, ensureCalRange, newId, useCoachLoadState } from '../../lib/coach/store';
import { addDays, clean, cut, dayWords } from '../../lib/coach/model';
import {
  ACTIONS_MAX, actionsOf, goesWords, instantFrom, NEEDS_NEW_TIME, NEEDS_RECAP, outcomeChoices, OUTCOMES, recapSentWords, sentWords,
  SESSION_KINDS, sessionOutcomeLine, sessionSent, sessionStarted, whenWords,
} from '../../lib/coach/day';
import {
  CHANGED_ELSEWHERE, holdSession, keptActions, moveSessionTo, notesOf, removeAction, removeSession, saveAction, saveNotes, saveSession, sendRecap,
} from '../../lib/coach/sessionActions';
import { Back, Detail, Eye, Part, TextLink, TICK, useCoachPortal } from './parts';
import { LENGTHS, putBack, useSay, useSessionWho } from './sessionParts';
import { joinLink } from '../../lib/coach/calendar';
import { MovedInGoogle } from './calSync';
import './sessions.css';

// After a call: the recap (Phase 6a run 2, step 5; M11's session screen).
// What happened and how long, then, for a session that went ahead, the
// recap for the client, its actions (each ticked to send, each going to the
// client's this week or their Backlog), the coach's private notes and For
// supervision. Everything typed saves as it is typed, device first. Send
// the recap is the page's one coral button and sends once.
//
// Once sent, the session is locked (migration 050 refuses a change in the
// database, and sessionActions.js refuses it before 050): What happened,
// How long, the recap and the sent actions are read-only, and the private
// notes and For supervision stay the coach's to edit.

const BriefPanel = lazy(() => import('./Brief'));
const NOTE_BOXES = [['focus', 'Focus'], ['insight', 'Insight'], ['next_time', 'Next time']];
const NOTE_MAX = 6000;
const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

const paragraphs = (text) => String(text || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

export default function SessionPage() {
  const id = idFromAddress(useParams().id); // any case in the address (tidy follow-up 4)
  const navigate = useNavigate();
  const { sessions, userId } = useCoachPortal();
  const whoOf = useSessionWho();
  // Only a whole copy can say a session isn't here: while the rest of a first load is on its way the page waits, and
  // when it couldn't be made it says so with Try again (follow-up 5, item 14).
  const loadState = useCoachLoadState(userId);
  const [trying, setTrying] = useState(false);
  const session = sessions.find((s) => s.id === id) || null;
  if (!session) {
    const tryAgain = () => { setTrying(true); loadCoach(userId).catch(() => null).finally(() => setTrying(false)); };
    return (
      <div className="cc-page"><div className="cc-col">
        <Back onClick={() => navigate('/coach/clients')} />
        <PageOpening title="Session" />
        {loadState === 'whole' && <p className="cc-quiet">This session isn’t here any more.</p>}
        {loadState === 'loading' && <Loading label="Loading the session" />}
        {loadState === 'failed' && (trying ? <Loading label="Loading the session" /> : (
          <div className="cc-role-problem">
            <ErrorMessage>{typeof navigator !== 'undefined' && navigator.onLine === false
              ? 'This session needs a connection the first time it opens on this device, so try again when you’re back online.'
              : 'This session didn’t load. Check your connection and try again.'}</ErrorMessage>
            <Button variant="primary" onClick={tryAgain}>Try again</Button>
          </div>
        ))}
      </div></div>
    );
  }
  return <SessionBody key={session.id} session={session} who={whoOf(session)} />;
}

function SessionBody({ session, who }) {
  const { userId, coach, sessionActions, sessionNotes, todayKey, now, calItems = [] } = useCoachPortal();
  // An older session's calendar item may not be on the device yet (the calendar is read by the weeks shown).
  const sessionDay = typeof session.starts_at === 'string' ? session.starts_at.slice(0, 10) : null;
  useEffect(() => { if (sessionDay) ensureCalRange(userId, sessionDay, sessionDay); }, [userId, sessionDay]);
  const navigate = useNavigate();
  const toast = useToast();
  const say = useSay();
  const isPhone = useIsPhone();
  const sent = sessionSent(session);
  const started = sessionStarted(session, now);
  const group = Boolean(session.group_id);
  const whom = group ? 'everyone' : who.first;

  // The session as it is kept this moment, for a save made after typing has paused.
  const latest = useRef(session);
  latest.current = session;
  // Deleted from this page: a save still waiting for typing to pause must not bring it back.
  const gone = useRef(false);

  // ---- what happened
  const [choice, setChoice] = useState(session.outcome || (started ? 'held' : null));
  const choiceRef = useRef(choice);
  choiceRef.current = choice;
  const [movedDay, setMovedDay] = useState('');
  const [movedTime, setMovedTime] = useState('');
  const [problem, setProblem] = useState(null);
  const [recapProblem, setRecapProblem] = useState(null);
  const busy = useRef(false);
  // A session that starts while the page is open can be written up.
  useEffect(() => { if (started && choiceRef.current == null) setChoice('held'); }, [started]);
  // Written up elsewhere (another tab): the page follows.
  useEffect(() => { if (session.outcome) setChoice(session.outcome); }, [session.outcome]);

  /** Writing anything up for a session that went ahead marks it so, once. */
  const asHeld = (row) => (choiceRef.current === 'held' && sessionStarted(row, new Date()) && row.outcome !== 'held'
    ? { ...row, outcome: 'held', waived: false, moved_to: null, written_up_at: row.written_up_at || new Date().toISOString() } : row);
  const ensureHeld = () => { const row = asHeld(latest.current); return row === latest.current ? null : saveSession(userId, row); };

  // ---- two tabs on one session (run 6, item 3): this tab's saves never go over another tab's
  // The recap as this tab last read or saved it: a save or Send finding another there is refused, said calmly with "Reload to see it".
  const base = useRef(session.recap ?? null);
  const [changedElsewhere, setChangedElsewhere] = useState(false);
  // Held once, as the page opened with it (the page is keyed by the session).
  const opened = useRef(session);
  useEffect(() => holdSession(userId, opened.current, () => setChangedElsewhere(true)), [userId]);

  // ---- the recap, saved as it is typed
  const [recap, setRecap] = useState(session.recap || '');
  // Sent meanwhile in another tab: the save is refused (sessionActions.js) and the page shows the session as it was sent.
  // Changed meanwhile in another tab: nothing is written over it, and the page says so.
  const unlessLocked = (error) => {
    if (error?.code === 'changed') { setChangedElsewhere(true); return null; }
    // Sent from another device meanwhile: the page shows the recap as it was sent, and says why the words typed here didn't go.
    if (error?.code === 'already_sent') { toast.show(error.message); return null; }
    if (error?.code !== 'locked') throw error;
    return null;
  };
  const recapState = useAutosave(recap, (text) => {
    if (gone.current || sessionSent(latest.current)) return null;
    const next = text.trim() ? text : null;
    return saveSession(userId, { ...asHeld(latest.current), recap: next }, { base: base.current })
      .then((status) => { base.current = next; return status; }).catch(unlessLocked);
  });

  // ---- private notes and For supervision: never locked
  const keptNotes = notesOf(sessionNotes, session);
  const [notes, setNotes] = useState(() => ({ focus: keptNotes.focus || '', insight: keptNotes.insight || '', next_time: keptNotes.next_time || '', supervision: keptNotes.supervision || '' }));
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const keptNotesRef = useRef(keptNotes);
  keptNotesRef.current = keptNotes;
  const writeNotes = async () => {
    if (gone.current) return;
    const n = notesRef.current;
    const text = (v) => (v.trim() ? cut(v, NOTE_MAX) : null);
    await saveNotes(userId, { ...keptNotesRef.current, coach_id: coach.id, focus: text(n.focus), insight: text(n.insight), next_time: text(n.next_time), supervision: text(n.supervision) });
    if (!sessionSent(latest.current)) await Promise.resolve(ensureHeld()).catch(unlessLocked);
  };
  const notesState = useAutosave(`${notes.focus}\u0000${notes.insight}\u0000${notes.next_time}`, writeNotes);
  const superState = useAutosave(notes.supervision, writeNotes);
  const lastBox = useRef('next_time');
  const setNote = (key, value) => setNotes((n) => ({ ...n, [key]: value }));

  // ---- actions
  const [acts, setActs] = useState(() => actionsOf(sessionActions, session.id));
  const actsRef = useRef(acts);
  actsRef.current = acts;
  const boxes = useRef({});
  const focusNext = useRef(null);
  useEffect(() => { if (focusNext.current) { boxes.current[focusNext.current]?.focus(); focusNext.current = null; } });
  const writeActs = async () => {
    if (gone.current || sessionSent(latest.current)) return;
    const kept = keptActions(userId, session.id);
    let wrote = false;
    for (const a of actsRef.current) {
      const title = cut(clean(a.title), 300);
      if (!title) continue;
      const before = kept.find((k) => k.id === a.id);
      if (before && before.title === title && before.send === a.send && before.goes_to === a.goes_to && before.position === a.position) continue;
      try { await saveAction(userId, { ...(before || {}), ...a, title }); } catch (error) { unlessLocked(error); return; }
      wrote = true;
    }
    if (wrote) await Promise.resolve(ensureHeld()).catch(unlessLocked);
  };
  const actsState = useAutosave(acts.map((a) => `${a.id}:${a.title}`).join('\u0000'), writeActs);
  const changeAct = (id, patch) => {
    setActs((list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    // A tick or where it goes saves at once (the words save once typing pauses).
    const a = actsRef.current.find((x) => x.id === id);
    if (a && clean(a.title) && !('title' in patch)) saveAction(userId, { ...a, ...patch, title: cut(clean(a.title), 300) }).catch((e) => { if (e?.code !== 'locked') toast.error(); });
  };
  const addAct = () => {
    if (acts.length >= ACTIONS_MAX) { toast.show(`A recap carries up to ${ACTIONS_MAX} actions. Take one out first.`); return; }
    const row = { id: newId(), session_id: session.id, coach_id: coach.id, title: '', send: true, goes_to: 'week', position: Math.max(0, ...acts.map((a) => Number(a.position) || 0)) + 1, done_at: null, placed_at: null };
    focusNext.current = row.id;
    setActs((list) => [...list, row]);
  };
  const removeAct = (a) => {
    const at = acts.findIndex((x) => x.id === a.id);
    setActs((list) => list.filter((x) => x.id !== a.id));
    const back = () => setActs((list) => (list.some((x) => x.id === a.id) ? list : [...list.slice(0, at), a, ...list.slice(at)]));
    const kept = keptActions(userId, session.id).find((k) => k.id === a.id);
    if (!kept) { if (clean(a.title)) toast.saved({ message: 'Deleted', long: true, onUndo: back }); return; }
    say(() => removeAction(userId, kept).then(() => 'saved'), 'Deleted', () => { back(); saveAction(userId, kept).catch(() => {}); });
  };
  const blurAct = (a) => {
    // A kept action can't be left with no words: its own come back.
    if (clean(a.title)) return;
    const kept = keptActions(userId, session.id).find((k) => k.id === a.id);
    if (kept) setActs((list) => list.map((x) => (x.id === a.id ? { ...x, title: kept.title } : x)));
  };

  // ---- what happened, saved
  const choose = (v) => {
    setChoice(v); setProblem(null); setRecapProblem(null);
    // Back to "It went ahead" from something saved: there is no Save button for it, so it saves at once.
    if (v === 'held' && session.outcome && session.outcome !== 'held') {
      const before = session;
      say(() => saveSession(userId, { ...before, outcome: 'held', waived: false, moved_to: null }), 'Saved', () => saveSession(userId, before).catch(() => {}));
    }
  };
  // The database recounts the engagement's sessions when one is saved: a load follows, and `again` makes it one that
  // begins after this save (a load already on its way read the session from before it: waived, then Count it as used
  // straight away, ended showing it waived; fixer D, 22 Nov).
  const recount = (status) => { if (status === 'saved' && coachDayReadyNow() === true) loadCoach(userId, { again: true }); return status; };
  const saveOutcome = async () => {
    if (busy.current) return;
    busy.current = true;
    const before = session;
    try {
      if (choice === 'moved') {
        const startsAt = instantFrom(movedDay, movedTime);
        if (!startsAt) { setProblem(NEEDS_NEW_TIME); return; }
        let moved = null;
        await say(async () => { moved = await moveSessionTo(userId, before, startsAt); return recount('saved'); }, 'Saved', () => moved?.undo());
        return;
      }
      await say(async () => recount(await saveSession(userId, {
        ...before, outcome: choice, waived: choice === 'late_cancel' && before.outcome === 'late_cancel' ? before.waived : false, moved_to: null,
        written_up_at: before.written_up_at || new Date().toISOString(),
      })), 'Saved', () => saveSession(userId, before).catch(() => {}));
    } finally { busy.current = false; }
  };
  // One request a press: a second press of the same choice while the first is on its way is ignored (the other choice still goes).
  const waiving = useRef(null);
  const waive = (on) => {
    if (waiving.current === on) return;
    waiving.current = on;
    const before = session;
    const next = { ...before, outcome: 'late_cancel', waived: on, moved_to: null, written_up_at: before.written_up_at || new Date().toISOString() };
    say(async () => recount(await saveSession(userId, next)), on ? sessionOutcomeLine(next, { name: who.name, group }) : 'Saved', () => saveSession(userId, before).catch(() => {}))
      .finally(() => { if (waiving.current === on) waiving.current = null; });
  };
  const setLength = (v) => {
    if (Number(v) === session.minutes) return;
    saveSession(userId, { ...latest.current, minutes: Number(v) }).catch((e) => { if (e?.code === 'changed' || e?.code === 'already_sent') unlessLocked(e); else if (e?.code !== 'locked') toast.error(); });
  };

  // ---- send the recap: once
  const send = async () => {
    if (busy.current) return;
    if (!recap.trim()) { setRecapProblem(NEEDS_RECAP); return; }
    busy.current = true;
    try {
      const n = notesRef.current;
      const text = (v) => (v.trim() ? cut(v, NOTE_MAX) : null);
      const anyNotes = Object.values(n).some((v) => v.trim()) || sessionNotes.some((x) => x.session_id === session.id);
      const answer = await sendRecap(userId, {
        session: { ...latest.current, recap },
        notes: anyNotes ? { ...keptNotesRef.current, coach_id: coach.id, focus: text(n.focus), insight: text(n.insight), next_time: text(n.next_time), supervision: text(n.supervision) } : null,
        actions: actsRef.current.filter((a) => clean(a.title)).map((a) => ({ ...a, title: cut(clean(a.title), 300) })),
      }, { base: base.current });
      if (answer.status === 'sent') toast.saved({ message: recapSentWords({ name: who.name, people: group ? who.people : 0, emailed: answer.emailed === true }), long: true });
      else if (answer.status === 'changed') setChangedElsewhere(true);
      else if (answer.status === 'already_sent') toast.show(answer.message);
      else if (answer.status === 'needs_recap') setRecapProblem(answer.message);
    } catch (error) {
      toast.error(error?.message && !/fetch|network/i.test(error.message) ? error.message : 'That didn’t send. Check your connection and try again.');
    } finally { busy.current = false; }
  };

  const remove = async () => {
    gone.current = true;
    let rows = [];
    const ok = await say(async () => { rows = await removeSession(userId, session); return 'saved'; }, 'Deleted', () => putBack(userId, rows));
    if (ok) navigate(who.to); else gone.current = false;
  };

  // ---- speak a note (a phone, where the browser can)
  const [listening, setListening] = useState(false);
  const recognition = useRef(null);
  useEffect(() => () => { try { recognition.current?.abort(); } catch { /* already stopped */ } }, []);
  const speak = () => {
    if (listening) { try { recognition.current?.stop(); } catch { /* already stopped */ } return; }
    try {
      const r = new Recognition();
      r.lang = navigator.language || 'en-GB';
      r.interimResults = false;
      r.continuous = true;
      const key = lastBox.current;
      r.onresult = (e) => {
        // Only the words are kept, as text the coach can edit: the audio never is.
        const said = [...e.results].slice(e.resultIndex).filter((x) => x.isFinal).map((x) => x[0].transcript.trim()).filter(Boolean).join(' ');
        if (said) setNotes((n) => ({ ...n, [key]: cut(`${n[key]}${n[key].trim() ? ' ' : ''}${said}`, NOTE_MAX) }));
      };
      r.onend = () => setListening(false);
      r.onerror = (e) => { setListening(false); if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast.show('The microphone is switched off for this page. Allow it in your browser, then try again.'); };
      recognition.current = r;
      r.start();
      setListening(true);
      toast.show('Speak, and the note appears as text you can edit.');
    } catch {
      setListening(false);
    }
  };

  const [brief, setBrief] = useState(null);
  const [briefAsked, setBriefAsked] = useState(false);

  const choices = useMemo(() => (sent || session.outcome ? OUTCOMES : outcomeChoices(session, now)), [sent, session, now]);
  const held = choice === 'held';
  const dirty = choice && !held && (choice !== session.outcome || (choice === 'moved' && !session.moved_to));
  const line = choice && !held ? sessionOutcomeLine({ ...session, outcome: choice, waived: choice === 'late_cancel' && session.outcome === 'late_cancel' && session.waived }, { name: who.name, group }) : '';
  const waived = choice === 'late_cancel' && session.outcome === 'late_cancel' && session.waived;
  const movedSaved = choice === 'moved' && session.outcome === 'moved' && session.moved_to;
  const bar = !sent && (held || dirty);
  const title = SESSION_KINDS[session.kind] || SESSION_KINDS.coaching;

  const notesPart = (
    <>
      <Part title="Private notes" aside={<Eye sentence="Only you can see this." />}>
        {NOTE_BOXES.map(([key, label], i) => (
          <div className="cc-field" key={key}>
            <TextBox label={label} value={notes[key]} maxLength={NOTE_MAX} onChange={(v) => setNote(key, v)} onFocus={() => { lastBox.current = key; }} saveState={i === NOTE_BOXES.length - 1 ? notesState : undefined} />
          </div>
        ))}
        {isPhone && Recognition && (
          <div className="cc-acts cc-ses-speak"><Button variant="outline" aria-pressed={listening} onClick={speak}>{listening ? 'Stop listening' : 'Speak a note'}</Button></div>
        )}
      </Part>
      <Part title="For supervision" aside={<Eye sentence="Only you can see this." />}>
        <div className="cc-field">
          <TextBox label="Notes for supervision" value={notes.supervision} maxLength={NOTE_MAX} placeholder="e.g. I jumped to solutions when the silence went on." onChange={(v) => setNote('supervision', v)} saveState={superState} />
        </div>
        <p className="cc-note">Write about your own practice. Anything about the client can be included if they ask for their data.</p>
      </Part>
    </>
  );

  const calItem = calItems.find((i) => i.session_id === session.id) || null;
  const joinHref = joinLink(calItem, session);
  return (
    <div className={`cc-page cc-ses${bar ? ' cc-ses-page--bar' : ''}`}>
      <div className="cc-col">
        <Back to={who.name} onClick={() => navigate(who.to)} />
        <PageOpening label={whenWords(session.starts_at, todayKey)} title={title} line={sessionLine({ name: who.name, sent, happened: started, outcome: session.outcome })} />
        {/* The call's own calendar item (run 3): moved in Google Calendar, and its Zoom link until it has been written up. */}
        <MovedInGoogle item={calItem} />
        {joinHref && !session.outcome && <div className="cc-acts"><a className="ds-link" href={joinHref} target="_blank" rel="noreferrer">Join on Zoom</a></div>}

        {sent ? (
          <>
            <div className="cc-ses-facts">
              <Detail label="What happened?">{OUTCOMES.find((o) => o.value === session.outcome)?.label}</Detail>
              <Detail label="How long was it?">{`${session.minutes} minutes`}</Detail>
            </div>
            <Part title="Recap" aside={<span className="cc-ses-senton">{sentWords(session, todayKey)}</span>}>
              <div className="cc-soft cc-ses-recap">
                {paragraphs(session.recap).map((p, i) => <p key={`${i}:${p.slice(0, 24)}`}>{p}</p>)}
              </div>
            </Part>
            {actionsOf(sessionActions, session.id).length > 0 && (
              <Part title="Actions">
                <div className="cc-ses-sentacts" role="list" aria-label="Actions">
                  {actionsOf(sessionActions, session.id).map((a) => (
                    <div key={a.id} className="cc-line cc-ses-sentact" role="listitem">
                      <span><b>{a.title}</b><small>{a.send ? goesWords(a) : 'Not sent'}</small></span>
                      {a.send && <span className={`cc-line-state${a.done_at ? ' cc-line-state--good' : ''}`}>{a.done_at ? 'Done' : 'Not yet'}</span>}
                    </div>
                  ))}
                </div>
              </Part>
            )}
            {notesPart}
          </>
        ) : (
          <>
            <div className="cc-ses-top">
              {choices.length > 0 && <Dropdown className="cc-ses-what" label="What happened?" placeholder="It hasn’t happened yet" options={choices} value={choice} onChange={choose} />}
              <InlineChoice className="cc-ses-long" label={started ? 'How long was it?' : 'How long is it?'} form="pills" options={LENGTHS} value={String(session.minutes)} onChange={setLength} />
            </div>

            {line && (
              <div className="cc-ses-outcome">
                <p className="cc-quiet" role="status">{line}</p>
                {choice === 'late_cancel' && !waived && <Button variant="outline" onClick={() => waive(true)}>Waive it</Button>}
                {waived && <TextLink onClick={() => waive(false)}>Count it as used</TextLink>}
              </div>
            )}
            {choice === 'moved' && movedSaved && <p className="cc-quiet">It moved to {whenWords(session.moved_to, todayKey)}.</p>}
            {choice === 'moved' && !movedSaved && (
              <>
                <div className="cc-field cc-two cc-ses-two">
                  <DatePicker label="The new day" value={movedDay} min={addDays(todayKey, -30)} max={addDays(todayKey, 730)} placeholder="Choose a day" format={(k) => dayWords(k, todayKey)} onChange={(k) => { setMovedDay(k); setProblem(null); }} />
                  <TextField label="The new time" type="time" step={900} value={movedTime} onChange={(e) => { setMovedTime(e.target.value); setProblem(null); }} />
                </div>
                {problem && <p className="cc-problem" role="alert">{problem}</p>}
              </>
            )}

            {!started && !group && !session.outcome && (
              <div className="cc-acts"><TextLink onClick={() => { setBriefAsked(true); setBrief(session.id); }}>Open the brief</TextLink></div>
            )}

            {held && (
              <>
                <Part title="Recap">
                  <div className="cc-field">
                    <TextBox label={`Recap for ${whom}`} value={recap} maxLength={12000} onChange={(v) => { setRecap(v); setRecapProblem(null); }} saveState={changedElsewhere ? 'idle' : recapState} aria-invalid={recapProblem ? true : undefined} />
                    {recapProblem && <p className="cc-problem" role="alert">{recapProblem}</p>}
                  </div>
                </Part>
                <Part title="Actions">
                  {acts.length > 0 && (
                    <div className="cc-ses-acts" role="list" aria-label="Actions">
                      {acts.map((a, i) => {
                        const name = clean(a.title) || `action ${i + 1}`;
                        return (
                          <div key={a.id} className="cc-ses-act" role="listitem">
                            <button type="button" role="checkbox" className="ds-check-box cc-ses-tick" aria-checked={Boolean(a.send)} aria-label={`Send “${name}” to ${whom}`} onClick={() => changeAct(a.id, { send: !a.send })}><span>{TICK}</span></button>
                            <div className="cc-ses-act-words">
                              <TextBox ref={(el) => { boxes.current[a.id] = el; }} lines="one" ariaLabel={`Action ${i + 1}`} placeholder="What will they do?" value={a.title} maxLength={300} onChange={(v) => changeAct(a.id, { title: v })} onBlur={() => blurAct(a)} />
                              <button type="button" className="ds-link cc-ses-where" aria-label={`“${name}”: ${goesWords(a).toLowerCase()}. Switch it`} onClick={() => changeAct(a.id, { goes_to: a.goes_to === 'backlog' ? 'week' : 'backlog' })}>{goesWords(a)}</button>
                            </div>
                            <IconButton label={`Remove ${name}`} className="cc-ses-remove" onClick={() => removeAct(a)} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="cc-add"><AddButton onClick={addAct}>Add action</AddButton></div>
                  <span className="ds-sr" role="status">{actsState === 'saved' ? 'Saved' : ''}</span>
                </Part>
                {notesPart}
              </>
            )}

            <div className="cc-acts cc-ses-delete"><TextLink onClick={remove}>Delete this session</TextLink></div>
          </>
        )}
      </div>

      {bar && (
        <BottomBar className="cc-ses-bar">
          {held ? <Button variant="primary" onClick={send}>Send the recap</Button> : <Button variant="primary" onClick={saveOutcome}>Save</Button>}
        </BottomBar>
      )}
      {briefAsked && <Suspense fallback={null}><BriefPanel sessionId={brief} onClose={() => setBrief(null)} /></Suspense>}
      {changedElsewhere && (
        // As the Health Check's two tabs say it (Health Check rule 21): calm, never "Saved", with a way to see the other tab's.
        <div className="ds-toast-region cc-ses-changed" role="alert">
          <div className="ds-toast ds-toast--shown">
            <span className="ds-toast-text">{CHANGED_ELSEWHERE}</span>
            <button type="button" className="ds-toast-undo" onClick={() => window.location.reload()}>Reload to see it</button>
          </div>
        </div>
      )}
    </div>
  );
}
