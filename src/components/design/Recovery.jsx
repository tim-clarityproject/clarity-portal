import { Button } from './Button';
import './design.css';

// Recovery's quiet panels (M15, Tim, 26 Oct), on the soft surface colour
// with no border and no colour, so nothing is pushed at someone resting.
//
// RecoveryNotice (M15 .rcalm): where a page's scores are hidden. A first
// line ("You're in recovery until Mon 2 Nov."), then grey lines ("Your
// scores and standards are hidden until you're back."), then one quiet
// text link, "Show my results", which the page uses to show everything
// as normal for that visit only (never stored: next time it is hidden
// again).
//
// RecoveryBanner (M15 .rbanner): the top of Recovery's daily page. "You're
// in recovery until Mon 2 Nov." on the left and "4 days left." on the
// right, wrapping under it on a narrow screen.
//
// RecoveryLinks (M15 .rlinks): the quiet text links that sit under them,
// "Add a few more days" and "I'm ready to go again".

export function RecoveryNotice({ lead, lines = [], action, className = '', children }) {
  return (
    <div className={`ds-rec-notice ${className}`.trim()}>
      {lead && <p className="ds-rec-lead">{lead}</p>}
      {lines.map((l) => <p key={l} className="ds-rec-line">{l}</p>)}
      {children}
      {action && (
        <Button variant="text" className="ds-rec-show" onClick={action.onClick}>{action.label}</Button>
      )}
    </div>
  );
}

export function RecoveryBanner({ until, left, className = '' }) {
  return (
    <div className={`ds-rec-banner ${className}`.trim()}>
      <p className="ds-rec-banner-lead">{until}</p>
      {left && <p className="ds-rec-banner-left">{left}</p>}
    </div>
  );
}

export function RecoveryLinks({ links, className = '' }) {
  return (
    <div className={`ds-rec-links ${className}`.trim()}>
      {links.filter(Boolean).map((l) => (
        <Button key={l.label} variant="text" onClick={l.onClick} disabled={l.disabled}>{l.label}</Button>
      ))}
    </div>
  );
}
