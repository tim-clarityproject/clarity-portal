import { useNavigate } from 'react-router-dom';
import { SIGN_IN_PATHS } from '../../lib/signIn/addresses';
import { useLinkSession } from '../../lib/signIn/linkSession';
import { rememberedEmail } from '../../lib/signIn/remembered';
import { Line, MainButton, SignInPage, Wait } from '../../components/signin/SignInParts';
import useEnter from '../../components/signin/useEnter';
import LinkNotWorking from './LinkNotWorking';

// Email confirmed (M26): where the link in a new account's email lands.
// It ends with "Open my portal". A link opened on another device confirms
// the email there too, and Open my portal then asks them to sign in.
export default function EmailConfirmed() {
  const navigate = useNavigate();
  const enter = useEnter();
  const { status, user } = useLinkSession(window.location.pathname);

  if (status === 'checking') {
    return <SignInPage><Wait>Signing you in</Wait></SignInPage>;
  }
  if (status === 'expired') {
    // A new link is sent from Check your email when this tab still knows
    // the address, otherwise from Sign in (signing in offers it).
    const email = rememberedEmail();
    return <LinkNotWorking sendFrom={email ? SIGN_IN_PATHS.checkEmail : SIGN_IN_PATHS.signIn} state={email ? { email } : undefined} />;
  }
  if (status === 'none') {
    // Opened with no link at all: nothing to confirm.
    return <LinkNotWorking sendFrom={SIGN_IN_PATHS.signIn} />;
  }
  const firstName = (user?.user_metadata?.first_name || '').trim();
  return (
    <SignInPage title="Email confirmed">
      <Line>{firstName ? `Welcome to The Clarity Portal, ${firstName}.` : 'Welcome to The Clarity Portal.'}</Line>
      <MainButton type="button" onClick={() => (user ? enter(user) : navigate(SIGN_IN_PATHS.signIn))}>Open my portal</MainButton>
    </SignInPage>
  );
}
