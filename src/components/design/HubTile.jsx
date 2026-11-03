import { Checkbox } from './Controls';
import { Button } from './Button';
import Chevron from './Chevron';
import { List, ListRow } from './ListRow';
import { SlidePanel } from './Dialogs';
import './design.css';

// The hub pages' parts (mock-up M3; Phase 4 step 1).
//
// HubTile: a type-only tile, no icons: the tool's name, one line on how it
// helps, and how long it takes ("~8 minutes"), with an optional quiet live
// line on the right ("Draft saved"; "Done today" in mint with its dot,
// `good`). `big` is an area tile on Personal: the name in Nekst capitals
// and how many tools it holds. A real link: onClick handles a plain tap.
export function HubTile({ name, line, time, live, good = false, big = false, href, onClick, className = '' }) {
  return (
    <a href={href} className={`ds-hub-tile${big ? ' ds-hub-tile--big' : ''} ${className}`.trim()} onClick={onClick}>
      <span className="ds-hub-tile-head">
        <span className="ds-hub-tile-name">{name}</span>
        {line && <span className="ds-hub-tile-line">{line}</span>}
      </span>
      {(time || live) && (
        <span className="ds-hub-tile-foot">
          <span>{time}</span>
          {live && (
            <span className={`ds-hub-tile-live${good ? ' ds-hub-tile-live--good' : ''}`}>
              {good && <i aria-hidden="true" />}
              {live}
            </span>
          )}
        </span>
      )}
    </a>
  );
}

/** Tiles in two columns (one on a phone). */
export function HubGrid({ children, className = '' }) {
  return <div className={`ds-hub-grid ${className}`.trim()}>{children}</div>;
}

/** A named group of tiles ("Decide"), or an unnamed one. */
export function HubGroup({ title, children }) {
  return (
    <section className={`ds-hub-group${title ? ' ds-hub-group--named' : ''}`}>
      {title && <h2 className="ds-hub-group-title">{title}</h2>}
      <HubGrid>{children}</HubGrid>
    </section>
  );
}

/**
 * The anchor card at the top of a hub (Strategic's Health Check): its
 * tile on a raised card, with what belongs to it underneath (its saved
 * teams, Start a new Health Check).
 */
export function HubAnchor({ children }) {
  return <div className="ds-hub-anchor">{children}</div>;
}

/**
 * A hub's recent saved items (M3 .recent; writing rule 60): a heading, the
 * last few items, each a row with its name in words, the tool under it and
 * the date on the right, then a text link to the whole list ("Open My
 * Plans"). Nothing shows when there is nothing saved.
 *
 * items: [{ key, title, type, date, onClick }]
 */
export function HubRecent({ title, items = [], linkLabel, onOpenAll }) {
  if (!items.length) return null;
  return (
    <section className="ds-hub-recent" aria-label={title}>
      <h2 className="ds-hub-group-title">{title}</h2>
      <List label={title} className="ds-hub-recent-list">
        {items.map((x) => <ListRow key={x.key} title={x.title} type={x.type} date={x.date} onClick={x.onClick} />)}
      </List>
      {linkLabel && (
        <div className="ds-hub-recent-link">
          <Button variant="text" onClick={onOpenAll}>{linkLabel}</Button>
        </div>
      )}
    </section>
  );
}

/**
 * The Health Check's saved teams, inside its anchor card (M3 .teams): the
 * team's name and "3 versions, latest Mon 12 Oct", with the chevron. Each
 * opens that team's versions.
 *
 * teams: [{ key, team, line, onClick }]
 */
export function HubTeams({ teams = [] }) {
  if (!teams.length) return null;
  return (
    <ul className="ds-hub-teams" aria-label="Your teams">
      {teams.map((t) => (
        <li key={t.key}>
          <button type="button" className="ds-hub-team" onClick={t.onClick}>
            <span className="ds-hub-team-text">
              <span className="ds-hub-team-name">{t.team}</span>
              <span className="ds-hub-team-line">{t.line}</span>
            </span>
            <Chevron direction="right" size="sm" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Pin tools to my menu (M3 pin panel; experience rule 9): every tool,
 * grouped, with a tick box each. Up to `max`; once full, the others are
 * greyed out until one is unpinned. Each tick saves at once (onToggle).
 *
 * groups: [{ title, tools: [{ key, name }] }]
 */
export function PinPanel({ open, onClose, groups = [], pinned = [], onToggle, max = 3 }) {
  const full = pinned.length >= max;
  return (
    <SlidePanel open={open} onClose={onClose} title="Pin tools">
      <p className="ds-pin-question">Which tools do you want at the top of your menu?</p>
      {/* One sentence per line (writing rule 49). */}
      <div className="ds-pin-note" aria-live="polite">
        {full
          ? <><p>{`You’ve pinned ${max}.`}</p><p>Unpin one to pin another.</p></>
          : <p>{`Pick up to ${max}.`}</p>}
      </div>
      {groups.map((g) => (
        <section key={g.title} className="ds-pin-group">
          <h3 className="ds-pin-group-title">{g.title}</h3>
          <ul>
            {g.tools.map((t) => {
              const on = pinned.includes(t.key);
              return (
                <li key={t.key} className="ds-pin-row">
                  <Checkbox checked={on} disabled={full && !on} onChange={(next) => onToggle?.(t.key, next)}>
                    {t.name}
                  </Checkbox>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </SlidePanel>
  );
}

