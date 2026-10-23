import { useContext, useLayoutEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import DesignHeader from '../../components/DesignHeader';
import { PageHeader, TextBox } from '../../components/design';
import pageText from '../../content/pageText';
import DiscardDialog from '../../components/ui/DiscardDialog';
import WheelSectional from '../../components/wheelOfLife/WheelSectional';
import WheelRadar from '../../components/wheelOfLife/WheelRadar';
import { getLocalDateKey } from '../../lib/dateFormatter';
import {
  FOCUS_NOTE_MAX, NOTE_MAX, activeAreas, areaName, formatCheckinDate, lastScoreFor,
  miniWheelStyle, questionFor, reconcileInProgress,
} from '../../lib/wheelOfLife';
import {
  clearInProgress, createCheckin, readInProgress, writeInProgress,
} from '../../lib/wheelOfLifeApi';
import useWheelData from './useWheelData';
import WheelFooter from './WheelFooter';
import WheelLoadState from './WheelLoadState';
import '../../styles/wheelOfLife.css';

const SCORES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const SAVE_FAILED = 'Your check-in hasn’t saved yet. Check your connection and try again.';

// /wheel-of-life/check-in - one rating screen per area on the wheel, then
// Choose one area (the approved mock-up's R.rate and R.reflect). Nothing
// reaches the database until Finish check-in; until then every tap and
// keystroke is kept in this browser (wheelOfLifeApi in-progress helpers),
// so a refresh resumes on the same screen.
export default function WheelCheckIn() {
  const { user } = useContext(AuthContext);
  const data = useWheelData({ withChartStyle: true });

  if (data.loading || data.error) {
    return <WheelLoadState loading={data.loading} error={data.error} onRetry={data.reload} />;
  }
  return (
    <CheckIn
      userId={user?.id}
      areas={activeAreas(data.areas.all)}
      checkins={data.checkins}
      chartStyle={data.chartStyle}
    />
  );
}

function startState(userId, areas) {
  const saved = readInProgress(userId);
  if (!saved) {
    // Nothing is stored until the first tap; this is the start time it will carry.
    return { startedAt: Date.now(), screenIndex: 0, scores: {}, notes: {}, focusAreaKey: null, focusNote: '' };
  }
  const r = reconcileInProgress(saved, areas);
  return {
    startedAt: saved.startedAt,
    screenIndex: r.screenIndex,
    scores: r.scores,
    notes: r.notes,
    focusAreaKey: r.focusAreaKey,
    focusNote: r.focusNote,
  };
}

function CheckIn({ userId, areas, checkins, chartStyle }) {
  const navigate = useNavigate();
  const [st, setSt] = useState(() => startState(userId, areas));
  const [discardOpen, setDiscardOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const N = areas.length;
  const i = st.screenIndex;
  const onReflect = i >= N;
  const area = onReflect ? null : areas[i];

  // A new screen opens at the top (the route does not change, so the
  // portal's ScrollToTop does not fire).
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [i]);

  // Every change is kept in this browser straight away.
  const update = (patch) => {
    const next = { ...st, ...patch };
    setSt(next);
    writeInProgress(userId, next);
  };

  const score = area ? st.scores[area.key] : null;
  const setScore = (v) => update({ scores: { ...st.scores, [area.key]: v } });
  const setNote = (v) => {
    const notes = { ...st.notes };
    if (v) notes[area.key] = v; else delete notes[area.key];
    update({ notes });
  };

  const goBack = () => {
    if (i === 0) {
      navigate('/wheel-of-life');
      return;
    }
    update({ screenIndex: i - 1 });
  };
  const goNext = () => {
    if (score == null) return;
    update({ screenIndex: i + 1 });
  };

  const discard = () => {
    setDiscardOpen(false);
    clearInProgress(userId);
    navigate('/wheel-of-life');
  };

  const finish = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    const res = await createCheckin({
      scores: st.scores,
      areas,
      notes: st.notes,
      focusAreaKey: st.focusAreaKey,
      focusNote: st.focusNote,
      checkinDate: getLocalDateKey(),
    });
    if (res.error) {
      setBusy(false);
      setError(res.error.code === 'network' ? SAVE_FAILED : res.error.message);
      return;
    }
    clearInProgress(userId);
    // savedId: the one-pager tags this check-in "New" in its list.
    navigate('/wheel-of-life/results', { state: { toast: 'Check-in saved. Here is your wheel.', savedId: res.data.id } });
  };

  let body;
  let primary;
  if (!onReflect) {
    const name = areaName(area);
    const last = lastScoreFor(checkins, area.key);
    const MiniWheel = miniWheelStyle(chartStyle, N) === 'radar' ? WheelRadar : WheelSectional;
    const sig = areas.map((a) => (st.scores[a.key] ?? '-')).join('');
    body = (
      <div className="wol-rate">
        <div>
          <div className="wol-steps" aria-hidden="true">
            {areas.map((a, k) => <i key={a.key} className={k < i ? 'f' : (k === i ? 'n' : '')} />)}
          </div>
          <div className="wol-rate-title wol-rv">
            <PageHeader title={name} info={pageText.wheelOfLifeCheckIn} meta={[`Area ${i + 1} of ${N}`, 'Wheel of Life']} />
          </div>
          <p className="wol-qq wol-rv" style={{ '--i': 1 }}>{questionFor(area)}</p>
          <div className="wol-scale wol-rv" style={{ '--i': 2 }} role="radiogroup" aria-label={name}>
            {SCORES.map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={score === v}
                aria-label={`${v} out of 10`}
                className={last && last.score === v ? 'wol-prev' : undefined}
                onClick={() => setScore(v)}
              >
                {v}
              </button>
            ))}
          </div>
          <div className="wol-ends"><span>0 · Not at all</span><span>10 · Completely</span></div>
          {last ? (
            <div className="wol-lastt">
              <i />
              {`Last check-in, ${formatCheckinDate(last.date)}: ${last.score}`}
              {area.target != null ? <><span className="wol-sep">·</span>{`Your target: ${area.target}`}</> : null}
            </div>
          ) : null}
          <div className="wol-note wol-rv" style={{ '--i': 3 }}>
            <TextBox
              id={`wol-note-${area.key}`}
              label="A note to yourself"
              lines="many"
              focusMode
              who="me"
              maxLength={NOTE_MAX}
              placeholder="What’s behind this score?"
              value={st.notes[area.key] || ''}
              onChange={setNote}
            />
            <small className="wol-opt">Optional</small>
          </div>
        </div>
        <aside className="wol-mini">
          <small>This check-in</small>
          <MiniWheel key={sig} areas={areas} series={[{ cls: 'now', scores: st.scores }]} highlightKey={area.key} size="mini" />
        </aside>
      </div>
    );
    primary = { label: i === N - 1 ? 'Continue' : 'Next area', onClick: goNext, disabled: score == null };
  } else {
    body = (
      <>
        <div className="wol-steps" aria-hidden="true">
          {areas.map((a) => <i key={a.key} className="f" />)}
        </div>
        <div className="wol-rate-title wol-rv">
          <PageHeader title="Choose one area" info={pageText.wheelOfLifeCheckIn} meta={['Last step', 'Wheel of Life']} />
        </div>
        <p className="wol-qq wol-rv" style={{ '--i': 1 }}>If one area moved up by a single point, which would make the biggest difference to everything else?</p>
        <div className="wol-chips wol-rv" style={{ '--i': 2 }} role="group" aria-label="Area to focus on">
          {areas.map((a) => (
            <button
              key={a.key}
              type="button"
              aria-pressed={st.focusAreaKey === a.key}
              onClick={() => update({ focusAreaKey: st.focusAreaKey === a.key ? null : a.key })}
            >
              <b>{st.scores[a.key] ?? 'None'}</b>{areaName(a)}
            </button>
          ))}
        </div>
        <div className="wol-note wol-rv" style={{ '--i': 3 }}>
          <TextBox
            id="wol-focus-note"
            label="What is one small thing you could do about it?"
            lines="many"
            focusMode
            who="me"
            maxLength={FOCUS_NOTE_MAX}
            placeholder="One small, specific step"
            value={st.focusNote}
            onChange={(v) => update({ focusNote: v })}
          />
          <small className="wol-opt">Optional</small>
        </div>
      </>
    );
    primary = { label: 'Finish check-in', busyLabel: 'Saving', onClick: finish, busy, error };
  }

  return (
    <div className="ui-root">
      <DesignHeader />
      <div key={i} className="plan-page plan-page--form wol-page wol-page--footer wol-enter">
        {body}
      </div>
      <WheelFooter onBack={goBack} onDiscard={() => setDiscardOpen(true)} primary={primary} />
      <DiscardDialog
        isOpen={discardOpen}
        title="Discard this check-in?"
        message="Your answers so far will be lost."
        onKeep={() => setDiscardOpen(false)}
        onDiscard={discard}
      />
    </div>
  );
}
