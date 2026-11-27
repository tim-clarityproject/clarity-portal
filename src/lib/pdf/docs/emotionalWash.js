import { formatDocDate } from '../../dateFormatter';
import { TOOL_NAME, tidyWash, washContent } from '../../emotionalWash/model';

// An Emotional wash as a document for the shared PDF template (Polish 1,
// Stage D: Draft 6 and Draft 7). It mirrors "Your wash", in the same order
// and under the same names: what happened, the feeling (its words and its
// family), how strong it is, what you're telling yourself, then what you'll
// act on (each step with its day and where its to-do is), what's parked for
// now and what you're letting go. Only what was filled in is shown (PDF rule
// 11). A wash saved before 27 Nov keeps its "Related to" and its parked
// questions.

const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const list = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
const inWords = (words) => list(words.map((w, i) => (i ? w.toLowerCase() : w)));

/**
 * @param {Object} input
 * @param {Object} input.wash the tool's wash (washFrom(row.answers), or the one on screen)
 * @param {string} [input.person] whose wash it is, such as "Sam Carter"
 * @param {string|Date|null} [input.createdAt] when the wash was finished or first saved (today when not given)
 */
export function emotionalWashPdf({ wash, person = '', createdAt = null }) {
  const who = oneLine(person) || null;
  const date = createdAt || new Date();
  // Whatever shape it came in (the one on screen, or a device's copy from before 27 Nov), it reads as the summary does.
  const c = washContent(tidyWash(wash, (() => { let n = 0; return () => `pdf-${(n += 1)}`; })()));

  // At a glance: two to four items, each a label and its words, never an empty one.
  const glance = [
    { label: 'The feeling', value: c.words.length ? inWords(c.words) : c.family },
    { label: 'How strong', value: c.strength },
    { label: 'To act on', value: c.act.length ? count(c.act.length, 'step', 'steps') : '' },
  ].filter((g) => g.value);
  if (glance.length < 2) glance.push({ label: 'Date', value: formatDocDate(date) });
  if (glance.length < 2) glance.unshift({ label: 'Tool', value: TOOL_NAME });

  const feeling = [];
  if (c.words.length) feeling.push({ type: 'text', text: inWords(c.words) });
  if (c.family) feeling.push({ type: 'text', text: c.family, tone: c.words.length ? 'detail' : undefined });

  const step = (a) => [oneLine(a.step), a.when ? `By ${a.when}.` : '', a.where || ''].filter(Boolean).join('\n');

  return {
    docName: TOOL_NAME,
    title: TOOL_NAME,
    who,
    confidential: true,
    details: [who, formatDocDate(date), TOOL_NAME],
    date,
    subject: `${TOOL_NAME} summary`,
    glance,
    sections: [
      { title: 'What happened', blocks: c.what ? [{ type: 'text', text: c.what }] : [] },
      { title: 'The feeling', blocks: feeling },
      { title: 'How strong it is', blocks: c.strength ? [{ type: 'text', text: c.strength }] : [] },
      { title: 'Related to', blocks: c.related.length ? [{ type: 'text', text: inWords(c.related) }] : [] },
      { title: 'What you’re telling yourself', blocks: c.story ? [{ type: 'text', text: c.story }] : [] },
      { title: 'To act on', blocks: c.act.length ? [{ type: 'list', items: c.act.map(step) }] : [] },
      { title: 'Parked for now', blocks: c.park.length ? [{ type: 'list', items: c.park.map((p) => (p.question ? `${oneLine(p.thought)}\n${oneLine(p.question)}` : oneLine(p.thought))) }] : [] },
      { title: 'Letting go', blocks: c.go.length ? [{ type: 'list', items: c.go.map((g) => oneLine(g.thought)) }] : [] },
    ],
  };
}
