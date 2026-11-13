// The sign-in follow-up of 13 Nov (Tim, 14:05): the rules on their own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CLOCK_ALLOWED_MS, clockIsOut, deviceClockLooksWrong, serverTimeFrom } from '../../src/lib/signIn/clock.js';
import { SIGN_IN_PATHS } from '../../src/lib/signIn/addresses.js';
import { continueWithGoogle, googleIdentity, googleMatches, googleStrangers } from '../../src/lib/signIn/flow.js';
import { linkPage } from '../../src/lib/signIn/linkRules.js';
import { invitedNotSetUp, needsBeforeYouStart, termsRecord } from '../../src/lib/signIn/terms.js';
import { CLOCK_LOOKS_WRONG, inviteIsFor } from '../../src/lib/signIn/words.js';
import { safeHref, tokenLink } from '../../src/lib/email/template.js';

const headers = (map) => ({ get: (name) => map[name.toLowerCase()] ?? null });

test('email links are in the form that opens in any browser', () => {
  assert.equal(tokenLink('recovery'), '{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery');
  assert.equal(tokenLink('email'), '{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email');
  assert.equal(tokenLink('email_change'), '{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email_change');
  // Nobody's browser asked for an invite, so it lands on the site's own invite page.
  assert.equal(tokenLink('invite'), '{{ .SiteURL }}/auth/invite?token_hash={{ .TokenHash }}&type=invite');
  assert.throws(() => tokenLink('magiclink'));
  for (const type of ['recovery', 'email', 'email_change', 'invite']) assert.equal(safeHref(tokenLink(type)), tokenLink(type));
});

test('only those exact shapes are let through as a link', () => {
  for (const href of [
    '{{ .RedirectTo }}',
    '{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=magiclink',
    '{{ .RedirectTo }}?token_hash={{ .Token }}&type=recovery',
    '{{ .SiteURL }}/somewhere?token_hash={{ .TokenHash }}&type=invite',
    'javascript:{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery',
    '{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery&next=https://other.example',
    ' {{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery',
    '{{ .Data.link }}?token_hash={{ .TokenHash }}&type=recovery',
  ]) assert.throws(() => safeHref(href), /https address/, href);
});

test('the saved templates carry the any-browser link, and none carries the old one', () => {
  const kinds = { 'supabase-confirm-signup': 'email', 'supabase-reset-password': 'recovery', 'supabase-change-email': 'email_change', 'supabase-invite': 'invite' };
  for (const [name, type] of Object.entries(kinds)) {
    const text = readFileSync(`email-templates/${name}.txt`, 'utf8');
    const html = readFileSync(`email-templates/${name}.html`, 'utf8');
    assert.ok(text.includes(tokenLink(type)), `${name}.txt`);
    assert.ok(html.includes(`href="${tokenLink(type).replace('&', '&amp;')}"`), `${name}.html`);
    assert.ok(!text.includes('ConfirmationURL') && !html.includes('ConfirmationURL'), `${name} still has the old link`);
  }
});

test('the change-of-email email reads true for both of its readers', () => {
  const text = readFileSync('email-templates/supabase-change-email.txt', 'utf8');
  assert.ok(text.includes('We’ve sent a link to your current email and to your new one. Open both to finish.'));
  assert.ok(!/once you open this link/.test(text));
  assert.ok(!/\bfail/i.test(text));
});

test('a device clock more than 5 minutes out is said to look wrong', () => {
  const t = Date.parse('2026-11-13T14:00:00Z');
  assert.equal(CLOCK_ALLOWED_MS, 5 * 60 * 1000);
  assert.equal(clockIsOut(t, t), false);
  assert.equal(clockIsOut(t, t + 5 * 60 * 1000), false);
  assert.equal(clockIsOut(t, t + 5 * 60 * 1000 + 1), true);
  assert.equal(clockIsOut(t, t - 5 * 60 * 1000 - 1), true);
  assert.equal(clockIsOut(t, t + 2 * 60 * 60 * 1000), true);
  // No time to compare with: never a false alarm.
  assert.equal(clockIsOut(NaN, t), false);
  assert.equal(clockIsOut(t, NaN), false);
});

test('the server’s time lies between its Date and its Date plus Age', () => {
  const at = Date.parse('2026-11-13T14:00:00Z');
  assert.deepEqual(serverTimeFrom(headers({ date: 'Fri, 13 Nov 2026 14:00:00 GMT' })), { from: at, to: at });
  assert.deepEqual(serverTimeFrom(headers({ date: 'Fri, 13 Nov 2026 14:00:00 GMT', age: '90' })), { from: at, to: at + 90000 });
  assert.deepEqual(serverTimeFrom(headers({ date: 'Fri, 13 Nov 2026 14:00:00 GMT', age: 'soon' })), { from: at, to: at });
  assert.equal(serverTimeFrom(headers({})), null);
  assert.equal(serverTimeFrom(headers({ date: 'yesterday-ish' })), null);
  assert.equal(serverTimeFrom(null), null);
  assert.equal(clockIsOut(null, at), false);
});

test('a copy the edge has held for a while never makes a right clock look wrong', async () => {
  // As Vercel answers (the functionality tester, 13 Nov): Date is the time
  // now, and Age is how long its edge has held the file.
  const server = Date.parse('2026-11-13T14:00:00Z');
  const vercel = async () => ({ headers: headers({ date: new Date(server).toUTCString(), age: '667' }) });
  assert.equal(await deviceClockLooksWrong(vercel, () => server + 1000), false);
  assert.equal(await deviceClockLooksWrong(vercel, () => server + 2 * 60 * 60 * 1000), true);
  assert.equal(await deviceClockLooksWrong(vercel, () => server - 2 * 60 * 60 * 1000), true);
  // As the standard has it: Date is when the copy was made, 667 seconds ago.
  const standard = async () => ({ headers: headers({ date: new Date(server - 667000).toUTCString(), age: '667' }) });
  assert.equal(await deviceClockLooksWrong(standard, () => server + 1000), false);
  assert.equal(await deviceClockLooksWrong(standard, () => server + 2 * 60 * 60 * 1000), true);
  assert.equal(await deviceClockLooksWrong(standard, () => server - 2 * 60 * 60 * 1000), true);
});

test('each kind of link has the one page that finishes it', () => {
  assert.equal(linkPage('email', SIGN_IN_PATHS), '/auth/confirmed');
  assert.equal(linkPage('signup', SIGN_IN_PATHS), '/auth/confirmed');
  assert.equal(linkPage('recovery', SIGN_IN_PATHS), '/auth/reset-password');
  assert.equal(linkPage('invite', SIGN_IN_PATHS), '/auth/invite');
  assert.equal(linkPage('email_change', SIGN_IN_PATHS), '/my-account/email');
  for (const type of ['magiclink', '', null, undefined, 'recovery&x']) assert.equal(linkPage(type, SIGN_IN_PATHS), null);
});

test('the clock check reads a normal request, and says nothing when it can’t', async () => {
  const server = Date.parse('2026-11-13T14:00:00Z');
  const answer = async (url, options) => {
    assert.match(url, /^\/version\.json\?t=\d+$/);
    assert.equal(options.cache, 'no-store');
    return { headers: headers({ date: new Date(server).toUTCString() }) };
  };
  assert.equal(await deviceClockLooksWrong(answer, () => server + 1000), false);
  assert.equal(await deviceClockLooksWrong(answer, () => server + 2 * 60 * 60 * 1000), true);
  assert.equal(await deviceClockLooksWrong(answer, () => server - 6 * 60 * 1000), true);
  assert.equal(await deviceClockLooksWrong(async () => { throw new TypeError('offline'); }, () => server + 2 * 60 * 60 * 1000), false);
  assert.equal(await deviceClockLooksWrong(async () => ({ headers: headers({}) }), () => server + 2 * 60 * 60 * 1000), false);
});

test('the words are Tim’s, word for word', () => {
  assert.equal(CLOCK_LOOKS_WRONG, 'Your device’s clock looks wrong, which can sign you out. Set it to update automatically, then sign in again.');
  assert.equal(inviteIsFor('sam.carter@harbourlane.co'), 'This invite is for sam.carter@harbourlane.co. Continue with that Google account, or set a password.');
});

test('an invited account that hasn’t agreed gets Before you start, whichever way it comes in', () => {
  const invited = { id: 'u1', email: 'sam.carter@harbourlane.co', invited_at: '2026-11-10T09:00:00Z', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { first_name: 'Sam' } };
  assert.equal(invitedNotSetUp(invited), true);
  assert.equal(needsBeforeYouStart(invited), true);
  const agreed = { ...invited, user_metadata: { first_name: 'Sam', ...termsRecord(new Date('2026-11-13T14:00:00Z')) } };
  assert.equal(needsBeforeYouStart(agreed), false);
  // An email sign-up agreed when it was made, and is never asked again, even if its record is an older one.
  assert.equal(needsBeforeYouStart({ id: 'u2', app_metadata: { provider: 'email' }, user_metadata: {} }), false);
  assert.equal(needsBeforeYouStart(null), false);
});

test('Google on an invite is joined to the invited account, never signed in on its own', async () => {
  const asked = [];
  const supabase = { auth: {
    linkIdentity: async (o) => { asked.push(['join', o]); return { data: {}, error: null }; },
    signInWithOAuth: async (o) => { asked.push(['own', o]); return { data: {}, error: null }; },
  } };
  globalThis.window = { sessionStorage: { setItem() {}, removeItem() {}, getItem: () => null } };
  try {
    await continueWithGoogle(supabase, { from: '/auth/invite', ticked: true, joinTo: 'sam.carter@harbourlane.co', origin: 'https://portal.example.invalid' });
    await continueWithGoogle(supabase, { from: '/auth/login', origin: 'https://portal.example.invalid' });
  } finally {
    delete globalThis.window;
  }
  assert.equal(asked[0][0], 'join');
  assert.equal(asked[0][1].provider, 'google');
  assert.equal(asked[0][1].options.redirectTo, 'https://portal.example.invalid/auth/google');
  assert.equal(asked[0][1].options.queryParams.login_hint, 'sam.carter@harbourlane.co');
  assert.equal(asked[1][0], 'own');
});

test('the Google account that came back is the invited one only when the emails are the same', () => {
  const user = (googleEmail) => ({ email: 'sam.carter@harbourlane.co', identities: [{ provider: 'email', identity_data: { email: 'sam.carter@harbourlane.co' } }, ...(googleEmail ? [{ provider: 'google', identity_id: 'g1', identity_data: { email: googleEmail } }] : [])] });
  assert.equal(googleMatches(user('sam.carter@harbourlane.co')), true);
  assert.equal(googleMatches(user(' Sam.Carter@HarbourLane.co ')), true);
  assert.equal(googleMatches(user('sam.carter@gmail.com')), false);
  assert.equal(googleMatches(user('')), false);
  assert.equal(googleMatches(user(null)), false);
  assert.equal(googleMatches(null), false);
  assert.equal(googleIdentity(user('sam.carter@gmail.com')).identity_id, 'g1');
  assert.equal(googleIdentity(user(null)), null);
});

test('a wrong Google account left from an earlier try never hides the right one', () => {
  const google = (id, email) => ({ provider: 'google', identity_id: id, identity_data: { email } });
  const user = { email: 'sam.carter@harbourlane.co', identities: [{ provider: 'email', identity_data: { email: 'sam.carter@harbourlane.co' } }, google('g1', 'sam.carter@gmail.com'), google('g2', 'sam.carter@harbourlane.co')] };
  assert.equal(googleMatches(user), true);
  assert.deepEqual(googleStrangers(user).map((identity) => identity.identity_id), ['g1']);
  assert.deepEqual(googleStrangers({ ...user, identities: user.identities.slice(0, 2) }).map((identity) => identity.identity_id), ['g1']);
  assert.deepEqual(googleStrangers({ ...user, identities: [user.identities[0], user.identities[2]] }), []);
  assert.deepEqual(googleStrangers(null), []);
});
