import { useNavigate } from 'react-router-dom';
import { SIGN_IN_PATHS } from '../../lib/signIn/addresses';
import { LINK_RUN_OUT } from '../../lib/signIn/words';
import { Line, MainButton, SignInPage } from '../../components/signin/SignInParts';

// Link not working (M26: "Link expired or used"): an email link that has
// run out or has already been used. "Send a new link" goes to the page
// that sends one.
export default function LinkNotWorking({ sendFrom = SIGN_IN_PATHS.forgot, state }) {
  const navigate = useNavigate();
  return (
    <SignInPage title="Link not working" back>
      <Line>{LINK_RUN_OUT}</Line>
      <MainButton type="button" onClick={() => navigate(sendFrom, { state })}>Send a new link</MainButton>
    </SignInPage>
  );
}
