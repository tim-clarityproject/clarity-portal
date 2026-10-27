import { Component } from 'react';

// The Health Check page's own error screen: the portal's one offers Home,
// which a respondent without an account can't use. Says what happened, then
// what to do, and reloads the page.
export default class PageError extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="ui-root" role="alert" style={{ minHeight: '100dvh', background: 'var(--bg)', padding: 'var(--space-6) var(--space-4)' }}>
        <div style={{ maxWidth: '480px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 'var(--fs-section)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text)' }}>
            Strategic Alignment Health Check
          </h1>
          <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--fs-body)', color: 'var(--text-2)' }}>
            This page didn’t load properly. Reload it to carry on: your answers are saved as you go.
          </p>
          <button type="button" className="auth-btn-primary" onClick={() => window.location.reload()}>Reload</button>
        </div>
      </div>
    );
  }
}
