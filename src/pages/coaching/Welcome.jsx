import { useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { BoldCrosshair, Card, LoadError, Loading, Row, ToolFrame, useCoach, useToast } from '../../components/design';
import { savePdf } from '../../components/design/pdfSave';
import { getLocalDateKey, parseDbTimestamp } from '../../lib/dateFormatter';
import { BOOK_FIRST, ENDED_STATUSES, FLOW, WHAT_NEXT, doneLine, endedLine, needsSettleCheck, settledInFull, stepsFor, welcomeRows } from '../../lib/coaching/clientMoney';
import { TOOL_CLOSED } from '../../content/pageLines/client';
import { clientAsk } from '../../lib/coaching/clientAsk';
import { agreementDocument, useAgreements } from './agreementData';
import './coaching.css';
import './clientAgreement.css';

// Welcome (Polish 1, Stage C, C3: the done screen of Read, Sign and Settle, M28 v6 "sign" step 4: "Done" in the tool
// frame's bar, the full progress line, the crosshair, YOU'RE ALL SET, who has the signed agreement and what was settled,
// What happens next as a card of rows, and Book my first coaching session at the foot). Before Polish 1:
// Welcome (Phase 6b run 3, Group C; M28 version 4 s-c-signed): /coaching/agreement/:versionId/welcome. It ends as a
// beginning: every step done, "You’re in, Sam.", who has the signed agreement (and the first amount settled, when it
// was), then What happens next: Book your first coaching session (from the first day it can be booked: the start date,
// or the day after the 14 days when the start-now box wasn't ticked), Your welcome pack, Your signed agreement and
// receipt (its PDF, as kept at signing), and the one coral button, Book my first coaching session.
// Differences from M28: "your first payment of £X" reads "your first £X" (no pay word in client text); the first
// coaching session's line gives the real first day rather than M28's "or after your 14 days if you'd rather wait";
// the welcome pack opens About The Clarity Portal until Draft 3's pack is built.

export default function Welcome() {
  const { versionId } = useParams();
  const { state } = useLocation();
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const navigate = useNavigate();
  const myCoach = useCoach();
  const { data, loading, error } = useAgreements(userId);
  const [pdfProblem, setPdfProblem] = useState(null);
  const version = data.agreements.find((v) => v.id === versionId) || null;
  const terms = useMemo(() => ({ ...(version?.terms || {}), fundedBy: version?.fundedBy || version?.terms?.fundedBy || null }), [version]);
  const coachFirst = (typeof terms.coachFirst === 'string' && terms.coachFirst) || myCoach?.firstName || '';
  // Opened by its address: every step shows done only once the server says the first payment is settled (or there is
  // nothing to settle at signing). Not signed: back to Read and sign; not settled: back to Settle (functionality
  // tester, run 3, finding 12). A stand-in answer (off the live site) never sends anyone back.
  // An amendment asks too: its first payment is the first signing's, still due until settled (break-it tester, run 3,
  // finding 2). An agreement that no longer runs says so instead (finding 1).
  const ended = ENDED_STATUSES.includes(version?.agreementStatus) ? version.agreementStatus : null;
  const needsSettling = !ended && Boolean(version?.signedAt) && needsSettleCheck(terms, version?.settleChoice, { amends: version?.amends });
  const [checked, setChecked] = useState(() => !needsSettling || typeof state?.settled === 'string');
  useEffect(() => {
    if (!version) return undefined;
    if (!version.signedAt) { navigate(`/coaching/agreement/${versionId}`, { replace: true }); return undefined; }
    if (checked) return undefined;
    let live = true;
    clientAsk('settle', 'state', { versionId }).then((a) => {
      if (!live) return;
      if (a.ok && !a.standIn && a.settled === false) navigate(`/coaching/agreement/${versionId}/settle`, { replace: true });
      else setChecked(true);
    });
    return () => { live = false; };
  }, [version, versionId, checked, navigate]);

  const toast = useToast();
  const close = () => {
    toast.show(TOOL_CLOSED);
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate('/welcome');
  };
  const done = { step: 1, steps: 1, last: true, stepWords: FLOW.doneSteps, onClose: close };

  if (!version) {
    if (loading) return <div className="ui-root plan-builder-wait"><Loading label="Loading" /></div>;
    return (
      <div className="cl-flow">
        <ToolFrame {...done} stepWords=" " question={FLOW.agreementLabel} onNext={() => navigate('/coaching')} nextLabel="Open My coaching">
          <LoadError>{error ? 'This page didn’t load. Check your connection and try again.' : 'This agreement isn’t here any more.'}</LoadError>
        </ToolFrame>
      </div>
    );
  }

  if (ended && version.signedAt) {
    return (
      <div className="cl-flow">
        <ToolFrame {...done} stepWords=" " question={FLOW.agreementLabel} onNext={() => navigate('/coaching')} nextLabel="Open My coaching">
          <p className="cl-say" role="status">{endedLine(ended, coachFirst)}</p>
        </ToolFrame>
      </div>
    );
  }
  if (!checked || !version.signedAt) return <div className="ui-root plan-builder-wait"><Loading label="Loading" /></div>;
  const signedDay = version.signedAt ? getLocalDateKey(parseDbTimestamp(version.signedAt)) : null;
  const rows = welcomeRows({ terms, signedDay, startNow: version.startNow, today: getLocalDateKey(new Date()) });
  const steps = stepsFor(terms);
  const book = () => navigate('/coaching');
  const open = async (key) => {
    if (key === 'book') book();
    else if (key === 'pack') navigate('/about');
    else {
      setPdfProblem(null);
      try { await savePdf(() => agreementDocument({ userId, version }), 'light'); } catch { setPdfProblem('Your PDF wasn’t made. Check your connection and try again.'); }
    }
  };

  return (
    <div className="cl-flow">
      <ToolFrame {...done} step={steps.length} steps={steps.length} onNext={book} nextLabel={BOOK_FIRST}>
        <div className="ds-open cl-done">
          <BoldCrosshair size={40} className="cl-done-mark" />
          <h1 className="ds-open-title cl-done-title" tabIndex={-1}>{FLOW.doneTitle}</h1>
          <p className="ds-open-line">{doneLine({ coachFirst, settled: typeof state?.settled === 'string' ? state.settled : null, inFull: settledInFull(terms, version.settleChoice) })}</p>
        </div>
        <Card label={WHAT_NEXT} className="cl-next">
          {rows.map((r) => <Row key={r.key} name={r.title} value={r.meta} onClick={() => open(r.key)} />)}
        </Card>
        {pdfProblem && <LoadError>{pdfProblem}</LoadError>}
      </ToolFrame>
    </div>
  );
}
