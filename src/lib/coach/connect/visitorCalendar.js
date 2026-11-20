// "Show my calendar" on a booking page (M11's second booking page screen):
// a visitor's own calendar beside the free times. The real thing needs the
// visitor to connect their own Google or Outlook calendar, and so keys the
// portal doesn't have yet (a Google OAuth client for visitors, read-only,
// free/busy). Until one is added there is no adapter and the page doesn't
// offer it. A stand-in draws the layout on previews and in tests, never on
// the live site: two invented meetings on whatever day is showing.
import { instantAt } from '../../time/index.js';

const LIVE = typeof __CLARITY_LIVE__ !== 'undefined' && __CLARITY_LIVE__;

/** The stand-in: M11's two invented meetings, in the visitor's own zone. */
export const visitorStandIn = {
  label: 'Your calendar',
  /** @returns {Promise<{ title: string, startsAt: Date, endsAt: Date }[]>} what the visitor has on a day */
  async eventsOn(day, zone) {
    return [
      { title: 'Team standup', startsAt: instantAt(day, '09:00', zone), endsAt: instantAt(day, '09:30', zone) },
      { title: 'Budget review', startsAt: instantAt(day, '11:00', zone), endsAt: instantAt(day, '12:00', zone) },
    ];
  },
};

/** The visitor's calendar adapter, or null when there is none (the live site today). */
export const visitorCalendar = () => (LIVE ? null : visitorStandIn);
