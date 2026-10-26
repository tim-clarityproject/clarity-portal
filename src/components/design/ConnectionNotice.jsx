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
  const { waiting, failed } = useQueueState();
  const toast = useToast();
  const hadWaiting = useRef(false);
  const shownFailed = useRef(0);

  useEffect(() => onDraftRestored(() => toast.show('Draft restored')), [toast]);

  useEffect(() => {
    if (waiting > 0) {
      hadWaiting.current = true;
      return;
    }
    if (hadWaiting.current && online) {
      hadWaiting.current = false;
      // "Saved" only when nothing was refused on the way.
      if (failed <= shownFailed.current) toast.show('Saved');
    }
  }, [waiting, online, failed, toast]);

  useEffect(() => {
    if (failed > shownFailed.current) {
      toast.error('One change didn’t save. Open it again: your typing is still there, so save it once more.');
      // Told once; the page's own "didn't save" line has had its moment.
      setTimeout(dismissFailed, 8000);
    }
    shownFailed.current = failed;
  }, [failed, toast]);

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
