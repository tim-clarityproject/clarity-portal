import { formatDocDate, parseDbTimestamp } from '../../dateFormatter';

const words = (v) => (typeof v === 'string' ? v.trim() : '');
const listed = (rows) => (Array.isArray(rows) ? rows.map((r) => words(r?.text)).filter(Boolean) : []);

// A plan made to Draft 6 (Polish 1, Stage D item 1; src/lib/draft6Tools/
// meetingPlanner.js): the outcome, the room, your opening and the decision,
// and what you'll do before it, ahead of anything an older plan kept.
function draft6(data) {
  const people = (Array.isArray(data.people) ? data.people : []).filter((p) => words(p?.name) || words(p?.wants));
  const before = data.before && typeof data.before === 'object' ? data.before : {};
  const glance = [
    ...(people.length ? [{ label: 'In the room', value: String(people.length) }] : []),
    ...(before.date ? [{ label: 'Before the meeting', value: formatDocDate(before.date) }] : []),
  ];
  const text = (title, value) => ({ title, blocks: [{ type: 'text', text: words(value) }] });
  return {
    glance,
    sections: [
      text('What’s been agreed', data.agreed),
      {
        title: 'Who’s in the room',
        blocks: people.length ? [{
          type: 'table',
          columns: [{ label: 'Name', width: 3 }, { label: 'What they want', width: 6.7 }],
          rows: people.map((p) => [words(p.name), words(p.wants)]),
        }] : [],
      },
      { title: 'Who’s with you', blocks: [{ type: 'list', items: listed(data.allies) }] },
      { title: 'Who’ll push back', blocks: [{ type: 'list', items: listed(data.pushback) }] },
      text('What you won’t give up', data.wontGive),
      text('What they’ll ask', data.ask),
      text('What they need early', data.earlyNothing ? 'Nothing' : data.early),
      text('How you’ll open', data.opening),
      text('The decision you need', data.decision),
      {
        title: 'Before the meeting',
        blocks: words(before.text) ? [{ type: 'text', text: before.date ? `${words(before.text)} (${formatDocDate(before.date)})` : words(before.text) }] : [],
      },
    ],
  };
}

// A meeting plan as a document for the shared PDF template. Same content and
// order as the meeting plan summary page: date, start, end and chair, then the
// context, attendee preparation, objectives and agenda.

/** "10:30" from a start time and the agenda's minutes, or '' when either is missing. */
export function meetingEndTime(time, flowItems) {
  if (!time || !flowItems?.length) return '';
  const totalMinutes = flowItems.reduce((sum, item) => sum + (parseInt(item.length, 10) || 0), 0);
  const [hours, minutes] = time.split(':').map(Number);
  const start = new Date();
  start.setHours(hours, minutes, 0, 0);
  const end = new Date(start.getTime() + totalMinutes * 60000);
  return `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
}

/**
 * @param {Object} input
 * @param {Object} input.meeting the saved decisions row (form_data, created_at, updated_at)
 * @param {string} [input.personName] whose plan it is, such as "Sam Carter"
 */
export function meetingPlanPdf({ meeting, personName = '' }) {
  const data = meeting.form_data || {};
  const objectives = (data.objectives || []).map((o) => (o.text || '').trim()).filter(Boolean);
  const agenda = (data.flowItems || []).filter((r) => `${r.item || ''}${r.aim || ''}${r.lead || ''}${r.length || ''}`.trim());
  const total = agenda.reduce((sum, item) => sum + (parseInt(item.length, 10) || 0), 0);
  const title = (data.title || '').trim() || (data.v >= 6 ? (meeting.title || '').trim() : '') || 'Meeting plan';
  const d6 = data.v >= 6 ? draft6(data) : null;
  const who = personName.trim() || null;
  const end = meetingEndTime(data.time, data.flowItems);
  const changed = meeting.updated_at && meeting.created_at
    && parseDbTimestamp(meeting.updated_at).getTime() - parseDbTimestamp(meeting.created_at).getTime() > 60000;

  const glance = [
    ...(d6 ? d6.glance : []),
    { label: 'Date', value: data.date ? formatDocDate(data.date) : '' },
    { label: 'Start time', value: data.time || '' },
    { label: 'End time', value: end },
    { label: 'Chair', value: (data.chair || '').trim() },
  ].filter((g) => g.value);
  // At a glance always has at least two items
  if (glance.length < 2 && total) glance.push({ label: 'Length', value: `${total} minutes` });
  if (glance.length < 2 && objectives.length) glance.push({ label: 'Objectives', value: String(objectives.length) });
  if (glance.length < 2 && agenda.length) glance.push({ label: 'Agenda items', value: String(agenda.length) });

  return {
    docName: title,
    title,
    who,
    confidential: true,
    details: [who, formatDocDate(data.date || meeting.created_at), 'Meeting plan'],
    updatedAt: changed ? meeting.updated_at : null,
    date: data.date || meeting.created_at,
    subject: 'Meeting plan',
    glance,
    sections: [
      ...(d6 ? d6.sections : []),
      { title: 'Meeting context', blocks: [{ type: 'text', text: data.meetingContext || '' }] },
      { title: 'Attendee preparation', blocks: [{ type: 'text', text: data.preReads || '' }] },
      { title: 'Objectives in priority order', blocks: [{ type: 'list', ordered: true, items: objectives }] },
      {
        title: 'Meeting agenda',
        blocks: [
          {
            type: 'table',
            columns: [
              { label: 'Item', width: 2.4 },
              { label: 'Aim', width: 4.2 },
              { label: 'Lead', width: 2 },
              { label: 'Minutes', width: 1.1, align: 'right' },
            ],
            rows: agenda.map((r) => [r.item || '', r.aim || '', r.lead || '', r.length ? String(r.length) : '']),
          },
          ...(total ? [{ type: 'text', text: `Total: ${total} minutes` }] : []),
        ],
      },
    ],
  };
}
