import { formatDocDate } from '../../dateFormatter';
import { TOOL_NAME, washContent } from '../../emotionalWash/model';

// An Emotional wash as a document for the shared PDF template (mock-up
// M10, version 5.6). It mirrors "Your wash", in the same order and under
// the same names: what happened, the feeling and its words, what it could
// be related to, what to act on (each step with where its to-do is) and
// what to reflect on. Only what was filled in is shown (PDF rule 11): the
// model's washContent leaves blanks out, and a trashed thought never
// appears. There is no strength rating anywhere.

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
  const c = washContent(wash);

  // At a glance: two to four items, each a label and its words, never an empty one.
  const glance = [
    { label: 'The feeling', value: c.kind },
    { label: 'To act on', value: c.act.length ? count(c.act.length, 'small step', 'small steps') : '' },
    { label: 'To reflect on', value: c.reflect.length ? count(c.reflect.length, 'question', 'questions') : '' },
  ].filter((g) => g.value);
  if (glance.length < 2 && c.words.length) glance.push({ label: 'Words that fit', value: count(c.words.length, 'word', 'words') });
  if (glance.length < 2) glance.push({ label: 'Date', value: formatDocDate(date) });
  if (glance.length < 2) glance.unshift({ label: 'Tool', value: TOOL_NAME });

  const feeling = [];
  if (c.kind) feeling.push({ type: 'text', text: c.kind });
  if (c.words.length) feeling.push({ type: 'text', text: `${inWords(c.words)}.`, tone: c.kind ? 'detail' : undefined });

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
      { title: 'Related to', blocks: c.related.length ? [{ type: 'text', text: inWords(c.related) }] : [] },
      { title: 'To act on', blocks: c.act.length ? [{ type: 'list', items: c.act.map((a) => (a.where ? `${oneLine(a.step)}\n${a.where}` : oneLine(a.step))) }] : [] },
      { title: 'To reflect on', blocks: c.reflect.length ? [{ type: 'list', items: c.reflect.map((r) => oneLine(r.question)) }] : [] },
    ],
  };
}
