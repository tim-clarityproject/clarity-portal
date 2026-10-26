// The design gallery's sample PDF: every shared part on two pages, with
// invented names only.

export function samplePdf() {
  return {
    docName: 'Sample report',
    title: 'Quarterly team review',
    who: 'Harbourside Bakery Co.',
    confidential: true,
    details: ['Harbourside Bakery Co.', 'Mon 26 Oct 2026', 'Sample report'],
    date: new Date(),
    subject: 'Sample of the shared PDF template',
    glance: [
      { label: 'Goals on track', value: '4 of 6', big: true },
      { label: 'Average score', value: '72%', big: true },
      { label: 'Actions agreed', value: '9', big: true },
      { label: 'Weeks to the next review', value: '13', big: true },
    ],
    sections: [
      {
        title: 'Summary',
        blocks: [{
          type: 'text',
          text: 'The team finished the quarter ahead on two of its main goals and close on two more. Weekend hiring and the second oven are behind, and both now have an owner and a date.',
        }],
      },
      {
        title: 'Your answers',
        blocks: [
          { type: 'field', label: 'What went well this quarter?', text: 'Deliveries. Riya Okafor rebuilt the morning route, and since the first week of September every van has left before 06:15.' },
          { type: 'field', label: 'What would you change?', text: 'Start the weekend hiring earlier. We waited until the summer rush was over, and by then most students had already found work.' },
          { type: 'field', label: 'Anything else?', text: '' },
        ],
      },
      {
        title: 'Actions agreed',
        blocks: [
          {
            type: 'table',
            title: 'Actions agreed',
            columns: [
              { label: 'Action', width: 3.4 },
              { label: 'Owner', width: 1.6 },
              { label: 'Due', width: 1.4 },
              { label: 'Hours', width: 0.9, align: 'right' },
            ],
            rows: [
              ['Advertise weekend roles at the college', 'Dev Malik', 'Fri 6 Nov', '3'],
              ['Book the oven engineer', 'Riya Okafor', 'Wed 11 Nov', '1'],
              ['Train two staff on the new oven', 'Riya Okafor', 'Fri 27 Nov', '12'],
              ['Review waste figures every Monday', 'Lena Price', 'Weekly', '0.5'],
              ['Add a feedback card to every box', 'Lena Price', 'Mon 16 Nov', '4'],
            ],
          },
        ],
      },
      {
        title: 'Scores by goal',
        blocks: [{
          type: 'bars',
          standard: { value: 60 },
          rows: [
            { label: 'Deliveries on time', value: 92 },
            { label: 'Online orders', value: 81 },
            { label: 'Customer feedback', value: 74 },
            { label: 'Waste below 5%', value: 63 },
            { label: 'Second oven in use', value: 48 },
            { label: 'Weekend shift hired', value: 35 },
          ],
          keyAbove: 'At or above 60%',
          keyBelow: 'Below 60%',
          keyStandard: 'The 60% standard',
          sentence: 'Four of the six goals are at or above the 60% standard. The second oven and weekend hiring need the most attention next quarter.',
          alt: 'Bar chart of scores by goal, on a scale from 0% to 100%, with the standard at 60%. Deliveries on time 92%. Online orders 81%. Customer feedback 74%. Waste below 5% 63%. Second oven in use 48%. Weekend shift hired 35%.',
        }],
      },
      {
        title: 'Next steps',
        blocks: [{
          type: 'list',
          items: ['Share this review with the whole team on Friday.', 'Check the weekend hiring numbers in four weeks.', 'Book the next quarterly review for late January.'],
        }],
      },
      {
        title: 'Signatures',
        blocks: [
          { type: 'text', tone: 'detail', text: 'Signature blocks are for agreements. Tool PDFs leave them out.' },
          { type: 'signature', parties: [{ role: 'For Harbourside Bakery Co.', name: 'Morgan Ellis' }, { role: 'For The Clarity Project LTD', name: 'Alex Morgan' }] },
        ],
      },
    ],
  };
}
