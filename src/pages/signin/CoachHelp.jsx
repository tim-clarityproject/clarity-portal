import { SIGN_IN_PATHS } from '../../lib/signIn/addresses';
import { Line, SignInPage } from '../../components/signin/SignInParts';

// "Lost your authenticator app?" starts the recovery path, which is never
// email alone (Tim, 10 Nov, 23:24). Its screens aren't drawn yet, so this
// is a calm placeholder: Tim is the only coach at go-live.
export default function CoachHelp() {
  return (
    <SignInPage title="Reset your code" back={{ to: SIGN_IN_PATHS.coach }}>
      <Line>Ask Tim to reset your code.</Line>
    </SignInPage>
  );
}
