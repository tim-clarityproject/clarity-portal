import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import DesignHeader from '../../components/DesignHeader';
import pageText from '../../content/pageText';
import DeleteDialog from '../../components/ui/DeleteDialog';
import {
  Button, ChartTips, Choice, DatePicker, EmptyState, PageHeader, useToast,
} from '../../components/design';
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
const PRESET_OPTIONS = RANGE_PRESETS.map((p) => ({ value: p.key, label: p.label }));

// /wheel-of-life/results - the one-pager of the approved mock-up
// (wheel-of-life.html R.onepager, legend, delta, spark), with real data
// and the logic in src/lib/wheelOfLife.js (spec section 6). Everything is
// worked out from the areas on the wheel NOW; the date range picks which
// check-ins are compared. /wheel-of-life/results?to=YYYY-MM-DD (from
// My Reviews) opens the six months up to that date.
export default function WheelResults() {
  const location = useLocation();
  const toast = useToast();
  useArrivalToast(toast.show);
  const data = useWheelData({ withChartStyle: true });

  if (data.loading || data.error) {
    return <WheelLoadState loading={data.loading} error={data.error} onRetry={data.reload} />;
  }
  const to = new URLSearchParams(location.search).get('to');
  return (
    <OnePager
      all={data.areas.all}
      initialCheckins={data.checkins}
      initialStyle={data.chartStyle}
      initialTo={/^\d{4}-\d{2}-\d{2}$/.test(to || '') ? to : null}
      savedId={location.state?.savedId || null}
    />
  );
}

// What the wheel shows, said in words under it (Tim, 26 Oct: no keys,
// label things directly). One sentence per line. Every area also has
// its own pop-up.
function WheelWords({ style, range, hasTargets }) {
  const one = range.length === 1;
  const first = fd(range[0].date);
  const last = fd(range[range.length - 1].date);
  const lines = [];
  if (style === 'sectional') {
    lines.push(`Each slice is filled to your score on ${last}.`);
    if (!one) lines.push(`The faint line in each slice marks your score on ${first}, and green slices went up.`);
    if (hasTargets) lines.push('The dashed arc is your target, and it turns green once reached.');
  } else {
    lines.push(`The outline is your latest check-in, on ${last}.`);
    if (!one) lines.push(`The faint dashed outline is ${first}, and green dots show the areas that went up.`);
    if (hasTargets) lines.push('The dotted line shows your targets.');
  }
  return (
    <div className="wol-words">
      {lines.map((l) => <p key={l}>{l}</p>)}
    </div>
  );
}

// good: a rise, in green (Tim, 26 Oct).
function Stat({ label, value, note, good = false }) {
  return <div><b>{label}</b><strong className={good ? 'wol-good' : undefined}>{value}</strong><span>{note}</span></div>;
}

function OnePager({ all, initialCheckins, initialStyle, initialTo, savedId }) {
  const toast = useToast();
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
      <Button variant="primary" onClick={() => navigate('/wheel-of-life/check-in')}>New check-in</Button>
      <Button variant="text" className="wol-qlink" onClick={() => navigate('/wheel-of-life/targets', { state: { from: here } })}><TargetIcon />Set targets</Button>
      <Button variant="text" className="wol-qlink" onClick={() => navigate('/wheel-of-life/areas', { state: { from: here } })}><PenIcon />Change your areas</Button>
    </div>
  );

  const confirmDelete = async () => {
    const id = toDelete;
    setToDelete(null);
    const res = await deleteCheckin(id);
    if (res.error) {
      toast.error(res.error.message);
      return;
    }
    setCheckins((list) => list.filter((c) => c.id !== id));
    toast.show('Deleted');
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
          <div className="wol-head"><PageHeader title="Wheel of Life" info={pageText.wheelOfLifeResults} /></div>
          <div className="wol-rv" style={{ '--i': 3 }}>
            <EmptyState
              question="No check-ins yet. Start your first check-in to see your wheel."
              action={{ label: 'Start check-in', onClick: () => navigate('/wheel-of-life/check-in') }}
            />
          </div>
        </div>
        {deleteDialog}
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
  if (rg.length > 1) summary = <>Comparing <b>{fd(rg[0].date)}</b> with <b>{fd(rg[rg.length - 1].date)}</b>{`, across ${rg.length} check-ins.`}</>;
  else if (rg.length === 1) summary = <>One check-in in this range, <b>{fd(rg[0].date)}</b>. Widen the range to compare.</>;
  else summary = 'No check-ins in this range.';

  const header = (
    <>
      <div className="wol-head">
        <PageHeader title="Wheel of Life" info={pageText.wheelOfLifeResults} meta={[`Latest check-in ${fd(newest.date)}`]} />
      </div>
      <div className="wol-range wol-rv" style={{ '--i': 3 }}>
        <div className="wol-rtop">
          <small>Date range</small>
          <Choice
            className="wol-pre"
            ariaLabel="Date range"
            options={PRESET_OPTIONS}
            value={rangeChoice.preset}
            onChange={(key) => setRangeChoice({ preset: key })}
          />
        </div>
        <div className="wol-dates">
          <div>
            <DatePicker label="From" value={r.from} min="1900-01-01" max={today} onChange={(key) => setDate('from', key)} />
          </div>
          <div>
            <DatePicker label="To" value={r.to} min="1900-01-01" max={today} onChange={(key) => setDate('to', key)} />
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
          <EmptyState question="No check-ins between these dates. Choose a wider range, or start a new check-in." />
          {acts}
        </div>
        {deleteDialog}
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
      : <Stat label="Furthest from target" value={`${s.targets.gap} below`} note={`${areaName(s.targets.area)} has the furthest to go. ${s.targets.onTarget} of ${s.targets.withTarget} areas are on target.`} />;
  }
  let stats;
  if (one) {
    stats = (
      <>
        <Stat label="Average" value={oneDecimal(s.average)} note="out of 10" />
        <Stat label="Highest" value={s.highest ? s.highest.score : 'None'} note={name(s.highest)} />
        <Stat label="Lowest" value={s.lowest ? s.lowest.score : 'None'} note={name(s.lowest)} />
        {fourth || <Stat label="Areas at 7+" value={s.atSevenPlus.count} note={`of ${s.atSevenPlus.of}`} />}
      </>
    );
  } else {
    stats = (
      <>
        <Stat label="Average" value={oneDecimal(s.average)} good={s.averageUp && s.averageMove > 0} note={`${s.averageUp ? 'Up ' : 'Down '}${oneDecimal(s.averageMove)} from ${oneDecimal(s.averageFrom)}`} />
        <Stat label="Biggest rise" value={s.biggestRise ? `+${s.biggestRise.change}` : 'None'} good={!!s.biggestRise} note={s.biggestRise ? name(s.biggestRise) : 'No rises'} />
        <Stat label="Biggest drop" value={s.biggestDrop ? `${MINUS}${Math.abs(s.biggestDrop.change)}` : 'None'} note={s.biggestDrop ? name(s.biggestDrop) : 'No drops'} />
        {fourth || <Stat label="Lowest now" value={s.lowest ? s.lowest.score : 'None'} note={name(s.lowest)} />}
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
            <button type="button" aria-pressed={view.style === 'radar'} disabled={!view.radarAllowed} aria-describedby={view.radarAllowed ? undefined : 'wol-why-radar'} onClick={() => chooseStyle('radar')}><RadarIcon />Radar</button>
            <i aria-hidden="true" />
            <button type="button" aria-pressed={view.style === 'delta'} disabled={!view.deltaAllowed} aria-describedby={view.deltaAllowed ? undefined : 'wol-why-delta'} onClick={() => chooseStyle('delta')}><DeltaIcon />Delta</button>
          </div>
        </div>
        {/* Why a chart style can't be chosen, in words rather than the
            browser's own hover label (Tim, 26 Oct). */}
        {!view.radarAllowed || !view.deltaAllowed ? (
          <div className="wol-why">
            {!view.radarAllowed ? <p id="wol-why-radar">Radar needs at least three areas.</p> : null}
            {!view.deltaAllowed ? <p id="wol-why-delta">Delta needs two check-ins in the date range.</p> : null}
          </div>
        ) : null}

        {view.style === 'delta' ? (
          <div key="delta" className="wol-panel wol-delta wol-enter">
            <ChartTips><WheelDelta range={rg} areas={areas} phone={phone} /></ChartTips>
          </div>
        ) : (
          <div key={view.style} className="wol-wheel wol-enter">
            <ChartTips>
            <Chart
              areas={areas}
              series={series}
              targets={targets}
              labelValues={last.scores}
              size={size}
              labels
              ticks
              aria={`Wheel of Life, ${fd(last.date)}`}
              when={fd(last.date)}
              startWhen={one ? undefined : fd(first.date)}
            />
            </ChartTips>
            <WheelWords style={view.style} range={rg} hasTargets={hasTargets} />
          </div>
        )}

        <div className="wol-panel wol-stats">{stats}</div>

        {s.showTargetsCard ? (
          <div className="wol-tgcard">
            <div>
              <b>Set your targets</b>
              <p>Not every area needs to be a 10. Choose the score you’d be happy with in each area, and your wheel will show how close you are.</p>
            </div>
            <Button variant="outline" onClick={() => navigate('/wheel-of-life/targets', { state: { from: here } })}><TargetIcon />Set targets</Button>
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
                  {row.target != null ? <small className="wol-tgm">{`Target ${row.target}`}{tg ? <>{', '}{tg}</> : null}</small> : null}
                </span>
                <span className="wol-ch">
                  <span className="wol-v wol-v--s">{one ? '' : (row.isNew ? 'None' : row.start)}</span>
                  <span className="wol-v wol-v--n">{row.latest == null ? 'None' : row.latest}</span>
                  <span className={`wol-dl wol-${row.changeClass}`}>{row.changeText}</span>
                </span>
                <span className="wol-tgc">{row.target == null ? <span className="wol-nt">No target</span> : <><b>{row.target}</b>{tg}</>}</span>
                <span className="wol-sp"><WheelSpark vals={row.history} w={phone ? 200 : 140} /></span>
              </div>
            );
          })}
        </div>

        {gone.length ? (
          <p className="wol-gone">
            {`Not on your wheel: ${gone.join(', ')}. Past scores are kept. `}
            <Button variant="text" className="wol-qlink wol-qlink--in" onClick={() => navigate('/wheel-of-life/areas', { state: { from: here } })}>Change your areas</Button>
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
    </div>
  );
}
