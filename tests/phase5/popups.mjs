// A pop-up is for one short line only (Tim, 16 Nov, 23:31; design reference
// "Explanations (16 Nov)"): a single term, a chart value, or who can see
// this. "One short line" is one sentence of up to about 60 characters, so it
// fits on one line in the pop-up on a phone. Anything longer opens in the
// side panel (src/components/design/Explain.jsx). Checked on every page by
// calm-rules, and on the Health Check's own pages.
//
// checkPopups runs in the page (page.evaluate(checkPopups)) and returns
// { checked, problems }:
//   - every ⓘ pop-up on the page (.ds-infopop, which is always there,
//     hidden until opened) holds one sentence of 60 characters or fewer;
//   - every chart read-out (data-tip) is the value (or the kind, then the
//     name, which is the person's own words and isn't counted), then when,
//     then extra facts, each its own line of one sentence ("at most one
//     extra fact per line", the rule's own words). A line longer than 60
//     characters is listed in `long` for Tim, not failed: the approved
//     mock-ups draw longer read-outs (M10's team chart);
//   - no ⓘ sits inside a list row (a list item, a table row or cell): one
//     quiet link under the list opens them all in one panel instead.
export function checkPopups() {
  const MAX = 60;
  const problems = [];
  const words = (t) => String(t || '').replace(/\s+/g, ' ').trim();
  // Sentences: a full stop, question mark or exclamation mark followed by a
  // space or the end. "e.g." and figures like "2.5" never occur in pop-ups.
  const sentences = (t) => (words(t).match(/[.?!](\s|$)/g) || []).length;
  let checked = 0;
  const long = [];
  for (const pop of document.querySelectorAll('.ds-infopop')) {
    checked += 1;
    const text = words(pop.textContent);
    if (!text) continue;
    if (text.length > MAX) problems.push(`pop-up of ${text.length} characters: "${text.slice(0, 70)}…"`);
    else if (sentences(text) > 1) problems.push(`pop-up of ${sentences(text)} sentences: "${text}"`);
  }
  for (const mark of document.querySelectorAll('[data-tip]')) {
    let tip;
    try { tip = JSON.parse(mark.getAttribute('data-tip')); } catch { continue; }
    checked += 1;
    const lines = [tip.kind ? null : tip.value, tip.when, ...(tip.extra || [])].filter(Boolean).map(words);
    for (const line of lines) {
      if (sentences(line) > 1) problems.push(`chart read-out line of ${sentences(line)} sentences: "${line}"`);
      else if (line.length > MAX) long.push(`${line.length}: "${line}"`);
    }
  }
  const infoButtons = [...document.querySelectorAll('button')].filter((b) => b.querySelector('.ds-info'));
  for (const b of infoButtons) {
    const row = b.closest('li, [role=listitem], [role=row], tr, td, [role=cell]');
    if (row) problems.push(`an ⓘ inside a list row: "${words(row.textContent).slice(0, 50)}"`);
  }
  return { checked, problems, long };
}
