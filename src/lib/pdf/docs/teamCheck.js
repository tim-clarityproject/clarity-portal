import { formatDocDate } from '../../dateFormatter';
import {
  ALIGNMENT, AUTONOMY, AREA_NAME, TOOL_NAME, TRUST,
  areaOf, before, dotTip, headline, lastMonth, lastWords, ratedPeople, startQuestions,
} from '../../teamCheck/model';

// A Team performance check as a document for the shared PDF template
// (mock-up M10, version 5.6). The order is the results page's own (rule
// 29ar): the headline in the At a glance panel, then the chart, the same
// answers as a table, trust, and the questions to start with last. Every
// answer is in words (five-word scales, never numbers), so a black and
// white print still reads. Only rated people are shown.

const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const KEY = [
  { state: 'mi', text: 'Green dot, in the high-performance area' },
  { state: '', text: 'Grey ring, not there yet' },
];

/**
 * @param {Object} input
 * @param {Object} input.check the tool's check (checkFrom(row.answers), or the one on screen)
 * @param {string} [input.person] whose check it is, such as "Sam Carter"
 * @param {string|Date|null} [input.createdAt] when the check was finished (today when not given)
 */
export function teamCheckPdf({ check, person = '', createdAt = null }) {
  const who = oneLine(person) || null;
  const date = createdAt || new Date();
  const people = ratedPeople(check);
  const month = lastMonth(check.last, date);
  const said = lastWords(check.last, date);
  const anyBefore = people.some((p) => before(check, p));

  const glance = [
    { label: 'Right now', value: headline(check) },
    { label: 'On your list', value: count(people.length, 'person', 'people') },
  ];
  if (anyBefore && month) glance.push({ label: 'Your last check', value: month });

  const points = people.map((p, i) => ({ n: i + 1, label: oneLine(p.name), x: p.u, y: p.a - 1, state: areaOf(p) === 'hp' ? 'mi' : '' }));
  const alt = `Dot chart of alignment, from “${ALIGNMENT[0]}” to “${ALIGNMENT[4]}”, against autonomy, from “${AUTONOMY[0]}” to “${AUTONOMY[4]}”. ${people.map((p, i) => `${i + 1}. ${dotTip(check, p, date).label}`).join(' ')}`;

  const answers = {
    type: 'table',
    columns: [
      { label: 'No.', width: 0.45 },
      { label: 'Person', width: 2.6 },
      { label: 'Alignment', width: 1.5 },
      { label: 'Autonomy', width: 1.5 },
      { label: 'Area', width: 1.6 },
    ],
    rows: people.map((p, i) => [
      String(i + 1),
      oneLine(p.role) ? `${oneLine(p.name)}\n${oneLine(p.role)}` : oneLine(p.name),
      ALIGNMENT[p.a - 1],
      AUTONOMY[p.u - 1],
      AREA_NAME[areaOf(p)] || '',
    ]),
  };

  const trustColumns = [
    { label: 'Person', width: 2.6 },
    { label: 'Trust now', width: 1.8 },
  ];
  if (anyBefore && said) trustColumns.push({ label: said, width: 2.2 });
  const trust = {
    type: 'table',
    columns: trustColumns,
    rows: people.map((p) => {
      const was = before(check, p);
      const row = [oneLine(p.name), TRUST[p.t - 1].label];
      if (anyBefore && said) row.push(was ? TRUST[was.t - 1].label : '');
      return row;
    }),
  };

  return {
    docName: TOOL_NAME,
    title: TOOL_NAME,
    who,
    confidential: true,
    details: [who, formatDocDate(date), TOOL_NAME],
    date,
    subject: `${TOOL_NAME} results`,
    glance,
    sections: [
      {
        title: 'Alignment and autonomy',
        blocks: points.length ? [
          {
            type: 'dots',
            points,
            xLabels: AUTONOMY,
            yMax: 4,
            yTicks: [0, 1, 2, 3, 4],
            yTickWords: ALIGNMENT,
            xCentre: 3.5,
            yCentre: 2.5,
            axisX: 'Autonomy',
            axisY: 'Alignment',
            quadrants: { topLeft: AREA_NAME.ps, topRight: AREA_NAME.hp, bottomLeft: '', bottomRight: AREA_NAME.ch },
            key: KEY,
            listNote: 'Numbers match the table.',
            sentence: 'People in the high-performance area understand what you’re trying to achieve and have the autonomy to deliver it.',
            alt,
          },
          answers,
        ] : [],
      },
      { title: 'Trust', blocks: people.length ? [trust] : [] },
      {
        title: 'Questions to start with',
        blocks: [{ type: 'list', items: startQuestions(check).map((q) => q.text) }],
      },
    ],
  };
}
