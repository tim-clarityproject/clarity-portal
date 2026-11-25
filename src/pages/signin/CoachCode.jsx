import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { needsConnection, isOffline } from '../../lib/friendlyError';
import { Navigate, useNavigate } from 'react-router-dom';
import { peekNext, rememberNext, SIGN_IN_PATHS } from '../../lib/signIn/addresses';
import { CODE_SIX_DIGITS, DIDNT_SIGN_IN, TOO_MANY } from '../../lib/signIn/words';
import {
  afterWrongCode, CODE_DIDNT_WORK, COACH_AUTH_PATHS, COACH_AUTH_WORDS, isCoachPlace, keepTries, lowCodesToldFor, noteLowCodesTold,
  NO_WRONG_TRIES, readTries, sessionKeyOf, shouldTellLowCodes, waitSecondsLeft, waitWords,
} from '../../lib/signIn/coachAuth';
import { loadCoachAuth } from '../../lib/signIn/coachAuthData';
import { Alt, CodeField, CodeMessage, keepSixDigit, Line, SignInPage, TextLink } from '../../components/signin/SignInParts';
import useEnter from '../../components/signin/useEnter';

const WORDS = COACH_AUTH_WORDS.code;

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
//
// Phase 6a run 5 (M26 seq 7): "You’re only asked on a new phone or
// computer." A wrong code says "That code didn’t work." and never which
// part was wrong; after 5 wrong codes in a row the next try waits 30
// seconds, said calmly (the count is kept on the device, so a reload or a
// new tab doesn't start it again; Supabase limits tries on its side too). After the code,
// a coach with 2 or fewer recovery codes left is told once, on You're in.
// The box reads "123 456", "123-456" and full-width digits as 123456
// (CodeField's digitsOf).

// Where to land after the code, when the tab has nowhere kept (the place
// to land lives in the tab, so a code given in a new tab has none): a coach
// lands in the coach portal, everyone else at Home (run 6, item 14).
async function headForCoachPortal(account) {
  if (peekNext()) return;
  try {
    const auth = await loadCoachAuth(supabase, account);
    if (auth.isCoach === true) rememberNext('/coach');
  } catch { /* Home, as before */ }
}

export default function CoachCode({ onDone }) {
  const { user, isLoading } = useContext(AuthContext);
  const navigate = useNavigate();
  const goIn = useEnter();
  const done = useRef(onDone);
  done.current = onDone;
  const enter = useCallback(async (account) => {
    if (done.current) return done.current(account);
    await headForCoachPortal(account);
    return goIn(account);
  }, [goIn]);
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

  // After the code: a coach heading into the coach portal with 2 or fewer
  // recovery codes left is told once for this sign-in (on You're in).
  const tellLowCodes = async () => {
    if (done.current || !isCoachPlace(peekNext())) return false;
    try {
      const auth = await loadCoachAuth(supabase, user);
      if (auth.isCoach !== true) return false;
      const { data } = await supabase.auth.getSession();
      const sessionKey = sessionKeyOf(data?.session?.access_token);
      if (!shouldTellLowCodes({ ready: auth.ready, made: auth.codesTotal > 0, left: auth.codesLeft, sessionKey, toldFor: lowCodesToldFor() })) return false;
      noteLowCodesTold(sessionKey);
      navigate(COACH_AUTH_PATHS.in, { replace: true, state: { low: auth.codesLeft } });
      return true;
    } catch {
      return false;
    }
  };

  // `typed`: the six digits, when the sixth goes in by itself (polish 1, rule 23).
  const submit = async (e, typed) => {
    e?.preventDefault?.();
    if (busy.current) return undefined;
    setMessage(null);
    // Any refusal empties the squares, so the next six digits go in by
    // themselves again (the same code included, after a wait).
    const refuse = (words) => { setCode(''); return setMessage(words); };
    const digits = String(typed ?? code).replace(/\s+/g, '');
    if (!/^\d{6}$/.test(digits)) return refuse(CODE_SIX_DIGITS);
    // 5 wrong codes in a row: a calm 30 seconds before the next try.
    const wait = waitSecondsLeft(readTries());
    if (wait) return refuse(waitWords(wait));
    if (isOffline()) return refuse(needsConnection(COACH_AUTH_WORDS.offline.code));
    busy.current = true;
    try {
      // Pressed before the page had found the authenticator: find it now.
      let id = factorId;
      if (!id) {
        const { data: factors } = await supabase.auth.mfa.listFactors().catch(() => ({ data: null }));
        id = (factors?.totp || []).find((f) => f.status === 'verified')?.id || null;
        if (!id) return refuse(DIDNT_SIGN_IN);
        setFactorId(id);
      }
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: id, code: digits }).catch((err) => ({ error: err }));
      if (error) {
        setCode('');
        if (error.status === 429) return setMessage(TOO_MANY);
        if (isOffline(error)) return setMessage(needsConnection(COACH_AUTH_WORDS.offline.code));
        if (error.status && error.status >= 500) return setMessage(DIDNT_SIGN_IN);
        const next = afterWrongCode(readTries());
        keepTries(next);
        return setMessage(next.tries === 0 ? waitWords(waitSecondsLeft(next), { justNow: true }) : CODE_DIDNT_WORK);
      }
      keepTries(NO_WRONG_TRIES);
      leaving.current = true;
      if (!done.current) await headForCoachPortal(user);
      if (await tellLowCodes()) return undefined;
      return enter(user);
    } finally {
      busy.current = false;
    }
  };

  return (
    <SignInPage title={WORDS.title} onSubmit={submit}>
      {WORDS.lines.map((line) => <Line key={line} small>{keepSixDigit(line)}</Line>)}
      <CodeField
        label={WORDS.label}
        value={code}
        onDigits={(d) => { setCode(d); if (d) setMessage(null); }}
        onComplete={(d) => submit(null, d)}
        wrong={Boolean(message)}
        describedBy="si-code-msg"
      />
      <CodeMessage id="si-code-msg" lines={message} />
      <Alt><TextLink to={SIGN_IN_PATHS.coachHelp}>{WORDS.lost}</TextLink></Alt>
    </SignInPage>
  );
}
