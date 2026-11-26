import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Checkbox, Figure, MoreLink, PageOpening, PdfDownload, QuickAdd, Row, useIsPhone, useToast } from '../../components/design';
import { supabase } from '../../lib/supabase';
import { isOnline } from '../../lib/connection';
import { isAsk } from '../../lib/agreements/asks';
import { quoteNumber, quoteRows, validLine } from '../../lib/agreements/quote';
import { canChoose } from '../../lib/agreements/upfront';
import { FLOW, LINK_WORDS, QUOTE_TITLE, askQuestionWords, noteText, quoteLabel, sendChangeWords, settledAtSigning } from '../../lib/coaching/clientMoney';
import { SettleSwitch } from '../coaching/AgreementParts';
import { clientAsk, isLive, storedPdf } from '../../lib/coaching/clientAsk';
import LinkFrame, { LinkLoading, LinkMessage } from './LinkFrame';
import MistakeLine from '../../components/agreements/MistakeLine';

// A quote's page (Polish 1, Stage C, C3: M28 v6 "quote": the opening (Quotation Q-0042 · Valid until, YOUR QUOTATION,
// the coach's own note), Included, Add if you'd like (the extras to tick, nothing ticked to start with), In all with Up
// front or over time as a joined switch and Accept and sign, then Download PDF and Ask a question as Quick Add).
// Before Polish 1: A quote's page (Phase 6b run 3, Group C; M28 version 4 s-q-client; brief items 19 to 21 and 37): /quote/:token, a web
// page rather than a PDF, with no account needed. The cover (prepared for and by, the quote's number, the coach's own
// note), the steps (Read, Sign, Settle), Main points, Your investment: the package, each discount, the extras the coach
// offers to tick (nothing ticked to start with), In all, what is settled when signing, and "How would you like to
// settle?" (up front first and chosen) where the client chooses; ticking an extra or choosing changes the total, the
// points and the options at once. Valid until, then Accept and sign (the server makes the agreement's version 1 with
// the extras and the choice, and signing and settling follow in the same sitting), Download PDF, and Ask [coach] a
// question. Opening it records the first open for the coach (065's quote_open); the page never says so.
// An expired quote, one already accepted, or a link that doesn't work each says so in one calm line.

export default function QuotePage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const isPhone = useIsPhone();
  const [quote, setQuote] = useState(undefined); // undefined while loading, null for a link that doesn't work
  const [loadProblem, setLoadProblem] = useState(null);
  const [chosen, setChosen] = useState([]);
  const [choice, setChoice] = useState('upfront');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const [done, setDone] = useState(null); // 'needsAccount'
  const [asking, setAsking] = useState(false);
  const [askNeed, setAskNeed] = useState(null);
  const [askSent, setAskSent] = useState(false);

  useEffect(() => {
    let live = true;
    if (!isOnline()) { setLoadProblem(LINK_WORDS.offline); return undefined; }
    supabase.rpc('quote_open', { p_token: String(token || '') }).then((res) => {
      if (!live) return;
      if (res.error) { setLoadProblem(LINK_WORDS.didntLoad); return; }
      setQuote(res.data && typeof res.data === 'object' ? res.data : null);
    }).catch(() => { if (live) setLoadProblem(LINK_WORDS.didntLoad); });
    return () => { live = false; };
  }, [token]);

  const terms = useMemo(() => {
    const t = quote?.terms && typeof quote.terms === 'object' ? quote.terms : {};
    return { ...t, currency: t.currency || quote?.currency || 'GBP', extrasChosen: chosen, choice: canChoose(t) ? choice : t.choice ?? null };
  }, [quote, chosen, choice]);
  const coachFirst = quote?.coach_first || terms.coachFirst || '';

  if (loadProblem) return <LinkMessage title={QUOTE_TITLE} line={loadProblem} />;
  if (quote === undefined) return <LinkLoading />;
  if (!quote) return <LinkMessage title={QUOTE_TITLE} line={LINK_WORDS.notFound} />;
  if (quote.state === 'expired') return <LinkMessage title={QUOTE_TITLE} line={LINK_WORDS.quoteExpired(coachFirst)} />;
  if (quote.state === 'accepted') return <LinkMessage title={QUOTE_TITLE} line={LINK_WORDS.quoteAccepted}><div className="cl-acts"><Button variant="primary" onClick={() => navigate(quote.version_id ? `/coaching/agreement/${quote.version_id}` : '/coaching')}>Read and sign</Button></div></LinkMessage>;
  if (done === 'needsAccount') return <LinkMessage title={QUOTE_TITLE} line={LINK_WORDS.needsAccount} />;

  const rows = quoteRows(terms, chosen, choice);
  const toggle = (key, on) => setChosen((list) => (on ? [...new Set([...list, key])] : list.filter((k) => k !== key)));
  const number = Number.isInteger(quote.number) && quote.number > 0 ? quoteNumber(quote.number) : '';

  const accept = async () => {
    if (busy) return;
    if (!isOnline()) { setProblem(LINK_WORDS.offline); return; }
    setBusy(true);
    setProblem(null);
    const a = await clientAsk('link', 'quote_accept', { token, extras: chosen, choice: canChoose(terms) ? choice : null });
    setBusy(false);
    if (!a.ok) { setProblem(a.message); return; }
    if (a.versionId && !a.needsAccount) {
      toast.show(LINK_WORDS.accepted);
      navigate(`/coaching/agreement/${a.versionId}`);
      return;
    }
    setDone('needsAccount');
  };

  // Ask a question: Quick Add (rule 10), sent to the coach by email (one a minute per quote, held by the server).
  const sendQuestion = async (words) => {
    setAskNeed(null);
    if (!isOnline()) { setAskNeed(LINK_WORDS.offline); return; }
    // Group E's quote_question (asked of the lead); until it is an ask, off the live site it behaves as the stand-in.
    const a = isAsk('link', 'quote_question') ? await clientAsk('link', 'quote_question', { token, text: words }) : { ok: !isLive(), message: 'That didn’t send. Try again in a moment.' };
    if (!a.ok) { setAskNeed(a.message); return; }
    setAskSent(true);
  };

  const pdf = async () => {
    const a = await clientAsk('link', 'quote_pdf', { token });
    if (!a.ok) throw new Error(a.message);
    return storedPdf(a, `${number || 'Quote'}.pdf`);
  };

  return (
    <LinkFrame>
      {/* On a phone the label drops "Quotation" (the title says it), so it stays on one line (Tim's walk of Stage B, item 9). */}
      <PageOpening label={isPhone ? quoteLabel({ number: quote.number, validUntil: quote.valid_until }).replace(/^Quotation (?=Q-)/, '') : quoteLabel({ number: quote.number, validUntil: quote.valid_until })} title={FLOW.quoteTitle} line={noteText(quote.personal_note || terms.personalNote)} />
      <Card label={FLOW.included}>
        {rows.lines.map((l) => <Row key={l.label} name={l.label} value={l.amount} />)}
        {rows.upfront && <Row name={rows.upfront.label} value={rows.upfront.amount} />}
      </Card>
      {rows.extras.length > 0 && (
        <Card label={FLOW.addIf} className="cl-extras">
          {rows.extras.map((e) => (
            <Checkbox key={e.key} checked={chosen.includes(e.key)} onChange={(on) => toggle(e.key, on)} after={<span className="cl-extra-amount">{e.amount}</span>}>{e.label}</Checkbox>
          ))}
        </Card>
      )}
      <Card label={FLOW.inAll} className="cl-inall">
        <Figure value={rows.inAll} />
        <SettleSwitch terms={terms} value={choice} onChange={setChoice} chosenExtras={chosen} label={FLOW.settleWhen} bare />
        {/* "The first …" only where more follows; the full amount where signing settles it all (the functionality tester, P7). */}
        <p className="cl-hint">{`${rows.hint.replace(/\. The first .* is settled when you sign\.$/, '.')} ${settledAtSigning(terms, choice, chosen)}`}</p>
        {problem && <MistakeLine>{problem}</MistakeLine>}
        <div className="cl-accept"><Button variant="primary" className="cl-full" aria-busy={busy || undefined} onClick={accept}>{FLOW.accept}</Button></div>
      </Card>
      <div className="cl-quote-foot">
        <PdfDownload lightOnly variant="text" getDocument={pdf} />
        {askSent ? (
          <p className="cl-hint" role="status">{LINK_WORDS.questionSent(coachFirst)}</p>
        ) : (
          <MoreLink bare aria-expanded={asking} aria-controls="cl-quote-ask" onClick={() => { setAsking((v) => !v); setAskNeed(null); }}>{askQuestionWords(coachFirst)}</MoreLink>
        )}
      </div>
      <QuickAdd id="cl-quote-ask" open={asking && !askSent} onClose={() => setAsking(false)} onAdd={sendQuestion} placeholder={LINK_WORDS.questionLabel} label={LINK_WORDS.questionLabel} addLabel={sendChangeWords(coachFirst)} />
      {askNeed && <MistakeLine>{askNeed}</MistakeLine>}
    </LinkFrame>
  );
}
