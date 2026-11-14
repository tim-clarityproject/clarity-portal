import { IconButton } from './Button';
import './design.css';

// A one-off tip (M7's team list: "Your April Health Check, done outside the
// portal, is now with the Leadership team."): one quiet sentence in a fine
// outline with the 45 degree crosshair to close it. It is said once: the
// page keeps that it was closed. A status, not an alert. Only one
// first-visit message shows at a time (5e rule 8), so the page shows it
// only when nothing else is offered.
export default function OneOffTip({ children, onClose, closeLabel = 'Close' }) {
  return (
    <div className="ds-oneoff-tip" role="status">
      <p>{children}</p>
      <IconButton label={closeLabel} onClick={onClose} />
    </div>
  );
}
