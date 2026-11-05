import { Children, isValidElement } from 'react';

// Never break a word at its hyphen, and never leave a number alone on a
// line (Tim, 3 Nov 2026: "high-" at the end of
// one line and "performance" on the next). Neither DM Sans nor Nekst has
// the non-breaking hyphen (U+2011), so a browser would draw it from
// another font; instead each word with a hyphen inside it ("high-performance",
// "to-do", "world-class") is kept whole in a span that never wraps
// (.ds-keep). The words around it still wrap as usual, and copying or
// reading aloud gives the same text.
//
// keepWords('Be a world-class coach')  -> text with the hyphenated word kept whole
// keepWords(children)                  -> the same for every string inside
//                                         (elements are left as they are,
//                                         their own strings included)

// A word with a hyphen inside it, or a word and the number after it
// ("Sprint 1", "week 4"), so a number is never alone on a line (UI tester,
// 3 Nov: "PERFORMANCE SPRINT" then "1" on its own).
const KEPT = /((?:[^\s-]+(?:-[^\s-]+)+|[^\s\d][^\s]*) \d+(?=[\s.,;:!?]|$)|[^\s-]+(?:-[^\s-]+)+)/;

function keepString(text, keyBase = '') {
  if (!text || !/-|\s\d/.test(text)) return text;
  const parts = text.split(KEPT);
  if (parts.length === 1) return text;
  // One run for the whole string, so in a flex part (a button, IconText)
  // the words stay one item: without it the flex gap opened between "Start
  // my" and "check-in" and dropped the space (UI tester, 5 Nov).
  return (
    <span key={`${keyBase}run`} className="ds-keep-run">
      {parts.map((part, i) => (i % 2
        ? <span key={`${keyBase}k${i}`} className="ds-keep">{part}</span>
        : part))}
    </span>
  );
}

export default function keepWords(children) {
  if (typeof children === 'string') return keepString(children);
  if (children == null || typeof children === 'boolean' || typeof children === 'number') return children;
  if (isValidElement(children)) return children;
  return Children.map(children, (child, i) => (typeof child === 'string' ? keepString(child, `${i}-`) : child));
}
