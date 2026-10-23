import './design.css';

// The one "i" (Tim, 23 Oct): a 16px thin outlined circle with a small
// "i" inside, like the character ⓘ, in the current text colour. No disc
// behind it and no thicker border. The button around it gives the 44px
// tap area with its padding; the icon itself never grows. Decorative:
// the button carries the accessible name.
export default function InfoIcon() {
  return (
    <svg className="ds-info" viewBox="0 0 16 16" aria-hidden="true">
      <circle className="ds-info-ring" cx="8" cy="8" r="7.3" />
      <circle className="ds-info-dot" cx="8" cy="4.6" r="0.95" />
      <path className="ds-info-stem" d="M6.9 6.9H8.15V11.4M6.7 11.4H9.6" />
    </svg>
  );
}
