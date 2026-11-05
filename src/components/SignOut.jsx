import { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { queueState } from '../lib/syncQueue';
import { Button, IconText, Sheet } from './design';

// Sign out (Tim, 5 Nov, 11:02: "easier to log out from the menu ...
// classy"). A quiet "Sign out" at the very bottom of both menus, below a
// thin line, in the secondary text colour with the portal's own icon
// style, coral only on hover or focus like other text links; also in My
// Account. It signs out at once, with no "Are you sure?". Anything still
// waiting to sync is sent first; if it can't be sent (no signal), one
// line says "Some changes haven't synced yet." with "Sign out anyway" and
// "Wait", so nothing is lost without the person choosing it.

/** The sign-out flow: `start` signs out, `choice` is the "not synced" panel. */
export function useSignOut({ before } = {}) {
  const { logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const [unsynced, setUnsynced] = useState(false);
  const [busy, setBusy] = useState(false);

  const finish = (result) => {
    if (result?.signedOut) navigate('/');
  };

  const start = async () => {
    if (busy) return;
    before?.();
    // No signal and changes waiting: say so at once, rather than trying.
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (offline && queueState().waiting > 0) {
      setUnsynced(true);
      return;
    }
    setBusy(true);
    try {
      const result = await logout();
      if (result?.pending) setUnsynced(true);
      else finish(result);
    } finally {
      setBusy(false);
    }
  };

  const anyway = async () => {
    setUnsynced(false);
    finish(await logout({ force: true }));
  };

  const choice = (
    <Sheet open={unsynced} onClose={() => setUnsynced(false)} title="Sign out">
      <p className="ds-sheet-name">Some changes haven’t synced yet.</p>
      <div className="ds-signout-choice">
        <Button variant="outline" onClick={() => setUnsynced(false)}>Wait</Button>
        <Button variant="text" onClick={anyway}>Sign out anyway</Button>
      </div>
    </Sheet>
  );

  return { start, busy, choice };
}

/** The door: a 16px line icon in the one icon set's style (no arrow). */
export function SignOutIcon() {
  return (
    <svg className="ds-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M9 2.5H3.5A1.5 1.5 0 0 0 2 4V12A1.5 1.5 0 0 0 3.5 13.5H9" />
      <path d="M6.5 8H14" />
    </svg>
  );
}

/** "Sign out" as a quiet text link with its icon, for the menus and My Account. */
export function SignOutLink({ onSignOut, busy, tabIndex, className = '' }) {
  return (
    <IconText
      icon={<SignOutIcon />}
      onClick={onSignOut}
      aria-busy={busy || undefined}
      tabIndex={tabIndex}
      className={`ds-signout ${className}`.trim()}
    >
      Sign out
    </IconText>
  );
}
