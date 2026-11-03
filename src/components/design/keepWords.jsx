import { Children, isValidElement } from 'react';

// Never break a word at its hyphen (Tim, 3 Nov 2026: "high-" at the end of
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

const HYPHENATED = /([^\s-]+(?:-[^\s-]+)+)/;

function keepString(text, keyBase = '') {
  if (!text || !text.includes('-')) return text;
  const parts = text.split(HYPHENATED);
  if (parts.length === 1) return text;
  return parts.map((part, i) => (i % 2
    ? <span key={`${keyBase}k${i}`} className="ds-keep">{part}</span>
    : part));
}

export default function keepWords(children) {
  if (typeof children === 'string') return keepString(children);
  if (children == null || typeof children === 'boolean' || typeof children === 'number') return children;
  if (isValidElement(children)) return children;
  return Children.map(children, (child, i) => (typeof child === 'string' ? keepString(child, `${i}-`) : child));
}
