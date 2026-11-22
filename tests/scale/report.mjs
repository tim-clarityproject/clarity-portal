// Turns timing.mjs's results (JSON lines) into the table in BASELINE.md.
//
//   node tests/scale/report.mjs <results.jsonl> > table.md
import { readFileSync } from 'node:fs';

const rows = readFileSync(process.argv[2], 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const NAMES = {
  home: 'Home', 'daily-plan': 'Daily plan', 'daily-review': 'Daily review', sprint: 'The sprint', dashboard: 'Dashboard', debrief: 'Weekly debrief', settings: 'My Account',
  'coach-today': 'Coach: Today', 'coach-todos': 'Coach: To-dos', 'coach-cal-week': 'Coach: Calendar week', 'coach-cal-month': 'Coach: Calendar month',
  'coach-clients-list': 'Coach: Clients (list; Board and Table are taps)', 'coach-client-year': 'Coach: a client with a year of history', 'coach-leads': 'Coach: Leads',
  'coach-network-table': 'Coach: Network table', 'coach-network-map': 'Coach: Network map', 'coach-search': 'Coach: search',
};
const s = (ms) => (ms == null || ms < 0 ? '-' : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`);
const kb = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} kB`);
const mark = (ok) => (ok ? 'yes' : '**no**');
// Keep the last row for each role, size and page.
const last = new Map();
for (const r of rows) last.set(`${r.role}|${r.size}|${r.page}`, r);
console.log('| Page | Who | Size | Cold first screen | Cold data shown | Warm first screen | Warm data shown | Slowest tap | Requests | Rows | Data sent (raw / compressed) | App bytes (cold) | First screen under 1 s on 4G | Taps under 100 ms | No whole list |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of last.values()) {
  if (r.failed) { console.log(`| ${NAMES[r.page] || r.page} | ${r.role} | ${r.size} | failed: ${r.failed} |||||||||||||`); continue; }
  const c = r.cold; const w = r.warm;
  const taps = (r.taps || []).filter((t) => !t.missed);
  const worst = taps.length ? Math.max(...taps.map((t) => t.ms)) : null;
  const whole = c.api.whole.length;
  console.log(`| ${NAMES[r.page] || r.page} | ${r.role} | ${r.size} | ${s(c.first)} | ${s(c.data)} | ${s(w.first)} | ${s(w.data)} | ${worst == null ? '-' : `${worst} ms`} | ${c.api.requests} | ${c.api.rows.toLocaleString('en-GB')} | ${kb(c.api.bytes)} / ${kb(c.api.wire)} | ${kb(c.staticWire)} | ${r.size === 'phone' ? mark(Math.max(c.first, c.data) < 1000) : '(laptop)'} | ${worst == null ? '-' : mark(worst < 100)} | ${whole ? `**no** (${whole})` : 'yes'} |`);
}
