import { useNavigate } from 'react-router-dom';
import { Chevron, List, ListRow, Section } from '../../components/design';
import { useCachedLoad } from '../../lib/pageCache';
import { loadHours, loadSubscriptions, showsBilling } from '../../lib/coaching/agreements';
import { HOURS_CACHE, accountRows } from '../../lib/coaching/clientMoney';
import { GATING_ON, PLAN_CACHE, levelOf, planLine } from '../../lib/levels';
import { useAgreements } from '../coaching/agreementData';
import '../coaching/clientAgreement.css';

// My Account's way in to the client's money pages (Phase 6b run 3, Group C; M28 version 4 s-acct), mounted in
// MyAccount.jsx before Your own questions: Coaching (the agreement and its signed copies), Invoices (settle and
// download), Your plan (only once Tim turns plans on: plan risk 20) and Block of hours (the balance), each a row that
// opens its page, and each only where there is something behind it; nothing at all for someone with none of them.
// Difference from M28: the rows sit under the section heading "Your coaching", as every part of My Account has one
// (CLAUDE.md rule 13).

export default function MyAccountMoney({ userId }) {
  const navigate = useNavigate();
  const { data } = useAgreements(userId);
  const hours = useCachedLoad({ userId, name: HOURS_CACHE, load: () => loadHours(userId) });
  const plan = useCachedLoad({ userId: GATING_ON ? userId : null, name: PLAN_CACHE, load: () => loadSubscriptions(userId) });
  const rows = accountRows({
    hasAgreement: data.agreements.length > 0,
    seesInvoices: showsBilling(data),
    planLine: GATING_ON ? planLine(levelOf(plan.data).level) : null,
    hours: Array.isArray(hours.data) ? hours.data : [],
  });
  if (!userId || rows.length === 0) return null;
  return (
    <Section title="Your coaching" className="ipp-section account-section">
      <List label="Your coaching" className="cl-rows">
        {rows.map((r) => <ListRow key={r.key} title={r.title} type={r.meta} date={<Chevron direction="right" size="sm" />} onClick={() => navigate(r.to)} />)}
      </List>
    </Section>
  );
}
