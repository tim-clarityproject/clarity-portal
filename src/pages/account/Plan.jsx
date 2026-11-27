import { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import DesignHeader from '../../components/DesignHeader';
import { BackLink } from '../../components/ui/DiscardLink';
import { Button, LoadError, PageHeader } from '../../components/design';
import { useCachedLoad } from '../../lib/pageCache';
import { loadSubscriptions } from '../../lib/coaching/agreements';
import { GATING_ON, PLANS, PLAN_CACHE, PLAN_WORDS, chooseWords, levelOf } from '../../lib/levels';
import '../coaching/coaching.css';
import '../coaching/clientAgreement.css';

// Your plan (Phase 6b run 3, Group C; M28 version 4 s-levels): /my-account/plan, for people who aren't coaching
// clients. Back to My Account, the three plans side by side (one under another on a phone), their names, prices and
// one line each, "Your plan" in mint on the one someone is on, Choose on the others (the coral one for Executive while
// someone isn't on it, as M28 draws it), the refund line, and Cancel my plan when the plan isn't Free.
// Gating is off until Tim sets prices and who keeps what (plan risk 20): choosing says calmly that plans aren't open
// yet and changes nothing. The plan someone is on comes from 061's portal_subscriptions (their own rows only).

export default function Plan() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const navigate = useNavigate();
  const { data, loading, error } = useCachedLoad({ userId, name: PLAN_CACHE, load: () => loadSubscriptions(userId) });
  const { level } = levelOf(data);
  const [said, setSaid] = useState(null);

  const choose = () => {
    // Nothing is bought or changed while gating is off (risk 20); the server's Choose comes with Tim's prices.
    if (!GATING_ON) setSaid(PLAN_WORDS.notOpen);
  };

  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="plan-page ipp-page coaching-page cl-page">
        <div className="plan-back-row"><BackLink onClick={() => navigate('/my-account')} label="My Account" /></div>
        <PageHeader title={PLAN_WORDS.title} />
        {error && !data && !loading ? <LoadError>The page didn’t load. Check your connection and try again.</LoadError> : (
          <div className="cl-plans-box"><div className="cl-plans">
            {PLANS.map((p) => (
              <div key={p.level} className="cl-plan">
                <h2 className="cl-plan-name">{p.name}</h2>
                <p className="cl-plan-price" data-price="">{p.price}</p>
                <p className="cl-plan-line">{p.line}</p>
                {level === p.level ? <p className="cl-plan-cur">{PLAN_WORDS.current}</p>
                  : p.level === 'free' ? <p className="cl-plan-cur" aria-hidden="true" />
                    : <Button variant={p.level === 'executive' ? 'primary' : 'outline'} onClick={() => choose(p.level)}>{chooseWords(p.level)}</Button>}
              </div>
            ))}
          </div></div>
        )}
        {said && <p className="cl-hint" role="status">{said}</p>}
        <p className="cl-say">{PLAN_WORDS.refund}</p>
        {level !== 'free' && <Button variant="text" onClick={() => navigate('/my-account/plan/cancel')}>{PLAN_WORDS.cancel}</Button>}
      </div>
    </div>
  );
}
