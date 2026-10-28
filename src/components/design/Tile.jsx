import './design.css';

// Tiles and hub cards (design reference: Tiles and hub cards). A tile
// shows only what's needed to choose it; detail opens on tap. Type only,
// no icons.
//
// Tiles sit on the slightly raised surface colour, in both modes.
//
// serves: objective numbers this tile serves, shown as small circled numbers.
// score:  { label, value } shown at the bottom, label first.
// flag:   words for something that needs them ("No habits yet"), shown in
//         soft coral with a soft coral edge. Never colour alone.
export function Tile({ name, description, serves = [], score, flag, onClick, ...rest }) {
  return (
    <button type="button" className={`ds-tile${flag ? ' ds-tile--flagged' : ''}`} onClick={onClick} {...rest}>
      {serves.length > 0 && (
        <span className="ds-serves">
          Serves
          <span className="ds-sr"> objectives</span>
          {serves.map((n, i) => (
            <span key={n} className="ds-onum">
              {n}
              {i < serves.length - 1 && <span className="ds-sr">, </span>}
            </span>
          ))}
        </span>
      )}
      <span className="ds-tile-name">{name}</span>
      {description && <span className="ds-tile-desc">{description}</span>}
      {flag && <span className="ds-tile-flag">{flag}</span>}
      {score && (
        <span className="ds-tile-foot">
          <span>{score.label}</span>
          <strong className="ds-tile-score">{score.value}</strong>
        </span>
      )}
    </button>
  );
}

// Hub card: a tile with a name and a one-line performance description
// (hub pages list a section's tools this way, most used first).
export function HubCard({ name, description, onClick, ...rest }) {
  return <Tile name={name} description={description} onClick={onClick} {...rest} />;
}

export function TileGrid({ children, className = '' }) {
  return <div className={`ds-tiles ${className}`.trim()}>{children}</div>;
}

// A tile that turns on and off (M6 .tmpl, "Just started a new role?"):
// a title, a grey line under it, and an outline in the text colour while
// it is on. One tap turns it on, another off.
export function ToggleTile({ pressed, onClick, title, line, className = '' }) {
  return (
    <button type="button" className={`ds-toggle-tile ${className}`.trim()} aria-pressed={pressed} onClick={onClick}>
      <span className="ds-toggle-tile-title">{title}</span>
      {line && <small>{line}</small>}
    </button>
  );
}
