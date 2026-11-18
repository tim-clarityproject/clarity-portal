import { useContext, useMemo, useRef, useState } from 'react';
import { Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import DesignHeader from '../../components/DesignHeader';
import {
  AddButton,
  Button,
  ButtonNote,
  Choice,
  DatePicker,
  ExplainLink,
  GuidedSummary,
  GuidedTool,
  PageHeader,
  PeakMomentList,
  PeakMomentRow,
  SearchField,
  Section,
  TextBox,
  WhoSees,
  clearGuideDraft,
  useToast,
} from '../../components/design';
import { addDays as addDayKey } from '../../lib/scores/dates.js';
import { clearDraft, useDraft } from '../../lib/drafts';
import { newId } from '../../lib/syncQueue';
import { friendlyError } from '../../lib/friendlyError';
import { localToday } from '../../lib/performance';
import {
  ADD_NAME,
  ADD_TIME,
  AREAS,
  AT_HOME,
  EXPLAIN,
  HOME,
  KINDS,
  NAME_MAX,
  LESSON_MAX,
  PATH,
  PERSONAL_NOTE,
  REVIEW_HELPED,
  REVIEW_NEXT,
  REVIEW_SAVED,
  SPAN,
  SPANS,
  TOOL_NAME,
  cleanMomentName,
  comesRoundOn,
  emptyMoment,
  firstUnanswered,
  isComplete,
  leadUpLines,
  listView,
  metaItems,
  ownEntry,
  repeatOptions,
  repeatProblem,
  reviewAnswers,
  reviewLine,
  reviewOf,
  reviewQuestion,
  reviewRows,
  summaryRows,
  tidyMoment,
  whenProblem,
  whenWords,
  withArea,
  withRepeat,
  withSpan,
  withStart,
  withUntil,
} from '../../lib/peakMoments/model';
import { searchCities } from '../../lib/peakMoments/places';
import { sameZone } from '../../lib/time/index.js';
import { deleteMoment, leadUpsOf, saveMoment, saveReview, setShareWork, usePeakMoments } from '../../lib/peakMoments/store';
import '../performance/performance.css';
import './peakMoments.css';

// Peak moments (mock-up M18, version 28, approved 11 Nov; Phase 8b part A,
// with the brief's changes, which win over M18 where they differ):
//   /peak-moments                  the list: Coming up, then Past, one add
//                                  button; with none, the calm card
//   /peak-moments/add              Add peak moment: one question a screen
//                                  (M18 draws one side sheet; the brief asks
//                                  for the calm guided tool), then a summary
//   /peak-moments/edit/:id         the same tool, opened on its summary
//   /peak-moments/review/:id/:day  the review after one time it came round
//
// The title has the eye and no ⓘ (brief): "What’s a peak moment?" under it
// opens the shared side panel. The eye sets whether work moments are shared
// with the coach; personal ones never are (M18: "Personal peak moments are
// only ever yours."). No limit on how many, anywhere.
//
// Rules that win over M18: "Deleted" with Undo (M18 "Removed"); the add
// button is never greyed out ("Type its name to carry on."); every answer
// is a sentence in the person's voice ("It’s for work", M18's Work and
// Personal pills); the edges are the field line (M18 used the line colour);
// "Who can see this?" is the shared side panel (M18 a centred modal).

const SAVE_ERROR = 'That didn’t save. Check your connection and try again.';
const WHO_LINE = 'Personal peak moments are only ever yours.';
const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default function PeakMoments() {
  return (
    <Routes>
      <Route index element={<PeakList />} />
      <Route path="add" element={<PeakEdit />} />
      <Route path="edit/:id" element={<PeakEdit />} />
      <Route path="review/:id/:day" element={<PeakReview />} />
      <Route path="*" element={<PeakList />} />
    </Routes>
  );
}

// ---------------------------------------------------------------- the list

function PeakList() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const navigate = useNavigate();
  const [today] = useState(() => localToday());
  const { moments, reviews, shareWork } = usePeakMoments(userId);
  const view = useMemo(() => listView(moments, reviews, today), [moments, reviews, today]);

  const add = () => navigate(`${PATH}/add`, { state: { from: PATH } });
  const eye = (
    <WhoSees
      audience={shareWork ? 'coach' : 'me'}
      name="Your work peak moments"
      plain
      line={WHO_LINE}
      onChange={(who) => setShareWork(userId, who === 'coach')}
    />
  );

  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="plan-page ipp-page peak-page">
        <PageHeader title={TOOL_NAME} aside={eye} />
        <ExplainLink explain={EXPLAIN} className="peak-explain">What’s a peak moment?</ExplainLink>
        {view.empty ? (
          <div className="ds-empty peak-calm">
            <h2 className="ds-empty-title">When do you next need to be at your best?</h2>
            <div className="ds-actions">
              <ButtonNote beside note={ADD_TIME}>
                <Button variant="primary" onClick={add}>Add my first peak moment</Button>
              </ButtonNote>
            </div>
          </div>
        ) : (
          <>
            <div className="peak-add">
              <AddButton onClick={add}>{ADD_NAME}</AddButton>
            </div>
            <Section title="Coming up" className="ipp-section peak-section">
              {view.comingUp.length ? (
                <PeakMomentList label="Coming up">
                  {view.comingUp.map((o) => (
                    <PeakMomentRow
                      key={o.key}
                      name={o.moment.name}
                      meta={metaItems(o.moment, today)}
                      date={whenWords(o.on, o.endsOn, today)}
                      onClick={() => navigate(`${PATH}/edit/${o.moment.id}`, { state: { from: PATH } })}
                    />
                  ))}
                </PeakMomentList>
              ) : <p className="ipp-muted">Nothing is coming up yet.</p>}
            </Section>
            {view.past.length > 0 && (
              <Section title="Past" className="ipp-section peak-section">
                <PeakMomentList label="Past">
                  {view.past.map((o) => (
                    <PeakMomentRow
                      key={o.key}
                      name={o.moment.name}
                      meta={metaItems({ ...o.moment, repeat: null }, today)}
                      date={whenWords(o.on, o.endsOn, today)}
                      lesson={o.lesson}
                      // A past one can't be opened, apart from one with no day it comes round on (an older copy), so it can be put right or deleted.
                      onClick={o.stray ? () => navigate(`${PATH}/edit/${o.moment.id}`, { state: { from: PATH } }) : undefined}
                    />
                  ))}
                </PeakMomentList>
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- add or edit one

const STEP_KEY = (userId) => `peak-add-${userId}`;
const DRAFT = 'peak-moment:new';

function PeakEdit() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [today] = useState(() => localToday());
  const { state, shareWork } = usePeakMoments(userId);
  const saved = id ? ownEntry(state.moments, id) || null : null;
  const editing = Boolean(id);
  const [m, setM] = useState(() => (saved && !saved.gone ? tidyMoment(saved) : emptyMoment(newId(), today)));
  const [query, setQuery] = useState('');
  const busy = useRef(false);
  const backTo = location.state?.from || PATH;

  // Typing a new one is kept on the device ("Draft restored").
  const { clear } = useDraft({
    userId,
    name: DRAFT,
    value: editing ? null : m,
    ready: !editing,
    onRestore: (d) => {
      const t = tidyMoment(d);
      if (t) setM({ ...emptyMoment(t.id, today), ...t });
    },
  });

  if (editing && (!saved || saved.gone)) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page ipp-page peak-page">
          <PageHeader title={TOOL_NAME} />
          <p className="ipp-muted">This peak moment isn’t here any more.</p>
          <div className="ds-actions ipp-actions">
            <Button onClick={() => navigate(PATH, { replace: true })}>Open my peak moments</Button>
          </div>
        </div>
      </div>
    );
  }

  const personal = m.area === 'personal';
  const eye = personal
    ? <WhoSees audience="me" note={['Only you can see this.', WHO_LINE]} />
    : <WhoSees audience={shareWork && m.area === 'work' ? 'coach' : 'me'} />;

  const change = (patch) => setM((x) => (typeof patch === 'function' ? patch(x) : { ...x, ...patch }));

  const persist = async (next, words) => {
    try {
      await saveMoment(userId, next);
      if (words) toast.show(words);
      return true;
    } catch (e) {
      toast.error(friendlyError(e, SAVE_ERROR));
      return false;
    }
  };

  const leave = () => navigate(backTo, { replace: true });

  const finish = async () => {
    if (busy.current) return false;
    if (!isComplete(m)) return false;
    busy.current = true;
    const ok = await persist({ ...m, name: cleanMomentName(m.name), shared: m.area === 'work' && (editing ? m.shared : shareWork) }, editing ? 'Saved' : 'It’s in your peak moments');
    busy.current = false;
    if (!ok) return false;
    if (!editing) {
      clear();
      clearDraft(userId, DRAFT);
      clearGuideDraft(STEP_KEY(userId));
    }
    leave();
    return true;
  };

  const remove = async () => {
    if (busy.current) return;
    busy.current = true;
    const kept = ownEntry(state.moments, m.id);
    try {
      await deleteMoment(userId, m.id);
      navigate(PATH, { replace: true });
      toast.saved({
        message: 'Deleted',
        onUndo: async () => {
          try {
            await saveMoment(userId, { ...kept, gone: false });
          } catch (e) {
            toast.error(friendlyError(e, SAVE_ERROR));
          }
        },
      });
    } catch (e) {
      toast.error(friendlyError(e, SAVE_ERROR));
    } finally {
      busy.current = false;
    }
  };

  const cities = searchCities(query);
  // A city is its zone and its name: Delhi, Mumbai and Kolkata keep one clock.
  const placeValue = m.placeZone ? `${(cities.find((c) => c.city === m.placeCity && sameZone(c.zone, m.placeZone)) || { zone: m.placeZone }).zone}|${m.placeCity}` : HOME;
  const placeOptions = [
    { value: HOME, label: AT_HOME },
    ...(m.placeZone && !cities.some((c) => c.city === m.placeCity && sameZone(c.zone, m.placeZone)) ? [{ value: `${m.placeZone}|${m.placeCity}`, label: m.placeCity }] : []),
    // Its time's name only where it says something the city doesn't ("India time" under Kolkata; 29ap).
    ...cities.map((c) => ({ value: `${c.zone}|${c.city}`, label: c.city, ...(c.hint ? { hint: c.hint } : {}) })),
  ];
  const choosePlace = (value) => {
    if (value === HOME) change({ placeCity: null, placeZone: null });
    else {
      const c = cities.find((x) => `${x.zone}|${x.city}` === value);
      if (c) change({ placeCity: c.city, placeZone: c.zone });
    }
  };

  const steps = [
    {
      key: 'name',
      name: 'Name',
      question: 'What is it called?',
      required: true,
      eye,
      check: () => (cleanMomentName(m.name) ? null : 'Type its name to carry on.'),
      render: () => (
        <TextBox
          ariaLabel="What is it called?"
          lines="one"
          maxLength={NAME_MAX}
          value={m.name}
          placeholder="e.g. Cup final"
          onChange={(name) => change({ name })}
        />
      ),
    },
    {
      key: 'area',
      name: 'Work or personal',
      question: 'Is it for work or your personal life?',
      nudges: [PERSONAL_NOTE],
      required: true,
      oneTap: true,
      check: () => (m.area ? null : 'Choose one to carry on.'),
      render: (tool) => (
        <Choice
          ariaLabel="Is it for work or your personal life?"
          form="rows"
          options={AREAS.map((a) => ({ value: a.value, label: a.label }))}
          value={m.area}
          onChange={(area) => change((x) => withArea(x, area, editing ? x.shared || shareWork : shareWork))}
          onChoose={() => tool.next()}
        />
      ),
    },
    {
      key: 'kind',
      name: 'What you need',
      question: 'What do you need from it?',
      required: true,
      oneTap: true,
      check: () => (m.kind ? null : 'Choose one to carry on.'),
      render: (tool) => (
        <Choice
          ariaLabel="What do you need from it?"
          form="rows"
          options={KINDS.map((k) => ({ value: k.value, label: k.label }))}
          value={m.kind}
          onChange={(kind) => change({ kind })}
          onChoose={() => tool.next()}
        />
      ),
    },
    {
      key: 'when',
      name: 'When',
      question: 'When is it?',
      required: true,
      check: () => whenProblem(m),
      render: () => (
        <div className="peak-when">
          <Choice
            ariaLabel="One day or several?"
            form="rows"
            options={SPANS}
            value={m.span}
            onChange={(span) => change((x) => withSpan(x, span))}
          />
          <div className="peak-dates">
            <DatePicker
              label={m.span === SPAN.days ? 'First day' : 'Which day?'}
              value={m.startsOn}
              min={addDayKey(today, -366)}
              onChange={(d) => change((x) => withStart(x, d))}
            />
            {m.span === SPAN.days && (
              <DatePicker
                label="Last day"
                value={m.endsOn}
                min={m.startsOn ? addDayKey(m.startsOn, 1) : addDayKey(today, -365)}
                max={m.startsOn ? addDayKey(m.startsOn, 366) : undefined}
                onChange={(d) => change({ endsOn: d })}
              />
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'where',
      name: 'Where',
      question: 'Where is it?',
      required: true,
      oneTap: true,
      render: (tool) => (
        <div className="peak-where">
          <SearchField
            label="Search for its city"
            placeholder="Search for its city"
            value={query}
            onChange={setQuery}
          />
          <div className="peak-where-list">
            <Choice
              ariaLabel="Where is it?"
              form="rows"
              options={placeOptions}
              value={placeValue}
              onChange={choosePlace}
              onChoose={() => tool.next()}
            />
          </div>
          {query.trim().length >= 2 && !cities.length && (
            <p className="ipp-muted peak-where-none">No city by that name yet. Try the nearest big city.</p>
          )}
        </div>
      ),
    },
    {
      key: 'repeat',
      name: 'Repeats',
      question: 'Does it repeat?',
      required: true,
      check: () => repeatProblem(m),
      render: () => (
        <div>
          <Choice
            ariaLabel="Does it repeat?"
            form="rows"
            options={repeatOptions(m.startsOn)}
            value={m.repeat?.every || 'none'}
            onChange={(every) => change((x) => withRepeat(x, every))}
          />
          {m.repeat && (
            <div className="peak-until">
              <DatePicker
                label="When does it stop?"
                value={m.repeat.until || null}
                min={m.startsOn || today}
                onChange={(d) => change((x) => withUntil(x, d))}
                placeholder="It keeps going"
              />
              <p className="ds-hint">Optional.</p>
              {m.repeat.until && (
                <Button variant="text" className="peak-until-clear" onClick={() => change((x) => withUntil(x, null))}>Keep it going</Button>
              )}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'sum',
      name: 'Your peak moment',
      title: 'Your peak moment',
      eye,
      required: true,
      check: () => {
        const at = firstUnanswered(m);
        if (at === 'repeat') return repeatProblem(m);
        return at === 'sum' ? null : 'Answer every question to carry on.';
      },
      render: (tool) => (
        <div>
          <GuidedSummary
            stacked
            rows={summaryRows(m, today).map((r) => ({ ...r, step: tool.steps.findIndex((s) => s.key === r.step) }))}
            onChange={tool.go}
          />
          {editing && (
            <div className="peak-delete">
              <Button variant="text" className="ds-guide-delete" onClick={remove}>Delete this peak moment</Button>
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="ui-root plan-builder-wait">
      <GuidedTool
        name={editing ? 'Edit this peak moment' : ADD_NAME}
        steps={steps}
        progress="percent"
        calm
        draftKey={editing ? undefined : STEP_KEY(userId)}
        initialStep={editing ? 'sum' : undefined}
        finishLabel={editing ? 'Save my changes' : 'Add my peak moment'}
        onClose={leave}
        onFinish={finish}
        // Saved there and then only when it can be kept as it stands (a stop day before the start never is).
        onEdited={() => { if (editing && isComplete(m)) persist({ ...m, name: cleanMomentName(m.name) }, 'Saved'); }}
      />
    </div>
  );
}

// ---------------------------------------------------------------- the review after

function PeakReview() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const { id, day } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [today] = useState(() => localToday());
  const { state, reviews } = usePeakMoments(userId);
  const own = ownEntry(state.moments, id);
  // Only a day the moment really comes round on has a review (the break-it tester, 18 Nov).
  const moment = own && !own.gone && isDay(day) && comesRoundOn(own, day) ? own : null;
  const had = moment ? reviewOf(reviews, id, day) : null;
  const [r, setR] = useState(() => ({ answer: had?.answer || '', kept: had?.kept || '', lesson: had?.lesson || '' }));
  const busy = useRef(false);
  const backTo = location.state?.from || '/welcome';

  if (!moment) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page ipp-page peak-page">
          <PageHeader title="Peak moment review" />
          <p className="ipp-muted">This peak moment isn’t here any more.</p>
          <div className="ds-actions ipp-actions">
            <Button onClick={() => navigate(PATH, { replace: true })}>Open my peak moments</Button>
          </div>
        </div>
      </div>
    );
  }

  const length = moment.endsOn && moment.startsOn ? Math.round((Date.parse(`${moment.endsOn}T00:00:00Z`) - Date.parse(`${moment.startsOn}T00:00:00Z`)) / 86400000) : 0;
  const occurrence = { moment, on: day, endsOn: addDayKey(day, length), key: `${id}:${day}` };
  const line = reviewLine(occurrence, today);
  const leadUps = leadUpsOf(userId, occurrence.key);
  const { rows } = reviewRows(moment.kind, r, leadUps);
  const lead = leadUpLines(leadUps);

  const finish = async () => {
    if (busy.current) return false;
    busy.current = true;
    try {
      await saveReview(userId, { momentId: id, occursOn: day, answer: r.answer, kept: r.kept.slice(0, LESSON_MAX), lesson: r.lesson.slice(0, LESSON_MAX) });
      toast.show(REVIEW_SAVED);
      navigate(backTo, { replace: true });
      return true;
    } catch (e) {
      toast.error(friendlyError(e, SAVE_ERROR));
      return false;
    } finally {
      busy.current = false;
    }
  };

  const steps = [
    {
      key: 'answer',
      name: 'How it went',
      label: line,
      question: reviewQuestion(moment.kind, moment.name),
      required: true,
      oneTap: true,
      eye: <WhoSees audience="me" />,
      check: () => (r.answer ? null : 'Choose one to carry on.'),
      render: (tool) => (
        <Choice
          ariaLabel={reviewQuestion(moment.kind, moment.name)}
          form="rows"
          options={reviewAnswers(moment.kind)}
          value={r.answer || null}
          onChange={(answer) => setR((x) => ({ ...x, answer }))}
          onChoose={() => tool.next()}
        />
      ),
    },
    {
      key: 'kept',
      name: 'What helped',
      label: line,
      question: REVIEW_HELPED,
      render: () => (
        <TextBox ariaLabel={REVIEW_HELPED} maxLength={LESSON_MAX} value={r.kept} onChange={(kept) => setR((x) => ({ ...x, kept }))} />
      ),
    },
    {
      key: 'lesson',
      name: 'Next time',
      label: line,
      question: REVIEW_NEXT,
      nextLabel: 'See my review',
      render: () => (
        <TextBox ariaLabel={REVIEW_NEXT} maxLength={LESSON_MAX} value={r.lesson} onChange={(lesson) => setR((x) => ({ ...x, lesson }))} />
      ),
    },
    {
      key: 'sum',
      name: 'Your review',
      label: line,
      title: 'Your review',
      eye: <WhoSees audience="me" />,
      required: true,
      check: () => (r.answer ? null : 'Choose how it went to carry on.'),
      render: (tool) => (
        <div>
          <GuidedSummary
            stacked
            rows={rows.map((x) => ({ ...x, step: tool.steps.findIndex((s) => s.key === x.step) }))}
            onChange={tool.go}
          />
          {/* The lead-up shows only here, at the end, so nothing earlier steers the answers (M18). It's a record: no Edit. */}
          {lead.length > 0 && (
            <div className="peak-leadup">
              <h3 className="peak-leadup-title">What you did in the lead-up</h3>
              {lead.map((l) => (
                <p key={l.text} className="peak-leadup-line">
                  {l.text}
                  <small className={l.good ? 'peak-leadup-good' : undefined}>{l.sub}</small>
                </p>
              ))}
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="ui-root plan-builder-wait">
      <GuidedTool
        name="Peak moment review"
        steps={steps}
        progress="percent"
        calm
        initialStep={had ? 'sum' : undefined}
        finishLabel="Save my review"
        onClose={() => navigate(backTo, { replace: true })}
        onFinish={finish}
      />
    </div>
  );
}

