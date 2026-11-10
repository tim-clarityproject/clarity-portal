import './design.css';

// A stepper's minus and plus (Tim, 5 Nov; design reference: Logging rows):
// plain, drawn alike, 16px with 1.5px lines and round ends, in the colour
// of the button around them (the secondary grey; coral on hover or focus).
// Never the crosshair: that is only the close, and half of it the chevron.
// The button around it carries the words (aria-label).
export default function StepIcon({ plus = false }) {
  return (
    <svg className="ds-step-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d={plus ? 'M3 8h10M8 3v10' : 'M3 8h10'} />
    </svg>
  );
}
