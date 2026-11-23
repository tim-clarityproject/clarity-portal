import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useOnline } from '../../lib/connection';
import { dismissFailed, useQueueState } from '../../lib/syncQueue';
import { onDraftRestored } from '../../lib/drafts';
import { useToast } from './toastContext';
import './design.css';

// The calm offline message (Tim, 26 Oct). It shows the moment the device
// goes offline and stays, quietly, until the connection is back. Saves
// and ticks made meanwhile wait on the device ("Will sync"); once they
// have all been sent, "Saved" shows. "Draft restored" shows when a page
// puts back typing from before a refresh.
export const OFFLINE_WORDS = 'You’re offline. What you do is kept on this device and sent when you’re back online.';

export default function ConnectionNotice() {
  const online = useOnline();
  const { waiting, failed, quiet } = useQueueState();
  const toast = useToast();
  const hadWaiting = useRef(false);
  const shownFailed = useRef(0);
  const seenQuiet = useRef(0);

  useEffect(() => onDraftRestored(() => toast.show('Draft restored')), [toast]);

  useEffect(() => {
    if (waiting > 0) {
      // How many quiet refusals there were when the sending began.
      if (!hadWaiting.current) seenQuiet.current = quiet;
      hadWaiting.current = true;
      return;
    }
    if (hadWaiting.current && online) {
      hadWaiting.current = false;
      // "Saved" only when nothing was refused on the way, not even a
      // refusal the page explains itself (an own question's stray row).
      if (failed <= shownFailed.current && quiet <= seenQuiet.current) toast.show('Saved');
    }
  }, [waiting, online, failed, quiet, toast]);

  useEffect(() => {
    if (failed > shownFailed.current) {
      toast.error('One change didn’t save. Open it again: your typing is still there, so save it once more.');
      // Told once; the page's own "didn't save" line has had its moment.
      setTimeout(dismissFailed, 8000);
    }
    shownFailed.current = failed;
  }, [failed, toast]);

  // A refusal its page explains (tidy follow-up 3, run 7's 5): no notice
  // here, and set aside the same way once its page has had its moment.
  useEffect(() => {
    if (quiet > 0) {
      const t = setTimeout(dismissFailed, 8000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [quiet]);

  if (online && waiting === 0) return null;
  return createPortal(
    <div className="ui-root ds-portal">
      <div className="ds-connection" role="status" aria-live="polite">
        <span className="ds-dot ds-dot--hollow" aria-hidden="true" />
        <span>{online ? 'Sending your changes' : OFFLINE_WORDS}</span>
      </div>
    </div>,
    document.body,
  );
}
