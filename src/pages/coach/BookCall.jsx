import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, DatePicker, Dropdown, InlineChoice, SlidePanel, Stepper, TextBox, TextField, useToast } from '../../components/design';
import { addDays, dayKeyWords, wallClock, zoneLabel } from '../../lib/time/index.js';
import { supabase } from '../../lib/supabase';
import { coachCalReadyNow, coachState, loadCoach, newId, noteRows, rowsOf, saveRow, saveRows } from '../../lib/coach/store';
import { firstName } from '../../lib/coach/model';
import {
  anchorZone, BOOK_KINDS, BOOK_PATHS, BOOK_WITH_SOMEONE_ELSE, bookCallLabel, bookCallPlan, BOOKING_LENGTHS, BOOKING_WORDS, bookSuggestions, noSharedHours, OUTSIDE_HOURS, outsideHoursSuggestions, bookWhenWords, bookWhoChoices, callProblem,
  CLASH_ACTION, holidayLineFor, HOW_OFTEN, invited, INVITED_EXAMPLE, INVITED_LABEL, linkCopiedWords, LINK_PURPOSES, linkState, LINK_STATE_WORDS, newLink, PLACES, publicLink, SERIES_MAX,
  seriesClashes, seriesStarts, startingCallTypes, suggestedLengthLine, suggestionWords, suggestTimes, TRAVEL_HELP, TRAVEL_LABEL, typedStart,
} from '../../lib/coach/calendar';
import { TextLink } from './parts';
import './booking.css';

// Book a call and the single-use link (Phase 6a run 3; M11's "book" and
// "slink"): two side panels over the calendar. A call is anchored to the
// client's own zone (a three-way or a group to the booker's, or the
// organisation's main office, and it says which); both clocks show, with
// both days when they differ; a public holiday where the client is says so
// before anything is booked. Every rule and word is calendar.js's. Nothing
// here sends anything: an invite goes only once Google Calendar is connected.

const WHERE = PLACES.filter((p) => p.value !== 'phone');
const LENGTHS = BOOKING_LENGTHS.map((m) => ({ value: String(m), label: `${m} minutes` }));
const TRAVEL = [{ value: '0', label: 'None' }, ...[15, 30, 45, 60, 90].map((m) => ({ value: String(m), label: `${m} minutes` }))];
const FIRST_TIMES = 3;
const day0 = '2000-01-01';

const blank = (start, data) => {
  const client = start?.clientId ? data.clients.find((c) => c.id === start.clientId) : start?.title ? data.clients.find((c) => c.name.toLowerCase() === String(start.title).trim().toLowerCase()) : null;
  const group = start?.groupId ? data.groups.find((g) => g.id === start.groupId) : null;
  return {
    who: client ? `c:${client.id}` : group ? `g:${group.id}` : start?.title ? BOOK_WITH_SOMEONE_ELSE : '', name: client || group ? '' : start?.title || '', kind: 'coaching', where: 'zoom', location: '', travel: '0',
    minutes: null, at: start?.starts_at || null, own: Boolean(start?.starts_at), more: FIRST_TIMES, often: 0, count: 6, paste: '', moved: {}, fixing: null,
  };
};

/**
 * Book a call, in the side panel.
 * @param {{ cal: object, open: boolean, onClose: (day?: string) => void, start?: { title?, starts_at?, clientId?, groupId? }|null, onLink: (start) => void, onPoll?: (start) => void }} props
 */
export function BookCallPanel({ cal, open, onClose, start = null, onLink, onPoll }) {
  const { coachZone, data, settings, now, state } = cal;
  const [d, setD] = useState(() => blank(start, data));
  const [problem, setProblem] = useState(null);
  const [holidays, setHolidays] = useState([]);
  const busy = useRef(false);
  const startKey = JSON.stringify(start || {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) { setD(blank(start, data)); setProblem(null); } }, [open, startKey]);
  const set = (patch) => { setD((was) => ({ ...was, ...patch })); setProblem(null); };

  const client = d.who.startsWith('c:') ? data.clients.find((c) => c.id === d.who.slice(2)) || null : null;
  const group = d.who.startsWith('g:') ? data.groups.find((g) => g.id === d.who.slice(2)) || null : null;
  const other = d.who === BOOK_WITH_SOMEONE_ELSE;
  const engagement = client ? rowsOf(state, 'engagements').filter((e) => e.profile_id === client.id && e.status === 'active').sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0] || null : null;
  const suggested = BOOKING_LENGTHS.includes(engagement?.default_minutes) ? engagement.default_minutes : null;
  const minutes = Number(d.minutes) || suggested || (group ? 90 : 60);
  const several = Boolean(group) || other || (client && d.kind === 'three_way');
  const organisation = group ? cal.organisations.find((o) => o.id === group.organisation_id) || null : null;
  // A client call is anchored to the client's own zone; a three-way or a group to the booker's, or the organisation's main office.
  const zone = several ? anchorZone({ booker: group ? null : { time_zone: coachZone }, organisation, coachZone }) : anchorZone({ client, coachZone });
  const read = invited(d.paste);

  const inHours = useMemo(() => (open && d.who ? bookSuggestions({ minutes, zone, coachZone, settings, data, now }) : []), [open, d.who, minutes, zone, coachZone, settings, data, now]);
  // A client with no time in common with the working day (Sydney in a UK winter): the nearest early or late times, marked as outside your hours.
  // Decided on the working hours alone: a client who shares hours with a coach booked solid gets no times outside them.
  const outside = useMemo(() => !inHours.length && Boolean(client) && !several && open && noSharedHours({ minutes, zone, coachZone, settings, now }), [inHours, client, several, open, minutes, zone, coachZone, settings, now]);
  const free = useMemo(() => (outside && open ? outsideHoursSuggestions({ minutes, zone, coachZone, settings, data, now }) : inHours), [outside, inHours, open, minutes, zone, coachZone, settings, data, now]);
  const offered = useMemo(() => suggestTimes(free, d.more), [free, d.more]);
  const first = d.at ? new Date(d.at) : null;
  const series = useMemo(() => (first ? seriesStarts({ first, clientZone: zone, every: Number(d.often), count: Number(d.often) ? d.count : 1 }).starts : []), [d.at, zone, d.often, d.count]); // eslint-disable-line react-hooks/exhaustive-deps
  const starts = series.map((s, i) => (d.moved[i] ? new Date(d.moved[i]) : s));
  const clashes = starts.length > 1 ? starts.map((s, i) => ({ i, clash: seriesClashes([s], minutes, { items: data.items, sessions: data.sessions, busy: data.busy, coachZone })[0] })).filter((c) => c.clash) : [];
  const fixTimes = d.fixing != null && starts[d.fixing]
    ? suggestTimes(bookSuggestions({ minutes, zone, coachZone, settings, data, now: new Date(Math.max(now.getTime(), starts[d.fixing].getTime() - 3 * 86400000)), days: 7 }), FIRST_TIMES) : [];

  // A public holiday where the client is, said before anything is booked.
  const startsKey = starts.map((s) => s.getTime()).join(',');
  useEffect(() => {
    let live = true;
    if (!open || !starts.length) { setHolidays([]); return undefined; }
    Promise.all(starts.map((s) => holidayLineFor(s, zone).catch(() => null))).then((lines) => {
      if (live) setHolidays(lines.map((line, i) => (line ? (starts.length > 1 ? `${dayKeyWords(wallClock(starts[i], zone).date)}: ${line}` : line) : null)).filter(Boolean));
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, startsKey, zone]);

  const ownDay = first ? wallClock(first, coachZone).date : cal.todayKey;
  const ownTime = first ? wallClock(first, coachZone).time : '';
  const typeOwn = (day, time) => { const t = typedStart({ day, time, coachZone }); set({ at: t.start ? t.start.toISOString() : null, moved: {}, fixing: null }); };

  const save = async () => {
    if (busy.current) return;
    if (!d.who) { setProblem('Choose who it’s with to carry on.'); return; }
    if (other && !d.name.trim()) { setProblem('Type their name to carry on.'); return; }
    if (!first) { setProblem(BOOKING_WORDS.pick); return; }
    if (d.where === 'in_person' && !d.location.trim()) { setProblem('Type where it is to carry on.'); return; }
    if (clashes.length) { setProblem(clashes.length === 1 ? 'One call clashes. Choose another time for it to carry on.' : 'Some calls clash. Choose another time for each to carry on.'); return; }
    for (const s of starts) {
      const line = callProblem({ start: s, minutes, clientZone: zone, coachZone, settings, items: data.items, sessions: data.sessions, busy: data.busy });
      if (line) { setProblem(starts.length > 1 ? `${dayKeyWords(wallClock(s, coachZone).date)}: ${line}` : line); return; }
    }
    busy.current = true;
    const plan = bookCallPlan({
      starts, minutes, zone, title: group?.name || client?.name || d.name.trim(), client, group, engagementId: engagement?.id || null, sessionKind: group ? 'group' : d.kind,
      kind: other ? 'other' : 'client_call', placeKind: d.where, location: d.where === 'in_person' ? d.location : null, travelMinutes: d.where === 'in_person' ? Number(d.travel) : 0, people: several ? read.people : [],
    }, cal.ctx);
    const ok = await cal.run(plan);
    busy.current = false;
    if (ok) onClose(wallClock(starts[0], coachZone).date);
  };

  const who = bookWhoChoices({ clients: data.clients, groups: data.groups });
  const name = client?.name || group?.name || d.name;
  const whenOptions = offered.map((s) => { const w = suggestionWords(s, { coachZone, clientZone: several ? null : zone, name }); return { value: s.toISOString(), label: w.when, hint: w.theirs || undefined, note: outside ? OUTSIDE_HOURS : undefined }; });
  return (
    <SlidePanel draftKey="book-call:new"
      open={open}
      onClose={() => onClose()}
      title="Book a call"
      footer={(
        <div className="cc-panel-foot">
          <TextLink onClick={() => onLink({ forName: other ? d.name : client?.name || '', profileId: client?.id || null, minutes })}>Make a single-use link instead</TextLink>
          <Button variant="primary" className="ds-panel-go" onClick={save}>{bookCallLabel(Math.max(1, starts.length))}</Button>
        </div>
      )}
    >
      <div className="cc-field"><Dropdown label="Who is it with?" placeholder="Choose" options={who} value={d.who || null} onChange={(v) => set({ who: v, at: d.own ? d.at : null, moved: {}, fixing: null })} /></div>
      {other && <div className="cc-field"><TextBox lines="one" label="Their name" value={d.name} maxLength={120} onChange={(v) => set({ name: v })} /></div>}
      {client && <div className="cc-field"><Dropdown label="What kind of session?" options={BOOK_KINDS} value={d.kind} onChange={(v) => set({ kind: v })} /></div>}
      {several && (
        <div className="cc-field">
          <TextBox label={INVITED_LABEL} placeholder={INVITED_EXAMPLE} value={d.paste} maxLength={4000} onChange={(v) => set({ paste: v })} />
          {d.paste.trim() && <p className="cc-book-read" aria-live="polite">{[`${read.countWords} to invite.`, ...read.lines].join(' ')}</p>}
          <p className="cc-note">{group && organisation?.time_zone ? `It’s anchored to ${zoneLabel(zone)}, ${organisation.name}’s main office.` : `It’s anchored to ${zoneLabel(zone)}, where you’re booking it.`}</p>
          {onPoll && <div className="cc-acts"><TextLink onClick={() => onPoll({ title: name || '', minutes, placeKind: d.where, paste: d.paste, clientId: client?.id || null })}>Find a time with a poll</TextLink></div>}
        </div>
      )}
      <div className="cc-field"><InlineChoice label="Where?" form="pills" options={WHERE} value={d.where} onChange={(v) => set({ where: v })} /></div>
      {d.where === 'in_person' && (
        <>
          <div className="cc-field"><TextBox lines="one" label="Where is it?" value={d.location} maxLength={200} onChange={(v) => set({ location: v })} /></div>
          <div className="cc-field"><Dropdown label={TRAVEL_LABEL} options={TRAVEL} value={d.travel} onChange={(v) => set({ travel: v })} />{d.travel !== '0' && <p className="cc-note">{TRAVEL_HELP}</p>}</div>
        </>
      )}
      <div className="cc-field">
        <InlineChoice label="How long?" form="pills" options={LENGTHS} value={String(minutes)} onChange={(v) => set({ minutes: Number(v), at: d.own ? d.at : null, moved: {}, fixing: null })} />
        {suggested && client && <p className="cc-note">{suggestedLengthLine(suggested, client.name)}</p>}
      </div>

      {d.who && !d.own && (
        <div className="cc-field">
          {whenOptions.length > 0
            ? <InlineChoice label="When?" form="rows" tick options={whenOptions} value={d.at} onChange={(v) => set({ at: v, moved: {}, fixing: null })} />
            : <p className="cc-quiet">No free times in the next 2 weeks. Choose your own time.</p>}
          {outside && whenOptions.length > 0 && <p className="cc-note">None of your working hours suits {firstName(name) || 'them'} where they are, so these are your nearest early and late times.</p>}
          <div className="cc-acts">
            {offered.length < free.length && offered.length >= d.more && <TextLink onClick={() => set({ more: d.more + 6 })}>Show more times</TextLink>}
            <TextLink onClick={() => set({ own: true })}>Choose my own time</TextLink>
          </div>
        </div>
      )}
      {d.who && d.own && (
        <div className="cc-field">
          <div className="cc-two">
            <DatePicker label="When?" value={ownDay} min={day0} format={(k) => dayKeyWords(k)} onChange={(k) => typeOwn(k, ownTime || '09:00')} />
            <TextField label="Starts" type="time" step={900} value={ownTime} onChange={(ev) => typeOwn(ownDay, ev.target.value)} />
          </div>
          <div className="cc-acts"><TextLink onClick={() => set({ own: false, at: null })}>Show suggested times</TextLink></div>
        </div>
      )}
      {first && <p className="cc-book-read cc-book-both-clocks" aria-live="polite">{bookWhenWords(starts[0] || first, coachZone, zone)}</p>}

      {d.who && (
        <div className="cc-field">
          <Dropdown label="How often?" options={HOW_OFTEN.map((o) => ({ value: String(o.value), label: o.label }))} value={String(d.often)} onChange={(v) => set({ often: Number(v), moved: {}, fixing: null })} />
        </div>
      )}
      {d.who && Number(d.often) > 0 && (
        <div className="cc-field cc-book-count">
          <span className="cc-field-label" id="cc-book-count">How many calls?</span>
          <Stepper label="How many calls?" value={d.count} min={2} max={SERIES_MAX} onChange={(n) => set({ count: n, moved: {}, fixing: null })} lessLabel="Fewer calls" moreLabel="More calls" />
        </div>
      )}
      {clashes.map(({ i, clash }) => (
        <div key={i} className="cc-book-clash">
          <p className="cc-problem">{clash.words} <TextLink aria-expanded={d.fixing === i} onClick={() => set({ fixing: d.fixing === i ? null : i })}>{CLASH_ACTION}</TextLink></p>
          {d.fixing === i && (fixTimes.length > 0
            ? <InlineChoice ariaLabel="Another time for that call" form="rows" tick options={fixTimes.map((s) => { const w = suggestionWords(s, { coachZone, clientZone: several ? null : zone, name }); return { value: s.toISOString(), label: w.when, hint: w.theirs || undefined }; })} value={null} onChange={(v) => set({ moved: { ...d.moved, [i]: v }, fixing: null })} />
            : <p className="cc-quiet">No free time is near that one. Book fewer calls, then add it on its own.</p>)}
        </div>
      ))}
      {holidays.map((line) => <p key={line} className="cc-book-read" role="status">{line}</p>)}
      {problem && <p className="cc-problem" role="alert">{problem}</p>}
    </SlidePanel>
  );
}

// ---------------------------------------------------------------- a single-use link

const ENDS = [{ value: '0', label: 'No end date' }, { value: '7', label: 'In 1 week' }, { value: '14', label: 'In 2 weeks' }, { value: '28', label: 'In 4 weeks' }];

/** Copies words to the clipboard; false when the browser won't. */
export async function copyWords(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/**
 * A single-use link: what it's for, who it's for, its length, when it ends,
 * the notice needed and how far ahead it opens. Create the link copies it;
 * it works once. The open links are listed under it, each with Copy and Close.
 */
export function LinkPanel({ cal, open, onClose, start = null }) {
  const toast = useToast();
  const [d, setD] = useState(null);
  const [problem, setProblem] = useState(null);
  const [made, setMade] = useState(null);
  const busy = useRef(false);
  const startKey = JSON.stringify(start || {});
  useEffect(() => {
    if (!open) return;
    const p = LINK_PURPOSES[start?.profileId ? 2 : 0];
    setD({ purpose: p.value, forName: start?.forName || '', callName: '', minutes: BOOKING_LENGTHS.includes(start?.minutes) ? start.minutes : p.minutes, ends: '0', notice: 24, ahead: 4, profileId: start?.profileId || null });
    setProblem(null); setMade(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, startKey]);
  if (!d) return <SlidePanel open={false} onClose={onClose} title="Single-use link" />;
  const set = (patch) => { setD((was) => ({ ...was, ...patch })); setProblem(null); };
  const purpose = LINK_PURPOSES.find((p) => p.value === d.purpose) || LINK_PURPOSES[0];
  const address = (link) => publicLink(window.location.origin, BOOK_PATHS.link(link.key));
  const copy = async (link) => {
    const ok = await copyWords(address(link));
    if (ok) toast.show(linkCopiedWords(link.for_name)); else toast.error('That didn’t copy. Select the link and copy it yourself.');
  };
  const create = async () => {
    if (busy.current) return;
    busy.current = true;
    const link = newLink({
      id: newId(), key: newId(), coachId: cal.coach.id, purpose: purpose.label, forName: d.forName, callName: d.callName.trim() || purpose.callName, profileId: d.profileId, minutes: d.minutes,
      noticeHours: d.notice, aheadWeeks: d.ahead, expiresOn: d.ends === '0' ? null : addDays(cal.todayKey, Number(d.ends)),
    });
    try {
      await saveRow(cal.userId, 'coach_booking_links', link);
      setMade(link);
      await copy(link);
    } catch {
      setProblem('That didn’t save. Check your connection and try again.');
    } finally { busy.current = false; }
  };
  const close = async (link) => {
    try {
      await saveRow(cal.userId, 'coach_booking_links', { ...link, revoked_at: new Date().toISOString() });
      toast.saved({ message: 'The link is closed.', long: true, onUndo: () => saveRow(cal.userId, 'coach_booking_links', { ...link, revoked_at: null }).catch(() => {}) });
    } catch { toast.error('That didn’t save. Check your connection and try again.'); }
  };
  const openLinks = cal.bookingLinks.filter((l) => linkState(l, cal.todayKey) === 'open').sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return (
    <SlidePanel draftKey="booking-link:new"
      open={open}
      onClose={onClose}
      title="Single-use link"
      footer={<div className="cc-panel-foot cc-panel-foot--end">{made ? <Button variant="outline" className="ds-panel-go" onClick={onClose}>Done</Button> : <Button variant="primary" className="ds-panel-go" onClick={create}>Create the link</Button>}</div>}
    >
      {made ? (
        <>
          <p className="cc-quiet" role="status">{firstName(made.for_name) ? `The link for ${firstName(made.for_name)} is ready. It works once.` : 'The link is ready. It works once.'}</p>
          <div className="cc-field"><TextField label="The link" value={address(made)} readOnly onFocus={(e) => e.target.select()} onChange={() => {}} /></div>
          <div className="cc-acts"><TextLink onClick={() => copy(made)}>Copy</TextLink></div>
        </>
      ) : (
        <>
          <div className="cc-field"><Dropdown label="What’s it for?" options={LINK_PURPOSES.map((p) => ({ value: p.value, label: p.label }))} value={d.purpose} onChange={(v) => set({ purpose: v, minutes: LINK_PURPOSES.find((p) => p.value === v).minutes })} /></div>
          <div className="cc-field"><TextBox lines="one" label="Who is it for?" value={d.forName} maxLength={120} onChange={(v) => set({ forName: v, profileId: null })} /></div>
          <div className="cc-field"><TextBox lines="one" label="Call name" placeholder={purpose.callName} value={d.callName} maxLength={80} onChange={(v) => set({ callName: v })} /></div>
          <div className="cc-field"><InlineChoice label="How long?" form="pills" options={LENGTHS} value={String(d.minutes)} onChange={(v) => set({ minutes: Number(v) })} /></div>
          <div className="cc-field"><Dropdown label="Ends" options={ENDS} value={d.ends} onChange={(v) => set({ ends: v })} /></div>
          <div className="cc-field cc-book-count"><span className="cc-field-label">Notice needed</span><Stepper label="Notice needed" value={d.notice} min={0} max={168} step={12} unit="hours" onChange={(n) => set({ notice: n })} lessLabel="Fewer hours of notice" moreLabel="More hours of notice" /></div>
          <div className="cc-field cc-book-count"><span className="cc-field-label">Open this far ahead</span><Stepper label="Open this far ahead" value={d.ahead} min={1} max={12} unit="weeks" onChange={(n) => set({ ahead: n })} lessLabel="Fewer weeks ahead" moreLabel="More weeks ahead" /></div>
          {d.profileId
            ? <p className="cc-note">It’s for a client, so it offers your weekly hours and counts as one of their sessions.</p>
            : <p className="cc-note">It offers your Open for calls times.</p>}
          {problem && <p className="cc-problem" role="alert">{problem}</p>}
        </>
      )}
      {openLinks.length > 0 && (
        <div className="cc-book-links" role="list" aria-label="Open links">
          <p className="cc-small-label">Open links</p>
          {openLinks.map((l) => (
            <div key={l.id} className="cc-book-link" role="listitem">
              <span><b>{l.for_name || l.call_name || l.purpose}</b><small>{[l.purpose, `${l.minutes} minutes`, l.expires_on ? `ends ${dayKeyWords(l.expires_on)}` : LINK_STATE_WORDS.open].join(', ')}</small></span>
              <span className="cc-book-link-acts">
                <TextLink aria-label={`Copy the link for ${l.for_name || l.purpose}`} onClick={() => copy(l)}>Copy</TextLink>
                <TextLink aria-label={`Close the link for ${l.for_name || l.purpose}`} onClick={() => close(l)}>Close</TextLink>
              </span>
            </div>
          ))}
        </div>
      )}
    </SlidePanel>
  );
}

// ---------------------------------------------------------------- the two call types every coach starts with

/**
 * Makes the Chemistry Call and the Connection Call for a coach who has
 * neither yet, once the device knows what the database holds: through 051's
 * own function when it is there, on the device before that (they move across
 * with everything else).
 */
export function useStartCallTypes(cal) {
  const { userId } = cal;
  const coachId = cal.coach.id;
  const missing = startingCallTypes({ coachId, newId, have: cal.callTypes }).length > 0;
  useEffect(() => {
    if (!missing) return undefined;
    let live = true;
    (async () => {
      const loaded = await loadCoach(userId);
      if (!live || loaded === null) return; // offline: it can't be told what is there
      const have = rowsOf(coachState(userId), 'coach_call_types').filter((t) => t.coach_id === coachId);
      const add = startingCallTypes({ coachId, newId, have });
      if (!add.length) return;
      if (coachCalReadyNow() === true) {
        const { data } = await supabase.rpc('coach_call_types_start');
        if (Array.isArray(data)) noteRows(userId, data.map((r) => ['coach_call_types', r]));
        return;
      }
      await saveRows(userId, add.map((t) => ['coach_call_types', t]));
    })().catch(() => {});
    return () => { live = false; };
  }, [missing, userId, coachId]);
}
