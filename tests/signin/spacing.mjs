// The spacing on every sign-in and account page, read from the page's own
// boxes. Since polish 1 (the 25 Nov reference and example pages, which win
// over the spacing rule of 19 Nov): the title to whatever follows it 32px
// (the column's 12px and the title's own 20px), and every other part to the
// next 12px (the column's one gap: lines, boxes, buttons, "or", links);
// paragraphs at 1.55 line height. (Tim's rule of 19 Nov was title to line
// 12px, line to line 12px, text to a box, list or button 24px, box to
// button 18px, button to link 18px.)
// Each gap is from the bottom edge of one part to the top edge of the next,
// as the rule's own CSS sets them (M26 seq 7). Parts the rule doesn't name
// (a message, the tick box, the QR code, the key) are left out of it.
//
// Run in the page: page.evaluate(spacingRule, '.si-col')
const KINDS = ['title', 'line', 'box', 'list', 'button', 'link', 'code'];
// The code squares to the link under them: 24px, the empty line for a wrong
// code's words holding its place between them (the example's own #code-err).
const gapFor = (a, b) => (a === 'title' ? 32 : (a === 'code' && b === 'link' ? 24 : 12));
/** Every pair the rule reads, and its gap. */
export const RULE = Object.fromEntries(KINDS.flatMap((a) => KINDS.filter((b) => b !== 'title').map((b) => [`${a}>${b}`, gapFor(a, b)])));

export function spacingRule(root) {
  const kinds = ['title', 'line', 'box', 'list', 'button', 'link', 'code'];
  const gapFor = (a, b) => (a === 'title' ? 32 : (a === 'code' && b === 'link' ? 24 : 12));
  const want = Object.fromEntries(kinds.flatMap((a) => kinds.filter((b) => b !== 'title').map((b) => [`${a}>${b}`, gapFor(a, b)])));
  const col = document.querySelector(root);
  if (!col) return { gaps: [], lines: [] };
  const shown = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(el).position !== 'absolute'; };
  const kind = (el) => {
    if (el.matches('.si-ttl, .si-account-title, .si-account-open')) return 'title';
    if (el.matches('.si-p')) return 'line';
    if (el.matches('.si-field')) return 'box';
    if (el.matches('.si-steps, .si-rc')) return 'list';
    if (el.matches('.si-code')) return 'code';
    if (el.matches('.si-btn, .si-bwrap, .si-google, .si-or')) return 'button';
    if (el.matches('.si-alt')) return 'link';
    return null;
  };
  const kids = [...col.children].filter(shown);
  const gaps = [];
  for (let i = 1; i < kids.length; i += 1) {
    const a = kind(kids[i - 1]);
    const b = kind(kids[i]);
    const key = `${a}>${b}`;
    if (!(key in want)) continue;
    const gap = +(kids[i].getBoundingClientRect().top - kids[i - 1].getBoundingClientRect().bottom).toFixed(2);
    gaps.push({ key, gap, want: want[key], ok: Math.abs(gap - want[key]) <= 0.5 });
  }
  const lines = [...col.querySelectorAll('.si-p, .si-alt')].filter(shown).map((el) => {
    const st = getComputedStyle(el);
    const ratio = +(parseFloat(st.lineHeight) / parseFloat(st.fontSize)).toFixed(3);
    return { ratio, ok: Math.abs(ratio - 1.55) <= 0.01 };
  });
  return { gaps, lines };
}

/** One line for a report: the gaps that are off, and any paragraph not at 1.55. */
export function ruleProblems(found) {
  const off = (found?.gaps || []).filter((g) => !g.ok).map((g) => `${g.key} ${g.gap}px (rule ${g.want}px)`);
  const loose = (found?.lines || []).filter((l) => !l.ok).map((l) => `line height ${l.ratio}`);
  return [...off, ...loose];
}
