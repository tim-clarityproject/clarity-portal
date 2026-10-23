import { Button } from './Button';
import './design.css';

// Empty space (design reference v3: "A question, then the button"; Tim,
// 23 Oct). One question that makes the next step clear, then one button.
// No tours, no long explanations.
//
// action: { label, onClick } for the one button (primary unless the page
//         already has its coral button: pass variant 'outline').
export default function EmptyState({ question, action, as: Heading = 'h2' }) {
  return (
    <div className="ds-empty">
      <Heading className="ds-empty-title">{question}</Heading>
      {action && (
        <div className="ds-actions">
          <Button variant={action.variant || 'primary'} onClick={action.onClick}>{action.label}</Button>
        </div>
      )}
    </div>
  );
}
