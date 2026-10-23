// The pill rule (Tim, 22 Oct; pills on phones, Tim, 23 Oct).
//
// Long or many options always use the branded drop-down: more than five,
// any with a grey second line, or any label too long to sit in a pill
// or a short row. That part is decided once, from the words, so the same
// choice always takes the same form on every device.
//
// Otherwise the choice is pills or full-width answer rows, decided by
// measuring the real space (useInlineForm.js), so a row of pills never
// wraps at any width or text size.
const MAX_INLINE = 5;
const LONG_PX = 200;
const OPTION_FONT = '16px "DM Sans", "Helvetica Neue", Arial, sans-serif';

let measureCanvas;
function textWidth(text) {
  measureCanvas ||= document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  if (!ctx) return text.length * 8;
  ctx.font = OPTION_FONT;
  return ctx.measureText(text).width;
}

export function needsDropdown(options) {
  if (options.length === 0 || options.length > MAX_INLINE) return true;
  return options.some((o) => o.hint || typeof o.label !== 'string' || textWidth(o.label) > LONG_PX);
}
