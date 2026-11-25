import { useContext, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import DesignHeader from '../../components/DesignHeader';
import { BackLink } from '../../components/ui/DiscardLink';
import { Button, ErrorMessage, List, ListRow, LoadError, PageHeader, WhoSees } from '../../components/design';
import { isOnline } from '../../lib/connection';
import { getLocalDateKey } from '../../lib/dateFormatter';
import { currentAgreement, seesMoneyFor } from '../../lib/coaching/agreements';
import { INVOICES, invoiceList } from '../../lib/coaching/clientMoney';
import { useAgreements } from '../coaching/agreementData';
import '../coaching/coaching.css';
import '../coaching/clientAgreement.css';

// My Account, Invoices (Phase 6b run 3, Group C; M28 version 4 s-payments): /my-account/invoices, where
// /coaching/billing now goes. Back to My Account, "Invoices" with the eye (only you can see this), then every invoice:
// the ones to settle first, each with its amount and due day, "Overdue" as a word in an outline once past due (never
// red), "Settle my invoice" (Stripe's own secure page, in a new tab; the coral button for the next one only, so one
// coral button per screen) and Download PDF; then the settled ones, each opening its own page from Stripe, where its
// PDF is. A client whose coaching an organisation funds sees only who funds it, never an amount (my_invoices gives them
// none). Credit notes show here once the server lists them (Group E).

/** Opens an invoice's own page from Stripe in a new tab: https only (061 keeps nothing else). */
function openPage(url) {
  if (!/^https:\/\//.test(url || '')) return false;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

export default function Invoices() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const navigate = useNavigate();
  const [today] = useState(() => getLocalDateKey());
  const { data, loading, error } = useAgreements(userId);
  const [offline, setOffline] = useState(false);
  const rows = useMemo(() => invoiceList(data.invoices, today), [data.invoices, today]);
  const current = currentAgreement(data.agreements);
  const funded = current && !seesMoneyFor(current) ? current.fundedBy : null;

  const open = (url) => {
    if (!isOnline()) { setOffline(true); return; }
    setOffline(false);
    openPage(url);
  };

  let body = null;
  if (loading && !data.ready) body = null;
  else if (error && !data.ready) body = <LoadError>The page didn’t load. Check your connection and try again.</LoadError>;
  else if (funded && rows.length === 0) body = <p className="cl-say">{INVOICES.funded(funded)}</p>;
  else if (rows.length === 0) body = <p className="cl-hint">{INVOICES.none}</p>;
  else {
    const firstOpen = rows.find((r) => !r.settled);
    body = (
      <List label={INVOICES.title} className="cl-rows">
        {rows.map((r) => (r.settled ? (
          <ListRow key={r.id} title={r.number} type={r.meta} date={r.url ? INVOICES.download : undefined} onClick={r.url ? () => open(r.url) : undefined} />
        ) : (
          <li key={r.id} className="cl-inv">
            <div className="ds-row ds-row--still">
              <span className="ds-row-main">
                <span className="ds-row-title">{r.number}</span>
                <span className="ds-row-type">{r.meta}</span>
              </span>
              {r.overdue && <span className="ds-row-date"><span className="cl-due">{INVOICES.overdue}</span></span>}
            </div>
            {r.url && (
              <div className="cl-inv-actions">
                <Button variant={r === firstOpen ? 'primary' : 'outline'} onClick={() => open(r.url)}>{INVOICES.settle}</Button>
                <Button variant="text" onClick={() => open(r.url)}>{INVOICES.download}</Button>
              </div>
            )}
          </li>
        )))}
      </List>
    );
  }

  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="plan-page ipp-page coaching-page cl-page">
        <div className="plan-back-row"><BackLink onClick={() => navigate('/my-account')} label="My Account" /></div>
        <PageHeader title={INVOICES.title} aside={<WhoSees audience="me" />} />
        {body}
        {offline && <ErrorMessage>{INVOICES.offline}</ErrorMessage>}
      </div>
    </div>
  );
}
