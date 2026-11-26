import { useContext, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import DesignHeader from '../../components/DesignHeader';
import { BackLink } from '../../components/ui/DiscardLink';
import { Bar, Button, List, ListRow, LoadError, PageHeader, Section, Stat, StatGroup } from '../../components/design';
import { isOnline } from '../../lib/connection';
import { getLocalDateKey } from '../../lib/dateFormatter';
import { BILLING, billingView, fundsLine } from '../../lib/coaching/agreements';
import { useAgreements } from './agreementData';
import '../performance/performance.css';
import './coaching.css';
import MistakeLine from '../../components/agreements/MistakeLine';

// Billing (Phase 6b run 1; mock-up M13 A8), reached from My coaching, More. For a self-funded
// client: who the invoices are from, the next invoice and when it's due, Invested so far with a
// mint bar to the agreement's total, every invoice (each opens its own page from Stripe in a new
// tab), and "Settle my invoice" for the next one, which opens Stripe's secure page. Clients invest
// and settle, never pay (the brief, over M13's "Pay" and "Paid"). A due invoice is plain, never
// coral; a settled one reads Settled in mint. An organisation-funded client who reaches the page
// sees only who funds the coaching, and never an amount: my_invoices() gives them none.

const LOAD_PROBLEM = 'Billing didn’t load. Check your connection and try again.';

/** Opens an invoice's own page from Stripe in a new tab: https only (061 keeps nothing else). */
function openPage(url) {
  if (!/^https:\/\//.test(url || '')) return false;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

export default function Billing() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const navigate = useNavigate();
  const [today] = useState(() => getLocalDateKey());
  const { data, loading, error } = useAgreements(userId);
  const view = useMemo(() => billingView(data, today), [data, today]);
  const [offline, setOffline] = useState(false);
  const toCoaching = () => navigate('/coaching');

  const settle = (url) => {
    if (!isOnline()) { setOffline(true); return; }
    setOffline(false);
    openPage(url);
  };

  let body = null;
  if (loading) body = null;
  else if (error && !data.ready) body = <LoadError>{LOAD_PROBLEM}</LoadError>;
  else if (view.funded) {
    body = (
      <div className="billing-funded">
        <p className="billing-line">{fundsLine(view.funded)}</p>
        <p className="billing-line billing-line--quiet">{BILLING.nothing}</p>
        <div className="ds-actions ipp-actions"><Button onClick={toCoaching}>{BILLING.open}</Button></div>
      </div>
    );
  } else {
    const next = view.next;
    body = (
      <>
        <StatGroup className="billing-stats">
          {next && <Stat label={BILLING.next} value={next.amount} note={next.line} />}
          <div className="ds-stat billing-invested">
            <span className="ds-stat-label">{BILLING.invested}</span>
            <strong className="ds-stat-value">{view.invested.amount}</strong>
            {view.invested.share != null && (
              <span className="billing-progress">
                <Bar value={view.invested.share} />
                <span className="billing-total">{view.invested.total}</span>
              </span>
            )}
          </div>
        </StatGroup>
        <Section title={BILLING.invoices} className="ipp-section coaching-section billing-section">
          {view.rows.length === 0 ? <p className="ipp-muted">{BILLING.none}</p> : (
            <List label={BILLING.invoices} className="billing-rows">
              {view.rows.map((inv) => (
                <ListRow
                  key={inv.id}
                  title={`Invoice ${inv.number}`}
                  type={inv.amount}
                  date={<span className={inv.state.good ? 'billing-settled' : undefined}>{inv.state.text}</span>}
                  onClick={inv.hostedUrl ? () => settle(inv.hostedUrl) : undefined}
                />
              ))}
            </List>
          )}
          {offline && (
            <div className="billing-offline">
              <MistakeLine>{BILLING.offline.map((line) => <span key={line} className="ds-line">{line}</span>)}</MistakeLine>
            </div>
          )}
          {next?.invoice.hostedUrl && (
            <div className="ds-actions ipp-actions billing-acts">
              <Button variant="primary" onClick={() => settle(next.invoice.hostedUrl)}>{BILLING.settle}</Button>
            </div>
          )}
        </Section>
      </>
    );
  }

  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="plan-page ipp-page coaching-page billing-page">
        <div className="plan-back-row"><BackLink onClick={toCoaching} label={BILLING.back} /></div>
        <PageHeader title={BILLING.title} meta={view.funded ? [] : [BILLING.meta]} />
        {body}
      </div>
    </div>
  );
}
