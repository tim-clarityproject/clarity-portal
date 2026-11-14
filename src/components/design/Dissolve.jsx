import { useEffect, useRef } from 'react';
import { dissolveGapMs, dissolveMs } from './timing';
import './design.css';

// Words that lift away letter by letter (M10's Emotional wash: a thought
// that is trashed), then are gone. Each letter fades as it rises a little
// and tilts, one after another; with reduced motion the words simply fade.
// The timings are the tokens' (--dur-slow for a letter, --dur-fade-still
// for the plain fade); a long text lifts faster, so it never takes longer
// than a short one by much.
//
//   <Dissolve text="If I push back, I’ll look weak" onDone={() => …} />
//
// The letters are hidden from screen readers, as M10 has them: what is
// said is what comes after (the page's "That thought has gone.").
export default function Dissolve({ text, onDone }) {
  const done = useRef(onDone);
  done.current = onDone;
  const letters = [...String(text || '')].filter((c) => c.trim()).length;
  useEffect(() => {
    const timer = setTimeout(() => done.current?.(), dissolveMs(letters));
    return () => clearTimeout(timer);
  }, [letters, text]);
  let k = 0;
  const words = String(text || '').split(/(\s+)/);
  return (
    <span className="ds-dissolve" aria-hidden="true" style={{ '--dissolve-gap': `${dissolveGapMs(letters)}ms` }}>
      {words.map((word, w) => (/^\s*$/.test(word) ? (word ? ' ' : null) : (
        // The words have no ids of their own; their order is their identity.
        // eslint-disable-next-line react/no-array-index-key
        <span key={w} className="ds-dissolve-word">
          {[...word].map((letter) => {
            k += 1;
            // eslint-disable-next-line react/no-array-index-key
            return <span key={k} style={{ '--k': k, '--r': `${((k * 37) % 13) - 6}deg` }}>{letter}</span>;
          })}
        </span>
      )))}
    </span>
  );
}
