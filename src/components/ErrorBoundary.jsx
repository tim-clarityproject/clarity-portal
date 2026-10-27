import { Component } from 'react';
// Each part from its own file (not the design index), so the Health Check's
// own page can use this without loading the whole design set.
import { Button } from './design/Button';
import { CoachContext } from './design/coachContext';
import { keepsHappeningLine } from './design/Status';

// Catches a crash in any page and shows a calm, dark screen instead of a
// blank one. The error itself is logged to the console for us (see
// componentDidCatch) and is never shown to the person. It replaces the
// whole routed area, header and tab bar included - they are rendered by
// the pages and the protected layout inside it, so they cannot be kept
// safely when one of them is what crashed. "Go home" is a plain link (a
// full page load) so the boundary resets and the app starts clean.
// Rendered inside .ui-root so it picks up the design tokens.
export class ErrorBoundary extends Component {
  // The coach, for "If it keeps happening, let your coach know."
  static contextType = CoachContext;

  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        className="ui-root"
        style={{
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--space-5)',
          boxSizing: 'border-box',
          background: 'var(--bg)',
        }}
      >
        <div style={{ maxWidth: '420px', width: '100%', textAlign: 'center' }} role="alert">
          <div className="ui-title">This page hit a problem</div>
          <p className="ui-subtitle" style={{ marginBottom: 'var(--space-5)' }}>
            Anything you saved is safe. Reload the page, or go back to Home.
          </p>
          <p className="ui-subtitle" style={{ marginBottom: 'var(--space-5)' }}>
            {keepsHappeningLine(this.context)}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', alignItems: 'center' }}>
            <Button variant="primary" onClick={() => window.location.reload()}>
              Reload
            </Button>
            <a className="ds-btn ds-btn--outline" href="/welcome">
              Go home
            </a>
          </div>
        </div>
      </div>
    );
  }
}
