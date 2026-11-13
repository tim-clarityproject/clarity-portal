import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { friendlyError, needsConnection, isOffline } from '../../lib/friendlyError';
import { rememberNext, SIGN_IN_PATHS } from '../../lib/signIn/addresses';
import { continueWithGoogle } from '../../lib/signIn/flow';
import { rememberEmail } from '../../lib/signIn/remembered';
import { DIDNT_SIGN_IN, GOOGLE_DIDNT_WORK, NO_MATCH, TOO_MANY } from '../../lib/signIn/words';
import { Alt, ContinueWithGoogle, EmailField, MainButton, Message, OrLine, PasswordField, SignInPage, TextLink } from '../../components/signin/SignInParts';
import useEnter, { useAlreadyIn } from '../../components/signin/useEnter';

// Sign in (M26: "Sign in" and "Sign in, details don’t match"). Continue
// with Google sits above email. People always stay signed in on their own
// devices, so there is no "Remember me". After signing in they land where
// their link pointed, otherwise Home.
//
// `coach` makes it the coaches' own page (M26: "Coach sign in"), at its
// own address: the same boxes, its own title, and no Create my account
// link. The authenticator code follows either way (signInStop).
export default function SignIn({ coach = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const enter = useEnter();
  const here = coach ? SIGN_IN_PATHS.coach : SIGN_IN_PATHS.signIn;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState(location.state?.message || null);
  const leaving = useRef(false);
  const busy = useRef(false);

  // Where they were heading when they were asked to sign in.
  useEffect(() => {
    if (location.state?.returnTo) rememberNext(location.state.returnTo);
  }, []);

  // Already signed in (another tab, or coming back to this address): on they go.
  useAlreadyIn(leaving);

  const submit = async (e) => {
    e.preventDefault();
    setMessage(null);
    if (!email.trim() || !password) return setMessage(NO_MATCH);
    if (isOffline()) return setMessage(needsConnection('Signing in'));
    // One sign-in at a time: Enter twice, or a double click, asks once.
    if (busy.current) return undefined;
    busy.current = true;
    leaving.current = true;
    let result;
    try {
      result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    } catch (error) {
      result = { error };
    }
    const { data, error } = result;
    if (!error && data?.user) return enter(data.user);
    busy.current = false;
    leaving.current = false;
    // Supabase only says "not confirmed" when the password was right.
    if (error?.code === 'email_not_confirmed' || /email not confirmed/i.test(error?.message || '')) {
      rememberEmail(email);
      return navigate(SIGN_IN_PATHS.checkEmail, { state: { email: email.trim() } });
    }
    if (error?.status === 429) return setMessage(TOO_MANY);
    if (error?.status === 400 || error?.code === 'invalid_credentials' || /invalid login credentials/i.test(error?.message || '')) return setMessage(NO_MATCH);
    return setMessage(friendlyError(error, DIDNT_SIGN_IN.join(' '), 'Signing in'));
  };

  const google = async () => {
    setMessage(null);
    if (isOffline()) return setMessage(needsConnection('Signing in'));
    if (busy.current) return undefined;
    busy.current = true;
    const { error } = await continueWithGoogle(supabase, { from: here }).catch((err) => ({ error: err }));
    if (error) {
      busy.current = false;
      setMessage(isOffline(error) ? needsConnection('Signing in') : GOOGLE_DIDNT_WORK);
    }
    // On its way to Google the page stays as it is. The buttons work
    // again shortly, for someone who comes back with the browser's Back.
    else setTimeout(() => { busy.current = false; }, 3000);
    return undefined;
  };

  return (
    <SignInPage core={!coach} title={coach ? 'Coach sign in' : undefined} onSubmit={submit}>
      <ContinueWithGoogle onClick={google} />
      <OrLine />
      <EmailField value={email} onChange={(e) => setEmail(e.target.value)} />
      <PasswordField value={password} onChange={(e) => setPassword(e.target.value)} />
      <Message lines={message} />
      <MainButton>Sign in</MainButton>
      <Alt><TextLink to={SIGN_IN_PATHS.forgot} state={{ email: email.trim(), coach }}>Forgotten your password?</TextLink></Alt>
      {coach ? null : <Alt>New here? <TextLink to={SIGN_IN_PATHS.create}>Create my account</TextLink></Alt>}
    </SignInPage>
  );
}
