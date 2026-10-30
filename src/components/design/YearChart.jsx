import { useId } from 'react';
import ChartTips, { tipProps } from './ChartTips';
import './design.css';

// The year chart (M1 R.year, "View your year"): one slim bar per week of
// the year, in the same colours as every dial and week chart (Tim, 23 and
// 26 Oct): weeks at or above the standard mint, below it neutral grey,
// this week in the text colour, weeks with nothing a short stub, and
// Recovery hatched in grey. Never coral: coral is not a data colour.
//
// No key (26 Oct rule 3): each sprint is named above its weeks ("Sprint
// 4", the running one in the text colour), the standard is a dashed line
// labelled at its right end, week numbers and months run along the
// bottom, and every week has a pop-up (ChartTips) saying what it is,
// Recovery in words as well as hatched (never colour alone). Picking a
// week (a tap, a click, or Enter on a focused week) outlines it and tells
// the page, which says more about it underneath.
//
// Phones show less (26 Oct rule 10): the chart runs full width, the week
// numbers go, the months thin to every quarter, and only the latest
// sprint is named above its weeks (the others name themselves in their
// pop-ups). A sprint too short to hold its name isn't marked above at
// all, so there is never a line without its words. The standard's label
// moves up into a thin strip above the bars (Tim, 29 Oct), still at the
// line's right end, so "Standard 85%" never covers a bar or the picked
// week's outline.
//
// Labels are DM Sans in sentence case (CLAUDE.md rule 4), where M1 used
// Nekst capitals.
//
// slots:   [{ week, kind: 'sprint'|'recovery'|'empty', state, score, tip, thisWeek }]
//          state for a sprint week: 'good'|'below'|'none'|'now'|'next'|'hidden'
// sprints: [{ number, first, last, running }] (first and last: week numbers)
// standardLines: [{ value: 85, from: 1, to: 52 }]
// months:  [{ label: 'Jan', week: 1 }]
// selected, onSelect(week)
// label:   what a screen reader hears for the whole chart

const SHORT_SPRINT = 4;  // weeks: too short to hold its name

function RecoveryMark() {
  const id = useId().replace(/:/g, '');
  return (
    <svg className="ds-ychart-rec" aria-hidden="true">
      <defs>
        <pattern id={`ych${id}`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="1.5" height="4" />
        </pattern>
      </defs>
      <rect className="ds-ychart-rec-fill" width="100%" height="100%" rx="2" fill={`url(#ych${id})`} />
    </svg>
  );
}

export default function YearChart({ slots, sprints = [], standardLines = [], months = [], selected, onSelect, label }) {
  const n = slots.length;
  const left = (week) => `${((week - 1) / n) * 100}%`;
  const span = (from, to) => `${((to - from + 1) / n) * 100}%`;
  const pick = (week) => onSelect?.(week);

  return (
    <ChartTips className="ds-ychart">
      <div className="ds-ychart-sprints" aria-hidden="true">
        {sprints.map((s, i) => {
          const weeks = s.last - s.first + 1;
          const latest = i === sprints.length - 1 ? ' ds-ychart-sprint--latest' : '';
          return (
            <span
              key={s.number}
              className={`ds-ychart-sprint${s.running ? ' ds-ychart-sprint--now' : ''}${weeks < SHORT_SPRINT ? ' ds-ychart-sprint--short' : ''}${latest}`}
              style={{ left: left(s.first), width: span(s.first, s.last) }}
            >
              <span className="ds-ychart-sprint-name">{`Sprint ${s.number}`}</span>
            </span>
          );
        })}
      </div>
      <div className="ds-ychart-plot" role="group" aria-label={label || 'Performance score by week'}>
        {standardLines.map((l) => (
          <span key={`${l.from}-${l.value}`} className="ds-ychart-std" style={{ left: left(l.from), width: span(l.from, l.to), bottom: `${l.value}%`, '--std': l.value }}>
            <span className="ds-ychart-std-label">{`Standard ${l.value}%`}</span>
          </span>
        ))}
        {slots.map((s) => {
          const state = s.kind === 'sprint' ? s.state : s.kind;
          const bar = s.kind === 'sprint' && s.score != null && ['good', 'below', 'now'].includes(s.state);
          return (
            <div
              key={s.week}
              className={`ds-ychart-col${selected === s.week ? ' ds-ychart-col--picked' : ''}`}
              {...tipProps(s.tip || { value: `Week ${s.week}` })}
              data-week={s.week}
              onClick={() => pick(s.week)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  pick(s.week);
                }
              }}
            >
              {s.kind === 'recovery' && <RecoveryMark />}
              {bar
                ? <i className={`ds-ychart-bar ds-ychart-bar--${state}`} style={{ height: `${Math.max(0, Math.min(100, s.score))}%` }} />
                : s.kind !== 'recovery' && <i className={`ds-ychart-bar ds-ychart-bar--stub ds-ychart-bar--${state || 'empty'}`} />}
            </div>
          );
        })}
      </div>
      <div className="ds-ychart-axis" aria-hidden="true">
        {slots.filter((s) => s.week % 4 === 1 || s.week === n).map((s) => (
          <span key={s.week} className={`ds-ychart-wn${s.thisWeek ? ' ds-ychart-wn--now' : ''}`} style={{ left: left(s.week), width: span(s.week, s.week) }}>{s.week}</span>
        ))}
      </div>
      <div className="ds-ychart-months" aria-hidden="true">
        {months.map((m, i) => (
          <span key={m.label} className={`ds-ychart-month${i % 3 === 0 ? ' ds-ychart-month--quarter' : ''}`} style={{ left: left(m.week) }}>{m.label}</span>
        ))}
      </div>
    </ChartTips>
  );
}
