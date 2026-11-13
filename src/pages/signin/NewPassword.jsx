import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { friendlyError, needsConnection, isOffline } from '../../lib/friendlyError';
import { useToast } from '../../components/design';
import { SIGN_IN_PATHS } from '../../lib/signIn/addresses';
import { hasAuthenticator } from '../../lib/signIn/flow';
import { forgetLinkOpened, linkOpenedJustNow, noteLinkOpened, useLinkSession } from '../../lib/signIn/linkSession';
import { isLeaked, LEAKED, refusedAsLeaked, refusedAsShort, TOO_SHORT, tooShort } from '../../lib/signIn/password';
import { DIDNT_SAVE, refusedAsSame, SAME_PASSWORD } from '../../lib/signIn/words';
import { MainButton, Message, PasswordField, SignInPage, Wait } from '../../components/signin/SignInParts';
import useEnter from '../../components/signin/useEnter';
import CoachCode from './CoachCode';
import LinkNotWorking from './LinkNotWorking';

// A reset link that has just been opened in this tab, for this account:
// kept for the hour the link works, so a refresh still shows the page.
// Signed in or not, nobody reaches New password without a reset link of
// their own: a session that was already on the device never counts, and
// neither does an address made to look like a link (the functionality
// tester, 13 Nov).
const KEY = 'clarity-sign-in-reset';

// New password (M26: "Set a new password"), where a reset link lands, and
// Link not working when the link has run out or was used. Saving signs
// them straight in to Home, with "Saved".
export default function NewPassword() {
  const enter = useEnter();
  const toast = useToast();
  const { status, user, fromLink, kind } = useLinkSession(SIGN_IN_PATHS.newPassword);
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState(null);
  // An account with an authenticator app gives its code before the new
  // password can be saved (Supabase refuses it otherwise): null until
  // it's known whether the code has been given, then true or false.
  const [codeGiven, setCodeGiven] = useState(null);
  // 'saved' once the password is in; 'over' when the link's sign-in has ended.
  const [end, setEnd] = useState(null);
  const busy = useRef(false);
  const noted = useRef(false);

  const viaLink = status === 'ready' && fromLink && kind === 'recovery';
  const allowed = status === 'ready' && Boolean(user) && end !== 'over' && (viaLink || end === 'saved' || linkOpenedJustNow(KEY, user.id));
  const asksCode = allowed && hasAuthenticator(user);

  useEffect(() => {
    if (!asksCode) return undefined;
    let live = true;
    supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      .then(({ data }) => { if (live) setCodeGiven(data?.currentLevel === 'aal2'); })
      .catch(() => { if (live) setCodeGiven(false); });
    return () => { live = false; };
  }, [asksCode]);

  if (status === 'checking' || end === 'saved') {
    return <SignInPage><Wait>Signing you in</Wait></SignInPage>;
  }
  if (viaLink && !noted.current) {
    noted.current = true;
    noteLinkOpened(KEY, user.id);
  }
  if (!allowed) {
    return <LinkNotWorking />;
  }
  if (asksCode && codeGiven === null) {
    return <SignInPage><Wait>Signing you in</Wait></SignInPage>;
  }
  if (asksCode && !codeGiven) {
    return <CoachCode onDone={() => setCodeGiven(true)} />;
  }

  const submit = async (e) => {
    e.preventDefault();
    if (busy.current) return undefined;
    setMessage(null);
    if (tooShort(password)) return setMessage(TOO_SHORT);
    if (isOffline()) return setMessage(needsConnection('Saving a new password'));
    busy.current = true;
    try {
      if (await isLeaked(password)) return setMessage(LEAKED);
      const { data, error } = await supabase.auth.updateUser({ password }).catch((err) => ({ error: err }));
      if (error) {
        if (refusedAsLeaked(error)) return setMessage(LEAKED);
        if (refusedAsShort(error)) return setMessage(TOO_SHORT);
        if (refusedAsSame(error)) return setMessage(SAME_PASSWORD);
        // The code hasn't been given after all: ask for it.
        if (error.code === 'insufficient_aal' && hasAuthenticator(user)) return setCodeGiven(false);
        // The link's own sign-in has ended (it ran out, or was signed out
        // elsewhere): Link not working, which sends a new one.
        if (error.code === 'reauthentication_needed' || error.code === 'session_not_found' || error.status === 401 || error.status === 403) {
          forgetLinkOpened(KEY);
          return setEnd('over');
        }
        return setMessage(friendlyError(error, DIDNT_SAVE.join(' '), 'Saving a new password'));
      }
      forgetLinkOpened(KEY);
      setEnd('saved');
      toast.show('Saved');
      return enter(data?.user || user);
    } finally {
      busy.current = false;
    }
  };

  return (
    <SignInPage title="New password" onSubmit={submit}>
      <PasswordField autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
      <Message lines={message} />
      <MainButton>Save my new password</MainButton>
    </SignInPage>
  );
}
