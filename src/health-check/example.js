// The example report: Quillmark, an invented software company backed by
// private equity (Tim, 27 Oct, 15:35), exactly as in the mock-up (M7b
// version 4). Adie checks it reads like a real leadership team.

const CSF = [
  'Win enterprise customers in the US',
  'A product customers can’t do without',
  'An AI assistant customers use every week',
  'A leadership team ready for twice the size',
  'Cash to reach break-even without new funding',
];
const PROJECTS = [
  { t: 'US enterprise sales team', c: [3, 2, 2, 1, 2], p: 2, r: 5, s: '2026-02', f: '2027-06' },
  { t: 'AI assistant launch', c: [2, 3, 3, 0, 1], p: 1, r: 4, s: '2026-09', f: '2027-03' },
  { t: 'Self-serve onboarding', c: [1, 3, 2, 0, 2], p: 3, r: 3, s: '2026-03', f: '2026-12' },
  { t: 'Leadership hiring', c: [2, 1, 0, 3, 1], p: 3, r: 3, s: '2026-05', f: 'open' },
  { t: 'Customer success programme', c: [2, 3, 0, 1, 2], p: 4, r: 3, s: '2025-10', f: 'open' },
  { t: 'Security certification', c: [3, 1, 0, 0, 1], p: 4, r: 2, s: '2026-01', f: '2026-11' },
  { t: 'Pricing and packaging', c: [2, 2, 0, 0, 3], p: 5, r: 1, s: '2025-06', f: '2026-04' },
  { t: 'Engineering hiring plan', c: [1, 3, 2, 2, 1], p: 5, r: 2, s: '2025-09', f: '2026-09' },
];

export const EXAMPLE = {
  org: 'Quillmark',
  date: 'Mon 12 Oct',
  draft: {
    objective: 'Reach £40m in recurring revenue by the end of 2027, with customers spending 15% more each year.',
    csfs: CSF.map((text, i) => ({ id: `ex-f${i}`, text })),
    projects: PROJECTS.map((p, i) => ({ id: `ex-p${i}`, text: p.t, started: p.s, due: p.f })),
    ratings: Object.fromEntries(PROJECTS.map((p, i) => [`ex-p${i}`, {
      contrib: Object.fromEntries(p.c.map((v, k) => [`ex-f${k}`, v])),
      progress: p.p,
      resource: p.r,
    }])),
    completedAt: null,
  },
};
