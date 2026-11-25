import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loading, PageHeader, useToast } from '../../../components/design';
import SessionCheckRow from '../../../components/agreements/SessionCheckRow';
import { hoursPoints, mainPoints, teamPoints } from '../../../lib/agreements/clauses';
import { offered } from '../../../lib/agreements/coolingOff';
import { pauseMove } from '../../../lib/agreements/endDate';
import { balanceLine } from '../../../lib/agreements/hours';
import { usedLine } from '../../../lib/agreements/sessionOutcome';
import { kindOf } from '../../../lib/agreements/terms';
import {
  agreementSessions, agreementTitle, currentEnd, earlyEnd, endEarlyLine, hoursState, isSigned, sessionsIn, settledInvoices, signedDay, statusLine, versionInForce,
} from '../../../lib/agreements/duringAgreement';
import { coachZoneOf } from '../../../lib/coach/calendar';
import { rowsOf } from '../../../lib/coach/store';
import { dayIn, dayKeyWords, deviceZone } from '../../../lib/time/index.js';
import { Back, TextLink, useCoachPortal } from '../parts';
import { Meter, Points } from '../needsYou/panels';
import { AgreementPanels } from './agreementPanels';
import '../../../components/agreements/agreements.css';
import '../needsYou/needsyou.css';

// An agreement's own page (Phase 6b run 3, Group D; M28 s-agr: /coach/agreements/:id). Everything that changes a
// running agreement starts here: Extend the end date, Pause coaching, Make a change (a new version both sign, Group B's
// builder), End early, Give money back, and Cancel within 14 days for a self-funded individual still inside them
// (never an organisation's or a team's). Then its coaching sessions, each with what happened and "To confirm" for one
// past and not said yet, opening its calendar pop-up in one click (SessionCheckRow); a block of hours shows its balance
// and the hours log instead. Changes made in the panels show in the main points once the server has them.

export default function AgreementPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const p = useCoachPortal();
  const [panel, setPanel] = useState(null);
  const zone = coachZoneOf(p.settings, deviceZone());
  const a = p.agreements.find((x) => x.id === id) || null;
  const v = a ? versionInForce(p.agreementVersions, a.id) : null;
  const t = useMemo(() => v?.terms || {}, [v]);
  const sessions = useMemo(() => (a ? agreementSessions({ agreement: a, terms: t, sessions: p.sessions, zone }) : []), [a, t, p.sessions, zone]);

  if (!a) {
    if (p.partial || !p.whole) return <div className="cc-page"><div className="cc-col"><Loading label="Loading the agreement" /></div></div>;
    return <div className="cc-page"><div className="cc-col"><Back onClick={() => navigate('/coach/clients')} /><PageHeader title="The agreement" /><p className="cc-quiet">This agreement isn’t here any more.</p></div></div>;
  }
  const client = p.clients.find((c) => c.id === a.profile_id) || null;
  const org = p.organisations.find((o) => o.id === a.organisation_id) || null;
  const name = client?.name || org?.name || t.clientName || '';
  const k = kindOf(t);
  const signed = isSigned(v);
  const live = signed && !['cancelled', 'ended', 'ended_not_renewed', 'expired'].includes(a.status);
  const paused = a.paused_from && a.paused_to ? { from: a.paused_from, to: a.paused_to } : null;
  // The end date now: as extended or paused (the server's own: ends_on, else ending_on with no ending_by), else moved on
  // by a pause, else as signed (duringAgreement.currentEnd).
  const moved = currentEnd(a, null);
  const end = moved || (paused && t.endsOn ? pauseMove(t.endsOn, paused.from, paused.to).end : t.endsOn) || null;
  const shownTerms = end && end !== t.endsOn ? { ...t, endsOn: end } : t;
  const points = k === 'team' ? teamPoints(shownTerms) : k === 'hours' ? hoursPoints(shownTerms)
    : mainPoints(shownTerms, { choice: v?.settle_choice || t.choice, seesMoney: true, clauses: v?.clauses, paused, endingOn: earlyEnd(a) });
  const today = p.todayKey;
  const signDay = signedDay(v);
  const canCancel14 = live && offered({ terms: t, signedDay: signDay, today, cancelled: a.status === 'cancelled' });
  const canRefund = settledInvoices(p.invoices, a.id, p.creditNotes).length > 0;
  const total = sessionsIn(t);
  const hours = k === 'hours' ? hoursState({ agreement: a, terms: t, entries: rowsOf(p.state, 'time_entries'), invoices: p.invoices }) : null;
  const back = client ? () => navigate(`/coach/clients/${client.id}`) : org ? () => navigate(`/coach/organisations/${org.id}`) : () => navigate('/coach/clients');

  const actions = [
    live && end && k !== 'hours' && k !== 'oneoff' && { key: 'extend', title: 'Extend the end date', line: 'Move it on, with no change to the price' },
    live && t.pausing !== false && k !== 'hours' && k !== 'oneoff' && { key: 'pause', title: 'Pause coaching', line: k === 'retainer' ? 'Dates and invoices move on by the pause' : 'Dates move on by the pause' },
    a.status !== 'cancelled' && { key: 'change', title: 'Make a change', line: 'A new version you both sign' },
    live && !earlyEnd(a) && { key: 'end', title: 'End early', line: endEarlyLine(t) },
    canRefund && { key: 'refund', title: 'Give money back', line: 'A refund or credit, with a credit note' },
    canCancel14 && { key: 'cancel14', title: 'Cancel within 14 days', line: v?.start_now ? 'A refund, less the coaching sessions had' : 'A full refund, with a credit note' },
  ].filter(Boolean);
  const act = (key) => {
    if (key === 'change') { navigate(`/coach/agreements/${a.id}/edit`, { state: { newVersion: true } }); return; }
    setPanel(key);
  };
  const downloadPdf = async () => {
    try {
      const [{ loadSignedPdf }, { savePdfFile }] = await Promise.all([import('../../../lib/coaching/agreements'), import('../../../lib/pdf/saveFile')]);
      const { bytes, fileName } = await loadSignedPdf(v);
      savePdfFile(bytes, fileName);
    } catch { toast.error('The signed PDF wasn’t made. Check your connection and try again.'); }
  };

  return (
    <div className="cc-page">
      <div className="cc-col ny-page">
        <Back to={name || 'Back'} onClick={back} />
        <PageHeader title={agreementTitle(name)} meta={[statusLine(a, v)]} />
        <Points label="Main points" rows={points} />
        {actions.length > 0 && (
          <div className="ny-actions">
            {actions.map((x) => (
              <button key={x.key} type="button" className="ny-action" onClick={() => act(x.key)}>
                <span><span className="ny-li-t">{x.title}</span><span className="ny-li-m">{x.line}</span></span>
              </button>
            ))}
          </div>
        )}
        {k === 'hours' ? (
          <section aria-labelledby="ny-hours-t">
            <h2 className="ny-sec" id="ny-hours-t">Block of hours</h2>
            <Meter used={hours.used} block={hours.block} label={balanceLine(hours.used, hours.block)} />
            <p className="ny-say ny-gap">{balanceLine(hours.used, hours.block)}</p>
            <div className="cc-acts"><TextLink onClick={() => navigate(`/coach/agreements/${a.id}/hours`)}>See the hours log</TextLink></div>
          </section>
        ) : (
          <section aria-labelledby="ny-sessions-t">
            <h2 className="ny-sec" id="ny-sessions-t">Coaching sessions</h2>
            <p className="ny-say ny-gap">{total ? usedLine(sessions, total) : sessions.length ? `${sessions.length} coaching ${sessions.length === 1 ? 'session' : 'sessions'} so far.` : 'No coaching sessions are booked yet.'}</p>
            {sessions.length > 0 && (
              <ul className="ag-sessions ny-gap" aria-label="Coaching sessions">
                {sessions.map((s) => <SessionCheckRow key={s.id} session={s} title={dayKeyWords(dayIn(zone, new Date(s.starts_at)))} now={p.now} />)}
              </ul>
            )}
          </section>
        )}
        {signed && <div className="cc-acts"><TextLink onClick={downloadPdf}>Download the signed PDF</TextLink></div>}
      </div>
      <AgreementPanels panel={panel} onClose={() => setPanel(null)} a={a} v={v} t={t} name={name} end={end} today={today} signed={signDay} sessions={sessions} />
    </div>
  );
}
