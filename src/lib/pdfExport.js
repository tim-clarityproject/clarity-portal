import html2pdf from 'html2pdf.js';

export const generateMissionProgressPDF = (review) => {
  const data = review.review_data;
  const reviewDate = new Date(review.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Build HTML content
  let html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto;">
      <div style="margin-bottom: 40px;">
        <h1 style="font-size: 32px; font-weight: bold; color: #333; margin: 0 0 8px 0;">
          ${escapeHtml(data.mission_title)}
        </h1>
        <p style="font-size: 14px; color: #999; margin: 0;">
          Mission Progress Review — ${reviewDate}
        </p>
      </div>
  `;

  // Add strategies and tactics
  if (data.strategies && data.strategies.length > 0) {
    data.strategies.forEach((strategy, sIndex) => {
      html += `
        <div style="margin-bottom: 32px; page-break-inside: avoid;">
          <h2 style="font-size: 18px; font-weight: 600; color: #333; margin: 0 0 4px 0;">
            ${escapeHtml(strategy.name)}
          </h2>
      `;

      if (strategy.description) {
        html += `
          <p style="font-size: 13px; color: #999; margin: 0 0 16px 0;">
            ${escapeHtml(strategy.description)}
          </p>
        `;
      }

      html += '<div style="border-left: 3px solid #f0f0f0; padding-left: 16px;">';

      if (strategy.tactics && strategy.tactics.length > 0) {
        strategy.tactics.forEach((tactic, tIndex) => {
          html += `
            <div style="margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid #f0f0f0;">
              <p style="font-size: 13px; font-weight: 600; color: #333; margin: 0 0 8px 0;">
                ${escapeHtml(tactic.action)}
              </p>
          `;

          if (tactic.type === 'tickable') {
            const status = tactic.reviewed_is_done ? '✓ Done' : '○ Not done';
            html += `
              <p style="font-size: 12px; color: #666; margin: 0 0 8px 0;">
                Status: ${status}
              </p>
            `;
          } else {
            html += `
              <p style="font-size: 12px; color: #666; margin: 0 0 8px 0;">
                Progress: ${tactic.reviewed_value || 0} / ${tactic.target_value} ${escapeHtml(tactic.unit || '')}
              </p>
            `;
          }

          if (tactic.reviewed_note) {
            html += `
              <div style="background-color: #fafafa; padding: 8px; border-radius: 4px; margin-top: 8px;">
                <p style="font-size: 11px; color: #999; margin: 0 0 4px 0; font-weight: 600;">Note:</p>
                <p style="font-size: 12px; color: #333; margin: 0; white-space: pre-wrap;">
                  ${escapeHtml(tactic.reviewed_note)}
                </p>
              </div>
            `;
          }

          html += '</div>';
        });
      }

      html += '</div></div>';
    });
  }

  html += '</div>';

  // Generate PDF
  const element = document.createElement('div');
  element.innerHTML = html;

  const opt = {
    margin: 10,
    filename: `Mission-Review-${reviewDate.replace(/\s/g, '-')}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
  };

  html2pdf().set(opt).from(element).save();
};

const escapeHtml = (text) => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};
