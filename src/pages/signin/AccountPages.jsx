import { useContext, useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import DesignHeader from '../../components/DesignHeader';
import { supabase } from '../../lib/supabase';
import { friendlyError, needsConnection, isOffline } from '../../lib/friendlyError';
import { checkCurrentPassword, hasPassword } from '../../lib/signIn/account';
import { returnAddress, SIGN_IN_PATHS } from '../../lib/signIn/addresses';
import { landingFor } from '../../lib/signIn/linkSession';
import { codeWasSwapped } from '../../lib/signIn/linkRules';
import { isLeaked, LEAKED, refusedAsLeaked, refusedAsLong, refusedAsShort, TOO_LONG, TOO_SHORT, tooLong, tooShort } from '../../lib/signIn/password';
import { CURRENT_NO_MATCH, DIDNT_SAVE, DIDNT_SEND, EMAIL_NOT_RIGHT, looksLikeEmail, refusedAsSame, SAME_EMAIL, SAME_PASSWORD, TOO_MANY } from '../../lib/signIn/words';
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
    if (tooLong(next)) return say('next', TOO_LONG);
    if (next === current) return say('next', SAME_PASSWORD);
    if (isOffline()) return say('next', needsConnection('Saving a new password'));
    busy.current = true;
    try {
      const check = await checkCurrentPassword(supabase, user.email, current);
      if (check === 'no') return say('current', CURRENT_NO_MATCH);
      if (check === 'busy') return say('current', TOO_MANY);
      if (check === 'error') return say('next', isOffline() ? needsConnection('Saving a new password') : DIDNT_SAVE);
      if (await isLeaked(next)) return say('next', LEAKED);
      const { error } = await supabase.auth.updateUser({ password: next }).catch((err) => ({ error: err }));
      if (error) {
        if (refusedAsLeaked(error)) return say('next', LEAKED);
        if (refusedAsShort(error)) return say('next', TOO_SHORT);
        if (refusedAsLong(error)) return say('next', TOO_LONG);
        if (refusedAsSame(error)) return say('next', SAME_PASSWORD);
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

// The change-of-email link comes back to this page. When this visit is
// that link, and its code was taken, the new email has just taken over:
// said once, with "Saved".
let saidChanged = false;
function linkJustChangedIt() {
  if (saidChanged || !codeWasSwapped(landingFor(SIGN_IN_PATHS.accountEmail))) return false;
  saidChanged = true;
  return true;
}

export function AccountEmail() {
  const { user } = useContext(AuthContext);
  // The account as Supabase has it now. The copy on this device can be
  // behind: the link may have been opened on another device, or this very
  // visit may be the link coming back, so it is asked for once on opening.
  const [fresh, setFresh] = useState(null);
  const account = fresh && fresh.id === user?.id ? fresh : user;
  const [email, setEmail] = useState(() => user?.email || '');
  // The new address waiting for its link to be opened. Supabase keeps it
  // on the account until then, so the page still says so after a refresh.
  const [sentTo, setSentTo] = useState(() => user?.new_email || '');
  const [message, setMessage] = useState(null);
  const [again, setAgain] = useState(false);
  // "Saved" once the new email has taken over (its link was opened).
  const [changed, setChanged] = useState(() => linkJustChangedIt());
  const busy = useRef(false);
  const typed = useRef(false);
  // Once they have sent a link from this page, the page's own word stands.
  const acted = useRef(false);

  // When the newer copy differs, the page follows it: the new email in
  // the box once it has taken over, or still waiting for its link.
  const userId = user?.id;
  const userEmail = user?.email || '';
  useEffect(() => {
    let live = true;
    supabase.auth.getUser()
      .then(({ data }) => {
        const newer = data?.user;
        if (!live || !newer || newer.id !== userId) return;
        setFresh(newer);
        if (newer.email && newer.email.toLowerCase() !== userEmail.toLowerCase()) {
          if (!typed.current) setEmail(newer.email);
          if (!acted.current) setChanged(true);
        }
        if (!acted.current) setSentTo(newer.new_email || '');
      })
      .catch(() => null);
    return () => { live = false; };
  }, [userId, userEmail]);

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
    if (address.toLowerCase() === (account?.email || '').toLowerCase()) return setMessage(SAME_EMAIL);
    if (isOffline()) return setMessage(needsConnection('Sending the link'));
    busy.current = true;
    acted.current = true;
    setChanged(false);
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

  if (sentTo && sentTo.toLowerCase() !== (account?.email || '').toLowerCase()) {
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
      <EmailField autoComplete="email" placeholder={undefined} value={email} onChange={(e) => { typed.current = true; setChanged(false); setEmail(e.target.value); }} />
      <Message lines={message} />
      <div className="si-bwrap">
        <MainButton>Save my new email</MainButton>
        {changed ? <Saved /> : null}
      </div>
    </AccountPage>
  );
}
