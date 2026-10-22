import './design.css';

// Tiles and hub cards (design reference: Tiles and hub cards). A tile
// shows only what's needed to choose it; detail opens on tap. Type only,
// no icons.
//
// serves: objective numbers this tile serves, shown as small circled numbers.
// score:  { label, value } shown at the bottom, label first.
export function Tile({ name, description, serves = [], score, onClick, ...rest }) {
  return (
    <button type="button" className="ds-tile" onClick={onClick} {...rest}>
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
