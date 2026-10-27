import { StrictMode, lazy, Suspense, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { loadWithReload } from '../lib/loadWithReload';
import { diag } from '../utils/diag';
import PageError from './PageError';
import './hc.css';

// The outside Strategic Alignment Health Check as its own small page
// (health-check.html; vercel.json sends /health-check/* here). It renders only
// the Health Check, in the new design (mock-up M7b version 4), with its own
// styles only: no sign-in, menu, Breathe button or portal styles. The portal keeps its own /health-check route
// for now, so rolling back is only the vercel.json line.

// Reloads once if a tab opened before a deploy asks for a file that has gone.
const HealthCheck = lazy(() => loadWithReload(() => import('./HealthCheckPage')));

// The private link carries a secret token in the path: never write it into
// the local diagnostics log (as the portal's App.jsx).
const redactHealthCheckToken = (pathname) => pathname.replace(/^(\/health-check\/).*/, '$1[token]');

const blank = <div className="ui-root hc" />;

function Diagnostics() {
  const location = useLocation();
  useEffect(() => {
    diag('HEALTH_CHECK_BOOT', { pathname: redactHealthCheckToken(location.pathname) });
  }, [location.pathname]);
  return null;
}

// Anything else that reaches this page goes to the portal.
function LeaveForPortal() {
  useEffect(() => { window.location.replace('/'); }, []);
  return blank;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Diagnostics />
      <PageError>
        <Routes>
          <Route path="/health-check/:token" element={<Suspense fallback={blank}><HealthCheck /></Suspense>} />
          <Route path="*" element={<LeaveForPortal />} />
        </Routes>
      </PageError>
    </BrowserRouter>
  </StrictMode>,
);
