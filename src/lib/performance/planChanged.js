// The plan was changed on this page (PlanPartPanel; Tim, 3 Nov): parts of
// the screen that show it, such as the header's My Mission pill, read it
// again at once instead of on the next page.
const EVENT = 'clarity-plan-changed';

export function notifyPlanChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new window.Event(EVENT));
}

export function onPlanChanged(fn) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}
