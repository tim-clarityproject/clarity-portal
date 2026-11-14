import Chevron from '../../components/design/Chevron';
import './healthCheck.css';

/**
 * Back above a page with no guided bar (M7b and M7 .bkl): the one chevron,
 * then the word in sentence case, its visible edge on the content's edge.
 * Shared by the outside Health Check and the Health Check inside the portal.
 */
export default function BackLink({ onClick, label = 'Back' }) {
  return (
    <div className="hc-backrow">
      <button type="button" className="hc-back" onClick={onClick}>
        <Chevron direction="left" size="sm" beside="words" />
        <span>{label}</span>
      </button>
    </div>
  );
}
