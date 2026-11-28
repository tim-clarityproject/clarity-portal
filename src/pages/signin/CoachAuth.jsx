import { useContext, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { needsConnection, isOffline } from '../../lib/friendlyError';
import { SIGN_IN_PATHS } from '../../lib/signIn/addresses';
import { CODE_SIX_DIGITS, DIDNT_SIGN_IN, TOO_MANY } from '../../lib/signIn/words';
import {
  afterWrongCode, authenticatorAddress, CODE_DIDNT_WORK, CODES_DIDNT_MAKE, CODES_NOT_YET, CODES_REPLACED, codesFileName, codesFileText, codesForCopy,
  COACH_AUTH_PATHS, COACH_AUTH_WORDS, COPY_DIDNT_GO, enrolOptions, keepTries, keyInGroups, lostCodesLine, lowCodesLine, makeNewCodesLine,
  NO_WRONG_TRIES, plainKey, readTries, RECOVERY_DIDNT_WORK, SAVE_DIDNT_GO, SET_UP_DIDNT_START, SIGN_IN_DIDNT_GO,
  showRecoveryCode, TYPE_RECOVERY_CODE, usedCodeLine, waitSecondsLeft, waitWords,
} from '../../lib/signIn/coachAuth';
import { askServerRecovered, endOtherSignIns, loadCoachAuth, makeRecoveryCodes, markCodesSaved, noteAuthenticatorOn, spendRecoveryCode } from '../../lib/signIn/coachAuthData';
import { Alt, CodeField, CopyButton, Field, keepSixDigit, Line, MainButton, Message, QrCode, SignInPage, TextLink, TickRow, Wait } from '../../components/signin/SignInParts';
import { useToast } from '../../components/design';
import useEnter from '../../components/signin/useEnter';
import { goToStop } from '../../lib/signIn/flow';

// The coach authenticator's own sign-in screens (Phase 6a run 5; M26 seq 7,
// "Set up your authenticator" to "Signed in with a recovery code"; the
// run's prompt wins over M26). Supabase's own TOTP factor does the 6-digit
// codes; recovery codes and the owner's reset are ours (migration 053).
// Every word and rule is in src/lib/signIn/coachAuth.js; the data calls
// in coachAuthData.js. Clients never see any of this.
//
// SECRETS. The set-up key and its QR address come back from Supabase's own
// enrolment and live only in this page's memory: never logged, never kept
// on the device, never sent anywhere else. Recovery codes come back once
// from 053 and live only in this module's memory (`held`), never on the
// device and never in the history's state, so Back from set-up shows the
// same set again while the tab is open.

let held = null; // { userId, codes, madeAt, setId }
/** The plain codes for this account, held in memory only (with the set's id, so the tick names it). */
export function holdCodes(userId, codes, madeAt, setId = null) {
  held = { userId, codes, madeAt: madeAt || new Date().toISOString(), setId };
}
const heldFor = (userId) => (held && held.userId === userId ? held : null);
const letGo = () => { held = null; };

/**
 * A 6-digit code checked against the authenticator (challengeAndVerify),
 * with the wrong-codes wait. Answers null when it was right, otherwise the
 * message to show.
 */
export async function checkSixDigits(factorId, code, offlineWhat) {
  const digits = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(digits)) return CODE_SIX_DIGITS;
  const wait = waitSecondsLeft(readTries());
  if (wait) return waitWords(wait);
  if (isOffline()) return needsConnection(offlineWhat);
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: digits }).catch((err) => ({ error: err }));
  if (!error) {
    keepTries(NO_WRONG_TRIES);
    return null;
  }
  if (error.status === 429) return TOO_MANY;
  if (isOffline(error)) return needsConnection(offlineWhat);
  if (error.status && error.status >= 500) return DIDNT_SIGN_IN;
  const next = afterWrongCode(readTries());
  keepTries(next);
  return next.tries === 0 ? waitWords(waitSecondsLeft(next), { justNow: true }) : CODE_DIDNT_WORK;
}

/** True while the page is open (a result that lands after it closed is dropped, but never one that lands after a re-render). */
function useMounted() {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  return mounted;
}

/** Signed in (half in is enough: these screens are how a coach gets the rest of the way). */
function useSignedIn() {
  const { user, isLoading } = useContext(AuthContext);
  return { user, isLoading, out: !isLoading && !user };
}

/**
 * Whether the signed-in person is a coach: undefined while asking, then
 * true, false, or null when it can't be told (no connection). Clients never
 * see these screens: one opened by its address sends them Home, before
 * anything is enrolled or made (the functionality tester, 21 Nov).
 */
function useIsCoach(userId) {
  const [coach, setCoach] = useState({ userId: null, is: undefined });
  useEffect(() => {
    if (!userId) return undefined;
    let live = true;
    loadCoachAuth(supabase, { id: userId })
      .then((a) => { if (live) setCoach({ userId, is: a.isCoach }); })
      .catch(() => { if (live) setCoach({ userId, is: null }); });
    return () => { live = false; };
  }, [userId]);
  return coach.userId === userId ? coach.is : undefined;
}
const toHome = <Navigate to={SIGN_IN_PATHS.home} replace />;

/**
 * A counter that goes up when the connection comes back (and on `again()`),
 * while `waiting()` says the screen still needs what it couldn't fetch:
 * its effect asks again. { n, again }
 */
function useAgainWhenOnline(waiting) {
  const [n, setN] = useState(0);
  const wait = useRef(waiting);
  wait.current = waiting;
  useEffect(() => {
    const back = () => { if (wait.current()) setN((x) => x + 1); };
    window.addEventListener('online', back);
    return () => window.removeEventListener('online', back);
  }, []);
  return { n, again: () => setN((x) => x + 1) };
}

async function accessToken() {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- Set up your authenticator

/**
 * /coach/sign-in/set-up. `mode` (the history's state):
 *   undefined   the first set-up, after a reset, or after a recovery code;
 *   'newPhone'  from Sign-in security, after a current code: the old
 *               phone's factor is taken off once the new one is on;
 *   'again'     Back from Save your recovery codes: a fresh key, the old
 *               factor taken off, then the same codes again.
 */
export function CoachSetUp() {
  const { user, out } = useSignedIn();
  const location = useLocation();
  const navigate = useNavigate();
  const goIn = useEnter();
  const toast = useToast();
  const mode = location.state?.mode;
  const W = COACH_AUTH_WORDS.setUp;
  const [factor, setFactor] = useState(null); // { id, secret, uri }: memory only
  const [code, setCode] = useState('');
  const [message, setMessage] = useState(null);
  const [problem, setProblem] = useState(null);
  const busy = useRef(false);
  const started = useRef(null);
  const mounted = useMounted();
  const userId = user?.id || null;
  const coach = useIsCoach(userId);
  // Started again when the connection comes back (the break-it tester, 21 Nov:
  // a set-up opened offline stayed stuck on its line until a reload).
  const attempt = useAgainWhenOnline(() => started.current === null);

  useEffect(() => {
    if (!userId || coach === undefined || coach === false || started.current === userId) return;
    started.current = userId;
    const live = () => mounted.current;
    (async () => {
      if (isOffline()) { setProblem(needsConnection(COACH_AUTH_WORDS.offline.setUp)); started.current = null; return; }
      try {
        const [{ data: factors }, { data: level }] = await Promise.all([supabase.auth.mfa.listFactors(), supabase.auth.mfa.getAuthenticatorAssuranceLevel()]);
        const verified = (factors?.totp || []).filter((f) => f.status === 'verified');
        // Already on, and not asked for a new one: their code first, or on in.
        if (verified.length && !mode) {
          if (level?.currentLevel !== 'aal2') navigate(COACH_AUTH_PATHS.code, { replace: true });
          else goIn(user);
          return;
        }
        // A new phone needs this sign-in's own code first (Supabase asks for it too).
        if (verified.length && level?.currentLevel !== 'aal2') { navigate(COACH_AUTH_PATHS.code, { replace: true }); return; }
        // An earlier try left a factor that was never turned on: take it off, or Supabase may refuse a second.
        for (const f of (factors?.all || []).filter((x) => x.factor_type === 'totp' && x.status !== 'verified')) {
          await supabase.auth.mfa.unenroll({ factorId: f.id }).catch(() => null);
        }
        // Named "The Clarity Portal" in the authenticator app, whatever address this is.
        const { data, error } = await supabase.auth.mfa.enroll(enrolOptions());
        if (!live()) return;
        if (error || !data?.totp?.secret) {
          setProblem(isOffline(error) ? needsConnection(COACH_AUTH_WORDS.offline.setUp) : SET_UP_DIDNT_START);
          started.current = null;
          return;
        }
        setFactor({ id: data.id, secret: data.totp.secret, uri: authenticatorAddress(data.totp.uri, user?.email) });
      } catch (error) {
        if (live()) setProblem(isOffline(error) ? needsConnection(COACH_AUTH_WORDS.offline.setUp) : SET_UP_DIDNT_START);
        started.current = null;
      }
    })();
  }, [userId, coach, mode, navigate, goIn, user, mounted, attempt.n]);

  if (out) return <Navigate to={SIGN_IN_PATHS.coach} replace />;
  if (coach === false) return toHome;
  // Asking whether this is a coach: nothing of the screen shows until it's known.
  if (coach === undefined) return null;

  // `typed`: the six digits, when the sixth goes in by itself (polish 1, rule 23).
  const submit = async (e, typed) => {
    e?.preventDefault?.();
    if (busy.current) return undefined;
    setMessage(null);
    if (!factor) {
      // Back online: start again (a new key shows); still offline: the line again.
      if (!isOffline() && started.current === null) { setProblem(null); attempt.again(); return undefined; }
      return setMessage(problem || SET_UP_DIDNT_START);
    }
    busy.current = true;
    try {
      const wrong = await checkSixDigits(factor.id, typed ?? code, COACH_AUTH_WORDS.offline.setUp);
      if (wrong) { setCode(''); return setMessage(wrong); }
      // "On since": recorded by 053 (before it runs, Supabase's factor is enough).
      // A sign-in from before the owner's reset is let go (053 records nothing for it).
      const on = await noteAuthenticatorOn(supabase, factor.id);
      if (on.status === 'signed_out') { setFactor(null); return goToStop(supabase, navigate, 'signedOut'); }
      // A new phone, or set up again: the old phone's factor comes off now (this sign-in is at aal2).
      if (mode === 'newPhone' || mode === 'again') {
        const { data: factors } = await supabase.auth.mfa.listFactors().catch(() => ({ data: null }));
        for (const f of (factors?.totp || []).filter((x) => x.id !== factor.id)) {
          await supabase.auth.mfa.unenroll({ factorId: f.id }).catch(() => null);
        }
      }
      setFactor(null);
      if (mode === 'newPhone') return navigate(COACH_AUTH_PATHS.security, { replace: true, state: { said: 'newPhone' } });
      if (mode === 'again') return navigate(COACH_AUTH_PATHS.codes, { replace: true, state: location.state?.from ? { from: location.state.from } : undefined });
      return goIn(user);
    } finally {
      busy.current = false;
    }
  };

  const back = mode === 'newPhone' ? { to: COACH_AUTH_PATHS.security, children: COACH_AUTH_WORDS.security.back } : null;
  return (
    <SignInPage title={W.title} onSubmit={submit} back={back || false}>
      {W.lines.map((line) => <Line key={line}>{keepSixDigit(line)}</Line>)}
      <ol className="si-steps" data-align="start">
        <li>
          {W.stepApp}
          <ul className="si-apps">
            {W.apps.map((app) => (
              <li key={app.name}><a className="si-link" href={app.href} target="_blank" rel="noopener noreferrer">{app.name}</a></li>
            ))}
          </ul>
        </li>
        <li>{W.stepScan}</li>
      </ol>
      <QrCode value={factor?.uri || ''} label={W.qrLabel} />
      <div className="si-keyrow">
        <span>{W.cantScan}</span>
        <span className="si-kv">
          <strong className="si-key" data-key-shown>{factor ? keyInGroups(factor.secret) : ' '}</strong>
          <CopyButton
            label={W.copyKey}
            text={() => plainKey(factor?.secret || '')}
            onCopied={() => toast.show(COACH_AUTH_WORDS.copied)}
            onMissed={() => toast.show(COPY_DIDNT_GO)}
          />
        </span>
      </div>
      {problem && !message ? <Message lines={problem} /> : null}
      <CodeField label={W.label} value={code} onDigits={(d) => { setCode(d); if (d) setMessage(null); }} onComplete={(d) => submit(null, d)} wrong={Boolean(message)} autoFocus={false} />
      <Message lines={message} />
      <MainButton>{W.button}</MainButton>
    </SignInPage>
  );
}

// ---------------------------------------------------------------- Save your recovery codes

/**
 * /coach/sign-in/recovery-codes. 10 codes in two columns, the copy icon
 * and Download, then the tick box and "Open the coach portal", which
 * stays unavailable until the box is ticked (the prompt says so: the one
 * exception to "never greyed out"). Arriving with no codes in memory (a
 * reload, or the address typed) while the codes are owed makes a new set:
 * the old, unsaved set is replaced. Once a set is saved, arriving with none
 * in memory makes nothing and passes them on. Back returns to set-up. `from: 'security'`: made in My Account.
 */
export function CoachCodes() {
  const { user, out } = useSignedIn();
  const location = useLocation();
  const navigate = useNavigate();
  const goIn = useEnter();
  const toast = useToast();
  const W = COACH_AUTH_WORDS.codes;
  const fromSecurity = location.state?.from === 'security';
  const userId = user?.id || null;
  const [set, setSet] = useState(() => (userId ? heldFor(userId) : null));
  const [ticked, setTicked] = useState(false);
  const [message, setMessage] = useState(null);
  const [problem, setProblem] = useState(null);
  const asked = useRef(null);
  const busy = useRef(false);
  const mounted = useMounted();
  const coach = useIsCoach(userId);
  const attempt = useAgainWhenOnline(() => asked.current === null && !heldFor(userId));

  useEffect(() => {
    if (!userId || coach === undefined || coach === false) return;
    const kept = heldFor(userId);
    if (kept) { setSet(kept); return; }
    if (asked.current === userId) return;
    asked.current = userId;
    (async () => {
      if (isOffline()) { setProblem(needsConnection(COACH_AUTH_WORDS.offline.codes)); asked.current = null; return; }
      // Codes already saved, and none held here (Back from the coach portal,
      // or the address typed): nothing is owed, so nothing is made. Making a
      // set here would stop the saved codes working (the break-it tester,
      // 21 Nov). New codes come only from Sign-in security, which holds them first.
      const now = await loadCoachAuth(supabase, user);
      if (!mounted.current) return;
      // A sign-in from before the owner's reset is told so on Coach sign in,
      // never passed on in (the break-it tester, 22 Nov: it landed on Home).
      if (now.ready && now.sessionOk === false) { goToStop(supabase, navigate, 'signedOut'); return; }
      if (now.ready && now.codesSaved && now.codesTotal > 0) {
        if (fromSecurity) navigate(COACH_AUTH_PATHS.security, { replace: true });
        else goIn(user);
        return;
      }
      const made = await makeRecoveryCodes(supabase);
      if (made.status === 'made') holdCodes(userId, made.codes, made.madeAt, made.setId);
      if (!mounted.current) return;
      if (made.status === 'made') {
        setSet(heldFor(userId));
      } else if (made.status === 'needs_code') {
        navigate(COACH_AUTH_PATHS.code, { replace: true });
      } else if (made.status === 'signed_out') {
        goToStop(supabase, navigate, 'signedOut');
      } else if (made.status === 'not_yet') {
        // Before 053 no codes can be kept, so none are shown: on in.
        if (fromSecurity) navigate(COACH_AUTH_PATHS.security, { replace: true });
        else goIn(user);
      } else {
        setProblem(made.status === 'offline' ? needsConnection(COACH_AUTH_WORDS.offline.codes) : CODES_DIDNT_MAKE);
        asked.current = null;
      }
    })();
  }, [userId, coach, navigate, goIn, user, fromSecurity, mounted, attempt.n]);

  if (out) return <Navigate to={SIGN_IN_PATHS.coach} replace />;
  if (coach === false) return toHome;
  // Asking whether this is a coach: nothing of the screen shows until it's known.
  if (coach === undefined) return null;

  const download = () => {
    if (!set) return;
    const when = new Date(set.madeAt);
    const blob = new Blob([codesFileText(set.codes, when)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = codesFileName(when);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const open = async (e) => {
    e.preventDefault();
    if (!ticked || busy.current) return undefined;
    setMessage(null);
    if (!set) {
      if (!isOffline() && asked.current === null) { setProblem(null); attempt.again(); return undefined; }
      return setMessage(problem || CODES_DIDNT_MAKE);
    }
    if (isOffline()) return setMessage(needsConnection(COACH_AUTH_WORDS.offline.codes));
    busy.current = true;
    try {
      const saved = await markCodesSaved(supabase, set.setId);
      if (saved.status === 'offline') return setMessage(needsConnection(COACH_AUTH_WORDS.offline.codes));
      // Newer codes were made in another tab: these don't work, so they aren't the ones to keep.
      if (saved.status === 'replaced') { letGo(); return setMessage(CODES_REPLACED); }
      if (saved.status === 'signed_out') { letGo(); return goToStop(supabase, navigate, 'signedOut'); }
      if (saved.status !== 'saved' && saved.status !== 'not_yet') return setMessage(SAVE_DIDNT_GO);
      letGo();
      if (fromSecurity) return navigate(COACH_AUTH_PATHS.security, { replace: true, state: { said: 'codes' } });
      return goIn(user);
    } finally {
      busy.current = false;
    }
  };

  return (
    // Back returns to set-up during a first set-up (sign-in rule 24), and to Sign-in security after Make new codes there
    // (the Stage D break-it tester: it went to set-up, which offered a new phone instead).
    <SignInPage title={W.title} onSubmit={open} back={fromSecurity ? { to: COACH_AUTH_PATHS.security, state: { from: 'codes' }, children: W.back } : { to: COACH_AUTH_PATHS.setUp, state: { mode: 'again' }, children: W.back }}>
      {W.lines.map((line) => <Line key={line}>{keepSixDigit(line)}</Line>)}
      {set ? (
        <>
          {/* One list of ten, two to a row, read in order (as M26 draws them). */}
          <ol className="si-rc" data-align="start" aria-label={W.listLabel}>
            {set.codes.map((c) => showRecoveryCode(c)).map((c) => <li key={c}>{c}</li>)}
          </ol>
          <div className="si-rcact">
            <TextLink onClick={download}>{W.download}</TextLink>
            <CopyButton
              label={W.copyCodes}
              text={() => codesForCopy(set.codes)}
              onCopied={() => toast.show(COACH_AUTH_WORDS.copied)}
              onMissed={() => toast.show(COPY_DIDNT_GO)}
            />
          </div>
        </>
      ) : (problem ? <Message lines={problem} /> : <Wait>{' '}</Wait>)}
      <TickRow checked={ticked} onChange={setTicked} label={W.tickLabel}>{W.tick}</TickRow>
      <Message lines={message} />
      <MainButton disabled={!ticked} aria-disabled={!ticked}>{W.button}</MainButton>
    </SignInPage>
  );
}

// ---------------------------------------------------------------- Lost your authenticator app?

/**
 * /coach/sign-in/help (replaces the placeholder "Ask Tim to reset your
 * code."). A Recovery code box and Sign in; the line under it names the
 * owner from the data. Before 053 there are no codes: the line alone.
 */
export function CoachLost() {
  const { user, out } = useSignedIn();
  const navigate = useNavigate();
  const W = COACH_AUTH_WORDS.lost;
  const [auth, setAuth] = useState(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState(null);
  const busy = useRef(false);
  const userId = user?.id || null;

  useEffect(() => {
    if (!userId) return undefined;
    let live = true;
    loadCoachAuth(supabase, user).then((a) => { if (live) setAuth(a); });
    return () => { live = false; };
  }, [userId, user]);

  if (out) return <Navigate to={SIGN_IN_PATHS.coach} replace />;
  if (auth?.isCoach === false) return toHome;
  if (auth === null) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (busy.current) return undefined;
    setMessage(null);
    if (isOffline()) return setMessage(needsConnection(COACH_AUTH_WORDS.offline.lost));
    busy.current = true;
    try {
      const spent = await spendRecoveryCode(supabase, code);
      if (spent.status === 'type_it') return setMessage(TYPE_RECOVERY_CODE);
      if (spent.status === 'no_match') { setCode(''); return setMessage(RECOVERY_DIDNT_WORK); }
      if (spent.status === 'wait') { setCode(''); return setMessage(waitWords(spent.seconds, { justNow: spent.justNow })); }
      if (spent.status === 'not_yet') return setMessage(CODES_NOT_YET);
      if (spent.status === 'signed_out') return goToStop(supabase, navigate, 'signedOut');
      if (spent.status === 'offline') return setMessage(needsConnection(COACH_AUTH_WORDS.offline.lost));
      if (spent.status !== 'used') return setMessage(SIGN_IN_DIDNT_GO);
      // The lost phone's factor: 053 takes it off where the database can;
      // the live site's server takes off any still there. Then the account
      // is read again, so set-up sees no authenticator.
      const token = await accessToken();
      if (token) await askServerRecovered({ token }).catch(() => null);
      // The lost phone may be in someone else's hands: every other sign-in
      // ends (055 already refuses them coach data; Supabase's own sign out
      // of the others stops them refreshing), and this one carries on.
      const ended = await endOtherSignIns(supabase);
      await supabase.auth.refreshSession().catch(() => null);
      return navigate(COACH_AUTH_PATHS.in, { replace: true, state: { left: spent.left, othersEnded: spent.othersEnded || ended } });
    } finally {
      busy.current = false;
    }
  };

  const ready = auth?.ready === true;
  const line = lostCodesLine({ ownerFirstName: auth?.ownerFirstName, isOwner: auth?.isOwner });
  return (
    // With no codes yet it is the line alone, a short message page; with its box, a form (sign-in rule 49).
    <SignInPage title={W.title} onSubmit={submit} message={!ready} back={{ to: COACH_AUTH_PATHS.code, children: W.back }}>
      {auth === null ? <Wait>{' '}</Wait> : (
        <>
          {ready ? (
            <>
              <Line>{W.line}</Line>
              <Field label={W.label} name="recovery-code" autoComplete="one-time-code" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={code} onChange={(e) => setCode(e.target.value.slice(0, 40))} />
              <Message lines={message} />
              <MainButton>{W.button}</MainButton>
              <Alt>{line}</Alt>
            </>
          ) : (
            <>
              <Line>{line}</Line>
              {auth.isCoach === null ? <Message lines={needsConnection(COACH_AUTH_WORDS.offline.lost)} /> : null}
            </>
          )}
        </>
      )}
    </SignInPage>
  );
}

// ---------------------------------------------------------------- You're in

/**
 * /coach/sign-in/in. After a recovery code: "That recovery code is now
 * used. You have 9 left.", "Your other sign-ins have ended." (when they
 * were), then Set it up. After a sign-in with the
 * 6-digit code at 2 or fewer codes (once per sign-in): the low-codes line
 * and "Open the coach portal".
 */
/**
 * True when this sign-in has an authenticator but hasn't given its 6-digit
 * code yet (aal1 with aal2 next); undefined while asking. Not asked (false)
 * when `ask` is off.
 */
function useCodeOwed(userId, ask) {
  const [owed, setOwed] = useState(undefined);
  useEffect(() => {
    if (!ask || !userId) return undefined;
    let live = true;
    supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      .then(({ data }) => { if (live) setOwed(data?.nextLevel === 'aal2' && data?.currentLevel !== 'aal2'); })
      .catch(() => { if (live) setOwed(false); });
    return () => { live = false; };
  }, [userId, ask]);
  return ask ? owed : false;
}

export function CoachIn() {
  const { user, out } = useSignedIn();
  const location = useLocation();
  const navigate = useNavigate();
  const goIn = useEnter();
  const left = location.state?.left;
  const low = location.state?.low;
  const othersEnded = location.state?.othersEnded === true;
  const W = COACH_AUTH_WORDS.in;
  const coach = useIsCoach(user?.id || null);
  // Typed before the 6-digit code was given (Claude's answer to run 6's
  // question 4, tidy follow-up 3): straight on to Enter your code. A sign-in
  // that came here from a recovery code or the code itself carries its state.
  const arrived = Number.isFinite(left) || Number.isFinite(low);
  const codeOwed = useCodeOwed(user?.id || null, !arrived && coach === true);

  if (out) return <Navigate to={SIGN_IN_PATHS.coach} replace />;
  if (coach === false) return toHome;
  // Asking whether this is a coach: nothing of the screen shows until it's known.
  if (coach === undefined) return null;
  if (!arrived) {
    if (codeOwed === undefined) return null;
    if (codeOwed) return <Navigate to={COACH_AUTH_PATHS.code} replace />;
  }

  if (Number.isFinite(low)) {
    return (
      <SignInPage message title={COACH_AUTH_WORDS.low.title} onSubmit={(e) => { e.preventDefault(); goIn(user); }}>
        <Line>{lowCodesLine(low)}</Line>
        <MainButton>{COACH_AUTH_WORDS.low.button}</MainButton>
      </SignInPage>
    );
  }
  // Opened with nothing to say (a reload): on to whatever is owed.
  if (!Number.isFinite(left)) {
    return (
      <SignInPage message title={W.title} onSubmit={(e) => { e.preventDefault(); goIn(user); }}>
        <Line>{W.setUpLine}</Line>
        <MainButton>{W.button}</MainButton>
      </SignInPage>
    );
  }
  const more = makeNewCodesLine(left);
  return (
    // You're in is a short message page, centred throughout (sign-in rule 49).
    <SignInPage message title={W.title} onSubmit={(e) => { e.preventDefault(); navigate(COACH_AUTH_PATHS.setUp, { replace: true }); }}>
      <Line>{usedCodeLine(left)}</Line>
      {othersEnded ? <Line>{W.othersEnded}</Line> : null}
      <Line>{W.setUpLine}</Line>
      {more ? <Line>{more}</Line> : null}
      <MainButton>{W.button}</MainButton>
    </SignInPage>
  );
}
