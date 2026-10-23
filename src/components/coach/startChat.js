import { createContext, useContext } from 'react';

// Shared by <CoachChatProvider> (CoachChat.jsx) and the parts that open
// a chat with the coach: useStartChat() returns startChat().
export const StartChatContext = createContext(null);

export function useStartChat() {
  return useContext(StartChatContext);
}
