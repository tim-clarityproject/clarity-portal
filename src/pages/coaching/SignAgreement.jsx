import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { Checkbox, ErrorMessage, Loading, PdfDownload, TextField, ToolFrame, useCoach, useToast } from '../../components/design';
import { useCachedLoad, readCache, writeCache } from '../../lib/pageCache';
import { useDraft } from '../../lib/drafts';
import { getLocalDateKey } from '../../lib/dateFormatter';
import { isNewClause, signingWords } from '../../lib/billing/agreementText';
import { mainPoints, resolveChoice } from '../../lib/agreements/clauses';
import { applies as coolingApplies, START_NOW_LINE } from '../../lib/agreements/coolingOff';
import { selfFunded } from '../../lib/agreements/terms';
import {
  ALREADY_SIGNED, agreementSections, askForChange, glanceRows, loadSigning, markOpened, readyToSign, signAgreementV2, signedLabel, tidyAgreements,
} from '../../lib/coaching/agreements';
import {
  AGREEMENT_TITLE, AGREE_TICK, FLOW, FULL_NAME, SIGN_NEEDS,
  afterSigning, choiceFor, noteText, pendingClause, pendingLine, preparedFor, signNeeds, stepsFor,
} from '../../lib/coaching/clientMoney';
import { TOOL_CLOSED } from '../../content/pageLines/client';
import { AGREEMENTS_CACHE, agreementDocument } from './agreementData';
import { ClausesCard, PointsCard, SettleSwitch } from './AgreementParts';
import SignBox from './SignBox';
import './coaching.css';
import './clientAgreement.css';

// Read and sign (Phase 6b run 3, Group C; Polish 1, Stage C, C3: M28 v6 "sign"): /coaching/agreement/:versionId, steps
// 1 and 2 of the client's Read, Sign and Settle, in focus mode (ToolFrame: × "Close and save my place", "Step 1 of 3",
// the progress line; a client an organisation funds has two steps).
//   Read: "Prepared for Sam by Alex Morgan", Your coaching agreement, the coach's own note, The main points, and The
//   agreement with its clauses opening one at a time (the first open), each with Ask for a change as Quick Add (what is
//   typed reaches the coach's Needs you), then I've read it.
//   Sign: Your full name, the signature (the typed name to start with, or drawn), the tick, the start-now tick (self-funded
//   individuals only, unticked to start with), Up front or over time where the client chooses, then Sign, never greyed
//   out: pressed too early it says what's missing in one line above the foot.
// Signing leads straight on to Settle (step 3, a self-funded client with something to settle) or the done screen. While
// a change is unanswered, or the version has run out or isn't the newest, Read shows that one line and no Next. A signed
// version opens to read, with its PDF. The first open is recorded for the coach (065's agreement_mark_opened) and never
// shown here. × keeps the place (the draft holds the step, the name and the ticks) and goes back where they came from.
// Differences from M28 v6, on purpose: the start-now tick keeps run 3's legal wording (coolingOff's START_NOW_LINE); the
// signature can still be drawn (run 3's SignBox) as well as typed.

const NOT_HERE = 'This agreement isn’t here any more.';
const RUN_OUT = (coach) => `This agreement has run out. Ask ${coach || 'your coach'} to open it again.`;
const NOT_NEWEST = 'This version can’t be signed. Open the newest one.';

/** The clauses as the reader sees them: 065's stored clauses with the choice applied, else run 1's sections. */
function readerClauses(version, choice) {
  const stored = Array.isArray(version?.clauses) ? version.clauses : [];
  if (stored.some(isNewClause)) return resolveChoice(stored, choice);
  return agreementSections(version).filter((c) => c.title).map((c) => ({ key: c.key, number: c.number, title: c.title, paragraphs: c.paragraphs }));
}

function readerPoints(version, choice, clauses) {
  const t = version?.terms || {};
  if ((version?.clauses || []).some(isNewClause) && t.kind) {
    try { return mainPoints(t, { choice, seesMoney: !version.fundedBy, clauses }); } catch { /* the older rows below */ }
  }
  return glanceRows(version);
}

export default function SignAgreement() {
  const { versionId } = useParams();
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const navigate = useNavigate();
  const toast = useToast();
  const myCoach = useCoach();
  const [today] = useState(() => getLocalDateKey());
  const { data: raw, loading, error, reload } = useCachedLoad({
    userId, name: `coaching-agreement:${versionId}`, load: () => loadSigning(userId, versionId), deps: [versionId],
  });
  const data = useMemo(() => tidyAgreements(raw), [raw]);
  const fingerprint = typeof raw?.fingerprint === 'string' ? raw.fingerprint : null;
  const version = data.agreements.find((v) => v.id === versionId) || null;
  const terms = useMemo(() => version?.terms || {}, [version]);
  const coachFirst = (typeof terms.coachFirst === 'string' ? terms.coachFirst : '') || myCoach?.firstName || '';
  const words = signingWords(coachFirst || 'Your coach');

  const [step, setStep] = useState('read');
  const [choice, setChoice] = useState(null);
  const shownChoice = choice || choiceFor(terms, version?.settleChoice);
  const clauses = useMemo(() => readerClauses(version, shownChoice), [version, shownChoice]);
  const points = useMemo(() => readerPoints(version, shownChoice, clauses), [version, shownChoice, clauses]);

  const [agreed, setAgreed] = useState(false);
  const [startNow, setStartNow] = useState(false);
  const [name, setName] = useState('');
  const [nameFrom, setNameFrom] = useState('');
  const [need, setNeed] = useState(null);
  const [failure, setFailure] = useState(null);
  const busy = useRef(false);
  const sigRef = useRef(null);
  const [asked, setAsked] = useState(null); // { clauseKey } once a change is sent here
  const [askProblem, setAskProblem] = useState(null);

  const { clear: clearDraft } = useDraft({
    userId, name: `agreement-sign:${versionId}`, ready: Boolean(version),
    value: { name, agreed, startNow, choice, step },
    onRestore: (d) => {
      if (typeof d?.name === 'string') setName(d.name);
      if (d?.agreed === true) setAgreed(true);
      if (d?.startNow === true) setStartNow(true);
      if (d?.choice === 'upfront' || d?.choice === 'plan') setChoice(d.choice);
      if (d?.step === 'sign') setStep('sign');
    },
  });

  const termsName = typeof terms.clientName === 'string' ? terms.clientName.trim() : '';
  if (termsName && termsName !== nameFrom) { setNameFrom(termsName); if (!name) setName(termsName); }

  // The first open, for the coach only (agreements rule 6): once per page, while it waits to be signed.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || !version || version.signedAt || version.status !== 'sent') return;
    opened.current = true;
    markOpened(versionId);
  }, [version, versionId]);

  // × keeps the place (the draft is on the device) and goes back where they came from (rule 21).
  const close = () => {
    toast.show(TOOL_CLOSED);
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate('/welcome');
  };

  if (!version) {
    if (loading) return <div className="ui-root plan-builder-wait"><Loading label="Loading your agreement" /></div>;
    return (
      <div className="cl-flow">
        <ToolFrame step={1} steps={1} last stepWords=" " question={AGREEMENT_TITLE} onClose={close} onNext={() => navigate('/coaching', { replace: true })} nextLabel="Open My coaching">
          <p className="cl-say" role="status">{error ? 'The page didn’t load. Check your connection and try again.' : NOT_HERE}</p>
        </ToolFrame>
      </div>
    );
  }

  const fullTerms = { ...terms, fundedBy: version.fundedBy || terms.fundedBy || null };
  const self = selfFunded(fullTerms);
  const pending = asked ? { clauseKey: asked.clauseKey } : version.changePending;
  const pendingWords = pending ? pendingLine(pendingClause({ clause_key: pending.clauseKey, title: pending.title }, clauses), coachFirst) : '';
  const runOut = !version.signedAt && version.expiresOn && version.expiresOn < today;
  const waiting = readyToSign(data.agreements);
  const notNewest = !version.signedAt && waiting?.id !== versionId;
  const steps = stepsFor(fullTerms).length;
  const eyebrow = preparedFor({ clientFirst: terms.clientFirst, clientName: terms.clientName, coachName: terms.coachName });
  const note = <p className="cl-quote">{`“${noteText(version.personalNote || terms.personalNote)}”`}</p>;

  const sendAsk = async (clause, typed) => {
    setAskProblem(null);
    const res = await askForChange({ versionId, clauseKey: clause.key, words: typed });
    if (!res.ok) { setAskProblem(res.message || SIGN_NEEDS.change); return; }
    setAsked({ clauseKey: clause.key });
    toast.show(FLOW.askSent(coachFirst));
    reload();
  };

  // ---- A signed version: to read, with its PDF (from My Account, Coaching).
  if (version.signedAt) {
    return (
      <div className="cl-flow">
        <ToolFrame step={steps} steps={steps} last stepWords={FLOW.signedSteps} name={eyebrow} question={AGREEMENT_TITLE} onClose={close}>
          <div className="cl-stack" role="status">
            <p className="cl-say">{signedLabel(version.signedAt, today)}</p>
            <p className="cl-hint">{words.signed}</p>
            <PdfDownload lightOnly variant="text" getDocument={() => agreementDocument({ userId, version })} />
          </div>
          <PointsCard points={points} />
          <ClausesCard clauses={clauses} />
        </ToolFrame>
      </div>
    );
  }

  const blocked = pending || runOut || notNewest;
  if (step === 'read' || blocked) {
    return (
      <div className="cl-flow">
        <ToolFrame
          step={1}
          steps={steps}
          name={eyebrow}
          question={AGREEMENT_TITLE}
          onClose={close}
          onNext={blocked ? undefined : () => { setStep('sign'); setNeed(null); }}
          nextLabel={FLOW.readNext}
        >
          {blocked ? <p className="cl-say cl-blocked" role="status">{pending ? pendingWords : runOut ? RUN_OUT(coachFirst) : NOT_NEWEST}</p> : note}
          {askProblem && <ErrorMessage>{askProblem}</ErrorMessage>}
          <PointsCard points={points} />
          <ClausesCard clauses={clauses} ask={blocked ? null : { coachFirst, onSend: sendAsk }} />
        </ToolFrame>
      </div>
    );
  }

  const sign = async () => {
    const missing = signNeeds({ agreed, name, hasSignature: Boolean(sigRef.current?.has()) });
    if (missing) { setNeed(missing); return; }
    const typed = Boolean(sigRef.current?.typed);
    const image = typed ? '' : sigRef.current?.image();
    if (!typed && !image) { setNeed(SIGN_NEEDS.signature); return; }
    if (busy.current) return;
    busy.current = true;
    setFailure(null);
    setNeed(null);
    const res = await signAgreementV2({
      userId, versionId, name, fingerprint, startNow: self && coolingApplies(terms) && !version.amends ? startNow : false,
      choice: shownChoice, signature: typed ? { kind: 'typed' } : { kind: 'drawn', image },
    });
    busy.current = false;
    if (res.ok || res.kind === 'signed') {
      if (res.kind === 'signed') toast.show(ALREADY_SIGNED); else toast.show('Signed');
      clearDraft();
      if (res.ok) {
        // The device's copies learn it at once, so the next step, My coaching and Home show it signed.
        const patch = (list) => (list || []).map((v) => (v.id === versionId ? { ...v, status: 'signed', signedAt: res.signedAt, signedName: name.trim(), startNow: res.startNow, settleChoice: res.settleChoice } : v));
        try {
          const kept = readCache(userId, AGREEMENTS_CACHE)?.v;
          if (kept?.tidied) writeCache(userId, AGREEMENTS_CACHE, { ...kept, agreements: patch(kept.agreements) });
          if (raw?.tidied) writeCache(userId, `coaching-agreement:${versionId}`, { ...raw, agreements: patch(raw.agreements) });
        } catch { /* the next load brings it */ }
      }
      const next = afterSigning(fullTerms, res.settleChoice || shownChoice, { amends: version.amends || res.amends });
      navigate(`/coaching/agreement/${versionId}/${next}`, { replace: true });
      return;
    }
    setFailure(res);
    if (res.kind === 'refused') reload();
  };

  return (
    <div className="cl-flow">
      <ToolFrame
        step={2}
        steps={steps}
        name={FLOW.agreementLabel}
        question={FLOW.signQuestion}
        onClose={close}
        onNext={sign}
        nextLabel={FLOW.signNext}
        onBack={() => { setStep('read'); setNeed(null); }}
      >
        <div className="cl-stack cl-signstep">
          <TextField label={FULL_NAME} autoComplete="name" value={name} maxLength={160} onChange={(e) => { setName(e.target.value); setNeed(null); }} />
          <SignBox ref={sigRef} name={name} onChange={() => setNeed(null)} />
          <div className="cl-ticks">
            <Checkbox checked={agreed} onChange={(v) => { setAgreed(v); setNeed(null); }}>{AGREE_TICK}</Checkbox>
            {self && coolingApplies(terms) && !version.amends && <Checkbox checked={startNow} onChange={setStartNow}>{START_NOW_LINE}</Checkbox>}
          </div>
          <SettleSwitch terms={fullTerms} value={shownChoice} onChange={setChoice} chosenExtras={terms.extrasChosen} />
          {need && <ErrorMessage>{need}</ErrorMessage>}
          {failure && <ErrorMessage>{failure.lines.map((l) => <span key={l} className="ds-line">{l}</span>)}</ErrorMessage>}
        </div>
      </ToolFrame>
    </div>
  );
}
