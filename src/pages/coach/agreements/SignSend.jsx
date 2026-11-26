import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Loading, PageOpening, SavedSignature, SignaturePad, TextBox, TextField, ToolFrame, useToast } from '../../../components/design';
import { BUILDER_LINES, builderClosed } from '../../../content/pageLines/coach';
import { kindOf } from '../../../lib/agreements/terms';
import { quoteNumber } from '../../../lib/agreements/quote';
import { possessive, sendWords } from '../../../lib/coach/agreementBuilder';
import { Back, TextLink, useCoachPortal } from '../parts';
import { Hint, useAgreementDraft } from './builderParts';
import { useSavedSignature, useSend } from './useSend';
import MistakeLine from '../../../components/agreements/MistakeLine';

// Sign and send (Phase 6b run 3, Group B; M28 s-sign; Polish 1, Stage C: the questionnaire's last step, in focus mode
// when there's no saved signature or the coach draws a new one; brief items 19, 22 and 31): /coach/agreements/:id/sign
// (?as=quote&valid=30 for a quote). The coach's saved signature unless they draw or type a new one, and the personal
// note from the package with the client's name filled in, editable before sending; it opens the email and the
// agreement. The coach signs first; the client then gets the email to read and sign in the portal. An associate's
// agreement is signed and waits for the owner's approval (risk 23).

export default function SignSend() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { isOwner, coach } = useCoachPortal();
  const d = useAgreementDraft(id);
  const send = useSend(d);
  const saved = useSavedSignature(d.userId);
  const [mode, setMode] = useState('saved'); // 'saved' | 'draw' | 'typed'
  const [drawn, setDrawn] = useState(null);
  const [typed, setTyped] = useState(coach?.full_name || '');
  const [note, setNote] = useState(null);
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  const sendAs = params.get('as') === 'quote' ? 'quote' : 'agreement';
  const valid = Number(params.get('valid')) || 30;
  useEffect(() => { if (saved === null) setMode('draw'); }, [saved]);
  useEffect(() => { if (d.draft && note === null) setNote(d.draft.personal_note || ''); }, [d.draft, note]);

  const { agreement, draft, party } = d;
  const toCheck = () => navigate(`/coach/agreements/${id}/edit?q=check`);
  if (!agreement || !draft || saved === undefined) {
    return <div className="cc-page"><div className="cc-col"><Back to="Does this read right?" onClick={toCheck} />{d.loading || saved === undefined ? <Loading label="Loading the agreement" /> : <PageOpening title="Sign and send" line="There’s nothing waiting to be sent on this agreement." />}</div></div>;
  }
  const first = party.first || 'them';
  const kind = kindOf(draft.terms || {});
  const who = kind === 'team' ? 'the sponsor' : first;

  const go = async () => {
    if (busy) return;
    if (mode === 'draw' && !drawn) { setProblem('Draw or type your new signature first.'); return; }
    if (mode === 'typed' && String(typed).trim().length < 3) { setProblem('Type your full name to sign.'); return; }
    setBusy(true);
    setProblem(null);
    const answer = await send({ sendAs, validDays: valid, personalNote: note ?? '', signature: mode === 'saved' ? { saved } : mode === 'draw' ? { drawn } : { typed } });
    setBusy(false);
    if (!answer.ok) { setProblem(answer.message); return; }
    // An agreement sent opens Sent (M28 version 6: Sign and send → "Sent to Sam"); a quote, or one waiting for the owner, the client's page.
    if (!answer.waiting && sendAs !== 'quote') navigate(`/coach/agreements/${agreement.id}/sent`);
    else navigate(agreement.profile_id ? `/coach/clients/${agreement.profile_id}` : agreement.organisation_id ? `/coach/organisations/${agreement.organisation_id}` : '/coach/clients');
    if (answer.waiting) toast.show(`Signed. It goes to ${who} once your practice’s owner approves it.`);
    else if (sendAs === 'quote') toast.show(answer.quoteNumber ? `Signed by you and sent to ${first} as quote ${quoteNumber(answer.quoteNumber)}.` : `Signed by you and sent to ${first} as a quote.`);
    else toast.show(`Signed by you and sent to ${who}.`);
  };

  // M28 version 6: the builder's last screen signs with the saved signature; with none (or a new one), this screen is
  // the same flow's last step, in focus mode.
  return (
    <div className="ab-q-page">
      <ToolFrame
        step={2} steps={2} stepWords="Sign" last
        name={`${draft.version > 1 ? `Version ${draft.version}` : 'New agreement'} for ${party.name || first}`}
        question="Sign and send"
        hint={sendAs === 'quote' ? `You sign first, then ${first} gets an email from you with the quote to read and accept.`
          : kind === 'team' ? 'You sign first, then the sponsor gets an email link to sign, with no account needed.'
            : BUILDER_LINES.sign(first)}
        onClose={() => { navigate(agreement.profile_id ? `/coach/clients/${agreement.profile_id}` : '/coach/clients'); toast.show(builderClosed(party.name ? `${possessive(first)} page` : 'their page')); }}
        closeLabel="Close and save the draft"
        onNext={go}
        nextLabel={sendAs === 'quote' ? 'Sign and send the quote' : sendWords({ kind, first })}
        onBack={toCheck}
        className="ab-q"
      >
        {mode === 'saved' && saved && (
          <div className="ab-sigbox">
            <SavedSignature image={saved.image} />
            <p className="ab-cap">Your saved signature</p>
            <TextLink onClick={() => setMode('draw')}>Draw a new signature</TextLink>
          </div>
        )}
        {mode === 'draw' && (
          drawn ? (
            <div className="ab-sigbox">
              <SavedSignature image={drawn} />
              <p className="ab-cap">Your new signature</p>
              <TextLink onClick={() => setDrawn(null)}>Draw it again</TextLink>
            </div>
          ) : (
            <SignaturePad label="Draw your signature" onUse={(img) => { setDrawn(img); setProblem(null); }} onEmpty={() => setProblem('Draw or type your new signature first.')} onTypeInstead={() => setMode('typed')} />
          )
        )}
        {mode === 'typed' && (
          <div className="ab-sigbox">
            <TextField label="Your typed signature" value={typed} maxLength={160} onChange={(e) => setTyped(e.target.value)} />
            <TextLink onClick={() => setMode('draw')}>Draw instead</TextLink>
          </div>
        )}
        <TextBox label={`A note to ${kind === 'team' ? 'the sponsor' : first}`} value={note ?? ''} maxLength={1000} onChange={setNote} />
        <Hint>It opens the email and the agreement.</Hint>
        {problem && <MistakeLine>{problem}</MistakeLine>}
        {!isOwner && <Hint>It goes once your practice’s owner approves it.</Hint>}
      </ToolFrame>
    </div>
  );
}
