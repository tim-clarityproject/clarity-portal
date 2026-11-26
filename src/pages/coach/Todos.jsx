import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AddLink, Card, InlineChoice, PageOpening, SearchField } from '../../components/design';
import { TODOS_LINE } from '../../content/pageLines/coach';
import { doneThisWeek, somedayTodos, todayTodos, upcomingGroups } from '../../lib/coach/day';
import { Eye, Fold, TextLink, useCoachPortal } from './parts';
import { TodoBulkBar, TodoQuickAdd, TodoList, TodoPanel, UnderTabs, useTodoPicks } from './todoParts';
import { TodosCalendar } from './calendarPanels';
import { countFigure } from '../../lib/coach/numbers';

// To-dos (M11): the coach's own, never a client's. Today (the working
// day's, then After work), Upcoming (by day) and Someday behind underlined
// tabs, with what's done folded at the foot. The quick add reads plain
// words; a row opens the to-do in its side panel; several can be chosen at
// once. Calendar shows the same to-dos as a calendar (run 3; M11's
// "todocal"): this week with the to-dos to place beside it, built from the
// calendar's own parts.

const TABS = [{ value: 'today', label: 'Today' }, { value: 'upcoming', label: 'Upcoming' }, { value: 'someday', label: 'Someday' }];
const SHOW = [{ value: 'list', label: 'List' }, { value: 'calendar', label: 'Calendar' }];
const PAGE = 50;
const DONE_FIRST = 5;
const PANEL = 'cc-todo-tab';

export default function Todos() {
  const { todos, todayKey } = useCoachPortal();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'today';
  const [show, setShow] = useState('list');
  const picks = useTodoPicks();
  const [openId, setOpenId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [doneOpen, setDoneOpen] = useState(false);
  const [doneAll, setDoneAll] = useState(false);
  const [q, setQ] = useState('');
  // A new tab starts with nothing chosen and its first 50.
  useEffect(() => { picks.clear(); setLimit(PAGE); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tab]);

  const today = useMemo(() => todayTodos(todos, todayKey), [todos, todayKey]);
  const upcoming = useMemo(() => upcomingGroups(todos, todayKey), [todos, todayKey]);
  const someday = useMemo(() => somedayTodos(todos, todayKey), [todos, todayKey]);
  const week = useMemo(() => doneThisWeek(todos, todayKey), [todos, todayKey]);
  const found = useMemo(() => {
    const words = q.trim().toLowerCase();
    if (!words) return null;
    return todos.filter((t) => t.done_at && t.title.toLowerCase().includes(words)).sort((a, b) => String(b.done_at).localeCompare(String(a.done_at))).slice(0, PAGE);
  }, [todos, q]);

  // Upcoming and Someday show 50 at a time, so 500 to-dos stay quick.
  let room = limit;
  const upcomingShown = upcoming.map((g) => { const items = g.items.slice(0, Math.max(0, room)); room -= items.length; return { ...g, items }; }).filter((g) => g.items.length > 0);
  const upcomingCount = upcoming.reduce((n, g) => n + g.items.length, 0);
  const total = tab === 'upcoming' ? upcomingCount : tab === 'someday' ? someday.length : 0;
  const doneRows = found || (doneAll ? week : week.slice(0, DONE_FIRST));

  return (
    <div className="cc-page">
      <div className={`cc-col${show === 'calendar' ? ' cc-cal-page cc-cal-page--wide' : ''}`}>
        <PageOpening title="To-dos" aside={<Eye sentence="Only you can see this." />} line={TODOS_LINE} />

        <div className="cc-todo-bar">
          <UnderTabs label="To-dos" tabs={TABS} value={tab} panelId={PANEL} onChange={(v) => setParams(v === 'today' ? {} : { tab: v }, { replace: true })} />
          <div className="cc-seg"><InlineChoice ariaLabel="Show as" semantics="pressed" options={SHOW} value={show} onChange={setShow} form="pills" /></div>
        </div>

        <div role="tabpanel" id={PANEL} aria-labelledby={`${PANEL}-${tab}`} className="cc-fade" key={`${tab}:${show}`}>
          {show === 'calendar' && <TodosCalendar />}

          {show === 'list' && (
            // The tab's list is one card (rule 13), "+ Add" at its label's right opening Quick Add (rule 10).
            <Card label={TABS.find((t) => t.value === tab).label} className="cc-part cc-todo-card" quickAdd={<TodoQuickAdd open={adding} onClose={() => setAdding(false)} defaultDay={tab === 'today' ? todayKey : null} />} add={<AddLink label="Add to-do" expanded={adding} onClick={() => setAdding(true)} />}>
          {tab === 'today' && (
            <>
              {today.work.length === 0 && today.afterWork.length === 0 && <p className="cc-quiet">Nothing is planned for today.</p>}
              {today.work.length > 0 && <TodoList todos={today.work} view="today" label="Today" picks={picks} onOpen={setOpenId} reorder dropPatch={{ after_work: false }} />}
              {today.afterWork.length > 0 && (
                <>
                  <h2 className="cc-todo-group">After work</h2>
                  <TodoList todos={today.afterWork} view="today" label="After work" picks={picks} onOpen={setOpenId} reorder dropPatch={{ after_work: true }} />
                </>
              )}
            </>
          )}

          {tab === 'upcoming' && (
            <>
              {upcomingCount === 0 && <p className="cc-quiet">Nothing is planned for the days ahead.</p>}
              {upcomingShown.map((g) => (
                <section key={g.day} aria-label={g.label}>
                  <h2 className="cc-todo-group">{g.label}</h2>
                  {/* Under its day's heading the day is understood, as on Today: only a time shows. */}
                  <TodoList todos={g.items} view={g.later ? 'upcoming' : 'today'} label={g.label} picks={picks} onOpen={setOpenId} />
                </section>
              ))}
            </>
          )}

          {tab === 'someday' && (
            <>
              {someday.length === 0 && <p className="cc-quiet">Nothing is waiting for a day.</p>}
              {someday.length > 0 && <TodoList todos={someday.slice(0, limit)} view="someday" label="Someday" picks={picks} onOpen={setOpenId} />}
            </>
          )}

          {total > limit && (
            <div className="cc-acts"><TextLink onClick={() => setLimit((n) => n + PAGE)}>Show {Math.min(PAGE, total - limit)} more</TextLink></div>
          )}
            </Card>
          )}
        </div>

        {show === 'list' && (
          <div className="cc-folds">
            <Fold title="Done" summary={`${countFigure(week.length)} done this week`} open={doneOpen} onToggle={() => setDoneOpen((v) => !v)}>
              <SearchField label="Search what’s done" placeholder="Search what’s done" value={q} onChange={setQ} />
              {found && found.length === 0 && <p className="cc-quiet">Nothing done matches “{q.trim()}”.</p>}
              {!found && week.length === 0 && <p className="cc-quiet">Nothing is done yet this week.</p>}
              {doneRows.length > 0 && <TodoList todos={doneRows} label="Done" onOpen={setOpenId} done />}
              {!found && !doneAll && week.length > DONE_FIRST && <div className="cc-acts"><TextLink onClick={() => setDoneAll(true)}>Show all {countFigure(week.length)}</TextLink></div>}
            </Fold>
          </div>
        )}
      </div>

      <TodoBulkBar picks={picks} />
      <TodoPanel id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
