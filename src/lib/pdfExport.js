import html2pdf from 'html2pdf.js';

/**
 * Generates a clean, branded PDF with proper print styling and page breaks
 * No browser artifacts, clean layout, proper content preservation
 */
export const generateMissionProgressPDF = (review) => {
  const data = review.review_data;
  const reviewDate = new Date(review.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Print-optimized CSS (no browser artifacts, proper page breaks)
  const printStyles = `
    <style>
      @page {
        size: A4;
        margin: 15mm 20mm;
        padding: 0;
      }
      * {
        box-sizing: border-box;
        orphans: 3;
        widows: 3;
      }
      body {
        margin: 0;
        padding: 0;
        background: white;
        color: #333;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 11pt;
        line-height: 1.5;
      }
      .pdf-document {
        background: white;
        color: #333;
      }
      .pdf-header {
        border-bottom: 2px solid #F08571;
        padding-bottom: 16px;
        margin-bottom: 24px;
        page-break-after: avoid;
      }
      .pdf-header h1 {
        font-size: 24pt;
        font-weight: 700;
        margin: 0 0 8px 0;
        color: #333;
      }
      .pdf-header-meta {
        font-size: 10pt;
        color: #999;
        margin: 0;
      }
      .pdf-section {
        margin-bottom: 20px;
        page-break-inside: avoid;
      }
      .pdf-section h2 {
        font-size: 14pt;
        font-weight: 700;
        color: #333;
        margin: 0 0 4px 0;
        page-break-after: avoid;
      }
      .pdf-section-description {
        font-size: 10pt;
        color: #666;
        margin: 0 0 12px 0;
        font-style: italic;
        page-break-after: avoid;
      }
      .pdf-tactics {
        border-left: 3px solid #F08571;
        padding-left: 12px;
        margin-left: 0;
      }
      .pdf-tactic {
        margin-bottom: 12px;
        padding-bottom: 12px;
        border-bottom: 1px solid #e5e5e5;
        page-break-inside: avoid;
      }
      .pdf-tactic:last-child {
        border-bottom: none;
      }
      .pdf-tactic-title {
        font-size: 11pt;
        font-weight: 600;
        color: #333;
        margin: 0 0 6px 0;
      }
      .pdf-tactic-meta {
        font-size: 10pt;
        color: #666;
        margin: 0 0 6px 0;
      }
      .pdf-tactic-note {
        background-color: #f9f9f9;
        border-left: 2px solid #F08571;
        padding: 8px 10px;
        margin-top: 6px;
        font-size: 10pt;
      }
      .pdf-tactic-note-label {
        font-weight: 600;
        color: #999;
        margin: 0 0 4px 0;
        font-size: 9pt;
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }
      .pdf-tactic-note-content {
        color: #333;
        margin: 0;
        white-space: pre-wrap;
        word-wrap: break-word;
      }
      .pdf-footer {
        margin-top: 32px;
        padding-top: 16px;
        border-top: 1px solid #e5e5e5;
        font-size: 9pt;
        color: #999;
        page-break-before: avoid;
      }
      /* No URLs, no print headers/footers visible */
      @media print {
        body { margin: 0; padding: 0; }
        .no-print { display: none !important; }
      }
    </style>
  `;

  // Build clean HTML content
  let html = printStyles + `
    <div class="pdf-document">
      <div class="pdf-header">
        <h1>${escapeHtml(data.mission_title)}</h1>
        <p class="pdf-header-meta">Mission Progress Review — ${reviewDate}</p>
      </div>
  `;

  // Add strategies and tactics with proper page break handling
  if (data.strategies && data.strategies.length > 0) {
    data.strategies.forEach((strategy) => {
      html += `
        <div class="pdf-section">
          <h2>${escapeHtml(strategy.name)}</h2>
      `;

      if (strategy.description) {
        html += `<p class="pdf-section-description">${escapeHtml(strategy.description)}</p>`;
      }

      html += '<div class="pdf-tactics">';

      if (strategy.tactics && strategy.tactics.length > 0) {
        strategy.tactics.forEach((tactic) => {
          html += `
            <div class="pdf-tactic">
              <p class="pdf-tactic-title">${escapeHtml(tactic.action || tactic.name || 'Untitled')}</p>
          `;

          if (tactic.type === 'tickable') {
            const status = tactic.reviewed_is_done ? '✓ Done' : '○ Not done';
            html += `<p class="pdf-tactic-meta">Status: ${status}</p>`;
          } else {
            html += `<p class="pdf-tactic-meta">Progress: ${tactic.reviewed_value || 0} / ${tactic.target_value} ${escapeHtml(tactic.unit || '')}</p>`;
          }

          if (tactic.reviewed_note) {
            html += `
              <div class="pdf-tactic-note">
                <p class="pdf-tactic-note-label">Note:</p>
                <p class="pdf-tactic-note-content">${escapeHtml(tactic.reviewed_note)}</p>
              </div>
            `;
          }

          html += '</div>';
        });
      }

      html += '</div></div>';
    });
  }

  html += `
      <div class="pdf-footer">
        <p style="margin: 0;">Generated on ${reviewDate} • Clarity Portal</p>
      </div>
    </div>
  `;

  // Create hidden element for PDF rendering
  const element = document.createElement('div');
  element.innerHTML = html;
  element.style.display = 'none';
  document.body.appendChild(element);

  // Generate PDF with optimized settings
  const opt = {
    margin: [15, 20, 15, 20], // [top, left, bottom, right] in mm
    filename: `Mission-Review-${reviewDate.replace(/\s/g, '-')}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      logging: false,
    },
    jsPDF: {
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true
    }
  };

  html2pdf()
    .set(opt)
    .from(element)
    .save()
    .then(() => {
      // Clean up
      document.body.removeChild(element);
    });
};

/**
 * Helper: Escape HTML to prevent XSS and ensure proper rendering
 */
const escapeHtml = (text) => {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

// Daily Journal PDF (prompt 10a). Prompt ("p") blocks are shown as a
// quiet label, same as on screen - they are not counted in the word
// total, matching the spec ("prompts are NOT counted in ... the PDF
// word totals").
export const generateJournalPDF = (journal) => {
  const date = new Date(`${journal.journal_date}T00:00:00`);
  const dateLabel = `${date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}, ${date.getFullYear()}`;
  const words = (journal.body || [])
    .filter((b) => b.t === 't')
    .map((b) => b.v || '')
    .join(' ')
    .trim()
    .match(/\S+/g);
  const wordCount = words ? words.length : 0;

  const printStyles = `
    <style>
      @page { size: A4; margin: 15mm 20mm; }
      * { box-sizing: border-box; orphans: 3; widows: 3; }
      body { margin: 0; padding: 0; background: white; color: #333; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11pt; line-height: 1.5; }
      .pdf-header { border-bottom: 2px solid #F08571; padding-bottom: 16px; margin-bottom: 24px; }
      .pdf-header h1 { font-size: 24pt; font-weight: 700; margin: 0 0 8px 0; color: #333; }
      .pdf-header-meta { font-size: 10pt; color: #999; margin: 0; }
      .pdf-prompt { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.5px; color: #F08571; margin: 18px 0 8px; }
      .pdf-text { font-size: 11pt; white-space: pre-wrap; word-wrap: break-word; margin: 0 0 8px; }
    </style>
  `;

  let html = printStyles + `
    <div class="pdf-document">
      <div class="pdf-header">
        <h1>Daily Journal</h1>
        <p class="pdf-header-meta">${escapeHtml(dateLabel)} &mdash; ${wordCount} word${wordCount === 1 ? '' : 's'}</p>
      </div>
  `;

  (journal.body || []).forEach((b) => {
    if (b.t === 'p') {
      html += `<p class="pdf-prompt">${escapeHtml(b.v)}</p>`;
    } else if (b.v) {
      html += `<p class="pdf-text">${escapeHtml(b.v)}</p>`;
    }
  });

  html += '</div>';

  const element = document.createElement('div');
  element.innerHTML = html;
  element.style.display = 'none';
  document.body.appendChild(element);

  const opt = {
    margin: [15, 20, 15, 20],
    filename: `Daily-Journal-${journal.journal_date}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false },
    jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4', compress: true },
  };

  html2pdf()
    .set(opt)
    .from(element)
    .save()
    .then(() => {
      document.body.removeChild(element);
    });
};

const REVIEW_TAG = {
  'after-action': 'After-Action Review',
  'weekly-momentum': 'Weekly Momentum Check-in',
  progress: 'Progress Review',
};

const REVIEW_QUESTIONS = {
  'after-action': [
    { key: 'q1', label: 'What did you plan to do?' },
    { key: 'q2', label: 'What actually happened?' },
    { key: 'q3', label: 'Why was there a difference?' },
    { key: 'q4', label: 'What can you learn from this?' },
  ],
  'weekly-momentum': [
    { key: 'q1', label: 'What moved forward this week?' },
    { key: 'q2', label: 'What did you do better this week?' },
    { key: 'q3', label: 'What are your priorities for next week?' },
  ],
  progress: [
    { key: 'q1', label: "What's been going well?" },
    { key: 'q2', label: 'What have you learned recently?' },
    { key: 'q3', label: 'What next steps will expand your performance potential?' },
  ],
};

const REVIEW_RATINGS = [
  { key: 'momentum', label: 'Momentum' },
  { key: 'intentionality', label: 'Intentionality' },
  { key: 'communication', label: 'Communication' },
  { key: 'performanceUnderPressure', label: 'Performance under pressure' },
];

// After-action review / Weekly Momentum Check-in PDF (prompt 10b).
export const generateReviewPDF = (review, data) => {
  const reviewType = review.review_type || 'after-action';
  const reviewDate = new Date(review.entry_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const printStyles = `
    <style>
      @page { size: A4; margin: 15mm 20mm; }
      * { box-sizing: border-box; orphans: 3; widows: 3; }
      body { margin: 0; padding: 0; background: white; color: #333; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11pt; line-height: 1.5; }
      .pdf-header { border-bottom: 2px solid #F08571; padding-bottom: 16px; margin-bottom: 24px; }
      .pdf-header h1 { font-size: 24pt; font-weight: 700; margin: 0 0 8px 0; color: #333; }
      .pdf-header-meta { font-size: 10pt; color: #999; margin: 0; }
      .pdf-section { margin-bottom: 18px; page-break-inside: avoid; }
      .pdf-section h2 { font-size: 11pt; font-weight: 700; color: #333; margin: 0 0 6px 0; text-transform: uppercase; letter-spacing: 0.5px; }
      .pdf-section p { font-size: 11pt; color: #333; margin: 0; white-space: pre-wrap; word-wrap: break-word; }
    </style>
  `;

  let html = printStyles + `
    <div class="pdf-document">
      <div class="pdf-header">
        <h1>${escapeHtml(review.title || REVIEW_TAG[reviewType])}</h1>
        <p class="pdf-header-meta">${REVIEW_TAG[reviewType] || ''} &mdash; ${reviewDate}</p>
      </div>
  `;

  if (reviewType === 'weekly-momentum') {
    REVIEW_RATINGS.forEach((r) => {
      html += `<div class="pdf-section"><h2>${escapeHtml(r.label)}</h2><p>${data[r.key] || 0} / 5</p></div>`;
    });
  }

  (REVIEW_QUESTIONS[reviewType] || REVIEW_QUESTIONS['after-action']).forEach((q) => {
    if (data[q.key]) {
      html += `<div class="pdf-section"><h2>${escapeHtml(q.label)}</h2><p>${escapeHtml(data[q.key])}</p></div>`;
    }
  });

  html += '</div>';

  const element = document.createElement('div');
  element.innerHTML = html;
  element.style.display = 'none';
  document.body.appendChild(element);

  const opt = {
    margin: [15, 20, 15, 20],
    filename: `${(review.title || 'Review').replace(/\s+/g, '-')}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false },
    jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4', compress: true },
  };

  html2pdf()
    .set(opt)
    .from(element)
    .save()
    .then(() => {
      document.body.removeChild(element);
    });
};

// Time Allocation Audit PDF (prompt 10b) - replaces window.print().
export const generateTimeAuditPDF = (audit) => {
  const data = audit.form_data || {};
  const items = data.items || [];
  const totalHours = items.reduce((sum, item) => sum + (parseFloat(item.timePerWeek) || 0), 0);
  const firstActionItem = items.find((item) => item.id === data.firstAction || item.activity === data.firstAction);

  const printStyles = `
    <style>
      @page { size: A4; margin: 15mm 20mm; }
      * { box-sizing: border-box; orphans: 3; widows: 3; }
      body { margin: 0; padding: 0; background: white; color: #333; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11pt; line-height: 1.5; }
      .pdf-header { border-bottom: 2px solid #F08571; padding-bottom: 16px; margin-bottom: 24px; }
      .pdf-header h1 { font-size: 24pt; font-weight: 700; margin: 0 0 8px 0; color: #333; }
      .pdf-header-meta { font-size: 10pt; color: #999; margin: 0; }
      .pdf-section { margin-bottom: 18px; page-break-inside: avoid; }
      .pdf-section h2 { font-size: 11pt; font-weight: 700; color: #333; margin: 0 0 6px 0; text-transform: uppercase; letter-spacing: 0.5px; }
      .pdf-section p { font-size: 11pt; color: #333; margin: 0 0 4px; white-space: pre-wrap; word-wrap: break-word; }
      .pdf-item { font-size: 11pt; margin: 0 0 4px; }
    </style>
  `;

  let html = printStyles + `
    <div class="pdf-document">
      <div class="pdf-header">
        <h1>${escapeHtml(audit.title || 'Time Allocation Audit')}</h1>
        <p class="pdf-header-meta">${totalHours} hours a week to reclaim</p>
      </div>
      <div class="pdf-section">
        <h2>Time-sink activities</h2>
        ${items.map((item) => `<p class="pdf-item">${escapeHtml(item.activity)} &mdash; ${item.action || 'No action chosen'} &mdash; ${parseFloat(item.timePerWeek) || 0}h/week</p>`).join('')}
      </div>
  `;

  if (firstActionItem) {
    html += `<div class="pdf-section"><h2>Taking action first</h2><p>${escapeHtml(firstActionItem.activity)} (${firstActionItem.action || 'No action chosen'})</p></div>`;
  }
  if (data.actionHow) {
    html += `<div class="pdf-section"><h2>How specifically</h2><p>${escapeHtml(data.actionHow)}</p></div>`;
  }
  if (data.timeUse) {
    html += `<div class="pdf-section"><h2>What you will do with the time instead</h2><p>${escapeHtml(data.timeUse)}</p></div>`;
  }

  html += '</div>';

  const element = document.createElement('div');
  element.innerHTML = html;
  element.style.display = 'none';
  document.body.appendChild(element);

  const opt = {
    margin: [15, 20, 15, 20],
    filename: `${(audit.title || 'Time-Audit').replace(/\s+/g, '-')}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false },
    jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4', compress: true },
  };

  html2pdf()
    .set(opt)
    .from(element)
    .save()
    .then(() => {
      document.body.removeChild(element);
    });
};

const BREATHING_LABELS = { sigh: 'Physiological Sigh', vagal: 'Vagal Breathing', box: 'Box Breathing' };

// Breathing Sessions PDF (prompt 11).
export const generateBreathingSessionsPDF = (sessions) => {
  const totalSeconds = sessions.reduce((sum, s) => sum + (s.duration || 0), 0);
  const totalHours = Math.floor(totalSeconds / 3600);
  const totalMins = Math.floor((totalSeconds % 3600) / 60);

  const printStyles = `
    <style>
      @page { size: A4; margin: 15mm 20mm; }
      * { box-sizing: border-box; orphans: 3; widows: 3; }
      body { margin: 0; padding: 0; background: white; color: #333; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11pt; line-height: 1.5; }
      .pdf-header { border-bottom: 2px solid #F08571; padding-bottom: 16px; margin-bottom: 24px; }
      .pdf-header h1 { font-size: 24pt; font-weight: 700; margin: 0 0 8px 0; color: #333; }
      .pdf-header-meta { font-size: 10pt; color: #999; margin: 0; }
      .pdf-item { font-size: 11pt; margin: 0 0 6px; padding-bottom: 6px; border-bottom: 1px solid #e5e5e5; }
    </style>
  `;

  const rows = sessions.map((s) => {
    const date = new Date(s.date);
    const label = BREATHING_LABELS[s.breathing_mode] || s.breathing_mode;
    const length = s.duration ? `${Math.floor(s.duration / 60)}m ${s.duration % 60}s` : '';
    return `<p class="pdf-item">${escapeHtml(label)} &mdash; ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}${length ? ` &mdash; ${length}` : ''}</p>`;
  }).join('');

  const html = printStyles + `
    <div class="pdf-document">
      <div class="pdf-header">
        <h1>Breathing Sessions</h1>
        <p class="pdf-header-meta">${sessions.length} session${sessions.length === 1 ? '' : 's'} &mdash; ${totalHours}h ${totalMins}m total</p>
      </div>
      ${rows}
    </div>
  `;

  const element = document.createElement('div');
  element.innerHTML = html;
  element.style.display = 'none';
  document.body.appendChild(element);

  const opt = {
    margin: [15, 20, 15, 20],
    filename: 'Breathing-Sessions.pdf',
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false },
    jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4', compress: true },
  };

  html2pdf()
    .set(opt)
    .from(element)
    .save()
    .then(() => {
      document.body.removeChild(element);
    });
};
