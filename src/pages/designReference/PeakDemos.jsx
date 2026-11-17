import { useMemo } from 'react';
import { PeakMomentList, PeakMomentRow, PeakWeekBars, PeakYearList } from '../../components/design';
import { metaItems, tidyMoment, weekRings, whenWords, yearMonths } from '../../lib/peakMoments/model';

// Peak moments' shared parts in the gallery (M18, version 28; Phase 8b),
// with M18's own invented moments and sprint, on M18's own day (Wed 28 Oct 2026).

const TODAY = '2026-10-28';
const m = (id, name, kind, area, startsOn, endsOn, more = {}) => tidyMoment({ id, name, kind, area, startsOn, endsOn: endsOn || startsOn, ...more });
const MOMENTS = [
  m('cup', 'Cup final', 'perform', 'work', '2026-10-31'),
  m('board', 'Monthly board meeting', 'perform', 'work', '2026-10-06', null, { repeat: { every: 'month_weekday' } }),
  m('away', 'Board away-day', 'perform', 'work', '2026-10-09'),
  m('investor', 'Investor call', 'perform', 'work', '2026-10-15'),
  m('mum', 'Mum’s 70th', 'present', 'personal', '2026-11-21'),
  m('ski', 'Ski holiday', 'rested', 'personal', '2026-12-19', '2026-12-26'),
];
const REVIEWS = {
  'board:2026-10-06': { momentId: 'board', occursOn: '2026-10-06', answer: 'well', lesson: 'Preparing two days early took the pressure off.' },
  'away:2026-10-09': { momentId: 'away', occursOn: '2026-10-09', answer: 'well', lesson: 'Kept the evening before clear.' },
  'investor:2026-10-15': { momentId: 'investor', occursOn: '2026-10-15', answer: 'very_well', lesson: 'A quiet evening before made the difference.' },
};
// Sprint 4: 7 Sep to 1 Nov, week 8 of 8 (M18's bars: 88, 91, 79, 86, 92, 84, 89, 86 against 85).
const VALUES = [88, 91, 79, 86, 92, 84, 89, 86];
const WEEKS = VALUES.map((v, i) => {
  const start = new Date(Date.UTC(2026, 8, 7 + 7 * i)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(2026, 8, 13 + 7 * i)).toISOString().slice(0, 10);
  return { number: i + 1, start, end, value: v, state: i === 7 ? 'now' : v >= 85 ? 'good' : 'below' };
});

export function PeakPartsDemo() {
  const rings = useMemo(() => weekRings(MOMENTS, WEEKS), []);
  const months = useMemo(() => yearMonths(MOMENTS, [
    { number: 4, start: '2026-09-07', end: '2026-11-01', running: true },
    { number: 5, start: '2026-11-02', end: '2026-12-27' },
  ], TODAY), []);
  return (
    <div className="dr-stack">
      <PeakMomentList label="Coming up">
        {[MOMENTS[0], MOMENTS[1], MOMENTS[4], MOMENTS[5]].map((x) => (
          <PeakMomentRow key={x.id} name={x.name} meta={metaItems(x, TODAY)} date={whenWords(x.id === 'board' ? '2026-11-03' : x.startsOn, x.id === 'board' ? '2026-11-03' : x.endsOn, TODAY)} onClick={() => {}} />
        ))}
        <PeakMomentRow name="Investor call" meta={metaItems(MOMENTS[3], TODAY)} date="Thu 15 Oct" lesson="A quiet evening before made the difference." />
      </PeakMomentList>
      <PeakWeekBars
        weeks={WEEKS}
        standard={85}
        rings={rings}
        reviews={REVIEWS}
        today={TODAY}
        label="The sprint as 8 week bars against your standard of 85%: 5 weeks at it, 2 below, this week so far 86%, with 4 peak moments"
      />
      <PeakYearList months={months} />
    </div>
  );
}
