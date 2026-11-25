import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../../globalStyles';
import Blocks25 from './Blocks25';

// /design-reference/blocks (previews and local development only): the 25 Nov
// design reference's blocks drawn with the portal's shared parts, at the same
// sizes, so they can be measured side by side with the reference. ?theme=dark
// or light; the width is the window's.
document.title = 'Blocks, 25 Nov';
const theme = new URLSearchParams(window.location.search).get('theme');
if (theme === 'dark' || theme === 'light') document.documentElement.setAttribute('data-theme', theme);
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Blocks25 />
  </StrictMode>,
);
