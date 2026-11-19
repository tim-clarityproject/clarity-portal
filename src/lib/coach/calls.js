// The calls the next-call bar is told about. They arrive with the calendar
// (Phase 6a run 3). Until then the bar's slot is in place with its rules,
// and on previews and local builds only it can be given test calls: a list
// kept in this tab as "clarity-coach-test-calls"
//   [{ name, startsAt (an instant), zoom?, briefTo? }]
// The live site never reads it (CoachApp asks only when the build isn't live).
const KEY = 'clarity-coach-test-calls';

export function testCalls() {
  try {
    const raw = JSON.parse(window.sessionStorage.getItem(KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((c) => c && typeof c.name === 'string' && !Number.isNaN(new Date(c.startsAt).getTime()))
      .map((c) => ({
        name: c.name.slice(0, 120),
        startsAt: c.startsAt,
        // Only ever a place inside the coach portal, and an https address for Zoom.
        briefTo: typeof c.briefTo === 'string' && c.briefTo.startsWith('/coach/') ? c.briefTo : null,
        zoom: typeof c.zoom === 'string' && /^https:\/\//.test(c.zoom) ? c.zoom : null,
      }));
  } catch {
    return [];
  }
}
