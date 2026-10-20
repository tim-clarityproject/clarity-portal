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

// The Sectional / Radar / Delta toggle (mock-up ISEC, IRAD, IDLT).
export function SectionalIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 2.5v3M13.2 6.3l-2.8.9M11.2 12.5l-1.7-2.4M4.8 12.5l1.7-2.4M2.8 6.3l2.8.9" />
      <circle cx="8" cy="8" r="1.3" />
    </svg>
  );
}

export function RadarIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5l5 3.8-1.9 6.2H4.9L3 6.3z" /><path d="M8 5l2.4 2-1 3H6.6l-1-3z" /></svg>;
}

export function DeltaIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v12M8 4.5h5M8 8H4M8 11.5h3" /></svg>;
}
