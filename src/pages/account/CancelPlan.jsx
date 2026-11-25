import { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import DesignHeader from '../../components/DesignHeader';
import { BackLink } from '../../components/ui/DiscardLink';
import { Button, PageHeader } from '../../components/design';
import { useCachedLoad } from '../../lib/pageCache';
import { getLocalDateKey, parseDbTimestamp } from '../../lib/dateFormatter';
import { loadSubscriptions } from '../../lib/coaching/agreements';
import { GATING_ON, PLAN_CACHE, PLAN_WORDS, cancelLine, levelOf } from '../../lib/levels';
import '../coaching/coaching.css';
import '../coaching/clientAgreement.css';

// Cancel my plan (Phase 6b run 3, Group C; M28 version 4 s-cancel): /my-account/plan/cancel, one step. Back to Your
// plan, the title, when the plan ends, "You keep everything you've made, and the free tools carry on.", then Cancel my
// plan (coral) and Keep my plan. Cancelling online sends a confirmation email (Group E, with Tim's prices); while
// gating is off (plan risk 20) it says calmly that plans aren't open yet and changes nothing.

export default function CancelPlan() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const navigate = useNavigate();
  const { data } = useCachedLoad({ userId, name: PLAN_CACHE, load: () => loadSubscriptions(userId) });
  const { level, periodEnd } = levelOf(data);
  const endDay = periodEnd ? getLocalDateKey(parseDbTimestamp(periodEnd)) : null;
  const [said, setSaid] = useState(null);
  const back = () => navigate('/my-account/plan');

  const cancel = () => {
    if (!GATING_ON) setSaid(PLAN_WORDS.notOpen);
  };

  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="plan-page ipp-page coaching-page cl-page">
        <div className="plan-back-row"><BackLink onClick={back} label={PLAN_WORDS.title} /></div>
        <PageHeader title={PLAN_WORDS.cancel} />
        <p className="cl-say">{cancelLine(level === 'free' ? 'individual' : level, endDay)}</p>
        <p className="cl-say">{PLAN_WORDS.keepsLine}</p>
        {said && <p className="cl-hint" role="status">{said}</p>}
        <div className="cl-acts">
          <Button variant="primary" onClick={cancel}>{PLAN_WORDS.cancel}</Button>
          <Button variant="outline" onClick={back}>{PLAN_WORDS.keep}</Button>
        </div>
      </div>
    </div>
  );
}
