import { NumberField } from './LoggingRow';
import './design.css';

// One Outcome Objective's figure in the weekly debrief (M1 "oin"): the
// objective's name, the number box with its unit (or "/10" for a
// rating), then one grey line with the figure before ("Last week 31")
// and, once a new figure is typed, the change at a glance ("+9"). A rise
// towards the target is mint (good, Tim 26 Oct); anything else stays
// grey, never coral or red. The words come from the page, worked out in
// src/lib (m0Change), never here.
//
// lastLine: "Last week 31", or "Not set yet".
// change:   { text: '+9', good: true } once a figure is typed, or null.
export default function ObjectiveFigureRow({ name, value, onChange, unit, decimals = true, lastLine, change, entryLabel }) {
  return (
    <div className="ds-objfig">
      <div className="ds-objfig-name">{name}</div>
      <div className="ds-objfig-row">
        <NumberField value={value} onChange={onChange} unit={unit} decimals={decimals} label={entryLabel || name} />
        <span className="ds-objfig-line">
          {lastLine && <span>{lastLine}</span>}
          {change?.text && <span className={change.good ? 'ds-objfig-change ds-objfig-change--good' : 'ds-objfig-change'}>{change.text}</span>}
        </span>
      </div>
    </div>
  );
}
