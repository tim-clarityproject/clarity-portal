// The one possessive: "Sam’s", and after a final s only the apostrophe ("Tessaline Partners’", "James’"; the Stage D UI
// tester's polish 6). The coach portal's, the sign-in's and the agreement builder's possessive all come from here.
// Checked by tests/performance/possessive.test.mjs.

/** "Sam’s", "Tessaline Partners’". */
export function possessive(name) {
  const n = String(name ?? '').trim();
  return /s$/i.test(n) ? `${n}’` : `${n}’s`;
}
