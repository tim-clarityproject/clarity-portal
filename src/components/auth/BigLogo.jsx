// "Spin and settle" big logo animation - used on Log in, Finished and
// Welcome back. 84x84 box: the ring fades in, the crosshair spins in
// and settles on top of it.
//
// TODO (blocked, see session notes): ~/Downloads/welcome-assets.zip did
// not exist when this was built, so welcome-ring.png and
// welcome-crosshair.png could not be verified or copied into
// public/assets/. This component already points at their final,
// intended paths (public/assets/welcome-ring.png and
// public/assets/welcome-crosshair.png) so the animation will work the
// moment those two files are added there - nothing else needs to
// change. Per instruction, no placeholder/substitute artwork was
// created in the meantime.
export default function BigLogo() {
  return (
    <div className="auth-biglogo">
      <style>{`
        .auth-biglogo {
          position: relative;
          width: 84px;
          height: 84px;
          margin: 0 auto;
        }

        .auth-biglogo-ring {
          position: absolute;
          inset: 0;
          width: 84px;
          height: 84px;
          opacity: 0;
          animation: auth-ring-fade 700ms var(--ease) forwards;
        }

        @keyframes auth-ring-fade {
          to { opacity: 1; }
        }

        .auth-biglogo-crosshair {
          position: absolute;
          left: 37.63%;
          top: 37.63%;
          width: 24.58%;
          height: 24.58%;
          transform-origin: 50% 50%;
          opacity: 0;
          animation: auth-crosshair-spin 1.9s cubic-bezier(0.22, 1, 0.36, 1) 500ms forwards;
        }

        @keyframes auth-crosshair-spin {
          0% { opacity: 0; transform: rotate(-270deg) scale(0.55); }
          20% { opacity: 1; }
          100% { opacity: 1; transform: none; }
        }

        @media (prefers-reduced-motion: reduce) {
          .ui-root .auth-biglogo-ring,
          .ui-root .auth-biglogo-crosshair {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>
      <img className="auth-biglogo-ring" src="/assets/welcome-ring.png" alt="" aria-hidden="true" />
      <img className="auth-biglogo-crosshair" src="/assets/welcome-crosshair.png" alt="" aria-hidden="true" />
    </div>
  );
}
