import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { B3_LINES } from '../../content/pageLines/client';
import { Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import DesignHeader from '../../components/DesignHeader';
import { PageOpening,
  AddButton,
  BodyClockChart,
  Button,
  ButtonNote,
  Collapsible,
  Dropdown,
  ExplainLink,
  GuidedSummary,
  GuidedTool,
  IconButton,
  Loading,
  MomentNumber,
  MultiChoice,
  PageHeader,
  PeakMomentList,
  PeakMomentRow,
  PlaceField,
  Section,
  SlidePanel,
  TextBox,
  TextField,
  TravelDayRow,
  TravelSteps,
  WhoSees,
  clearGuideDraft,
  useCoachName,
  useToast,
} from '../../components/design';
import { clearDraft, useDraft } from '../../lib/drafts';
import { newId } from '../../lib/syncQueue';
import { friendlyError } from '../../lib/friendlyError';
import { localToday } from '../../lib/performance';
import { addDays, daysBetween, deviceZone, instantAt, offsetMinutes } from '../../lib/time/index.js';
import { updatePreference, usePreferences } from '../../lib/menuPins';
import { searchPlaces } from '../../lib/travel/airports';
import { makeTravelPlan, replanFrom } from '../../lib/travel/plan';
import {
  BEDTIMES,
  CAFFEINE_AGAIN,
  CAFFEINE_BACK,
  CAFFEINE_GONE,
  HEADLINE,
  NO_CAFFEINE,
  PATH,
  SAVED_WORDS,
  START_TIMES,
  TIME,
  TOOL_NAME,
  WAKE_TIMES,
  chartSentence,
  dateWords,
  dayLine,
  emptyFlight,
  extrasProblem,
  flightLine,
  flightProblem,
  homeFrom,
  homeProblem,
  inputFor,
  momentWhen,
  momentsInTrip,
  pastAfterEdit,
  planFor,
  planTitle,
  seenOf,
  shortSpan,
  sleepWords,
  spanWords,
  stepsShown,
  tidyFlight,
  tidyPlan,
  tidySleep,
  tripDays,
  whyFor,
  whyShort,
  zoneNote,
} from '../../lib/travel/model';
import { deletePlan, planSnapshot, restorePlan, savePlan, useTravelPlans } from '../../lib/travel/store';
import { cleanMomentName, emptyMoment, occurrences, ownEntry, tidyMoment } from '../../lib/peakMoments/model';
import { saveMoment, usePeakMoments } from '../../lib/peakMoments/store';
import '../performance/performance.css';
import '../peakMoments/peakMoments.css';
import './travelPlan.css';
import { TOOL_CLOSED } from '../../content/pageLines/client';

// The Travel plan (mock-up M21, version 7.2, approved 17 Nov; Phase 8b part
// B). The brief wins over M21, and the rules in CLAUDE.md win over both:
//   /travel-plan                 Start: "Where are you flying next?", the
//                                peak moments in another time zone, and
//                                Saved plans (each stays after its trip)
//   /travel-plan/new             set-up: the flight out, the flight home, the
//                                key moments, then the check with usual sleep
//                                (?moment= starts from a peak moment, ?again=
//                                from a saved plan, ?edit= changes a plan's
//                                key moments)
//   /travel-plan/:id             Your plan (or the short trip page)
//   /travel-plan/:id/day/:date   a day in full
// The steps are worked out by the engine (src/lib/travel), never stored. The
// plan saves as it's made ("Your plan is saved."). Key moments are peak
// moments: editing one here moves its peak moment, and moving the peak
// moment anywhere else moves the plan.

const SAVE_ERROR = 'That didn’t save. Check your connection and try again.';
const DRAFT = 'travel-plan:new';
const STEP_KEY = (userId) => `travel-plan-${userId}`;
const SLEEP_PREF = 'travel_sleep';

const firstNameOf = (user) => String(user?.user_metadata?.first_name || user?.user_metadata?.given_name || '').trim().split(' ')[0];
const named = (words, first) => (first ? `${words}, ${first}` : words);

export default function TravelPlan() {
  return (
    <Routes>
      <Route index element={<TravelStart />} />
      <Route path="new" element={<TravelSetup />} />
      <Route path=":id" element={<TravelPlanPage />} />
      <Route path=":id/day/:date" element={<TravelDayPage />} />
      <Route path="*" element={<TravelStart />} />
    </Routes>
  );
}

/** The person's peak moments, plans and today, as every page here reads them. */
function useTravel() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const [today] = useState(() => localToday());
  const peak = usePeakMoments(userId);
  const travel = useTravelPlans(userId, peak.moments);
  return { user, userId, today, peak, travel, first: firstNameOf(user) };
}

// ---------------------------------------------------------------- Start

function TravelStart() {
  const { userId, today, peak, travel, first } = useTravel();
  const navigate = useNavigate();
  const homeZone = deviceZone();
  const planned = new Set(travel.plans.flatMap((p) => p.momentIds));
  // Peak moments in another time zone in the next year with no plan yet (M21 "From your Peak moments"; lower case, as everywhere else in the portal).
  const away = useMemo(() => peak.moments
    .filter((m) => m.placeZone && !planned.has(m.id))
    .map((m) => occurrences(m, addDays(today, 1), addDays(today, 366), 1)[0])
    .filter(Boolean)
    .filter((o) => {
      try {
        const at = instantAt(o.on, '12:00', o.moment.placeZone);
        return offsetMinutes(at, o.moment.placeZone) !== offsetMinutes(at, homeZone);
      } catch {
        return false;
      }
    })
    .sort((a, b) => (a.on < b.on ? -1 : 1)),
  // planned is rebuilt from the plans each time.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [peak.moments, travel.plans, today, homeZone]);

  const start = (search = '') => navigate(`${PATH}/new${search}`, { state: { from: PATH } });
  const saved = travel.plans
    .map((p) => ({ p, view: planFor(p, peak.moments) }))
    .filter((x) => x.view);

  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="plan-page ipp-page travel-page">
        <PageOpening title={TOOL_NAME} line={B3_LINES.travelPlan} />
        <div className="ds-empty travel-calm">
          <h2 className="ds-empty-title">{named('Where are you flying next', first)}?</h2>
          <div className="ds-actions">
            <ButtonNote beside note={TIME}>
              <Button variant="primary" onClick={() => start()}>Plan my trip</Button>
            </ButtonNote>
          </div>
        </div>
        {away.length > 0 && (
          <Section title="Your peak moments" className="ipp-section travel-section">
            <PeakMomentList label="Your peak moments">
              {away.map((o) => (
                <PeakMomentRow key={o.key} name={o.moment.name} meta={[o.moment.placeCity]} date={dateWords(o.on)} onClick={() => start(`?moment=${encodeURIComponent(o.moment.id)}`)} />
              ))}
            </PeakMomentList>
          </Section>
        )}
        {saved.length > 0 && (
          <Section title="Saved plans" className="ipp-section travel-section">
            <PeakMomentList label="Saved plans">
              {saved.map(({ p, view }) => (
                <PeakMomentRow key={p.id} name={p.title || planTitle(p)} meta={view.to < today ? ['Finished'] : []} date={shortSpan(view.from, view.to)} onClick={() => navigate(`${PATH}/${p.id}`, { state: { from: PATH } })} />
              ))}
            </PeakMomentList>
          </Section>
        )}
        {!userId && <p className="ipp-muted">Sign in to plan a trip.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- set-up

function emptyForm(sleep) {
  return { flightOut: emptyFlight(newId()), flightHome: emptyFlight(newId()), momentIds: [], picked: false, extras: [], momentTimes: {}, usualSleep: tidySleep(sleep) };
}

function tidyForm(f, sleep) {
  const base = emptyForm(sleep);
  if (!f || typeof f !== 'object') return base;
  return {
    ...base,
    flightOut: tidyFlight(f.flightOut, base.flightOut.id),
    flightHome: tidyFlight(f.flightHome, base.flightHome.id),
    momentIds: Array.isArray(f.momentIds) ? f.momentIds.filter((x) => typeof x === 'string') : [],
    picked: f.picked === true,
    extras: Array.isArray(f.extras) ? f.extras.filter((x) => x && typeof x.id === 'string').map((x) => ({ id: x.id, name: String(x.name || '').slice(0, 80), on: typeof x.on === 'string' ? x.on : null, at: typeof x.at === 'string' ? x.at : '09:00' })) : [],
    momentTimes: f.momentTimes && typeof f.momentTimes === 'object' ? f.momentTimes : {},
    usualSleep: tidySleep(f.usualSleep || sleep),
  };
}

/** Leaves and Lands (M21): the device's own date and time picker. */
function FlightFields({ flight, onChange, landsLabel = 'Lands, local time' }) {
  return (
    <div className="travel-fields">
      <PlaceField label="From" value={flight.from} search={searchPlaces} onChange={(from) => onChange({ ...flight, from })} />
      <PlaceField label="To" value={flight.to} search={searchPlaces} onChange={(to) => onChange({ ...flight, to })} />
      <TextField label="Leaves" type="datetime-local" className="travel-when" value={flight.leaves} onChange={(e) => onChange({ ...flight, leaves: e.target.value })} />
      <TextField label={landsLabel} type="datetime-local" className="travel-when" value={flight.lands} onChange={(e) => onChange({ ...flight, lands: e.target.value })} />
    </div>
  );
}

function TravelSetup() {
  const { userId, today, peak, travel, first } = useTravel();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [params] = useSearchParams();
  const prefs = usePreferences(userId);
  const editId = params.get('edit');
  const editing = editId ? ownEntry(travel.state.plans, editId) || null : null;
  const busy = useRef(false);
  const [sleepOpen, setSleepOpen] = useState(false);
  const [sleepDraft, setSleepDraft] = useState(null);

  const [form, setForm] = useState(() => {
    if (editing) return tidyForm({ ...editing, picked: true, extras: [] }, editing.usualSleep);
    const f = emptyForm(prefs?.[SLEEP_PREF]);
    // Use again: the same places and times, the days still to choose.
    const again = params.get('again') ? ownEntry(travel.state.plans, params.get('again')) || null : null;
    if (again) {
      const keep = (fl, id) => ({ ...emptyFlight(id), from: fl.from, to: fl.to });
      return { ...f, flightOut: keep(again.flightOut, f.flightOut.id), flightHome: keep(again.flightHome, f.flightHome.id), usualSleep: tidySleep(again.usualSleep) };
    }
    // From a peak moment: where it is, and the home end of the last trip.
    const m = params.get('moment') ? peak.moments.find((x) => x.id === params.get('moment')) : null;
    const last = travel.plans[0];
    const homePlace = last?.flightOut?.from || null;
    if (m?.placeZone) {
      const to = { key: m.placeZone, code: null, name: m.placeCity, city: m.placeCity, zone: m.placeZone };
      return { ...f, flightOut: { ...f.flightOut, from: homePlace, to }, momentIds: [m.id] };
    }
    return homePlace ? { ...f, flightOut: { ...f.flightOut, from: homePlace } } : f;
  });
  const change = (patch) => setForm((x) => ({ ...x, ...(typeof patch === 'function' ? patch(x) : patch) }));

  const { clear } = useDraft({
    userId,
    name: DRAFT,
    value: editing ? null : form,
    ready: !editing && !params.get('moment') && !params.get('again'),
    onRestore: (d) => setForm(tidyForm(d, prefs?.[SLEEP_PREF])),
  });

  const inTrip = momentsInTrip(peak.moments, form.flightOut, homeFrom(form.flightOut, form.flightHome));
  const days = tripDays(form.flightOut, homeFrom(form.flightOut, form.flightHome));
  const firstAway = days[1] || days[0] || null;
  const city = form.flightOut.to?.city || 'your trip';
  // Peak moments in the trip are already chosen when the key moments open
  // (M21), once both flights are known.
  const tripKnown = !flightProblem(form.flightOut) && !homeProblem(form.flightOut, homeFrom(form.flightOut, form.flightHome));
  useEffect(() => {
    if (form.picked || !tripKnown) return;
    change((x) => ({ picked: true, momentIds: [...new Set([...x.momentIds, ...momentsInTrip(peak.moments, x.flightOut, homeFrom(x.flightOut, x.flightHome)).map((o) => o.moment.id)])] }));
    // Once, when the trip's days are first known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripKnown, form.picked]);

  const finish = async () => {
    if (busy.current) return false;
    busy.current = true;
    try {
      const id = editing ? editing.id : newId();
      // Each key moment added here is a new peak moment, in the trip's city (Phase 8b brief).
      const made = [];
      // Never one outside the trip: the check asks for its day again first (extrasProblem).
      if (extrasProblem(form.extras, days)) return false;
      for (const x of form.extras) {
        const m = { ...emptyMoment(x.id, today), name: cleanMomentName(x.name), area: 'work', kind: 'perform', startsOn: x.on, endsOn: x.on, placeCity: form.flightOut.to.city, placeZone: form.flightOut.to.zone, shared: peak.shareWork };
        await saveMoment(userId, m);
        made.push(m);
      }
      const all = [...peak.moments, ...made];
      const inTripIds = new Set(momentsInTrip(all, form.flightOut, homeFrom(form.flightOut, form.flightHome)).map((o) => o.moment.id));
      const momentIds = [...new Set([...form.momentIds.filter((x) => inTripIds.has(x)), ...made.map((m) => m.id)])];
      const momentTimes = { ...(editing?.momentTimes || {}), ...form.momentTimes, ...Object.fromEntries(form.extras.filter((x) => x.at).map((x) => [x.id, x.at])) };
      const flightHome = homeFrom(form.flightOut, form.flightHome);
      let plan = tidyPlan({ ...(editing || {}), id, flightOut: form.flightOut, flightHome, momentIds, momentTimes, usualSleep: form.usualSleep, noCaffeine: editing?.noCaffeine || false });
      if (editing) {
        // A change reworks the plan from today onwards; past days stay as they were.
        const before = planFor(editing, peak.moments);
        plan = { ...plan, past: pastAfterEdit(before, today) };
      }
      plan.title = planTitle(plan);
      plan.seen = seenOf(inputFor(plan, all));
      await savePlan(userId, plan, all);
      updatePreference(userId, SLEEP_PREF, () => form.usualSleep).catch(() => null);
      if (!editing) {
        clear();
        clearDraft(userId, DRAFT);
        clearGuideDraft(STEP_KEY(userId));
      }
      navigate(`${PATH}/${id}`, { replace: true, state: editing ? { from: PATH, edited: true } : { from: PATH, made: true } });
      return true;
    } catch (e) {
      toast.error(friendlyError(e, SAVE_ERROR));
      return false;
    } finally {
      busy.current = false;
    }
  };

  const close = () => {
    if (!editing) toast.show(TOOL_CLOSED);
    navigate(editing ? `${PATH}/${editing.id}` : (location.state?.from || PATH), { replace: true });
  };

  const eye = <WhoSees audience="me" note="Only you can see your plan." />;
  const extrasNeed = extrasProblem(form.extras, days);
  const dayOptions = days.map((d) => ({ value: d, label: dateWords(d) }));

  const steps = [
    {
      key: 'out',
      name: 'Flight out',
      question: 'Where are you flying?',
      eye,
      required: true,
      check: () => flightProblem(form.flightOut),
      // The flight home starts as the way back.
      onNext: () => change((x) => ({ flightHome: homeFrom(x.flightOut, x.flightHome) })),
      render: () => <FlightFields flight={form.flightOut} onChange={(flightOut) => change({ flightOut })} />,
    },
    {
      key: 'home',
      name: 'Flight home',
      question: 'When do you fly home?',
      required: true,
      check: () => homeProblem(form.flightOut, form.flightHome),
      render: () => <FlightFields flight={homeFrom(form.flightOut, form.flightHome)} onChange={(flightHome) => change({ flightHome })} />,
    },
    {
      key: 'moments',
      name: 'Key moments',
      question: `What do you need to be sharpest for in ${city}?`,
      nudges: ['Pick all that apply.'],
      required: true,
      check: () => extrasNeed,
      render: () => (
          <div className="travel-moments">
            {inTrip.length > 0 && (
              <MultiChoice
                variant="pick"
                ariaLabel={`What do you need to be sharpest for in ${city}?`}
                options={inTrip.map((o) => ({ value: o.moment.id, label: o.moment.name, detail: momentWhen(o.on, form.momentTimes[o.moment.id] || editing?.momentTimes?.[o.moment.id]) }))}
                values={form.momentIds}
                onChange={(momentIds) => change({ momentIds })}
              />
            )}
            {!inTrip.length && !form.extras.length && <p className="ipp-muted">None of your peak moments are on these days.</p>}
            {form.extras.map((x, i) => (
              <div key={x.id} className="travel-extra">
                <div className="travel-extra-head">
                  <TextBox
                    ariaLabel="Name"
                    lines="one"
                    maxLength={80}
                    value={x.name}
                    placeholder="e.g. Keynote at the sales conference"
                    onChange={(name) => change((f) => ({ extras: f.extras.map((y) => (y.id === x.id ? { ...y, name } : y)) }))}
                  />
                  <IconButton label={`Remove key moment ${i + 1}`} onClick={() => change((f) => ({ extras: f.extras.filter((y) => y.id !== x.id) }))} />
                </div>
                <div className="travel-two">
                  <Dropdown label="Day" options={dayOptions} value={x.on} onChange={(on) => change((f) => ({ extras: f.extras.map((y) => (y.id === x.id ? { ...y, on } : y)) }))} />
                  <Dropdown label="Start time" options={START_TIMES.map((t) => ({ value: t, label: t }))} value={x.at} onChange={(at) => change((f) => ({ extras: f.extras.map((y) => (y.id === x.id ? { ...y, at } : y)) }))} />
                </div>
              </div>
            ))}
            <AddButton className="travel-add" onClick={() => change((f) => ({ extras: [...f.extras, { id: newId(), name: '', on: firstAway, at: '09:00' }] }))}>
              Add key moment
            </AddButton>
          </div>
      ),
    },
    {
      key: 'check',
      name: 'Check',
      question: named('What would you change', first) + '?',
      required: true,
      check: () => flightProblem(form.flightOut) || homeProblem(form.flightOut, form.flightHome) || extrasNeed,
      render: (tool) => {
        const chosen = inTrip.filter((o) => form.momentIds.includes(o.moment.id))
          .map((o) => `${o.moment.name}, ${momentWhen(o.on, form.momentTimes[o.moment.id] || editing?.momentTimes?.[o.moment.id])}`);
        // A key moment whose day the new flights left behind says so here, and the check asks for its day again.
        const extra = form.extras.filter((x) => cleanMomentName(x.name)).map((x) => (x.on && days.includes(x.on)
          ? `${cleanMomentName(x.name)}, ${momentWhen(x.on, x.at)}`
          : `${cleanMomentName(x.name)} isn’t on a day of your trip.`));
        const at = (key) => tool.steps.findIndex((s) => s.key === key);
        return (
          <GuidedSummary
            stacked
            rows={[
              { key: 'out', label: 'Flight out', lines: [{ text: flightLine(form.flightOut) }], step: at('out') },
              { key: 'home', label: 'Flight home', lines: [{ text: flightLine(homeFrom(form.flightOut, form.flightHome)) }], step: at('home') },
              { key: 'moments', label: 'Key moments', lines: [...chosen, ...extra].length ? [...chosen, ...extra].map((text) => ({ text })) : [{ text: 'None chosen' }], step: at('moments') },
              { key: 'sleep', label: 'Usual sleep', lines: [{ text: sleepWords(form.usualSleep) }], step: 'sleep' },
            ]}
            onChange={(step, opts) => {
              if (step === 'sleep') { setSleepDraft(form.usualSleep); setSleepOpen(true); return; }
              tool.go(step, opts);
            }}
          />
        );
      },
    },
  ];

  return (
    <div className="ui-root plan-builder-wait">
      <GuidedTool
        name={TOOL_NAME}
        steps={steps}
        progress="percent"
        calm
        draftKey={editing ? undefined : STEP_KEY(userId)}
        initialStep={editing ? 'moments' : undefined}
        finishLabel="Make my plan"
        onClose={close}
        onFinish={finish}
      />
      <SlidePanel
        open={sleepOpen}
        onClose={() => setSleepOpen(false)}
        title="Usual sleep"
        className="ds-who-panel travel-sleep-panel"
        footer={<Button variant="primary" className="ds-panel-go" onClick={() => { change({ usualSleep: tidySleep(sleepDraft) }); setSleepOpen(false); toast.show('Saved'); }}>Save</Button>}
      >
        {sleepDraft && (
          <>
            <p className="travel-panel-line">The times you usually go to bed and get up at home.</p>
            <div className="travel-two">
              <Dropdown label="Bedtime" options={BEDTIMES.map((t) => ({ value: t, label: t }))} value={sleepDraft.start} onChange={(start) => setSleepDraft((s) => ({ ...s, start }))} />
              <Dropdown label="Wake time" options={WAKE_TIMES.map((t) => ({ value: t, label: t }))} value={sleepDraft.end} onChange={(end) => setSleepDraft((s) => ({ ...s, end }))} />
            </div>
          </>
        )}
      </SlidePanel>
    </div>
  );
}

// ---------------------------------------------------------------- one plan

/** The saved plan, its peak moments and the plan worked out from them; and a moved peak moment keeps the past as it was. */
function usePlan(id) {
  const t = useTravel();
  const own = ownEntry(t.travel.state.plans, id);
  const saved = own && !own.gone ? own : null;
  const view = useMemo(() => (saved ? planFor(saved, t.peak.moments) : null), [saved, t.peak.moments]);
  // A peak moment moved elsewhere in the portal: the plan follows it from
  // today, and the days already past stay as they were.
  useEffect(() => {
    if (!saved || !view || view.short) return;
    const now = seenOf(inputFor(saved, t.peak.moments));
    if (saved.seen === now) return;
    let past = saved.past;
    if (saved.seen && t.today > view.from) {
      try {
        const oldInput = { ...inputFor(saved, t.peak.moments), keyMoments: JSON.parse(saved.seen) };
        const old = saved.past?.days?.length ? replanFrom({ short: false, input: oldInput, days: saved.past.days }, saved.past.from, {}) : makeTravelPlan(oldInput);
        past = pastAfterEdit(old, t.today) || past;
      } catch {
        // The old moments can't be read: the plan is simply made again.
      }
    }
    savePlan(t.userId, { ...saved, past, seen: now }, t.peak.moments).catch(() => null);
  }, [saved, view, t.peak.moments, t.today, t.userId]);
  return { ...t, saved, view };
}

function Missing({ onOpen }) {
  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="plan-page ipp-page travel-page">
        <PageHeader title={TOOL_NAME} />
        <p className="ipp-muted">This plan isn’t here any more.</p>
        <div className="ds-actions ipp-actions">
          <Button onClick={onOpen}>Open my travel plans</Button>
        </div>
      </div>
    </div>
  );
}

/** "Why these steps help" with "I don’t have caffeine" at its end (M21). */
function WhyLink({ explain, noCaffeine, onCaffeine }) {
  return (
    <ExplainLink
      explain={explain}
      className="travel-why"
      action={(close) => (
        <Button variant="text" className="travel-caffeine" onClick={() => { close(); onCaffeine(); }}>
          {noCaffeine ? CAFFEINE_AGAIN : NO_CAFFEINE}
        </Button>
      )}
    >
      Why these steps help
    </ExplainLink>
  );
}

function useCaffeine({ userId, saved, moments }) {
  const toast = useToast();
  return () => {
    const was = saved.noCaffeine;
    const flip = (to) => savePlan(userId, { ...saved, noCaffeine: to }, moments).catch((e) => toast.error(friendlyError(e, SAVE_ERROR)));
    flip(!was);
    toast.saved({ message: was ? CAFFEINE_BACK : CAFFEINE_GONE, onUndo: () => { flip(was); } });
  };
}

function TravelPlanPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const coach = useCoachName();
  const { userId, today, peak, saved, view, first } = usePlan(id);
  const [making, setMaking] = useState(() => Boolean(location.state?.made));
  const [panel, setPanel] = useState(null); // { kind: 'out'|'home'|'moment', id? }
  const busy = useRef(false);
  const toggleCaffeine = useCaffeine({ userId, saved, moments: peak.moments });
  const backTo = location.state?.from && location.state.from !== location.pathname ? location.state.from : PATH;

  // "Making your plan", then the plan with "Your plan is saved." (M21: it saves as it's made).
  useEffect(() => {
    if (!making) return undefined;
    const t = setTimeout(() => {
      setMaking(false);
      toast.show(SAVED_WORDS);
      navigate(location.pathname, { replace: true, state: { from: PATH } });
    }, 1200);
    return () => clearTimeout(t);
    // Once, as the plan opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!location.state?.edited) return;
    toast.show('Saved. Your plan is updated.');
    navigate(location.pathname, { replace: true, state: { from: PATH } });
    // Once, as the plan opens after an edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!saved) return <Missing onOpen={() => navigate(PATH, { replace: true })} />;
  if (making || !view) {
    return (
      <div className="ui-root">
        <DesignHeader />
        <div className="plan-page ipp-page travel-page">
          {making ? <Loading label="Making your plan" delay={0} className="ds-loading--page" /> : <p className="ipp-muted">This plan’s flights need checking.</p>}
        </div>
      </div>
    );
  }

  const city = view.away.city;
  const keyMoments = view.moments;
  const eye = (
    <WhoSees
      audience="me"
      note={coach ? ['Only you can see your plan.', `${coach} sees that you’re away in ${city}, and your key moments.`] : 'Only you can see your plan.'}
    />
  );
  const leave = () => navigate(backTo, { replace: true });

  const remove = async () => {
    if (busy.current) return;
    busy.current = true;
    const kept = planSnapshot(userId, saved.id);
    try {
      await deletePlan(userId, saved.id);
      navigate(PATH, { replace: true });
      toast.saved({ message: 'Deleted', onUndo: () => { restorePlan(userId, kept, peak.moments).catch((e) => toast.error(friendlyError(e, SAVE_ERROR))); } });
    } catch (e) {
      toast.error(friendlyError(e, SAVE_ERROR));
    } finally {
      busy.current = false;
    }
  };

  const edit = async (next, words) => {
    const before = view;
    const plan = { ...next, past: pastAfterEdit(before, today) };
    plan.seen = seenOf(inputFor(plan, peak.moments));
    try {
      await savePlan(userId, plan, peak.moments);
      toast.show(words);
      return true;
    } catch (e) {
      toast.error(friendlyError(e, SAVE_ERROR));
      return false;
    }
  };

  const tripRows = (
    <div className="ds-guide-plan travel-trip">
      {[
        { key: 'out', label: 'Flight out', text: flightLine(saved.flightOut), open: () => setPanel({ kind: 'out' }) },
        { key: 'home', label: 'Flight home', text: flightLine(saved.flightHome), open: () => setPanel({ kind: 'home' }) },
        ...keyMoments.map((m) => ({ key: m.id, label: m.name, number: view.short ? null : m.number, text: momentWhen(m.startsOn, m.time), open: () => setPanel({ kind: 'moment', id: m.id }) })),
      ].map((r) => (
        <button key={r.key} type="button" className="ds-guide-plan-row" aria-label={`Edit ${r.key === 'out' ? 'flight out' : r.key === 'home' ? 'flight home' : r.label}`} onClick={r.open}>
          <span className="ds-guide-plan-value">
            <span className="ds-guide-plan-label">{r.number ? <MomentNumber n={r.number} /> : null}{r.label}</span>
            <span className="ds-guide-plan-line">{r.text}</span>
          </span>
          <span className="ds-guide-plan-edit" aria-hidden="true">Edit</span>
        </button>
      ))}
    </div>
  );

  const after = (
    <div className="travel-after">
      <Button variant="text" onClick={() => navigate(`${PATH}/new?edit=${saved.id}`, { state: { from: location.pathname } })}>Add or remove a key moment</Button>
      {view.to < today && <Button variant="text" onClick={() => navigate(`${PATH}/new?again=${saved.id}`, { state: { from: PATH } })}>Use again</Button>}
      <Button variant="text" className="ds-guide-delete" onClick={remove}>Delete this plan</Button>
    </div>
  );

  let body;
  if (view.short) {
    const steps = stepsShown(view.keyDay.steps, saved.noCaffeine);
    const moment = view.keyDay.steps.find((s) => s.kind === 'moment');
    body = (
      <>
        <p className="travel-meta">{spanWords(view.from, view.to)}</p>
        <p className="travel-headline">{view.headline}</p>
        {view.sleepNote && <p className="travel-headline travel-headline--next">{view.sleepNote}</p>}
        <Section title={moment ? 'Your key day' : 'First full day'} aside={<span className="travel-zone">{`${view.keyDay.city} time`}</span>} className="ipp-section travel-section">
          <p className="ds-sr">{dateWords(view.keyDay.date)}</p>
          <TravelSteps steps={steps} label={`${dateWords(view.keyDay.date)}, ${view.keyDay.city} time`} className="travel-steps--flush" />
          <WhyLink explain={whyShort(view, saved.noCaffeine)} noCaffeine={saved.noCaffeine} onCaffeine={toggleCaffeine} />
        </Section>
        <Section title="Your trip" className="ipp-section travel-section">
          {tripRows}
          {after}
        </Section>
      </>
    );
  } else {
    const days = view.days.map((d) => ({ d, line: dayLine(d, view, keyMoments) }));
    const underWay = today > view.from && today <= view.to;
    const earlier = underWay ? days.filter((x) => x.d.date < today) : [];
    const rest = underWay ? days.filter((x) => x.d.date >= today) : days;
    const row = ({ d, line }) => (
      <TravelDayRow key={d.date} title={dateWords(d.date)} line={line} moment={d.moments.length > 0} today={d.date === today} onClick={() => navigate(`${PATH}/${saved.id}/day/${d.date}`, { state: { from: location.pathname } })} />
    );
    body = (
      <>
        <p className="travel-meta">{spanWords(view.from, view.to)}</p>
        <p className="travel-headline">{HEADLINE}</p>
        <Section title="Your body clock" className="ipp-section travel-section">
          <BodyClockChart plan={view} label={chartSentence(view)} />
        </Section>
        <Section title="Day by day" className="ipp-section travel-section">
          <ul className="ds-tdays" aria-label="Day by day">{rest.map(row)}</ul>
          {earlier.length > 0 && (
            <div className="travel-earlier">
              <Collapsible summary="Show earlier days">
                <ul className="ds-tdays" aria-label="Earlier days">{earlier.map(row)}</ul>
              </Collapsible>
            </div>
          )}
        </Section>
        <Section title="Your trip" className="ipp-section travel-section">
          {tripRows}
          {after}
        </Section>
      </>
    );
  }

  const step = {
    key: 'plan',
    question: named(`Here’s your plan for ${city}`, first) + '.',
    eye,
    noProgress: true,
    required: true,
    foot: null,
    render: () => <div className="travel-plan">{body}</div>,
  };

  return (
    <div className="ui-root plan-builder-wait">
      <GuidedTool name={TOOL_NAME} steps={[step]} progress="percent" calm onClose={leave} onBack={leave} />
      {panel && (panel.kind === 'out' || panel.kind === 'home') && (
        <FlightPanel
          title={panel.kind === 'out' ? 'Flight out' : 'Flight home'}
          flight={panel.kind === 'out' ? saved.flightOut : saved.flightHome}
          check={(f) => (panel.kind === 'out' ? flightProblem(f) || homeProblem(f, saved.flightHome) : homeProblem(saved.flightOut, f))}
          onClose={() => setPanel(null)}
          onSave={async (f) => {
            const ok = await edit({ ...saved, [panel.kind === 'out' ? 'flightOut' : 'flightHome']: f }, 'Saved. Your plan is updated.');
            if (ok) setPanel(null);
          }}
        />
      )}
      {panel?.kind === 'moment' && (
        <MomentPanel
          moment={peak.moments.find((m) => m.id === panel.id)}
          keyMoment={keyMoments.find((m) => m.id === panel.id)}
          days={tripDays(saved.flightOut, saved.flightHome)}
          onClose={() => setPanel(null)}
          onSave={async ({ on, at }) => {
            const m = peak.moments.find((x) => x.id === panel.id);
            const km = keyMoments.find((x) => x.id === panel.id);
            if (!m || !km) { setPanel(null); return; }
            // A repeating peak moment's day is never moved from here: that would move every time it comes round.
            const shift = m.repeat ? 0 : daysBetween(km.startsOn, on);
            try {
              if (shift) await saveMoment(userId, tidyMoment({ ...m, startsOn: addDays(m.startsOn, shift), endsOn: addDays(m.endsOn || m.startsOn, shift) }));
            } catch (e) {
              toast.error(friendlyError(e, SAVE_ERROR));
              return;
            }
            const ok = await edit({ ...saved, momentTimes: { ...saved.momentTimes, [m.id]: at } }, shift ? 'Saved. Your plan and your peak moment are updated.' : 'Saved. Your plan is updated.');
            if (ok) setPanel(null);
          }}
        />
      )}
    </div>
  );
}

function FlightPanel({ title, flight, check, onClose, onSave }) {
  const [f, setF] = useState(flight);
  const [problem, setProblem] = useState(null);
  const save = () => {
    const p = check(f);
    setProblem(p);
    if (!p) onSave(f);
  };
  return (
    <SlidePanel
      open
      onClose={onClose}
      title={title}
      className="ds-who-panel travel-panel"
      footer={<Button variant="primary" className="ds-panel-go" onClick={save}>Save</Button>}
    >
      <FlightFields flight={f} onChange={(x) => { setF(x); if (problem) setProblem(check(x)); }} />
      {problem && (
        <div className="ds-error travel-problem" role="alert">
          <span className="ds-error-mark" aria-hidden="true">!</span>
          <span>{problem}</span>
        </div>
      )}
    </SlidePanel>
  );
}

function MomentPanel({ moment, keyMoment, days, onClose, onSave }) {
  const [on, setOn] = useState(keyMoment?.startsOn || days[0]);
  const [at, setAt] = useState(keyMoment?.time || '09:00');
  if (!moment || !keyMoment) return null;
  const options = days.includes(on) ? days : [on, ...days];
  return (
    <SlidePanel
      open
      onClose={onClose}
      title={moment.name}
      className="ds-who-panel travel-panel"
      footer={<Button variant="primary" className="ds-panel-go" onClick={() => onSave({ on, at })}>Save</Button>}
    >
      {moment.repeat ? (
        <>
          {/* A repeating one keeps its day here: moving it would move every time it comes round (the functionality tester, 18 Nov). */}
          <p className="travel-panel-line">{`It’s one of your peak moments and it repeats, so its day stays ${dateWords(keyMoment.startsOn)}.`}</p>
          <div className="travel-two">
            <Dropdown label="Start time" options={START_TIMES.map((t) => ({ value: t, label: t }))} value={at} onChange={setAt} />
          </div>
        </>
      ) : (
        <>
          <p className="travel-panel-line">It’s one of your peak moments, so it moves there too.</p>
          <div className="travel-two">
            <Dropdown label="Day" options={options.map((d) => ({ value: d, label: dateWords(d) }))} value={on} onChange={setOn} />
            <Dropdown label="Start time" options={START_TIMES.map((t) => ({ value: t, label: t }))} value={at} onChange={setAt} />
          </div>
        </>
      )}
    </SlidePanel>
  );
}

// ---------------------------------------------------------------- a day in full

function TravelDayPage() {
  const { id, date } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { userId, peak, saved, view } = usePlan(id);
  const toggleCaffeine = useCaffeine({ userId, saved, moments: peak.moments });
  if (!saved || !view || view.short) return <Missing onOpen={() => navigate(saved ? `${PATH}/${id}` : PATH, { replace: true })} />;
  const index = view.days.findIndex((d) => d.date === date);
  if (index < 0) return <Missing onOpen={() => navigate(`${PATH}/${id}`, { replace: true })} />;
  const day = view.days[index];
  const planPath = `${PATH}/${id}`;
  const toPlan = () => navigate(location.state?.from && location.state.from.startsWith(PATH) ? location.state.from : planPath, { replace: true, state: { from: PATH } });
  const go = (i) => navigate(`${planPath}/day/${view.days[i].date}`, { replace: true, state: location.state });
  const steps = stepsShown(day.steps, saved.noCaffeine);
  const note = zoneNote(day, view);
  const first = index === 0;
  const last = index === view.days.length - 1;
  const step = {
    key: `day-${date}`,
    label: dateWords(date),
    question: dayLine(day, view, view.moments),
    nudges: note ? [note] : [],
    noProgress: true,
    required: true,
    foot: (
      <>
        <Button variant="text" onClick={() => (first ? toPlan() : go(index - 1))}>{first ? 'All days' : 'Previous day'}</Button>
        <Button onClick={() => (last ? toPlan() : go(index + 1))}>{last ? 'All days' : 'Next day'}</Button>
      </>
    ),
    render: () => (
      <div className="travel-day">
        <TravelSteps steps={steps} label={dateWords(date)} />
        <div className="travel-day-links">
          <WhyLink explain={whyFor(day.steps, saved.noCaffeine)} noCaffeine={saved.noCaffeine} onCaffeine={toggleCaffeine} />
        </div>
      </div>
    ),
  };
  return (
    <div className="ui-root plan-builder-wait">
      <GuidedTool key={date} name={TOOL_NAME} steps={[step]} progress="percent" calm onClose={() => navigate(PATH, { replace: true })} onBack={toPlan} />
    </div>
  );
}
