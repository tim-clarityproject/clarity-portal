import { forwardRef } from 'react';
import { DisclosureArrow, SearchField, useIsPhone } from '../../components/design';
import { Row } from '../../components/design/Blocks';
import './people.css';

// The coach's people pages' shared parts (Polish 1, Stage B, B4: Clients, Leads, Network, an organisation, a group,
// Past clients, Renewals), built on the 25 Nov reference's blocks so every list reads the same:
//   - ListBar: the search box on its own line (a 56px box), then one row of controls at one height (40px, 44px on a
//     phone) and one style: the layouts as one joined switch and every filter or sort behind a drop-down (rule 5,
//     rule 17's "any filter in one drop-down"; the reference's calendar bar). On a phone, View and Filter.
//   - PersonRow: the reference's list row (.li): the name, one grey line of facts, and the date or value on the right
//     in grey on a laptop; on a phone the date joins the grey line, so a row stays two lines (coach rule 46).

/**
 * A drop-down's look (the reference's `.box.dd` at a control row's height) on a button that opens a menu or a panel.
 * `words`: what shows; `open`: the chevron turns while its menu is open.
 */
export const BarDrop = forwardRef(function BarDrop({ words, open = false, label, className = '', ...rest }, ref) {
  return (
    <button ref={ref} type="button" className={`ds-dd ds-dd--row cc-pbar-dd ${className}`.trim()} aria-expanded={open} aria-label={label} {...rest}>
      <span className="ds-dd-value">{words}</span>
      <DisclosureArrow open={open} />
    </button>
  );
});

/**
 * The list's bar. `search`: { label, value, onChange }. `layouts`: [{ value, label }] shown as one joined switch on a
 * laptop (`layout`, `onLayout`). `children`: the drop-downs (BarDrop) after it. `phone`: the drop-downs a phone shows
 * instead of the switch (View, Filter).
 */
export function ListBar({ search, layouts, layout, onLayout, children, phone, className = '' }) {
  const isPhone = useIsPhone();
  return (
    <div className={`cc-pbar-wrap ${className}`.trim()}>
      {search && <div className="cc-pbar-search"><SearchField label={search.label} placeholder={search.label} value={search.value} onChange={search.onChange} /></div>}
      <div className="cc-pbar">
        {!isPhone && layouts && layouts.length > 1 && (
          <div className="ds-seg ds-seg--equal ds-seg--placed cc-pbar-seg" role="group" aria-label="Show as">
            {layouts.map((l) => (
              <button key={l.value} type="button" className="ds-seg-btn" aria-pressed={layout === l.value} onClick={() => onLayout?.(l.value)}>{l.label}</button>
            ))}
          </div>
        )}
        {isPhone ? phone : children}
      </div>
    </div>
  );
}

/**
 * One person (or group, lead, organisation…) in a list: the shared Row with `facts` as its grey line and `when` on the
 * right. `href` makes it a real link (a new tab with a modifier key); a plain click calls `onClick` instead.
 */
export function PersonRow({ name, facts = [], when, href, onClick, strong = true, label, className = '' }) {
  const isPhone = useIsPhone();
  const shown = facts.filter(Boolean);
  const parts = isPhone && when ? [when, ...shown] : shown;
  const sub = parts.length > 0 ? (
    <span className="cc-li-facts" data-grey-line>
      {parts.map((f, i) => <span key={typeof f === 'string' ? `${f}-${i}` : i} data-drop={isPhone && when && i === 0 ? undefined : String(i)}>{f}</span>)}
    </span>
  ) : null;
  const go = onClick ? (e) => {
    if (href && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1)) return;
    e.preventDefault();
    onClick(e);
  } : undefined;
  // `label`: what a screen reader hears for the row ("Edit Portal seats"), Row's own.
  return <Row name={name} sub={sub} value={isPhone ? null : when || null} href={href} onClick={go} strong={strong} label={label} className={`cc-li ${className}`.trim()} />;
}
