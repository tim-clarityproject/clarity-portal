import { Button, IconButton } from './Button';
import Chevron from './Chevron';
import { SlidePanel } from './Dialogs';
import { List, ListRow } from './ListRow';
import './design.css';

// Home as Today's parts (mock-up M2, approved 23 Oct; Phase 4 step 2).
//
// SuggestionCard: the one "Suggested for now" card (M2 .hs, M19 .wcard):
//   a question, its lines, how long it takes ("~4 minutes"), the one coral
//   button, and an optional text link ("Not tonight").
// QuietLines: at most two quiet lines under it (M2 .hq): a fact or a
//   question, one text link, an optional time and an optional Not now cross.
// MiniDial: the sprint dial in small (M2 .hd2), one thin segment per week
//   in the same week colours (mint at or above the standard, grey below,
//   this week filling in the text colour), with the date and "Week 4 of 8"
//   beside it. The whole thing opens the sprint.
// DayFocus: "How you want to be today" and "Today's Strategy", side by
//   side (stacked on a phone) (M2 .hbe).
// WeekLine: the week's performance score with the usual range, opening
//   the sprint (M2 .hwk). Mint at or above the standard (never coral).
// PlanSteps: the plan's four steps for someone new (M2 .hst): done (mint
//   with its tick), next (in the text colour) or not yet.
// HelpList: "What do you need help with?" behind one button (M2 helpPanel):
//   situations in plain words, each naming its tool, sliding in from the side.
// CarryOnList: "Carry on where you left off": one row per half-finished
//   tool, named in words.

/** Suggested for now (M2 sugCard). action: { label, onClick }; link: { label, onClick }. */
export function SuggestionCard({ label = 'Suggested for now', question, lines = [], time, action, link, className = '' }) {
  return (
    <section className={`ds-suggest ${className}`.trim()} aria-label={label}>
      <p className="ds-suggest-label">{label}</p>
      <h2 className="ds-suggest-question">{question}</h2>
      {lines.map((line) => <p key={line} className="ds-suggest-line">{line}</p>)}
      {time && <p className="ds-suggest-time">{time}</p>}
      {(action || link) && (
        <div className="ds-suggest-actions">
          {action && <Button variant="primary" onClick={action.onClick}>{action.label}</Button>}
          {link && <Button variant="text" onClick={link.onClick}>{link.label}</Button>}
        </div>
      )}
    </section>
  );
}

/** M2 qlHtml: items [{ key, lines, action: { label, onClick }, time, onDismiss }]. */
export function QuietLines({ items = [] }) {
  if (!items.length) return null;
  return (
    <div className="ds-quiet">
      {items.map((q) => (
        <div key={q.key} className="ds-quiet-row">
          <div className="ds-quiet-main">
            {q.lines.map((line) => <p key={line} className="ds-quiet-line">{line}</p>)}
            {q.action && <Button variant="text" className="ds-quiet-link" onClick={q.action.onClick}>{q.action.label}</Button>}
            {q.time && <p className="ds-quiet-time">{q.time}</p>}
          </div>
          {q.onDismiss && <IconButton label="Not now" className="ds-quiet-x" onClick={q.onDismiss} />}
        </div>
      ))}
    </div>
  );
}

// The mini dial's ring, in its own 100-unit drawing (M2 miniDial: radius
// 40, 7 wide, a 24-degree gap at the top, 6 between weeks).
const MINI = { r: 40, w: 7, top: 24, gap: 6 };
const at = (deg, r) => {
  const a = (deg * Math.PI) / 180;
  return [(50 + r * Math.cos(a)).toFixed(2), (50 + r * Math.sin(a)).toFixed(2)];
};
const arc = (a0, a1) => {
  const p = at(a0, MINI.r);
  const q = at(a1, MINI.r);
  return `M${p.join(' ')}A${MINI.r} ${MINI.r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${q.join(' ')}`;
};

/**
 * weeks: the sprint dial's weeks ({ state: 'good'|'below'|'none'|'now'|'next' });
 * dayInWeek: today's place in this week (0 to 6); date: "Wed 21 Oct";
 * line: "Week 4 of 8"; label: what a screen reader hears.
 */
export function MiniDial({ weeks = [], dayInWeek = 0, date, line, label, onClick }) {
  const n = Math.max(1, weeks.length);
  const span = 360 - MINI.top;
  const step = span / n;
  const base = -90 + MINI.top / 2;
  const segs = weeks.map((w, i) => {
    const a0 = base + i * step + MINI.gap / 2;
    const a1 = base + (i + 1) * step - MINI.gap / 2;
    if (w.state === 'now') {
      return (
        <g key={i}>
          <path className="ds-mdial-seg ds-mdial-seg--next" d={arc(a0, a1)} />
          <path className="ds-mdial-seg ds-mdial-seg--now" d={arc(a0, a0 + (a1 - a0) * ((dayInWeek + 1) / 7))} />
        </g>
      );
    }
    return <path key={i} className={`ds-mdial-seg ds-mdial-seg--${w.state}`} d={arc(a0, a1)} />;
  });
  return (
    <button type="button" className="ds-mdial" onClick={onClick} aria-label={label}>
      <svg viewBox="0 0 100 100" aria-hidden="true">{segs}</svg>
      <span className="ds-mdial-words">
        <span className="ds-mdial-date">{date}</span>
        {line && <span className="ds-mdial-line">{line}</span>}
      </span>
    </button>
  );
}

/** M2 .hbe: way, the day's way of being; strategies, the day's Strategies by name. */
export function DayFocus({ way, strategies = [] }) {
  if (!way && !strategies.length) return null;
  return (
    <div className="ds-dayfocus">
      {way && (
        <div className="ds-dayfocus-item">
          <span className="ds-dayfocus-label">How you want to be today</span>
          <span className="ds-dayfocus-text">{way}</span>
        </div>
      )}
      {strategies.length > 0 && (
        <div className="ds-dayfocus-item">
          <span className="ds-dayfocus-label">{strategies.length === 1 ? 'Today’s Strategy' : 'Today’s Strategies'}</span>
          {strategies.map((s) => <span key={s} className="ds-dayfocus-text">{s}</span>)}
        </div>
      )}
    </div>
  );
}

/**
 * M2 .hwk: label "Performance score this week", figure "78%", good (at or
 * above the standard: mint), line "Your usual range is 72 to 84%.".
 */
export function WeekLine({ label, figure, good = false, line, onClick }) {
  return (
    <button type="button" className="ds-weekline" onClick={onClick}>
      <span className="ds-weekline-score">
        <span className="ds-weekline-label">{label}</span>
        {figure && <span className={`ds-weekline-figure${good ? ' ds-weekline-figure--good' : ''}`}>{figure}</span>}
      </span>
      {line && <span className="ds-weekline-line">{line}</span>}
      <Chevron direction="right" size="sm" className="ds-weekline-chevron" />
    </button>
  );
}

const TICK = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
const STEP_WORD = { done: 'Done', next: 'Next', later: 'Not yet' };

/** M2 planSteps: steps [{ key, name, state: 'done'|'next'|'later' }]. */
export function PlanSteps({ steps = [] }) {
  return (
    <ol className="ds-plansteps">
      {steps.map((s) => (
        <li key={s.key} className={`ds-planstep ds-planstep--${s.state}`}>
          <span className="ds-planstep-mark" aria-hidden="true">{s.state === 'done' ? TICK : null}</span>
          <span className="ds-planstep-name">{s.name}</span>
          <span className="ds-planstep-state">{STEP_WORD[s.state]}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * M2 helpPanel: items [{ situation, tool, onClick }]; coach: the coach's
 * first name (no coach, no last line); onChat opens the chat.
 */
export function HelpList({ open, onClose, items = [], coach, onChat }) {
  const all = coach ? [...items, { situation: 'Something else?', tool: `Chat to ${coach}`, onClick: onChat }] : items;
  return (
    <SlidePanel open={open} onClose={onClose} title="What do you need help with?">
      <ul className="ds-helplist">
        {all.map((x) => (
          <li key={x.situation}>
            <button type="button" className="ds-helplist-row" onClick={x.onClick}>
              <span className="ds-helplist-words">
                <span className="ds-helplist-situation">{x.situation}</span>
                <span className="ds-helplist-tool">{x.tool}</span>
              </span>
              <Chevron direction="right" size="sm" />
            </button>
          </li>
        ))}
      </ul>
    </SlidePanel>
  );
}

/** Carry on where you left off: items [{ key, title, type, date, onClick }]. */
export function CarryOnList({ items = [], title = 'Carry on where you left off' }) {
  if (!items.length) return null;
  return (
    <section className="ds-carryon" aria-labelledby="ds-carryon-title">
      <h2 id="ds-carryon-title" className="ds-carryon-title">{title}</h2>
      <List label={title} className="ds-carryon-list">
        {items.map((x) => <ListRow key={x.key} title={x.title} type={x.type} date={x.date} onClick={x.onClick} />)}
      </List>
    </section>
  );
}
