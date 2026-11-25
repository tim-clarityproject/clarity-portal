import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import DesignHeader from '../../components/DesignHeader';
import {
  Button, Checkbox, ErrorMessage, LoadError, Loading, PdfDownload, Section, TextBox, TextField, useCoach, useToast,
} from '../../components/design';
import AgreementView from '../../components/agreements/AgreementView';
import StepsMarker from '../../components/agreements/StepsMarker';
import SettleChoice from '../../components/agreements/SettleChoice';
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
  AGREEMENT_TITLE, AGREE_TICK, ASK_CHANGE, ASK_LABEL, BACK_TO_AGREEMENT, FULL_NAME, READ_TIME, SIGN_HEADING, SIGN_NEEDS,
  afterSigning, askedLine, choiceFor, noteText, pendingClause, pendingLine, preparedLine, sendChangeWords, signButton, signNeeds, stepsFor,
} from '../../lib/coaching/clientMoney';
import { AGREEMENTS_CACHE, agreementDocument } from './agreementData';
import SignBox from './SignBox';
import './coaching.css';
import './clientAgreement.css';

// Read and sign (Phase 6b run 3, Group C; M28 version 4 s-c-sign, s-c-change, s-c-asked; brief items 11, 12, 36, 37):
// /coaching/agreement/:versionId, one calm page, a welcome rather than a form:
//   the cover (who it's prepared for and by, the version, the coach's own note), the steps (Read, Sign, Settle; a
//   client funded by an organisation has no Settle), "It takes ~5 minutes to read.", Main points, the contents, every
//   clause with its reasons and "Ask for a change" (its box opens under the clause; what is typed reaches the coach's
//   Needs you), then one signing block: the tick, "Start my coaching straight away…" (self-funded individuals only,
//   unticked to start with), "How would you like to settle?" where the client chooses (up front first and chosen),
//   the full name, the signature box, and Sign and continue (self-funded) or Sign my agreement.
// While a change is unanswered the signing block is replaced by "You asked for a change to [clause]. [Coach] will look
// at it and send you a new version to sign." (item 36). Sending a change shows M28's centred message, with Back to your
// agreement. Signing leads straight into settling the first amount (self-funded), else to the welcome. The first open
// is recorded for the coach (065's agreement_mark_opened) and never shown here. The Sign button is never greyed out:
// pressed too early it says what's missing in M28's one line above it.
// Differences from M28, on purpose: "Send to Tim" is an outlined button, as one coral button per screen (CLAUDE.md
// rule 4a) leaves the coral for Sign; the reason line has no side line (risk 3).

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
  const [sending, setSending] = useState(false);
  const busy = useRef(false);
  const sigRef = useRef(null);

  // Ask for a change: one box at a time, under its own clause.
  const [askKey, setAskKey] = useState(null);
  const [askWords, setAskWords] = useState('');
  const [askNeed, setAskNeed] = useState(null);
  const [asked, setAsked] = useState(null); // { clauseKey } once sent here
  const askBusy = useRef(false);

  const { clear: clearDraft } = useDraft({
    userId, name: `agreement-sign:${versionId}`, ready: Boolean(version),
    value: { name, agreed, startNow, choice },
    onRestore: (d) => {
      if (typeof d?.name === 'string') setName(d.name);
      if (d?.agreed === true) setAgreed(true);
      if (d?.startNow === true) setStartNow(true);
      if (d?.choice === 'upfront' || d?.choice === 'plan') setChoice(d.choice);
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

  const openCoaching = () => navigate('/coaching', { replace: true });

  if (!version) {
    if (loading) return <div className="ui-root plan-builder-wait"><Loading label="Loading your agreement" /></div>;
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page ipp-page coaching-page cl-page">
          {error ? <LoadError>The page didn’t load. Check your connection and try again.</LoadError> : <p className="cl-say">{NOT_HERE}</p>}
          <div className="cl-acts"><Button variant="primary" onClick={openCoaching}>Open My coaching</Button></div>
        </div>
      </div>
    );
  }

  const self = selfFunded({ ...terms, fundedBy: version.fundedBy || terms.fundedBy || null });
  const pending = asked ? { clauseKey: asked.clauseKey } : version.changePending;
  const pendingWords = pending ? pendingLine(pendingClause({ clause_key: pending.clauseKey, title: pending.title }, clauses), coachFirst) : '';
  const runOut = !version.signedAt && version.expiresOn && version.expiresOn < today;
  const waiting = readyToSign(data.agreements);
  const notNewest = !version.signedAt && waiting?.id !== versionId;

  // ---- Ask for a change (s-c-change), sent: M28's centred message (s-c-asked)
  if (asked && asked.message) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page ipp-page coaching-page cl-page" data-align="centre">
          <div className="cl-msg" role="status">
            <p className="cl-say">{askedLine(coachFirst)}</p>
            <Button variant="text" onClick={() => setAsked({ clauseKey: asked.clauseKey })}>{BACK_TO_AGREEMENT}</Button>
          </div>
        </div>
      </div>
    );
  }

  const openAsk = (key) => { setAskKey((k) => (k === key ? null : key)); setAskWords(''); setAskNeed(null); };
  const sendAsk = async (clause) => {
    if (askBusy.current) return;
    if (!askWords.trim()) { setAskNeed(SIGN_NEEDS.change); return; }
    askBusy.current = true;
    const res = await askForChange({ versionId, clauseKey: clause.key, words: askWords });
    askBusy.current = false;
    if (!res.ok) { setAskNeed(res.message); return; }
    setAskKey(null);
    setAskWords('');
    setAsked({ clauseKey: clause.key, message: true });
    window.scrollTo?.(0, 0);
    reload();
  };

  const askBox = (clause) => {
    if (version.signedAt || pending || runOut || notNewest) return null;
    const open = askKey === clause.key;
    const boxId = `cl-ask-${clause.key}`;
    return (
      <div className="cl-ask">
        <Button variant="text" aria-expanded={open} aria-controls={boxId} onClick={() => openAsk(clause.key)}>{ASK_CHANGE}</Button>
        {open && (
          <div id={boxId} className="cl-ask-box">
            <TextBox label={ASK_LABEL} value={askWords} onChange={(e) => { setAskWords(typeof e === 'string' ? e : e.target.value); setAskNeed(null); }} />
            {askNeed && <ErrorMessage>{askNeed}</ErrorMessage>}
            <div className="cl-acts">
              <Button variant="outline" onClick={() => sendAsk(clause)}>{sendChangeWords(coachFirst)}</Button>
              <Button variant="text" onClick={() => openAsk(clause.key)}>Cancel</Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const sign = async () => {
    const missing = signNeeds({ agreed, name, hasSignature: Boolean(sigRef.current?.has()) });
    if (missing) { setNeed(missing); return; }
    const typed = Boolean(sigRef.current?.typed);
    const image = typed ? '' : sigRef.current?.image();
    if (!typed && !image) { setNeed(SIGN_NEEDS.signature); return; }
    if (busy.current) return;
    busy.current = true;
    setSending(true);
    setFailure(null);
    setNeed(null);
    const res = await signAgreementV2({
      userId, versionId, name, fingerprint, startNow: self && coolingApplies(terms) && !version.amends ? startNow : false,
      choice: shownChoice, signature: typed ? { kind: 'typed' } : { kind: 'drawn', image },
    });
    busy.current = false;
    setSending(false);
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
      const next = afterSigning({ ...terms, fundedBy: version.fundedBy || terms.fundedBy || null }, res.settleChoice || shownChoice, { amends: version.amends || res.amends });
      navigate(`/coaching/agreement/${versionId}/${next}`, { replace: true });
      return;
    }
    setFailure(res);
    if (res.kind === 'refused') reload();
  };

  const signedAt = version.signedAt;
  const steps = stepsFor({ ...terms, fundedBy: version.fundedBy || terms.fundedBy || null });

  let block;
  if (signedAt) {
    block = (
      <div className="cl-panel" role="status">
        <p className="cl-say">{signedLabel(signedAt, today)}</p>
        <p className="cl-hint">{words.signed}</p>
        <PdfDownload lightOnly getDocument={() => agreementDocument({ userId, version })} />
      </div>
    );
  } else if (pending) {
    block = <div className="cl-panel"><p className="cl-say">{pendingWords}</p></div>;
  } else if (runOut || notNewest) {
    block = <div className="cl-panel"><p className="cl-say">{runOut ? RUN_OUT(coachFirst) : NOT_NEWEST}</p></div>;
  } else {
    block = (
      <div className="cl-signblock" id="sign-here">
        <Section title={SIGN_HEADING} className="cl-sec" />
        <Checkbox checked={agreed} onChange={(v) => { setAgreed(v); setNeed(null); }}>{AGREE_TICK}</Checkbox>
        {self && coolingApplies(terms) && !version.amends && <Checkbox checked={startNow} onChange={setStartNow}>{START_NOW_LINE}</Checkbox>}
        <SettleChoice terms={{ ...terms, fundedBy: version.fundedBy || terms.fundedBy || null }} value={shownChoice} onChange={setChoice} chosenExtras={terms.extrasChosen} />
        <TextField label={FULL_NAME} autoComplete="name" value={name} maxLength={160} onChange={(e) => { setName(e.target.value); setNeed(null); }} />
        <SignBox ref={sigRef} name={name} onChange={() => setNeed(null)} />
        {need && <ErrorMessage>{need}</ErrorMessage>}
        {failure && <ErrorMessage>{failure.lines.map((l) => <span key={l} className="ds-line">{l}</span>)}</ErrorMessage>}
        <div className="cl-acts">
          <Button variant="primary" aria-busy={sending || undefined} onClick={sign}>{signButton({ ...terms, fundedBy: version.fundedBy || terms.fundedBy || null })}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="plan-page ipp-page coaching-page cl-page">
        <div className="cl-cover">
          <p className="cl-cap">{preparedLine({ clientName: terms.clientName, coachName: terms.coachName, version: version.version })}</p>
          <h1 className="cl-cover-title">{AGREEMENT_TITLE}</h1>
          <p className="cl-note">{noteText(version.personalNote || terms.personalNote)}</p>
        </div>
        <StepsMarker current={signedAt ? 2 : 0} steps={steps} />
        <p className="cl-bsent">{READ_TIME}</p>
        <AgreementView points={points} clauses={clauses} after={askBox} idPrefix="cl" />
        {block}
      </div>
    </div>
  );
}
