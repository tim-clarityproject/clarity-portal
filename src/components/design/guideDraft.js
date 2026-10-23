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
