import { useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { friendlyError, needsConnection, isOffline } from '../../lib/friendlyError';
import { returnAddress, SIGN_IN_PATHS } from '../../lib/signIn/addresses';
import { rememberedEmail } from '../../lib/signIn/remembered';
import { DIDNT_SEND, TOO_MANY } from '../../lib/signIn/words';
import { Alt, Line, Message, SignInPage, TextLink } from '../../components/signin/SignInParts';

// Check your email (M26: "Check your email, new account" and "Check your
// email, reset"). `kind` is 'confirm' or 'reset'. A reset link works for
// 1 hour, and the page says so.
export default function CheckEmail({ kind }) {
  const location = useLocation();
  const email = location.state?.email || rememberedEmail();
  const [message, setMessage] = useState(null);
  const [sent, setSent] = useState(false);
  const busy = useRef(false);

  if (!email) return <Navigate to={kind === 'reset' ? SIGN_IN_PATHS.forgot : SIGN_IN_PATHS.signIn} replace />;

  const sendAgain = async () => {
    if (busy.current) return undefined;
    setMessage(null);
    setSent(false);
    if (isOffline()) return setMessage(needsConnection('Sending the link'));
    busy.current = true;
    try {
      const origin = window.location.origin;
      const { error } = await (kind === 'reset'
        ? supabase.auth.resetPasswordForEmail(email, { redirectTo: returnAddress('newPassword', origin) })
        : supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: returnAddress('confirmed', origin) } })
      ).catch((err) => ({ error: err }));
      if (!error) return setSent(true);
      if (error.status === 429 || /rate limit|too many|security purposes/i.test(error.message || '')) return setMessage(TOO_MANY);
      return setMessage(friendlyError(error, DIDNT_SEND.join(' '), 'Sending the link'));
    } finally {
      busy.current = false;
    }
  };

  return (
    <SignInPage title="Check your email" back>
      <Line>{kind === 'reset' ? 'We’ve sent a reset link to ' : 'We’ve sent a link to '}<strong>{email}</strong>.</Line>
      <Line>{kind === 'reset' ? 'The link works for 1 hour.' : 'Open it to finish creating your account.'}</Line>
      <Alt>
        Didn’t get it? <TextLink onClick={sendAgain}>Send it again</TextLink>
      </Alt>
      {sent ? (
        <div className="si-alt" role="status">
          <span className="ds-status ds-status--saved"><span className="ds-dot" aria-hidden="true" />Sent</span>
        </div>
      ) : null}
      <Message lines={message} />
    </SignInPage>
  );
}
