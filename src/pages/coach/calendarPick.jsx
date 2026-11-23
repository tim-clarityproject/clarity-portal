import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Dropdown, IconButton, InlineChoice, SearchField, SlidePanel, TextBox, useToast } from '../../components/design';
import { rowsOf } from '../../lib/coach/store';
import {
  BOOKING_LENGTHS, invited, INVITED_EXAMPLE, INVITED_LABEL, newPollPlan, OFFER_MAX, OFFER_TIMES, OFFER_ZONE_LABEL, offerNote, offerPickWords, offerTimesText, offerZoneChoices,
  pickedEntries, pickPeople, pickTime, PLACES, POLL_MAX, pollPickWords, pollProblem,
} from '../../lib/coach/calendar';
import { TextLink } from './parts';
import { CAL_HOOKS } from './calendarParts';
import { copyWords } from './BookCall';
import './booking.css';

// Picking times on the calendar itself (Phase 6a run 3; M11's "cft" and
// "pollpick"): Offer times by email, and a poll's 2 to 5 times. A press on a
// free time picks it (a dashed tile), a press on a picked one takes it off.
// Offer times copies the times written in the READER's zone, or opens them
// in the coach's own email app: nothing is sent and nothing is held. A
// poll's times are held (dashed) once the poll is made. Every rule and word
// is calendar.js's.

const LENGTHS = BOOKING_LENGTHS.map((m) => ({ value: String(m), label: `${m} minutes` }));
const WHERE = PLACES.filter((p) => p.value !== 'phone');

/** A poll's details, before its times are picked: what it's for, who is asked, how long and where. */
function PollStartPanel({ cal, open, start, onClose, onGo }) {
  const [d, setD] = useState({ title: '', paste: '', picked: [], minutes: 60, where: 'zoom' });
  const [q, setQ] = useState('');
  const [problem, setProblem] = useState(null);
  const startKey = JSON.stringify(start || {});
  useEffect(() => {
    if (!open) return;
    const client = start?.clientId ? cal.clients.find((c) => c.id === start.clientId) : null;
    setD({ title: start?.title ? (client ? 'Three-way meeting' : start.title) : '', paste: start?.paste || '', picked: client ? [{ name: client.name, email: client.email || '', profile_id: client.id }] : [], minutes: start?.minutes || 60, where: start?.placeKind || 'zoom' });
    setProblem(null); setQ('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, startKey]);
  const set = (patch) => { setD((was) => ({ ...was, ...patch })); setProblem(null); };
  const read = invited(d.paste);
  const found = pickPeople(q, { clients: cal.clients, contacts: rowsOf(cal.state, 'organisation_contacts'), coaches: cal.coaches.filter((c) => c.id !== cal.coach.id) }).filter((p) => !d.picked.some((x) => x.name === p.name && x.email === p.email));
  const go = () => {
    if (!d.title.trim()) { setProblem('Type what it’s for to carry on.'); return; }
    const people = [...d.picked, ...read.people].map((p) => ({ ...p, time_zone: cal.clients.find((c) => c.id === p.profile_id)?.time_zone || null }));
    if (!people.length) { setProblem('Add at least one person to carry on.'); return; }
    onGo({ title: d.title.trim(), minutes: d.minutes, placeKind: d.where, people });
  };
  return (
    <SlidePanel draftKey="cal-poll:new" open={open} onClose={onClose} title="A poll" footer={<div className="cc-panel-foot cc-panel-foot--end"><Button variant="primary" className="ds-panel-go" onClick={go}>Pick the times</Button></div>}>
      <div className="cc-field"><TextBox lines="one" label="What’s it for?" value={d.title} maxLength={200} onChange={(v) => set({ title: v })} /></div>
      <div className="cc-field">
        <TextBox label={INVITED_LABEL} placeholder={INVITED_EXAMPLE} value={d.paste} maxLength={4000} onChange={(v) => set({ paste: v })} />
        {d.paste.trim() && <p className="cc-book-read" aria-live="polite">{[`${read.countWords} to ask.`, ...read.lines].join(' ')}</p>}
      </div>
      <div className="cc-field">
        <span className="cc-field-label" aria-hidden="true">Add someone already in the portal</span>
        <SearchField label="Add someone already in the portal" placeholder="Type a name" value={q} onChange={setQ} />
        {found.length > 0 && (
          <div className="cc-cal-found" role="list">
            {found.map((p) => <button key={`${p.name}:${p.email}`} type="button" role="listitem" className="cc-cal-found-row" onClick={() => { set({ picked: [...d.picked, p] }); setQ(''); }}><b>{p.name}</b>{p.email && <small>{p.email}</small>}</button>)}
          </div>
        )}
      </div>
      {d.picked.length > 0 && (
        <div className="cc-field" role="list" aria-label="Asked">
          {d.picked.map((p) => (
            <div key={`${p.name}:${p.email}`} className="cc-cal-guest" role="listitem">
              <span><b>{p.name}</b><small>{p.email || 'No email yet'}</small></span>
              <IconButton label={`Remove ${p.name}`} onClick={() => set({ picked: d.picked.filter((x) => x !== p) })} />
            </div>
          ))}
        </div>
      )}
      <div className="cc-field"><InlineChoice label="How long?" form="pills" options={LENGTHS} value={String(d.minutes)} onChange={(v) => set({ minutes: Number(v) })} /></div>
      <div className="cc-field"><InlineChoice label="Where?" form="pills" options={WHERE} value={d.where} onChange={(v) => set({ where: v })} /></div>
      <p className="cc-note">Each person sees the times in their own time zone.</p>
      {problem && <p className="cc-problem" role="alert">{problem}</p>}
    </SlidePanel>
  );
}

/**
 * The calendar while times are picked. `side` is 'offer' (Offer times by
 * email), 'poll' (a poll's times) or null.
 * @returns {null | { entries: object[], create: ({ day, fromMin }) => void, open: (entry) => void, bar: JSX, node: JSX }}
 */
export function usePick(cal, side, { start = null, onDone }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [starts, setStarts] = useState([]);
  const [zone, setZone] = useState(null);
  const [minutes, setMinutes] = useState(60);
  const [poll, setPoll] = useState(null); // a poll's details, once its panel is done
  const busy = useRef(false);
  useEffect(() => { setStarts([]); setPoll(null); }, [side]);
  const zones = useMemo(() => offerZoneChoices(cal.settings, cal.coachZone), [cal.settings, cal.coachZone]);
  const readerZone = zone || zones[1]?.value || cal.coachZone;
  const length = side === 'poll' ? poll?.minutes || 60 : minutes;
  const entries = useMemo(() => (side ? pickedEntries(starts, length, { coachZone: cal.coachZone, zone: side === 'offer' ? readerZone : null }) : []), [side, starts, length, cal.coachZone, readerZone]);
  if (!side) return null;

  const create = ({ day, fromMin }) => {
    const next = pickTime(starts, { day, startMin: fromMin, minutes: length, coachZone: cal.coachZone, data: cal.data, now: cal.now, max: side === 'poll' ? POLL_MAX : OFFER_MAX });
    if (next.problem) { toast.show(next.problem); return; }
    setStarts(next.starts);
  };
  const open = (e) => { if (e.type === 'pick') setStarts(starts.filter((s) => `pick:${s.getTime()}` !== e.key)); };
  const cancel = () => onDone();

  let bar;
  if (side === 'offer') {
    const made = offerTimesText({ starts, minutes, zone: readerZone });
    const note = offerNote({ starts, minutes, zone: readerZone, coachFirstName: cal.coach.display_first_name || '' });
    const copy = async () => {
      if (made.problem) { toast.show(made.problem); return; }
      const ok = await copyWords(made.text);
      toast.show(ok ? made.words : 'That didn’t copy. Open it in your email instead.');
    };
    bar = (
      <div className="cc-pickbar" role="group" aria-label={OFFER_TIMES}>
        <p className="cc-pickbar-count" role="status">{offerPickWords(starts.length)}</p>
        <div className="cc-pickbar-field"><Dropdown label={OFFER_ZONE_LABEL} options={zones} value={readerZone} onChange={setZone} /></div>
        <div className="cc-pickbar-field"><Dropdown label="How long?" options={LENGTHS} value={String(minutes)} onChange={(v) => { setMinutes(Number(v)); setStarts([]); }} /></div>
        <div className="cc-pickbar-acts">
          <Button variant="outline" onClick={copy}>Copy</Button>
          {starts.length > 0 && <a className="ds-link" href={`mailto:?subject=${encodeURIComponent(note.subject)}&body=${encodeURIComponent(note.body)}`}>Open in my email</a>}
          <TextLink onClick={cancel}>Cancel</TextLink>
        </div>
      </div>
    );
  } else {
    const make = async () => {
      if (busy.current) return;
      const problem = pollProblem(starts);
      if (problem) { toast.show(problem); return; }
      busy.current = true;
      const plan = newPollPlan({ ...poll, zone: cal.coachZone, starts }, cal.ctx);
      const ok = await cal.run(plan);
      busy.current = false;
      if (ok) navigate(CAL_HOOKS.poll(plan.pollId));
    };
    bar = poll ? (
      <div className="cc-pickbar" role="group" aria-label="A poll’s times">
        <p className="cc-pickbar-count" role="status">{pollPickWords(starts.length)}</p>
        <p className="cc-pickbar-what">{poll.title}, {poll.minutes} minutes</p>
        <div className="cc-pickbar-acts">
          <TextLink onClick={cancel}>Cancel</TextLink>
          <Button variant="primary" onClick={make}>Make the poll</Button>
        </div>
      </div>
    ) : <div className="cc-pickbar" />;
  }
  const node = side === 'poll' ? <PollStartPanel cal={cal} open={!poll} start={start} onClose={cancel} onGo={setPoll} /> : null;
  return { entries, create, open, bar, node };
}
