// Group D's calendar parts (Phase 6b run 3, plan section 6 D; M28 s-cal-session; brief items 44 to 46), mounted by
// Group A in calendarPanels.jsx. Stubs that change nothing until Group D fills them, keeping these names and props:
//
// opensWhatHappened(entry, now): true when tapping this calendar entry (a coaching session past its time) should open
//   WhatHappenedPanel instead of the session's own page. The stub says false (the calendar behaves as before).
// WhatHappenedPanel({ cal, entry, onClose }): the pop-up "What happened?" for an entry (null when closed).
// WhatHappened({ cal, entry }): the same choice inside the calendar item's own panel, for an item with a session.
// CalendarDeepLink({ cal, open }): reads /coach/calendar?item=<session id> and opens it once (SessionCheckRow's link).
// eslint-disable-next-line no-unused-vars
export function opensWhatHappened(entry, now) { return false; }
// eslint-disable-next-line no-unused-vars
export function WhatHappenedPanel({ cal, entry, onClose }) { return null; }
// eslint-disable-next-line no-unused-vars
export function WhatHappened({ cal, entry }) { return null; }
// eslint-disable-next-line no-unused-vars
export function CalendarDeepLink({ cal, open }) { return null; }
