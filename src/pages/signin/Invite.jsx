import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { friendlyError, needsConnection, isOffline } from '../../lib/friendlyError';
import { SIGN_IN_PATHS } from '../../lib/signIn/addresses';
import { continueWithGoogle } from '../../lib/signIn/flow';
import { useLinkSession } from '../../lib/signIn/linkSession';
import { isLeaked, LEAKED, refusedAsLeaked, refusedAsShort, TOO_SHORT, tooShort } from '../../lib/signIn/password';
import { rememberTick, termsRecord, TICK_THE_BOX } from '../../lib/signIn/terms';
import { DIDNT_SAVE, GOOGLE_DIDNT_WORK } from '../../lib/signIn/words';
import { ContinueWithGoogle, EmailField, Line, MainButton, Message, OrLine, PasswordField, SignInPage, TermsRow, Wait } from '../../components/signin/SignInParts';
import useEnter from '../../components/signin/useEnter';
import LinkNotWorking from './LinkNotWorking';

// Setting up from the coach's invite (M26: "Set up from your coach’s
// invite"). The coach has already added the first name, so there is no
// First name box: "Welcome, Sam", "Tim has set up your account." (the
// client's own coach), Continue with Google or a password, the one tick
// box, then Set my password and straight in to Home.
export default function Invite() {
  const enter = useEnter();
  const { status, user } = useLinkSession(SIGN_IN_PATHS.invite);
  const [names, setNames] = useState({ first: '', coach: '' });
  const [password, setPassword] = useState('');
  const [ticked, setTicked] = useState(false);
  const [message, setMessage] = useState(null);
  const busy = useRef(false);

  useEffect(() => {
    if (status !== 'ready' || !user) return undefined;
    let live = true;
    (async () => {
      let first = (user.user_metadata?.first_name || '').trim();
      let coach = '';
      try {
        if (!first) {
          const { data } = await supabase.from('profiles').select('first_name').eq('id', user.id).maybeSingle();
          first = (data?.first_name || '').trim();
        }
        const { data: mine } = await supabase.rpc('my_coach');
        const row = Array.isArray(mine) ? mine[0] : mine;
        coach = (row?.display_first_name || row?.first_name || '').trim();
      } catch { /* the page reads well without them */ }
      if (live) setNames({ first, coach });
    })();
    return () => { live = false; };
  }, [status, user]);

  if (status === 'checking') {
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
    if (!ticked) return say('terms', TICK_THE_BOX);
    if (isOffline()) return say('terms', needsConnection('Setting your password'));
    busy.current = true;
    try {
      if (await isLeaked(password)) return say('password', LEAKED);
      const { data, error } = await supabase.auth.updateUser({ password, data: termsRecord() }).catch((err) => ({ error: err }));
      if (error) {
        if (refusedAsLeaked(error)) return say('password', LEAKED);
        if (refusedAsShort(error)) return say('password', TOO_SHORT);
        return say('terms', friendlyError(error, DIDNT_SAVE.join(' '), 'Setting your password'));
      }
      try {
        await supabase.from('profiles').update({ terms_accepted: true }).eq('id', user.id);
      } catch { /* filled in on the next sign-in */ }
      return enter(data?.user || user);
    } finally {
      busy.current = false;
    }
  };

  const google = async () => {
    setMessage(null);
    if (!ticked) return say('terms', TICK_THE_BOX);
    if (isOffline()) return say('terms', needsConnection('Signing in'));
    rememberTick();
    const { error } = await continueWithGoogle(supabase, { from: SIGN_IN_PATHS.invite }).catch((err) => ({ error: err }));
    if (error) say('terms', isOffline(error) ? needsConnection('Signing in') : GOOGLE_DIDNT_WORK);
    return undefined;
  };

  const at = (place) => (message?.at === place ? <Message lines={message.lines} /> : null);

  return (
    <SignInPage title={names.first ? `Welcome, ${names.first}` : 'Welcome'} onSubmit={submit}>
      <Line>{names.coach ? `${names.coach} has set up your account.` : 'Your coach has set up your account.'}</Line>
      <ContinueWithGoogle onClick={google} />
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
