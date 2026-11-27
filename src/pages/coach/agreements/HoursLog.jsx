import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Dropdown, Loading, PageHeader, SlidePanel, useToast } from '../../../components/design';
import { AddLink, Card, Figure, MoreLink, PageOpening, QuickAdd, Row, Rows } from '../../../components/design/Blocks';
import { MONEY_LINES } from '../../../content/pageLines/coach';
import { agreementName } from '../../../lib/coach/money';
import { hoursWords } from '../../../lib/agreements/currency';
import { balanceLine, balanceNote, blockShort, entryLength, entryMinutes } from '../../../lib/agreements/hours';
import { hoursState, LOG_MINUTES, logDays, SAY_WHAT, versionInForce } from '../../../lib/agreements/duringAgreement';
import { coachZoneOf } from '../../../lib/coach/calendar';
import { newId, removeRow, rowsOf, saveRow } from '../../../lib/coach/store';
import { dayIn, dayKeyWords, deviceZone, instantAt, wallClock } from '../../../lib/time/index.js';
import { Back, MenuItem, PopMenu, useCoachPortal } from '../parts';
import { Meter, Problem } from '../needsYou/panels';
import '../needsYou/needsyou.css';
import '../money/money.css';

// The hours log of a block of hours (Phase 6b run 3, Group D; M28 s-h-log: /coach/agreements/:id/hours; brief item 24).
// Time is logged against the agreement's engagement (049's time_entries), each entry with its day, how long and what
// it was for, and the balance runs down as it goes. At 80% used a line goes into the coach's Needs you with a top-up
// invoice drafted; the client isn't told by the portal. "See [name]'s view" shows the balance as the client sees it on
// My Account, Block of hours (Group C's page), in a side panel. Logging has Undo for 10 seconds (coach rule 5).
// After that, each row's More menu changes or removes it (Tim, 27 Nov, walk item 13): Edit opens the same form filled
// in, Delete asks nothing more and offers Undo. The entry is the coach's own time_entries row (049's "Time: change" and
// "Time: remove" rules), so the balance, Needs you and the client's view all follow with no server step.

const firstOf = (name) => String(name || '').trim().split(/\s+/)[0] || '';
const DOTS = <svg className="cc-todo-dots" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="5.5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="18.5" cy="12" r="1.5" /></svg>;

/** `more`: the coach's own list, where each row has its More menu (walk item 13); the client's view has none. */
function LogList({ log, zone, today, more = null }) {
  if (!log.length) return <p className="cc-money-quiet">No time logged yet.</p>;
  return (
    <Rows label="Time logged">
      {log.map((e) => (
        <Row key={e.id} className={more ? 'cc-hours-row' : ''} name={e.note || 'Time logged'} sub={dayKeyWords(dayIn(zone, new Date(e.started_at)), { year: true, today })} value={entryLength(entryMinutes(e))}>
          {more && <button type="button" className="cc-round cc-hours-more" ref={(el) => { more.refs.current[e.id] = el; }} aria-label={`More for ${e.note || 'Time logged'}`} aria-haspopup="menu" aria-expanded={more.open === e.id} onClick={() => more.onOpen(e.id)}>{DOTS}</button>}
        </Row>
      ))}
    </Rows>
  );
}

export default function HoursLog() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const p = useCoachPortal();
  const zone = coachZoneOf(p.settings, deviceZone());
  const a = p.agreements.find((x) => x.id === id) || null;
  const v = a ? versionInForce(p.agreementVersions, a.id) : null;
  const t = v?.terms || {};
  const h = useMemo(() => (a ? hoursState({ agreement: a, terms: v?.terms || {}, entries: rowsOf(p.state, 'time_entries'), invoices: p.invoices }) : null), [a, v, p.state, p.invoices]);
  const days = logDays(p.todayKey);
  const [day, setDay] = useState(days[0].value);
  const [minutes, setMinutes] = useState(90);
  const [what, setWhat] = useState('');
  const [problem, setProblem] = useState(null);
  const [view, setView] = useState(false);
  const [adding, setAdding] = useState(false);
  const [menu, setMenu] = useState(null);
  const [editing, setEditing] = useState(null);
  const dots = useRef({});
  const busy = useRef(false);

  if (!a) {
    if (p.partial || !p.whole) return <div className="cc-page"><div className="cc-col"><Loading label="Loading the hours log" /></div></div>;
    return <div className="cc-page"><div className="cc-col"><Back onClick={() => navigate('/coach/clients')} /><PageHeader title="Block of hours" /><p className="cc-quiet">This block of hours isn’t here any more.</p></div></div>;
  }
  const client = p.clients.find((c) => c.id === a.profile_id) || null;
  const name = client?.name || t.clientName || '';
  const c = t.currency || 'GBP';

  const log = async (typed) => {
    const words = String(typed ?? what).trim();
    if (!words) { setProblem(SAY_WHAT); return; }
    if (!a.engagement_id) { setProblem('This block of hours has no engagement to log time against yet. Open the client’s page to add one.'); return; }
    if (busy.current) return;
    busy.current = true;
    const start = instantAt(day, '09:00', zone);
    const row = { id: newId(), engagement_id: a.engagement_id, coach_id: p.coach.id, started_at: start.toISOString(), ended_at: new Date(start.getTime() + minutes * 60000).toISOString(), note: words.slice(0, 240) };
    try {
      await saveRow(p.userId, 'time_entries', row);
      setWhat('');
      setProblem(null);
      setAdding(false);
      toast.saved({ message: `Logged ${hoursWords(minutes)}.`, long: true, onUndo: () => removeRow(p.userId, 'time_entries', row.id).catch(() => {}) });
    } catch { toast.error('That didn’t save. Check your connection and try again.'); } finally { busy.current = false; }
  };
  const entries = rowsOf(p.state, 'time_entries');
  const menuEntry = menu ? entries.find((e) => e.id === menu) || null : null;
  // Edit: the same form, filled in with the entry's words, day and length (walk item 13).
  const startEdit = (e) => {
    setMenu(null);
    setAdding(false);
    setProblem(null);
    setWhat(e.note || '');
    setDay(dayIn(zone, new Date(e.started_at)));
    setMinutes(entryMinutes(e));
    setEditing(e);
  };
  const stopEdit = () => { setEditing(null); setWhat(''); setProblem(null); setDay(days[0].value); setMinutes(90); };
  const saveEdit = async () => {
    const e = editing;
    const words = String(what).trim();
    if (!e) return;
    if (!words) { setProblem(SAY_WHAT); return; }
    if (busy.current) return;
    busy.current = true;
    const start = instantAt(day, dayIn(zone, new Date(e.started_at)) === day ? wallClock(new Date(e.started_at), zone).time : '09:00', zone);
    const row = { ...e, started_at: start.toISOString(), ended_at: new Date(start.getTime() + minutes * 60000).toISOString(), note: words.slice(0, 240) };
    try {
      await saveRow(p.userId, 'time_entries', row);
      stopEdit();
      toast.saved({ message: 'Saved', long: true, onUndo: () => saveRow(p.userId, 'time_entries', e).catch(() => {}) });
    } catch { toast.error('That didn’t save. Check your connection and try again.'); } finally { busy.current = false; }
  };
  // Delete asks nothing more: Undo puts it back (rule 28's "Deleted", with Undo).
  const remove = async (e) => {
    setMenu(null);
    try {
      await removeRow(p.userId, 'time_entries', e.id);
      toast.saved({ message: 'Deleted', long: true, onUndo: () => saveRow(p.userId, 'time_entries', e).catch(() => {}) });
    } catch { toast.error('That didn’t delete. Check your connection and try again.'); }
  };
  const dayOptions = editing && !days.some((d) => d.value === day) ? [...days, { value: day, label: dayKeyWords(day, { year: true, today: p.todayKey }) }] : days;
  const minuteOptions = (LOG_MINUTES.includes(minutes) ? LOG_MINUTES : [...LOG_MINUTES, minutes].sort((x, y) => x - y)).map((m) => ({ value: m, label: hoursWords(m) }));
  const whenAndHowLong = (
    <div className="cc-money-qa-two">
      <Dropdown label="When?" options={dayOptions} value={day} onChange={setDay} />
      <Dropdown label="How long?" options={minuteOptions} value={minutes} onChange={setMinutes} />
    </div>
  );
  const first = firstOf(name);
  // The block's own name as the title (M28 v6 "hours": "Assessment build", the label "Block of hours, £2,000 at
  // £150/hr"; the UI tester's P4): the agreement's name, else the work it is for, else the kind's name.
  const title = agreementName(t, a) !== 'Block of hours' ? agreementName(t, a) : (workTitle(t.hours?.work) || (first ? `${first}’s hours` : 'Block of hours'));

  // Polish 1, Stage C (C2; M28 v6 "hours"): the page opening (the block and its rate as the label, the work as the
  // title), then Time logged with + Add (Quick Add: what it was for, then when and how long) and the balance beside it.
  return (
    <div className="cc-page">
      <div className="cc-col cc-money-page">
        <Back to={client ? name : `${first}’s agreement`} onClick={() => navigate(client ? `/coach/clients/${client.id}` : `/coach/agreements/${a.id}`)} />
        <PageOpening label={title === 'Block of hours' ? blockShort(t.hours, c) : `Block of hours, ${blockShort(t.hours, c)}`} title={title} line={MONEY_LINES.hours(first)} />
        <div className="ds-cols ds-cols--needs-first">
          <div>
            <Card
              className="ab-hours-log"
              label="Time logged"
              add={<AddLink label="Add time" expanded={adding} controls="cc-money-log" onClick={() => { if (editing) stopEdit(); setAdding((v) => !v); }} />}
              quickAdd={editing ? (
                <QuickAdd id="cc-money-edit" open onClose={stopEdit} onAdd={saveEdit} label="Edit the time logged" addLabel="Save my edit" more={whenAndHowLong}>
                  <input className="ds-qa-box" autoFocus value={what} placeholder="What was it for?" aria-label="What was it for?" autoComplete="off" enterKeyHint="done"
                    onChange={(ev) => setWhat(ev.target.value)}
                    onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); saveEdit(); } if (ev.key === 'Escape') { ev.preventDefault(); stopEdit(); } }} />
                </QuickAdd>
              ) : (
                <QuickAdd id="cc-money-log" open={adding} onClose={() => { setAdding(false); setProblem(null); }} onAdd={log} placeholder="What was it for?" label="What was it for?" addLabel="Log time" stayOpen
                  more={whenAndHowLong} />
              )}
            >
              <Problem>{problem}</Problem>
              <LogList log={h.log} zone={zone} today={p.todayKey} more={{ refs: dots, open: menu, onOpen: setMenu }} />
            </Card>
            <PopMenu open={Boolean(menuEntry)} onClose={() => setMenu(null)} anchorRef={{ current: menu ? dots.current[menu] || null : null }} title="Time logged">
              {menuEntry && <MenuItem onClick={() => startEdit(menuEntry)}>Edit</MenuItem>}
              {menuEntry && <MenuItem onClick={() => remove(menuEntry)}>Delete</MenuItem>}
            </PopMenu>
          </div>
          <div>
            <Card label="Balance">
              <Figure value={entryLength(h.used)} unit={`of ${entryLength(h.block)} used`} />
              <Meter used={h.used} block={h.block} label={balanceLine(h.used, h.block)} />
              <p className="cc-money-quiet">{balanceNote(h.used, h.block, first)}</p>
              <MoreLink className="cc-money-view" onClick={() => setView(true)}>{`See ${first ? `${first}’s` : 'their'} view`}</MoreLink>
            </Card>
          </div>
        </div>
      </div>
      <SlidePanel open={view} onClose={() => setView(false)} title="Your block of hours">
        <div className="ny-panel">
          <p className="ny-hint">{`As ${first} sees it in My Account, Block of hours.`}</p>
          <Meter used={h.used} block={h.block} label={balanceLine(h.used, h.block)} />
          <p className="ny-say">{balanceLine(h.used, h.block)}</p>
          <LogList log={h.log} zone={zone} today={p.todayKey} />
        </div>
      </SlidePanel>
    </div>
  );
}

/**
 * The work a block of hours is for, as a short title (M28's "Assessment build"): up to its first comma or full stop, when
 * that is 48 characters or fewer; a longer description isn't a name, and the title is then the client's hours.
 */
function workTitle(work) {
  const first = String(work || '').split(/[\n,.;:!?]/)[0].replace(/\s+/g, ' ').trim();
  return first && first.length <= 48 ? first : '';
}
