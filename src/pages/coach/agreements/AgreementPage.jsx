import { useMemo } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Chevron, Loading, useToast } from '../../../components/design';
import { Card, Empty, Figure, PageOpening, Row } from '../../../components/design/Blocks';
import { calendarLink } from '../../../components/agreements/SessionCheckRow';
import { AGREEMENT_LINES, agreementLine } from '../../../content/pageLines/coach';
import { hoursPoints, mainPoints, teamPoints } from '../../../lib/agreements/clauses';
import { offered } from '../../../lib/agreements/coolingOff';
import { pauseMove } from '../../../lib/agreements/endDate';
import { balanceLine } from '../../../lib/agreements/hours';
import { hoursWords } from '../../../lib/agreements/currency';
import { outcomeLabel, rowAction, usedLine } from '../../../lib/agreements/sessionOutcome';
import { kindOf } from '../../../lib/agreements/terms';
import {
  agreementSessions, agreementTitle, currentEnd, earlyEnd, endEarlyLine, firstSignedVersion, hoursState, isSigned, sessionsIn, settledInvoices, signedDay, statusLine, versionInForce,
} from '../../../lib/agreements/duringAgreement';
import { coachZoneOf } from '../../../lib/coach/calendar';
import { rowsOf } from '../../../lib/coach/store';
import { dayIn, dayKeyWords, deviceZone } from '../../../lib/time/index.js';
import { Back, useCoachPortal } from '../parts';
import { AgreementChange } from './agreementPanels';
import './agreementPage.css';

// An agreement's own page (Phase 6b run 3, Group D; Polish 1, Stage C, C4: M28 v6 draws no such page, so it follows
// M28's "sent" page). The opening (its version, the agreement's name, where it stands in one sentence), then two
// columns on a laptop: the main points and its coaching sessions (or a block of hours' balance) on the left; the
// changes that can be made and the agreement itself on the right. Each change (Extend the end date, Pause coaching, End
// early, Give money back, Cancel within 14 days for a self-funded individual still inside them, never an
// organisation's or a team's) runs in focus mode as a few questions and a check (?change=<key>; agreementPanels.jsx);
// Make a change opens the builder for a new version both sign. A coaching session opens its calendar pop-up.

const firstOf = (name) => String(name || '').trim().split(/\s+/)[0] || '';
const ENDED = ['cancelled', 'ended', 'ended_not_renewed', 'expired'];

export default function AgreementPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const p = useCoachPortal();
  const zone = coachZoneOf(p.settings, deviceZone());
  const a = p.agreements.find((x) => x.id === id) || null;
  const v = a ? versionInForce(p.agreementVersions, a.id) : null;
  const t = useMemo(() => v?.terms || {}, [v]);
  const sessions = useMemo(() => (a ? agreementSessions({ agreement: a, terms: t, sessions: p.sessions, zone }) : []), [a, t, p.sessions, zone]);

  if (!a) {
    if (p.partial || !p.whole) return <div className="cc-page"><div className="cc-col"><Loading label="Loading the agreement" /></div></div>;
    return (
      <div className="cc-page">
        <div className="cc-col ap-page">
          <Back onClick={() => navigate('/coach/clients')} />
          <PageOpening title="The agreement" line="This agreement isn’t here any more." />
        </div>
      </div>
    );
  }
  const client = p.clients.find((c) => c.id === a.profile_id) || null;
  const org = p.organisations.find((o) => o.id === a.organisation_id) || null;
  const name = client?.name || org?.name || t.clientName || '';
  const first = client ? firstOf(name) : name;
  const k = kindOf(t);
  const signed = isSigned(v);
  const live = signed && !ENDED.includes(a.status);
  const paused = a.paused_from && a.paused_to ? { from: a.paused_from, to: a.paused_to } : null;
  // The end date now: as extended or paused (the server's own: ends_on, else ending_on with no ending_by), else moved on
  // by a pause, else as signed (duringAgreement.currentEnd).
  const moved = currentEnd(a, null);
  const end = moved || (paused && t.endsOn ? pauseMove(t.endsOn, paused.from, paused.to).end : t.endsOn) || null;
  const shownTerms = end && end !== t.endsOn ? { ...t, endsOn: end } : t;
  const points = k === 'team' ? teamPoints(shownTerms) : k === 'hours' ? hoursPoints(shownTerms)
    : mainPoints(shownTerms, { choice: v?.settle_choice || t.choice, seesMoney: true, clauses: v?.clauses, paused, endingOn: earlyEnd(a) });
  const today = p.todayKey;
  // The 14 days count from the agreement's FIRST signing; a later signed version is an amendment (agreements rule 12).
  const firstV = firstSignedVersion(p.agreementVersions || [], a.id) || v;
  const signDay = signedDay(firstV);
  const canCancel14 = live && offered({ terms: t, signedDay: signDay, today, cancelled: a.status === 'cancelled' });
  const canRefund = settledInvoices(p.invoices, a.id, p.creditNotes).length > 0;
  const total = sessionsIn(t);
  const hours = k === 'hours' ? hoursState({ agreement: a, terms: t, entries: rowsOf(p.state, 'time_entries'), invoices: p.invoices }) : null;
  const back = client ? () => navigate(`/coach/clients/${client.id}`) : org ? () => navigate(`/coach/organisations/${org.id}`) : () => navigate('/coach/clients');
  // This year's dates without their year (writing rule 28); the Main points are the agreement's terms and keep theirs.
  const words = (day) => (day ? dayKeyWords(day, { year: true, today: p.todayKey }) : '');
  const line = agreementLine({
    first, status: a.status, signedOn: signed ? words(signedDay(v) || signDay) : '', end: words(end),
    pausedTo: paused && paused.to >= today ? words(paused.to) : '', endingOn: words(earlyEnd(a)),
  });

  const actions = [
    live && end && k !== 'hours' && k !== 'oneoff' && { key: 'extend', title: 'Extend the end date', line: 'Move it on, with no change to the price' },
    live && t.pausing !== false && k !== 'hours' && k !== 'oneoff' && { key: 'pause', title: 'Pause coaching', line: k === 'retainer' ? 'Dates and invoices move on by the pause' : 'Dates move on by the pause' },
    a.status !== 'cancelled' && { key: 'change', title: 'Make a change', line: 'A new version you both sign' },
    live && !earlyEnd(a) && { key: 'end', title: 'End early', line: endEarlyLine(t) },
    canRefund && { key: 'refund', title: 'Give money back', line: 'A refund or credit, with a credit note' },
    canCancel14 && { key: 'cancel14', title: 'Cancel within 14 days', line: firstV?.start_now ? 'A refund, less what was delivered' : 'A full refund, with a credit note' },
  ].filter(Boolean);
  const offeredKeys = actions.map((x) => x.key);
  const asked = params.get('change');
  const change = asked && asked !== 'change' && offeredKeys.includes(asked) ? asked : null;
  const act = (key) => {
    if (key === 'change') { navigate(`/coach/agreements/${a.id}/edit`, { state: { newVersion: true } }); return; }
    setParams({ change: key }, { state: { fromPage: true } });
  };
  // × and a finished change both return to the page: back in history when the page opened the change, else in place.
  const closeChange = () => {
    if (location.state?.fromPage) navigate(-1);
    else setParams({}, { replace: true });
  };
  const downloadPdf = async () => {
    try {
      const [{ loadSignedPdf }, { savePdfFile }] = await Promise.all([import('../../../lib/coaching/agreements'), import('../../../lib/pdf/saveFile')]);
      const { bytes, fileName } = await loadSignedPdf(v);
      savePdfFile(bytes, fileName);
    } catch { toast.error('The signed PDF wasn’t made. Check your connection and try again.'); }
  };

  if (change) {
    return (
      <div className="cc-page">
        <div className="cc-col ap-page">
          <AgreementChange kind={change} onClose={closeChange} a={a} v={v} t={t} name={name} end={end} today={today} signed={signDay} sessions={sessions} firstV={firstV} />
        </div>
      </div>
    );
  }

  return (
    <div className="cc-page">
      <div className="cc-col ap-page">
        <Back to={name || 'Back'} onClick={back} />
        <PageOpening label={statusLine(a, v)} title={agreementTitle(name)} line={line} />
        <div className="ds-cols ds-cols--needs-first">
          <div>
            <Card label="Main points" data-year="">
              {points.filter((r) => r.value).map((r) => <Row key={r.label} name={r.label} value={r.value} className="ap-point" />)}
            </Card>
            {k === 'hours' ? (
              <Card label="Block of hours" link={{ children: 'Hours log', onClick: () => navigate(`/coach/agreements/${a.id}/hours`) }}>
                <Figure value={hoursWords(Math.max(0, Math.round(hours.used)))} unit={`of ${hoursWords(hours.block)} used`} />
                <div className="ap-meter" role="img" aria-label={balanceLine(hours.used, hours.block)}><i style={{ '--ap-fill': `${hours.block > 0 ? Math.min(100, Math.round((hours.used / hours.block) * 1000) / 10) : 0}%` }} /></div>
                <p className="ap-note">{hours.used <= hours.block ? `${hoursWords(hours.block - Math.max(0, Math.round(hours.used)))} left.` : balanceLine(hours.used, hours.block)}</p>
              </Card>
            ) : (
              <Card label="Coaching sessions" link={client ? { children: 'Calendar', onClick: () => navigate('/coach/calendar') } : undefined}>
                {sessions.length === 0 ? <Empty>{AGREEMENT_LINES.sessionsEmpty}</Empty> : (
                  <>
                    <p className="ap-used">{total ? usedLine(sessions, total) : `${sessions.length} coaching ${sessions.length === 1 ? 'session' : 'sessions'} so far.`}</p>
                    {sessions.map((s) => (
                      <Row
                        key={s.id}
                        name={dayKeyWords(dayIn(zone, new Date(s.starts_at)))}
                        sub={outcomeLabel(s, p.now)}
                        value={rowAction(s, p.now) || undefined}
                        label={`Open the coaching session on ${dayKeyWords(dayIn(zone, new Date(s.starts_at)))}`}
                        onClick={() => navigate(calendarLink(s.id))}
                      />
                    ))}
                  </>
                )}
              </Card>
            )}
          </div>
          <div>
            {actions.length > 0 && (
              <Card label="Changes">
                {actions.map((x) => <Row key={x.key} name={x.title} sub={x.line} onClick={() => act(x.key)} label={x.title} />)}
              </Card>
            )}
            {(v || signed) && (
              <Card label="The agreement">
                {v && <Row name={`See it as ${first || 'they'} ${client ? 'sees' : 'see'} it`} value={<Chevron direction="right" />} onClick={() => navigate(`/coach/agreements/${a.id}/preview`)} className="ap-go" />}
                {signed && <Row name="Download the signed PDF" value={<Chevron direction="right" />} onClick={downloadPdf} className="ap-go" />}
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
