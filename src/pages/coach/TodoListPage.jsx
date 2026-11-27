import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { idFromAddress } from '../../lib/coach/address';
import { AddLink, Button, Card, PageOpening, TextBox, useToast } from '../../components/design';
import { todoListLine } from '../../content/pageLines/coach';
import { removeRow, newId, saveRow, saveRows } from '../../lib/coach/store';
import { clean, cut } from '../../lib/coach/model';
import { doneWords, openWords } from '../../lib/coach/day';
import { listGroups } from '../../lib/coach/todoActions';
import { Back, Eye, Fold, MenuItem, PopMenu, TextLink, useCoachPortal } from './parts';
import { TodoBulkBar, TodoQuickAdd, TodoList, TodoPanel, useTodoPicks } from './todoParts';
import { countFigure } from '../../lib/coach/numbers';

// One of the coach's to-do lists (M11's "Kestrel renewal"): its name, its
// client or organisation, how many are open, its to-dos under their
// headings (those with no heading first), Add heading and Mark as
// finished. To-dos are dragged, or moved with the arrow keys, within a
// heading and from one to another.

const SAVE_PROBLEM = 'That didn’t save. Check your connection and try again.';
const DOTS = <svg className="cc-todo-dots" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="5.5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="18.5" cy="12" r="1.5" /></svg>;

/** A heading's name typed in place: Enter or the button saves, Escape puts it back. */
function HeadingBox({ start = '', button, onSave, onCancel }) {
  const [name, setName] = useState(start);
  const [problem, setProblem] = useState(null);
  const box = useRef(null);
  useEffect(() => { const el = box.current; if (!el) return; el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch { /* not a text box */ } }, []);
  const save = () => {
    const words = cut(clean(name), 80);
    if (!words) { setProblem('Type the heading to carry on.'); box.current?.focus(); return; }
    onSave(words);
  };
  return (
    <form className="cc-check-add cc-heading-box" noValidate onSubmit={(e) => { e.preventDefault(); save(); }} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } }}>
      <TextBox ref={box} lines="one" label="Heading" value={name} maxLength={80} onChange={(v) => { setName(v); setProblem(null); }} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
      {problem && <p className="cc-problem" role="alert">{problem}</p>}
      <div className="cc-check-add-go">
        <Button variant="outline" type="submit">{button}</Button>
        <TextLink onClick={onCancel}>Cancel</TextLink>
      </div>
    </form>
  );
}

export default function TodoListPage() {
  const id = idFromAddress(useParams().id); // any case in the address (tidy follow-up 4)
  const { userId, coach, isOwner, todos, todoLists, todoHeadings, clients, organisations, todayKey } = useCoachPortal();
  const navigate = useNavigate();
  const toast = useToast();
  const picks = useTodoPicks();
  const [openId, setOpenId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [heading, setHeading] = useState(null); // 'new', or the id of the heading being renamed
  const [menu, setMenu] = useState(null);
  const [doneOpen, setDoneOpen] = useState(false);
  const dots = useRef({});
  const list = todoLists.find((l) => l.id === id);
  const back = () => navigate('/coach/todos');

  if (!list) {
    return (
      <div className="cc-page">
        <div className="cc-col">
          <Back to="To-dos" onClick={back} />
          <PageOpening title="To-do list" />
          <p className="cc-quiet">This list isn’t here any more.</p>
        </div>
      </div>
    );
  }

  const done = async (work, message, onUndo) => {
    try {
      const status = await work();
      toast.saved({ message: status === 'queued' ? 'Will sync' : message, long: true, onUndo });
      return true;
    } catch (error) {
      toast.error(error?.message && !/fetch|network/i.test(error.message) ? error.message : SAVE_PROBLEM);
      return false;
    }
  };
  const mine = todos.filter((t) => t.list_id === list.id);
  const groups = listGroups(todos, todoHeadings, list.id);
  const headings = todoHeadings.filter((h) => h.list_id === list.id);
  const finished = mine.filter((t) => t.done_at).sort((a, b) => String(b.done_at).localeCompare(String(a.done_at)));
  const org = organisations.find((o) => o.id === list.organisation_id);
  const client = clients.find((c) => c.id === list.profile_id);

  const addHeading = async (name) => {
    const row = { id: newId(), list_id: list.id, coach_id: coach.id, name, position: Math.max(0, ...headings.map((h) => Number(h.position) || 0)) + 1 };
    if (await done(() => saveRow(userId, 'coach_todo_headings', row), 'Heading added', () => removeRow(userId, 'coach_todo_headings', row.id).catch(() => {}))) setHeading(null);
  };
  const renameHeading = async (h, name) => {
    if (name === h.name) { setHeading(null); return; }
    if (await done(() => saveRow(userId, 'coach_todo_headings', { ...h, name }), 'Saved', () => saveRow(userId, 'coach_todo_headings', h).catch(() => {}))) setHeading(null);
  };
  // Its to-dos stay in the list, with no heading.
  const deleteHeading = (h) => {
    const under = mine.filter((t) => t.heading_id === h.id);
    done(
      async () => { await saveRows(userId, under.map((t) => ['coach_todos', { ...t, heading_id: null }])); await removeRow(userId, 'coach_todo_headings', h.id); return 'saved'; },
      'Deleted',
      () => saveRows(userId, [['coach_todo_headings', h], ...under.map((t) => ['coach_todos', t])]).catch(() => {}),
    );
  };
  const finish = async () => {
    if (await done(() => saveRow(userId, 'coach_todo_lists', { ...list, finished_at: new Date().toISOString() }), 'Marked as finished', () => saveRow(userId, 'coach_todo_lists', { ...list, finished_at: null }).catch(() => {}))) back();
  };
  const reopen = () => done(() => saveRow(userId, 'coach_todo_lists', { ...list, finished_at: null }), 'Saved', () => saveRow(userId, 'coach_todo_lists', list).catch(() => {}));

  const menuHeading = headings.find((h) => h.id === menu) || null;
  return (
    <div className="cc-page">
      <div className="cc-col">
        <Back to="To-dos" onClick={back} />
        <PageOpening title={list.name} aside={<Eye sentence="Only you can see this." />} line={todoListLine(Boolean(list.finished_at))} />
        <div className="cc-list-meta">
          {org && (isOwner ? <TextLink onClick={() => navigate(`/coach/organisations/${org.id}`)}>{org.name}</TextLink> : <span>{org.name}</span>)}
          {client && <TextLink onClick={() => navigate(`/coach/clients/${client.id}`)}>{client.name}</TextLink>}
          <span>{openWords(mine)}</span>
          {list.finished_at && <span>Finished {doneWords({ done_at: list.finished_at }, todayKey)}</span>}
        </div>

        {list.finished_at && <div className="cc-acts"><TextLink onClick={reopen}>Open this list again</TextLink></div>}

        {/* The list is one card (rule 13): "+ Add" and "+ Heading" at its label's right (rule 10). */}
        <Card
          label="To-dos"
          className="cc-part cc-todo-card"
          quickAdd={<TodoQuickAdd open={adding} onClose={() => setAdding(false)} defaults={{ list_id: list.id }} />}
          add={list.finished_at ? null : (
            <span className="cc-list-adds">
              <AddLink label="Add heading" expanded={heading === 'new'} onClick={() => setHeading('new')}>Heading</AddLink>
              <AddLink label="Add a to-do" expanded={adding} onClick={() => setAdding(true)} />
            </span>
          )}
        >
        {heading === 'new' && <HeadingBox button="Add heading" onSave={addHeading} onCancel={() => setHeading(null)} />}
        {groups.map(({ heading: h, items }) => {
          if (!h) return items.length > 0 ? <TodoList key="none" todos={items} view="list" label={list.name} picks={picks} onOpen={setOpenId} reorder dropPatch={{ list_id: list.id, heading_id: null }} /> : null;
          return (
            <section key={h.id} aria-label={h.name}>
              {heading === h.id ? <HeadingBox start={h.name} button="Save" onSave={(name) => renameHeading(h, name)} onCancel={() => setHeading(null)} /> : (
                <div className="cc-list-head">
                  <h2 className="cc-todo-group">{h.name}</h2>
                  <button type="button" className="cc-round cc-list-more" ref={(el) => { dots.current[h.id] = el; }} aria-label={`More for ${h.name}`} aria-haspopup="menu" aria-expanded={menu === h.id} onClick={() => setMenu(h.id)}>{DOTS}</button>
                </div>
              )}
              <TodoList todos={items} view="list" label={h.name} picks={picks} onOpen={setOpenId} reorder dropPatch={{ list_id: list.id, heading_id: h.id }} />
            </section>
          );
        })}
        {mine.length === 0 && headings.length === 0 && <p className="cc-quiet">This list has no to-dos yet.</p>}
        </Card>

        <PopMenu open={Boolean(menuHeading)} onClose={() => setMenu(null)} anchorRef={{ current: menu ? dots.current[menu] || null : null }} title="Heading">
          {menuHeading && <MenuItem onClick={() => { setMenu(null); setHeading(menuHeading.id); }}>Edit</MenuItem>}
          {menuHeading && <MenuItem onClick={() => { setMenu(null); deleteHeading(menuHeading); }}>Delete</MenuItem>}
        </PopMenu>

        {!list.finished_at && (
          <>
            <div className="cc-acts"><TextLink onClick={finish}>Mark as finished</TextLink></div>
          </>
        )}

        {finished.length > 0 && (
          <div className="cc-folds">
            <Fold title="Done" summary={`${countFigure(finished.length)} done`} open={doneOpen} onToggle={() => setDoneOpen((v) => !v)}>
              <TodoList todos={finished.slice(0, 50)} label="Done" onOpen={setOpenId} done />
            </Fold>
          </div>
        )}
      </div>

      <TodoBulkBar picks={picks} />
      <TodoPanel id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
