// The email someone just typed, kept for this tab so Check your email
// still names it after a refresh, and Forgotten your password starts with
// it filled in. Nothing else is kept, and never a password.
const KEY = 'clarity-sign-in-email';

export function rememberEmail(email) {
  try {
    if (email) window.sessionStorage.setItem(KEY, String(email).trim());
  } catch { /* the page asks again */ }
}

export function rememberedEmail() {
  try {
    return window.sessionStorage.getItem(KEY) || '';
  } catch {
    return '';
  }
}

export function forgetEmail() {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch { /* nothing kept */ }
}
