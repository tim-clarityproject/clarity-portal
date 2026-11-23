// Where an unfinished guided tool was left, kept on the device
// (GuidedTool.jsx), so it carries on as a draft.
export const STEP_PREFIX = 'ds-guide:';

// Forget it once the tool is finished (or discarded).
export function clearGuideDraft(draftKey) {
  try {
    window.localStorage.removeItem(STEP_PREFIX + draftKey);
  } catch {
    // Nothing to clear.
  }
}

// The step a tool asked to open on (initialStep, a step's key), found again
// by its key while the steps change before anyone has moved. A person's own
// questions can arrive after the first screen is drawn (a device with no
// copy of them yet) and go in just before the summary, so a finished tool
// asked to open on its summary would otherwise be left on the last question.
export function openStepIndex(steps, askedKey, index) {
  if (!askedKey) return index;
  const at = steps.findIndex((s) => s.key === askedKey);
  return at >= 0 ? at : index;
}
