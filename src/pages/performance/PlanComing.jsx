import { useNavigate } from 'react-router-dom';
import DesignHeader from '../../components/DesignHeader';
import { BackLink } from '../../components/ui/DiscardLink';
import { Button, PageHeader } from '../../components/design';
import './performance.css';

// A stand-in for Build your plan and editing the plan (M6), which Phase 2
// step 2 builds at these same routes, so the plan's buttons never lead to
// nothing in the meantime.
export default function PlanComing({ editing = false }) {
  const navigate = useNavigate();
  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="plan-page ipp-page">
        <div className="plan-back-row"><BackLink onClick={() => navigate('/performance-plan')} label="Individual Performance Plan" /></div>
        <PageHeader title={editing ? 'Edit my plan' : 'Build your plan'} />
        <div className="ipp-gap ipp-coming">
          <p>{editing ? 'Editing your plan is coming soon.' : 'Building your plan is coming soon.'}</p>
          <p>It will take you through your mission, Outcome Objectives, Strategies and habits, one step at a time.</p>
        </div>
        <div className="ds-actions ipp-actions">
          <Button onClick={() => navigate('/performance-plan')}>Open my plan</Button>
        </div>
      </div>
    </div>
  );
}
