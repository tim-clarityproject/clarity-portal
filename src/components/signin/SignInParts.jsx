import { forwardRef, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import BoldCrosshair from '../design/BoldCrosshair';
import Chevron from '../design/Chevron';
import Crosshair from '../design/Crosshair';
import ReadingPopup from '../auth/ReadingPopup';
import { SIGN_IN_PATHS } from '../../lib/signIn/addresses';
import './signin.css';

// The sign-in pages' shared parts (M26 for what they do; since polish 1
// the 25 Nov design reference and example pages for how they look). Every
// page is built from these and nothing else, so the crosshair and the name
// sit in the same place on every page, and every box, button, link and
// message is the reference's own.

// The crosshair at the top of every sign-in page (25 Nov reference: 40px).
const MARK_SIZE = 40;

/** "Back to sign in": above the column, at its left edge, clear of a phone's notch. */
export function BackTo({ to = SIGN_IN_PATHS.signIn, state, children = 'Back to sign in' }) {
  return (
    // On the column's left edge (rule 29t).
    <Link className="si-back" to={to} state={state}>
      <Chevron direction="left" size="sm" beside="words" />
      <span>{children}</span>
    </Link>
  );
}

/**
 * One sign-in page, as the 25 Nov reference draws it (polish 1, rule 22):
 * the crosshair near the top of the screen (about 11% of its height down,
 * at least 80px), the form in the middle, and THE CLARITY PORTAL in Nekst
 * at the foot. The title is the page's h1, in Nekst capitals, centred over
 * the column; boxes and buttons span the column, and the lines and links
 * under them are centred.
 * @param {string} [title] the one short title ("Sign in", "Create your account")
 * @param {boolean} [core] kept for older callers; the reference has no core line
 * @param {boolean|object} [back] true for "Back to sign in", or BackTo's props
 * @param {function} [onSubmit] the page's form: Enter in a box sends it
 * @param {boolean} [message] a short message page (no boxes, no list:
 *   Check your email, You're in, Signing you in). It reads the same; a page
 *   with boxes says so on its column (`data-form="centred"`) for the checks
 *   (tests/signin/centring.mjs).
 */
export function SignInPage({ title, core = false, back = false, onSubmit, message = !onSubmit, children }) {
  // With no title (a page only saying "Signing you in"), the product's
  // name at the foot is the page's one heading.
  const Foot = title ? 'p' : 'h1';
  // With a form to send, the column itself is the form, so every part
  // stays a direct child and the spacing reads the same on every page.
  const Col = onSubmit ? 'form' : 'div';
  const formProps = onSubmit ? { onSubmit, noValidate: true } : {};
  return (
    <div className="ui-root si-root">
      <main className="si-frame">
        <div className="si-mark" aria-hidden="true"><BoldCrosshair size={MARK_SIZE} /></div>
        <div className="si-mid">
          {back ? <BackTo {...(back === true ? {} : back)} /> : null}
          {/* Centred throughout (the 25 Nov reference): a page with boxes says
              so (data-form), and its lists and tick box rows keep their own
              left edge inside the column (data-align="start" on each). */}
          <Col className={message ? 'si-col si-col--message' : 'si-col'} data-align="centre" data-form={message ? undefined : 'centred'} {...formProps}>
            {title ? <h1 className="si-ttl">{title}</h1> : null}
            {children}
          </Col>
        </div>
        <Foot className="si-brand">The Clarity Portal</Foot>
      </main>
    </div>
  );
}

/** A line of words under the title. */
export function Line({ children, id, small = false }) {
  return <p className={small ? 'si-p si-p--small' : 'si-p'} id={id}>{children}</p>;
}

/**
 * A calm line that isn't an error: the page's own grey words, no coral
 * and no icon (the device's clock looks wrong; one of two links opened).
 */
export function Note({ children }) {
  return <p className="si-p si-note" role="status">{children}</p>;
}

/** A labelled box. The label is tied to its box. */
export const Field = forwardRef(function Field({ label, id, className = '', placeholder, ...rest }, ref) {
  const autoId = useId();
  const fieldId = id || autoId;
  // The name sits inside the box (polish 1, rule 22); the label stays for
  // screen readers and password managers, tied to its box.
  return (
    <div className="si-field">
      <label className="si-sr" htmlFor={fieldId}>{label}</label>
      <input ref={ref} id={fieldId} className={`si-inp ${className}`.trim()} placeholder={placeholder ?? label} {...rest} />
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
      <label className="si-sr" htmlFor={fieldId}>{label}</label>
      <div className="si-pw">
        <input
          ref={ref}
          id={fieldId}
          className="si-inp"
          placeholder={label}
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

// Google's own four-colour "G", never recoloured (Google's sign-in branding rules).
function GoogleG() {
  return (
    <svg className="si-g" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/**
 * Continue with Google (polish 1, rule 22): Google's own four-colour G at
 * 18px before the words, on a quiet outlined button the height of the boxes.
 */
export function ContinueWithGoogle({ onClick, children = 'Continue with Google' }) {
  return (
    <button type="button" className="si-google" onClick={onClick}>
      {/* One line of words with the G before them, so at a reader's larger
          text the lines wrap centred, the G on the first. */}
      <span className="si-google-in"><GoogleG />{children}</span>
    </button>
  );
}

export function OrLine() {
  return <div className="si-or">or</div>;
}

/** The one main button (black in light, white in dark). Never greyed out: pressing it says what's missing. */
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
      {/* The words fill the box beside the "!", set on the left: on a message page the box's two sides keep equal padding (rule 49). */}
      <span data-align="start">{list.map((line) => <span key={line}>{line}</span>)}</span>
    </div>
  );
}

/**
 * The one tick box: "I’m 18 or over and I agree to the terms.", where
 * "terms" opens the one terms panel with all three legal documents. The box
 * itself lines up with the boxes' left edge, the page's one left edge
 * (rules 5 and 49).
 */
export function TermsRow({ checked, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="si-terms" data-align="start">
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
    // The quiet zone's share of the square, so the page can start the dots on its left edge (signin.css).
    <div className="si-qr" role="img" aria-label={label} style={cells && cells.n ? { '--si-qr-quiet': quiet / (cells.n + quiet * 2) } : undefined}>
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

/**
 * A tick box row in the sign-in pages' own shape (the shared 18px box, a
 * 44px tap area), the box on the page's one left edge (rule 49).
 */
export function TickRow({ checked, onChange, label, children }) {
  return (
    <div className="si-terms" data-align="start">
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
 * The 6-digit code (polish 1, rule 23): six squares, one hidden input.
 * The input carries autocomplete="one-time-code" and the numeric keypad,
 * so a browser's or phone's own autofill still works; it lies over the
 * squares, so tapping any square types into it. Typing moves on to the
 * next square, Backspace goes back, and a paste fills all six. Whatever is
 * typed, pasted or put in at once is read as its six digits ("123 456",
 * "123-456" and full-width digits all read as 123456: sign-in rule 37).
 * The sixth digit sends the code by itself (`onComplete`). `wrong` draws
 * the squares' edges in the mistake colour until typing starts again.
 */
export function CodeField({ label, value, onDigits, onComplete, autoFocus = true, wrong = false, describedBy }) {
  const autoId = useId();
  const box = useRef(null);
  const [focused, setFocused] = useState(false);
  const digits = digitsOf(value);
  const take = (next) => {
    const d = digitsOf(next);
    onDigits(d);
    if (d.length === 6 && d !== digits) onComplete?.(d);
  };
  // The caret always sits after the last digit, so typing adds the next
  // one and Backspace takes the last one off, wherever the square tapped.
  const toEnd = () => {
    const el = box.current;
    if (!el) return;
    const end = el.value.length;
    try { el.setSelectionRange(end, end); } catch { /* not every input type allows it */ }
  };
  const current = Math.min(digits.length, 5);
  return (
    <div className={`si-code${wrong ? ' si-code--wrong' : ''}`}>
      <label className="si-sr" htmlFor={autoId}>{label}</label>
      <input
        ref={box}
        id={autoId}
        className="si-code-input"
        name="one-time-code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        pattern="[0-9]*"
        autoFocus={autoFocus}
        aria-describedby={describedBy}
        aria-invalid={wrong || undefined}
        value={digits}
        onChange={(e) => take(e.target.value)}
        onFocus={() => { setFocused(true); requestAnimationFrame(toEnd); }}
        onBlur={() => setFocused(false)}
        onClick={toEnd}
        onKeyUp={toEnd}
        // The box holds 6 characters, so a browser would cut "123 456" to
        // "123 45" before the page saw it: a paste is read here instead.
        onPaste={(e) => {
          const pasted = e.clipboardData?.getData('text');
          if (typeof pasted !== 'string') return;
          e.preventDefault();
          take(pasted);
        }}
        // The same for several characters put in at once another way (a
        // keyboard's own suggestion, a password manager).
        onBeforeInput={(e) => {
          if (typeof e.data !== 'string' || e.data.length < 2) return;
          e.preventDefault();
          const el = e.target;
          const from = el.selectionStart ?? el.value.length;
          const to = el.selectionEnd ?? el.value.length;
          take(`${el.value.slice(0, from)}${e.data}${el.value.slice(to)}`);
        }}
      />
      <div className="si-code-squares" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={`si-code-sq${focused && i === current ? ' is-current' : ''}${digits[i] ? ' is-filled' : ''}`}>{digits[i] || ''}</span>
        ))}
      </div>
    </div>
  );
}

/**
 * What a code's answer says, under the squares (the 25 Nov reference: a
 * small centred line). Words only, one line however many parts.
 */
export function CodeMessage({ lines, id }) {
  const list = [...new Set((Array.isArray(lines) ? lines : [lines]).filter((line) => typeof line === 'string' && line))];
  return <p className="si-code-msg" id={id} role="alert">{list.join(' ')}</p>;
}
