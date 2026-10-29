// Makes every PDF the template produces, plus the stress-test pack, and checks
// each page break against the PDF rules 23 to 29 (see CLAUDE.md). Invented
// names only. Nothing here touches a database.
//
//   node tests/pdf/make-pdfs.mjs <output folder> [--only name]
//
// For each document: light and dark, A4 and US Letter. Writes the PDFs and a
// report (break-report.txt) and exits with code 1 if any check does not pass.

import { createServer } from 'vite';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = process.argv[2] || join(root, 'pdf-out');
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
mkdirSync(out, { recursive: true });

const vite = await createServer({ root, logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const load = (p) => vite.ssrLoadModule(p);
const [{ renderPdf }, { PAPER }, { samplePdf }, { healthCheckPdf }, { meetingPlanPdf }, { emojiPartsFor, cjkPartsFor, textOf }] = await Promise.all([
  load('/src/lib/pdf/render.js'), load('/src/lib/pdf/paper.js'), load('/src/lib/pdf/docs/sample.js'),
  load('/src/lib/pdf/docs/healthCheck.js'), load('/src/lib/pdf/docs/meetingPlan.js'), load('/src/lib/pdf/emoji.js'),
]);

const file = (p) => new Uint8Array(readFileSync(join(root, p)));
const fs = 'node_modules/@fontsource/';
const baseFonts = {
  Nekst: file('public/fonts/Nekst-Regular.ttf'),
  NekstLight: file('public/fonts/Nekst-Light.ttf'),
  DMSans: file(`${fs}dm-sans/files/dm-sans-latin-400-normal.woff`),
  DMSansExt: file(`${fs}dm-sans/files/dm-sans-latin-ext-400-normal.woff`),
  DMSansMedium: file(`${fs}dm-sans/files/dm-sans-latin-500-normal.woff`),
  DMSansMediumExt: file(`${fs}dm-sans/files/dm-sans-latin-ext-500-normal.woff`),
};
const ranges = JSON.parse(readFileSync(join(root, `${fs}noto-emoji/unicode.json`), 'utf8'));
const cjkRanges = JSON.parse(readFileSync(join(root, `${fs}noto-sans-sc/unicode.json`), 'utf8'));
const assetsFor = (spec) => ({
  fonts: {
    ...baseFonts,
    emoji: emojiPartsFor(textOf(spec), ranges).map((k) => file(`${fs}noto-emoji/files/noto-emoji-${k.replace(/\D/g, '')}-400-normal.woff`)),
    cjk: cjkPartsFor(textOf(spec), cjkRanges).map((k) => file(`${fs}noto-sans-sc/files/noto-sans-sc-${k.replace(/\D/g, '')}-400-normal.woff`)),
  },
});

// ---- invented content ---------------------------------------------------------

let seed = 7;
const rnd = (n) => { seed = (seed * 9301 + 49297) % 233280; return Math.floor((seed / 233280) * n); };
const words = 'the team agreed to move the routing pilot forward after the depot review showed shorter rounds fewer missed slots and calmer mornings for drivers while the warehouse kept its own timings and the board asked for a clear plan with owners dates and a simple way to see progress every week'.split(' ');
const sentence = (n) => { const w = Array.from({ length: n }, () => words[rnd(words.length)]); w[0] = w[0][0].toUpperCase() + w[0].slice(1); return `${w.join(' ')}.`; };
const para = (s) => Array.from({ length: s }, () => sentence(10 + rnd(14))).join(' ');
const id = (p, i) => `${p}${i}`;

function hcDraft({ objective, factors, projects, rate = true, emptyRatings = false }) {
  const csfs = factors.map((text, i) => ({ id: id('f', i), text }));
  const ps = projects.map((text, i) => ({ id: id('p', i), text }));
  const ratings = {};
  if (!emptyRatings) {
    ps.forEach((p) => {
      ratings[p.id] = {
        contrib: Object.fromEntries(csfs.map((f) => [f.id, rnd(4)])),
        ...(rate ? { progress: 1 + rnd(5), resource: 1 + rnd(5) } : {}),
      };
    });
  }
  return { objective, csfs, projects: ps, ratings };
}

const longOrg = 'The Northfield Logistics and Regional Distribution Partnership (Yorkshire, Humberside and the North East) Limited';
const HC = {
  'Health Check, normal': healthCheckPdf({
    organisation: 'Northfield Logistics',
    completedAt: '2026-10-26T08:30:00',
    updatedAt: '2026-10-26T09:30:00',
    draft: hcDraft({
      objective: 'Become the most reliable regional carrier in the North of England by the end of 2027.',
      factors: ['On-time delivery above 98%', 'A safe, well-trained team', 'Customers who stay with us', 'Costs under control', 'Systems that tell us the truth'],
      projects: ['Routing pilot', 'Driver academy', 'New warehouse system', 'Customer portal', 'Fleet electrification study', 'Depot safety audit', 'Pricing review', 'Monthly team briefings'],
    }),
  }),
  'Health Check, very short': healthCheckPdf({
    organisation: 'Ivy & Co',
    completedAt: '2026-10-26T08:30:00',
    draft: hcDraft({ objective: 'Grow.', factors: ['Sales'], projects: ['Website'] }),
  }),
  'Health Check, very long': healthCheckPdf({
    organisation: longOrg,
    completedAt: '2026-10-26T08:30:00',
    draft: hcDraft({
      objective: para(6).slice(0, 500),
      factors: Array.from({ length: 12 }, (_, i) => (i % 3 === 0 ? `${sentence(30)} ${sentence(20)}`.slice(0, 300) : sentence(4 + rnd(8)))),
      projects: Array.from({ length: 30 }, (_, i) => (i % 4 === 0 ? `${sentence(25)} ${sentence(20)}`.slice(0, 300) : sentence(2 + rnd(6)))),
    }),
  }),
  'Health Check, awkward': healthCheckPdf({
    organisation: 'Café Zoë 🚚 Śląsk Ltd',
    completedAt: '2026-10-26T08:30:00',
    draft: hcDraft({
      objective: 'Ship faster 🚀 without burning out the team 🙂 (and keep Łukasz’s café open).',
      factors: ['Speed ⚡', '', 'Happy people ❤️', 'Supercalifragilisticexpialidociousandevenlongerwordthatnevereverbreaksatallanywhere'],
      projects: ['👍', 'A project called “Ångström” with quotes, ampersands & slashes / backslashes \\', '', 'Project with no ratings at all'],
    }),
  }),
  'Health Check, Chinese': healthCheckPdf({
    organisation: '北京未来科技有限公司',
    completedAt: '2026-10-26T08:30:00',
    draft: hcDraft({
      objective: '到2027年底将经常性收入翻一番，同时保持客户满意度。',
      factors: ['赢得美国企业客户', '客户离不开的产品', 'A team with the right skills 合适的团队'],
      projects: ['企业销售团队', '定价审查与套餐调整', 'Data platform 数据平台'],
    }),
  }),
  'Health Check, dates and states': healthCheckPdf({
    organisation: 'Quillmark',
    completedAt: '2026-10-26T08:30:00',
    draft: (() => {
      const d = hcDraft({
        objective: 'Reach £40m in recurring revenue by the end of 2027.',
        factors: ['Win enterprise customers in the US', 'A product customers can’t do without', 'Cash to reach break-even'],
        projects: ['US enterprise sales team', 'AI assistant launch', 'Self-serve onboarding', 'Leadership hiring', 'Pricing and packaging'],
      });
      // one project in each state, with every kind of date
      const set = [[3, 2, 5], [3, 1, 4], [3, 3, 3], [1, 4, 2], [3, 5, 1]];
      const dates = [{ started: '2026-02', due: '2027-06' }, { started: '2026-09', startedOn: '2026-09-14', due: '2027-03', dueOn: '2027-03-31' }, { due: 'open', started: '2026-03' }, {}, { started: '2025-06', due: '2026-04' }];
      d.projects = d.projects.map((p, i) => ({ ...p, ...dates[i] }));
      d.projects.forEach((p, i) => {
        d.ratings[p.id] = { contrib: Object.fromEntries(d.csfs.map((f) => [f.id, set[i][0]])), progress: set[i][1], resource: set[i][2] };
      });
      return d;
    })(),
  }),
  'Health Check, blank answers': healthCheckPdf({
    organisation: '',
    completedAt: null,
    draft: hcDraft({ objective: '   ', factors: ['Only one factor'], projects: ['Unrated project one', 'Unrated project two'], emptyRatings: true }),
  }),
};

const meeting = (form, extra = {}) => ({ id: 'm1', created_at: '2026-10-20T08:00:00', updated_at: '2026-10-20T08:00:00', ...extra, form_data: form });
const flow = (n, long) => Array.from({ length: n }, (_, i) => ({
  id: `r${i}`, item: long && i % 5 === 0 ? sentence(12) : sentence(2 + rnd(3)), aim: long ? sentence(8 + rnd(30)) : sentence(5 + rnd(6)),
  lead: ['Sam Carter', 'Priya Shah', 'Jordan Lee', 'Alex Morgan'][i % 4], length: String(5 + rnd(4) * 5),
}));
const MP = {
  'Meeting plan, normal': meetingPlanPdf({
    personName: 'Sam Carter',
    meeting: meeting({
      title: 'Morrow Cycles kick-off', date: '2026-10-30', time: '09:00', chair: 'Sam Carter',
      meetingContext: 'Morrow Cycles has signed for a twelve week pilot. This is the first meeting with their operations lead, and it sets how we will work together.',
      preReads: 'Read the pilot scope (two pages) and bring one question about delivery windows.',
      objectives: [{ id: 'o1', text: 'Agree the pilot scope and success measures' }, { id: 'o2', text: 'Name an owner on each side' }, { id: 'o3', text: 'Set the date of the first review' }],
      flowItems: [
        { id: 'a', item: 'Welcome', aim: 'Introductions and the aim of the meeting', lead: 'Sam Carter', length: '5' },
        { id: 'b', item: 'Pilot scope', aim: 'Walk through the scope and agree what is out of scope', lead: 'Priya Shah', length: '20' },
        { id: 'c', item: 'Success measures', aim: 'Agree three measures and how we will report them', lead: 'Sam Carter', length: '15' },
        { id: 'd', item: 'Next steps', aim: 'Owners, dates and the first review', lead: 'Sam Carter', length: '10' },
      ],
    }, { updated_at: '2026-10-26T09:30:00' }),
  }),
  'Meeting plan, very short': meetingPlanPdf({ personName: 'Sam Carter', meeting: meeting({ title: 'Catch-up', date: '2026-10-30', time: '14:00' }) }),
  'Meeting plan, very long': meetingPlanPdf({
    personName: 'Maximilian Featherstonehaugh-Worthington-Smythe',
    meeting: meeting({
      title: `Quarterly board and owner meeting on the regional distribution strategy, the routing pilot results and next year’s budget for ${longOrg}`,
      date: '2026-11-02', time: '08:30', chair: 'Maximilian Featherstonehaugh-Worthington-Smythe',
      meetingContext: Array.from({ length: 6 }, () => para(5)).join('\n\n'),
      preReads: Array.from({ length: 4 }, () => para(4)).join('\n\n'),
      objectives: Array.from({ length: 12 }, (_, i) => ({ id: `o${i}`, text: i % 3 ? sentence(8) : `${sentence(20)} ${sentence(14)}` })),
      flowItems: flow(30, true),
    }),
  }),
  'Meeting plan, awkward': meetingPlanPdf({
    personName: 'Zoë Łukasz-Ångström 🙂',
    meeting: meeting({
      title: '🚀 Launch day!!! (final, really final)', date: '2026-11-05', time: '23:30', chair: '',
      meetingContext: `${para(60)}`, // one paragraph longer than a page
      preReads: 'Bring:\n- laptop\n- charger\n- ideas 💡',
      objectives: [{ id: 'o1', text: '' }, { id: 'o2', text: 'Ship it 🚢' }, { id: 'o3', text: '   ' }],
      flowItems: [
        { id: 'a', item: 'Countdown', aim: 'Pneumonoultramicroscopicsilicovolcanoconiosisandmoreandmoreandmoreletters', lead: 'Zoë', length: '45' },
        { id: 'b', item: '', aim: '', lead: '', length: '' },
        { id: 'c', item: 'Wrap', aim: '', lead: '', length: '' },
      ],
    }),
  }),
  'Meeting plan, blank answers': meetingPlanPdf({ personName: '', meeting: meeting({ title: '', date: '', time: '', objectives: [], flowItems: [] }) }),
};

// Every project with the same score, so every dot starts in one place: they
// must move apart only within their own area (Health Check 2c, part 2).
const SAME = { 'moving well': [3, 4], 'needs managing': [3, 3], 'needs attention': [3, 2], 'less important': [0, 2], embryonic: [3, 1], excellent: [3, 5] };
const HC_SAME = {};
for (const n of [8, 20, 40]) {
  for (const [state, [contrib, progress]] of Object.entries(SAME)) {
    const d = hcDraft({
      objective: 'Reach £40m in recurring revenue by the end of 2027.',
      factors: ['Win enterprise customers in the US', 'A product customers can’t do without', 'Cash to reach break-even'],
      projects: Array.from({ length: n }, (_, i) => `Project ${i + 1}`),
    });
    d.projects.forEach((pr) => { d.ratings[pr.id] = { contrib: Object.fromEntries(d.csfs.map((f) => [f.id, contrib])), progress, resource: 3 }; });
    HC_SAME[`Health Check, ${n} the same, ${state}`] = healthCheckPdf({ organisation: 'Quillmark', completedAt: '2026-10-26T08:30:00', draft: d });
  }
}

// ---- Health Check 3: CSF levels, the line, the headline and the questions ----------------
// Each case is drawn up from the answers (levels 3 Critical, 2 Very important,
// 1 Important; contributions 0 None to 3 High; progress 1 Embryonic to 5
// Excellent; resource 1 Minimal to 5 Very high) and kept with its draft, so
// the checks below can compare the PDF with the results page's own model.
const LONG_CSF = 'Win and keep enterprise customers across the United States, Canada and the United Kingdom without discounting below our agreed floor or stretching the support team past what it can carry';
const LONG_PROJECT = 'A complete rebuild of the customer onboarding journey, from the first sales call to the first invoice, with a named owner for every step and a weekly report the board can read in two minutes';
function hc3({ factors, line, projects }) {
  const csfs = factors.map(([text, level], i) => ({ id: id('f', i), text, ...(level ? { level } : {}) }));
  const ps = projects.map(([text, , , , dates], i) => ({ id: id('p', i), text, ...(dates || {}) }));
  const ratings = Object.fromEntries(projects.map(([, contrib, progress, resource], i) => [
    id('p', i), { contrib: Object.fromEntries(contrib.map((c, k) => [id('f', k), c])), progress, resource },
  ]));
  return { objective: 'Double recurring revenue by the end of 2027 while keeping customers happy.', csfs, projects: ps, ratings, ...(line ? { importantLine: line } : {}) };
}
const M20_4 = [['Win enterprise customers in the US', 3], ['A product customers can’t do without', 2], ['Cash to reach break-even', 2], ['A team with the right skills', 1]];
const levelsCase = (line) => hc3({
  factors: M20_4,
  line,
  projects: [
    ['Customer success programme', [3, 3, 1, 2], 2, 4, { started: '2026-03', due: '2027-06' }], // 76%
    ['New office fit-out', [0, 0, 1, 1], 4, 5, { started: '2026-08', due: '2027-01' }], // 15%
    ['Enterprise sales team', [3, 3, 2, 2], 4, 4, { started: '2026-01', due: 'open' }],
    ['Pricing review', [2, 2, 2, 1], 3, 2, { due: '2027-03' }],
    ['AI assistant launch', [2, 3, 1, 0], 1, 3, {}],
    ['Leadership hiring', [1, 0, 1, 2], 5, 1, { started: '2025-11', due: '2026-09' }],
  ],
});
const HC3_DRAFTS = {
  'Health Check 3, every CSF level': levelsCase(null),
  'Health Check 3, line 30': levelsCase(30),
  'Health Check 3, line 80': levelsCase(80),
  'Health Check 3, one project': hc3({ factors: [['Sales', 3]], projects: [['Website', [3], 3, 4, { started: '2026-06', due: '2026-11' }]] }),
  'Health Check 3, no project above the line': hc3({
    factors: M20_4,
    line: 80,
    projects: [['Pricing review', [2, 2, 2, 2], 4, 3], ['Office move', [1, 1, 0, 0], 2, 5], ['Brand refresh', [2, 1, 2, 1], 1, 2]],
  }),
  'Health Check 3, every project above the line': hc3({
    factors: M20_4,
    line: 30,
    projects: [['Enterprise sales team', [3, 3, 2, 2], 4, 4], ['Pricing review', [2, 2, 2, 1], 2, 2], ['Customer success programme', [3, 3, 1, 3], 3, 3], ['AI assistant launch', [2, 3, 1, 0], 1, 5]],
  }),
  'Health Check 3, no dates': hc3({
    factors: M20_4,
    projects: [['Enterprise sales team', [3, 3, 2, 2], 2, 4], ['Pricing review', [2, 2, 2, 1], 3, 2], ['Office move', [0, 1, 0, 0], 4, 4]],
  }),
  'Health Check 3, the most questions': hc3({
    factors: M20_4,
    projects: [
      ['Enterprise sales team', [3, 3, 3, 2], 2, 4, { started: '2026-02', due: '2026-12' }], // Timing
      ['Customer success programme', [3, 3, 2, 2], 2, 3, { due: '2027-09' }], // Progress
      ['New office fit-out', [0, 1, 0, 1], 4, 5], // Resource
    ], // and CSF 4 has no High (a fourth question, left out)
  }),
  'Health Check 3, on track': hc3({
    factors: M20_4,
    projects: [['Enterprise sales team', [3, 3, 3, 3], 4, 3], ['Customer success programme', [3, 2, 3, 3], 5, 3], ['Team socials', [0, 0, 0, 1], 4, 1]],
  }),
  'Health Check 3, long names': hc3({
    factors: [[LONG_CSF, 3], [`${LONG_CSF} and the same again for every new market we open in 2027`, 1], ['Cash', 2]],
    projects: [
      [LONG_PROJECT, [3, 3, 2], 2, 5, { started: '2026-02', due: '2026-11' }],
      [`${LONG_PROJECT}, with a second phase for partners`, [3, 2, 2], 2, 4, { due: '2027-12' }],
      ['Supercalifragilisticexpialidociousandevenlongerwordthatnevereverbreaksatallanywhere', [0, 1, 1], 4, 5],
    ],
  }),
};
const HC3 = Object.fromEntries(Object.entries(HC3_DRAFTS).map(([name, draft]) => [name, healthCheckPdf({
  organisation: name.endsWith('long names') ? longOrg : 'Quillmark', completedAt: '2026-10-26T08:30:00', draft,
})]));

const DOCS = { 'Sample report': samplePdf(), ...HC, ...HC_SAME, ...HC3, ...MP };

// ---- dot charts: dots stay in their own area, and how many touch ----------------------
// A dot is in its own area when it is on the same side of both centre lines
// as its true place (a dot on the middle category stays near its line). Two
// dots touch when their centres are closer than two radii.
function checkDots(layout) {
  const problems = [];
  let touching = 0;
  let dots = 0;
  layout.flat().filter((it) => it.dots).forEach(({ dots: { pts, gm, R: R0, xCentre, yCentre } }) => {
    dots += pts.length;
    pts.forEach((p, i) => {
      const R = p.r ?? R0; // each dot's own size (Health Check 3: dot size shows resource)
      const xOk = p.x < xCentre ? p.cx <= gm.mx - R : p.x > xCentre ? p.cx >= gm.mx + R : Math.abs(p.cx - gm.mx) <= 2 * R * 2;
      // (a dot may stay at its true place even when that is near the line)
      const y0 = gm.ys(p.y);
      const yOk = p.y > yCentre ? p.cy <= Math.max(y0, gm.my - R) + 0.01 : p.y < yCentre ? p.cy >= Math.min(y0, gm.my + R) - 0.01 : p.cy >= gm.my - 0.01;
      const inFrame = p.cx - R >= gm.Lx && p.cx + R <= gm.Lx + gm.plotW && p.cy - R >= gm.top && p.cy + R <= gm.top + gm.plotH;
      if (!xOk || !yOk) problems.push(`dot ${p.n} moved out of its own area`);
      if (!inFrame) problems.push(`dot ${p.n} crosses the chart's edge`);
      for (let j = 0; j < i; j += 1) if (Math.hypot(p.cx - pts[j].cx, p.cy - pts[j].cy) < R + (pts[j].r ?? R0) - 0.01) touching += 1;
    });
  });
  return { problems, touching, dots };
}

// ---- page-break checks (rules 23 to 29) -------------------------------------------

function check(layout) {
  const problems = [];
  const content = (page) => page.filter((it) => !it.cont);
  layout.forEach((page, pi) => {
    const items = content(page);
    const last = items[items.length - 1];
    if (last && last.kind === 'heading') problems.push(`page ${pi + 1}: a heading is the last thing on the page`);
    if (last && last.keep && pi < layout.length - 1) problems.push(`page ${pi + 1}: ends inside a "keep together" run (${last.kind})`);
    items.forEach((it, k) => {
      if (it.kind !== 'heading') return;
      let lines = 0;
      for (let m = k + 1; m < items.length && items[m].kind !== 'heading'; m += 1) lines += items[m].lines;
      const sectionEnds = k + 1 < items.length || pi === layout.length - 1;
      if (lines < 3 && !(sectionEnds && items.slice(k + 1).some((x) => x.kind !== 'heading'))) problems.push(`page ${pi + 1}: a heading has fewer than three lines after it`);
    });
    if (pi > 0) {
      const prev = content(layout[pi - 1]);
      const a = prev[prev.length - 1];
      const b = items[0];
      if (a && b && a.group != null && a.group === b.group) {
        const before = prev.filter((x) => x.group === a.group).reduce((s, x) => s + x.lines, 0);
        const after = items.filter((x) => x.group === b.group).reduce((s, x) => s + x.lines, 0);
        if (before < 3 || after < 3) problems.push(`pages ${pi}/${pi + 1}: a block splits with ${before} line(s) before and ${after} after`);
        if (b.kind === 'row' && !(page[0]?.cont && page[1]?.kind === 'thead')) problems.push(`page ${pi + 1}: a table carries on without its continued heading and column names`);
      }
    }
  });
  const lastLines = content(layout[layout.length - 1]).reduce((s, x) => s + x.lines, 0);
  if (layout.length > 1 && lastLines <= 2) problems.push(`last page holds only ${lastLines} line(s)`);
  return problems;
}

// ---- whole words (rule 30) ------------------------------------------------------------
// Reads every bookmark, the title property, each heading's tag and the copied
// text, and fails if a heading's words are split, spaced or set in capitals
// where its written words belong. Needs poppler and qpdf (brew install
// poppler qpdf); without them it says so and skips.

const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
let toolsMissing = false;
const squash = (t) => t.replace(/\s+/g, ' ').trim();

// pdfinfo prints a heading tag's written words as the PDF stores them: a
// two-byte (UTF-16) string when they hold an emoji or a curly apostrophe.
// Decode those so the check compares words, not bytes.
function readStruct(file) {
  const raw = execFileSync('pdfinfo', ['-struct-text', file], { stdio: ['ignore', 'pipe', 'ignore'] }).toString('latin1');
  return raw.split('\n').map((line) => {
    const m = /^(\s*H[1-6]\s+")\u00fe\u00ff([\s\S]*)("\s*\(.*)$/.exec(line);
    if (m) return m[1] + Buffer.from(m[2], 'latin1').swap16().toString('utf16le') + m[3];
    return Buffer.from(line, 'latin1').toString('utf8');
  }).join('\n');
}

let minerMissing = false;
function guessedText(file) {
  try {
    return execFileSync(process.env.PDF2TXT || 'pdf2txt.py', [file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  } catch {
    minerMissing = true;
    return null;
  }
}

function checkWords(file, spec, res) {
  const problems = [];
  const expected = [spec.title, 'At a glance', 'Contents', ...(spec.sections || []).map((x) => x.title)].map(squash);
  let info;
  let outline;
  let struct;
  let text;
  try {
    info = run('pdfinfo', [file]);
    outline = JSON.parse(run('qpdf', ['--json', '--json-key=outlines', file])).outlines || [];
    struct = readStruct(file);
    text = squash(run('pdftotext', [file, '-']));
  } catch {
    toolsMissing = true;
    return problems;
  }
  const title = /^Title:\s+(.*)$/m.exec(info)?.[1]?.trim() || '';
  // No "…" anywhere in a PDF (Tim, 26 Oct, 16:12): names wrap instead.
  if (/…|\.\.\./.test(text)) problems.push('the text holds "…": something was cut off');
  // The very long organisation name shows in full in the footer.
  if (spec.who && spec.confidential && !text.includes(squash(`Confidential: for ${spec.who}`).replace(/\s+/g, ' '))) {
    const words = squash(String(spec.who)).split(' ');
    if (!words.every((w) => text.includes(w))) problems.push(`the footer doesn't show "${spec.who}" in full`);
  }
  if (title !== res.title) problems.push(`title property is "${title}", not "${res.title}"`);
  if (title && title === title.toUpperCase() && /[a-z]/i.test(title)) problems.push(`title property is in capitals: "${title}"`);
  outline.forEach((o) => {
    if (!expected.includes(squash(o.title))) problems.push(`bookmark "${o.title}" is not a section name as written`);
  });
  // A contents list in every PDF, each section once (PDF rule 33, Tim, 28 Oct).
  if (!outline.length) problems.push('the PDF has no contents list (bookmarks)');
  const seenMarks = outline.map((o) => squash(o.title));
  seenMarks.forEach((t, i) => { if (seenMarks.indexOf(t) !== i) problems.push(`bookmark "${t}" is there twice`); });
  if (seenMarks.some((t) => /, continued$/.test(t))) problems.push('a table carried on has its own bookmark');
  // Rule 33: a reader that guesses the gaps between words from where the
  // letters sit (and ignores the PDF's written words) still reads every
  // heading whole. Uses pdfminer (pip3 install pdfminer.six); without it, says so.
  const guessed = guessedText(file);
  if (guessed != null) {
    const g = squash(guessed);
    const gl = g.toLocaleLowerCase('en-GB');
    expected.forEach((e) => {
      if (!e) return;
      const el = e.toLocaleLowerCase('en-GB');
      if (gl.replace(/\s+/g, '').includes(el.replace(/\s+/g, '')) && !gl.includes(el)) problems.push(`a reader that guesses word gaps splits "${e}"`);
    });
  }
  // heading tags: H1 "Written words" (block), then the drawn line(s)
  const lines = struct.split('\n');
  lines.forEach((line, i) => {
    const m = /^\s*(H1|H2)\s+"(.*)"/.exec(line);
    if (!m) return;
    const words = squash(m[2]);
    if (!expected.includes(words)) problems.push(`${m[1]} tag "${words}" is not a heading as written`);
    const drawn = squash((/"(.*)"/.exec(lines[i + 1] || '') || [])[1] || '');
    if (drawn && drawn !== words.toLocaleUpperCase('en-GB') && drawn !== words) problems.push(`${m[1]} "${words}" is drawn as "${drawn}"`);
    if (!text.includes(words) && !text.includes(words.toLocaleUpperCase('en-GB'))) problems.push(`copied text does not hold "${words}" whole`);
  });
  if (!/^\s*H1\s+"/m.test(struct)) problems.push('no H1 heading tag with its written words');
  // any heading whose letters are in the copied text must be there as whole words
  const letters = (t) => t.toLocaleLowerCase('en-GB').replace(/\s+/g, '');
  const flat = letters(text);
  expected.forEach((e) => {
    if (e && flat.includes(letters(e)) && !text.includes(e) && !text.includes(e.toLocaleUpperCase('en-GB'))) {
      problems.push(`copied text splits "${e}"`);
    }
  });
  return problems;
}

// ---- make them -----------------------------------------------------------------------

const report = [];
let failed = 0;
for (const [name, spec] of Object.entries(DOCS)) {
  if (only && !name.includes(only)) continue;
  const assets = assetsFor(spec);
  for (const paper of [PAPER.A4, PAPER.LETTER]) {
    const layouts = {};
    for (const variant of ['light', 'dark']) {
      const res = await renderPdf(spec, { variant, paper, assets });
      const fname = `${name}, ${paper.name}${variant === 'dark' ? ' (dark)' : ''}.pdf`;
      writeFileSync(join(out, fname), res.bytes);
      layouts[variant] = res;
      const dotCheck = checkDots(res.layout);
      const problems = [...check(res.layout), ...checkWords(join(out, fname), spec, res), ...dotCheck.problems];
      if (problems.length) failed += 1;
      report.push(`${fname}\n  file name in the app: ${res.fileName}\n  ${res.pages} page(s), ${(res.bytes.length / 1024).toFixed(0)} KB${problems.length ? `\n  PROBLEMS:\n    ${problems.join('\n    ')}` : '\n  breaks: all checks pass'}`);
      if (dotCheck.dots) report.push(`  dots: ${dotCheck.dots}${dotCheck.problems.length ? '' : ', all in their own area'}${dotCheck.touching ? `; ${dotCheck.touching} pair(s) touch (the area is full)` : ', none touching'}`);
      report.push(`  pages: ${res.layout.map((p, i) => `${i + 1}[${p.map((x) => `${x.cont ? '+' : ''}${x.kind}${x.lines && x.lines < 99 ? x.lines : ''}`).join(' ')}]`).join('  ')}`);
    }
    if (JSON.stringify(layouts.light.layout) !== JSON.stringify(layouts.dark.layout)) {
      failed += 1;
      report.push(`  PROBLEM: ${name} on ${paper.name} breaks differently in light and dark`);
    }
  }
}
// ---- Health Check: the app and the PDF agree (Phase 1 step 0) ------------------------
{
  const { rankProjects, importanceText } = await load('/src/lib/alignmentScore.js');
  const csfs = [{ id: 'f1', text: 'On-time delivery' }, { id: 'f2', text: 'Drivers who stay' }];
  const projects = [
    { id: 'pa', text: 'Rated project' },
    { id: 'pb', text: 'Unrated project' },
    { id: 'pc', text: 'Rated only on a deleted factor' },
  ];
  const ratings = {
    pa: { contrib: { f1: 3, f2: 1 }, progress: 2, resource: 3 },
    pb: { progress: 4 },
    pc: { contrib: { gone: 3 }, progress: 1 },
  };
  const scoring = [];
  const ranked = rankProjects(projects, csfs, ratings);
  const row = (id) => ranked.find((r) => r.project.id === id);
  // 1. an unrated project reads "Not rated", never 0%, the same in both
  if (importanceText(row('pb')) !== 'Not rated') scoring.push('an unrated project does not read "Not rated"');
  if (importanceText(row('pa')) !== '67%') scoring.push(`a rated project reads "${importanceText(row('pa'))}", not "67%"`);
  // 2. a score for a deleted factor doesn't make a project rated
  if (row('pc').rated) scoring.push('a project rated only on a deleted factor counts as rated');
  const doc = healthCheckPdf({ draft: { objective: 'Test', csfs, projects, ratings } });
  const docText = JSON.stringify(doc);
  if (!docText.includes('"Not rated"')) scoring.push('the PDF table does not say "Not rated" for an unrated project');
  if (/"0%"/.test(docText)) scoring.push('the PDF shows 0% for a project');
  const glance = (doc.glance || []).map((g) => `${g.label}: ${g.value}`).join('; ');
  if (/Average strategic importance: (?!67%)/.test(glance)) scoring.push(`the PDF average counts more than the rated project (${glance})`);
  // 3. a blank resource counts as Moderate (3) in the tie-break too
  const tie = rankProjects(
    [{ id: 'low', text: 'Low' }, { id: 'blank', text: 'Blank' }, { id: 'mod', text: 'Moderate' }],
    csfs,
    { low: { contrib: { f1: 3 }, progress: 5, resource: 2 }, blank: { contrib: { f1: 3 }, progress: 5 }, mod: { contrib: { f1: 3 }, progress: 5, resource: 3 } },
  ).map((r) => r.project.id);
  if (tie.join(',') !== 'blank,mod,low') scoring.push(`blank resource ranks as ${tie.join(', ')}, not as Moderate`);
  report.push(`Health Check scoring (app and PDF agree)\n  ${scoring.length ? `PROBLEMS:\n    ${scoring.join('\n    ')}` : 'unrated reads "Not rated"; a deleted factor never counts; a blank resource ties as Moderate: all checks pass'}`);
  if (scoring.length) failed += 1;
}

// ---- Health Check 3: the PDF says what the results page says --------------------------
// The headline, the questions and their reasons, the line, the dot sizes and
// the CSF levels come from the page's own model (resultsModel), and each one
// is in the PDF's text.
{
  const [{ resultsModel, csfLevel, csfLevelName }, { parseDbTimestamp }] = await Promise.all([
    load('/src/health-check/words.js'), load('/src/lib/dateFormatter.js'),
  ]);
  const flatText = (t) => t.replace(/\s+/g, '');
  const EXPECT = {
    'Health Check 3, every CSF level': (m) => [
      m.factors.map((f) => csfLevelName(csfLevel(f))).join(', ') === 'Critical, Very important, Very important, Important' || 'the CSF levels are wrong',
      m.rows.find((r) => r.text === 'Customer success programme')?.pct === 76 || 'Customer success programme is not 76%',
      m.rows.find((r) => r.text === 'New office fit-out')?.pct === 15 || 'New office fit-out is not 15%',
      m.line === 50 || 'the line is not 50% when none is saved',
    ],
    'Health Check 3, line 30': (m) => [m.line === 30 || 'the line is not 30%'],
    'Health Check 3, line 80': (m) => [m.line === 80 || 'the line is not 80%'],
    'Health Check 3, one project': (m) => [m.rows.length === 1 || 'more than one project', m.questions[0]?.kind === 'timing' || 'no Timing question'],
    'Health Check 3, no project above the line': (m) => [m.headline.big === '0' || `the headline is ${m.headline.big}, not 0`],
    'Health Check 3, every project above the line': (m) => [m.headline.important === m.rows.length || 'not every project is important'],
    'Health Check 3, no dates': (m) => [!m.questions.some((q) => q.kind === 'timing') || 'a Timing question without dates'],
    'Health Check 3, the most questions': (m) => [m.questions.map((q) => q.kind).join(',') === 'timing,progress,resource' || `the questions are ${m.questions.map((q) => q.kind).join(',')}`],
    'Health Check 3, on track': (m) => [m.questions.map((q) => q.kind).join(',') === 'on_track' || `the questions are ${m.questions.map((q) => q.kind).join(',')}`],
    'Health Check 3, long names': (m) => [m.questions.length === 3 || 'not three questions'],
  };
  const lines = [];
  for (const [name, draft] of Object.entries(HC3_DRAFTS)) {
    if (only && !name.includes(only)) continue;
    const spec = HC3[name];
    const m = resultsModel(draft, { asOf: parseDbTimestamp('2026-10-26T08:30:00') });
    const problems = (EXPECT[name]?.(m) || []).filter((x) => x !== true);
    const sec = (title) => spec.sections.find((x) => x.title === title);
    const glance = spec.glance[0];
    if (glance.value !== m.headline.big) problems.push(`At a glance shows ${glance.value}, not ${m.headline.big}`);
    const qs = sec('Questions to start with').blocks;
    if (JSON.stringify(qs.map((q) => [q.label, q.text, q.note])) !== JSON.stringify(m.questions.map((q) => [q.label, q.question, q.reason]))) problems.push('the questions differ from the results page');
    const dots = sec('Strategic importance against progress').blocks[0];
    if (dots) {
      if (dots.yCentre !== m.line || !dots.yTicks.includes(m.line)) problems.push('the chart\'s line is not the Health Check\'s line');
      if (!dots.keyNotes.includes('Bigger dots require more resource.') || !dots.keyNotes.includes(`Important means above ${m.line}%.`)) problems.push('the key is missing a line');
      if (dots.points.some((pt) => pt.size !== m.rows.find((r) => r.n === pt.n).size)) problems.push('a dot is the wrong size');
    }
    const levels = sec('Critical Success Factors').blocks[0].rows.map((r) => r[2]);
    if (levels.join() !== m.factors.map((f) => csfLevelName(csfLevel(f))).join()) problems.push('the CSF levels differ from the results page');
    // and every one of them is in the PDF's text
    let text = '';
    try { text = flatText(run('pdftotext', [join(out, `${name}, A4.pdf`), '-'])); } catch { toolsMissing = true; }
    if (text) {
      const words = [m.headline.big, glance.note, ...m.questions.flatMap((q) => [q.label, q.question, q.reason]), `Important means above ${m.line}%.`, ...(dots ? ['Bigger dots require more resource.'] : [])];
      words.filter(Boolean).forEach((w) => { if (!text.includes(flatText(w))) problems.push(`the PDF's text doesn't hold "${w}"`); });
    }
    if (problems.length) failed += 1;
    lines.push(`  ${name}: line ${m.line}%, headline ${m.headline.big}, questions ${m.questions.map((q) => q.label).join(', ')}${problems.length ? `\n    PROBLEMS:\n      ${problems.join('\n      ')}` : ', all checks pass'}`);
  }
  if (lines.length) report.push(`Health Check 3 (the PDF says what the results page says)\n${lines.join('\n')}`);
}

writeFileSync(join(out, 'break-report.txt'), `${report.join('\n')}\n`);
console.log(report.join('\n'));
if (toolsMissing) console.log('\nThe whole-words check was skipped: install poppler and qpdf to run it.');
if (minerMissing) console.log('\nThe guessed-gaps check (rule 33) was skipped: install pdfminer (pip3 install pdfminer.six), or set PDF2TXT to its pdf2txt.py.');
console.log(failed ? `\n${failed} problem(s)` : '\nAll page-break and whole-word checks pass.');
await vite.close();
process.exit(failed ? 1 : 0);
