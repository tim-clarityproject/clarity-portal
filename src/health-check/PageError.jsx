import { Component } from 'react';
import { Button } from '../components/design/Button';
import { GuestFrame, GuestTitle } from '../components/design/GuestPage';

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
      <div className="ui-root" role="alert">
        {/* A short message page: centred throughout (sign-in rule 49, one left edge). */}
        <GuestFrame narrow="wide" message>
          <div>
          <GuestTitle>Strategic Alignment Health Check</GuestTitle>
          <p className="hc-lead">This page didn’t load properly.</p>
          <p className="hc-lead">Reload it to carry on, because your answers are saved as you go.</p>
          <div className="hc-begin"><Button variant="primary" onClick={() => window.location.reload()}>Reload the page</Button></div>
          </div>
        </GuestFrame>
      </div>
    );
  }
}
