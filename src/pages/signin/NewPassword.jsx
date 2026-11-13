import { useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { friendlyError, needsConnection, isOffline } from '../../lib/friendlyError';
import { useToast } from '../../components/design';
import { SIGN_IN_PATHS } from '../../lib/signIn/addresses';
import { useLinkSession } from '../../lib/signIn/linkSession';
import { isLeaked, LEAKED, refusedAsLeaked, refusedAsShort, TOO_SHORT, tooShort } from '../../lib/signIn/password';
import { DIDNT_SAVE } from '../../lib/signIn/words';
import { MainButton, Message, PasswordField, SignInPage, Wait } from '../../components/signin/SignInParts';
import useEnter from '../../components/signin/useEnter';
import LinkNotWorking from './LinkNotWorking';

// A reset link that has just been opened in this tab: kept for the hour
// the link works, so a refresh still shows the page. Signed in or not,
// nobody reaches New password without a reset link.
const KEY = 'clarity-sign-in-reset';
const HOUR_MS = 60 * 60 * 1000;
const openedJustNow = () => {
  try {
    const at = Number(window.sessionStorage.getItem(KEY));
    return at > 0 && Date.now() - at >= 0 && Date.now() - at < HOUR_MS;
  } catch {
    return false;
  }
};
const noteOpened = () => {
  try {
    window.sessionStorage.setItem(KEY, String(Date.now()));
  } catch { /* a refresh then shows Link not working */ }
};
const forgetOpened = () => {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch { /* nothing kept */ }
};

// New password (M26: "Set a new password"), where a reset link lands, and
// Link not working when the link has run out or was used. Saving signs
// them straight in to Home, with "Saved".
export default function NewPassword() {
  const enter = useEnter();
  const toast = useToast();
  const { status, user, landing } = useLinkSession(SIGN_IN_PATHS.newPassword);
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState(null);
  const busy = useRef(false);
  const noted = useRef(false);

  if (status === 'checking') {
    return <SignInPage><Wait>Signing you in</Wait></SignInPage>;
  }
  if (status === 'ready' && landing.hadCode && !noted.current) {
    noted.current = true;
    noteOpened();
  }
  if (status !== 'ready' || !(landing.hadCode || openedJustNow())) {
    return <LinkNotWorking />;
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
        return setMessage(friendlyError(error, DIDNT_SAVE.join(' '), 'Saving a new password'));
      }
      forgetOpened();
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
