// Keeps only the styles a page's own code can use (Health Check follow-up 1,
// step 4). The outside Health Check is built from the portal's shared parts
// and loads the portal's whole stylesheet; most of it is for pages it never
// shows. In the outside page's own build pass (vite.config.js), every rule
// whose classes its code never names is left out of its CSS. Nothing is
// downloaded: it uses postcss, which Vite already brings.
//
// A class counts as named when the page's scripts or HTML hold it whole, or
// hold a start of it that ends in "-" or "_" (a class put together in code,
// such as `hc-dot--${state}`), so a class the code builds is never lost.
// Everything else stays as it is: element, attribute and id selectors,
// @font-face, @keyframes and every other at-rule. A rule with several
// selectors keeps the ones that can match and drops the rest; inside
// `:is()` or `:where()` one choice that can match is enough, and `:not()`
// asks for nothing. Then the
// design tokens (custom properties, `--name: value`) that nothing left reads
// go too: not any of the page's CSS files (one reads another's tokens), and
// not the page's code (which sets or reads some, such as --ds-toast-offset),
// worked out again until none more can go, as one token reads another.
//
// CLARITY_NO_TRIM=1 builds without it (to compare).
import postcss from 'postcss';

const CLASS = /\.(-?[_a-zA-Z][\w-]*)/g;

/** The names the page's code holds (every run of letters, digits, - and _). */
export function namesIn(texts) {
  const names = new Set();
  for (const text of texts) for (const m of text.matchAll(/[A-Za-z0-9_-]+/g)) names.add(m[0]);
  return names;
}

/** Whether a class can be on the page: named whole, or built from a named start. */
export function classUsed(name, names) {
  if (names.has(name)) return true;
  for (let i = name.length - 1; i > 0; i -= 1) {
    const ch = name[i - 1];
    if ((ch === '-' || ch === '_') && names.has(name.slice(0, i))) return true;
  }
  return false;
}

/**
 * Whether a selector can match on the page. Inside `:is()` and `:where()`
 * one of the choices is enough; `:not()` never needs its classes (the
 * buttons' `:is(.ds-btn--primary, .si-btn, …):not(#_)`, Tim, 18 Nov).
 */
export function selectorCanMatch(sel, names) {
  // The innermost pseudo-class with a list, worked out and replaced, until none is left.
  const inner = /:(is|where|not|matches)\(([^()]*)\)/i;
  let rest = sel;
  // A list none of whose choices can match leaves a mark that no page names, so the choice holding it can't match either.
  const NEVER = '.zzzclassnopagenameszzz';
  for (let m = inner.exec(rest); m; m = inner.exec(rest)) {
    const ok = m[1].toLowerCase() === 'not' || m[2].split(',').some((alt) => !alt.includes(NEVER) && selectorCanMatch(alt, names));
    rest = rest.slice(0, m.index) + (ok ? '' : NEVER) + rest.slice(m.index + m[0].length);
  }
  return !rest.includes(NEVER) && [...rest.matchAll(CLASS)].every((c) => classUsed(c[1], names));
}

/**
 * Every stylesheet of a page, trimmed together.
 * @param {string[]} sheets the CSS files' text
 * @param {Set<string>} names namesIn(the page's scripts and HTML)
 * @param {string[]} texts the page's scripts and HTML (for the tokens they set or read)
 * @returns {{ sheets: string[], dropped: number, tokens: number }}
 */
export function trimSheets(sheets, names, texts = []) {
  const roots = sheets.map((css) => postcss.parse(css));
  let dropped = 0;
  for (const root of roots) {
    root.walkRules((rule) => {
      if (rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
      const keep = rule.selectors.filter((sel) => selectorCanMatch(sel, names));
      dropped += rule.selectors.length - keep.length;
      if (!keep.length) rule.remove();
      else if (keep.length !== rule.selectors.length) rule.selectors = keep;
    });
  }
  // Tokens nothing reads, in any of the page's CSS or its code.
  const code = texts.join('\n');
  let tokens = 0;
  for (;;) {
    const read = new Set();
    for (const root of roots) root.walkDecls((d) => { for (const m of d.value.matchAll(/var\(\s*(--[\w-]+)/g)) read.add(m[1]); });
    let gone = 0;
    for (const root of roots) {
      root.walkDecls(/^--/, (d) => {
        if (read.has(d.prop) || code.includes(d.prop)) return;
        d.remove();
        gone += 1;
      });
    }
    tokens += gone;
    if (!gone) break;
  }
  for (const root of roots) {
    // Rules left with nothing in them go, then at-rules left empty.
    root.walkRules((rule) => { if (rule.nodes && rule.nodes.length === 0) rule.remove(); });
    let emptied = true;
    while (emptied) {
      emptied = false;
      root.walkAtRules((at) => {
        if (at.nodes && at.nodes.length === 0 && !/font-face|page/i.test(at.name)) { at.remove(); emptied = true; }
      });
    }
  }
  return { sheets: roots.map((r) => r.toString()), dropped, tokens };
}

/**
 * The Vite plugin for a page's own build pass: every CSS file of the pass is
 * trimmed against every script and HTML file of the same pass.
 */
export function trimStyles({ log = () => {} } = {}) {
  return {
    name: 'clarity-trim-styles',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      if (process.env.CLARITY_NO_TRIM === '1') return;
      const texts = [];
      for (const file of Object.values(bundle)) {
        if (file.type === 'chunk') texts.push(file.code);
        else if (/\.html$/.test(file.fileName)) texts.push(String(file.source));
      }
      const names = namesIn(texts);
      const files = Object.values(bundle).filter((f) => f.type === 'asset' && /\.css$/.test(f.fileName));
      const { sheets, dropped, tokens } = trimSheets(files.map((f) => String(f.source)), names, texts);
      files.forEach((f, i) => { f.source = sheets[i]; });
      log(`${files.length} CSS files trimmed: ${dropped} selectors and ${tokens} tokens left out`);
    },
  };
}
