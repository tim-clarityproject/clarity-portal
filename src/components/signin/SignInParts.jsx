import { forwardRef, useEffect, useId, useState } from 'react';
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
export function Line({ children, id }) {
  return <p className="si-p" id={id}>{children}</p>;
}

/**
 * A calm line that isn't an error: the page's own grey words, no coral
 * and no icon (the device's clock looks wrong; one of two links opened).
 */
export function Note({ children }) {
  return <p className="si-p si-note" role="status">{children}</p>;
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
export function TextLink({ to, state, onClick, children, ...rest }) {
  if (to) return <Link className="si-link" to={to} state={state} {...rest}>{children}</Link>;
  return <button type="button" className="si-link" onClick={onClick} {...rest}>{children}</button>;
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
  // Words only: anything else (a crafted history state, say) shows nothing.
  const list = [...new Set((Array.isArray(lines) ? lines : [lines]).filter((line) => typeof line === 'string' && line))];
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

/**
 * The small copy icon (M26 seq 7: no Copy button). Copies `text` and says
 * "Copied." in the design reference's toast (the page passes `onCopied`).
 * A 44px tap area; the words are for screen readers.
 */
export function CopyButton({ text, label, onCopied, onMissed }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(typeof text === 'function' ? text() : text);
      onCopied?.();
    } catch {
      onMissed?.();
    }
  };
  return (
    <button type="button" className="si-cpy" aria-label={label} onClick={copy}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="8.5" width="11" height="11" rx="2.5" /><path d="M15.5 8.5V6.5A2 2 0 0 0 13.5 4.5H6.5A2 2 0 0 0 4.5 6.5V13.5A2 2 0 0 0 6.5 15.5H8.5" /></svg>
    </button>
  );
}

/**
 * The authenticator's QR code, drawn here from the set-up address (never
 * Supabase's own picture, which has a white box): dark modules on a square
 * in the light page colour, in both modes, so an authenticator app reads it
 * without inverting (light on black in dark mode was a real risk for Google
 * and Microsoft Authenticator: the prompt's "page-coloured square", as
 * decided). The square is the code alone with its quiet zone (4 modules),
 * so a phone's camera finds its edges; no card or edge round it.
 * The address is never logged or kept: it lives only in the page's memory.
 */
export function QrCode({ value, label }) {
  const [cells, setCells] = useState(null);
  useEffect(() => {
    let live = true;
    setCells(null);
    if (!value) return undefined;
    // Loaded only when a code is shown, so no other page carries it.
    import('qrcode-generator').then(({ default: qrcode }) => {
      if (!live) return;
      const qr = qrcode(0, 'M');
      qr.addData(value);
      qr.make();
      const n = qr.getModuleCount();
      let d = '';
      for (let r = 0; r < n; r += 1) {
        for (let c = 0; c < n; c += 1) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
      }
      setCells({ n, d });
    }).catch(() => { if (live) setCells({ n: 0, d: '' }); });
    return () => { live = false; };
  }, [value]);
  const quiet = 4;
  return (
    <div className="si-qr" role="img" aria-label={label}>
      {cells && cells.n ? (
        <svg viewBox={`${-quiet} ${-quiet} ${cells.n + quiet * 2} ${cells.n + quiet * 2}`} shapeRendering="crispEdges" aria-hidden="true">
          <rect className="si-qr-bg" x={-quiet} y={-quiet} width={cells.n + quiet * 2} height={cells.n + quiet * 2} />
          <path className="si-qr-dots" d={cells.d} />
        </svg>
      ) : <span className="si-qr-wait" />}
    </div>
  );
}

/** Words with "6-digit" kept whole on its line (neither font has the non-breaking hyphen). */
export function keepSixDigit(text) {
  const parts = String(text ?? '').split('6-digit');
  return parts.flatMap((part, i) => (i ? [<span key={i} className="si-nowrap">6-digit</span>, part] : [part]));
}

/** A tick box row in the sign-in pages' own shape (the shared 18px box, a 44px tap area). */
export function TickRow({ checked, onChange, label, children }) {
  return (
    <div className="si-terms">
      <button type="button" role="checkbox" className="ds-check-box" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}>
        <span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
        </span>
      </button>
      <span className="si-terms-words" onClick={() => onChange(!checked)}>{children}</span>
    </div>
  );
}

/** The six digits out of whatever was typed or pasted: "123 456" and "123-456" (as authenticator apps copy them) and full-width digits all read as 123456. */
export const digitsOf = (text) => String(text ?? '').normalize('NFKC').replace(/\D+/g, '').slice(0, 6);

/**
 * The 6-digit code's box: no example code in it, the one-time-code
 * autocomplete, and whatever is typed, pasted or put in at once read as
 * its six digits.
 */
export function CodeField({ label, value, onDigits, autoFocus = true }) {
  return (
    <Field
      label={label}
      name="one-time-code"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      pattern="[0-9]*"
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onDigits(digitsOf(e.target.value))}
      // The box holds 6 characters, so a browser would cut "123 456" to
      // "123 45" before the page saw it: a paste is read here instead.
      onPaste={(e) => {
        const pasted = e.clipboardData?.getData('text');
        if (typeof pasted !== 'string') return;
        e.preventDefault();
        onDigits(digitsOf(pasted));
      }}
      // The same for several characters put in at once another way (a
      // keyboard's own suggestion, a password manager).
      onBeforeInput={(e) => {
        if (typeof e.data !== 'string' || e.data.length < 2) return;
        e.preventDefault();
        const box = e.target;
        const from = box.selectionStart ?? box.value.length;
        const to = box.selectionEnd ?? box.value.length;
        onDigits(digitsOf(`${box.value.slice(0, from)}${e.data}${box.value.slice(to)}`));
      }}
    />
  );
}
