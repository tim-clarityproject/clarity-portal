import { Checkbox } from './Controls';
import { Button } from './Button';
import { rowName } from './ListRow';
import { SlidePanel } from './Dialogs';
import { Card, Label, Row, Rows } from './Blocks';
import './design.css';
import './hubTiles.css';

// The hub pages' parts (mock-up M3; Phase 4 step 1).
//
// HubTile: a type-only tile, no icons: the tool's name, one line on how it
// helps, and how long it takes ("~8 minutes"), with an optional quiet live
// line on the right ("Draft saved"; "Done today" in mint with its dot,
// `good`). `big` is an area tile on Personal: the name as a 20px question
// and how many tools it holds (Polish 1: Nekst only for page titles). A
// real link: onClick handles a plain tap. Drawn as the one card (rule 13).
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
  // Polish 1 (rule 3): a group's name is the 13px spaced grey label, never Nekst.
  return (
    <section className={`ds-hub-group${title ? ' ds-hub-group--named' : ''}`}>
      {title && <Label className="ds-hub-group-title">{title}</Label>}
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
 * A hub's recent saved items (M3 .recent; writing rule 60; Polish 1 rules 13
 * and 14): one card, its label ("My plans") with View all on the right, then
 * the last few items as hairline rows, each the item's own name with the tool
 * under it and the date on the right. Nothing shows when there is nothing saved.
 *
 * items: [{ key, title, type, date, dateKey, onClick }]
 */
export function HubRecent({ title, items = [], linkLabel = 'View all', onOpenAll }) {
  if (!items.length) return null;
  return (
    <Card label={title} link={onOpenAll ? { children: linkLabel, onClick: onOpenAll } : undefined} className="ds-hub-recent">
      <Rows label={title}>
        {items.map((x) => (
          <Row key={x.key} name={rowName(x.title, x.type, x.dateKey)} sub={x.type} value={x.date} onClick={x.onClick} strong />
        ))}
      </Rows>
    </Card>
  );
}

/**
 * The Health Check's saved teams (M3 .teams; Polish 1): one card of hairline
 * rows, each the team's name with "3 versions, latest Mon 12 Oct" under it,
 * opening its newest version. `add`: the card's "+ Add" (Start a new Health Check).
 *
 * teams: [{ key, team, line, onClick }]
 */
export function HubTeams({ teams = [], label = 'Your teams', add, empty = 'Each team’s Health Checks show here once you start one.' }) {
  if (!teams.length && !add) return null;
  return (
    <Card label={label} add={add} className="ds-hub-teams-card">
      {teams.length > 0 ? (
        <Rows label={label}>
          {teams.map((t) => <Row key={t.key} name={t.team} sub={t.line} onClick={t.onClick} strong />)}
        </Rows>
      ) : (
        <p className="ds-hub-teams-empty">{empty}</p>
      )}
    </Card>
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

