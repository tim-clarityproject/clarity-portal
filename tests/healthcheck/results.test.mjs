// The results page (mock-up M7b version 46), rendered on the server through
// Vite: the order of its sections, At a glance, the chart, the line for
// important, the CSF levels and the project list, for a new Health Check, the
// example report and an older Health Check. Invented names only. Run with
// npm run test:healthcheck.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const vite = await createServer({ root, logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
after(() => vite.close());
const load = (p) => vite.ssrLoadModule(p);
const [{ createElement: h }, { renderToStaticMarkup }] = await Promise.all([import('react'), import('react-dom/server')]);
const [{ default: Results }, { TipProvider }, { EXAMPLE }, words, flow] = await Promise.all([
  load('/src/health-check/Results.jsx'), load('/src/health-check/parts.jsx'),
  load('/src/health-check/example.js'), load('/src/health-check/words.js'), load('/src/pages/alignment/alignmentFlow.js'),
]);

// The mock-up's own invented answers (OWN in m7b-health-check-mockup-v46.html).
const CSF = ['Win and keep enterprise clients', 'A product customers recommend', 'A team with the right skills in the right roles', 'Cash to invest ahead of growth'];
const PR = [
  { t: 'Enterprise sales team', c: [3, 2, 2, 3], p: 2, r: 5, s: '2025-09', f: '2026-12' },
  { t: 'Customer success programme', c: [3, 3, 1, 2], p: 4, r: 3, s: '2026-01', f: '2027-03' },
  { t: 'Pricing review', c: [2, 2, 0, 3], p: 3, r: 2, s: '2026-06', f: '2026-12' },
  { t: 'Hiring plan for 2027', c: [2, 1, 2, 2], p: 1, r: 4, s: '2026-10', f: '2027-06' },
  { t: 'Partner channel', c: [2, 1, 1, 1], p: 3, r: 3, s: '2026-04', f: 'open' },
  { t: 'New office fit-out', c: [0, 0, 1, 1], p: 4, r: 4, s: '2026-07', f: '2026-11' },
  { t: 'Data platform', c: [1, 3, 1, 2], p: 5, r: 3, s: '2025-11', f: '2026-12' },
];
function kestrel({ levels = [3, 2, 2, 1], line } = {}) {
  return {
    objective: 'Double recurring revenue by 2028 while keeping client satisfaction above 9 out of 10.',
    csfs: CSF.map((text, i) => ({ id: `f${i}`, text, ...(levels ? { level: levels[i] } : {}) })),
    projects: PR.map((p, i) => ({ id: `p${i}`, text: p.t, started: p.s, due: p.f })),
    ratings: Object.fromEntries(PR.map((p, i) => [`p${i}`, { contrib: Object.fromEntries(p.c.map((v, k) => [`f${k}`, v])), progress: p.p, resource: p.r }])),
    importantLine: line ?? null,
    completedAt: '2026-10-27T09:00:00.000Z',
  };
}

const render = (props) => renderToStaticMarkup(h(TipProvider, null, h(Results, {
  sort: 'att', phone: false, asOf: '2026-10', onSort() {}, onLine() {}, onChange() {}, onEditProject() {}, onExampleEdit() {}, ...props,
})));
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;/g, '’').replace(/\s+/g, ' ');
const headings = (html) => [...html.matchAll(/<h3>(.*?)<\/h3>/g)].map((m) => m[1]);

test('the results are in the mock-up’s order, with no separate Next step', () => {
  const html = render({ draft: kestrel() });
  assert.ok(html.indexOf('Objective') < html.indexOf('At a glance'));
  assert.deepEqual(headings(html), ['At a glance', 'Strategic importance against progress', 'Critical Success Factors', 'Your projects']);
  assert.doesNotMatch(html, /Next step|Start with “/);
});

test('At a glance: the headline and the three questions, as the mock-up shows them', () => {
  const t = text(render({ draft: kestrel() }));
  assert.match(t, /2 of 5 important projects are moving well\. 1 needs managing, 1 needs attention and 1 is too early to tell\./);
  assert.match(t, /Questions to start with Timing Is “Enterprise sales team” worth a sprint of extra resource to finish by Dec 2026, or should its timeline change\? You rated its progress Bad, and it’s due to finish in 2 months\./);
  assert.match(t, /Resource Is “New office fit-out” worth the resource it takes\? You rated its resource High, and its strategic importance is 15%\./);
  assert.match(t, /CSF cover What could strongly support “A team with the right skills in the right roles”\? You didn’t rate any project High for this CSF\./);
  // No number circles on the questions.
  const glance = render({ draft: kestrel() }).split('<h3>Strategic importance')[0];
  assert.doesNotMatch(glance, /class="pn/);
});

test('the chart: dotted background, the line, end labels only, two area names, dot size from resource', () => {
  const html = render({ draft: kestrel() });
  const svg = html.slice(html.indexOf('<svg'), html.indexOf('</svg>'));
  assert.match(svg, /<pattern /);
  for (const w of ['High', 'Low', 'Embryonic', 'Excellent', 'Strategic importance', 'Progress', 'Needs attention', 'Moving well']) assert.match(svg, new RegExp(`>${w}<`));
  for (const w of ['Needs managing', 'Less important', '50%', 'Bad', 'Fair', 'Good']) assert.doesNotMatch(svg, new RegExp(`>${w}<`));
  // No project name on the chart.
  PR.forEach((p) => assert.doesNotMatch(svg, new RegExp(`>${p.t}<`)));
  // Every outline 1.5px; the needs attention dot keeps its second, 1px ring.
  const rings = [...svg.matchAll(/<circle cx="[\d.]+" cy="[\d.]+" r="([\d.]+)" style="fill:([^;]+);stroke:([^"]+)" stroke-width="([\d.]+)"/g)];
  assert.equal(rings.filter((m) => m[4] === '1.5').length, PR.length);
  assert.equal(rings.filter((m) => m[4] === '1').length, 1);
  // Very high 17, Moderate 12, Low 8.
  const radii = rings.filter((m) => m[4] === '1.5').map((m) => Number(m[1])).sort((a, b) => a - b);
  assert.deepEqual(radii, [8, 12, 12, 12, 17, 17, 17]);
  assert.match(text(html), /Each dot is a project\. Bigger dots require more resource\. Important means above 50%, suggested/);
});

test('the line drop-down offers 30% to 80%, 50% suggested, and the line moves everything', () => {
  assert.deepEqual(words.LINE_OPTIONS.map((o) => o.label), ['30%', '40%', '50%, suggested', '60%', '70%', '80%']);
  const at70 = text(render({ draft: kestrel({ line: 70 }) }));
  assert.match(at70, /Important means above 70%/);
  // Above 70%: Customer success programme (76%, Good) and Enterprise sales team (83%, Bad).
  assert.match(at70, /1 of 2 important projects is moving well\. 1 needs attention\./);
  const html = render({ draft: kestrel({ line: 70 }) });
  const svg = html.slice(html.indexOf('<svg'), html.indexOf('</svg>'));
  const y = (pct) => 42 + (1 - pct / 100) * (428 - 42 - 56);
  assert.match(svg, new RegExp(`y1="${y(70)}" y2="${y(70)}"`));
});

test('CSF cards show their level, and a CSF with no High says so', () => {
  const t = text(render({ draft: kestrel() }));
  assert.match(t, /Critical Win and keep enterprise clients/);
  assert.match(t, /Very important A product customers recommend/);
  assert.match(t, /Important Cash to invest ahead of growth/);
  assert.match(t, /Very important A team with the right skills in the right roles No project strongly supports this yet\./);
  assert.equal((t.match(/No project strongly supports this yet\./g) || []).length, 1);
});

test('the project list: its two ⓘ, the edit line, the states, with no pop-up on the numbers', () => {
  const html = render({ draft: kestrel() });
  assert.match(text(html), /The one most in need of attention comes first\. .*Choose a project to edit its answers\./);
  assert.match(html, /aria-label="How it’s worked out"/);
  assert.match(html, /Strategic importance<button type="button" class="ipb" aria-label="What strategic importance means"/);
  assert.deepEqual(words.ORDER_LINES.map((l) => l.bold || l.line), ['Most in need of attention', 'Important projects that are behind and require more resource come first.']);
  assert.deepEqual(words.importanceLines().map((l) => l.bold || l.line), [
    'Strategic importance', 'How much a project helps your CSFs, out of 100%.', 'High on every CSF scores 100%.',
    'A Critical CSF counts 40% more than an Important one, and a Very important one 20% more.',
  ]);
  for (const m of html.matchAll(/<span class="pn[^"]*"([^>]*)>/g)) assert.equal(m[1], ' aria-hidden="true"');
});

test('How it works: the word, then its meaning, with the line in use', () => {
  const lines = words.howItWorks(60);
  assert.deepEqual(lines.slice(1).map((l) => l.term), ['Strategic importance', 'Important', 'Most in need of attention', 'Too early to tell', 'Bigger dots']);
  assert.equal(lines[2].meaning, 'A project above the line you set, which is now 60%.');
});

test('the example report: "Important means above 50%.", no drop-down, their words', () => {
  const html = render({ draft: EXAMPLE.draft, asOf: EXAMPLE.asOf, theirs: true });
  const t = text(html);
  assert.deepEqual(headings(html), ['At a glance', 'Strategic importance against progress', 'Critical Success Factors', 'Their projects']);
  assert.match(t, /Important means above 50%\./);
  assert.doesNotMatch(t, /suggested/);
  assert.doesNotMatch(t, /Choose a project/);
  assert.match(t, /They rated its progress/);
  assert.doesNotMatch(t, /You rated|You didn’t/);
});

test('an older Health Check: every CSF Very important, a line of 50, the old figures', () => {
  const old = kestrel({ levels: null });
  const t = text(render({ draft: old }));
  assert.equal((t.match(/Very important /g) || []).length, 4);
  assert.doesNotMatch(t, /Critical (Win|A |Cash)/);
  assert.match(t, /Important means above 50%, suggested/);
  // Unweighted: Customer success programme 75%, New office fit-out 17%.
  const rows = words.resultRows(old);
  assert.equal(rows.find((r) => r.text === 'Customer success programme').pct, 75);
  assert.equal(rows.find((r) => r.text === 'New office fit-out').pct, 17);
  // Saved back unchanged: no level and no line are added.
  const back = flow.dataFromDraft(flow.draftFromData(flow.dataFromDraft(old)));
  assert.ok(back.csfs.every((f) => !('level' in f)));
  assert.ok(!('importantLine' in back));
});
