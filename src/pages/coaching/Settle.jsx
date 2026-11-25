import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import DesignHeader from '../../components/DesignHeader';
import { Button, ErrorMessage, InlineChoice, LoadError, Loading, PageHeader } from '../../components/design';
import StepsMarker from '../../components/agreements/StepsMarker';
import { isOnline } from '../../lib/connection';
import { BACS, BACS_LINE, SETTLE_QUESTION, STAND_IN_APPLE, STAND_IN_BACS, STAND_IN_CARD, choiceFor, settleView, stepsFor } from '../../lib/coaching/clientMoney';
import { clientAsk, isLive } from '../../lib/coaching/clientAsk';
import { useAgreements } from './agreementData';
import { mountElement } from './stripeElement';
import './coaching.css';
import './clientAgreement.css';

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

  // Ask the server once, once the version is known to be signed.
  useEffect(() => {
    if (asked.current || !version?.signedAt) return;
    asked.current = true;
    clientAsk('settle', bacs ? 'bacs' : 'start', { versionId }).then((a) => {
      if (!a.ok) { setProblem(a.message); return; }
      setAnswer(a);
    });
  }, [version, versionId, bacs]);

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

  if (!version) {
    if (loading) return <div className="ui-root plan-builder-wait"><Loading label="Loading" /></div>;
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page ipp-page coaching-page cl-page">
          <LoadError>{error ? LOAD_PROBLEM : 'This agreement isn’t here any more.'}</LoadError>
          <div className="cl-acts"><Button variant="primary" onClick={() => navigate('/coaching')}>Open My coaching</Button></div>
        </div>
      </div>
    );
  }

  const steps = stepsFor(terms);
  return (
    <div className="ui-root" ref={rootRef}>
      <DesignHeader />
      <div className="plan-page ipp-page coaching-page cl-page">
        <StepsMarker current={2} steps={steps} />
        {!version.signedAt ? (
          <>
            <p className="cl-say">{NOT_SIGNED}</p>
            <div className="cl-acts"><Button variant="primary" onClick={() => navigate(`/coaching/agreement/${versionId}`)}>Read and sign</Button></div>
          </>
        ) : bacs ? (
          <>
            <PageHeader title={BACS.title} />
            <p className="cl-hint">{view.rest}</p>
            <p className="cl-say">{BACS.line}</p>
            {real ? <div ref={nodeRef} className="cl-element" /> : <div className="cl-stripe">{answer ? STAND_IN_BACS : ' '}</div>}
            {problem && <ErrorMessage>{problem}</ErrorMessage>}
            <div className="cl-acts">
              <Button variant="primary" aria-busy={busy || undefined} onClick={settle}>{BACS.button}</Button>
              <Button variant="text" onClick={() => navigate(welcome, { replace: true })}>{BACS.later}</Button>
            </div>
          </>
        ) : (
          <>
            <PageHeader title={view.title} />
            <p className="cl-amount">{view.amount}</p>
            <p className="cl-hint">{view.rest}</p>
            {real ? (
              <div>
                <span className="cl-field-label">{SETTLE_QUESTION}</span>
                <div ref={nodeRef} className="cl-element" />
              </div>
            ) : (
              <>
                <InlineChoice label={SETTLE_QUESTION} options={[{ value: 'card', label: 'Card' }, { value: 'apple', label: 'Apple Pay' }]} value={method} onChange={setMethod} />
                <div className="cl-stripe">{method === 'apple' ? STAND_IN_APPLE : STAND_IN_CARD}</div>
              </>
            )}
            {view.bacs && <p className="cl-hint">{BACS_LINE}</p>}
            {problem && <ErrorMessage>{problem}</ErrorMessage>}
            <div className="cl-acts"><Button variant="primary" aria-busy={busy || !answer || undefined} onClick={settle}>{view.button}</Button></div>
            {view.cooling && <p className="cl-hint">{view.cooling}</p>}
          </>
        )}
      </div>
    </div>
  );
}
