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
