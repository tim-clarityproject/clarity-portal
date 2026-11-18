// What a mock-up drawn before 18 Nov 2026 looks like with the new buttons
// (Quiet precision; Tim, 18 Nov). The approved mock-ups draw Nekst capital
// pills, 44 to 50px high; every button is now 34px high on a laptop and
// 40px on a phone, its words DM Sans 14px, 14px in at each side. So a
// comparison expects exactly that of each button the mock-up draws:
//
//   - the button: the new height and text size; a button that hugs its
//     words (not one that fills its column) is its words' width plus 14px
//     each side (`wordsWidth`, measured in the new font);
//   - a part beside a button, on its row, stays centred on it, and one to
//     its right moves by the width the button gave back;
//   - a part below a button moves up by the height the button gave back.
//
// Every other part is still compared where and as the mock-up draws it.
//
//   withNewButtons(parts, { phone, isButton, fills, wordsWidth })
//     parts: [{ kind, text, top, left, width, height, size }] in page
//            order, measured from the mock-up (tops from one origin);
//     isButton(part): whether the part is a button (not a text link, not
//            the add row);
//     fills(part): whether the button fills its column (keeps its width);
//     wordsWidth(part): the button's words' width in the new font.
//   It returns a new list; the mock-up's own reading is left as it was.
// Follow-up 1 (Tim, 18 Nov, 15:57): 40px, 44px on a phone, 16px words, 16px sides.
export const BUTTON_H = 40;
export const BUTTON_H_PHONE = 44;
export const BUTTON_TEXT = 16;
export const BUTTON_SIDE = 16;

export function withNewButtons(parts, { phone, isButton, fills = () => true, wordsWidth = null }) {
  const want = phone ? BUTTON_H_PHONE : BUTTON_H;
  const out = parts.map((p) => ({ ...p }));
  const buttons = out.filter(isButton).map((b) => {
    const width = fills(b) || !wordsWidth ? b.width : wordsWidth(b) + 2 * BUTTON_SIDE;
    return { b, top: b.top, foot: b.top + b.height, left: b.left, right: b.left + b.width, by: b.height - want, narrower: b.width - width, width };
  });
  // Buttons side by side on one row give back their height once.
  const rows = [];
  for (const x of buttons) if (!rows.some((r) => Math.abs(r.top - x.top) < 1)) rows.push(x);
  const above = (top) => rows.filter((r) => r.foot <= top + 0.5).reduce((n, r) => n + r.by, 0);
  for (const p of out) {
    const own = buttons.find((x) => x.b === p);
    const beside = own ? null : buttons.find((x) => p.top < x.foot - 0.5 && p.top + p.height > x.top + 0.5);
    let top = p.top - above(p.top);
    let { left } = p;
    if (own) {
      p.height = want;
      p.size = BUTTON_TEXT;
      p.width = own.width;
    } else if (beside) {
      top -= beside.by / 2;
      if (p.left >= beside.right - 0.5) left -= beside.narrower;
    }
    // Further along the row, after a button that got narrower.
    if (own) for (const x of buttons) if (x !== own && Math.abs(x.top - own.top) < 1 && own.left >= x.right - 0.5) left -= x.narrower;
    p.top = top;
    p.left = left;
  }
  return out;
}

// Follow-up 1 (Tim, 18 Nov, 15:57): text inputs are 56px high, 52px on a phone (`--field-h`). A mock-up
// drawn before it has its own box height, so a comparison expects each box at the new height, a part
// below a box moved by the height it gave back, and a part inside a box's band (its Show) kept on its
// middle.
//   withNewFields(parts, { phone, isField }) returns a new list, as withNewButtons does.
export const FIELD_H = 56;
export const FIELD_H_PHONE = 52;

export function withNewFields(parts, { phone, isField }) {
  const want = phone ? FIELD_H_PHONE : FIELD_H;
  const out = parts.map((p) => ({ ...p }));
  const boxes = out.filter(isField).map((f) => ({ f, top: f.top, foot: f.top + f.height, by: f.height - want }));
  const rows = [];
  for (const x of boxes) if (!rows.some((r) => Math.abs(r.top - x.top) < 1)) rows.push(x);
  const above = (top) => rows.filter((r) => r.foot <= top + 0.5).reduce((n, r) => n + r.by, 0);
  for (const p of out) {
    const own = boxes.find((x) => x.f === p);
    const inBand = own ? null : rows.find((x) => p.top >= x.top - 0.5 && p.top + p.height <= x.foot + 0.5);
    let top = p.top - above(p.top);
    if (own) p.height = want;
    else if (inBand) top -= inBand.by / 2;
    p.top = top;
  }
  return out;
}
