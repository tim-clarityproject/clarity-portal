import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import DesignHeader from '../../components/DesignHeader';
import {
  Button, ButtonNote, Checkbox, ErrorMessage, GuidedTool, LoadError, Loading, PageHeader, PdfDownload, SavedSignature, SignaturePad,
  TextField, useCoach, useToast,
} from '../../components/design';
import { useCachedLoad, writeCache } from '../../lib/pageCache';
import { getLocalDateKey } from '../../lib/dateFormatter';
import { signingWords } from '../../lib/billing/agreementText';
import {
  ALREADY_SIGNED, loadSavedSignature, loadSigning, saveDrawnSignature, sentLabel, signAgreement, signProblems,
  signedLabel, thankYou, tidyAgreements,
} from '../../lib/coaching/agreements';
import { AGREEMENTS_CACHE, agreementDocument } from './agreementData';
import { FullAgreement, GlancePanel } from './AgreementParts';
import './coaching.css';

// Sign my agreement (Phase 6b run 1; mock-up M13 A3, A4 and A5, with the approved wording's
// words, which win over M13's). A calm guided tool at /coaching/agreement/:versionId:
//   1  What it says: "Version 3, sent by Tim yesterday", "Your coaching agreement", the At a
//      glance panel (the wording's Main points), "Read the full agreement" in the side panel,
//      then Next with "It takes ~5 minutes to read" under it (rule 29v).
//   2  How would you like to sign?: the saved signature with "Draw a new signature", or the box
//      (Clear, Type instead, Use this signature); Your full name (needed for the signing record
//      however someone signs); the tick box; "We record your full name, the date and the time.";
//      then "Sign with my saved signature" or "Sign my agreement", never greyed out: pressed too
//      early it says what's missing under that part.
//   Signed: "Signed Wed 28 Oct at 18:40", "Thank you, Ben.", the wording's signed line, Download
//      PDF (light only) and "Open My coaching", with the toast "Signed".
// Signing needs a connection: offline it says so in M13's words and keeps the signature, name and
// tick. The fingerprint signed with is the one read with the document when the screen opened, so a
// changed document, a second tab or a second press is refused with the database's own sentence.

const NAME = 'Coaching agreement';
const SIGN_QUESTION = 'How would you like to sign?';
const RECORD_LINE = 'We record your full name, the date and the time.';
const SAVED_TOAST = 'Saved to your account for next time.';
const NOT_HERE = 'This agreement isn’t here any more.';

function Lines({ lines }) {
  return lines.map((line) => <span key={line} className="ds-line">{line}</span>);
}

function Needs({ text, id }) {
  if (!text) return null;
  return <div id={id} className="ds-panel-needs"><ErrorMessage>{text}</ErrorMessage></div>;
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
  const coachFirst = myCoach?.firstName || (typeof version?.terms?.coachFirst === 'string' ? version.terms.coachFirst : '') || '';
  const words = signingWords(coachFirst || 'Your coach');

  // The saved signature (the newest drawn one), offered first.
  const [saved, setSaved] = useState(null); // a data URL
  const [chosen, setChosen] = useState(null); // 'saved' | 'draw' | 'typed', once the person chooses
  const [ink, setInk] = useState(false);
  const [name, setName] = useState('');
  const [nameFrom, setNameFrom] = useState('');
  const [ticked, setTicked] = useState(false);
  const [asked, setAsked] = useState(false);
  const [failure, setFailure] = useState(null); // { kind, lines }
  const [sending, setSending] = useState(false);
  const [signed, setSigned] = useState(null); // { signedAt, name, signature } once signed here
  const [fullOpen, setFullOpen] = useState(false);
  const busy = useRef(false);
  const toolRef = useRef(null);

  useEffect(() => {
    let live = true;
    loadSavedSignature(userId).then((row) => { if (live && row) setSaved((s) => s || row.image); }).catch(() => { /* drawn afresh */ });
    return () => { live = false; };
  }, [userId]);

  // The name starts as the one on the agreement; the person can change it.
  const termsName = typeof version?.terms?.clientName === 'string' ? version.terms.clientName.trim() : '';
  if (termsName && termsName !== nameFrom) { setNameFrom(termsName); if (!name) setName(termsName); }

  const mode = chosen === 'saved' && !saved ? 'draw' : chosen || (saved ? 'saved' : 'draw');
  const problems = signProblems({ mode, saved: Boolean(saved), ink, name, ticked });
  const shown = asked ? problems : null;

  const leave = () => {
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate('/coaching', { replace: true });
  };
  const openCoaching = () => navigate('/coaching', { replace: true });

  const keepDrawing = (image) => {
    setSaved(image);
    setChosen('saved');
    setInk(false);
    saveDrawnSignature(userId, image).then(() => toast.show(SAVED_TOAST)).catch(() => {
      // Kept here and signed with: signing adds it to the account itself.
    });
  };

  const sign = async () => {
    if (problems) { setAsked(true); return; }
    if (busy.current) return;
    busy.current = true;
    setSending(true);
    setFailure(null);
    const res = await signAgreement({
      userId, versionId, name, fingerprint,
      signature: mode === 'typed' ? { kind: 'typed' } : { kind: 'drawn', image: saved },
    });
    busy.current = false;
    setSending(false);
    if (res.ok) {
      setSigned({ signedAt: res.signedAt, name: name.trim(), signature: res.signature, fingerprint: res.fingerprint });
      toast.show('Signed');
      // The device's copies learn it at once, so My coaching and Home show it signed.
      reload();
      return;
    }
    if (res.kind === 'signed') {
      // Signed in another tab: told so, and shown signed.
      toast.show(ALREADY_SIGNED);
      reload();
      return;
    }
    setFailure(res);
    if (res.kind === 'refused') reload();
  };

  // My coaching's copy learns the signing too.
  useEffect(() => {
    if (!signed || !raw) return;
    try {
      writeCache(userId, AGREEMENTS_CACHE, {
        ...raw,
        agreements: (raw.agreements || []).map((v) => (v.id === versionId ? { ...v, status: 'signed', client_signed_at: signed.signedAt, signed_name: signed.name, fingerprint: signed.fingerprint || v.fingerprint } : v)),
      });
    } catch { /* the next load brings it */ }
  }, [signed, raw, userId, versionId]);

  if (!version) {
    if (loading) return <div className="ui-root plan-builder-wait"><Loading label="Loading your agreement" /></div>;
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page ipp-page coaching-page">
          <PageHeader title={NAME} />
          {error ? <LoadError>The page didn’t load. Check your connection and try again.</LoadError> : <p className="ipp-muted">{NOT_HERE}</p>}
          <div className="ds-actions ipp-actions"><Button onClick={openCoaching}>Open My coaching</Button></div>
        </div>
      </div>
    );
  }

  // ---- Signed (M13 A5): here, or already (another tab, or opened again)
  const signedAt = signed?.signedAt || version.signedAt;
  if (signedAt) {
    const doneVersion = signed ? { ...version, signedAt, signedName: signed.name, fingerprint: signed.fingerprint || version.fingerprint, status: 'signed' } : version;
    const steps = [{
      key: 'signed',
      name: 'Signed',
      label: signedLabel(signedAt, today),
      question: thankYou(signed?.name || version.signedName),
      render: () => (
        <div className="agree-signed">
          <p className="agree-line">{words.signed}</p>
          <PdfDownload
            lightOnly
            getDocument={() => agreementDocument({ userId, version: doneVersion, signature: signed?.signature || null })}
          />
        </div>
      ),
      foot: <button type="button" className="ds-btn ds-btn--primary ds-guide-next" onClick={openCoaching}>Open My coaching</button>,
    }];
    return (
      <div className="ui-root plan-builder-wait">
        <GuidedTool key="signed" name={NAME} steps={steps} progress="percent" calm onClose={openCoaching} />
      </div>
    );
  }

  // ---- Signing (M13 A3 and A4)
  const label = sentLabel(version, coachFirst, today);
  const steps = [
    {
      key: 'glance',
      name: 'What it says',
      label,
      question: words.title,
      render: (tool) => {
        toolRef.current = tool;
        return (
          <>
            <GlancePanel version={version} />
            <button type="button" className="ds-explain-link agree-read" aria-haspopup="dialog" onClick={() => setFullOpen(true)}>Read the full agreement</button>
          </>
        );
      },
      foot: (
        <ButtonNote note={words.readTime}>
          <button type="button" className="ds-btn ds-btn--primary ds-guide-next" onClick={() => toolRef.current?.go(1)}>Next</button>
        </ButtonNote>
      ),
    },
    {
      key: 'sign',
      name: 'Sign',
      label,
      question: SIGN_QUESTION,
      render: () => (
        <div className="agree-sign">
          {mode === 'saved' && (
            <SavedSignature image={saved} action={words.drawNew} onAction={() => { setChosen('draw'); setInk(false); }} />
          )}
          {mode === 'draw' && (
            <SignaturePad
              label={words.drawFirst}
              words={words}
              onUse={keepDrawing}
              onEmpty={() => setAsked(true)}
              onInk={setInk}
              onTypeInstead={() => setChosen('typed')}
              problem={shown?.signature || null}
            />
          )}
          {mode === 'saved' && <Needs text={shown?.signature} />}
          <div className="agree-name">
            <TextField
              label={words.fullName}
              autoComplete="name"
              value={name}
              maxLength={160}
              onChange={(e) => setName(e.target.value)}
            />
            <Needs text={shown?.name} />
            {mode === 'typed' && (
              <div className="ds-sig-row">
                <span className="ds-sig-links"><Button variant="text" onClick={() => setChosen('draw')}>Draw instead</Button></span>
              </div>
            )}
          </div>
          <div className="agree-tick">
            <Checkbox checked={ticked} onChange={setTicked}>{words.tick}</Checkbox>
            <Needs text={shown?.tick} />
          </div>
          <p className="agree-note">{RECORD_LINE}</p>
          {failure && <div className="agree-failure"><ErrorMessage><Lines lines={failure.lines} /></ErrorMessage></div>}
        </div>
      ),
      foot: (
        <button type="button" className="ds-btn ds-btn--primary ds-guide-next agree-sign" aria-busy={sending || undefined} onClick={sign}>
          {mode === 'saved' ? words.savedSign : words.sign}
        </button>
      ),
    },
  ];

  return (
    <div className="ui-root plan-builder-wait">
      <GuidedTool name={NAME} steps={steps} progress="percent" calm onClose={leave} />
      <FullAgreement open={fullOpen} onClose={() => setFullOpen(false)} version={version} title={words.title} />
    </div>
  );
}
