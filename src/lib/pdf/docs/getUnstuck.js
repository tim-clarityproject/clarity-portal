import { formatDocDate, parseDbTimestamp } from '../../dateFormatter';
import { nextSteps, planContent, TOOL_NAME, WHERE, whereLine } from '../../getUnstuck/model';

// A Get unstuck plan as a document for the shared PDF template (mock-up M9).
// Action first: the next steps come straight after the At a glance panel,
// then the goal, what's in the way, what's already working and the options,
// under the names the plan's own summary page gives them (summaryRows in
// src/lib/getUnstuck/model.js). Only what was filled in is shown (PDF rule
// 11): the model's planContent leaves blank rows out, and a list with
// nothing in it is left out with its heading.

const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** True when the plan was saved again more than a minute after it was first saved. */
function changedSince(updatedAt, createdAt) {
  if (!updatedAt || !createdAt) return false;
  return parseDbTimestamp(updatedAt).getTime() - parseDbTimestamp(createdAt).getTime() > 60000;
}

/**
 * @param {Object} input
 * @param {Object} input.plan the tool's plan (planFrom(row.form_data), or the one on screen)
 * @param {string} [input.person] whose plan it is, such as "Sam Carter" (a guest has no name)
 * @param {string} [input.organisation] their organisation, used when there is no person's name
 * @param {boolean} [input.guest] a guest has no sprint, so no step says where it is
 * @param {string[]} [input.where] one line per next step, in order, saying where it is
 *   ("It’s in this week’s sprint."); left out, a signed-in person's steps say
 *   where the plan itself has them (this week or the backlog), and no others do
 * @param {string|Date|null} [input.createdAt] when the plan was first saved
 * @param {string|Date|null} [input.updatedAt] the last save; shown as "Updated" when after the first
 * @param {string|Date|null} [input.today] the document's date when the plan isn't saved yet (today)
 */
export function getUnstuckPdf({
  plan, person = '', organisation = '', guest = false, where = null, createdAt = null, updatedAt = null, today = null,
}) {
  const { goal, constraints, opportunities, options, nextSteps: steps } = planContent(plan);
  const who = oneLine(person) || oneLine(organisation) || null;
  const date = createdAt || today || new Date();

  // Where each next step is, under its words. The model's own lines, and
  // only for a step that has a place: a PDF is read later, so it never says
  // "It isn’t in this week’s sprint yet.".
  const acts = nextSteps(plan);
  const places = guest ? [] : (Array.isArray(where) ? where : acts.map((a) => (
    a.where === WHERE.week || a.where === WHERE.backlog ? whereLine(a, 1).line : ''
  )));
  const stepItems = steps.map((text, i) => {
    const place = oneLine(places[i]);
    return place ? `${oneLine(text)}\n${place}` : oneLine(text);
  });

  // At a glance: two to four items, each a label and its words, never an empty one.
  const glance = [
    { label: 'Your goal', value: oneLine(goal) },
    { label: 'Next steps', value: steps.length ? count(steps.length, 'next step', 'next steps') : '' },
    { label: 'Options you thought of', value: options.length ? count(options.length, 'option', 'options') : '' },
  ].filter((g) => g.value);
  if (glance.length < 2 && constraints.length) glance.push({ label: 'What’s in the way', value: count(constraints.length, 'constraint', 'constraints') });
  if (glance.length < 2 && opportunities.length) glance.push({ label: 'What’s already working', value: count(opportunities.length, 'opportunity', 'opportunities') });
  if (glance.length < 2) glance.push({ label: 'Date', value: formatDocDate(date) });

  const list = (title, items, ordered = false) => ({
    title,
    blocks: items.length ? [{ type: 'list', ordered, items: items.map((it) => (ordered ? it : oneLine(it))) }] : [],
  });

  return {
    docName: TOOL_NAME,
    title: TOOL_NAME,
    who,
    confidential: true,
    details: [who, formatDocDate(date), `${TOOL_NAME} plan`],
    updatedAt: changedSince(updatedAt, createdAt) ? updatedAt : null,
    date,
    subject: `${TOOL_NAME} plan`,
    glance,
    sections: [
      list('Your next steps', stepItems, true),
      { title: 'Your goal', blocks: goal ? [{ type: 'text', text: goal }] : [] },
      list('What’s in the way', constraints),
      list('What’s already working', opportunities),
      list('Your options', options),
    ],
  };
}
