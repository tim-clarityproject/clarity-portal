import { useEffect, useMemo, useRef, useState } from 'react';
import { SearchField, useToast } from '../../components/design';
import { AddLink, CardHead } from '../../components/design/Blocks';
import { networkPageOf, saveNetworkPerson, useNetworkVersion } from '../../lib/coach/networkData';
import {
  archivedLink, cellChange, cellLabel, cellTyped, cellWords, cleared, headingLabel, networkProblem, NETWORK_LOAD_PROBLEM, onlyChoices, RATING_CHOICES, rhythmChoices, rowAfter, TABLE_START, TABLE_WORDS, tableColumns,
  networkPath, tableCount, tableFoot, tableQuery, withOnly, withSort,
} from '../../lib/coach/network';
import { Back, EditCell, MenuItem, MenuLabel, PopMenu, TextLink, TICK, useCoachPortal } from './parts';

// Network's table (M11 seq 77: "Network: Table", "…changing a rating", "…a
// column menu", "…the archive"): a spreadsheet in its own box, so its
// headings and the Name column both stay put while the rest scrolls, on a
// laptop and a phone alike. Search by name or organisation with the count
// and Clear; 50 rows at a time with "Show 50 more", each page asked of
// networkData.js (never everyone at once); every heading opens Sort and,
// where it fits, Show only; a rating or the rhythm opens a small menu that
// floats above the table; Organisation, Role, Email, Phone, Last spoke and
// your own columns are typed over. Each change saves with "Saved." and
// Undo, and the row's Where to focus and Next due follow at once.

const SEARCH_WAIT = 250;

export default function NetworkTable({ archived, onArchive, onOpen, onPanel, counts, onState }) {
  const { userId, settings, networkColumns, todayKey } = useCoachPortal();
  const toast = useToast();
  const version = useNetworkVersion();
  const [state, setState] = useState(TABLE_START);
  const [typed, setTyped] = useState('');
  const [page, setPage] = useState({ rows: [], total: 0, all: 0, key: '', loaded: false });
  const [problem, setProblem] = useState(null);
  const [menu, setMenu] = useState(null); // 'col:<key>' | 'rate:<person>:<key>' | 'rhythm:<person>'
  const anchors = useRef({});
  const anchor = (key) => ({ current: anchors.current[key] || null });
  const ref = (key) => (el) => { if (el) anchors.current[key] = el; else delete anchors.current[key]; };
  const boxRef = useRef(null);
  const own = useRef(0); // changes this table made itself: their rows are already right, so nothing is asked again
  const held = useRef({ key: '', pages: 0, version: -1 });
  const turn = useRef(0);
  const [again, setAgain] = useState(0);

  const full = useMemo(() => ({ ...state, archived }), [state, archived]);
  useEffect(() => { onState?.(full, page.total); }, [full, page.total, onState]);
  // The archive and the table each start from the top, unsearched.
  useEffect(() => { setState(TABLE_START); setTyped(''); }, [archived]);
  // Searching waits a moment for the typing to stop.
  useEffect(() => {
    if (typed === state.search) return undefined;
    const timer = setTimeout(() => setState((s) => ({ ...s, search: typed, pages: 1 })), SEARCH_WAIT);
    return () => clearTimeout(timer);
  }, [typed, state.search]);

  const key = JSON.stringify([full.search, full.sort, full.desc, full.only, full.archived, todayKey, userId]);
  useEffect(() => {
    if (own.current > 0 && held.current.key === key && held.current.pages === state.pages) { own.current -= 1; held.current.version = version; return undefined; }
    turn.current += 1;
    const mine = turn.current;
    const more = held.current.key === key && held.current.version === version && state.pages > held.current.pages;
    const from = more ? held.current.pages + 1 : 1;
    (async () => {
      try {
        let last = null;
        const rows = [];
        // One page at a time, 50 rows each: "Show 50 more" asks only for the next one.
        for (let n = from; n <= state.pages; n += 1) {
          last = await networkPageOf(userId, tableQuery({ ...full, pages: n }, todayKey), networkColumns);
          if (mine !== turn.current) return;
          rows.push(...last.rows);
        }
        const fresh = held.current.key !== key;
        held.current = { key, pages: state.pages, version };
        setProblem(null);
        setPage((p) => ({ rows: more ? [...p.rows, ...rows] : rows, total: last.total, all: last.all, key, loaded: true }));
        if (fresh && boxRef.current) boxRef.current.scrollTop = 0;
      } catch (e) { if (mine === turn.current) { setProblem(e?.code === 'OFFLINE' || e?.code === 'NO_ROOM' ? networkProblem(e) : NETWORK_LOAD_PROBLEM); setPage((p) => ({ ...p, loaded: true })); } }
    })();
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, state.pages, version, again]);

  const columns = useMemo(() => tableColumns(networkColumns, settings.crm).shown, [networkColumns, settings.crm]);
  const count = tableCount(page, full);
  const foot = tableFoot(page.rows.length, page.total);

  /** A cell changed: the row is right at once, the change is kept, and Undo puts both back. False keeps the box open. */
  const save = (person, column, value) => {
    const plan = cellChange(person, column, value, todayKey);
    if (!plan) return true;
    if (plan.error) { toast.error(plan.error); return false; }
    const put = async (patch) => {
      own.current += 1;
      setPage((p) => ({ ...p, rows: p.rows.map((r) => (r.id === person.id ? rowAfter(r, patch) : r)) }));
      try { return await saveNetworkPerson(userId, patch); } catch (e) {
        own.current = Math.max(0, own.current - 1);
        held.current.version = -1; // ask again: the row on screen isn't what was kept
        setAgain((n) => n + 1);
        throw e;
      }
    };
    put(plan.patch)
      .then((status) => toast.saved({ message: status === 'queued' ? 'Will sync' : plan.toast, long: true, onUndo: () => put(plan.undo).catch((e) => toast.error(networkProblem(e))) }))
      .catch((e) => toast.error(networkProblem(e)));
    return true;
  };

  const menuColumn = menu?.startsWith('col:') ? columns.find((c) => `col:${c.key}` === menu) : null;
  const [, menuPerson, menuKey] = menu && !menu.startsWith('col:') ? menu.split('|') : [];
  const person = menuPerson ? page.rows.find((r) => r.id === menuPerson) : null;
  const rated = person && menuKey ? columns.find((c) => c.key === menuKey) : null;
  const sortBy = (column, desc) => { setState((s) => withSort(s, column, desc)); setMenu(null); };

  return (
    <div className="cc-fade">
      {archived && <Back to={TABLE_WORDS.back} onClick={() => onArchive(false)} />}
      <div className="cc-net-ctl">
        <SearchField label={TABLE_WORDS.search} placeholder="Search by name or organisation" value={typed} onChange={setTyped} />
        <span className="cc-net-count" aria-live="polite">{page.loaded ? count.words : ''}</span>
        {count.clear && <TextLink onClick={() => { setTyped(''); setState((s) => cleared(s)); }}>{TABLE_WORDS.clear}</TextLink>}
      </div>
      {/* The list's label with "+ Add" at its right (rule 10): adding someone needs their ratings, so it opens its panel. */}
      <CardHead label={archived ? 'Archived' : 'Everyone'} add={archived ? undefined : <AddLink label={TABLE_WORDS.add} onClick={() => onPanel('add')} />} />
      {problem && <p className="cc-problem" role="alert">{problem}</p>}
      {page.loaded && !problem && page.rows.length === 0 && <p className="cc-quiet">{count.clear ? TABLE_WORDS.noneFound : archived ? 'Nobody is archived.' : 'Nobody is in your Network yet. Add someone, or import a spreadsheet.'}</p>}
      {page.rows.length > 0 && (
        <div className="cc-net-box" ref={boxRef} tabIndex={0} role="region" aria-label={archived ? 'Network, the archive' : 'Network table'}>
          <table className="cc-table cc-net-table">
            <thead>
              <tr>
                {columns.map((c) => {
                  const on = full.sort === c.sort || (c.only && (full.only?.[c.only] || []).length > 0);
                  return (
                    <th key={c.key} scope="col" className={`${c.fixed ? 'cc-net-name' : ''}${c.numeric ? ' cc-net-n' : ''}`.trim() || undefined} aria-sort={full.sort === c.sort ? (full.desc ? 'descending' : 'ascending') : undefined}>
                      <button type="button" className={`cc-th${on ? ' cc-th--on' : ''}`} ref={ref(`col:${c.key}`)} aria-haspopup="menu" aria-expanded={menu === `col:${c.key}`} onClick={() => setMenu(`col:${c.key}`)}>{headingLabel(c, full)}</button>
                    </th>
                  );
                })}
                <th scope="col" className="cc-th-add"><button type="button" className="cc-round" aria-label={TABLE_WORDS.addColumn} onClick={() => onPanel('addColumn')}><span className="ds-addrow-mark" aria-hidden="true" /></button></th>
              </tr>
            </thead>
            <tbody>
              {page.rows.map((p) => (
                <tr key={p.id}>
                  {columns.map((c) => {
                    if (c.fixed) return <th key={c.key} scope="row" className="cc-net-name"><a href={networkPath({ tab: 'table', archived, person: p.id })} className="cc-table-name" onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); onOpen(p.id); }}>{p.name}</a></th>;
                    const words = cellWords(p, c, todayKey);
                    if (c.edit === 'rating' || c.edit === 'rhythm') {
                      const k = `cell|${p.id}|${c.key}`;
                      return <td key={c.key} className={c.numeric ? 'cc-net-n' : undefined}><button type="button" className={`cc-cell${words ? '' : ' cc-cell--empty'}`} ref={ref(k)} aria-haspopup="menu" aria-expanded={menu === k} aria-label={cellLabel(p, c, todayKey)} onClick={() => setMenu(k)}>{words || TABLE_WORDS.emptyCell}</button></td>;
                    }
                    if (c.edit === 'type') {
                      const kind = c.own?.kind === 'number' ? 'number' : c.own?.kind === 'choice' && c.own.options?.length ? 'choice' : 'text';
                      return <td key={c.key} className={c.numeric ? 'cc-net-n' : undefined}><EditCell label={`${c.label} for ${p.name}`} value={cellTyped(p, c, todayKey)} words={words} kind={kind} options={c.own?.options || []} empty={TABLE_WORDS.emptyCell} onSave={(v) => save(p, c, v)} /></td>;
                    }
                    return <td key={c.key} className={c.numeric ? 'cc-net-n' : undefined}>{words}</td>;
                  })}
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PopMenu open={Boolean(menuColumn)} onClose={() => setMenu(null)} anchorRef={anchor(menu || '')} title={menuColumn?.label || 'Column'}>
        {menuColumn && (
          <>
            <MenuLabel>Sort</MenuLabel>
            {menuColumn.sorts.map(([desc, label]) => <MenuItem key={label} checked={full.sort === menuColumn.sort && Boolean(full.desc) === desc} onClick={() => sortBy(menuColumn, desc)}>{label}</MenuItem>)}
            {onlyChoices(menuColumn, page.rows, full).length > 0 && <MenuLabel>Show only</MenuLabel>}
            {onlyChoices(menuColumn, page.rows, full).map(([value, label]) => {
              const on = (full.only?.[menuColumn.only] || []).some((v) => String(v) === String(value));
              return <MenuItem key={String(value)} checked={on} onClick={() => setState((s) => withOnly(s, menuColumn.only, value, !on))}>{label}</MenuItem>;
            })}
          </>
        )}
      </PopMenu>
      <PopMenu open={Boolean(rated && rated.edit === 'rating')} onClose={() => setMenu(null)} anchorRef={anchor(menu || '')} title={rated?.label || 'Rating'}>
        {rated && rated.edit === 'rating' && (
          <div className="cc-net-rate">
            {/* The chosen number has the tick, as every drop-down (tidy follow-up 3, run 7's 8). */}
            {RATING_CHOICES.map((n) => <button key={n} type="button" role="menuitemradio" aria-checked={person[rated.key] === n} className="cc-pop-item cc-net-rate-n" onClick={() => { setMenu(null); save(person, rated, n); }}><span>{n}</span>{person[rated.key] === n && TICK}</button>)}
          </div>
        )}
      </PopMenu>
      <PopMenu open={Boolean(rated && rated.edit === 'rhythm')} onClose={() => setMenu(null)} anchorRef={anchor(menu || '')} title={rated?.label || 'Rhythm'}>
        {rated && rated.edit === 'rhythm' && rhythmChoices().map((r) => <MenuItem key={String(r.value)} checked={(person.rhythm_months ?? null) === r.value} onClick={() => { setMenu(null); save(person, rated, r.value); }}>{r.label}</MenuItem>)}
      </PopMenu>

      {(foot.showing || foot.more) && (
        <div className="cc-net-more">
          <span className="cc-net-count">{foot.showing}</span>
          <TextLink onClick={() => setState((s) => ({ ...s, pages: s.pages + 1 }))}>{foot.more}</TextLink>
        </div>
      )}
      {!archived && (
        <>
          <div className="cc-pfoot">
            <TextLink onClick={() => onPanel('import')}>{TABLE_WORDS.importSheet}</TextLink>
            <TextLink onClick={() => onPanel('export')}>{TABLE_WORDS.export}</TextLink>
            <TextLink onClick={() => onPanel('columns')}>{TABLE_WORDS.columns}</TextLink>
            {archivedLink(counts?.archived || 0) && <TextLink onClick={() => onArchive(true)}>{archivedLink(counts.archived)}</TextLink>}
          </div>
        </>
      )}
    </div>
  );
}
