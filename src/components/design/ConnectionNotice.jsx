import { useEffect, useRef, useSyncExternalStore } from 'react';
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

// A flow that only the server can carry out (a change to a running agreement: nothing of it waits on the device) says
// so instead, never promising that it is kept and sent later (the Stage D break-it tester: an offline pause). A part
// marks itself with useNeedsServer(what) while it shows; the newest one's words are used.
let serverFlows = [];
const serverListeners = new Set();
const tellServerFlows = () => serverListeners.forEach((fn) => fn());
const subscribeServerFlows = (fn) => { serverListeners.add(fn); return () => serverListeners.delete(fn); };
const serverFlowWords = () => serverFlows.at(-1)?.words || null;
/** The offline notice's words while a server-only flow shows: "You’re offline. Changing an agreement needs a connection, …". */
export const offlineServerWords = (what) => `You’re offline. ${what} needs a connection, so try again when you’re back online.`;
/** Marks a part as needing the server while it shows; `what` names it ("Changing an agreement"). */
export function useNeedsServer(what) {
  useEffect(() => {
    const entry = { words: offlineServerWords(what) };
    serverFlows = [...serverFlows, entry];
    tellServerFlows();
    return () => { serverFlows = serverFlows.filter((x) => x !== entry); tellServerFlows(); };
  }, [what]);
}

export default function ConnectionNotice() {
  const online = useOnline();
  const { waiting, failed, quiet } = useQueueState();
  const serverOnly = useSyncExternalStore(subscribeServerFlows, serverFlowWords, serverFlowWords);
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
        <span>{online ? 'Sending your changes' : serverOnly || OFFLINE_WORDS}</span>
      </div>
    </div>,
    document.body,
  );
}
