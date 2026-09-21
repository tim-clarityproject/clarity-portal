// Standardized styles for all one-page summary pages

export const summaryStyles = {
  // Main title (h1)
  mainTitle: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#000',
    margin: '0 0 24px 0',
  },

  // Section heading (h2)
  sectionHeading: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#333',
    margin: '0 0 8px 0',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },

  // Section container with left border
  section: {
    marginBottom: '16px',
    paddingLeft: '24px',
    borderLeft: '4px solid #F08571',
  },

  // Content text
  contentText: {
    fontSize: '13px',
    color: '#666',
    lineHeight: '1.5',
    margin: 0,
  },

  // Content box (info grid, table container, etc)
  contentBox: {
    backgroundColor: '#f9f9f9',
    padding: '16px',
    borderRadius: '8px',
    marginBottom: '16px',
    border: '1px solid #f0f0f0',
  },

  // Label text (like "DATE", "TIME", etc)
  label: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#999',
    margin: '0 0 4px 0',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },

  // Back button container (centered)
  backButtonContainer: {
    textAlign: 'center',
    marginBottom: '16px',
  },

  // Back button
  backButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    backgroundColor: 'transparent',
    border: 'none',
    color: '#F08571',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    transition: 'color 0.2s',
  },
};
