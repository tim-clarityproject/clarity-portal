import DesignHeader from '../../components/DesignHeader';
import Toast from '../../components/ui/Toast';

// Shown while a Wheel of Life screen loads, or when loading failed (with
// a short message and Try again). Same look as the other Review tools'
// "Loading..." state.
export default function WheelLoadState({ loading, error, onRetry, toast = null }) {
  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="plan-page wol-page">
        {loading ? (
          <p className="ui-subtitle">Loading...</p>
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
