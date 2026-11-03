// Chat to the coach: a message link, not a chat inside the portal. It
// opens WhatsApp or iMessage with the coach's mobile and an opening
// message (openingMessage in src/content/coach.js).
//
// Which ways are offered comes from the coach's own record (Phase 4,
// step 3): coaches.contact_ways, through my_coach. Only the ways the
// portal can open are offered: WhatsApp and iMessage, each only with a
// mobile stored. 'email' isn't offered yet, because my_coach doesn't
// give the coach's email address. One way opens at once; two show a
// small list, the device's likely app first (from its time zone, so
// nothing about the person is sent to an outside service):
// - America/ and Canada/ time zones put iMessage first;
// - Europe/ and Africa/ time zones put WhatsApp first.

const CHOICE_KEY = 'clarity-chat-app';
export const CHAT_APPS = ['whatsapp', 'imessage'];

function timeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

// 'whatsapp', 'imessage', or null when the device's time zone doesn't say.
export function appForTimeZone(zone = timeZone()) {
  if (zone.startsWith('America/') || zone.startsWith('Canada/')) return 'imessage';
  if (zone.startsWith('Europe/') || zone.startsWith('Africa/')) return 'whatsapp';
  return null;
}

export function rememberedApp() {
  try {
    const saved = window.localStorage.getItem(CHOICE_KEY);
    return CHAT_APPS.includes(saved) ? saved : null;
  } catch {
    return null;
  }
}

export function rememberApp(app) {
  try {
    window.localStorage.setItem(CHOICE_KEY, app);
  } catch {
    // Storage blocked: it asks again next time.
  }
}

// The app to open now, or null if the person needs to be asked.
export function chosenApp() {
  return appForTimeZone() || rememberedApp();
}

const MOBILE = /^\+[0-9]{6,15}$/;

/** The ways this coach can be reached from here, likely app first. */
export function chatWays(coach) {
  if (!coach || !MOBILE.test(String(coach.mobile || '').replace(/[^\d+]/g, ''))) return [];
  const allowed = Array.isArray(coach.contactWays) ? coach.contactWays : [];
  const ways = CHAT_APPS.filter((app) => allowed.includes(app));
  const first = chosenApp();
  return first && ways.includes(first) ? [first, ...ways.filter((w) => w !== first)] : ways;
}

export function openChat(app, { mobile, message }) {
  const text = encodeURIComponent(message);
  const digits = mobile.replace(/[^\d+]/g, '');
  if (app === 'imessage') {
    window.location.href = `imessage://${digits}?text=${text}`;
  } else {
    window.open(`https://wa.me/${digits.replace(/^\+/, '')}?text=${text}`, '_blank', 'noopener');
  }
}
