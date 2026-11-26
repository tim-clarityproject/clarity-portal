// The lasting design check, run on a list of routes (polish 1, "A lasting check" and the route inventory): each route
// at 1280 and 390 wide, light and dark, on the LOCAL STAND-IN only (tests/scale/stack.mjs; never the hosted project),
// signed in as the person given. Writes one row per route: pass, or the faults by rule.
//
//   node --import ./tests/scores/register.mjs tests/design/run-design-rules.mjs \
//     --app http://localhost:5230 --api http://localhost:54530 --as local-client@example.com \
//     --routes /welcome,/dashboard [--routes-file routes.txt] [--sizes 1280,390] [--themes light,dark] \
//     [--out <scratch>/design-rules.md]
//
// --as: an email the stand-in knows (tests/scale/seed/05-standing-accounts.sql), or "none" for public pages. Each route
// opens fresh, waits for the page to settle, then designProblems (tests/design/design-rules.mjs) reads it. The run's
// exit code is 1 when any row fails. Keep a run inside 10 minutes: split the routes over several runs.
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { designProblems } from './design-rules.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : d; };
const APP = arg('app', 'http://localhost:5173').replace(/\/$/, '');
const API = arg('api', 'http://127.0.0.1:54400').replace(/\/$/, '');
const AS = arg('as', 'none');
const SIZES = arg('sizes', '1280,390').split(',').map(Number);
const THEMES = arg('themes', 'light,dark').split(',');
const OUT = arg('out', '');
const routes = [
  ...(arg('routes', '') ? arg('routes').split(',') : []),
  ...(arg('routes-file', '') ? readFileSync(arg('routes-file'), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')) : []),
];
const local = (u) => ['localhost', '127.0.0.1', '[::1]'].includes(new URL(u).hostname);
if (!local(API) || !local(APP)) { console.error('The design check runs on this machine only (the local stand-in and a local server).'); process.exit(2); }
if (!routes.length) { console.error('Give --routes or --routes-file.'); process.exit(2); }

let session = null;
if (AS !== 'none') {
  const r = await fetch(`${API}/__session?email=${encodeURIComponent(AS)}`);
  if (!r.ok) { console.error(`The stand-in has no session for ${AS}.`); process.exit(2); }
  session = await r.json();
}

const browser = await chromium.launch({ args: ['--mute-audio'] });
const rows = [];
let failed = 0;
for (const route of routes) {
  const row = { route, cells: {} };
  for (const width of SIZES) {
    for (const theme of THEMES) {
      const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, colorScheme: theme, deviceScaleFactor: 1 });
      await context.route('**/*', (r) => { const u = new URL(r.request().url()); return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) || /^(data|blob):/.test(u.protocol) ? r.continue() : r.abort('blockedbyclient'); });
      if (session) await context.addInitScript(({ v }) => { try { if (!localStorage.getItem('clarity-portal-auth')) localStorage.setItem('clarity-portal-auth', v); } catch { /* none */ } }, { v: JSON.stringify(session) });
      const page = await context.newPage();
      let cell;
      try {
        await page.goto(APP + route, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(1500);
        await page.addStyleTag({ content: '* { transition: none !important; animation-duration: 0s !important; }' }).catch(() => {});
        const landed = new URL(page.url()).pathname;
        const r = await page.evaluate(designProblems, { phone: width < 600, scale: 1, route: landed });
        cell = { landed, problems: r.problems };
      } catch (e) {
        cell = { error: String(e.message || e).slice(0, 120), problems: [] };
      }
      if (cell.error || cell.problems.length) failed += 1;
      row.cells[`${width} ${theme}`] = cell;
      await context.close();
    }
  }
  rows.push(row);
  const summary = Object.entries(row.cells).map(([k, c]) => `${k}: ${c.error ? 'error' : c.problems.length ? `${c.problems.length} fault${c.problems.length > 1 ? 's' : ''}` : 'pass'}`).join(', ');
  console.log(`${route}  ${summary}`);
}
await browser.close();

const keys = SIZES.flatMap((w) => THEMES.map((t) => `${w} ${t}`));
const short = (c) => {
  if (c.error) return `not reached (${c.error})`;
  if (!c.problems.length) return 'pass';
  const by = {};
  for (const p of c.problems) { const k = p.split(':')[0]; by[k] = (by[k] || 0) + 1; }
  return Object.entries(by).map(([k, n]) => `${k} ${n}`).join(', ');
};
const md = [
  `# Design rules, ${new Date().toISOString().slice(0, 10)} (as ${AS === 'none' ? 'nobody signed in' : AS.replace(/@.*/, '')})`,
  '',
  `| Route | Landed | ${keys.join(' | ')} |`,
  `| --- | --- | ${keys.map(() => '---').join(' | ')} |`,
  ...rows.map((r) => `| ${r.route} | ${Object.values(r.cells)[0]?.landed || ''} | ${keys.map((k) => short(r.cells[k] || { error: 'not run' })).join(' | ')} |`),
  '',
  '## Every fault',
  '',
  ...rows.flatMap((r) => keys.flatMap((k) => (r.cells[k]?.problems || []).map((p) => `- ${r.route} at ${k}: ${p}`))),
].join('\n');
if (OUT) {
  writeFileSync(OUT, `${md}\n`);
  writeFileSync(OUT.replace(/\.md$/, '') + '.json', JSON.stringify(rows, null, 1));
  console.log(`Written to ${OUT}`);
}
process.exit(failed ? 1 : 0);
