import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { idFromAddress } from '../../lib/coach/address';
import { Button, Dropdown, InlineChoice, PageHeader, SlidePanel, useToast } from '../../components/design';
import { deviceZone, wallClock, zoneLabel } from '../../lib/time/index.js';
import { coachState, rowsOf, saveRow } from '../../lib/coach/store';
import { firstName } from '../../lib/coach/model';
import {
  BOOK_PATHS, bookedWhenWords, callPlaceLine, cancelPollPlan, confirmPollPlan, joinNames, POLL_HELD_LINE, pollNote, pollRows, pollTabs, publicLink, visitorZones,
} from '../../lib/coach/calendar';
import { Back, Part, TextLink } from './parts';
import { useCalendar } from './calendarParts';
import { copyWords } from './BookCall';
import './booking.css';

// A poll (Phase 6a run 3; M11's "poll"): the times offered, as the coach
// sees them or as each person asked does (their own zone), who can make
// each, and Confirm, which turns the chosen time into the call and frees
// the others at once. Each person has their own link: Copy it, or open the
// drafted note in the coach's own email app. Nothing sends from here.

export default function PollPage() {
  const id = idFromAddress(useParams().id); // any case in the address (tidy follow-up 4)
  const cal = useCalendar();
  const navigate = useNavigate();
  const toast = useToast();
  const [tab, setTab] = useState('me');
  const [zoneFor, setZoneFor] = useState(null);
  const busy = useRef(false);
  const poll = cal.polls.find((p) => p.id === id) || null;
  const back = <Back to="Calendar" onClick={() => navigate('/coach/calendar')} />;
  if (!poll) {
    return <div className="cc-page"><div className="cc-col">{back}<PageHeader title="Poll" /><p className="cc-quiet">This poll isn’t here any more.</p></div></div>;
  }
  const people = cal.pollPeople.filter((p) => p.poll_id === poll.id);
  const options = cal.pollOptions.filter((o) => o.poll_id === poll.id);
  const votes = cal.pollVotes.filter((v) => options.some((o) => o.id === v.option_id));
  const tabs = pollTabs(people, cal.coachZone);
  const shown = tabs.find((t) => t.value === tab) || tabs[0];
  const rows = pollRows({ options, people, votes, zone: shown.zone });
  const isOpen = (poll.status || 'open') === 'open';
  const confirmed = options.find((o) => o.id === poll.confirmed_option_id) || null;
  const once = async (work) => { if (busy.current) return; busy.current = true; try { await work(); } finally { busy.current = false; } };
  // Read from the device itself just before it is settled: another tab may have confirmed or cancelled it a moment ago, and a
  // second confirm made from this tab's older copy removed the call the first one made (the break-it tester, 20 Nov).
  const settled = () => { const now = rowsOf(coachState(cal.userId), 'coach_polls').find((p) => p.id === poll.id); return !now || (now.status || 'open') !== 'open'; };
  const confirm = (option) => once(async () => { if (settled()) { toast.show('This poll has already been settled.'); return; } await cal.run(confirmPollPlan({ poll, option, people }, cal.ctx)); });
  const cancel = () => once(async () => { if (settled()) { toast.show('This poll has already been settled.'); return; } const ok = await cal.run(cancelPollPlan({ poll }, cal.ctx)); if (ok) navigate('/coach/calendar'); });
  const linkOf = (p) => publicLink(window.location.origin, BOOK_PATHS.poll(p.vote_key));
  const copy = async (p) => { const ok = await copyWords(linkOf(p)); toast.show(ok ? `Link copied. It’s ${firstName(p.name)}’s own.` : 'That didn’t copy. Open it in your email instead.'); };
  const mail = (p) => { const n = pollNote({ person: p, poll, options, link: linkOf(p), coachFirstName: cal.coach.display_first_name || '' }); return `mailto:${encodeURIComponent(p.email || '')}?subject=${encodeURIComponent(n.subject)}&body=${encodeURIComponent(n.body)}`; };
  const person = zoneFor ? people.find((p) => p.id === zoneFor) : null;
  const saveZone = async (zone) => {
    try { await saveRow(cal.userId, 'coach_poll_people', { ...person, time_zone: zone }); toast.show('Saved'); setZoneFor(null); } catch { toast.error('That didn’t save. Check your connection and try again.'); }
  };

  return (
    <div className="cc-page">
      <div className="cc-col cc-poll-page">
        {back}
        <PageHeader title={poll.title || joinNames(people.map((p) => p.name))} meta={[poll.title ? joinNames(people.map((p) => p.name)) : null, callPlaceLine(poll.minutes || 60, poll.place_kind)].filter(Boolean)} />
        {!isOpen && (
          <p className="cc-quiet" role="status">
            {poll.status === 'confirmed' && confirmed ? `It’s confirmed for ${bookedWhenWords(confirmed.starts_at, cal.coachZone)}.` : poll.status === 'confirmed' ? 'It’s confirmed.' : 'This poll was cancelled, and its times are free again.'}
            {poll.status === 'confirmed' && confirmed && <> <TextLink onClick={() => navigate(`/coach/calendar?view=day&day=${wallClock(confirmed.starts_at, cal.coachZone).date}`)}>Open that day</TextLink></>}
          </p>
        )}
        {tabs.length > 1 && <div className="cc-seg cc-poll-tabs"><InlineChoice ariaLabel="Whose times" semantics="pressed" form="pills" options={tabs.map((t) => ({ value: t.value, label: t.label }))} value={shown.value} onChange={setTab} /></div>}
        <Part title="Times offered">
          <p className="cc-note">They’re in {zoneLabel(shown.zone)}.</p>
          <div className="cc-poll-rows" role="list">
            {rows.map((r) => (
              <div key={r.option.id} className="cc-poll-row" role="listitem">
                <span className="cc-poll-when"><b>{r.when}</b><small className={r.everyone ? 'cc-poll-all' : undefined}>{r.votes}</small></span>
                {isOpen && <Button variant="outline" aria-label={`Confirm ${r.when}`} onClick={() => confirm(r.option)}>Confirm</Button>}
                {!isOpen && poll.confirmed_option_id === r.option.id && <span className="cc-poll-done">Confirmed</span>}
              </div>
            ))}
          </div>
          {isOpen && <p className="cc-quiet">{POLL_HELD_LINE}</p>}
        </Part>
        <Part title="Who’s asked">
          <div className="cc-poll-rows" role="list">
            {people.map((p) => (
              <div key={p.id} className="cc-poll-row cc-poll-row--person" role="listitem">
                <span className="cc-poll-when"><b>{p.name}</b><small>{[p.voted_at ? 'Answered' : 'No answer yet', zoneLabel(tabs.find((t) => t.value === p.id)?.zone || cal.coachZone)].join(', ')}</small></span>
                <span className="cc-poll-acts">
                  {isOpen && <TextLink aria-label={`Copy ${firstName(p.name)}’s link`} onClick={() => copy(p)}>Copy link</TextLink>}
                  {isOpen && p.email && <a className="ds-link" href={mail(p)} aria-label={`Open the note to ${firstName(p.name)} in my email`}>Open in my email</a>}
                  {isOpen && <TextLink aria-label={`Edit ${firstName(p.name)}’s time zone`} onClick={() => setZoneFor(p.id)}>Edit time zone</TextLink>}
                </span>
              </div>
            ))}
          </div>
          {isOpen && <p className="cc-note">Nothing is sent until you send it from your own email.</p>}
        </Part>
        {isOpen && <div className="cc-acts"><TextLink onClick={cancel}>Cancel the poll</TextLink></div>}
      </div>
      <SlidePanel open={Boolean(person)} onClose={() => setZoneFor(null)} title={person ? `${firstName(person.name)}’s time zone` : 'Time zone'}>
        {person && (
          <div className="cc-field">
            <Dropdown label="Their time zone" options={visitorZones(deviceZone(), [person.time_zone, cal.coachZone, ...(cal.settings.time_zones || [])])} value={tabs.find((t) => t.value === person.id)?.zone} onChange={saveZone} />
          </div>
        )}
      </SlidePanel>
    </div>
  );
}
