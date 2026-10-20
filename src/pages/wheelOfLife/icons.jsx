// Small line icons from the approved mock-up (wheel-of-life.html: PEN,
// ITGT, BIN). Stroke colour and size come from the CSS around them.

export function PenIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 2.5l3 3L6 13H3v-3z" /></svg>;
}

export function TargetIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" />
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2" />
    </svg>
  );
}

export function BinIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V4.5h4V7M7 7l.8 12.5h8.4L17 7M10.5 11v5M13.5 11v5" /></svg>;
}
