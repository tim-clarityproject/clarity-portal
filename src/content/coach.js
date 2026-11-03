// Chat to the coach's opening message. The coach themselves (first name,
// mobile and allowed ways to be reached) comes from the person's own
// coach link since Phase 4, step 3 (my_coach, in CoachChatProvider), so
// no file or component contains a coach's name or number.

// The message a chat opens with.
export function openingMessage(firstName) {
  return `Hi ${firstName}, I’d like to chat with you.`;
}
