// The client's coach, in one place (Phase 0c). Every client has the same
// coach until Phase 1 replaces this file with each client's own coach from
// their account. It is read through CoachContext (src/components/design/
// coachContext.js), so no component contains a name or a number.
//
// firstName: what clients see ("Chat to Tim"), never "Dr.".
// mobile:    the number WhatsApp and iMessage open, in international form.
const coach = {
  firstName: 'Tim',
  mobile: '+447792332439',
};

// The message a chat opens with.
export function openingMessage(firstName) {
  return `Hi ${firstName}, I’d like to chat with you.`;
}

export default coach;
