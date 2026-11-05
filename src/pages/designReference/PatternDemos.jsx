import { PatternCard } from '../../components/design';
import { patternCardWords } from '../../lib/performance/patterns';

// Pattern cards (Phase 5 step 3, mock-up M4 "Patterns in your numbers",
// methods M14). Invented figures and names only.

const NAMES = {
  habits: { hA: 'Weekly strategic block' },
  strategies: { s1: 'Grow through referrals' },
  strategyOfHabit: { hA: 's1' },
  objectives: { o1: { name: 'Coaching clients', unit: 'clients', direction: 'up' } },
};
const CARDS = [
  { key: 'L1', id: 'L1', strength: 'strong', sizes: [64, 41], values: [86, 77], gap: 9.2, swing: 11, q: 0.004, holds: true },
  { key: 'L3:hA', id: 'L3', subject: 'hA', strength: 'clear', sizes: [12, 8], values: [88, 74], gap: 13.6, swing: 10.5, q: 0.018, holds: true },
  { key: 'L6:s1:o1', id: 'L6', subject: 's1:o1', strength: 'clear', sizes: [14, 10], values: [1.5, 0.4], gap: 1.1, swing: 0.9, q: 0.021, holds: true },
];

export function PatternCardDemo() {
  return (
    <div className="ds-patterns">
      {CARDS.map((c) => <PatternCard key={c.key} card={patternCardWords(c, NAMES)} onAct={() => {}} onHide={() => {}} />)}
    </div>
  );
}
