import { useMemo } from 'react';
import { Button, PeakMomentList, PeakMomentRow, PeakWeekBars, Section } from '../../components/design';
import { PATH, metaItems, ringNote, sprintMoments, weekRings, whenWords } from '../../lib/peakMoments/model';
import './peakMoments.css';

// Peak moments on the sprint page (M18 "In the sprint"; Phase 8b part A).
//
// PeakSprintSection: the sprint's week bars as M18 draws them, with a ring
//   above each week that holds a peak moment, then the sprint's peak moments
//   and View your year. Its title is "Peak moments": on the sprint page "in
//   this sprint" is understood, and a title is at most three words (calm
//   rules; the UI tester, 18 Nov). It shows only when the sprint holds a
//   moment, so the page stays as M1 draws it otherwise. The big figure and
//   "This week so far" M18 puts above the bars are left out: the sprint
//   dial above already says them (Claude's call, for Tim to confirm).
// PeakDetails: Sprint details' list (brief, step 2): each moment and its day.

/** The sprint view's weeks as the bars want them. */
function barWeeks(view) {
  return (view.weeks || []).map((w) => ({
    number: w.number,
    start: w.start,
    end: w.end,
    value: w.state === 'now' ? w.score : (w.finished ? w.score : null),
    state: w.state,
  }));
}

export function PeakSprintSection({ view, moments, reviews, today, navigate }) {
  const weeks = useMemo(() => barWeeks(view), [view]);
  const rings = useMemo(() => weekRings(moments, weeks), [moments, weeks]);
  const list = useMemo(() => sprintMoments(moments, view.dates), [moments, view.dates]);
  if (!list.length) return null;
  const finished = weeks.filter((w) => w.value != null && w.state !== 'now');
  const atIt = finished.filter((w) => w.state === 'good').length;
  const below = finished.filter((w) => w.state === 'below').length;
  const now = weeks.find((w) => w.state === 'now');
  const count = list.length;
  const label = [
    `The sprint as ${weeks.length} week bars against your standard of ${view.standard}%`,
    `${atIt} ${atIt === 1 ? 'week' : 'weeks'} at it, ${below} below`,
    now?.value != null ? `this week so far ${now.value}%` : null,
    `with ${count} peak ${count === 1 ? 'moment' : 'moments'}`,
  ].filter(Boolean).join(', ');
  return (
    <Section title="Peak moments" className="ipp-section sprint-section peak-sprint">
      <PeakWeekBars weeks={weeks} standard={view.standard} rings={rings} reviews={reviews} today={today} label={label} />
      <PeakMomentList label="Peak moments in this sprint" className="peak-sprint-list">
        {list.map((o) => {
          const past = o.endsOn < today;
          return (
            <PeakMomentRow
              key={o.key}
              name={o.moment.name}
              meta={metaItems(o.moment, today)}
              date={whenWords(o.on, o.endsOn, today)}
              lesson={past ? ringNote(o, reviews, today) : null}
              onClick={past ? undefined : () => navigate(`${PATH}/edit/${o.moment.id}`, { state: { from: '/performance-sprint' } })}
            />
          );
        })}
      </PeakMomentList>
      <div className="ds-actions peak-sprint-link">
        <Button variant="text" onClick={() => navigate('/performance-sprint/year')}>View your year</Button>
        <Button variant="text" onClick={() => navigate(PATH)}>See all my peak moments</Button>
      </div>
    </Section>
  );
}

export function PeakDetails({ dates, moments, today }) {
  const list = sprintMoments(moments, dates);
  if (!list.length) return null;
  return (
    <div>
      <dt>Peak moments</dt>
      <dd>
        <ul className="peak-details-list">
          {list.map((o) => (
            <li key={o.key}>
              {o.moment.name}
              <span>{whenWords(o.on, o.endsOn, today)}</span>
            </li>
          ))}
        </ul>
      </dd>
    </div>
  );
}
