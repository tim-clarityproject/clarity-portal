import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import DesignHeader from '../../components/DesignHeader';
import PageHeading from '../../components/PageHeading';
import DeleteDialog, { showDeletedToast } from '../../components/ui/DeleteDialog';
import Toast from '../../components/ui/Toast';
import useToast from '../../hooks/useToast';
import WheelSectional from '../../components/wheelOfLife/WheelSectional';
import WheelRadar from '../../components/wheelOfLife/WheelRadar';
import WheelDelta from '../../components/wheelOfLife/WheelDelta';
import WheelSpark from '../../components/wheelOfLife/WheelSpark';
import { getLocalDateKey } from '../../lib/dateFormatter';
import {
  DEFAULT_PRESET, RANGE_PRESETS, activeAreas, areaName, checkinAverage, computeStats,
  effectiveChartStyle, focusToShow, formatCheckinDate, inRange, isInRange, newestCheckin,
  oneDecimal, presetRange, rangeEndingOn, removedAreaNames, tableRows,
} from '../../lib/wheelOfLife';
import { deleteCheckin, setChartStyle } from '../../lib/wheelOfLifeApi';
import useWheelData from './useWheelData';
import useArrivalToast from './useArrivalToast';
import useIsPhone from './useIsPhone';
import WheelLoadState from './WheelLoadState';
import {
  BinIcon, DeltaIcon, PenIcon, RadarIcon, SectionalIcon, TargetIcon,
} from './icons';
import '../../styles/wheelOfLife.css';

const fd = formatCheckinDate;
const MINUS = '−';

// /wheel-of-life/results - the one-pager of the approved mock-up
// (wheel-of-life.html R.onepager, legend, delta, spark), with real data
// and the logic in src/lib/wheelOfLife.js (spec section 6). Everything is
// worked out from the areas on the wheel NOW; the date range picks which
// check-ins are compared. /wheel-of-life/results?to=YYYY-MM-DD (from
// My Reviews) opens the six months up to that date.
export default function WheelResults() {
  const location = useLocation();
  const { message, showToast } = useToast();
  useArrivalToast(showToast);
  const data = useWheelData({ withChartStyle: true });

  if (data.loading || data.error) {
    return <WheelLoadState loading={data.loading} error={data.error} onRetry={data.reload} toast={message} />;
  }
  const to = new URLSearchParams(location.search).get('to');
  return (
    <OnePager
      all={data.areas.all}
      initialCheckins={data.checkins}
      initialStyle={data.chartStyle}
      initialTo={/^\d{4}-\d{2}-\d{2}$/.test(to || '') ? to : null}
      savedId={location.state?.savedId || null}
      toast={message}
      showToast={showToast}
    />
  );
}

function Legend({ style, range, hasTargets }) {
  const one = range.length === 1;
  const first = range[0];
  const last = range[range.length - 1];
  const tl = hasTargets ? <span><i className="wol-tgt" />Your targets</span> : null;
  if (style === 'sectional') {
    return (
      <div className="wol-leg">
        <span><i className="wol-f" />{`${fd(last.date)}${one ? '' : ' (latest)'}`}</span>
        {one ? null : <span><i className="wol-s wol-w" />{`${fd(first.date)} (start)`}</span>}
        {tl}
      </div>
    );
  }
  return (
    <div className="wol-leg">
      <span><i />{`${fd(last.date)}${one ? '' : ' (latest)'}`}</span>
      {one ? null : (
        <>
          <span><i className="wol-s" />{`${fd(first.date)} (start)`}</span>
          {range.length > 2 ? <span><i className="wol-o" />{`${range.length - 2} in between`}</span> : null}
        </>
      )}
      {tl}
    </div>
  );
}

function Stat({ label, value, note }) {
  return <div><b>{label}</b><strong>{value}</strong><span>{note}</span></div>;
}

function OnePager({ all, initialCheckins, initialStyle, initialTo, savedId, toast, showToast }) {
  const navigate = useNavigate();
  const location = useLocation();
  const phone = useIsPhone();
  const here = `${location.pathname}${location.search}`;
  const [checkins, setCheckins] = useState(initialCheckins);
  const [rangeChoice, setRangeChoice] = useState(() => (initialTo ? rangeEndingOn(initialTo) : { preset: DEFAULT_PRESET }));
  const [style, setStyle] = useState(initialStyle);
  const [toDelete, setToDelete] = useState(null);

  const areas = activeAreas(all);
  const today = getLocalDateKey();
  const acts = (
    <div className="wol-acts">
      <button type="button" className="ui-btn-primary" onClick={() => navigate('/wheel-of-life/check-in')}>New check-in</button>
      <button type="button" className="wol-qlink" onClick={() => navigate('/wheel-of-life/targets', { state: { from: here } })}><TargetIcon />Set targets</button>
      <button type="button" className="wol-qlink" onClick={() => navigate('/wheel-of-life/areas', { state: { from: here } })}><PenIcon />Change your areas</button>
    </div>
  );

  const confirmDelete = async () => {
    const id = toDelete;
    setToDelete(null);
    const res = await deleteCheckin(id);
    if (res.error) {
      showToast(res.error.message);
      return;
    }
    setCheckins((list) => list.filter((c) => c.id !== id));
    showDeletedToast(showToast);
  };
  const deleteDialog = (
    <DeleteDialog
      open={!!toDelete}
      title="Delete this check-in?"
      body="This cannot be undone."
      onConfirm={confirmDelete}
      onCancel={() => setToDelete(null)}
    />
  );

  // No check-ins at all.
  if (!checkins.length) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page wol-page wol-enter">
          <div className="wol-head"><PageHeading pageKey="wheelOfLifeResults" title="Wheel of Life" /></div>
          <p className="wol-empty wol-rv" style={{ '--i': 3 }}>No check-ins yet. Start your first check-in to see your wheel.</p>
          <div className="wol-acts wol-rv" style={{ '--i': 4 }}>
            <button type="button" className="ui-btn-primary" onClick={() => navigate('/wheel-of-life/check-in')}>Start check-in</button>
          </div>
        </div>
        {deleteDialog}
        <Toast message={toast} />
      </div>
    );
  }

  // The range: a preset is counted back from the newest check-in, so it
  // follows a deletion; custom dates stay as typed.
  const r = rangeChoice.preset ? presetRange(rangeChoice.preset, checkins) : rangeChoice;
  const rg = inRange(checkins, r.from, r.to);
  const newest = newestCheckin(checkins);
  const setDate = (k, v) => {
    if (!v) return;
    setRangeChoice({ preset: '', from: k === 'from' ? v : r.from, to: k === 'to' ? v : r.to });
  };

  let summary;
  if (rg.length > 1) summary = <>Comparing <b>{fd(rg[0].date)}</b> with <b>{fd(rg[rg.length - 1].date)}</b>{` · ${rg.length} check-ins`}</>;
  else if (rg.length === 1) summary = <>One check-in in this range, <b>{fd(rg[0].date)}</b>. Widen the range to compare.</>;
  else summary = 'No check-ins in this range.';

  const header = (
    <>
      <div className="wol-oph">
        <div className="wol-head"><PageHeading pageKey="wheelOfLifeResults" title="Wheel of Life" /></div>
        <span className="wol-opd">{`Latest check-in ${fd(newest.date)}`}</span>
      </div>
      <div className="wol-range wol-rv" style={{ '--i': 3 }}>
        <div className="wol-rtop">
          <small>Date range</small>
          <div className="wol-pre" role="group" aria-label="Date range">
            {RANGE_PRESETS.map((p) => (
              <button key={p.key} type="button" aria-pressed={rangeChoice.preset === p.key} onClick={() => setRangeChoice({ preset: p.key })}>{p.label}</button>
            ))}
          </div>
        </div>
        <div className="wol-dates">
          <div>
            <label htmlFor="wol-from">From</label>
            <input type="date" id="wol-from" value={r.from} max={today} onChange={(e) => setDate('from', e.target.value)} />
          </div>
          <div>
            <label htmlFor="wol-to">To</label>
            <input type="date" id="wol-to" value={r.to} max={today} onChange={(e) => setDate('to', e.target.value)} />
          </div>
        </div>
        <div className="wol-rsum">{summary}</div>
      </div>
    </>
  );

  if (!rg.length) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page wol-page wol-enter">
          {header}
          <p className="wol-empty">No check-ins between these dates. Choose a wider range, or start a new check-in.</p>
          {acts}
        </div>
        {deleteDialog}
        <Toast message={toast} />
      </div>
    );
  }

  const first = rg[0];
  const last = rg[rg.length - 1];
  const one = rg.length === 1;
  const view = effectiveChartStyle(style, areas.length, rg.length);
  const targets = Object.fromEntries(areas.map((a) => [a.key, a.target ?? null]));
  const hasTargets = areas.some((a) => a.target != null);
  const series = [];
  if (!one) {
    rg.slice(1, -1).forEach((c) => series.push({ cls: 'o', scores: c.scores }));
    series.push({ cls: 'start', scores: first.scores });
  }
  series.push({ cls: 'now', scores: last.scores });

  const chooseStyle = (next) => {
    if (next === style) return;
    setStyle(next);
    setChartStyle(next);
  };

  const s = computeStats(rg, areas);
  const name = (x) => (x ? areaName(x.area) : '');
  let fourth;
  if (s.targets) {
    fourth = s.targets.allMet
      ? <Stat label="Targets" value="All met" note={`${s.targets.onTarget} of ${s.targets.withTarget} on target`} />
      : <Stat label="Furthest from target" value={`${s.targets.gap} below`} note={`${areaName(s.targets.area)} · ${s.targets.onTarget} of ${s.targets.withTarget} on target`} />;
  }
  let stats;
  if (one) {
    stats = (
      <>
        <Stat label="Average" value={oneDecimal(s.average)} note="out of 10" />
        <Stat label="Highest" value={s.highest ? s.highest.score : '–'} note={name(s.highest)} />
        <Stat label="Lowest" value={s.lowest ? s.lowest.score : '–'} note={name(s.lowest)} />
        {fourth || <Stat label="Areas at 7+" value={s.atSevenPlus.count} note={`of ${s.atSevenPlus.of}`} />}
      </>
    );
  } else {
    stats = (
      <>
        <Stat label="Average" value={oneDecimal(s.average)} note={`${s.averageUp ? 'Up ' : 'Down '}${oneDecimal(s.averageMove)} from ${oneDecimal(s.averageFrom)}`} />
        <Stat label="Biggest rise" value={s.biggestRise ? `+${s.biggestRise.change}` : '–'} note={s.biggestRise ? name(s.biggestRise) : 'No rises'} />
        <Stat label="Biggest drop" value={s.biggestDrop ? `${MINUS}${Math.abs(s.biggestDrop.change)}` : '–'} note={s.biggestDrop ? name(s.biggestDrop) : 'No drops'} />
        {fourth || <Stat label="Lowest now" value={s.lowest ? s.lowest.score : '–'} note={name(s.lowest)} />}
      </>
    );
  }

  const focus = focusToShow(rg, areas);
  const rows = tableRows(rg, areas);
  const gone = removedAreaNames(all);
  const history = [...checkins].sort((x, y) => (y.date === x.date ? y.checkinAt - x.checkinAt : (y.date > x.date ? 1 : -1)));
  const Chart = view.style === 'radar' ? WheelRadar : WheelSectional;
  const size = phone ? 'phone' : 'desktop';

  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="plan-page wol-page wol-enter">
        {header}

        <div className="wol-whd">
          <span className="wol-lab">Your wheel</span>
          <div className="wol-seg" role="group" aria-label="Chart style">
            <button type="button" aria-pressed={view.style === 'sectional'} onClick={() => chooseStyle('sectional')}><SectionalIcon />Sectional</button>
            <i aria-hidden="true" />
            <button type="button" aria-pressed={view.style === 'radar'} disabled={!view.radarAllowed} title={view.radarAllowed ? undefined : 'Radar needs at least three areas'} onClick={() => chooseStyle('radar')}><RadarIcon />Radar</button>
            <i aria-hidden="true" />
            <button type="button" aria-pressed={view.style === 'delta'} disabled={!view.deltaAllowed} title={view.deltaAllowed ? undefined : 'Delta needs two check-ins in the range'} onClick={() => chooseStyle('delta')}><DeltaIcon />Delta</button>
          </div>
        </div>

        {view.style === 'delta' ? (
          <div key="delta" className="wol-panel wol-delta wol-enter">
            <WheelDelta range={rg} areas={areas} phone={phone} />
          </div>
        ) : (
          <div key={view.style} className="wol-wheel wol-enter">
            <Chart
              areas={areas}
              series={series}
              targets={targets}
              labelValues={last.scores}
              size={size}
              labels
              ticks
              aria={`Wheel of Life, ${fd(last.date)}`}
            />
            <Legend style={view.style} range={rg} hasTargets={hasTargets} />
          </div>
        )}

        <div className="wol-panel wol-stats">{stats}</div>

        {s.showTargetsCard ? (
          <div className="wol-tgcard">
            <div>
              <b>Set your targets</b>
              <p>Not every area needs to be a 10. Choose the score you’d be happy with in each area, and your wheel will show how close you are.</p>
            </div>
            <button type="button" className="ui-btn-ghost" onClick={() => navigate('/wheel-of-life/targets', { state: { from: here } })}><TargetIcon />Set targets</button>
          </div>
        ) : null}

        {focus ? (
          <div className="wol-focus">
            <b>Your focus from this check-in</b>
            <p>{focus.name}{focus.note ? <>. <em>{focus.note}</em></> : null}</p>
          </div>
        ) : null}

        <span className="wol-lab">{one ? 'Your scores' : 'Area by area'}</span>
        <div className="wol-panel wol-tb">
          <div className="wol-th">
            <span>Area</span><span>{fd(first.date, false)}</span><span>{fd(last.date, false)}</span><span>Change</span><span>Target</span><span>Over time</span>
          </div>
          {rows.map((row) => {
            const tg = row.targetStatus ? <em className={row.targetStatus.met ? 'wol-ok' : undefined}>{row.targetStatus.text}</em> : null;
            return (
              <div className="wol-tr" key={row.area.key}>
                <span className="wol-nm">
                  {row.name}
                  {row.own ? <small className="wol-was">{`Your own area${row.addedSince ? `, added since ${row.addedSince}` : ''}`}</small> : null}
                  {row.target != null ? <small className="wol-tgm">{`Target ${row.target}`}{tg ? <>{' · '}{tg}</> : null}</small> : null}
                </span>
                <span className="wol-ch">
                  <span className="wol-v wol-v--s">{one ? '' : (row.isNew ? '–' : row.start)}</span>
                  <span className="wol-v wol-v--n">{row.latest == null ? '–' : row.latest}</span>
                  <span className={`wol-dl wol-${row.changeClass}`}>{row.changeText}</span>
                </span>
                <span className="wol-tgc">{row.target == null ? <span className="wol-nt">–</span> : <><b>{row.target}</b>{tg}</>}</span>
                <span className="wol-sp"><WheelSpark vals={row.history} w={phone ? 200 : 140} /></span>
              </div>
            );
          })}
        </div>

        {gone.length ? (
          <p className="wol-gone">
            {`Not on your wheel: ${gone.join(', ')}. Past scores are kept. `}
            <button type="button" className="wol-qlink wol-qlink--in" onClick={() => navigate('/wheel-of-life/areas', { state: { from: here } })}>Change your areas</button>
          </p>
        ) : null}

        <span className="wol-lab">All check-ins</span>
        <div className="wol-hist">
          {history.map((c) => {
            const on = isInRange(c, r.from, r.to);
            return (
              <div className={`wol-hr${on ? '' : ' wol-hr--out'}`} key={c.id}>
                <div className="wol-hw">
                  <b>{fd(c.date)}{c.id === savedId ? <span className="wol-tg wol-tg--c">New</span> : null}</b>
                  <span>{on ? 'In this range' : 'Outside this range'}</span>
                </div>
                <span className="wol-avg">{`${oneDecimal(checkinAverage(c, areas))} avg`}</span>
                <button type="button" className="wol-ib" aria-label={`Delete check-in, ${fd(c.date)}`} onClick={() => setToDelete(c.id)}><BinIcon /></button>
              </div>
            );
          })}
        </div>

        {acts}
      </div>
      {deleteDialog}
      <Toast message={toast} />
    </div>
  );
}
