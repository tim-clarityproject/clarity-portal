import { forwardRef, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import BoldCrosshair from '../design/BoldCrosshair';
import Chevron from '../design/Chevron';
import Crosshair from '../design/Crosshair';
import { GoogleButton } from '../design/Brand';
import ReadingPopup from '../auth/ReadingPopup';
import { SIGN_IN_PATHS } from '../../lib/signIn/addresses';
import './signin.css';

// The sign-in pages' shared parts (mock-up M26, version 4; Tim, 11 Nov).
// Every page is built from these and nothing else, so the bold crosshair
// and the name sit in the same place on every page, and every box,
// button, link and message is the design reference's own.

const MARK_SIZE = 32;

/** "Back to sign in": above the column, at its left edge, clear of a phone's notch. */
export function BackTo({ to = SIGN_IN_PATHS.signIn, state, children = 'Back to sign in' }) {
  return (
    <Link className="si-back" to={to} state={state}>
      <Chevron direction="left" size="sm" beside="words" />
      <span>{children}</span>
    </Link>
  );
}

/**
 * One sign-in page: the bold crosshair, THE CLARITY PORTAL, then one title
 * as the page's h1. Sign in alone has no title, so there the name is the
 * h1 and the core line follows it.
 * @param {string} [title] the one short title, word for word from M26
 * @param {boolean} [core] "Clarity drives performance." (Sign in only)
 * @param {boolean|object} [back] true for "Back to sign in", or BackTo's props
 * @param {function} [onSubmit] the page's form: Enter in a box sends it
 */
export function SignInPage({ title, core = false, back = false, onSubmit, children }) {
  const Brand = title ? 'div' : 'h1';
  // With a form to send, the column itself is the form, so every part
  // stays a direct child and the spacing rules read the same on every page.
  const Col = onSubmit ? 'form' : 'div';
  const formProps = onSubmit ? { onSubmit, noValidate: true } : {};
  return (
    <div className="ui-root si-root">
      <main className="si-frame">
        <Col className="si-col" {...formProps}>
          {back ? <BackTo {...(back === true ? {} : back)} /> : null}
          <div className="si-mark"><BoldCrosshair size={MARK_SIZE} /></div>
          <Brand className="si-brand">The Clarity Portal</Brand>
          {core ? <p className="si-core">Clarity drives performance.</p> : null}
          {title ? <h1 className="si-ttl">{title}</h1> : null}
          {children}
        </Col>
      </main>
    </div>
  );
}

/** A line of words under the title. */
export function Line({ children }) {
  return <p className="si-p">{children}</p>;
}

/** A labelled box. The label is tied to its box. */
export const Field = forwardRef(function Field({ label, id, className = '', ...rest }, ref) {
  const autoId = useId();
  const fieldId = id || autoId;
  return (
    <div className="si-field">
      <label htmlFor={fieldId}>{label}</label>
      <input ref={ref} id={fieldId} className={`si-inp ${className}`.trim()} {...rest} />
    </div>
  );
});

/** The Email box, as every sign-in page has it. */
export const EmailField = forwardRef(function EmailField({ label = 'Email', autoComplete = 'username', ...rest }, ref) {
  return (
    <Field
      ref={ref}
      label={label}
      type="email"
      name="email"
      autoComplete={autoComplete}
      inputMode="email"
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      placeholder="name@company.com"
      {...rest}
    />
  );
});

/** A password box with its own "Show" (never an eye: the eye means who can see this). */
export const PasswordField = forwardRef(function PasswordField({ label = 'Password', id, autoComplete = 'current-password', ...rest }, ref) {
  const autoId = useId();
  const fieldId = id || autoId;
  const [shown, setShown] = useState(false);
  return (
    <div className="si-field">
      <label htmlFor={fieldId}>{label}</label>
      <div className="si-pw">
        <input
          ref={ref}
          id={fieldId}
          className="si-inp"
          type={shown ? 'text' : 'password'}
          name={autoComplete === 'new-password' ? 'new-password' : 'password'}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          {...rest}
        />
        <button
          type="button"
          className="si-show"
          aria-pressed={shown}
          aria-label={`Show ${label === 'Password' ? 'password' : label.charAt(0).toLowerCase() + label.slice(1)}`}
          onClick={() => setShown((s) => !s)}
        >
          {shown ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  );
});

/** Continue with Google: Google's own button, in their light or dark version. */
export function ContinueWithGoogle({ onClick }) {
  return <GoogleButton onClick={onClick} />;
}

export function OrLine() {
  return <div className="si-or">or</div>;
}

/** The one coral button. Never greyed out: pressing it says what's missing. */
export function MainButton({ children, type = 'submit', busy = false, ...rest }) {
  return (
    <button type={type} className="si-btn" aria-busy={busy || undefined} {...rest}>
      {children}
    </button>
  );
}

/** A text link: a route (`to`) or an action (`onClick`). */
export function TextLink({ to, state, onClick, children }) {
  if (to) return <Link className="si-link" to={to} state={state}>{children}</Link>;
  return <button type="button" className="si-link" onClick={onClick}>{children}</button>;
}

/** A line under the button holding a text link, with any words before it. */
export function Alt({ children }) {
  return <div className="si-alt">{children}</div>;
}

/**
 * A message: what happened, then what to do, each on its own line.
 * @param {string|string[]} lines
 */
export function Message({ lines }) {
  const list = (Array.isArray(lines) ? lines : [lines]).filter(Boolean);
  if (!list.length) return null;
  return (
    <div className="si-err" role="alert">
      <b aria-hidden="true">!</b>
      <span>{list.map((line) => <span key={line}>{line}</span>)}</span>
    </div>
  );
}

/**
 * The one tick box: "I’m 18 or over and I agree to the terms.", where
 * "terms" opens the one terms panel with all three legal documents.
 */
export function TermsRow({ checked, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="si-terms">
      <button
        type="button"
        role="checkbox"
        className="ds-check-box"
        aria-checked={checked}
        aria-label="I’m 18 or over and I agree to the terms"
        onClick={() => onChange(!checked)}
      >
        <span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
        </span>
      </button>
      <span className="si-terms-words" onClick={(e) => { if (!e.target.closest('.si-link')) onChange(!checked); }}>
        I’m 18 or over and I agree to the{' '}
        <button type="button" className="si-link" onClick={() => setOpen(true)}>terms</button>.
      </span>
      <ReadingPopup isOpen={open} onClose={() => setOpen(false)} onAgree={() => onChange(true)} />
    </div>
  );
}

/** Loading: the turning crosshair with one short line. */
export function Wait({ children }) {
  return (
    <div className="si-wait" role="status">
      <Crosshair size="lg" tone="coral" spin />
      <span>{children}</span>
    </div>
  );
}
