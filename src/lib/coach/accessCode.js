// An organisation's access code (Phase 6a run 2). The code is made in the
// browser, shown once, and never kept anywhere: only its hash is stored
// (migration 026's organisation_access_codes.code_hash: SHA-256, hex, as
// the table's own comment and check have it).
//
// The hash is of the code exactly as it is shown: 16 capital letters and
// digits with nothing between them. That is also what the database's other
// code checks read from a typed code, upper(btrim(code)), so the function
// that one day takes a typed organisation code checks it with
//   encode(extensions.digest(upper(btrim(p_code)), 'sha256'), 'hex') = code_hash
// (after taking out any spaces or dashes a person types between the groups).

/** No letters or digits that read as one another: no 0 or O, no 1, I or L. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 16;

/**
 * A new code: 16 characters, each chosen evenly from the alphabet with the
 * browser's own secure random numbers (a byte that would favour the first
 * letters is thrown away, never folded in).
 */
export function makeAccessCode(random = (bytes) => globalThis.crypto.getRandomValues(bytes)) {
  const n = CODE_ALPHABET.length;
  const fair = 256 - (256 % n);
  let code = '';
  while (code.length < CODE_LENGTH) {
    const bytes = random(new Uint8Array(CODE_LENGTH * 2));
    for (const b of bytes) {
      if (b < fair && code.length < CODE_LENGTH) code += CODE_ALPHABET[b % n];
    }
  }
  return code;
}

/** A code as a person might type it back: capitals, with no spaces or dashes. */
export const tidyAccessCode = (typed) => String(typed ?? '').toUpperCase().replace(/[\s-]+/g, '');

/** The code's SHA-256 as 64 hex characters: what the database keeps. */
export async function accessCodeHash(code) {
  const bytes = new globalThis.TextEncoder().encode(tidyAccessCode(code));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The code in groups of four, for reading aloud and for the eye; the code itself has nothing between them. */
export const codeGroups = (code) => String(code || '').match(/.{1,4}/g) || [];
