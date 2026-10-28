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
      <div className="ui-root hc" role="alert">
        <main className="hc-main">
          <div className="page wlc">
            <h2 className="t">Strategic Alignment Health Check</h2>
            <p className="lead">This page didn’t load properly.</p>
            <p className="lead">Reload it to carry on, because your answers are saved as you go.</p>
            <button type="button" className="btn full" onClick={() => window.location.reload()}>Reload</button>
          </div>
        </main>
      </div>
    );
  }
}
