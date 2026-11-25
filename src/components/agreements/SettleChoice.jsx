import InlineChoice from '../design/InlineChoice';
import { settleOptions } from '../../lib/agreements/settling';
import { canChoose, choiceOptions } from '../../lib/agreements/upfront';
import './agreements.css';

// "How would you like to settle?" (brief item 37; M28's choiceHTML): up front, 5% off, shown first and chosen to start
// with, or the plan the coach set. Shown on the quote and in the signing block, and only where the client chooses
// (a self-funded retainer, or set sessions settled any way but in full, with the offer left on). Long choices wrap into
// rows (the shared InlineChoice decides), never cut. `value` is 'upfront' | 'plan'.
export const SETTLE_QUESTION = 'How would you like to settle?';

export default function SettleChoice({ terms, value = 'upfront', onChange, chosenExtras }) {
  if (!canChoose(terms)) return null;
  const planLabel = (settleOptions(terms, chosenExtras).find((o) => o.value === terms.settle) || {}).label;
  const options = choiceOptions(terms, planLabel, chosenExtras);
  return (
    <div className="ag-settle">
      <InlineChoice label={SETTLE_QUESTION} options={options} value={value || 'upfront'} onChange={onChange} />
    </div>
  );
}
