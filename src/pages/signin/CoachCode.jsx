import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { needsConnection, isOffline } from '../../lib/friendlyError';
import { SIGN_IN_PATHS } from '../../lib/signIn/addresses';
import { CODE_NO_MATCH, CODE_SIX_DIGITS, DIDNT_SIGN_IN, TOO_MANY } from '../../lib/signIn/words';
import { Alt, Field, Line, MainButton, Message, SignInPage, TextLink } from '../../components/signin/SignInParts';
import useEnter from '../../components/signin/useEnter';

// Enter your code (M26: "Coach sign in, authenticator code"): after the
// password or Google, a coach gives the 6-digit code from their
// authenticator app (Supabase's own TOTP sign-in factor). Google never
// skips it. The box has no example code in it, and "6-digit" never
// splits across lines.
//
// `onDone` (New password): the code is asked for in the middle of another
// page, which carries on itself once it is given. An account with an
// authenticator can't save a new password before giving its code
// (Supabase refuses it), so a reset link alone never gets a coach in.
export default function CoachCode({ onDone }) {
  const { user, isLoading } = useContext(AuthContext);
  const goIn = useEnter();
  const done = useRef(onDone);
  done.current = onDone;
  const enter = useCallback((account) => (done.current ? done.current(account) : goIn(account)), [goIn]);
  const [factorId, setFactorId] = useState(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState(null);
  const busy = useRef(false);
  const leaving = useRef(false);

  // The account's authenticator. With none set up, or the code already
  // given, there is nothing to ask for: on they go.
  useEffect(() => {
    if (isLoading || !user || leaving.current) return undefined;
    let live = true;
    (async () => {
      let factor = null;
      let given = false;
      try {
        const [{ data: factors }, { data: level }] = await Promise.all([
          supabase.auth.mfa.listFactors(),
          supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        ]);
        factor = (factors?.totp || []).find((f) => f.status === 'verified') || null;
        given = level?.currentLevel === 'aal2';
      } catch { /* asked again on the next try */ }
      if (!live) return;
      if (!factor || given) {
        leaving.current = true;
        enter(user);
      } else {
        setFactorId(factor.id);
      }
    })();
    return () => { live = false; };
  }, [isLoading, user, enter]);

  if (!isLoading && !user) return <Navigate to={SIGN_IN_PATHS.coach} replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (busy.current) return undefined;
    setMessage(null);
    const digits = code.replace(/\s+/g, '');
    if (!/^\d{6}$/.test(digits)) return setMessage(CODE_SIX_DIGITS);
    if (isOffline()) return setMessage(needsConnection('Signing in'));
    busy.current = true;
    try {
      // Pressed before the page had found the authenticator: find it now.
      let id = factorId;
      if (!id) {
        const { data: factors } = await supabase.auth.mfa.listFactors().catch(() => ({ data: null }));
        id = (factors?.totp || []).find((f) => f.status === 'verified')?.id || null;
        if (!id) return setMessage(DIDNT_SIGN_IN);
        setFactorId(id);
      }
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: id, code: digits }).catch((err) => ({ error: err }));
      if (error) {
        setCode('');
        if (error.status === 429) return setMessage(TOO_MANY);
        if (isOffline(error)) return setMessage(needsConnection('Signing in'));
        if (error.status && error.status >= 500) return setMessage(DIDNT_SIGN_IN);
        return setMessage(CODE_NO_MATCH);
      }
      leaving.current = true;
      return enter(user);
    } finally {
      busy.current = false;
    }
  };

  return (
    <SignInPage title="Enter your code" onSubmit={submit}>
      <Line>Open your authenticator app for the <span className="si-nowrap">6-digit</span> code.</Line>
      <Field
        label="Code"
        name="one-time-code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        pattern="[0-9]*"
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D+/g, '').slice(0, 6))}
      />
      <Message lines={message} />
      <MainButton>Sign in</MainButton>
      <Alt><TextLink to={SIGN_IN_PATHS.coachHelp}>Lost your authenticator app?</TextLink></Alt>
    </SignInPage>
  );
}
