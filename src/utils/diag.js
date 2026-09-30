// Diagnostic logging to localStorage ring buffer
// Enable with: localStorage.setItem('clarity-diag', '1')
// Read with: localStorage.getItem('clarity-diag-log')

const ENABLED_KEY = 'clarity-diag';
const LOG_KEY = 'clarity-diag-log';
const MAX_LINES = 200;

export function diag(msg, extra = null) {
  try {
    // Check if diagnostics are enabled
    if (localStorage.getItem(ENABLED_KEY) !== '1') {
      return;
    }

    // Build log line with timestamp
    const timestamp = new Date().toISOString();
    let line = `${timestamp} ${msg}`;
    if (extra !== null && extra !== undefined) {
      line += ` ${JSON.stringify(extra)}`;
    }

    // Get existing log (ring buffer)
    let logContent = '';
    try {
      logContent = localStorage.getItem(LOG_KEY) || '';
    } catch (e) {
      // Silently handle quota exceeded or access errors
      return;
    }

    // Split into lines and maintain max limit
    const lines = logContent.split('\n').filter(l => l.trim());
    lines.push(line);

    // Keep only last MAX_LINES
    if (lines.length > MAX_LINES) {
      lines.splice(0, lines.length - MAX_LINES);
    }

    // Write back to localStorage
    try {
      localStorage.setItem(LOG_KEY, lines.join('\n'));
    } catch (e) {
      // Silently handle quota exceeded or access errors
      return;
    }

    // Also log to console for immediate visibility
    console.log('[DIAG]', msg, extra || '');
  } catch (e) {
    // Catch-all: never throw, ensure diag can never break the app
    // Silently fail
  }
}
