import { useCallback, useContext, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { sessionManager } from '../../lib/sessionManager';
import { takeNext } from '../../lib/signIn/addresses';
import { signInStop, stopPath } from '../../lib/signIn/flow';

/**
 * Lets someone in once they have proved who they are: first any stop
 * they still owe (the authenticator code, Before you start), then where
 * their link pointed, otherwise Home (Tim, 11 Nov).
 */
export default function useEnter() {
  const navigate = useNavigate();
  return useCallback(async (user, { state } = {}) => {
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) sessionManager.saveSessionMetadata(data.session);
    } catch { /* the session's own record is enough */ }
    const stop = await signInStop(supabase, user);
    const path = stopPath(stop);
    if (path) navigate(path, { replace: true });
    else navigate(takeNext(), { replace: true, state });
  }, [navigate]);
}

/**
 * Sign in and Create my account, opened by someone already signed in.
 *   - Someone fully in (another tab, or coming back to this address) is
 *     passed on to where they were heading.
 *   - Someone who signs in elsewhere while this page sits open is passed
 *     on too, through any stop they still owe.
 *   - Someone only half in when the page opened (held at Before you start,
 *     or at Enter your code) came here to start again, perhaps with
 *     another account: that half sign-in is let go on this device, so the
 *     page works. Otherwise they could never reach Sign in again.
 * @param {{ current: boolean }} leaving set by the page while its own sign-in is under way
 */
export function useAlreadyIn(leaving) {
  const { user, isLoading } = useContext(AuthContext);
  const enter = useEnter();
  // Who was signed in when the page opened: null until that is known.
  const opened = useRef(null);
  useEffect(() => {
    if (isLoading) return;
    if (opened.current === null) opened.current = user?.id || 'nobody';
    if (!user || leaving.current) return;
    leaving.current = true;
    (async () => {
      const halfIn = opened.current === user.id ? await signInStop(supabase, user) : null;
      if (!halfIn) return enter(user);
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch { /* the page still works: signing in replaces it */ }
      leaving.current = false;
      return undefined;
    })();
  }, [isLoading, user, enter, leaving]);
}
