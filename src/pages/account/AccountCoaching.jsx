import { useNavigate } from 'react-router-dom';
import { Card, Empty, Figure, MoreLink, Row, useIsPhone } from '../../components/design';
import { useCachedLoad } from '../../lib/pageCache';
import { currentAgreement, loadHours, loadSubscriptions, showsBilling } from '../../lib/coaching/agreements';
import { HOURS_CACHE, INVOICES, accountRows, invoiceList } from '../../lib/coaching/clientMoney';
import { coachingCard } from '../../lib/coaching/coachingCard';
import { GATING_ON, PLAN_CACHE, levelOf, planLine } from '../../lib/levels';
import { getLocalDateKey } from '../../lib/dateFormatter';
import { useAgreements } from '../coaching/agreementData';

// My Account, Coaching (Polish 1; example-pages-25nov.html "My Account", Coaching; M28 s-acct's rows
// kept): the Your coaching card (the agreement's name, the price, then rows only, and Read the
// agreement) and, beside it, Invoices (the newest three, All invoices). A client an organisation
// funds sees who funds it and no amount. Your plan and Block of hours keep their rows under them,
// each only where there is something behind it. Replaces MyAccountMoney's rows on this page.

export default function AccountCoaching({ userId, coachName, startChat }) {
  const navigate = useNavigate();
  const phone = useIsPhone();
  const { data } = useAgreements(userId);
  const hours = useCachedLoad({ userId, name: HOURS_CACHE, load: () => loadHours(userId) });
  const plan = useCachedLoad({ userId: GATING_ON ? userId : null, name: PLAN_CACHE, load: () => loadSubscriptions(userId) });
  const today = getLocalDateKey();
  const version = currentAgreement(data.agreements);
  const card = coachingCard(version);
  const seesInvoices = showsBilling(data);
  const invoices = seesInvoices ? invoiceList(data.invoices, today) : [];
  const more = accountRows({
    hasAgreement: false,
    seesInvoices: false,
    planLine: GATING_ON ? planLine(levelOf(plan.data).level) : null,
    hours: Array.isArray(hours.data) ? hours.data : [],
  });

  return (
    <div className="acct-coaching">
      <div className="ds-grid2">
        {card ? (
          <Card className="acct-your-coaching" label="Your coaching" labelAs="h2">
            <p className="ds-q acct-q">{card.title}</p>
            {card.figure && <Figure value={card.figure.value} unit={card.figure.unit} className="acct-fig" />}
            {card.rows.map((r) => <Row key={r.key} name={r.name} value={r.value} />)}
            <div className="acct-card-link"><MoreLink onClick={() => navigate(card.to)}>Read the agreement</MoreLink></div>
          </Card>
        ) : (
          <Card className="acct-your-coaching" label="Your coaching">
            <Empty>{`Your coaching agreement shows here once ${coachName || 'your coach'} sends it.`}</Empty>
          </Card>
        )}
        <Card className="acct-invoices" label={INVOICES.title}>
          {version?.fundedBy ? <Empty>{INVOICES.funded(version.fundedBy)}</Empty>
            : invoices.length ? (
              <>
                {invoices.slice(0, 3).map((inv) => <Row key={inv.id} name={inv.number} value={inv.overdue ? `${inv.meta}, ${INVOICES.overdue.toLowerCase()}` : inv.meta} />)}
                <div className="acct-card-link"><MoreLink onClick={() => navigate('/my-account/invoices')}>All invoices</MoreLink></div>
              </>
            ) : <Empty>{INVOICES.none}</Empty>}
        </Card>
      </div>
      {(more.length > 0 || (phone && coachName && startChat)) && (
        <Card className="acct-more">
          {more.map((r) => <Row key={r.key} name={r.title} sub={r.meta} onClick={() => navigate(r.to)} />)}
          {/* Chat to the coach: in the header on a laptop, here on a phone. */}
          {phone && coachName && startChat && <Row name={`Chat to ${coachName}`} onClick={startChat} />}
        </Card>
      )}
    </div>
  );
}
