import { PageOpening } from '../components/design';
import { preparingLine, preparingTitle } from '../content/pageLines/client';
import './preparing.css';

/**
 * "Your portal is still being prepared." (polish 1, A brand-new client; example "New client"): the
 * welcome alone, on every page that would be empty (Home, Dashboard), while src/lib/clientPreparing.js
 * says the coach hasn't set anything up yet. The coach's first name comes from the data (my_coach).
 */
export default function Preparing({ firstName, coachName }) {
  return (
    <div className="home-prep">
      <PageOpening title={preparingTitle(firstName)} line={preparingLine(coachName)} />
    </div>
  );
}
