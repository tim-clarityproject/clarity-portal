// The coach's first name as people read it (Tim, 23 Oct; tidy follow-up 3):
// "Chat to Tim", never "Chat to Dr. Tim". A title saved before the name
// ("Dr. Tim", "Dr Tim") is left off; "Dr. Tim" is only ever written in the
// full name, "Dr. Tim Dutton".
export function plainFirstName(name) {
  if (typeof name !== 'string') return null;
  const plain = name.trim().replace(/^(?:dr|doctor|prof|professor)(?:\.\s*|\s+|$)/i, '').trim();
  return plain || null;
}
