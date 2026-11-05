import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { createClient } from '@supabase/supabase-js';
const env = {};
for (const line of readFileSync(`${homedir()}/.clarity-test-accounts.env`, 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim()); if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
if (!env.TEST_SUPABASE_URL?.includes('gqtqljngeenqzxneucoc')) throw new Error('not test');
async function as(e, p) { const c = createClient(env.TEST_SUPABASE_URL, env.TEST_SUPABASE_ANON_KEY, { auth: { persistSession: false } }); const { data, error } = await c.auth.signInWithPassword({ email: env[e], password: env[p] }); if (error) throw new Error(`${e} sign-in: ${error.message}`); return { c, id: data.user.id }; }
const out = [];
const C = await as('TEST_CLIENT_EMAIL', 'TEST_CLIENT_PASSWORD');
const { data: coach } = await C.c.rpc('my_coach');
out.push(`client has coach: ${Array.isArray(coach) && coach.length ? 'yes' : 'no'}`);
const { data: sw0 } = await C.c.from('sharing_switches').select('part,is_on').eq('user_id', C.id);
out.push(`client switches before: ${JSON.stringify(sw0)}`);
const MONTH = '2030-01-01';
await C.c.from('checkins').delete().eq('user_id', C.id).eq('month', MONTH);
const ins = await C.c.from('checkins').insert({ user_id: C.id, month: MONTH, kind: 'monthly', status: 'finished', answers: { H1: 'h7_8', H10: 'very_low' } }).select('id');
out.push(`temp row: ${ins.error ? ins.error.message : 'ok'}`);
const rowId = ins.data?.[0]?.id;
// Attack 4 at the database: odd answers.
for (const bad of [{ H1: '20' }, { H1: -3 }, { H1: 'h20' }, { H15: 'abc' }, { H15: '-1' }, { H15: '9999999' }, { H16: 'x'.repeat(40) }, { H1: '😀' }, { ZZ: 'h7_8' }]) {
  const r = await C.c.from('checkins').update({ answers: bad }).eq('id', rowId).select('answers,hardware_score');
  out.push(`odd ${JSON.stringify(bad).slice(0, 40)}: ${r.error ? `refused (${r.error.message.slice(0, 60)})` : `ACCEPTED ${JSON.stringify(r.data)}`}`);
}
const g = await C.c.from('checkins').update({ goals: { G1: 'x' } }).eq('id', rowId).select('id');
out.push(`goals on monthly: ${g.error ? 'refused' : 'ACCEPTED'}`);
const { data: flags } = await C.c.from('checkin_flags').select('reason').eq('checkin_id', rowId);
out.push(`client reads own flags: ${JSON.stringify(flags)}`);
const setSw = async (on) => { for (const part of ['checkin', 'progress']) { const r = await C.c.from('sharing_switches').upsert({ user_id: C.id, part, is_on: on }, { onConflict: 'user_id,part' }); if (r.error) out.push(`switch ${part}: ${r.error.message}`); } };
const TABLES = ['checkins', 'checkin_flags', 'goal_checks', 'pattern_cards', 'pattern_questions', 'person_settings', 'sharing_switches'];
const readAll = async (who, label) => {
  const res = [];
  for (const t of TABLES) { const r = await who.c.from(t).select('*').eq('user_id', C.id); res.push(`${t}=${r.error ? `err:${r.error.code}` : r.data.length}`); }
  out.push(`${label}: ${res.join(' ')}`);
};
const O = await as('TEST_COACH_OWNER_EMAIL', 'TEST_COACH_OWNER_PASSWORD');
const T = await as('TEST_COACH_TWO_EMAIL', 'TEST_COACH_TWO_PASSWORD');
const G = await as('TEST_ORG_CLIENT_EMAIL', 'TEST_ORG_CLIENT_PASSWORD');
for (const [n, w] of [['owner', O], ['two', T]]) { const r = await w.c.rpc('is_coach_of', { p_owner: C.id }); out.push(`${n} is_coach_of client: ${r.error ? r.error.message : r.data}`); }
await setSw(false);
await readAll(O, 'owner coach, sharing off');
await readAll(T, 'coach two, sharing off');
await readAll(G, 'other client, sharing off');
await setSw(true);
await readAll(O, 'owner coach, sharing ON (control)');
await readAll(G, 'other client, sharing ON');
// Restore switches as they were.
// A person can't remove a switch row, only set it: an absent switch goes back to its default (checkin on, progress off, 026).
const DEFAULT = { checkin: true, progress: false };
for (const part of ['checkin', 'progress']) {
  const was = (sw0 || []).find((s) => s.part === part);
  await C.c.from('sharing_switches').upsert({ user_id: C.id, part, is_on: was ? was.is_on : DEFAULT[part] }, { onConflict: 'user_id,part' });
}
await C.c.from('checkins').delete().eq('id', rowId);
const { data: sw1 } = await C.c.from('sharing_switches').select('part,is_on').eq('user_id', C.id);
out.push(`switches after: ${JSON.stringify(sw1)}; temp row left: ${(await C.c.from('checkins').select('id').eq('month', MONTH)).data.length}`);
console.log(out.join('\n'));
