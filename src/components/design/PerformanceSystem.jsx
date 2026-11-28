import { useInRouterContext, useNavigate } from 'react-router-dom';
import { Button } from './Button';
import { Popup } from './Dialogs';
import { useCoachName } from './coachContext';
import HowItWorksBody from '../howItWorks/HowItWorks';
import { HOW_IT_WORKS_BUTTONS, HOW_IT_WORKS_LINE, HOW_IT_WORKS_TITLE } from '../../content/howItWorks';
import './design.css';

// "How the system fits together" (the one-page pop-up agreed on 21 Oct): since Stage D item 8 (Tim, 27 Nov) it says
// exactly what the How it works page says (Draft 9), the same words as the public page and My Account's About, so
// there is one explanation of the system. It opens over any page and closes back to it (the ×, Escape or a tap
// outside); full screen on a phone. Its one main button is "Open my plan". Opened from "How the system fits
// together" in the My Mission panel and, for someone new, on Home.
// (Until 27 Nov it held the Individual Performance System one-pager: the plan's four layers and the sprint.)

export function PerformanceSystemBody() {
  // Inside the portal: the client's own coach by first name (the Stage D UI tester's question 2).
  const coach = useCoachName();
  return (
    <div className="ds-system">
      <p className="hiw-text hiw-intro">{HOW_IT_WORKS_LINE}</p>
      <HowItWorksBody heading="h3" coach={coach} />
    </div>
  );
}

function OpenPlan({ onClose }) {
  const navigate = useNavigate();
  const b = HOW_IT_WORKS_BUTTONS.inside;
  return <Button variant="primary" onClick={() => { onClose?.(); navigate(b.to); }}>{b.label}</Button>;
}

export default function PerformanceSystem({ open, onClose }) {
  // The design gallery shows it outside the router, where "Open my plan" has nowhere to go: Close instead.
  const inRouter = useInRouterContext();
  return (
    <Popup
      open={open}
      onClose={onClose}
      title={HOW_IT_WORKS_TITLE}
      footer={inRouter ? <OpenPlan onClose={onClose} /> : <Button onClick={onClose}>Close</Button>}
    >
      <PerformanceSystemBody />
    </Popup>
  );
}
