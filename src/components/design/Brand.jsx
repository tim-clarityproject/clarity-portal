import '@fontsource/roboto/500.css';
import './design.css';

// The logo mark, always with its crosshair, used as supplied (rule 11):
// Emblem NEGATIVE (white crosshair) on dark, Emblem POSITIVE (black
// crosshair) on light. Both are in the page; the colour tokens show the
// right one, so it follows the mode with no flash.
export function BrandMark({ size = 48, className = '' }) {
  const style = { width: size, height: size };
  return (
    <span className={`ds-brand-mark ${className}`.trim()}>
      <img className="ds-brand-mark-dark" src="/brand/logomark-negative.png" alt="The Clarity Portal" style={style} />
      <img className="ds-brand-mark-light" src="/brand/logomark-positive.png" alt="The Clarity Portal" style={style} />
    </span>
  );
}

// Google's own four-colour "G", never recoloured.
function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

// Continue with Google, following Google's rules: their "G", the words
// "Continue with Google", Roboto Medium, and their light version on light
// and their dark version on dark (the --google-* tokens). Placed above
// email and password, as most people pick it.
export function GoogleButton({ onClick, disabled = false, children = 'Continue with Google', ...rest }) {
  return (
    <button type="button" className="ds-google" onClick={onClick} disabled={disabled} {...rest}>
      <GoogleG />
      {children}
    </button>
  );
}
