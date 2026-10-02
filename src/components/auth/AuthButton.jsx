import { Link } from 'react-router-dom';

// Shared button styles for the new pre-login Welcome flow only. Styles
// live in src/styles/components.css under ".ui-root .auth-btn-*" (see
// the comment there) - the approved mock-up for these screens uses a
// larger size (Nekst 11px, ~52px tall) than the design system's
// already-built .ui-btn-primary / .ui-btn-ghost (Nekst 10px, ~49px
// tall), so these are new classes, not a resize of the existing ones.
// The existing built buttons elsewhere in the app are untouched.
export function AuthPrimaryButton({ children, loading, disabled, type = 'button', ...props }) {
  return (
    <button
      type={type}
      className={`auth-btn-primary${loading ? ' loading' : ''}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <span className="auth-btn-spinner" aria-hidden="true" /> : children}
    </button>
  );
}

export function AuthGhostButton({ children, to, ...props }) {
  if (to) {
    return (
      <Link to={to} className="auth-btn-ghost" {...props}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className="auth-btn-ghost" {...props}>
      {children}
    </button>
  );
}

export function AuthTextLink({ children, to, ...props }) {
  if (to) {
    return (
      <Link to={to} className="auth-text-link" {...props}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className="auth-text-link" {...props}>
      {children}
    </button>
  );
}
