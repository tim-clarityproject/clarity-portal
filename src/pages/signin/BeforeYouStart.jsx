import { useContext, useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { friendlyError, needsConnection, isOffline } from '../../lib/friendlyError';
import { SIGN_IN_PATHS } from '../../lib/signIn/addresses';
import { continueWithGoogle } from '../../lib/signIn/flow';
import { needsBeforeYouStart, recordAgreement, startedWithGoogle, TICK_THE_BOX } from '../../lib/signIn/terms';
import { DIDNT_SAVE, GOOGLE_DIDNT_WORK } from '../../lib/signIn/words';
import { Alt, Line, MainButton, Message, SignInPage, TermsRow, TextLink } from '../../components/signin/SignInParts';
import useEnter from '../../components/signin/useEnter';

// Before you start (M26: "New Google account, before Home"): someone who
// used Continue with Google from Sign in with a Google account the portal
// has never seen. "You’re signing in as …", the one tick box, Create my
// account, then Home. Their agreement is stored exactly as an email
// sign-up's is. Until the box is ticked the portal stays shut
// (ProtectedLayout sends them back here).
//
// An account a coach set up, whose owner came in another way than the
// invite's own page, gets it too (Tim, 13 Nov). A reset link shows it
// before New password: `onDone` then hands the agreed account back to
// that page, which carries on, where otherwise they go on in.
export default function BeforeYouStart({ onDone, account = null }) {
  const auth = useContext(AuthContext);
  // `account`: the one a link has just signed in, for the moment before
  // the rest of the portal has heard of it.
  const user = auth.user || account;
  const isLoading = auth.isLoading && !user;
  const goIn = useEnter();
  const enter = onDone || goIn;
  const [ticked, setTicked] = useState(false);
  const [message, setMessage] = useState(null);
  const busy = useRef(false);
  const leaving = useRef(false);

  // Nothing to agree to (already agreed, or not a new Google account): on they go.
  useEffect(() => {
    if (isLoading || !user || leaving.current || needsBeforeYouStart(user)) return;
    leaving.current = true;
    enter(user);
  }, [isLoading, user, enter]);

  if (!isLoading && !user) return <Navigate to={SIGN_IN_PATHS.signIn} replace />;
  if (isLoading || !user || !needsBeforeYouStart(user)) return <SignInPage />;

  const tick = (next) => {
    setTicked(next);
    if (next) setMessage(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy.current) return undefined;
    setMessage(null);
    if (!ticked) return setMessage(TICK_THE_BOX);
    if (isOffline()) return setMessage(needsConnection('Creating an account'));
    busy.current = true;
    try {
      const saved = await recordAgreement(supabase, user.id);
      if (saved.error || !saved.user) return setMessage(friendlyError(saved.error, DIDNT_SAVE.join(' '), 'Creating an account'));
      leaving.current = true;
      return enter(saved.user);
    } finally {
      busy.current = false;
    }
  };

  // They choose again on Google's own page. The account Google just made
  // stays as it is, agreed to nothing and shut out; coming back with
  // another account takes its place on this device.
  const another = async () => {
    setMessage(null);
    if (isOffline()) return setMessage(needsConnection('Signing in'));
    if (busy.current) return undefined;
    busy.current = true;
    const { error } = await continueWithGoogle(supabase, { from: SIGN_IN_PATHS.beforeYouStart, chooseAccount: true }).catch((err) => ({ error: err }));
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
    <SignInPage title="Before you start" onSubmit={submit}>
      <Line>You’re signing in as <strong>{user.email}</strong>.</Line>
      <TermsRow checked={ticked} onChange={tick} />
      <Message lines={message} />
      <MainButton>Create my account</MainButton>
      {startedWithGoogle(user) ? <Alt><TextLink onClick={another}>Use a different Google account</TextLink></Alt> : null}
    </SignInPage>
  );
}
