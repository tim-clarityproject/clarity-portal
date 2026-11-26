import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Dropdown, Loading, PageHeader, SlidePanel, useToast } from '../../../components/design';
import { AddLink, Card, Figure, MoreLink, PageOpening, QuickAdd, Row, Rows } from '../../../components/design/Blocks';
import { MONEY_LINES } from '../../../content/pageLines/coach';
import { agreementName } from '../../../lib/coach/money';
import { hoursWords } from '../../../lib/agreements/currency';
import { at80, balanceLine, blockShort, entryLength, entryMinutes } from '../../../lib/agreements/hours';
import { hoursState, LOG_MINUTES, logDays, SAY_WHAT, versionInForce } from '../../../lib/agreements/duringAgreement';
import { coachZoneOf } from '../../../lib/coach/calendar';
import { newId, removeRow, rowsOf, saveRow } from '../../../lib/coach/store';
import { dayIn, dayKeyWords, deviceZone, instantAt } from '../../../lib/time/index.js';
import { Back, useCoachPortal } from '../parts';
import { Meter, Problem } from '../needsYou/panels';
import '../needsYou/needsyou.css';
import '../money/money.css';

// The hours log of a block of hours (Phase 6b run 3, Group D; M28 s-h-log: /coach/agreements/:id/hours; brief item 24).
// Time is logged against the agreement's engagement (049's time_entries), each entry with its day, how long and what
// it was for, and the balance runs down as it goes. At 80% used a line goes into the coach's Needs you with a top-up
// invoice drafted; the client isn't told by the portal. "See [name]'s view" shows the balance as the client sees it on
// My Account, Block of hours (Group C's page), in a side panel. Logging has Undo for 10 seconds (coach rule 5).

const firstOf = (name) => String(name || '').trim().split(/\s+/)[0] || '';

function LogList({ log, zone }) {
  if (!log.length) return <p className="cc-money-quiet">No time logged yet.</p>;
  return (
    <Rows label="Time logged">
      {log.map((e) => <Row key={e.id} name={e.note || 'Time logged'} sub={dayKeyWords(dayIn(zone, new Date(e.started_at)))} value={entryLength(entryMinutes(e))} />)}
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
  const first = firstOf(name);
  const left = Math.max(0, h.block - h.used);

  // Polish 1, Stage C (C2; M28 v6 "hours"): the page opening (the block and its rate as the label, the work as the
  // title), then Time logged with + Add (Quick Add: what it was for, then when and how long) and the balance beside it.
  return (
    <div className="cc-page">
      <div className="cc-col cc-money-page">
        <Back to={client ? name : `${first}’s agreement`} onClick={() => navigate(client ? `/coach/clients/${client.id}` : `/coach/agreements/${a.id}`)} />
        <PageOpening label={agreementName(t, a) === 'Block of hours' ? blockShort(t.hours, c) : `Block of hours, ${blockShort(t.hours, c)}`} title={agreementName(t, a)} line={MONEY_LINES.hours(first)} />
        <div className="ds-cols ds-cols--needs-first">
          <div>
            <Card
              label="Time logged"
              add={<AddLink label="Log time" expanded={adding} controls="cc-money-log" onClick={() => setAdding((v) => !v)} />}
              quickAdd={(
                <QuickAdd id="cc-money-log" open={adding} onClose={() => { setAdding(false); setProblem(null); }} onAdd={log} placeholder="What was it for?" label="What was it for?" addLabel="Log time" stayOpen
                  more={(
                    <div className="cc-money-qa-two">
                      <Dropdown label="When?" options={days} value={day} onChange={setDay} />
                      <Dropdown label="How long?" options={LOG_MINUTES.map((m) => ({ value: m, label: hoursWords(m) }))} value={minutes} onChange={setMinutes} />
                    </div>
                  )} />
              )}
            >
              <Problem>{problem}</Problem>
              <LogList log={h.log} zone={zone} />
            </Card>
          </div>
          <div>
            <Card label="Balance">
              <Figure value={entryLength(h.used)} unit={`of ${entryLength(h.block)} used`} />
              <Meter used={h.used} block={h.block} label={balanceLine(h.used, h.block)} />
              <p className="cc-money-quiet">{at80(h.used, h.block) ? `At 80% a top-up invoice was drafted in Needs you. Nothing goes to ${first || 'them'} by itself.` : `${entryLength(left)} left. At 80% a top-up invoice is drafted in Needs you.`}</p>
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
          <LogList log={h.log} zone={zone} />
        </div>
      </SlidePanel>
    </div>
  );
}
