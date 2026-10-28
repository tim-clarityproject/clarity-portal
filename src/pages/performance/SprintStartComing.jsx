import { useContext, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import DesignHeader from '../../components/DesignHeader';
import { BackLink } from '../../components/ui/DiscardLink';
import { Button, PageHeader, dayLabel, useToast } from '../../components/design';
import { readSprintSetup } from '../../lib/performance/sprintSetup';
import './performance.css';

// A stand-in for Start a sprint (M6), which Phase 2 step 3 builds at this
// same route, so finishing Build your plan never leads to nothing in the
// meantime. It shows the first sprint chosen there, which Start a sprint
// picks up (route state, or the copy kept on the device).
export default function SprintStartComing() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { user } = useContext(AuthContext);
  const setup = location.state?.sprintSetup || readSprintSetup(user?.id);

  useEffect(() => {
    if (location.state?.toast) toast.show(location.state.toast);
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="plan-page ipp-page">
        <div className="plan-back-row"><BackLink onClick={() => navigate('/performance-plan')} label="Individual Performance Plan" /></div>
        <PageHeader title="Start a sprint" />
        <div className="ipp-gap ipp-coming">
          <p>Starting your sprint is coming soon.</p>
          {setup && <p>{`Your first sprint is set for ${setup.lengthWeeks} weeks from ${dayLabel(setup.startOn)}.`}</p>}
          {setup && <p>{`Your performance standard is ${setup.standard}%.`}</p>}
        </div>
        <div className="ds-actions ipp-actions">
          <Button onClick={() => navigate('/performance-plan')}>Open my plan</Button>
        </div>
      </div>
    </div>
  );
}
