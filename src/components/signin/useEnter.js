import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
