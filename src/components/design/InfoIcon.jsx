import './design.css';

// The one "i" (Tim, 23 Oct; redrawn 26 Oct to design reference v15): a
// 16px outlined circle with a small "i" inside, like ⓘ, drawn with 1.5px
// lines in the colour of its words. No disc behind it. The button around
// it gives the 44px tap area; the icon itself never grows. Decorative:
// the button carries the accessible name.
export default function InfoIcon() {
  return (
    <svg className="ds-info" viewBox="0 0 16 16" aria-hidden="true">
      <circle className="ds-info-ring" cx="8" cy="8" r="7" />
      <circle className="ds-info-dot" cx="8" cy="4.9" r="1" />
      <path className="ds-info-stem" d="M6.8 7.2H8.1V11.3M6.6 11.3H9.6" />
    </svg>
  );
}
