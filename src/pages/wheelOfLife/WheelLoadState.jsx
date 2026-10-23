import DesignHeader from '../../components/DesignHeader';
import Toast from '../../components/ui/Toast';
import { Loading } from '../../components/design';

// Shown while a Wheel of Life screen loads, or when loading failed (with
// a short message and Try again). Same loading crosshair as the other
// Review tools.
export default function WheelLoadState({ loading, error, onRetry, toast = null }) {
  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="plan-page wol-page">
        {loading ? (
          <Loading label="Loading your wheel" className="ds-loading--page" />
        ) : (
          <>
            <p className="plan-save-error" role="alert">{error}</p>
            <div className="wol-acts">
              <button type="button" className="ui-btn-ghost" onClick={onRetry}>Try again</button>
            </div>
          </>
        )}
      </div>
      <Toast message={toast} />
    </div>
  );
}
