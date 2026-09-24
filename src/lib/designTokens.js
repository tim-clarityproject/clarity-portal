/**
 * Clarity Portal Design System - Design Tokens
 * Centralized design values for visual consistency across the entire platform
 * All pages should use these tokens instead of hardcoded values
 */

export const designTokens = {
  // TYPOGRAPHY SCALE
  typography: {
    h1: {
      fontSize: '36px',
      fontWeight: '700',
      lineHeight: '1.3',
      letterSpacing: '-0.3px',
    },
    h2: {
      fontSize: '18px',
      fontWeight: '700',
      lineHeight: '1.4',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
    },
    h3: {
      fontSize: '18px',
      fontWeight: '700',
      lineHeight: '1.4',
      letterSpacing: '0px',
    },
    h4: {
      fontSize: '16px',
      fontWeight: '600',
      lineHeight: '1.4',
      letterSpacing: '0px',
    },
    body: {
      fontSize: '15px',
      fontWeight: '400',
      lineHeight: '1.6',
      letterSpacing: '0px',
    },
    bodySm: {
      fontSize: '14px',
      fontWeight: '400',
      lineHeight: '1.5',
      letterSpacing: '0px',
    },
    label: {
      fontSize: '12px',
      fontWeight: '600',
      lineHeight: '1.4',
      letterSpacing: '0.3px',
      textTransform: 'uppercase',
    },
    caption: {
      fontSize: '11px',
      fontWeight: '400',
      lineHeight: '1.4',
      letterSpacing: '0px',
    },
    button: {
      fontSize: '14px',
      fontWeight: '600',
      lineHeight: '1.4',
      letterSpacing: '0px',
    },
  },

  // COLOR PALETTE
  colors: {
    primary: '#F08571',

    text: {
      primary: '#333',
      secondary: '#666',
      tertiary: '#999',
      disabled: '#bbb',
      inverse: 'white',
    },

    background: {
      default: 'white',
      secondary: '#f9f9f9',
      overlay: 'rgba(0,0,0,0.5)',
    },

    border: {
      light: '#f0f0f0',
      medium: '#e5e5e5',
      focus: '#F08571',
    },

    shadow: {
      light: 'rgba(0, 0, 0, 0.06)',
      medium: 'rgba(0, 0, 0, 0.08)',
      coral: 'rgba(240, 133, 113, 0.15)',
    },
  },

  // SPACING SCALE (8px baseline)
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    xxl: '48px',
    xxxl: '64px',
  },

  // BORDER RADIUS SCALE
  borderRadius: {
    sm: '3px',
    md: '4px',
    lg: '8px',
    xl: '16px',
    xxl: '24px',
  },

  // SHADOWS & ELEVATION
  shadow: {
    none: 'none',
    sm: '0 2px 8px rgba(0, 0, 0, 0.06)',
    md: '0 4px 12px rgba(0, 0, 0, 0.08)',
    lg: '0 8px 24px rgba(0, 0, 0, 0.12)',
    coral: '0 4px 12px rgba(240, 133, 113, 0.15)',
  },

  // BUTTON STYLES
  button: {
    primary: {
      padding: '14px 24px',
      backgroundColor: '#F08571',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      fontSize: '14px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.2s',
      hoverBackgroundColor: '#e07560',
    },
    secondary: {
      padding: '14px 24px',
      backgroundColor: 'white',
      color: '#333',
      border: '2px solid #e5e5e5',
      borderRadius: '8px',
      fontSize: '14px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.2s',
      hoverBackgroundColor: '#f9f9f9',
      hoverBorderColor: '#F08571',
      hoverColor: '#F08571',
    },
    tertiary: {
      padding: '0px',
      backgroundColor: 'transparent',
      color: '#999',
      border: 'none',
      borderRadius: '0px',
      fontSize: '12px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.2s',
      textTransform: 'uppercase',
      letterSpacing: '0.3px',
      hoverColor: '#d32f2f',
    },
  },

  // CARD STYLES
  card: {
    padding: '20px',
    backgroundColor: 'white',
    border: '1px solid #e5e5e5',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
    transition: 'all 0.2s',
  },

  // INPUT STYLES
  input: {
    padding: '12px 16px',
    backgroundColor: 'white',
    border: '2px solid #e5e5e5',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '400',
    color: '#333',
    transition: 'all 0.2s',
  },

  // PAGE LAYOUT
  layout: {
    maxWidth: '800px',
    contentPadding: '64px 32px',
    contentPaddingMobile: '32px 16px',
    headerHeight: '70px',
    gapBetweenSections: '48px',
    gapBetweenCards: '24px',
  },
};
