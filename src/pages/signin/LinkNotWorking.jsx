import { useNavigate } from 'react-router-dom';
import { SIGN_IN_PATHS } from '../../lib/signIn/addresses';
import { askCoachAgain, LINK_RUN_OUT } from '../../lib/signIn/words';
import { Line, MainButton, SignInPage } from '../../components/signin/SignInParts';

// Link not working (M26: "Link expired or used"): an email link that has
// run out or has already been used. "Send a new link" goes to the page
// that sends one. A coach's set-up link (`coach`, follow-up 5) can only be
// sent again by the coach, so it says who to ask and has no button.
export default function LinkNotWorking({ sendFrom = SIGN_IN_PATHS.forgot, state, coach = null }) {
  const navigate = useNavigate();
  return (
    <SignInPage title="Link not working" back>
      <Line>{LINK_RUN_OUT}</Line>
      {coach != null ? <Line>{askCoachAgain(coach)}</Line>
        : <MainButton type="button" onClick={() => navigate(sendFrom, { state })}>Send a new link</MainButton>}
    </SignInPage>
  );
}
