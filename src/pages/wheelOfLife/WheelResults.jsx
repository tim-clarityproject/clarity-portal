import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import DesignHeader from '../../components/DesignHeader';
import PageHeading from '../../components/PageHeading';
import Toast from '../../components/ui/Toast';
import useToast from '../../hooks/useToast';

// Temporary placeholder for /wheel-of-life/results. WL3 replaces it with
// the one-pager. It already shows the toast a finished check-in sends.
export default function WheelResults() {
  const location = useLocation();
  const navigate = useNavigate();
  const { message, showToast } = useToast();

  useEffect(() => {
    if (location.state?.toast) {
      showToast(location.state.toast);
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="plan-page">
        <div className="plan-header">
          <PageHeading pageKey="wheelOfLifeResults" title="Wheel of Life" />
        </div>
        <p className="ui-subtitle">Your wheel will appear here.</p>
      </div>
      <Toast message={message} />
    </div>
  );
}
