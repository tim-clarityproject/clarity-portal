// Names (first and last) are kept to 60 characters in Edit profile and
// sign-up. Typing or pasting past the limit keeps the first 60 and shows
// a calm note instead of saving a name nobody could read in full.
export const NAME_MAX = 60;
export const NAME_TOO_LONG = 'Names can be up to 60 characters.';

export function limitName(text) {
  return text.length > NAME_MAX
    ? { value: text.slice(0, NAME_MAX), over: true }
    : { value: text, over: false };
}
