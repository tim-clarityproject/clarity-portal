import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Choice, CoachContext, Popup } from '../design';
import coach, { openingMessage } from '../../content/coach';
import { chosenApp, openChat, rememberApp } from '../../lib/contactCoach';

// The client's coach for the whole app (CoachContext), and "Chat to
// [first name]": startChat() opens WhatsApp or iMessage, asking once,
// "WhatsApp or iMessage?", where the device's time zone doesn't say
// (src/lib/contactCoach.js). Used by the header's Chat button, My Account
// and the About page.
const StartChatContext = createContext(null);

const APPS = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'imessage', label: 'iMessage' },
];

export function useStartChat() {
  return useContext(StartChatContext);
}

export function CoachChatProvider({ children }) {
  const [asking, setAsking] = useState(false);

  const send = useCallback((app) => {
    openChat(app, { mobile: coach.mobile, message: openingMessage(coach.firstName) });
  }, []);

  const startChat = useCallback(() => {
    const app = chosenApp();
    if (app) send(app);
    else setAsking(true);
  }, [send]);

  const choose = (app) => {
    rememberApp(app);
    setAsking(false);
    send(app);
  };

  const value = useMemo(() => coach, []);

  return (
    <CoachContext.Provider value={value}>
      <StartChatContext.Provider value={startChat}>
        {children}
        <Popup open={asking} onClose={() => setAsking(false)} title="WhatsApp or iMessage?">
          <Choice label="Which app should open?" options={APPS} value={null} onChange={choose} form="rows" />
        </Popup>
      </StartChatContext.Provider>
    </CoachContext.Provider>
  );
}
