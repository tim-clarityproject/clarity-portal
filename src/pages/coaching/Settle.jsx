import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { ErrorMessage, Figure, InlineChoice, Loading, ToolFrame, useToast } from '../../components/design';
import { isOnline } from '../../lib/connection';
import { BACS, BACS_LINE, ENDED_STATUSES, FLOW, SETTLE_QUESTION, STAND_IN_APPLE, STAND_IN_BACS, STAND_IN_CARD, choiceFor, endedLine, settleView, stepsFor } from '../../lib/coaching/clientMoney';
import { TOOL_CLOSED } from '../../content/pageLines/client';
import { clientAsk, isLive } from '../../lib/coaching/clientAsk';
import { useAgreements } from './agreementData';
import { mountElement } from './stripeElement';
import './coaching.css';
import './clientAgreement.css';

// Settle (Polish 1, Stage C, C3: step 3 of Read, Sign and Settle in focus mode, M28 v6 "sign" step 3: Your coaching
// agreement, the title as the question, the amount as a 24px figure with "today", what follows, How would you like to
// settle?, the form's place, the 14-day line, and Settle £X at the foot; no Back, as signing is done). Before Polish 1:
// Settle (Phase 6b run 3, Group C; M28 version 4 s-c-pay; brief items 8 and 14): /coaching/agreement/:versionId/settle,
// straight after a self-funded client signs, one step with no "settle later": the steps (Read and Sign done, Settle
// now), the title (Your investment, Your deposit, First instalment, First coaching session, Your first month, Six
// months up front), the amount, what follows, "How would you like to settle?" with Stripe's Payment Element (card and
// Apple Pay only), "You can set up Direct Debit for the rest straight after this." where something follows (pounds
// only), Settle £X, and "You can still change your mind within 14 days." for a self-funded individual.
// The server (Group E's /api/agreement-settle, kind start) makes the first invoice, finalised by Stripe and linked to the
// signed version, and gives the Payment Element's secret. Off the live site, until it answers, the stand-in draws M28's
// own Card / Apple Pay switch and the form's place, and never a real card form; Settle then carries on as if settled.
// With ?rest=bacs it is the Direct Debit step for the rest (kind bacs: a SetupIntent), with Not now beside it.
// Differences from M28: on the live form Stripe draws its own tabs inside its frame (plan risk 22), styled from the
// tokens; the Direct Debit step is Claude's (M28 draws only the line that offers it).

const LOAD_PROBLEM = 'This page didn’t load. Check your connection and try again.';
const OFFLINE = 'Settling needs a connection, so try again when you’re back online.';
const NOT_SET = 'Stripe isn’t connected yet, so nothing was taken. Try again later.';
const NOT_SIGNED = 'Sign your agreement first, then settle.';

export default function Settle() {
  const { versionId } = useParams();
  const [search] = useSearchParams();
  const bacs = search.get('rest') === 'bacs';
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const navigate = useNavigate();
  const { data, loading, error } = useAgreements(userId);
  const version = data.agreements.find((v) => v.id === versionId) || null;
  const terms = useMemo(() => ({ ...(version?.terms || {}), fundedBy: version?.fundedBy || version?.terms?.fundedBy || null }), [version]);
  const choice = choiceFor(terms, version?.settleChoice);

  const [answer, setAnswer] = useState(null); // the server's start (or bacs) answer
  const [problem, setProblem] = useState(null);
  const [method, setMethod] = useState('card');
  const [busy, setBusy] = useState(false);
  const elementRef = useRef(null);
  const nodeRef = useRef(null);
  const rootRef = useRef(null);
  const asked = useRef(false);

  // An agreement cancelled within 14 days, run out or ended: nothing to settle, said calmly (break-it tester, run 3,
  // finding 1). The server refuses too, with `ended`.
  const [endedAs, setEndedAs] = useState(null);
  const ended = endedAs || (ENDED_STATUSES.includes(version?.agreementStatus) ? version.agreementStatus : null);

  // Ask the server once, once the version is known to be signed.
  useEffect(() => {
    if (asked.current || !version?.signedAt || ENDED_STATUSES.includes(version?.agreementStatus)) return;
    asked.current = true;
    clientAsk('settle', bacs ? 'bacs' : 'start', { versionId }).then((a) => {
      if (!a.ok) { if (a.ended) setEndedAs(a.ended); else setProblem(a.message); return; }
      // An amendment, or settled already: nothing to settle here, so straight on to Welcome.
      if (a.amendment) { navigate(`/coaching/agreement/${versionId}/welcome`, { replace: true }); return; }
      setAnswer(a);
    });
  }, [version, versionId, bacs, navigate]);

  const real = Boolean(answer && !answer.standIn && answer.publishableKey && answer.clientSecret);
  useEffect(() => {
    if (!real || !nodeRef.current) return undefined;
    let live = true;
    mountElement({ node: nodeRef.current, root: rootRef.current, publishableKey: answer.publishableKey, clientSecret: answer.clientSecret, mode: bacs ? 'setup' : 'payment' })
      .then((el) => { if (live) elementRef.current = el; else el.destroy(); })
      .catch(() => { if (live) setProblem(NOT_SET); });
    return () => { live = false; elementRef.current?.destroy(); elementRef.current = null; };
  }, [real, answer, bacs]);

  const view = settleView(terms, choice, answer?.amountMinor);
  const welcome = `/coaching/agreement/${versionId}/welcome`;
  const done = (state) => {
    if (!bacs && view.bacs) navigate(`/coaching/agreement/${versionId}/settle?rest=bacs`, { replace: true, state });
    else navigate(welcome, { replace: true, state });
  };

  const settle = async () => {
    if (busy) return;
    if (!isOnline()) { setProblem(OFFLINE); return; }
    setProblem(null);
    if (!answer) return;
    if (!real) {
      // The stand-in (never on the live site): nothing is taken, and the steps carry on as if settled.
      if (isLive()) { setProblem(NOT_SET); return; }
      done({ settled: bacs ? null : view.amount });
      return;
    }
    if (!elementRef.current) return;
    setBusy(true);
    const res = await elementRef.current.confirm(`${window.location.origin}${bacs || !view.bacs ? welcome : `/coaching/agreement/${versionId}/settle?rest=bacs`}`);
    setBusy(false);
    if (!res.ok) { setProblem(res.message); return; }
    done({ settled: bacs ? null : view.amount });
  };

  const toast = useToast();
  const close = () => {
    toast.show(TOOL_CLOSED);
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate('/welcome');
  };

  if (!version) {
    if (loading) return <div className="ui-root plan-builder-wait"><Loading label="Loading" /></div>;
    return (
      <div className="cl-flow">
        <ToolFrame step={1} steps={1} last stepWords=" " question={FLOW.agreementLabel} onClose={close} onNext={() => navigate('/coaching')} nextLabel="Open My coaching">
          <p className="cl-say" role="status">{error ? LOAD_PROBLEM : 'This agreement isn’t here any more.'}</p>
        </ToolFrame>
      </div>
    );
  }

  const steps = stepsFor(terms).length;
  const frame = { step: steps, steps, name: FLOW.agreementLabel, onClose: close };
  if (ended) {
    return (
      <div className="cl-flow">
        <ToolFrame {...frame} question={view.title} onNext={() => navigate('/coaching')} nextLabel="Open My coaching">
          <p className="cl-say" role="status">{endedLine(ended, terms.coachFirst)}</p>
        </ToolFrame>
      </div>
    );
  }
  if (!version.signedAt) {
    return (
      <div className="cl-flow">
        <ToolFrame {...frame} question={view.title} onNext={() => navigate(`/coaching/agreement/${versionId}`)} nextLabel="Read and sign">
          <p className="cl-say" role="status">{NOT_SIGNED}</p>
        </ToolFrame>
      </div>
    );
  }
  if (bacs) {
    return (
      <div className="cl-flow" ref={rootRef}>
        <ToolFrame {...frame} question={BACS.title} onNext={settle} nextLabel={BACS.button} onSkip={() => navigate(welcome, { replace: true })} skipLabel={BACS.later}>
          <div className="cl-stack">
            <p className="cl-say">{BACS.line}</p>
            {view.rest && <p className="cl-hint">{view.rest}</p>}
            {real ? <div ref={nodeRef} className="cl-element" /> : <div className="cl-stripe">{answer ? STAND_IN_BACS : ' '}</div>}
            {problem && <ErrorMessage>{problem}</ErrorMessage>}
          </div>
        </ToolFrame>
      </div>
    );
  }
  return (
    <div className="cl-flow" ref={rootRef}>
      <ToolFrame {...frame} question={view.title} onNext={settle} nextLabel={view.button}>
        <div className="cl-stack">
          <div>
            <Figure value={view.amount} unit="today" />
            {view.rest && <p className="cl-hint">{view.rest}</p>}
          </div>
          {real ? (
            <div>
              <span className="cl-field-label">{SETTLE_QUESTION}</span>
              <div ref={nodeRef} className="cl-element" />
            </div>
          ) : (
            <>
              <InlineChoice label={SETTLE_QUESTION} options={[{ value: 'card', label: 'Card' }, { value: 'apple', label: 'Apple Pay' }]} value={method} onChange={setMethod} form="pills" />
              <div className="cl-stripe">{method === 'apple' ? STAND_IN_APPLE : STAND_IN_CARD}</div>
            </>
          )}
          {(view.cooling || view.bacs) && (
            <div>
              {view.cooling && <p className="cl-hint">{view.cooling}</p>}
              {view.bacs && <p className="cl-hint">{BACS_LINE}</p>}
            </div>
          )}
          {problem && <ErrorMessage>{problem}</ErrorMessage>}
        </div>
      </ToolFrame>
    </div>
  );
}
