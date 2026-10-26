// The two looks of every tool PDF (PDF rules 1, 9 and 16). Same layout, content
// and page breaks; only these colours and the logo file change. PDFs cannot read
// the CSS variables in tokens.css, so their colours live here, in one place.

export const PDF_THEMES = {
  light: {
    page: '#FFFFFF',
    text: '#111110',
    detail: '#636362',
    line: '#DCDCD9',
    panel: '#F4F4F3',
    panelEdge: null,
    coral: '#FF6F5C',
    logo: 'positive', // public/brand/logomark-positive.png, black crosshair
  },
  dark: {
    page: '#000000',
    text: '#FFFFFF',
    detail: '#A3A3A0',
    line: '#262626',
    panel: '#111110',
    panelEdge: '#262626', // a thin edge so panels hold on a dim phone
    coral: '#FF6F5C',
    logo: 'negative', // public/brand/logomark-negative.png, white crosshair
  },
};

export const PDF_AUTHOR = 'Dr. Tim Dutton, The Clarity Project LTD';
export const PORTAL_ADDRESS = 'portal.theclarityproject.co.uk';
export const PORTAL_URL = `https://${PORTAL_ADDRESS}`;
