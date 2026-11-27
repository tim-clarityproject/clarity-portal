import { useContext, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { needsConnection, isOffline } from '../../lib/friendlyError';
import { CODES_DIDNT_MAKE, CODES_NOT_YET, codesLeftSummary, COACH_AUTH_PATHS, COACH_AUTH_WORDS, onSinceLine } from '../../lib/signIn/coachAuth';
import { loadCoachAuth, makeRecoveryCodes } from '../../lib/signIn/coachAuthData';
import { CodeField, keepSixDigit, Line, MainButton, Message, Note, TextLink, Wait } from '../../components/signin/SignInParts';
import { checkSixDigits, holdCodes } from './CoachAuth';
import { goToStop } from '../../lib/signIn/flow';
import { useCoachRole } from '../../lib/coach/role';

// Sign-in security (Phase 6a run 5; M26 seq 7, "My Account,
// sign-in security"): coaches only. Authenticator app, "On since …", and
// Set up on a new phone; Recovery codes, "9 of 10 left", and Make new
// codes, with "Making new codes stops the old ones working." Both need a
// current 6-digit code first (the prompt), asked for here in place; 053
// refuses either without it too.
// The current-code step both links open in place (aria-controls, so what opens is found: rule 29aq).
const STEP_ID = 'si-current-code';

// Stage D, item 13 (Tim, 27 Nov): Sign-in security lives in the coach portal, Settings, Sign-in security
// (/coach/settings/sign-in-security, in the coach frame: CoachSignInSecurity below, drawn by Settings.jsx). The old
// My Account address forwards there for a coach, keeping what it was told (`said`), and to My Account for anyone else.
export default function SignInSecurity() {
  const location = useLocation();
  const { coach, loading } = useCoachRole();
  if (loading) return <div className="ui-root"><Wait>{' '}</Wait></div>;
  if (!coach) return <Navigate to="/my-account" replace />;
  return <Navigate to={`${COACH_AUTH_PATHS.security}${location.search}${location.hash}`} state={location.state} replace />;
}

/** Settings, Sign-in security in the coach portal: the authenticator, the recovery codes and Make new codes. */
export function CoachSignInSecurity() {
  const { user } = useContext(AuthContext);
  return <SecurityPage key={user?.id || 'nobody'} />;
}

function SecurityPage() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const W = COACH_AUTH_WORDS.security;
  const [auth, setAuth] = useState(null);
  const [asking, setAsking] = useState(null); // 'newPhone' | 'codes'
  const [code, setCode] = useState('');
  const [message, setMessage] = useState(null);
  const busy = useRef(false);
  const said = location.state?.said;

  useEffect(() => {
    if (!user) return undefined;
    let live = true;
    loadCoachAuth(supabase, user).then((a) => { if (live) setAuth(a); });
    return () => { live = false; };
  }, [user]);

  if (auth && auth.isCoach === false) return <Navigate to="/coach" replace />;

  const ask = (what) => {
    setMessage(null);
    setCode('');
    setAsking((now) => (now === what ? null : what));
  };

  // `typed`: the six digits, when the sixth goes in by itself (polish 1, rule 23).
  const carryOn = async (e, typed) => {
    e?.preventDefault?.();
    if (busy.current || !asking) return undefined;
    setMessage(null);
    if (!auth?.factor) return setMessage(needsConnection(COACH_AUTH_WORDS.offline.security));
    busy.current = true;
    try {
      const wrong = await checkSixDigits(auth.factor.id, typed ?? code, COACH_AUTH_WORDS.offline.security);
      if (wrong) { setCode(''); return setMessage(wrong); }
      if (asking === 'newPhone') return navigate(COACH_AUTH_PATHS.setUp, { state: { mode: 'newPhone' } });
      if (isOffline()) return setMessage(needsConnection(COACH_AUTH_WORDS.offline.security));
      const made = await makeRecoveryCodes(supabase);
      if (made.status === 'made') {
        holdCodes(user.id, made.codes, made.madeAt, made.setId);
        return navigate(COACH_AUTH_PATHS.codes, { state: { from: 'security' } });
      }
      if (made.status === 'signed_out') return goToStop(supabase, navigate, 'signedOut');
      if (made.status === 'not_yet') return setMessage(CODES_NOT_YET);
      if (made.status === 'offline') return setMessage(needsConnection(COACH_AUTH_WORDS.offline.security));
      return setMessage(CODES_DIDNT_MAKE);
    } finally {
      busy.current = false;
    }
  };

  const offline = auth && auth.isCoach === null;
  const body = (
    <>
      {auth === null ? <Wait>{' '}</Wait> : null}
      {offline ? <Line>{needsConnection(COACH_AUTH_WORDS.offline.security)}</Line> : null}
      {auth && !offline ? (
        <>
          <div className="si-srows">
            <div className="si-srow">
              <span className="si-sl">{W.app}<span>{auth.turnedOnAt ? onSinceLine(auth.turnedOnAt) : (auth.factor ? '' : W.notOnYet)}</span></span>
              {auth.factor ? <TextLink onClick={() => ask('newPhone')} aria-expanded={asking === 'newPhone'} aria-controls={STEP_ID}>{W.newPhone}</TextLink> : null}
            </div>
            <div className="si-srow">
              <span className="si-sl">{W.codes}<span>{auth.ready ? codesLeftSummary(auth.codesLeft, auth.codesTotal || undefined) : W.codesNotYet}</span></span>
              {auth.ready && auth.factor ? <TextLink onClick={() => ask('codes')} aria-expanded={asking === 'codes'} aria-controls={STEP_ID}>{W.makeNew}</TextLink> : null}
            </div>
          </div>
          {/* The note is about new codes: while the new phone's code step is open
              it would read as that step's (the UI tester, run 5). */}
          {asking === 'newPhone' ? null : <Line>{W.makeNewNote}</Line>}
          {said === 'newPhone' ? <Note>{W.newPhoneSaved}</Note> : null}
          {said === 'codes' ? <Note>{W.codesSaved}</Note> : null}
          {asking ? (
            <>
              <Line id={STEP_ID}>{keepSixDigit(W.currentCodeLine)}</Line>
              <CodeField label={COACH_AUTH_WORDS.code.label} value={code} onDigits={(d) => { setCode(d); if (d) setMessage(null); }} onComplete={(d) => carryOn(null, d)} wrong={Boolean(message)} describedBy={STEP_ID} />
              <Message lines={message} />
              <div className="si-bwrap"><MainButton>{W.currentCodeButton}</MainButton></div>
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
  // The section's own title and line are drawn by Settings (SIGN_IN_LINES.security); this is its form.
  return <form className="si-col si-col--account si-col--settings" onSubmit={carryOn} noValidate>{body}</form>;
}
