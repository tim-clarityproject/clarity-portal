import ChartTips, { tipProps } from './ChartTips';
import './design.css';

// Charts on screen (Tim, 26 Oct; design reference v15, M4 dashboard v46).
// - Mint means good: weeks at or above the standard. Below the standard
//   is neutral grey; this week is the text colour (white in dark, black
//   in light); weeks to come are faint. Coral is never a data colour.
// - No keys: things are labelled where they are (the standard as a
//   labelled line at its right end, "Best" and "So far" on their bars,
//   week or sprint names along the bottom), and every mark has a pop-up.
// - No empty charts: until there's data, say what's coming instead.
//
// A week: { label: 'W1' (along the bottom), when: 'Sprint 4, week 1'
// (in its pop-up), value: 88 (or null when to come), now: true for this
// week so far }.

function weekState(w, standard) {
  if (w.value == null) return 'next';
  if (w.now) return 'now';
  return w.value >= standard ? 'good' : 'below';
}

// The dial: one segment per week of a sprint, the week in the middle.
// weeks: as above; title: what it shows, for screen readers.
export function Dial({ weeks, standard, title = 'Sprint dial', valueWords = (v) => `Performance score ${v}%` }) {
  const n = weeks.length;
  const nowIndex = weeks.findIndex((w) => w.now);
  const current = nowIndex >= 0 ? nowIndex + 1 : weeks.filter((w) => w.value != null).length;
  const R = 46;
  const C = 60;
  const GAP = 5;
  const pt = (a) => [C + R * Math.cos((a * Math.PI) / 180), C + R * Math.sin((a * Math.PI) / 180)];
  return (
    <ChartTips className="ds-dial">
      <svg viewBox="0 0 120 120" role="group" aria-label={`${title}: week ${current} of ${n}`}>
        {weeks.map((w, i) => {
          const a0 = -90 + (i * 360) / n + GAP / 2;
          const a1 = -90 + ((i + 1) * 360) / n - GAP / 2;
          const [x0, y0] = pt(a0);
          const [x1, y1] = pt(a1);
          const state = weekState(w, standard);
          const words = state === 'next' ? 'To come' : valueWords(w.value);
          const extra = state === 'next' || state === 'now' ? [] : [state === 'good' ? 'At or above your standard' : 'Below your standard'];
          return (
            <path
              key={w.when || i}
              className={`ds-dial-seg ds-dial-seg--${state}`}
              d={`M${x0.toFixed(2)} ${y0.toFixed(2)}A${R} ${R} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`}
              {...tipProps({ value: words, when: `${w.when}${state === 'now' ? ', so far' : ''}`, extra })}
            />
          );
        })}
        <text x="60" y="56" textAnchor="middle" className="ds-dial-small" aria-hidden="true">Week</text>
        <text x="60" y="76" textAnchor="middle" className="ds-dial-big" aria-hidden="true">{`${current} of ${n}`}</text>
      </svg>
    </ChartTips>
  );
}

// The week chart: one bar per week, drawn to scale from zero, the
// standard as a dashed line labelled at its right end, "So far" under
// this week (in place of its name, as M4 v46, so it never meets the
// standard's label) and "Best" on the best finished week. When the best
// week is one of the last two, the standard's label sits under the line
// so the two never touch.
// weeks: as above; standard: e.g. 85; max: the top of the scale.
// label: what it shows, said first ("Performance score by week").
export function WeekChart({ weeks, standard, max = 100, label, valueWords = (v) => `Performance score ${v}%`, standardWords = `Standard ${standard}%`, empty = 'Your graph starts here after your first week.' }) {
  if (!weeks.some((w) => w.value != null)) {
    return <p className="ds-chart-empty">{empty}</p>;
  }
  const finished = weeks.filter((w) => w.value != null && !w.now);
  const best = finished.length > 1 ? finished.reduce((a, b) => (b.value > a.value ? b : a)) : null;
  const pct = (v) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  const bestNearEnd = best && weeks.indexOf(best) >= weeks.length - 2;
  return (
    <ChartTips className="ds-wchart">
      {label && <p className="ds-chart-label">{label}</p>}
      <div className="ds-wchart-plot" role="group" aria-label={label || 'Week by week'}>
        <span className={`ds-wchart-std${bestNearEnd ? ' ds-wchart-std--under' : ''}`} style={{ bottom: pct(standard) }}>
          <span className="ds-wchart-std-label">{standardWords}</span>
        </span>
        {weeks.map((w) => {
          const state = weekState(w, standard);
          const isBest = best === w;
          const extra = [];
          if (state === 'good') extra.push('At or above your standard');
          if (state === 'below') extra.push('Below your standard');
          if (isBest) extra.push('Best week so far');
          return (
            <div className="ds-wchart-col" key={w.when || w.label}>
              <i
                className={`ds-wchart-bar ds-wchart-bar--${state}`}
                style={{ height: state === 'next' ? undefined : pct(w.value) }}
                {...tipProps({ value: state === 'next' ? 'To come' : valueWords(w.value), when: `${w.when}${w.now ? ', so far' : ''}`, extra })}
              >
                {isBest && <em className="ds-wchart-tag" aria-hidden="true">Best</em>}
              </i>
            </div>
          );
        })}
      </div>
      <div className="ds-wchart-axis" aria-hidden="true">
        {weeks.map((w) => <span key={w.when || w.label} className={w.now ? 'ds-wchart-now' : undefined}>{w.now ? 'So far' : w.label}</span>)}
      </div>
    </ChartTips>
  );
}
