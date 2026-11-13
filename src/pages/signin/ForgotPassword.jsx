import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { friendlyError, needsConnection, isOffline } from '../../lib/friendlyError';
import { returnAddress, SIGN_IN_PATHS } from '../../lib/signIn/addresses';
import { rememberEmail, rememberedEmail } from '../../lib/signIn/remembered';
import { ADD_EMAIL, DIDNT_SEND, EMAIL_NOT_RIGHT, looksLikeEmail, TOO_MANY } from '../../lib/signIn/words';
import { EmailField, MainButton, Message, SignInPage } from '../../components/signin/SignInParts';

// Forgotten your password (M26): one box and "Email my reset link". The
// page never says whether an account exists for the address.
export default function ForgotPassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState(() => location.state?.email || rememberedEmail());
  const [message, setMessage] = useState(null);
  const busy = useRef(false);
  const back = location.state?.coach ? { to: SIGN_IN_PATHS.coach } : true;

  const submit = async (e) => {
    e.preventDefault();
    if (busy.current) return undefined;
    setMessage(null);
    if (!email.trim()) return setMessage(ADD_EMAIL);
    if (!looksLikeEmail(email)) return setMessage(EMAIL_NOT_RIGHT);
    if (isOffline()) return setMessage(needsConnection('Sending the link'));
    busy.current = true;
    try {
      const { error } = await supabase.auth
        .resetPasswordForEmail(email.trim(), { redirectTo: returnAddress('newPassword', window.location.origin) })
        .catch((err) => ({ error: err }));
      if (error) {
        if (error.status === 429 || /rate limit|too many|security purposes/i.test(error.message || '')) return setMessage(TOO_MANY);
        return setMessage(friendlyError(error, DIDNT_SEND.join(' '), 'Sending the link'));
      }
      rememberEmail(email);
      return navigate(SIGN_IN_PATHS.forgotSent, { state: { email: email.trim() } });
    } finally {
      busy.current = false;
    }
  };

  return (
    <SignInPage title="Reset your password" back={back} onSubmit={submit}>
      <EmailField value={email} onChange={(e) => setEmail(e.target.value)} />
      <Message lines={message} />
      <MainButton>Email my reset link</MainButton>
    </SignInPage>
  );
}
