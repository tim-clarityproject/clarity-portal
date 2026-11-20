import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AddButton, InlineChoice, PageHeader, SearchField, useIsPhone } from '../../components/design';
import { doneThisWeek, somedayTodos, todayTodos, upcomingGroups } from '../../lib/coach/day';
import { Eye, Fold, TextLink, useCoachPortal } from './parts';
import { QuickAdd, QuickAddPanel, TodoBulkBar, TodoList, TodoPanel, UnderTabs, useTodoPicks } from './todoParts';

// To-dos (M11): the coach's own, never a client's. Today (the working
// day's, then After work), Upcoming (by day) and Someday behind underlined
// tabs, with what's done folded at the foot. The quick add reads plain
// words; a row opens the to-do in its side panel; several can be chosen at
// once. To-dos as a calendar come with the calendar (run 3): the switch's
// place is kept on previews and opens a calm line.

const LIVE = typeof __CLARITY_LIVE__ !== 'undefined' && __CLARITY_LIVE__;
const TABS = [{ value: 'today', label: 'Today' }, { value: 'upcoming', label: 'Upcoming' }, { value: 'someday', label: 'Someday' }];
const SHOW = [{ value: 'list', label: 'List' }, { value: 'calendar', label: 'Calendar' }];
const PAGE = 50;
const DONE_FIRST = 5;
const PANEL = 'cc-todo-tab';

export default function Todos() {
  const { todos, todayKey } = useCoachPortal();
  const isPhone = useIsPhone();
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
      <div className="cc-col">
        <PageHeader title="To-dos" aside={<Eye sentence="Only you can see this." />} />
        {!isPhone && <QuickAdd defaultDay={tab === 'today' ? todayKey : null} />}

        <div className="cc-todo-bar">
          <UnderTabs label="To-dos" tabs={TABS} value={tab} panelId={PANEL} onChange={(v) => setParams(v === 'today' ? {} : { tab: v }, { replace: true })} />
          {!LIVE && <div className="cc-seg"><InlineChoice ariaLabel="Show as" semantics="pressed" options={SHOW} value={show} onChange={setShow} form="pills" /></div>}
        </div>

        <div role="tabpanel" id={PANEL} aria-labelledby={`${PANEL}-${tab}`} className="cc-fade" key={`${tab}:${show}`}>
          {show === 'calendar' && <p className="cc-quiet">Coming in this build. It isn’t ready to use yet.</p>}

          {show === 'list' && tab === 'today' && (
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

          {show === 'list' && tab === 'upcoming' && (
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

          {show === 'list' && tab === 'someday' && (
            <>
              {someday.length === 0 && <p className="cc-quiet">Nothing is waiting for a day.</p>}
              {someday.length > 0 && <TodoList todos={someday.slice(0, limit)} view="someday" label="Someday" picks={picks} onOpen={setOpenId} />}
            </>
          )}

          {show === 'list' && total > limit && (
            <div className="cc-acts"><TextLink onClick={() => setLimit((n) => n + PAGE)}>Show {Math.min(PAGE, total - limit)} more</TextLink></div>
          )}
          {show === 'list' && <div className="cc-add"><AddButton onClick={() => setAdding(true)}>Add to-do</AddButton></div>}
        </div>

        {show === 'list' && (
          <div className="cc-folds">
            <Fold title="Done" summary={`${week.length} done this week`} open={doneOpen} onToggle={() => setDoneOpen((v) => !v)}>
              <SearchField label="Search what’s done" placeholder="Search what’s done" value={q} onChange={setQ} />
              {found && found.length === 0 && <p className="cc-quiet">Nothing done matches “{q.trim()}”.</p>}
              {!found && week.length === 0 && <p className="cc-quiet">Nothing is done yet this week.</p>}
              {doneRows.length > 0 && <TodoList todos={doneRows} label="Done" onOpen={setOpenId} done />}
              {!found && !doneAll && week.length > DONE_FIRST && <div className="cc-acts"><TextLink onClick={() => setDoneAll(true)}>Show all {week.length}</TextLink></div>}
            </Fold>
          </div>
        )}
      </div>

      <TodoBulkBar picks={picks} />
      <TodoPanel id={openId} onClose={() => setOpenId(null)} />
      <QuickAddPanel open={adding} onClose={() => setAdding(false)} defaultDay={tab === 'today' ? todayKey : null} />
    </div>
  );
}
