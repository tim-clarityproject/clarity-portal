import { Link } from 'react-router-dom';

// Shared button styles for the new pre-login Welcome flow only. Styles
// live in src/styles/components.css under ".ui-root .auth-btn-*" (see
// the comment there) - the approved mock-up for these screens uses a
// larger size (Nekst 11px, ~52px tall) than the design system's
// already-built .ui-btn-primary / .ui-btn-ghost (Nekst 10px, ~49px
// tall), so these are new classes, not a resize of the existing ones.
// The existing built buttons elsewhere in the app are untouched.
// className is destructured out of each ...props spread below, rather
// than left in it, because AuthShell's per-screen stagger animation
// clones every direct child with its own className ("auth-rise ...") -
// spreading that straight into the button/link after the component's
// own class name would silently replace auth-btn-primary/auth-btn-ghost/
// auth-text-link outright (object spread overrides earlier keys), not
// merge with it. Confirmed this was already happening to Mission.jsx's
// "Log In" button (an AuthPrimaryButton used as a direct AuthShell
// child, same shape as this task's screens 4/5) before this fix - it
// rendered as plain unstyled text, not a coral pill.
export function AuthPrimaryButton({ children, loading, disabled, type = 'button', className = '', ...props }) {
  return (
    <button
      type={type}
      className={`auth-btn-primary${loading ? ' loading' : ''} ${className}`.trim()}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <span className="auth-btn-spinner" aria-hidden="true" /> : children}
    </button>
  );
}

export function AuthGhostButton({ children, to, className = '', ...props }) {
  if (to) {
    return (
      <Link to={to} className={`auth-btn-ghost ${className}`.trim()} {...props}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={`auth-btn-ghost ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}

export function AuthTextLink({ children, to, className = '', ...props }) {
  if (to) {
    return (
      <Link to={to} className={`auth-text-link ${className}`.trim()} {...props}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={`auth-text-link ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}
