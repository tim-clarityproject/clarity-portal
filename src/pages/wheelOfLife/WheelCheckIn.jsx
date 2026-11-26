import { useContext, useLayoutEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { Choice, MoreLink, TextBox, ToolFrame } from '../../components/design';
import { LIFE_BALANCE_TOOL } from '../../content/pageLines/client';
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
import WheelLoadState from './WheelLoadState';
import '../../styles/wheelOfLife.css';
import '../performance/stepFrame.css';

const SCORES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const SAVE_FAILED = 'Your check-in hasn’t saved yet. Check your connection and try again.';

// /life-balance-review/check-in - one rating screen per area on the wheel, then
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
  const [need, setNeed] = useState(false);

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
      navigate('/life-balance-review');
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
    navigate('/life-balance-review');
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
    navigate('/life-balance-review/results', { state: { toast: 'Check-in saved. Here is your wheel.', savedId: res.data.id } });
  };

  const close = () => {
    // Every tap is already kept on this device: × only goes back (rule 21).
    navigate('/life-balance-review', { state: { toast: LIFE_BALANCE_TOOL.closed } });
  };
  const next = () => {
    if (onReflect) { finish(); return; }
    if (score == null) { setNeed(true); return; }
    setNeed(false);
    goNext();
  };
  const discardLink = (
    <div className="wol-discard">
      <MoreLink small bare onClick={() => setDiscardOpen(true)}>Discard this check-in</MoreLink>
    </div>
  );

  let body;
  let question;
  let eyebrow;
  if (!onReflect) {
    const name = areaName(area);
    const last = lastScoreFor(checkins, area.key);
    const MiniWheel = miniWheelStyle(chartStyle, N) === 'radar' ? WheelRadar : WheelSectional;
    const sig = areas.map((a) => (st.scores[a.key] ?? '-')).join('');
    eyebrow = name;
    question = questionFor(area);
    body = (
      <div className="wol-tool-step">
        {/* The scale: 0 to 10 as one joined row (rule 7's joined switch), the last check-in's score marked with a dot. */}
        <div className="ds-seg wol-scale" role="radiogroup" aria-label={name}>
          {SCORES.map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={score === v}
              aria-label={`${v} out of 10`}
              className={last && last.score === v ? 'wol-prev' : undefined}
              onClick={() => { setScore(v); setNeed(false); }}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="wol-ends"><span>0, not at all</span><span>10, completely</span></div>
        {last ? (
          <p className="wol-note-line">
            {`Last check-in, ${formatCheckinDate(last.date)}: ${last.score}.`}
            {area.target != null ? ` Your target is ${area.target}.` : null}
          </p>
        ) : null}
        {need ? <p className="ds-error wol-need" role="alert">Choose a score to carry on.</p> : null}
        <div className="wol-note">
          <TextBox
            id={`wol-note-${area.key}`}
            label="Is there anything behind this score?"
            lines="many"
            focusMode
            who="me"
            maxLength={NOTE_MAX}
            placeholder="What’s behind this score?"
            value={st.notes[area.key] || ''}
            onChange={setNote}
          />
          <p className="wol-note-line">Optional</p>
        </div>
        <div className="wol-mini wol-mini--tool">
          <span className="ds-label">This check-in</span>
          <MiniWheel key={sig} areas={areas} series={[{ cls: 'now', scores: st.scores }]} highlightKey={area.key} size="mini" />
        </div>
        {discardLink}
      </div>
    );
  } else {
    eyebrow = 'Life balance review';
    question = 'If one area moved up by a single point, which would make the biggest difference to everything else?';
    body = (
      <div className="wol-tool-step">
        {/* Each area with its score from this check-in. Choosing the chosen area again clears it. */}
        <Choice
          ariaLabel="Area to focus on"
          form={areas.length > 5 ? 'rows' : 'auto'}
          options={areas.map((a) => ({ value: a.key, label: areaName(a), note: String(st.scores[a.key] ?? 'None') }))}
          value={st.focusAreaKey}
          onChange={(key) => update({ focusAreaKey: st.focusAreaKey === key ? null : key })}
        />
        <div className="wol-note">
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
          <p className="wol-note-line">Optional</p>
        </div>
        {error ? <p className="ds-error wol-need" role="alert">{error}</p> : null}
        {discardLink}
      </div>
    );
  }

  // Focus mode (Polish 1, rule 21): × at the top left, "Step n of m", the progress line, the
  // question at 20px, Next and Back at the foot, the last step Finish check-in.
  return (
    <div className="ui-root plan-builder-wait sf-page">
      <ToolFrame
        step={i + 1}
        steps={N + 1}
        name={eyebrow}
        question={question}
        onClose={close}
        onNext={next}
        nextLabel={onReflect ? (busy ? 'Saving' : 'Finish check-in') : (i === N - 1 ? 'Continue' : 'Next area')}
        onBack={i > 0 ? goBack : undefined}
        last={onReflect}
        className="sf-tool wol-tool"
      >
        {body}
      </ToolFrame>
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
