// Shared breathing orb visual - guide ring, three echo rings, main circle
// and a centred crosshair. Sized by its container's inline-size via cqw,
// so the parent needs `container-type: inline-size`. No existing orb
// component was found on src/pages/BreathingPage.jsx to reuse (that page
// still uses the old pre-design-system markup), so this is the first
// implementation - built as a shared component so BreathingPage can
// import it later instead of duplicating this CSS.
export default function BreathingOrb() {
  return (
    <div className="breathing-orb" aria-hidden="true">
      <style>{`
        .breathing-orb {
          --s: clamp(64px, 24cqw, 150px);
          width: var(--s);
          height: var(--s);
          margin-right: calc(var(--s) * .2);
          position: relative;
          flex-shrink: 0;
        }

        .breathing-orb-guide,
        .breathing-orb-echo,
        .breathing-orb-main {
          position: absolute;
          top: 50%;
          left: 50%;
          border-radius: 50%;
          transform: translate(-50%, -50%);
          box-sizing: border-box;
        }

        .breathing-orb-guide {
          width: 100%;
          height: 100%;
          border: 1px solid var(--line);
        }

        .breathing-orb-echo {
          border: 1px solid var(--coral);
          animation: breathing-orb-pulse 10s infinite cubic-bezier(.45,0,.55,1);
        }

        .breathing-orb-echo--1 {
          width: 136%;
          height: 136%;
          opacity: 0.12;
          animation-delay: 1.26s;
        }

        .breathing-orb-echo--2 {
          width: 124%;
          height: 124%;
          opacity: 0.18;
          animation-delay: 0.84s;
        }

        .breathing-orb-echo--3 {
          width: 112%;
          height: 112%;
          opacity: 0.36;
          animation-delay: 0.42s;
        }

        .breathing-orb-main {
          width: 100%;
          height: 100%;
          border: 1.6px solid var(--coral);
          background: rgba(255, 111, 92, 0.07);
          animation: breathing-orb-pulse 10s infinite cubic-bezier(.45,0,.55,1);
        }

        .breathing-orb-cross.ui-cross {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: calc(var(--s) * .22);
          height: calc(var(--s) * .22);
          color: var(--coral);
        }

        @keyframes breathing-orb-pulse {
          0% { transform: translate(-50%, -50%) scale(.373); }
          40% { transform: translate(-50%, -50%) scale(1); }
          100% { transform: translate(-50%, -50%) scale(.373); }
        }

        @media (prefers-reduced-motion: reduce) {
          .breathing-orb-echo,
          .breathing-orb-main {
            animation: none !important;
            transform: translate(-50%, -50%) scale(.7) !important;
          }
        }
      `}</style>

      <div className="breathing-orb-guide" />
      <div className="breathing-orb-echo breathing-orb-echo--1" />
      <div className="breathing-orb-echo breathing-orb-echo--2" />
      <div className="breathing-orb-echo breathing-orb-echo--3" />
      <div className="breathing-orb-main" />
      <span className="breathing-orb-cross ui-cross" />
    </div>
  );
}
