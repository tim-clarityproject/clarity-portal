// The weekly performance debrief as a report for the shared PDF template, to the approved 25 Nov PDF (Polish 1;
// pdfs-25nov: "Weekly debrief, Sam Carter, week 8"). Light and dark (PDF rule 1: a tool's own PDF).
//
// Page 1: the lockup bar with REPORT; the title with the week ("Week 8 of 26"); the key facts on the right (prepared
// for, the period, the coach); the At a glance row (the week's performance score with the usual range, the debrief
// streak, and how many Strategies are on track); each Strategy's share of its habits' scores as a bar with its figure;
// then the person's own answers (what went well, what got in the way, what they'll adjust) and next week's to-dos.
// Blank answers are left out (PDF rule 11). Every figure is the debrief's own (src/lib/performance/debrief.js
// debriefView), never worked out again here: a Strategy's bar is the average of its habits' scores as the summary
// shows them, and a habit not logged counts as nothing logged, never as 0.

import { m12SleepHours, m12SleepQuality } from '../../scores/m12.js';
import { sleepQualityWord } from '../../performance/words.js';

const one = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const parts = (day) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(day || '')); return m ? { y: m[1], m: MONTHS[Number(m[2]) - 1], d: Number(m[3]) } : null; };

/** "16 to 22 Nov 2026", "30 Nov to 6 Dec 2026", "28 Dec 2026 to 3 Jan 2027". */
export function periodWords(from, to) {
  const a = parts(from);
  const b = parts(to);
  if (!a || !b) return '';
  if (a.y !== b.y) return `${a.d} ${a.m} ${a.y} to ${b.d} ${b.m} ${b.y}`;
  if (a.m !== b.m) return `${a.d} ${a.m} to ${b.d} ${b.m} ${b.y}`;
  return `${a.d} to ${b.d} ${b.m} ${b.y}`;
}

const percent = (text) => { const m = /^(\d+(?:\.\d+)?)%$/.exec(one(text)); return m ? Number(m[1]) : null; };

/**
 * What the report shows, from the debrief's view and the person's answers.
 * @param {object} view       debriefView(...) for an open week
 * @param {{ name: string, coachName?: string, answers?: { wentWell?: string, inTheWay?: string, adjust?: string } }} who
 */
/** "7½" for 7.5 hours, else the figure as M12 shows it ("7.3"), the approved PDF's Sleep tile. */
const hoursFigure = (x) => (x == null ? '' : Number.isInteger(x) ? String(x) : Math.abs(x % 1 - 0.5) < 1e-9 ? `${Math.floor(x)}½` : String(x));

/**
 * @param {{ hours?: { value: number, toConfirm?: boolean }[], quality?: { value: string }[] }} [sleep] the week's
 *   sleep as logged (the nights' hours and quality, M12); with any hours logged the report shows the Sleep tile.
 */
export function debriefFacts(view, { name, coachName = '', answers = {}, sleep = null } = {}) {
  const strategies = (view.groups || []).map((g) => {
    const scores = g.habits.map((h) => percent(h.total?.value)).filter((v) => v != null);
    const value = scores.length ? Math.round(scores.reduce((a, v) => a + v, 0) / scores.length) : null;
    const onTrack = g.habits.length > 0 && g.habits.every((h) => h.total?.good === true);
    return { name: g.name, value, onTrack };
  });
  const days = (view.days || []).map((d) => d.key);
  return {
    name: one(name),
    coachName: one(coachName),
    week: view.week,
    weeks: view.lengthWeeks,
    period: periodWords(days[0], days[days.length - 1]),
    lastDay: days[days.length - 1] || view.today,
    score: view.score ? view.score.value : null,
    usualLine: view.usualLine || '',
    streak: Number(view.streak) || 0,
    strategies,
    wentWell: one(answers.wentWell),
    inTheWay: one(answers.inTheWay),
    adjust: one(answers.adjust),
    nextWeek: (view.nextWeek?.todos || []).map((t) => one(t.text)).filter(Boolean),
    sleep: sleepFacts(sleep),
  };
}

/** The week's sleep for its tile: the average a night and the usual quality's word (M12), or null with none logged. */
function sleepFacts(sleep) {
  const hours = sleep ? m12SleepHours(sleep.hours || []) : null;
  if (!hours) return null;
  const quality = m12SleepQuality(sleep.quality || []);
  return { hours: hoursFigure(hours.shown), word: quality ? sleepQualityWord(quality.answer) : '' };
}

/** The report from debriefFacts(). */
export function weeklyDebriefPdf(f) {
  const on = f.strategies.filter((s) => s.onTrack);
  const below = f.strategies.filter((s) => !s.onTrack);
  const scored = f.strategies.filter((s) => s.value != null);
  return {
    kind: 'Report',
    docName: 'Weekly debrief',
    title: 'Weekly debrief',
    who: f.name,
    fileLabel: `week ${f.week}`,
    confidential: true,
    details: [f.weeks ? `Week ${f.week} of ${f.weeks}` : `Week ${f.week}`],
    facts: [['Prepared for', f.name], ['Period', f.period], ['Coach', f.coachName]],
    date: f.lastDay,
    subject: `Weekly performance debrief, ${f.name}, week ${f.week}`,
    glance: [
      { label: 'Performance score', value: f.score != null ? String(f.score) : 'None yet', unit: f.score != null ? '%' : '', big: true, note: f.score != null ? f.usualLine : 'Nothing was planned this week.' },
      // The approved 25 Nov report's three: the score, Sleep and Strategies on track (the lead's call on Q5: the Sleep
      // tile when the week has sleep logged); a week with no sleep logged keeps the debrief streak in its place.
      f.sleep
        ? { label: 'Sleep', value: f.sleep.hours, unit: 'hours', big: true, note: f.sleep.word ? `Average a night, mostly ${f.sleep.word}` : 'Average a night' }
        : { label: 'Debrief streak', value: String(f.streak), unit: f.streak === 1 ? 'week' : 'weeks', big: true },
      ...(f.strategies.length ? [{ label: 'Strategies on track', value: String(on.length), unit: `of ${f.strategies.length}`, big: true,
        note: below.length ? `${below[0].name} is below your standard` : 'Every Strategy is at your standard' }] : []),
    ],
    sections: [
      { title: 'Your Strategies', look: 'label', gapMm: 10, blocks: scored.length ? [{
        type: 'meter',
        rows: scored.map((s) => ({ label: s.name, value: s.value })),
        alt: `Each Strategy's score this week: ${scored.map((s) => `${s.name}, ${s.value}%`).join('; ')}.`,
      }] : [] },
      { title: 'What went well', look: 'label', blocks: [{ type: 'text', text: f.wentWell }] },
      { title: 'What got in the way', look: 'label', blocks: [{ type: 'text', text: f.inTheWay }] },
      { title: 'What you’ll adjust next week', look: 'label', blocks: [{ type: 'text', text: f.adjust }] },
      { title: 'Next week’s to-dos', look: 'label', blocks: f.nextWeek.length ? [{ type: 'list', items: f.nextWeek }] : [] },
    ],
  };
}
