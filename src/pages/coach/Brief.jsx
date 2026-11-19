import { SlidePanel } from '../../components/design';

// A place-holder until the brief before a call is built (Phase 6a run 2):
// Today opens it from a call's row with the session's id.
export function BriefPanel({ sessionId, onClose }) {
  return (
    <SlidePanel open={Boolean(sessionId)} onClose={onClose} title="Brief">
      <p className="cc-quiet">Coming in this build. It isn’t ready to use yet.</p>
    </SlidePanel>
  );
}

export default BriefPanel;
