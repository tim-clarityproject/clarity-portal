import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// Shows a toast sent by the screen the person came from (navigate with
// state: { toast }), then clears it so a refresh does not show it again -
// the same pattern as the summary pages (ReviewSummary, MeetingSummary).
export default function useArrivalToast(showToast) {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (location.state?.toast) {
      showToast(location.state.toast);
      const { toast: _toast, ...rest } = location.state;
      navigate(`${location.pathname}${location.search}`, { replace: true, state: Object.keys(rest).length ? rest : null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// Where Back / Save on Your areas and Your targets return to: the screen
// the person came from, if it was a Wheel of Life screen.
export function returnPath(state, fallback = '/wheel-of-life') {
  const from = state?.from;
  return typeof from === 'string' && from.startsWith('/wheel-of-life') ? from : fallback;
}
