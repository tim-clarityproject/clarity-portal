// The rules test's part for guest links (migration 035, Phase 1 step 5):
// invented guests with no account, the locked guest tables, every guest and
// coach function, and the scenarios that take several steps. config.mjs
// brings it together. Everything is skipped on a database without 035.
//
// Guests have no account: SETUP makes them inside the rolled-back
// transaction, with known test links, codes and visit keys (only their hashes
// are stored, as the functions would), so the scenarios can use them.

import { NOBODY, SIGNED_IN, ANYONE, ONLY, OWN_OR_COACH } from './access.mjs';

// One more invented person: someone who used a guest link and later makes
// an account with the same, confirmed email.
export const GUEST_PEOPLE = [
  { key: 'guest_claimer', label: 'Former guest (Taylor)', role: 'authenticated' },
];

const id = (key) => `current_setting('rules.${key}')::uuid`;
const h = (c) => `encode(extensions.digest(repeat('${c}', 64), 'sha256'), 'hex')`;

// Known links (token: repeat(c, 64)), all code ABCDEF:
//   1 Alex's GROW link, used by guest one       5 expired
//   3 Priya's plan link, used by guest two      6 switched off
//   9 Alex's plan link, used by Taylor's guest  7 locked
//   a Alex's GROW link, its lock just ended     (8 is unused)
// Visit keys: 2 guest one, this visit (unconfirmed); 4 guest two;
// b guest one, confirmed, no link (coming back); c guest one, an earlier visit.
export const GUEST_SETUP = [`do $guests$
declare
  oc uuid := ${id('owner_coach')}; sc uuid := ${id('second_coach')};
  g1 uuid; g2 uuid; g4 uuid; l1 uuid; l3 uuid; l9 uuid; v1 uuid; v0 uuid; v2 uuid; v4 uuid;
  d0 uuid; d1 uuid; p2 uuid; p4 uuid; s4 uuid; la uuid;
  code text := extensions.crypt('ABCDEF', extensions.gen_salt('bf', 4));
begin
  if to_regclass('public.guests') is null then
    return;
  end if;
  insert into public.guests (email) values ('rules-guest-one@example.invalid') returning id into g1;
  insert into public.guests (email) values ('rules-guest-two@example.invalid') returning id into g2;
  update auth.users set email_confirmed_at = now() where id = ${id('guest_claimer')};
  insert into public.guests (email) select lower(email) from auth.users where id = ${id('guest_claimer')} returning id into g4;
  insert into public.guest_links (tool, coach_user_id, token_hash, code_hash, guest_id, first_used_at) values ('grow', oc, ${h('1')}, code, g1, now()) returning id into l1;
  insert into public.guest_links (tool, coach_user_id, token_hash, code_hash, guest_id, first_used_at) values ('performance-plan', sc, ${h('3')}, code, g2, now()) returning id into l3;
  insert into public.guest_links (tool, coach_user_id, token_hash, code_hash, guest_id, first_used_at) values ('performance-plan', oc, ${h('9')}, code, g4, now()) returning id into l9;
  insert into public.guest_links (tool, coach_user_id, token_hash, code_hash, expires_at) values ('grow', oc, ${h('5')}, code, now() - interval '1 day');
  insert into public.guest_links (tool, coach_user_id, token_hash, code_hash, switched_off_at) values ('grow', oc, ${h('6')}, code, now());
  insert into public.guest_links (tool, coach_user_id, token_hash, code_hash, locked_until) values ('grow', oc, ${h('7')}, code, now() + interval '15 minutes');
  insert into public.guest_links (tool, coach_user_id, token_hash, code_hash, locked_until) values ('grow', oc, ${h('a')}, code, now() - interval '1 second') returning id into la;
  insert into public.guest_link_attempts (link_id, at, ok) select la, now() - interval '16 minutes', false from generate_series(1, 5);
  insert into public.guest_visits (key_hash, guest_id, link_id) values (${h('2')}, g1, l1) returning id into v1;
  insert into public.guest_visits (key_hash, guest_id, link_id, created_at) values (${h('c')}, g1, l1, now() - interval '2 days') returning id into v0;
  insert into public.guest_visits (key_hash, guest_id, confirmed) values (${h('b')}, g1, true);
  insert into public.guest_visits (key_hash, guest_id, link_id) values (${h('4')}, g2, l3) returning id into v2;
  insert into public.guest_visits (key_hash, guest_id, link_id) values (${h('d')}, g4, l9) returning id into v4;
  -- guest one: an earlier GROW (visit c) and this visit's (visit 2)
  insert into public.decisions (guest_id, tool_type, title) values (g1, 'grow', 'Rules guest, earlier') returning id into d0;
  insert into public.decisions (guest_id, tool_type, title) values (g1, 'grow', 'Rules guest, now') returning id into d1;
  insert into public.guest_items (table_name, row_key, guest_id, link_id, visit_id) values ('decisions', d0::text, g1, l1, v0), ('decisions', d1::text, g1, l1, v1);
  -- guest two: a plan
  insert into public.performance_plans (guest_id, mission) values (g2, 'Rules guest two mission') returning id into p2;
  insert into public.guest_items (table_name, row_key, guest_id, link_id, visit_id) values ('performance_plans', p2::text, g2, l3, v2);
  -- Taylor's guest: a plan and a Strategy, claimed in the scenarios
  insert into public.performance_plans (guest_id, mission) values (g4, 'Rules former guest mission') returning id into p4;
  insert into public.plan_strategies (guest_id, plan_id, name) values (g4, p4, 'Rules guest strategy') returning id into s4;
  insert into public.guest_items (table_name, row_key, guest_id, link_id, visit_id) values ('performance_plans', p4::text, g4, l9, v4), ('plan_strategies', s4::text, g4, l9, v4);
  perform set_config('rules.g_d0', d0::text, true);
  perform set_config('rules.g_p2', p2::text, true);
  perform set_config('rules.g_l1', l1::text, true);
  perform set_config('rules.g_l3', l3::text, true);
  perform set_config('rules.g_l9', l9::text, true);
end
$guests$;`];

// ---------------------------------------------------------------- tables
// Send to client: the client and the coach who suggested it read it; nobody
// writes it directly (suggest_tool and the two functions only).
export const GUEST_TABLES = [
  {
    table: 'client_suggestions', ifExists: true, owners: ['client', 'org_client'],
    owner: 't.client_id', handTo: ({ other }) => `client_id = ${other}`,
    make: ({ owner, id: k }) => `insert into public.client_suggestions (id, coach_user_id, client_id, tool)
      values (${k}, (select c.user_id from public.coach_clients cc join public.coaches c on c.id = cc.coach_id where cc.client_id = ${owner} limit 1), ${owner}, 'grow')`,
    change: 'dismissed_at = now()',
    access: { read: OWN_OR_COACH, add: NOBODY, change: NOBODY, remove: NOBODY },
    note: 'Written only by suggest_tool, suggestion_opened and suggestion_dismissed.',
  },
];

export const GUEST_LOCKED_TABLES = [
  { table: 'guests', make: ({ id: k, n }) => `insert into public.guests (id, email) values (${k}, 'rules-locked-${n}@example.invalid')` },
  { table: 'guest_tables', make: () => `insert into public.guest_tables (table_name, tools, columns, claim_order) values ('profiles', '{grow}', '{first_name}', 99)`, change: 'columns = t.columns' },
  { table: 'guest_links', make: ({ id: k, n }) => `insert into public.guest_links (id, tool, coach_user_id, token_hash, code_hash) values (${k}, 'grow', ${id('owner_coach')}, encode(extensions.digest('rules-locked-${n}', 'sha256'), 'hex'), 'x')` },
  { table: 'guest_link_attempts', make: () => `insert into public.guest_link_attempts (link_id, ok) select id, true from public.guest_links limit 1`, change: 'ok = t.ok' },
  { table: 'guest_visits', make: ({ id: k, n }) => `insert into public.guest_visits (id, key_hash, guest_id) select ${k}, encode(extensions.digest('rules-visit-${n}', 'sha256'), 'hex'), id from public.guests limit 1`, change: 'confirmed = true' },
  { table: 'guest_email_codes', make: () => `insert into public.guest_email_codes (guest_id, visit_id, code_hash) select guest_id, id, extensions.crypt('000000', extensions.gen_salt('bf', 4)) from public.guest_visits limit 1`, change: 'tries = 0' },
  { table: 'guest_items', make: ({ n }) => `insert into public.guest_items (table_name, row_key, guest_id) select 'decisions', 'rules-${n}', id from public.guests limit 1`, change: 'visit_id = t.visit_id' },
].map((t) => ({ change: 'created_at = t.created_at', ...t, ifExists: true }));

// ---------------------------------------------------------------- functions
const R = "'00000000-0000-0000-0000-000000000001'::uuid"; // matches nothing
const K = "repeat('f', 64)"; // a visit key that matches nothing
const COACHES = ONLY('owner_coach', 'second_coach');
const fn = (sig, call, access, note) => ({ sig, call: `select ${call}`, access, note, ifExists: true });
export const GUEST_FUNCTIONS = [
  fn('guest_link_create(text)', "public.guest_link_create('grow')", COACHES, 'Coaches only; the link and code are returned once.'),
  fn('guest_link_switch_off(uuid)', `public.guest_link_switch_off(${R})`, NOBODY, 'Only the coach who made the link (or the owner).'),
  fn('coach_links(uuid,integer,timestamptz,uuid)', 'count(*) from public.coach_links()', COACHES, 'A coach\'s own links; the owner\'s are everyone\'s.'),
  fn('coach_guests(uuid,integer,timestamptz,uuid)', 'count(*) from public.coach_guests()', COACHES, 'A coach\'s own guests; the owner\'s are everyone\'s.'),
  fn('coach_guest_answers(uuid)', `public.coach_guest_answers(${R})`, NOBODY, 'Only the coach who made the link.'),
  fn('guest_invite(uuid)', `public.guest_invite(${R})`, NOBODY, 'Only a coach who sent that guest a link.'),
  fn('guest_open(text,text,text)', `public.guest_open(${K}, 'nobody@example.invalid', 'AAAAAA')`, ANYONE, 'The guest page: link, email and code are checked inside.'),
  fn('guest_return_start(text)', "public.guest_return_start('nobody@example.invalid')", ANYONE, 'Coming back: the same answer for every email.'),
  fn('guest_email_confirm(text,text)', `public.guest_email_confirm(${K}, '000000')`, ANYONE, 'The visit key and code are checked inside.'),
  fn('guest_email_code_issue(text)', `public.guest_email_code_issue(${K})`, NOBODY, 'The server only (service role): it emails the code.'),
  fn('guest_rows(text,text)', `public.guest_rows(${K}, 'decisions')`, NOBODY, 'Refused without a real visit key.'),
  fn('guest_my_links(text)', `public.guest_my_links(${K})`, NOBODY, 'Refused without a real visit key.'),
  fn('guest_save(text,text,jsonb)', `public.guest_save(${K}, 'decisions', '{}')`, NOBODY, 'Refused without a real visit key.'),
  fn('guest_delete(text,text,jsonb)', `public.guest_delete(${K}, 'decisions', '{}')`, NOBODY, 'Refused without a real visit key.'),
  fn('guest_delete_link_answers(text)', `public.guest_delete_link_answers(${K})`, NOBODY, 'Refused without a real visit key.'),
  fn('guest_finish(text)', `public.guest_finish(${K})`, NOBODY, 'Refused without a real visit key.'),
  fn('guest_claim()', 'public.guest_claim()', SIGNED_IN, 'Moves in only the guest work of the person\'s own confirmed email.'),
  fn('suggest_tool(uuid,text)', `public.suggest_tool(${R}, 'grow')`, NOBODY, 'Only to the coach\'s own clients.'),
  fn('my_suggestions()', 'count(*) from public.my_suggestions()', SIGNED_IN, 'The person\'s own.'),
  fn('suggestion_opened(uuid)', `public.suggestion_opened(${R})`, SIGNED_IN, 'Changes only the person\'s own.'),
  fn('suggestion_dismissed(uuid)', `public.suggestion_dismissed(${R})`, SIGNED_IN, 'Changes only the person\'s own.'),
  fn('guest_purge_old()', 'public.guest_purge_old()', ONLY('owner_coach'), 'The owner, the server or a scheduled job.'),
  ...['_guest_claim(uuid,uuid)', '_guest_enable_table(text)', '_guest_visit(text)', '_guest_items_tidy(uuid)', '_guest_hash(text)',
      '_guest_random_key()', '_guest_key(text,jsonb)', '_guest_key_sql(text,text)', '_guest_ready_tables()', 'p1_same_owner()']
    .map((s) => fn(s, `public.${s.replace(/\(.*\)/, (a) => ({
      '(uuid,uuid)': `(${R}, ${R})`, '(text)': "('decisions')", '(uuid)': `(${R})`, '()': '()',
      '(text,jsonb)': "('decisions', '{}')", '(text,text)': "('decisions', 'x')" }[a]))}`, NOBODY, 'Inside part of the guest functions.')),
  fn('_coach_first_name(uuid)', `public._coach_first_name(${R})`, NOBODY, 'Inside part of the guest functions.'),
  fn('_guest_sees(guest_visits,text,text)', "public._guest_sees(null::public.guest_visits, 'decisions', 'x')", NOBODY, 'Inside part of the guest functions.'),
];

// ---------------------------------------------------------------- scenarios
const s = (name, steps, expect) => ({ name, steps: steps.map(([as, sql]) => ({ as, sql })), expect, needs: 'public.guests' });
const n = (sql) => `select (${sql})::text`;
const OPEN = (c, email, code = 'ABCDEF') => n(`public.guest_open(repeat('${c}', 64), '${email}', '${code}') ->> 'error'`);
const G1 = 'rules-guest-one@example.invalid';
const ROWS = (key, table) => n(`jsonb_array_length(public.guest_rows(repeat('${key}', 64), '${table}'))`);

export const GUEST_SCENARIOS = [
  // reaching their own rows, and only with the right link, email and code
  s('A guest opens their link with the right email and code', [['signed_out', n(`public.guest_open(repeat('1', 64), '${G1.toUpperCase()}', 'abcdef') ->> 'ok'`)]], 'true'),
  s('... a wrong code is refused', [['signed_out', OPEN('1', G1, 'ABCDEG')]], 'invalid'),
  s('... another email with the right code is refused (the link is theirs)', [['signed_out', OPEN('1', 'someone@example.invalid')]], 'invalid'),
  s('... a made-up link is refused the same way', [['signed_out', OPEN('8', G1)]], 'invalid'),
  s('A guest\'s visit reads only its own work', [['signed_out', ROWS('2', 'decisions')]], '1'),
  s('... not another guest\'s', [['signed_out', ROWS('4', 'decisions')]], '0'),
  s('A guest can\'t change another guest\'s plan', [['signed_out', n(`public.guest_save(repeat('2', 64), 'performance_plans', jsonb_build_object('id', current_setting('rules.g_p2'), 'mission', 'taken')) ->> 'id'`)]], 'error 42501'),
  s('... or delete it', [['signed_out', n(`public.guest_delete(repeat('2', 64), 'performance_plans', jsonb_build_object('id', current_setting('rules.g_p2')))`)]], 'error 42501'),
  s('... or hang a Strategy off it', [['signed_out', n(`public.guest_save(repeat('4', 64), 'plan_strategies', jsonb_build_object('plan_id', (select id from public.performance_plans where mission = 'Rules former guest mission'), 'name', 'x')) ->> 'id'`)]], 'error 42501'),
  s('A made-up visit key reaches nothing', [['signed_out', ROWS('f', 'decisions')]], 'error 42501'),
  s('Signed-in people can\'t read a guest\'s rows directly', [['client', n('select count(*) from public.decisions where guest_id is not null')]], '0'),
  // closed and locked links
  s('An expired link refuses', [['signed_out', OPEN('5', G1)]], 'closed'),
  s('A switched-off link refuses', [['signed_out', OPEN('6', G1)]], 'closed'),
  s('A locked link refuses, even with the right code', [['signed_out', OPEN('7', G1)]], 'locked'),
  s('... until the lock ends', [['signed_out', n(`public.guest_open(repeat('a', 64), '${G1}', 'ABCDEF') ->> 'ok'`)]], 'true'),
  s('Five wrong codes lock a link', [
    ...Array.from({ length: 5 }, () => ['signed_out', OPEN('a', G1, 'ZZZZZZ')]),
    ['signed_out', OPEN('a', G1)]], 'locked'),
  // earlier work only once the email is confirmed
  s('A visit not yet confirmed can\'t change earlier work', [['signed_out', n(`public.guest_save(repeat('2', 64), 'decisions', jsonb_build_object('id', current_setting('rules.g_d0'), 'title', 'x')) ->> 'id'`)]], 'error 42501'),
  s('A confirmed visit reads earlier work too', [['signed_out', ROWS('b', 'decisions')]], '2'),
  s('A wrong email code doesn\'t confirm', [['signed_out', n(`public.guest_email_confirm(repeat('2', 64), '123456') ->> 'error'`)]], 'invalid'),
  s('The email code is never handed to a guest', [['signed_out', n(`public.guest_email_code_issue(repeat('2', 64)) ->> 'code'`)]], 'error 42501'),
  s('... or to a coach', [['owner_coach', n(`public.guest_email_code_issue(repeat('2', 64)) ->> 'code'`)]], 'error 42501'),
  s('Coming back: an unknown email gets the same answer as a known one', [['signed_out', n(`(select string_agg(k, ',' order by k) from jsonb_object_keys(public.guest_return_start('unknown@example.invalid')) k) = (select string_agg(k, ',' order by k) from jsonb_object_keys(public.guest_return_start('${G1}')) k)`)]], 'true'),
  // coaches
  s('The owner lists every guest', [['owner_coach', n('select count(*) from public.coach_guests()')]], '3'),
  s('A coach lists only their own guests', [['second_coach', n("select string_agg(email, ',') from public.coach_guests()")]], 'rules-guest-two@example.invalid'),
  s('... and links', [['second_coach', n('select count(*) from public.coach_links()')]], '1'),
  s('... can\'t ask for another coach\'s', [['second_coach', n('select count(*) from public.coach_guests({owner_coach})')]], 'error 42501'),
  s('... reads their own guest\'s answers', [['second_coach', n("select jsonb_array_length(public.coach_guest_answers(current_setting('rules.g_l3')::uuid) -> 'performance_plans')")]], '1'),
  s('... but not another coach\'s guest\'s', [['second_coach', n("select public.coach_guest_answers(current_setting('rules.g_l1')::uuid)")]], 'error 42501'),
  s('The owner reads no other coach\'s guest\'s answers', [['owner_coach', n("select public.coach_guest_answers(current_setting('rules.g_l3')::uuid)")]], 'error 42501'),
  s('A client has no guests', [['client', n('select count(*) from public.coach_guests()')]], 'error 42501'),
  s('No list holds a link or code in plain text', [['owner_coach', n(`select (select coalesce(jsonb_agg(c), '[]')::text from public.coach_links() c) ~ (repeat('1', 64) || '|ABCDEF')`)]], 'false'),
  s('Making a link returns its code once', [['owner_coach', n("length(public.guest_link_create('grow') ->> 'code')")]], '6'),
  s('A coach can\'t switch off another coach\'s link', [['second_coach', n("select public.guest_link_switch_off(current_setting('rules.g_l1')::uuid)")]], 'error 42501'),
  // claiming
  s('An account with the same, confirmed email claims its guest work', [['guest_claimer', n('select public.guest_claim()')]], '2'),
  s('... claiming again moves nothing', [['guest_claimer', n('select public.guest_claim()')], ['guest_claimer', n('select public.guest_claim()')]], '0'),
  s('... every row arrives once and reads the normal way', [['guest_claimer', n('select public.guest_claim()')], ['guest_claimer', n("select count(*) from public.plan_strategies where name = 'Rules guest strategy'")]], '1'),
  s('... nothing is left with the guest', [['guest_claimer', n('select public.guest_claim()')], ['owner_coach', n("select public.coach_guest_answers(current_setting('rules.g_l9')::uuid)::text")]], '{}'),
  s('Someone else claims nothing of theirs', [['client', n('select public.guest_claim()')]], '0'),
  // deleting
  s('A guest deletes the answers given through their link, only those this visit sees', [['signed_out', n("select public.guest_delete_link_answers(repeat('2', 64))")]], '1'),
  s('... their earlier work stays', [['signed_out', n("select public.guest_delete_link_answers(repeat('2', 64))")], ['signed_out', ROWS('b', 'decisions')]], '1'),
  s('... and another guest\'s too', [['signed_out', n("select public.guest_delete_link_answers(repeat('2', 64))")], ['signed_out', ROWS('4', 'performance_plans')]], '1'),
  s('Only the owner deletes old guests', [['second_coach', n('select public.guest_purge_old()')]], 'error 42501'),
  // Send to client
  s('A coach suggests a tool to their own client, who sees it', [['owner_coach', n("select public.suggest_tool({client}, 'grow') is not null")], ['client', n('select coach_first_name || \' suggests: \' || tool from public.my_suggestions() order by suggested_at desc limit 1')]], 'Alex suggests: grow'),
  s('... not to another coach\'s client', [['second_coach', n("select public.suggest_tool({client}, 'grow')")]], 'error 42501'),
  s('... and nobody else sees it', [['owner_coach', n("select public.suggest_tool({client}, 'grow') is not null")], ['org_client', n('select count(*) from public.client_suggestions where client_id = {client}')]], '0'),
];
