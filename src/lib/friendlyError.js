// What people read when something goes wrong (writing rule 15, Tim's rule
// of 26 Oct): what happened, then what to do, in plain words. Raw
// technical text from the server or the browser ("Failed to fetch",
// "JWT expired") never reaches people; it goes to the console instead.
// A few answers the server gives on purpose are put into plain words;
// everything else gets the page's own message.
export function friendlyError(error, fallback) {
  if (error) console.error(error);
  const code = error?.code || '';
  const text = `${error?.message || ''}`;
  if (code === 'weak_password' || /password should (be|contain)/i.test(text)) {
    return 'That password is too easy to guess. Choose a longer one and try again.';
  }
  if (code === 'same_password' || /different from the old password/i.test(text)) {
    return 'That’s your current password. Choose a new one and try again.';
  }
  if (error?.status === 429 || /rate limit|too many/i.test(text)) {
    return 'That was tried too many times. Wait a minute and try again.';
  }
  if (code === 'email_address_invalid' || /invalid.*email|email.*invalid/i.test(text)) {
    return 'That email address doesn’t look right. Check it and try again.';
  }
  return fallback;
}
