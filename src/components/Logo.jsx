export default function Logo({ size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        display: 'inline-block',
        flexShrink: 0,
      }}
    >
      {/* Outer circle */}
      <circle cx="100" cy="100" r="85" fill="none" stroke="#333" strokeWidth="6" />

      {/* Center cross */}
      <line x1="90" y1="75" x2="110" y2="75" stroke="#333" strokeWidth="4" strokeLinecap="round" />
      <line x1="100" y1="65" x2="100" y2="85" stroke="#333" strokeWidth="4" strokeLinecap="round" />

      {/* Colored gradient arcs */}
      <path d="M 100 20 A 80 80 0 0 1 156.6 56.6" stroke="#F08571" strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d="M 156.6 56.6 A 80 80 0 0 1 180 100" stroke="#D07560" strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d="M 180 100 A 80 80 0 0 1 143.4 156.6" stroke="#5ECCC0" strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d="M 143.4 156.6 A 80 80 0 0 1 100 180" stroke="#4CB8A8" strokeWidth="6" fill="none" strokeLinecap="round" />
    </svg>
  );
}
