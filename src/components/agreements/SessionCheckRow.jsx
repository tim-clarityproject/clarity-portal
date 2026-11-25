import { useNavigate } from 'react-router-dom';
import { outcomeLabel, rowAction } from '../../lib/agreements/sessionOutcome';
import './agreements.css';

// A coaching session where sessions are checked off (brief item 46; M28's usedList): an agreement's Coaching sessions
// list, Invoice from what's delivered, an organisation's New invoice. Its day, what happened (or "Coming up"), and
// "To confirm" for a past one nobody has said yet. One click opens its calendar pop-up (/coach/calendar?item=<id>;
// Group D's deep link). Use inside <ul className="ag-sessions">.
//   session: a coach_sessions row; title: its day in words ("Mon 25 Jan"); onOpen: instead of the calendar link.
export const calendarLink = (sessionId) => `/coach/calendar?item=${encodeURIComponent(sessionId)}`;

export default function SessionCheckRow({ session, title, now = Date.now(), onOpen }) {
  const navigate = useNavigate();
  const action = rowAction(session, now);
  const open = () => (onOpen ? onOpen(session) : navigate(calendarLink(session.id)));
  return (
    <li>
      <button type="button" className="ag-session" onClick={open}>
        <span>
          <span className="ag-session-title">{title}</span>
          <span className="ag-session-meta">{outcomeLabel(session, now)}</span>
        </span>
        {action && <span className={`ag-session-act${action === 'To confirm' ? ' ag-session-act--due' : ''}`}>{action}</span>}
      </button>
    </li>
  );
}
