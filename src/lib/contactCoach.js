// Chat to the coach: a message link, not a chat inside the portal. It
// opens WhatsApp or iMessage with the coach's mobile and an opening
// message (src/content/coach.js).
//
// Which app is decided on the device, from its time zone, so nothing about
// the person is sent to an outside service (Phase 0c: the old version
// asked ipapi.co where they were):
// - America/ and Canada/ time zones open iMessage;
// - Europe/ and Africa/ time zones open WhatsApp;
// - anywhere else asks once, "WhatsApp or iMessage?", and the answer is
//   remembered on this device.

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

export function openChat(app, { mobile, message }) {
  const text = encodeURIComponent(message);
  const digits = mobile.replace(/[^\d+]/g, '');
  if (app === 'imessage') {
    window.location.href = `imessage://${digits}?text=${text}`;
  } else {
    window.open(`https://wa.me/${digits.replace(/^\+/, '')}?text=${text}`, '_blank', 'noopener');
  }
}
