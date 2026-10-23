import { useContext } from 'react';
import { ThemeScopeContext } from '../../components/design';
import { ViewContext } from './galleryUtils';

// The gallery's own frame (not part of the design system): each component
// is shown in a dark panel and a light panel side by side, as
// design-reference-v3.html, or once in the page's own mode.

// One panel: a .ui-root forced into `mode` (or following the page when
// mode is null), so every token inside switches, and pop-ups opened from
// it keep its colours.
export function Pane({ mode, label, children, className = '' }) {
  return (
    <ThemeScopeContext.Provider value={mode}>
      <div className={`ui-root dr-pane ${className}`.trim()} data-theme={mode || undefined}>
        {label && <span className="dr-pane-label" aria-hidden="true">{label}</span>}
        {children}
      </div>
    </ThemeScopeContext.Provider>
  );
}

// `demo` is a component, so each panel has its own state.
export function Panes({ demo: Demo, wide = false }) {
  const view = useContext(ViewContext);
  if (view === 'one') {
    return (
      <div className="dr-panes dr-panes--one">
        <Pane mode={null} className="dr-pane--one"><Demo mode={null} /></Pane>
      </div>
    );
  }
  return (
    <div className={`dr-panes${wide ? ' dr-panes--wide' : ''}`}>
      <Pane mode="dark" label="Dark"><Demo mode="dark" /></Pane>
      <Pane mode="light" label="Light"><Demo mode="light" /></Pane>
    </div>
  );
}

export function GallerySection({ id, title, rules, demo, wide = false, children }) {
  return (
    <section className={`dr-c${wide ? ' dr-c--wide' : ''}`} id={id} aria-labelledby={`${id}-h`}>
      <h2 className="dr-h2" id={`${id}-h`}>{title}</h2>
      <div className="dr-demo">
        {demo ? <Panes demo={demo} wide={wide} /> : children}
      </div>
      <div className="dr-rules">{rules}</div>
    </section>
  );
}

export function New() {
  return <span className="dr-new">new</span>;
}
