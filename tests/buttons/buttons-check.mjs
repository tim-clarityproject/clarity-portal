// Every button in the new style (Quiet precision; Tim, 18 Nov 2026), read on
// the page as it is drawn. Run in the page: page.evaluate(buttonProblems,
// { phone, scale }). It gives one line per problem:
//
//   - the look: DM Sans, weight 500, sentence case (no capitals by CSS),
//     letter-spacing -0.005em, 8px corners, 14px in at each side, and at
//     the standard text size 14px words, 34px high (40px on a phone);
//   - the main button: flat coral with the faint top highlight; every
//     other button: no fill and a 1px hairline drawn as an inset shadow;
//   - no button's words wrap onto a second line or are cut off;
//   - at most one coral button on the screen's top layer (an open panel,
//     else the page);
//   - every add row: at least 48px high, its 18px square with the cross,
//     16px words (at the standard size), no box and no outline.
//
// The tap area (44px through the button's ::after) is the calm-rules
// suite's own check, as for every control.
export function buttonProblems({ phone, scale = 1 }) {
  const FAMILIES = '.ds-btn--primary, .ds-btn--outline, .ui-btn-primary, .ui-btn-ghost, .auth-btn-primary, .auth-btn-ghost, .dng, .si-btn, .ds-focus-done';
  const PRIMARY = '.ds-btn--primary, .ui-btn-primary, .auth-btn-primary, .si-btn';
  const vis = (el) => {
    const b = el.getBoundingClientRect();
    if (!(b.width > 0 && b.height > 0)) return false;
    if (el.closest('[hidden],[inert],[aria-hidden=true]')) return false;
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      const st = getComputedStyle(p);
      if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) < 0.05) return false;
    }
    return true;
  };
  const name = (el) => `"${(el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 32)}"`;
  const near = (a, b, tol = 0.6) => Math.abs(a - b) <= tol;
  const out = [];
  // The screen's top layer: an open panel or dialog, else the page.
  const top = [...document.querySelectorAll('[role=dialog], [aria-modal=true], .ds-guide--fullscreen')].filter(vis).pop() || document.body;
  const buttons = [...top.querySelectorAll(FAMILIES)].filter(vis);
  for (const el of buttons) {
    const cs = getComputedStyle(el);
    const b = el.getBoundingClientRect();
    const fs = parseFloat(cs.fontSize);
    const bad = [];
    if (!/^"?DM Sans/.test(cs.fontFamily)) bad.push(`font ${cs.fontFamily.split(',')[0]}`);
    if (cs.fontWeight !== '500') bad.push(`weight ${cs.fontWeight}`);
    if (cs.textTransform !== 'none') bad.push(`text-transform ${cs.textTransform}`);
    if (!near(parseFloat(cs.letterSpacing) || 0, -0.005 * fs, 0.05)) bad.push(`letter-spacing ${cs.letterSpacing}`);
    if (cs.borderTopLeftRadius !== '8px') bad.push(`corners ${cs.borderTopLeftRadius}`);
    if (cs.paddingLeft !== '14px' || cs.paddingRight !== '14px') bad.push(`sides ${cs.paddingLeft}/${cs.paddingRight}`);
    if (parseFloat(cs.borderTopWidth) > 0) bad.push(`a border of ${cs.borderTopWidth}`);
    // The words on one line: the text's own line boxes.
    const range = document.createRange();
    range.selectNodeContents(el);
    const tops = new Set([...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1).map((r) => Math.round(r.top + r.height / 2)));
    const lines = [...tops].sort((x, y) => x - y).reduce((n, t, i, all) => (i && t - all[i - 1] > fs * 0.6 ? n + 1 : n), tops.size ? 1 : 0);
    if (lines > 1) bad.push(`its words wrap onto ${lines} lines`);
    if (el.scrollWidth > el.clientWidth + 1 || range.getBoundingClientRect().right > b.right + 1 || range.getBoundingClientRect().left < b.left - 1) bad.push('its words are cut off');
    if (scale === 1) {
      if (!near(fs, 14)) bad.push(`words ${cs.fontSize}`);
      const want = phone ? 40 : 34;
      if (lines <= 1 && !near(b.height, want, 0.6)) bad.push(`${Math.round(b.height * 10) / 10}px high, not ${want}`);
    }
    const filled = el.matches(PRIMARY);
    if (filled) {
      if (!/inset/.test(cs.boxShadow) || !/rgba\(255, 255, 255, 0\.28\)/.test(cs.boxShadow)) bad.push(`no top highlight (${cs.boxShadow.slice(0, 40)})`);
    } else {
      const fill = cs.backgroundColor;
      if (!/rgba\(0, 0, 0, 0\)|transparent/.test(fill)) bad.push(`filled ${fill}`);
      if (!/inset/.test(cs.boxShadow) || !/0px 0px 0px 1px/.test(cs.boxShadow)) bad.push(`no hairline (${cs.boxShadow.slice(0, 40)})`);
    }
    if (bad.length) out.push(`${name(el)}: ${bad.join(', ')}`);
  }
  // One coral button per screen.
  const coral = buttons.filter((el) => el.matches(PRIMARY) && !el.disabled);
  if (coral.length > 1) out.push(`${coral.length} coral buttons: ${coral.slice(0, 4).map(name).join(', ')}`);
  // The add rows.
  for (const el of [...top.querySelectorAll('.ds-addrow')].filter(vis)) {
    const cs = getComputedStyle(el);
    const b = el.getBoundingClientRect();
    const mark = el.querySelector('.ds-addrow-mark')?.getBoundingClientRect();
    const bad = [];
    if (b.height < 47.5) bad.push(`${Math.round(b.height)}px high`);
    if (!mark || !near(mark.width, 18) || !near(mark.height, 18)) bad.push('no 18px square for its cross');
    if (scale === 1 && cs.fontSize !== '16px') bad.push(`words ${cs.fontSize}`);
    if (parseFloat(cs.borderTopWidth) > 0 || (cs.boxShadow && cs.boxShadow !== 'none')) bad.push('a box round it');
    if (!/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor)) bad.push(`filled ${cs.backgroundColor}`);
    if (bad.length) out.push(`add row ${name(el)}: ${bad.join(', ')}`);
  }
  return { problems: out, checked: buttons.length };
}
