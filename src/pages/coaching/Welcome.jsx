import { useContext, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import DesignHeader from '../../components/DesignHeader';
import { Button, Chevron, List, ListRow, LoadError, Loading, PageHeader, Section, useCoach } from '../../components/design';
import StepsMarker from '../../components/agreements/StepsMarker';
import { savePdf } from '../../components/design/pdfSave';
import { getLocalDateKey, parseDbTimestamp } from '../../lib/dateFormatter';
import { BOOK_FIRST, WHAT_NEXT, stepsFor, welcomeLine, welcomeRows, welcomeTitle } from '../../lib/coaching/clientMoney';
import { agreementDocument, useAgreements } from './agreementData';
import './coaching.css';
import './clientAgreement.css';

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

  if (!version) {
    if (loading) return <div className="ui-root plan-builder-wait"><Loading label="Loading" /></div>;
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page ipp-page coaching-page cl-page">
          <LoadError>{error ? 'This page didn’t load. Check your connection and try again.' : 'This agreement isn’t here any more.'}</LoadError>
          <div className="cl-acts"><Button variant="primary" onClick={() => navigate('/coaching')}>Open My coaching</Button></div>
        </div>
      </div>
    );
  }

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
    <div className="ui-root">
      <DesignHeader />
      <div className="plan-page ipp-page coaching-page cl-page">
        <StepsMarker current={steps.length} steps={steps} />
        <PageHeader title={welcomeTitle(terms.clientFirst)} />
        <p className="cl-say">{welcomeLine({ coachFirst, settled: typeof state?.settled === 'string' ? state.settled : null })}</p>
        <Section title={WHAT_NEXT} className="cl-sec">
          <List label={WHAT_NEXT} className="cl-rows">
            {rows.map((r) => <ListRow key={r.key} title={r.title} type={r.meta} date={<Chevron direction="right" size="sm" />} onClick={() => open(r.key)} />)}
          </List>
          {pdfProblem && <LoadError>{pdfProblem}</LoadError>}
        </Section>
        <div className="cl-acts"><Button variant="primary" onClick={book}>{BOOK_FIRST}</Button></div>
      </div>
    </div>
  );
}
