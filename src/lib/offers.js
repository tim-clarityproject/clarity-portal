// Offers (5e rule 8b; Tim, 14 Nov, 10:14 to 10:19): anything the portal
// offers but doesn't need (a Quick guide, a featured tool on Home, the
// organisation animation) is one slim offer row (OfferRow), and it is
// offered calmly:
//
//   - it shows on the first visit;
//   - "Not now" hides it for the rest of this visit, and it is offered again
//     on the next 2 visits, then stops;
//   - "Don’t show this again" joins Not now from the second offer, and stops it;
//   - taking the offer (watching the Quick guide) stops it too: it has done
//     its job, and the title's own icon is there for another look;
//   - it never plays or opens by itself;
//   - it never shows with another first-visit message: the page asks for one
//     message at a time (firstMessage), and the offer comes first;
//   - while it shows, the same thing's icon beside the title hides (the play
//     icon for a Quick guide), so the thing is offered once; the icon comes
//     back once the row has gone.
//
// What is kept, per offer: how many times Not now was pressed, and whether
// it was stopped or taken. A signed-in person's is in the account, in
// person_settings.page_preferences.offers (beside the menu's pins and the
// timer's length), with this device's copy shown first and changes sent
// through the offline queue (menuPins.js). With nobody signed in (the
// outside pages) it stays on this device only, under clarity-offers: a
// device's own setting that holds no person's data.
//
// A "visit" is one opening of the portal on this device (a page load, or the
// Home Screen app opened afresh): Not now hides the row until then, however
// often the page is opened meanwhile.

export const OFFERS_PREFERENCE = 'offers';
export const DEVICE_OFFERS_KEY = 'clarity-offers';
/** After the first Not now, how many more visits it is offered on. */
export const OFFER_AGAIN = 2;

/** The Quick guide offer on the Health Check's team list (M7). */
export const HEALTH_CHECK_GUIDE_OFFER = 'health-check-guide';

const count = (v) => (Number.isInteger(v) && v > 0 ? Math.min(v, 99) : 0);

/** One offer's kept state, whatever was stored: { notNow, never, taken }. */
export function cleanOffer(raw) {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return { notNow: count(o.not_now), never: o.never === true, taken: o.taken === true };
}

/** The stored shape of one offer's state (snake case, as page_preferences keeps its settings). */
export function storedOffer(state) {
  const out = {};
  if (state.notNow) out.not_now = state.notNow;
  if (state.never) out.never = true;
  if (state.taken) out.taken = true;
  return out;
}

/** Every offer's state out of the page settings ({} when there are none). */
export function offersFrom(prefs) {
  const all = prefs && typeof prefs === 'object' ? prefs[OFFERS_PREFERENCE] : null;
  return all && typeof all === 'object' && !Array.isArray(all) ? all : {};
}

/**
 * Whether the offer shows now. hiddenNow: Not now (or a choice) was pressed
 * this visit. blocked: another first-visit message is showing.
 */
export function offerShows(state, { hiddenNow = false, blocked = false } = {}) {
  const s = cleanOffer(storedOffer(state));
  if (hiddenNow || blocked || s.never || s.taken) return false;
  return s.notNow <= OFFER_AGAIN;
}

/** "Don’t show this again" joins Not now from the second offer. */
export const offersNever = (state) => cleanOffer(storedOffer(state)).notNow >= 1;

/** The state after each choice. */
export const afterNotNow = (state) => ({ ...state, notNow: count(state.notNow) + 1 });
export const afterNever = (state) => ({ ...state, never: true });
export const afterTaken = (state) => ({ ...state, taken: true });

/**
 * What the page shows: { show, never, titleIcon }. titleIcon: whether the
 * same thing's icon beside the title shows (hidden while the row offers it).
 */
export function offerView(state, opts = {}) {
  const show = offerShows(state, opts);
  return { show, never: show && offersNever(state), titleIcon: !show };
}

/**
 * One first-visit message at a time (5e rule 8): the first of the messages
 * that wants to show, in the page's order. Each is a key, or null when it
 * has nothing to say. Returns that key (or null).
 */
export function firstMessage(...wanted) {
  return wanted.find((k) => k != null && k !== false) ?? null;
}
