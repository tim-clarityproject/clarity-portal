// The sign-in and account screens' opening lines (Polish 1, rules 12 and 22; example-pages-25nov.html).
// Most sign-in screens open with their title alone, as the example draws Sign in; a screen that needs
// a line says one thing in the portal's voice, a full sentence with no jargon. Kept here, one file, so
// Tim can read and approve them together. The words a rule fixes (errors, Check your email, the
// authenticator's screens) stay in src/lib/signIn/words.js and coachAuth.js.

export const SIGN_IN_LINES = Object.freeze({
  // Enter your code (the example's own line, replacing "Open your authenticator app for the 6-digit code.").
  code: 'From your authenticator app. It goes in by itself.',
  // My Account, Password.
  password: 'Type your current password, then the new one you’d like to use.',
  // My Account, Email.
  email: 'We’ll send a link to your current email and to the new one, and the change finishes once both are opened.',
  // My Account, Sign-in security (coaches only).
  security: 'Your authenticator app and your recovery codes keep the coach portal yours.',
});
