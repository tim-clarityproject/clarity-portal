import { useNavigate } from 'react-router-dom';
import DesignHeader from '../../components/DesignHeader';
import { BackLink } from '../../components/ui/DiscardLink';
import { Button, PageHeader } from '../../components/design';
import './performance.css';

// The stand-in for Recovery (Phase 2 step 7 builds it from M15 at this
// route), so "Start my Recovery" at the end of a review never leads to
// nothing in the meantime. Step 7 replaces this.
export default function RecoveryStandIn() {
  const navigate = useNavigate();
  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="plan-page ipp-page">
        <div className="plan-back-row"><BackLink onClick={() => navigate('/performance-sprint')} label="Performance Sprint" /></div>
        <PageHeader title="Take a recovery week" />
        <div className="ipp-gap ipp-coming">
          <p>Recovery is coming soon.</p>
          <p>Nothing is tracked until you start your next sprint.</p>
        </div>
        <div className="ds-actions ipp-actions">
          <Button variant="primary" onClick={() => navigate('/performance-sprint/start')}>Start a sprint</Button>
        </div>
      </div>
    </div>
  );
}
