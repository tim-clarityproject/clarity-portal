import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { SIGN_IN_PATHS } from '../../lib/signIn/addresses';
import { takeGoogleFrom } from '../../lib/signIn/flow';
import { cancelledAtGoogle, useLinkSession } from '../../lib/signIn/linkSession';
import { needsBeforeYouStart, recordAgreement, takeTick } from '../../lib/signIn/terms';
import { GOOGLE_DIDNT_WORK } from '../../lib/signIn/words';
import { SignInPage, Wait } from '../../components/signin/SignInParts';
import useEnter from '../../components/signin/useEnter';

// Signing you in (M26: "Signing in after Google"): where Google comes
// back to. Then:
//   - an account the portal knows goes on to where its link pointed,
//     otherwise Home (after its authenticator code, if it has one);
//   - a Google account the portal has never seen has agreed to nothing
//     yet. If the box was ticked on Create my account just before, that
//     agreement is saved now and they go on; otherwise Before you start;
//   - cancelled by the person: back to the page they came from, with no
//     message. Anything else that goes wrong: back there with "That
//     didn’t work. Try again, or use your email and password."
export default function GoogleReturn() {
  const navigate = useNavigate();
  const enter = useEnter();
  const { status, user, landing } = useLinkSession(window.location.pathname, { waitMs: 12000 });
  const handled = useRef(false);

  useEffect(() => {
    if (status === 'checking' || handled.current) return;
    handled.current = true;
    const from = takeGoogleFrom();
    const ticked = takeTick();
    if (status !== 'ready') {
      // Opened with nothing to sign in with: just the page they'd use.
      if (status === 'none') return void navigate(SIGN_IN_PATHS.signIn, { replace: true });
      const quiet = status === 'expired' && cancelledAtGoogle(landing);
      return void navigate(from, { replace: true, state: quiet ? undefined : { message: GOOGLE_DIDNT_WORK } });
    }
    (async () => {
      let account = user;
      if (ticked && needsBeforeYouStart(account)) {
        const saved = await recordAgreement(supabase, account.id, ticked);
        // If saving missed, Before you start asks again: nobody gets in unrecorded.
        if (!saved.error && saved.user) account = saved.user;
      }
      enter(account);
    })();
  }, [status, user, landing, navigate, enter]);

  return (
    <SignInPage>
      <Wait>Signing you in</Wait>
    </SignInPage>
  );
}
