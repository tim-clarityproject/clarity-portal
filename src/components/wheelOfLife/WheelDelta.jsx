import { deltaView, formatCheckinDate } from '../../lib/wheelOfLife';
import { tipProps } from '../design/ChartTips';

// Each bar's pop-up (every mark has one, Tim 26 Oct): the change first,
// then the two check-ins it compares.
function deltaTip(r, first, last) {
  return {
    value: `${r.name} ${r.changeText}`,
    when: `${first} to ${last}`,
    extra: [r.start == null ? `New, now ${r.latest}.` : `From ${r.start} to ${r.latest}.`],
  };
}

// The Delta ("what moved") view, ported line for line from the approved
// mock-up's delta() (wheel-of-life.html). Desktop: one row per area with a
// bar from a centre line (rises to the right in green (Tim, 26 Oct), drops to the left in
// neutral grey, no change as a small grey dot), biggest rise first, areas new
// in the range at the bottom. Phone: grouped Rose, Dropped, No change, New
// in this range, each with a count, with a full-width bar track. The sort
// order and scale come from deltaView (src/lib/wheelOfLife.js).

/**
 * @param {object} props
 * @param {object[]} props.range - the check-ins in the range, oldest first (two or more)
 * @param {object[]} props.areas - the areas on the wheel, in wheel order
 * @param {boolean} props.phone - the grouped phone layout
 */
export default function WheelDelta({ range, areas, phone }) {
  const view = deltaView(range, areas);
  if (!view) return null;
  const first = formatCheckinDate(view.firstDate);
  const last = formatCheckinDate(view.latestDate);
  const startLatest = (r) => (r.start == null ? `new, now ${r.latest}` : `from ${r.start} to ${r.latest}`);

  if (phone) {
    // each row's place in the whole list, for the bars' stagger (1, 2, 3...)
    const offsets = view.groups.map((g, gi) => view.groups.slice(0, gi).reduce((n, x) => n + x.rows.length, 0));
    return (
      <>
        {view.groups.map((g, gi) => (
          <div className="wol-dg" key={g.label}>
            <span className="wol-dgl">{`${g.label} (${g.rows.length})`}</span>
            {g.rows.map((r, ri) => {
              const k = offsets[gi] + ri + 1;
              return (
                <div className="wol-dpr" key={r.area.key} style={{ '--k': k }}>
                  <div className="wol-dpt">
                    <span>{r.name}</span>
                    <b className={`wol-${r.changeClass}`}>{r.changeText}</b>
                  </div>
                  <div className="wol-dpb">
                    <span className="wol-trk">
                      {r.change ? <i className={`wol-${r.changeClass}`} style={{ '--w': `${r.fullPct.toFixed(1)}%` }} {...tipProps(deltaTip(r, first, last))} /> : null}
                    </span>
                    <small>{startLatest(r)}</small>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <p className="wol-dnote">Change from <b>{first}</b> to <b>{last}</b>.</p>
      </>
    );
  }

  return (
    <>
      <div className="wol-dr wol-dh">
        <span />
        <span className="wol-dsc"><span>Dropped</span><span>0</span><span>Rose</span></span>
        <span />
      </div>
      {view.rows.map((r, k) => (
        <div className="wol-dr" key={r.area.key} style={{ '--k': k }}>
          <span className="wol-dn2">{r.name}</span>
          <span className="wol-db">
            <i className="wol-ax" />
            {r.change == null || r.change === 0
              ? (r.change === 0 ? <b className="wol-z" {...tipProps(deltaTip(r, first, last))} /> : null)
              : <b className={`wol-${r.changeClass}`} style={{ '--w': `${r.halfPct.toFixed(2)}%` }} {...tipProps(deltaTip(r, first, last))} />}
          </span>
          <span className={`wol-dv wol-${r.changeClass}`}>
            {r.changeText}
            <small>{startLatest(r)}</small>
          </span>
        </div>
      ))}
      <p className="wol-dnote">Change from <b>{first}</b> to <b>{last}</b>, biggest rise first.</p>
    </>
  );
}
