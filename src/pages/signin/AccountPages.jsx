import { useContext, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import DesignHeader from '../../components/DesignHeader';
import { supabase } from '../../lib/supabase';
import { friendlyError, needsConnection, isOffline } from '../../lib/friendlyError';
import { checkCurrentPassword, hasPassword } from '../../lib/signIn/account';
import { returnAddress, SIGN_IN_PATHS } from '../../lib/signIn/addresses';
import { isLeaked, LEAKED, refusedAsLeaked, refusedAsShort, TOO_SHORT, tooShort } from '../../lib/signIn/password';
import { CURRENT_NO_MATCH, DIDNT_SAVE, DIDNT_SEND, EMAIL_NOT_RIGHT, looksLikeEmail, SAME_EMAIL, TOO_MANY } from '../../lib/signIn/words';
import { Alt, BackTo, EmailField, MainButton, Message, PasswordField, TextLink } from '../../components/signin/SignInParts';

// Inside My Account (M26): Password and Email, in the portal's own frame
// (the header, the Mission pill and the phone bar), with the same boxes,
// button, links and messages as the sign-in pages. Someone who signs in
// with Google has no Password page: My Account says "You sign in with
// Google." instead.

function AccountPage({ title, onSubmit, children }) {
  const Col = onSubmit ? 'form' : 'div';
  const formProps = onSubmit ? { onSubmit, noValidate: true } : {};
  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="plan-page ipp-page account-page">
        <Col className="si-col si-col--account" {...formProps}>
          <BackTo to="/my-account">My Account</BackTo>
          <h1 className="si-account-title">{title}</h1>
          {children}
        </Col>
      </div>
    </div>
  );
}

function Saved() {
  return (
    <span className="ds-status ds-status--saved" role="status">
      <span className="ds-dot" aria-hidden="true" />
      Saved
    </span>
  );
}

export function AccountPassword() {
  const { user } = useContext(AuthContext);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [message, setMessage] = useState(null);
  const [saved, setSaved] = useState(false);
  const busy = useRef(false);

  if (user && !hasPassword(user)) return <Navigate to="/my-account" replace />;

  const say = (at, lines) => {
    setMessage({ at, lines });
    return undefined;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy.current) return undefined;
    setMessage(null);
    setSaved(false);
    if (!current) return say('current', CURRENT_NO_MATCH);
    if (tooShort(next)) return say('next', TOO_SHORT);
    if (isOffline()) return say('next', needsConnection('Saving a new password'));
    busy.current = true;
    try {
      const check = await checkCurrentPassword(supabase, user.email, current);
      if (check === 'no') return say('current', CURRENT_NO_MATCH);
      if (check === 'error') return say('next', isOffline() ? needsConnection('Saving a new password') : DIDNT_SAVE);
      if (await isLeaked(next)) return say('next', LEAKED);
      const { error } = await supabase.auth.updateUser({ password: next }).catch((err) => ({ error: err }));
      if (error) {
        if (refusedAsLeaked(error)) return say('next', LEAKED);
        if (refusedAsShort(error)) return say('next', TOO_SHORT);
        return say('next', friendlyError(error, DIDNT_SAVE.join(' '), 'Saving a new password'));
      }
      // Saved: the boxes clear, so the page is ready as it began.
      setCurrent('');
      setNext('');
      return setSaved(true);
    } finally {
      busy.current = false;
    }
  };

  const at = (place) => (message?.at === place ? <Message lines={message.lines} /> : null);
  const typing = (set) => (e) => {
    set(e.target.value);
    if (saved) setSaved(false);
  };

  return (
    <AccountPage title="Password" onSubmit={submit}>
      <PasswordField label="Current password" autoComplete="current-password" value={current} onChange={typing(setCurrent)} />
      {at('current')}
      <PasswordField label="New password" autoComplete="new-password" value={next} onChange={typing(setNext)} />
      {at('next')}
      <div className="si-bwrap">
        <MainButton>Save my new password</MainButton>
        {saved ? <Saved /> : null}
      </div>
      <Alt><TextLink to={SIGN_IN_PATHS.forgot} state={{ email: user?.email || '' }}>Forgotten your password?</TextLink></Alt>
    </AccountPage>
  );
}

export function AccountEmail() {
  const { user } = useContext(AuthContext);
  const [email, setEmail] = useState(() => user?.email || '');
  // The new address waiting for its link to be opened. Supabase keeps it
  // on the account until then, so the page still says so after a refresh.
  const [sentTo, setSentTo] = useState(() => user?.new_email || '');
  const [message, setMessage] = useState(null);
  const [again, setAgain] = useState(false);
  const busy = useRef(false);

  if (user && !hasPassword(user)) return <Navigate to="/my-account" replace />;

  const send = async (address) => {
    const { error } = await supabase.auth
      .updateUser({ email: address }, { emailRedirectTo: returnAddress('emailChange', window.location.origin) })
      .catch((err) => ({ error: err }));
    return error || null;
  };

  const refused = (error) => {
    if (error.status === 429 || /rate limit|too many|security purposes/i.test(error.message || '')) return TOO_MANY;
    if (error.code === 'email_exists' || /already (been )?registered|already exists/i.test(error.message || '')) return ['There’s already an account with this email.', 'Enter a different one to carry on.'];
    return friendlyError(error, DIDNT_SEND.join(' '), 'Sending the link');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy.current) return undefined;
    setMessage(null);
    const address = email.trim();
    if (!looksLikeEmail(address)) return setMessage(EMAIL_NOT_RIGHT);
    if (address.toLowerCase() === (user?.email || '').toLowerCase()) return setMessage(SAME_EMAIL);
    if (isOffline()) return setMessage(needsConnection('Sending the link'));
    busy.current = true;
    try {
      const error = await send(address);
      if (error) return setMessage(refused(error));
      return setSentTo(address);
    } finally {
      busy.current = false;
    }
  };

  const sendAgain = async () => {
    if (busy.current) return undefined;
    setMessage(null);
    setAgain(false);
    if (isOffline()) return setMessage(needsConnection('Sending the link'));
    busy.current = true;
    try {
      const error = await send(sentTo);
      if (error) return setMessage(refused(error));
      return setAgain(true);
    } finally {
      busy.current = false;
    }
  };

  if (sentTo && sentTo.toLowerCase() !== (user?.email || '').toLowerCase()) {
    return (
      <AccountPage title="Email">
        <p className="si-p">We’ve sent a link to <strong>{sentTo}</strong>.</p>
        <p className="si-p">Your email changes once you open it.</p>
        <Alt>Didn’t get it? <TextLink onClick={sendAgain}>Send it again</TextLink></Alt>
        {again ? (
          <div className="si-alt" role="status">
            <span className="ds-status ds-status--saved"><span className="ds-dot" aria-hidden="true" />Sent</span>
          </div>
        ) : null}
        <Message lines={message} />
      </AccountPage>
    );
  }

  return (
    <AccountPage title="Email" onSubmit={submit}>
      <EmailField autoComplete="email" placeholder={undefined} value={email} onChange={(e) => setEmail(e.target.value)} />
      <Message lines={message} />
      <div className="si-bwrap">
        <MainButton>Save my new email</MainButton>
      </div>
    </AccountPage>
  );
}
