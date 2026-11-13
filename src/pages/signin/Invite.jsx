import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { friendlyError, needsConnection, isOffline } from '../../lib/friendlyError';
import { SIGN_IN_PATHS } from '../../lib/signIn/addresses';
import { continueWithGoogle } from '../../lib/signIn/flow';
import { stillSignedInAs } from '../../lib/signIn/linkRules';
import { useLinkSession } from '../../lib/signIn/linkSession';
import { isLeaked, LEAKED, refusedAsLeaked, refusedAsLong, refusedAsShort, TOO_LONG, TOO_SHORT, tooLong, tooShort } from '../../lib/signIn/password';
import { invitedNotSetUp, termsRecord, TICK_THE_BOX } from '../../lib/signIn/terms';
import { DIDNT_SAVE, GOOGLE_DIDNT_WORK, inviteIsFor } from '../../lib/signIn/words';
import { ContinueWithGoogle, EmailField, Line, MainButton, Message, OrLine, PasswordField, SignInPage, TermsRow, Wait } from '../../components/signin/SignInParts';
import useEnter from '../../components/signin/useEnter';
import LinkNotWorking from './LinkNotWorking';

// Setting up from the coach's invite (M26: "Set up from your coach’s
// invite"). The coach has already added the first name, so there is no
// First name box: "Welcome, Sam", "Tim has set up your account." (the
// client's own coach), Continue with Google or a password, the one tick
// box, then Set my password and straight in to Home.
//
// The page sets a password without asking for the old one, so it is only
// ever shown to the account an invite link has just brought, or to one a
// coach set up that hasn't been finished yet. Anyone else who is signed
// in and opens this address is passed on in (the functionality tester,
// 13 Nov).
export default function Invite() {
  const enter = useEnter();
  const { status, user, fromLink, kind } = useLinkSession(SIGN_IN_PATHS.invite);
  // True once the device's sign-in is no longer the invited account's
  // (someone else signed in, in another tab, while this page sat open).
  const [over, setOver] = useState(false);
  const mine = status === 'ready' && Boolean(user) && !over && ((fromLink && kind === 'invite') || invitedNotSetUp(user));
  const leaving = useRef(false);
  const [names, setNames] = useState({ first: '', coach: '' });
  const [password, setPassword] = useState('');
  const [ticked, setTicked] = useState(false);
  const location = useLocation();
  // Back from Google: it didn't work (said by the box, as before), or the
  // Google account they picked isn't the invited one (said under the
  // Google button, with whose invite it is).
  const [message, setMessage] = useState(() => {
    if (location.state?.wrongGoogle) return { at: 'google', lines: null };
    return location.state?.message ? { at: 'terms', lines: location.state.message } : null;
  });
  const busy = useRef(false);

  useEffect(() => {
    if (status !== 'ready' || !user || mine || leaving.current) return;
    leaving.current = true;
    enter(user);
  }, [status, user, mine, enter]);

  useEffect(() => {
    if (!mine) return undefined;
    let live = true;
    (async () => {
      let first = (user.user_metadata?.first_name || '').trim();
      let coach = '';
      try {
        if (!first) {
          const { data } = await supabase.from('profiles').select('first_name').eq('id', user.id).maybeSingle();
          first = (data?.first_name || '').trim();
        }
        const { data: coaches } = await supabase.rpc('my_coach');
        const row = Array.isArray(coaches) ? coaches[0] : coaches;
        coach = (row?.display_first_name || row?.first_name || '').trim();
      } catch { /* the page reads well without them */ }
      if (live) setNames({ first, coach });
    })();
    return () => { live = false; };
  }, [mine, user]);

  if (status === 'checking' || (status === 'ready' && !mine)) {
    return <SignInPage><Wait>Signing you in</Wait></SignInPage>;
  }
  if (status !== 'ready') {
    // A new invite comes from the coach; a reset link sets a password too.
    return <LinkNotWorking />;
  }

  const say = (at, lines) => {
    setMessage({ at, lines });
    return undefined;
  };
  const tick = (next) => {
    setTicked(next);
    if (next && message?.at === 'terms') setMessage(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy.current) return undefined;
    setMessage(null);
    if (tooShort(password)) return say('password', TOO_SHORT);
    if (tooLong(password)) return say('password', TOO_LONG);
    if (!ticked) return say('terms', TICK_THE_BOX);
    if (isOffline()) return say('terms', needsConnection('Setting your password'));
    busy.current = true;
    try {
      if (await isLeaked(password)) return say('password', LEAKED);
      // A save goes to whoever is signed in on this device now: only ever
      // the account this page was opened for. Anyone else is passed on in.
      const now = await supabase.auth.getSession().catch(() => null);
      if (!stillSignedInAs(now?.data?.session, user.id)) return setOver(true);
      const { data, error } = await supabase.auth.updateUser({ password, data: termsRecord() }).catch((err) => ({ error: err }));
      if (error) {
        if (refusedAsLeaked(error)) return say('password', LEAKED);
        if (refusedAsShort(error)) return say('password', TOO_SHORT);
        if (refusedAsLong(error)) return say('password', TOO_LONG);
        return say('terms', friendlyError(error, DIDNT_SAVE.join(' '), 'Setting your password'));
      }
      try {
        await supabase.from('profiles').update({ terms_accepted: true }).eq('id', user.id);
      } catch { /* filled in on the next sign-in */ }
      leaving.current = true;
      return enter(data?.user || user);
    } finally {
      busy.current = false;
    }
  };

  const google = async () => {
    setMessage(null);
    if (!ticked) return say('terms', TICK_THE_BOX);
    if (isOffline()) return say('terms', needsConnection('Signing in'));
    if (busy.current) return undefined;
    busy.current = true;
    // Google is joined to the invited account, so no second account is made.
    const { error } = await continueWithGoogle(supabase, { from: SIGN_IN_PATHS.invite, ticked: true, joinTo: user.email }).catch((err) => ({ error: err }));
    if (error) {
      busy.current = false;
      say('terms', isOffline(error) ? needsConnection('Signing in') : GOOGLE_DIDNT_WORK);
    }
    // On its way to Google the page stays as it is. The buttons work
    // again shortly, for someone who comes back with the browser's Back.
    else setTimeout(() => { busy.current = false; }, 3000);
    return undefined;
  };

  const at = (place) => {
    if (message?.at !== place) return null;
    return <Message lines={place === 'google' ? inviteIsFor(user.email) : message.lines} />;
  };

  return (
    <SignInPage title={names.first ? `Welcome, ${names.first}` : 'Welcome'} onSubmit={submit}>
      <Line>{names.coach ? `${names.coach} has set up your account.` : 'Your coach has set up your account.'}</Line>
      <ContinueWithGoogle onClick={google} />
      {at('google')}
      <OrLine />
      <EmailField value={user?.email || ''} readOnly />
      <PasswordField autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      {at('password')}
      <TermsRow checked={ticked} onChange={tick} />
      {at('terms')}
      <MainButton>Set my password</MainButton>
    </SignInPage>
  );
}
