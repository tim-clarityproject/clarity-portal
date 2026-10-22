// The pill rule (Tim, 22 Oct): pills only when every option fits on one
// line on a phone, about four short words; otherwise a dropdown. The test
// is done at phone width on every device, so the same choice always looks
// the same. Widths follow the chip in design.css: 14px DM Sans text,
// 16px padding and a 1px border each side, 12px between chips, inside a
// 390px phone with 16px page margins.
const PHONE_CONTENT_WIDTH = 390 - 2 * 16;
const MAX_PILLS = 4;
const CHIP_EXTRA = 2 * 16 + 2 * 1;
const CHIP_GAP = 12;
const CHIP_FONT = '14px "DM Sans", "Helvetica Neue", Arial, sans-serif';

let measureCanvas;
function textWidth(text) {
  measureCanvas ||= document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  if (!ctx) return text.length * 8;
  ctx.font = CHIP_FONT;
  return ctx.measureText(text).width;
}

export function pillsFitOnPhone(labels) {
  if (labels.length === 0 || labels.length > MAX_PILLS) return false;
  const total = labels.reduce((sum, text) => sum + textWidth(text) + CHIP_EXTRA, 0)
    + CHIP_GAP * (labels.length - 1);
  return total <= PHONE_CONTENT_WIDTH;
}
