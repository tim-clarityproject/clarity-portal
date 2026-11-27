import { Dropdown, TextBox } from '../../components/design';
import { COMMIT_MAX, COMMIT_STRATEGY } from '../../lib/performance/commitQuestions';

// The answer to a commit question that becomes a to-do (Stage D, Draft 11):
// the box, and "Which Strategy does it serve?" only when the plan has more
// than one (every to-do serves a Strategy). Nothing else sits under the question.
export default function CommitTodo({ question, text, onText, strategies = [], strategyId, onStrategy }) {
  const options = strategies.map((s) => ({ value: s.id ?? s.value, label: s.name ?? s.label }));
  return (
    <div className="day-stack">
      <TextBox ariaLabel={question} maxLength={COMMIT_MAX} value={text} onChange={onText} />
      {options.length > 1 && (
        <Dropdown label={COMMIT_STRATEGY} options={options} value={strategyId} onChange={onStrategy} />
      )}
    </div>
  );
}
