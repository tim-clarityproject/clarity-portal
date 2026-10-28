import ChartTips, { tipProps } from './ChartTips';
import './design.css';

// The circled Outcome Objective number (Tim, 26 Oct, 10:48 and 11:48):
// Outcome Objectives are numbered 1 to 4 wherever they are listed with
// their Strategies, and each Strategy shows "Serves" with the same
// numbers. Every circle opens the shared pop-up on hover, tap and keyboard
// focus: what kind of thing it is first, small ("Outcome Objective 2"),
// then the objective's name. The pop-up stays 12px inside both screen
// edges (ChartTips). The circle is 22px; its tap area is 44px.
//
// items: [{ number, name }] in number order.
// label: the word before the circles ("Serves").
export function ObjectiveNumbers({ items = [], label = 'Serves', className = '' }) {
  if (!items.length) return null;
  return (
    <ChartTips className={`ds-serves ${className}`.trim()}>
      {label && <span>{label}</span>}
      {items.map(({ number, name }) => (
        <span
          key={number}
          className="ds-onum ds-onum--tip"
          {...tipProps({ kind: `Outcome Objective ${number}`, name })}
        >
          <span aria-hidden="true">{number}</span>
        </span>
      ))}
    </ChartTips>
  );
}

export default function ObjectiveNumber({ number, name }) {
  return <ObjectiveNumbers items={[{ number, name }]} label={null} className="ds-serves--one" />;
}
