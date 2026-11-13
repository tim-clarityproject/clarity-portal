// The sign-in pages' messages, word for word from M26 where it draws them
// (Tim, 11 Nov). Each says what happened, then what to do, one per line.

export const NO_MATCH = ['That email or password doesn’t match.', 'Try again, or reset your password.'];
export const GOOGLE_DIDNT_WORK = ['That didn’t work.', 'Try again, or use your email and password.'];
export const ALREADY_AN_ACCOUNT = ['There’s already an account with this email.', 'Sign in, or reset your password.'];
export const LINK_RUN_OUT = 'This link has run out or has already been used.';

// Not drawn in M26 (Claude's wording, in the same pattern).
export const ADD_FIRST_NAME = 'Add your first name to carry on.';
export const ADD_EMAIL = 'Add your email to carry on.';
export const EMAIL_NOT_RIGHT = ['That email address doesn’t look right.', 'Check it and try again.'];
export const CODE_NO_MATCH = ['That code doesn’t match.', 'Check your authenticator app and try again.'];
export const CODE_SIX_DIGITS = 'Enter the 6 digits from your authenticator app.';
export const CURRENT_NO_MATCH = ['That isn’t your current password.', 'Try again, or reset your password.'];
export const SAME_EMAIL = ['That’s already your email.', 'Enter a different one to carry on.'];
export const DIDNT_SEND = ['That email didn’t send.', 'Check your connection and try again.'];
export const DIDNT_SAVE = ['That didn’t save.', 'Check your connection and try again.'];
export const DIDNT_SIGN_IN = ['That didn’t sign you in.', 'Check your connection and try again.'];
// The words friendlyError already gives for this, on two lines.
export const SAME_PASSWORD = ['That’s your current password.', 'Choose a new one and try again.'];
export const TOO_MANY = ['That was tried too many times.', 'Wait a minute and try again.'];

export const looksLikeEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

/** True when Supabase refused a new password because it is the one they have. */
export const refusedAsSame = (error) => error?.code === 'same_password' || /different from the old password/i.test(error?.message || '');
