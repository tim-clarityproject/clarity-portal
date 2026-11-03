// How much something moves its Strategy (methods M4): Low 1, Medium 2,
// High 3, in the words every add and edit panel shows.
export const IMPACT_OPTIONS = [{ value: 1, label: 'Low' }, { value: 2, label: 'Medium' }, { value: 3, label: 'High' }];

// Rule 64 (a question about one thing names it, in curly quotes; Tim's
// call on the Phase 3 report, decisions part 4): the "how much" question
// names the Strategy chosen just above it. With none chosen yet it asks
// plainly; with several (a win) it names them together.
const quoted = (names) => {
  const q = names.map((n) => `“${n}”`);
  return q.length > 1 ? `${q.slice(0, -1).join(', ')} and ${q[q.length - 1]}` : q[0];
};
export function moveQuestion(name) {
  return name ? `How much will it move ${quoted([name])}?` : 'How much will it move its Strategy?';
}
export function helpQuestion(names = []) {
  return names.length ? `How much did it help ${quoted(names)}?` : 'How much did it help?';
}
