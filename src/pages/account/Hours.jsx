import { useContext, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import DesignHeader from '../../components/DesignHeader';
import { BackLink } from '../../components/ui/DiscardLink';
import { List, ListRow, LoadError, PageHeader, Section } from '../../components/design';
import { useCachedLoad } from '../../lib/pageCache';
import { getLocalDateKey } from '../../lib/dateFormatter';
import { loadHours } from '../../lib/coaching/agreements';
import { HOURS, HOURS_CACHE, hoursView } from '../../lib/coaching/clientMoney';
import '../coaching/coaching.css';
import '../coaching/clientAgreement.css';

// Your block of hours (Phase 6b run 3, Group C; M28 version 4 s-h-client; brief item 24): /my-account/hours. Back to
// My Account, the title, a mint meter of the block used, the running balance ("10 hours 40 minutes used of 13 hours
// 20 minutes, 2 hours 40 minutes left."), then every piece of time logged, the newest first, with what it was for, its
// day and its length. From 065's my_hours(), the client's own blocks only; shown at once from the device, refreshed
// quietly. More than one block: each under its own work's name.

export default function Hours() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const navigate = useNavigate();
  const [today] = useState(() => getLocalDateKey());
  const { data, loading, error } = useCachedLoad({ userId, name: HOURS_CACHE, load: () => loadHours(userId) });
  const blocks = useMemo(() => (Array.isArray(data) ? data : []).map((h) => hoursView(h, today)).filter(Boolean), [data, today]);

  const block = (b) => (
    <>
      <div className="cl-meter" role="img" aria-label={b.line}><i style={{ width: `${Math.round(b.share * 100)}%` }} /></div>
      <p className="cl-say">{b.line}</p>
      <List label="Time logged" className="cl-rows">
        {b.entries.map((e) => <ListRow key={e.key} title={e.title} type={e.meta} date={e.length} />)}
      </List>
    </>
  );

  let body = null;
  if (loading && !data) body = null;
  else if (error && !data) body = <LoadError>The page didn’t load. Check your connection and try again.</LoadError>;
  else if (!blocks.length) body = <p className="cl-hint">{HOURS.none}</p>;
  else if (blocks.length === 1) body = block(blocks[0]);
  else body = blocks.map((b) => <Section key={b.id} title={b.work || HOURS.title} className="cl-sec">{block(b)}</Section>);

  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="plan-page ipp-page coaching-page cl-page">
        <div className="plan-back-row"><BackLink onClick={() => navigate('/my-account')} label="My Account" /></div>
        <PageHeader title={HOURS.title} />
        {body}
      </div>
    </div>
  );
}
