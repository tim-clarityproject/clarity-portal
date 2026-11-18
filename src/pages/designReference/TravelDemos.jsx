import { useMemo, useState } from 'react';
import { BodyClockChart, OfferRow, PlaceField, TravelDayPanel, TravelDayRow, TravelSteps, TravelTodayCard } from '../../components/design';
import { chartSentence, dayLine, planFor, stepsShown, tickKey, tidyPlan } from '../../lib/travel/model';
import { searchPlaces } from '../../lib/travel/airports';

// The Travel plan's shared parts in the gallery (M21, version 7.2; Phase 8b
// part B), with M21's own invented trip: London to New York, out Sun 8 Nov
// 2026 at 12:00, home Thu 12 Nov at 19:00, usual sleep 22:30 to 06:30, the
// Harbour board meeting on Tue 10 Nov at 09:00. The steps are the engine's.

const LHR = { key: 'LHR', code: 'LHR', name: 'London Heathrow, LHR', city: 'London', zone: 'Europe/London' };
const JFK = { key: 'JFK', code: 'JFK', name: 'New York JFK', city: 'New York', zone: 'America/New_York' };
const BOARD = { id: 'board', name: 'Harbour board meeting', area: 'work', kind: 'perform', startsOn: '2026-11-10', endsOn: '2026-11-10', placeCity: 'New York', placeZone: 'America/New_York', repeat: null };
const PLAN = tidyPlan({
  id: 'm21',
  flightOut: { id: 'out', from: LHR, to: JFK, leaves: '2026-11-08T12:00', lands: '2026-11-08T15:00' },
  flightHome: { id: 'home', from: JFK, to: LHR, leaves: '2026-11-12T19:00', lands: '2026-11-13T07:00' },
  momentIds: ['board'],
  momentTimes: { board: '09:00' },
  usualSleep: { start: '22:30', end: '06:30' },
});

export function TravelPartsDemo() {
  const view = useMemo(() => planFor(PLAN, [BOARD]), []);
  const [ticks, setTicks] = useState({});
  const [from, setFrom] = useState(LHR);
  const fly = view.days.find((d) => d.date === '2026-11-08');
  const board = view.days.find((d) => d.date === '2026-11-10');
  const steps = stepsShown(fly.steps, false).filter((s) => s.kind !== 'moment');
  return (
    <div className="dr-stack">
      <BodyClockChart plan={view} label={chartSentence(view)} />
      <ul className="ds-tdays" aria-label="Day by day">
        {[fly, board].map((d) => <TravelDayRow key={d.date} title={d.title} line={dayLine(d, view, view.moments)} moment={d.moments.length > 0} onClick={() => {}} />)}
      </ul>
      <TravelSteps steps={fly.steps} label="Sun 8 Nov" />
      <TravelSteps steps={board.steps} label="Tue 10 Nov" />
      <TravelTodayCard line="You fly to New York today." steps={steps} ticks={ticks} keyOf={tickKey} onTick={(s, on) => setTicks((t) => ({ ...t, [tickKey(s)]: on }))} onOpen={() => {}} />
      <TravelDayPanel steps={steps} onOpen={() => {}} />
      <PlaceField label="From" value={from} search={searchPlaces} onChange={setFrom} />
      <OfferRow icon="plane" action="Plan my New York trip" detail="~3 minutes" onTake={() => {}} onNotNow={() => {}} />
    </div>
  );
}
