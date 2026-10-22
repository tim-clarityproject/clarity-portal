import { Button, SystemLink } from './Button';
import Crosshair from './Crosshair';
import './design.css';

// Empty state (design reference: Empty state; decisions: "First use and
// empty screens", "Empty screens"). A small quiet grey crosshair, one
// line, one button, and optionally the system link. No tours.
//
// action: { label, onClick } for the one button (primary unless the page
//         already has its coral button: pass variant 'outline').
export default function EmptyState({ title, line, action, onSystemLink, as: Heading = 'h2' }) {
  return (
    <div className="ds-empty">
      <Crosshair size="md" tone="label" />
      <Heading className="ds-empty-title">{title}</Heading>
      {line && <p className="ds-empty-line">{line}</p>}
      {(action || onSystemLink) && (
        <div className="ds-actions">
          {action && (
            <Button variant={action.variant || 'primary'} onClick={action.onClick}>{action.label}</Button>
          )}
          {onSystemLink && <SystemLink onClick={onSystemLink} />}
        </div>
      )}
    </div>
  );
}
