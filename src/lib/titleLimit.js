// Titles people type that become a PDF title (the meeting plan's title) are
// kept to 80 characters, so a PDF title always fits two lines. Typing or
// pasting past the limit keeps the first 80 and shows a calm note.
export const TITLE_MAX = 80;
export const TITLE_TOO_LONG = 'Titles can be up to 80 characters.';

export function limitTitle(text) {
  return text.length > TITLE_MAX
    ? { value: text.slice(0, TITLE_MAX), over: true }
    : { value: text, over: false };
}
