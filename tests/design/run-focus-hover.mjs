// Hover and keyboard focus on every control (tests/design/focus-hover.mjs), run on a list of routes: each route at a
// laptop width (hover needs a pointer), light and dark, on the LOCAL STAND-IN only, signed in as the person given.
//
//   node --import ./tests/scores/register.mjs tests/design/run-focus-hover.mjs \
//     --app http://localhost:5230 --api http://localhost:54530 --as local-client@example.com \
//     --routes /welcome,/dashboard [--routes-file routes.txt] [--themes light,dark] [--out <scratch>/focus-hover.md]
//
// Exit code 1 when any route fails. Keep a run inside 10 minutes: split the routes over several runs.
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { focusHoverProblems } from './focus-hover.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : d; };
const APP = arg('app', 'http://localhost:5173').replace(/\/$/, '');
const API = arg('api', 'http://127.0.0.1:54400').replace(/\/$/, '');
const AS = arg('as', 'none');
const THEMES = arg('themes', 'light,dark').split(',');
const OUT = arg('out', '');
const routes = [
  ...(arg('routes', '') ? arg('routes').split(',') : []),
  ...(arg('routes-file', '') ? readFileSync(arg('routes-file'), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')) : []),
];
const local = (u) => ['localhost', '127.0.0.1', '[::1]'].includes(new URL(u).hostname);
if (!local(API) || !local(APP)) { console.error('The check runs on this machine only (the local stand-in and a local server).'); process.exit(2); }
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
  for (const theme of THEMES) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: theme, deviceScaleFactor: 1 });
    await context.route('**/*', (r) => { const u = new URL(r.request().url()); return local(u.href) || /^(data|blob):/.test(u.protocol) ? r.continue() : r.abort('blockedbyclient'); });
    if (session) await context.addInitScript(({ v }) => { try { if (!localStorage.getItem('clarity-portal-auth')) localStorage.setItem('clarity-portal-auth', v); } catch { /* none */ } }, { v: JSON.stringify(session) });
    const page = await context.newPage();
    let row;
    try {
      await page.goto(APP + route, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const r = await focusHoverProblems(page);
      row = { route, theme, ...r };
    } catch (e) {
      row = { route, theme, error: String(e.message || e).slice(0, 120), focus: [], hover: [] };
    }
    const bad = row.error || row.focus.length || row.hover.length;
    if (bad) failed += 1;
    rows.push(row);
    console.log(`${route} ${theme}: ${row.error ? `error ${row.error}` : bad ? `${row.focus.length} focus, ${row.hover.length} hover (${row.tabbed} tabbed of ${row.checked})` : `pass (${row.tabbed} tabbed of ${row.checked})`}`);
    for (const p of [...row.focus, ...row.hover].slice(0, 8)) console.log(`   ${p}`);
    await context.close();
  }
}
await browser.close();
if (OUT) {
  const md = ['| Route | Theme | Result | Tabbed | Problems |', '| --- | --- | --- | --- | --- |',
    ...rows.map((r) => `| ${r.route} | ${r.theme} | ${r.error ? 'error' : r.focus.length || r.hover.length ? 'fail' : 'pass'} | ${r.tabbed ?? ''} of ${r.checked ?? ''} | ${(r.error ? [r.error] : [...r.focus, ...r.hover]).join('; ').replace(/\|/g, '/')} |`)];
  writeFileSync(OUT, `${md.join('\n')}\n`);
}
process.exit(failed ? 1 : 0);
