import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { Choice, CoachContext, Popup, useToast } from '../design';
import { openingMessage } from '../../content/coach';
import { chatWays, openChat, rememberApp } from '../../lib/contactCoach';
import { isNetworkError } from '../../lib/connection';
import { readCache, writeCache } from '../../lib/pageCache';
import { loadMyCoach } from '../../lib/performance/api';
import { StartChatContext } from './startChat';

// The client's own coach for the whole app (CoachContext), and "Chat to
// [first name]" (Phase 4, step 3). The coach comes from the person's own
// coach link (my_coach: coach_clients and coaches), kept on the device so
// it shows at once and offline. Someone without a coach gets null: no
// Chat button, no coach's name anywhere.
//
// startChat() opens the coach's one allowed way at once, or a small list
// when there are two (src/lib/contactCoach.js). It is null when the
// coach has no way the portal can open, so nothing offers a chat that
// can't start. A chat needs a connection: offline it says so calmly.
// Used by the header's Chat button, Home's help, My Account and About.
const APP_NAMES = { whatsapp: 'WhatsApp', imessage: 'iMessage' };
const CACHE = 'my-coach';
export const CHAT_OFFLINE = 'Chat needs a connection, so try again when you’re back online.';

function useMyCoach(userId) {
  // The answer is kept with the account it is for, so another account
  // signing in on this device never sees the last one's coach.
  const [found, setFound] = useState({ userId: null, coach: null });
  useEffect(() => {
    if (!userId) return undefined;
    let live = true;
    loadMyCoach().then((c) => {
      if (!live) return;
      writeCache(userId, CACHE, c);
      setFound({ userId, coach: c });
    }).catch((error) => {
      // Offline: the device's copy stays. Any other answer (no coach
      // list on this database yet) means no coach.
      if (!live || isNetworkError(error)) return;
      writeCache(userId, CACHE, null);
      setFound({ userId, coach: null });
    });
    return () => { live = false; };
  }, [userId]);
  if (!userId) return null;
  if (found.userId === userId) return found.coach;
  return readCache(userId, CACHE)?.v ?? null;
}

export function CoachChatProvider({ children }) {
  const { user } = useContext(AuthContext) || {};
  const toast = useToast();
  const coach = useMyCoach(user?.id);
  const [asking, setAsking] = useState(false);
  const ways = useMemo(() => chatWays(coach), [coach]);

  const send = useCallback((app) => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      toast.error(CHAT_OFFLINE);
      return;
    }
    openChat(app, { mobile: coach.mobile, message: openingMessage(coach.firstName) });
  }, [coach, toast]);

  const startChat = useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      toast.error(CHAT_OFFLINE);
      return;
    }
    if (ways.length === 1) send(ways[0]);
    else setAsking(true);
  }, [ways, send, toast]);

  const choose = (app) => {
    rememberApp(app);
    setAsking(false);
    send(app);
  };

  const value = useMemo(() => (coach?.firstName ? coach : null), [coach]);
  const canChat = Boolean(value) && ways.length > 0;

  return (
    <CoachContext.Provider value={value}>
      <StartChatContext.Provider value={canChat ? startChat : null}>
        {children}
        {canChat && ways.length > 1 && (
          <Popup open={asking} onClose={() => setAsking(false)} title={`Chat to ${value.firstName}`}>
            <Choice
              label="Which app should open?"
              options={ways.map((w) => ({ value: w, label: APP_NAMES[w] }))}
              value={null}
              onChange={choose}
              form="rows"
            />
          </Popup>
        )}
      </StartChatContext.Provider>
    </CoachContext.Provider>
  );
}
