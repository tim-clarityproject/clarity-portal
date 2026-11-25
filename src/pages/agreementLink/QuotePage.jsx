import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Checkbox, ErrorMessage, PdfDownload, Section, TextBox, useToast } from '../../components/design';
import AgreementView from '../../components/agreements/AgreementView';
import StepsMarker from '../../components/agreements/StepsMarker';
import SettleChoice from '../../components/agreements/SettleChoice';
import { supabase } from '../../lib/supabase';
import { isOnline } from '../../lib/connection';
import { isAsk } from '../../lib/agreements/asks';
import { mainPoints } from '../../lib/agreements/clauses';
import { quoteNumber, quoteRows, validLine } from '../../lib/agreements/quote';
import { canChoose } from '../../lib/agreements/upfront';
import { LINK_WORDS, QUOTE_TITLE, askQuestionWords, noteText, preparedLine, sendChangeWords } from '../../lib/coaching/clientMoney';
import { clientAsk, isLive, storedPdf } from '../../lib/coaching/clientAsk';
import LinkFrame, { LinkLoading, LinkMessage } from './LinkFrame';

// A quote's page (Phase 6b run 3, Group C; M28 version 4 s-q-client; brief items 19 to 21 and 37): /quote/:token, a web
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
  const [quote, setQuote] = useState(undefined); // undefined while loading, null for a link that doesn't work
  const [loadProblem, setLoadProblem] = useState(null);
  const [chosen, setChosen] = useState([]);
  const [choice, setChoice] = useState('upfront');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const [done, setDone] = useState(null); // 'needsAccount'
  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState('');
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

  const number = Number.isInteger(quote.number) && quote.number > 0 ? quoteNumber(quote.number) : '';
  const rows = quoteRows(terms, chosen, choice);
  let points = [];
  // Someone their organisation funds sees no money (quote_open keeps it from them: break-it tester, run 3, finding 8).
  try { points = mainPoints(terms, { choice, seesMoney: !terms.fundedBy }); } catch { points = []; }
  const toggle = (key, on) => setChosen((list) => (on ? [...new Set([...list, key])] : list.filter((k) => k !== key)));

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

  const sendQuestion = async () => {
    if (!question.trim()) { setAskNeed(LINK_WORDS.questionNeeds); return; }
    if (!isOnline()) { setAskNeed(LINK_WORDS.offline); return; }
    // Group E's quote_question (asked of the lead); until it is an ask, off the live site it behaves as the stand-in.
    const a = isAsk('link', 'quote_question') ? await clientAsk('link', 'quote_question', { token, text: question.trim() }) : { ok: !isLive(), message: 'That didn’t send. Try again in a moment.' };
    if (!a.ok) { setAskNeed(a.message); return; }
    setAsking(false);
    setQuestion('');
    setAskSent(true);
  };

  const pdf = async () => {
    const a = await clientAsk('link', 'quote_pdf', { token });
    if (!a.ok) throw new Error(a.message);
    return storedPdf(a, `${number || 'Quote'}.pdf`);
  };

  return (
    <LinkFrame>
      <div className="cl-cover">
        <p className="cl-cap">{preparedLine({ clientName: terms.clientName, coachName: terms.coachName, quoteNo: quote.number })}</p>
        <h1 className="cl-cover-title">{QUOTE_TITLE}</h1>
        <p className="cl-note">{noteText(quote.personal_note || terms.personalNote)}</p>
      </div>
      <StepsMarker current={0} />
      {points.length > 0 && <AgreementView points={points} clauses={[]} contents={false} />}
      <Section title="Your investment" className="cl-sec" />
      <div className="cl-qt">
        {rows.lines.map((l) => <div key={l.label} className="cl-qline"><span>{l.label}</span><span>{l.amount}</span></div>)}
        {rows.extras.length > 0 && <p className="cl-qx">Optional extras</p>}
        {rows.extras.map((e) => (
          <div key={e.key} className="cl-qrow">
            <Checkbox checked={chosen.includes(e.key)} onChange={(on) => toggle(e.key, on)}>{e.label}</Checkbox>
            <span>{e.amount}</span>
          </div>
        ))}
        {rows.upfront && <div className="cl-qline"><span>{rows.upfront.label}</span><span>{rows.upfront.amount}</span></div>}
        <div className="cl-qline cl-qline--total"><span>In all</span><span>{rows.inAll}</span></div>
        <p className="cl-hint">{rows.hint}</p>
        <SettleChoice terms={terms} value={choice} onChange={setChoice} chosenExtras={chosen} />
      </div>
      {quote.valid_until && <p className="cl-hint">{validLine(quote.valid_until)}</p>}
      {problem && <ErrorMessage>{problem}</ErrorMessage>}
      <div className="cl-acts">
        <Button variant="primary" aria-busy={busy || undefined} onClick={accept}>Accept and sign</Button>
        <PdfDownload lightOnly getDocument={pdf} />
      </div>
      {askSent ? (
        <p className="cl-hint" role="status">{LINK_WORDS.questionSent(coachFirst)}</p>
      ) : (
        <div className="cl-ask">
          <Button variant="text" aria-expanded={asking} aria-controls="cl-quote-ask" onClick={() => { setAsking((v) => !v); setAskNeed(null); }}>{askQuestionWords(coachFirst)}</Button>
          {asking && (
            <div id="cl-quote-ask" className="cl-ask-box">
              <TextBox label={LINK_WORDS.questionLabel} value={question} onChange={(v) => { setQuestion(typeof v === 'string' ? v : v.target.value); setAskNeed(null); }} />
              {askNeed && <ErrorMessage>{askNeed}</ErrorMessage>}
              <div className="cl-acts">
                <Button variant="outline" onClick={sendQuestion}>{sendChangeWords(coachFirst)}</Button>
                <Button variant="text" onClick={() => setAsking(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </LinkFrame>
  );
}
