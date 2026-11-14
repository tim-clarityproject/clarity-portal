// Summary and results pages open with the visuals, and the questions come
// last (Tim, 13 Nov, 18:11 and 18:17; CLAUDE.md rule 29ar): the headline, then
// the overview visuals (the chart first, then the list or table), and
// "Questions to start with" after every one of them. Only the page's own next
// steps (Keep your results) follow the questions.
//
// Checked on every page calm-rules visits: a page with a "Questions to start
// with" heading and a chart fails when any chart comes after that heading,
// in the page's own order or on screen.
//
// What counts:
//   - the heading: a heading (h1 to h6, or role="heading"), or a short label
//     standing as one (a span, p, div, small, strong, b or legend holding
//     only those words), that reads "Questions to start with", in any case;
//   - a chart: a drawing at least 120px wide and 100px tall (an svg, a
//     canvas, or anything with role="img"), or a part named a chart by its
//     class, that isn't inside a button or a link (an icon is never a chart).
//     Only the outermost of nested ones is counted.
// Hidden parts are left out. A page with no such heading, or no chart, passes.
//
// questionsBeforeCharts runs in the page (page.evaluate(questionsBeforeCharts))
// and gives each break as words; an empty list means the page is in order.
export function questionsBeforeCharts() {
  const WORDS = /^questions to start with$/i;
  const seen = (el) => {
    const b = el.getBoundingClientRect();
    if (!(b.width > 0 && b.height > 0)) return false;
    if (el.closest('[hidden],[inert]')) return false;
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      const st = getComputedStyle(p);
      if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) < 0.05) return false;
    }
    return true;
  };
  const said = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
  const headings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role=heading], span, p, div, small, strong, b, legend')]
    .filter((el) => WORDS.test(said(el)) && seen(el))
    // the innermost one holding the words: a wrapper that only holds the heading is the same heading
    .filter((el, _i, all) => !all.some((other) => other !== el && el.contains(other)));
  if (!headings.length) return [];
  const big = (el) => { const b = el.getBoundingClientRect(); return b.width >= 120 && b.height >= 100; };
  const charts = [...document.querySelectorAll('svg, canvas, [role=img], [class*=chart i]')]
    .filter((el) => big(el) && seen(el) && !el.closest('button, a[href], [aria-hidden=true]'))
    .filter((el, _i, all) => !all.some((other) => other !== el && other.contains(el)));
  const name = (el) => {
    const cls = String(el.className?.baseVal ?? el.className ?? '').split(' ')[0];
    const label = el.getAttribute('aria-label') || el.querySelector?.('title')?.textContent || '';
    return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}${label ? ` "${label.replace(/\s+/g, ' ').trim().slice(0, 40)}"` : ''}`;
  };
  const problems = [];
  for (const heading of headings) {
    const h = heading.getBoundingClientRect();
    for (const chart of charts) {
      if (chart.contains(heading)) continue;
      const c = chart.getBoundingClientRect();
      // In the page's own order, which is the order a screen reader and a phone follow.
      if (heading.compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING) {
        problems.push(`"Questions to start with" comes before the chart ${name(chart)} in the page`);
        continue;
      }
      // On screen: the chart starts above the heading, or to its left when they share a row.
      const sameRow = c.top < h.bottom && h.top < c.bottom;
      const first = sameRow ? c.left < h.left : c.top < h.top;
      if (!first) problems.push(`"Questions to start with" is drawn before the chart ${name(chart)} (the heading at ${Math.round(h.top + window.scrollY)}px, the chart at ${Math.round(c.top + window.scrollY)}px)`);
    }
  }
  return problems;
}
