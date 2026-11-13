import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { SIGN_IN_PATHS } from '../../lib/signIn/addresses';
import { cameInByStranger, googleMatches, takeGoogleFrom, takeOffStrangers } from '../../lib/signIn/flow';
import { cancelledAtGoogle, useLinkSession } from '../../lib/signIn/linkSession';
import { recordAgreement, takeTick, tickAgreesFor } from '../../lib/signIn/terms';
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
//   - from a coach's invite, Google is joined to the invited account, so
//     no second account is ever made. If the Google account they picked
//     has another email, it is taken off again and they go back to the
//     invite's page, which says whose invite it is (Tim, 13 Nov).
export default function GoogleReturn() {
  const navigate = useNavigate();
  const enter = useEnter();
  const { status, user, landing, fromLink } = useLinkSession(window.location.pathname, { waitMs: 12000 });
  const handled = useRef(false);

  useEffect(() => {
    if (status === 'checking' || handled.current) return;
    handled.current = true;
    const from = takeGoogleFrom();
    const ticked = takeTick();
    // Google came back with a code that gave no sign-in, while someone was
    // already signed in here ("Use a different Google account"): it didn't
    // work, and the account that was here is never passed off as the new one.
    const missed = status === 'ready' && landing.hadCode && !fromLink;
    if (status !== 'ready' || missed) {
      // Opened with nothing to sign in with: just the page they'd use.
      if (status === 'none') return void navigate(SIGN_IN_PATHS.signIn, { replace: true });
      const quiet = status === 'expired' && cancelledAtGoogle(landing);
      // The Google account they picked already belongs to someone else's
      // portal account: for an invite, that is the wrong Google account.
      const taken = from === SIGN_IN_PATHS.invite && /identity_already_exists/.test(`${landing.errorCode} ${landing.error}`);
      if (taken) return void navigate(from, { replace: true, state: { wrongGoogle: true } });
      return void navigate(from, { replace: true, state: quiet ? undefined : { message: GOOGLE_DIDNT_WORK } });
    }
    (async () => {
      let account = user;
      if (from === SIGN_IN_PATHS.invite) {
        // Any Google account with another email is taken off again, one
        // left by an earlier try that couldn't be taken off included.
        await takeOffStrangers(supabase, account);
        if (!googleMatches(account)) return void navigate(from, { replace: true, state: { wrongGoogle: true } });
      } else if (cameInByStranger(account)) {
        // Signed in from any other page with a Google account that was
        // left joined to an unfinished invite: it is taken off, and they
        // are not let in as the person invited.
        await takeOffStrangers(supabase, account);
        try {
          await supabase.auth.signOut({ scope: 'local' });
        } catch { /* the portal stays shut either way: nothing is agreed */ }
        return void navigate(from, { replace: true, state: { message: GOOGLE_DIDNT_WORK } });
      }
      if (tickAgreesFor(ticked, from, account)) {
        const saved = await recordAgreement(supabase, account.id, ticked);
        // If saving missed, Before you start asks again: nobody gets in unrecorded.
        if (!saved.error && saved.user) account = saved.user;
      }
      enter(account);
    })();
  }, [status, user, landing, fromLink, navigate, enter]);

  return (
    <SignInPage>
      <Wait>Signing you in</Wait>
    </SignInPage>
  );
}
