import { useContext, useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { friendlyError, needsConnection, isOffline } from '../../lib/friendlyError';
import { SIGN_IN_PATHS } from '../../lib/signIn/addresses';
import { continueWithGoogle } from '../../lib/signIn/flow';
import { needsBeforeYouStart, recordAgreement, TICK_THE_BOX } from '../../lib/signIn/terms';
import { DIDNT_SAVE, GOOGLE_DIDNT_WORK } from '../../lib/signIn/words';
import { Alt, Line, MainButton, Message, SignInPage, TermsRow, TextLink } from '../../components/signin/SignInParts';
import useEnter from '../../components/signin/useEnter';

// Before you start (M26: "New Google account, before Home"): someone who
// used Continue with Google from Sign in with a Google account the portal
// has never seen. "You’re signing in as …", the one tick box, Create my
// account, then Home. Their agreement is stored exactly as an email
// sign-up's is. Until the box is ticked the portal stays shut
// (ProtectedLayout sends them back here).
export default function BeforeYouStart() {
  const { user, isLoading } = useContext(AuthContext);
  const enter = useEnter();
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
    const { error } = await continueWithGoogle(supabase, { from: SIGN_IN_PATHS.beforeYouStart, chooseAccount: true }).catch((err) => ({ error: err }));
    if (error) setMessage(GOOGLE_DIDNT_WORK);
    return undefined;
  };

  return (
    <SignInPage title="Before you start" onSubmit={submit}>
      <Line>You’re signing in as <strong>{user.email}</strong>.</Line>
      <TermsRow checked={ticked} onChange={tick} />
      <Message lines={message} />
      <MainButton>Create my account</MainButton>
      <Alt><TextLink onClick={another}>Use a different Google account</TextLink></Alt>
    </SignInPage>
  );
}
