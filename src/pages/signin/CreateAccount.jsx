import { useContext, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { friendlyError, needsConnection, isOffline } from '../../lib/friendlyError';
import { returnAddress, SIGN_IN_PATHS } from '../../lib/signIn/addresses';
import { continueWithGoogle } from '../../lib/signIn/flow';
import { isLeaked, LEAKED, refusedAsLeaked, refusedAsShort, TOO_SHORT, tooShort } from '../../lib/signIn/password';
import { rememberEmail } from '../../lib/signIn/remembered';
import { rememberTick, termsRecord, TICK_THE_BOX } from '../../lib/signIn/terms';
import { ADD_FIRST_NAME, ALREADY_AN_ACCOUNT, EMAIL_NOT_RIGHT, GOOGLE_DIDNT_WORK, looksLikeEmail, TOO_MANY } from '../../lib/signIn/words';
import { Alt, ContinueWithGoogle, EmailField, Field, MainButton, Message, OrLine, PasswordField, SignInPage, TermsRow, TextLink } from '../../components/signin/SignInParts';
import useEnter from '../../components/signin/useEnter';

// Create my account (M26: "Create my account" and its three messages).
// One page: First name, Email, Password and the one tick box. Google
// sign-ups skip First name, because Google gives the name. Nothing is
// greyed out: pressing Create my account or Continue with Google without
// the tick says "Tick the box to carry on." beside the box. An email
// sign-up confirms its email before it gets in.
export default function CreateAccount() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const enter = useEnter();
  const [firstName, setFirstName] = useState('');
  // The Health Check's "Create your free account" link brings the email with it.
  const [email, setEmail] = useState(() => searchParams.get('email') || '');
  const [password, setPassword] = useState('');
  const [ticked, setTicked] = useState(false);
  // One message at a time, shown where M26 draws it: { at, lines }.
  const location = useLocation();
  const [message, setMessage] = useState(() => (location.state?.message ? { at: 'terms', lines: location.state.message } : null));
  const busy = useRef(false);
  const leaving = useRef(false);

  useEffect(() => {
    if (!user || leaving.current) return;
    leaving.current = true;
    enter(user);
  }, [user, enter]);

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
    if (!firstName.trim()) return say('name', ADD_FIRST_NAME);
    if (!looksLikeEmail(email)) return say('email', EMAIL_NOT_RIGHT);
    if (tooShort(password)) return say('password', TOO_SHORT);
    if (!ticked) return say('terms', TICK_THE_BOX);
    if (isOffline()) return say('terms', needsConnection('Creating an account'));
    busy.current = true;
    try {
      if (await isLeaked(password)) return say('password', LEAKED);
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: returnAddress('confirmed', window.location.origin),
          data: { first_name: firstName.trim(), ...termsRecord() },
        },
      }).catch((err) => ({ error: err }));
      if (error) {
        if (error.status === 422 && /already|registered|exists/i.test(error.message || '')) return say('email', ALREADY_AN_ACCOUNT);
        if (error.code === 'user_already_exists' || error.code === 'email_exists') return say('email', ALREADY_AN_ACCOUNT);
        if (refusedAsLeaked(error)) return say('password', LEAKED);
        if (refusedAsShort(error)) return say('password', TOO_SHORT);
        if (error.status === 429) return say('terms', TOO_MANY);
        if (error.code === 'email_address_invalid') return say('email', EMAIL_NOT_RIGHT);
        return say('terms', friendlyError(error, 'That didn’t create your account. Check your connection and try again.', 'Creating an account'));
      }
      // An email that already has an account: Supabase answers as if it
      // had worked, with an account that has no way to sign in.
      if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) return say('email', ALREADY_AN_ACCOUNT);
      rememberEmail(email);
      // With email confirmation switched off there is a session at once.
      if (data?.session?.user) {
        leaving.current = true;
        return enter(data.session.user);
      }
      return navigate(SIGN_IN_PATHS.checkEmail, { state: { email: email.trim() } });
    } finally {
      busy.current = false;
    }
  };

  const google = async () => {
    setMessage(null);
    if (!ticked) return say('terms', TICK_THE_BOX);
    if (isOffline()) return say('terms', needsConnection('Signing in'));
    rememberTick();
    const { error } = await continueWithGoogle(supabase, { from: SIGN_IN_PATHS.create }).catch((err) => ({ error: err }));
    if (error) say('terms', isOffline(error) ? needsConnection('Signing in') : GOOGLE_DIDNT_WORK);
    return undefined;
  };

  const at = (place) => (message?.at === place ? <Message lines={message.lines} /> : null);

  return (
    <SignInPage title="Create your account" onSubmit={submit}>
      <ContinueWithGoogle onClick={google} />
      <OrLine />
      <Field label="First name" type="text" name="given-name" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={80} />
      {at('name')}
      <EmailField value={email} onChange={(e) => setEmail(e.target.value)} />
      {at('email')}
      <PasswordField autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      {at('password')}
      <TermsRow checked={ticked} onChange={tick} />
      {at('terms')}
      <MainButton>Create my account</MainButton>
      <Alt>Already have an account? <TextLink to={SIGN_IN_PATHS.signIn}>Sign in</TextLink></Alt>
    </SignInPage>
  );
}
