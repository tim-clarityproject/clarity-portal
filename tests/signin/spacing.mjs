// The spacing rule on every sign-in and account page (Tim, 19 Nov, 21:25;
// Phase 6a run 5), read from the page's own boxes:
//   title to its first line 12px; line to line 12px; text to a box, list
//   or button 24px; box to button 18px; button to link 18px; paragraphs at
//   1.55 line height.
// Each gap is from the bottom edge of one part to the top edge of the next,
// as the rule's own CSS sets them (M26 seq 7). Parts the rule doesn't name
// (a message, the tick box, the QR code, the key) are left out of it.
//
// Run in the page: page.evaluate(spacingRule, '.si-col')
export const RULE = { 'title>line': 12, 'line>line': 12, 'line>box': 24, 'line>list': 24, 'line>button': 24, 'box>button': 18, 'button>link': 18 };

export function spacingRule(root) {
  const want = { 'title>line': 12, 'line>line': 12, 'line>box': 24, 'line>list': 24, 'line>button': 24, 'box>button': 18, 'button>link': 18 };
  const col = document.querySelector(root);
  if (!col) return { gaps: [], lines: [] };
  const shown = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(el).position !== 'absolute'; };
  const kind = (el) => {
    if (el.matches('.si-ttl, .si-account-title')) return 'title';
    if (el.matches('.si-p')) return 'line';
    if (el.matches('.si-field')) return 'box';
    if (el.matches('.si-steps, .si-rc')) return 'list';
    if (el.matches('.si-btn, .si-bwrap, .ds-google')) return 'button';
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
