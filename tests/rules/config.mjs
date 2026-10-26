// What the rules test checks: who may do what to which table. This is the
// file to change when a table, a role or a rule is added (see README.md).
//
// Every check acts as one person (a viewer) on one row belonging to one
// person (an owner), and compares what the database allowed with `access`.

// ---------------------------------------------------------------- people
// `email` is a test account on clarity-portal-test (scripts/README-test-
// database.md, step 3). `role` is the database role the app uses for them.
// Phase 1 adds: sponsor, viewer and organisation admin, each with a test
// account, and relationships (coach of, sponsor of, admin of) in RELATIONSHIPS.
export const PEOPLE = [
  { key: 'owner_coach', label: 'Owner coach (Alex)', email: 'coach-owner@example.com', role: 'authenticated' },
  { key: 'second_coach', label: 'Second coach (Priya)', email: 'coach-two@example.com', role: 'authenticated' },
  { key: 'client', label: 'Client (Sam)', email: 'client@example.com', role: 'authenticated' },
  { key: 'org_client', label: 'Organisation client (Jordan)', email: 'org-client@example.com', role: 'authenticated' },
  { key: 'signed_out', label: 'Signed out', email: null, role: 'anon' },
];

// Who is linked to whom. Empty today: there are no coach, sponsor or
// organisation links in the database yet, so everyone sees only their own.
// Phase 1 example: { from: 'owner_coach', kind: 'coach of', to: 'client' }.
export const RELATIONSHIPS = [];

// ---------------------------------------------------------------- access
// The answer to "may viewer do this to owner's row?". Write new ones here
// for Phase 1, for example:
//   ownOrCoach: ({ viewer, owner, related }) => OWN({ viewer, owner }) || related('coach of'),
export const OWN = ({ viewer, owner }) => viewer.email !== null && viewer.key === owner.key;
export const NOBODY = () => false;
export const SIGNED_IN = ({ viewer }) => viewer.email !== null;
export const ANYONE = () => true;

// ---------------------------------------------------------------- tables
// table:   the table in public.
// owner:   SQL for the row's owner (row alias t), used to count the rows a
//          viewer sees that are not theirs.
// key:     the column that names one row (default id).
// make:    SQL that adds a row for `owner` with key `id` and a number `n`
//          (all SQL expressions); rowOf(table) is the owner's row in an
//          earlier table. Used once per person to set up, and again for
//          the "add" checks. makeForCheck, if given, is used for those.
// change:  a harmless SET clause for the "change" checks.
// handTo:  a SET clause that would give the row to `other` (their id, as
//          SQL; rowOf(table) is their row in another table), checked for
//          every other person: it must always be refused.
// links:   tables whose rows this table's rows point at (through rowOf in
//          make). Adding your own row that points at someone else's row
//          must be refused.
// access:  read, add, change and remove, each one of the answers above.
//          A missing one means OWN.
// note:    why an access differs from OWN.
// If `make` needs another table's row (a strategy needs a mission), list
// that table first: rows are made in this order.

const userRow = (cols) => ({ owner: 't.user_id', handTo: ({ other }) => `user_id = ${other}`, ...cols });

export const TABLES = [
  {
    table: 'profiles',
    owner: 't.id',
    keyIsOwner: true, // every account already has one, made at sign-up
    make: ({ owner }) => `insert into public.profiles (id) values (${owner})`,
    change: 'first_name = t.first_name',
    handTo: ({ other }) => `id = ${other}`,
  },
  userRow({
    table: 'decisions',
    make: ({ owner, id }) => `insert into public.decisions (id, user_id, tool_type, title) values (${id}, ${owner}, 'grow', 'Rules test')`,
    change: 'title = t.title',
  }),
  userRow({
    table: 'journal_entries',
    make: ({ owner, id }) => `insert into public.journal_entries (id, user_id, entry_date, review_type, content) values (${id}, ${owner}, date '2099-01-01', 'after-action', 'Rules test')`,
    change: 'content = t.content',
  }),
  userRow({
    table: 'daily_journals',
    make: ({ owner, id, n }) => `insert into public.daily_journals (id, user_id, journal_date) values (${id}, ${owner}, date '2099-01-01' + ${n})`,
    change: 'body_text = t.body_text',
  }),
  userRow({
    table: 'missions',
    make: ({ owner, id }) => `insert into public.missions (id, user_id, title) values (${id}, ${owner}, 'Rules test mission')`,
    change: 'title = t.title',
  }),
  {
    table: 'strategies',
    owner: '(select m.user_id from public.missions m where m.id = t.mission_id)',
    make: ({ id, rowOf }) => `insert into public.strategies (id, mission_id, name) values (${id}, ${rowOf('missions')}, 'Rules test')`,
    change: 'name = t.name',
    handTo: ({ rowOf }) => `mission_id = ${rowOf('missions')}`,
  },
  {
    table: 'tactics',
    owner: '(select m.user_id from public.strategies s join public.missions m on m.id = s.mission_id where s.id = t.strategy_id)',
    make: ({ id, rowOf }) => `insert into public.tactics (id, strategy_id, action, type) values (${id}, ${rowOf('strategies')}, 'Rules test', 'tickable')`,
    change: 'action = t.action',
    handTo: ({ rowOf }) => `strategy_id = ${rowOf('strategies')}`,
  },
  userRow({
    table: 'mission_versions',
    make: ({ owner, id, n, rowOf }) => `insert into public.mission_versions (id, mission_id, user_id, major, change_type, snapshot, change_note) values (${id}, ${rowOf('missions')}, ${owner}, 900 + ${n}, 'start', '{}', 'Rules test')`,
    change: 'change_note = t.change_note',
    links: ['missions'],
    access: { change: NOBODY, remove: NOBODY },
    note: 'Plan history can never be changed or removed.',
  }),
  userRow({
    table: 'mission_progress_reviews',
    make: ({ owner, id, rowOf }) => `insert into public.mission_progress_reviews (id, mission_id, user_id) values (${id}, ${rowOf('missions')}, ${owner})`,
    change: 'review_data = t.review_data',
    links: ['missions'],
  }),
  userRow({
    table: 'breathing_sessions',
    make: ({ owner, id }) => `insert into public.breathing_sessions (id, user_id, breathing_mode) values (${id}, ${owner}, 'box')`,
    change: 'duration = t.duration',
  }),
  userRow({
    table: 'wheel_of_life_areas',
    make: ({ owner, id, n }) => `insert into public.wheel_of_life_areas (id, user_id, area_key, kind, label) values (${id}, ${owner}, 'own_rules_test_' || ${n}, 'own', 'Rules test')`,
    change: 'sort_order = t.sort_order',
    access: { remove: NOBODY },
    note: 'An area is switched off, never removed (020).',
  }),
  userRow({
    table: 'wheel_of_life_checkins',
    make: ({ owner, id }) => `insert into public.wheel_of_life_checkins (id, user_id, checkin_date, scores, areas) values (${id}, ${owner}, date '2099-01-01', '{"career": 5}', '[{"key": "career", "label": "Career"}]')`,
    change: 'focus_note = t.focus_note',
    access: { change: NOBODY },
    note: 'A check-in is never edited, only removed and done again (020).',
  }),
  {
    table: 'wheel_of_life_settings',
    owner: 't.user_id',
    key: 'user_id',
    keyIsOwner: true, // one row per person
    make: ({ owner }) => `insert into public.wheel_of_life_settings (user_id) values (${owner}) on conflict (user_id) do nothing`,
    makeForCheck: ({ owner }) => `insert into public.wheel_of_life_settings (user_id) values (${owner})`,
    change: 'chart_style = t.chart_style',
    handTo: ({ other }) => `user_id = ${other}`,
    access: { remove: NOBODY },
    note: 'Settings are changed, never removed (020).',
  },
  userRow({
    table: 'reflections',
    make: ({ owner, id, rowOf }) => `insert into public.reflections (id, user_id, title, linked_decision_id) values (${id}, ${owner}, 'Rules test', ${rowOf('decisions')})`,
    change: 'title = t.title',
    links: ['decisions'],
  }),
  userRow({
    table: 'strategic_alignments',
    make: ({ owner, id }) => `insert into public.strategic_alignments (id, user_id, title) values (${id}, ${owner}, 'Rules test')`,
    change: 'title = t.title',
  }),
  userRow({
    table: 'plans',
    make: ({ owner, id }) => `insert into public.plans (id, user_id, name) values (${id}, ${owner}, 'Rules test')`,
    change: 'name = t.name',
  }),
];

// Tables nobody reaches directly: rows belong to no one person, and every
// read, add, change and remove must be refused for everyone. (The Health
// Check is reached only through its checked functions; see FUNCTIONS.)
export const LOCKED_TABLES = [
  {
    table: 'guest_sessions',
    make: ({ n }) => `insert into public.guest_sessions (session_id) values ('rules-test-' || ${n})`,
    change: 'form_data = t.form_data',
  },
  {
    table: 'alignment_sessions',
    make: ({ id }) => `insert into public.alignment_sessions (id, token, access_code_hash, client_label, respondent_email) values (${id}, 'rules-test-' || ${id}, 'x', 'Rules test', 'rules-test@example.invalid')`,
    change: 'client_label = t.client_label',
  },
  {
    table: 'migration_log', // from 025; skipped where 025 hasn't run
    ifExists: true,
    make: ({ n }) => `insert into public.migration_log (name) values ('rules-test-' || ${n})`,
    change: 'note = t.note',
  },
];

// ---------------------------------------------------------------- functions
// Functions the app (or anyone with the public key) could call directly.
// `call` is a harmless call; inside the test everything is undone anyway.
export const FUNCTIONS = [
  { sig: 'alignment_list()', call: 'select count(*) from public.alignment_list()', access: NOBODY,
    note: 'Lists every Health Check: Tim only, in the SQL editor (018).' },
  { sig: 'create_alignment_session(text,text)', call: "select public.create_alignment_session('Rules test', 'rules-test@example.invalid')", access: NOBODY,
    note: 'Makes a Health Check link: Tim only (018).' },
  { sig: 'alignment_disable(text)', call: "select public.alignment_disable('no-such-link')", access: NOBODY,
    note: 'Turns a Health Check link off: Tim only (018).' },
  { sig: '_alignment_auth(text,text,text)', call: "select public._alignment_auth('no-such-link', 'nobody@example.invalid', 'AAAAAA')", access: NOBODY,
    note: 'Inside part of the Health Check checks (018).' },
  { sig: '_alignment_validate(jsonb)', call: "select public._alignment_validate('{}')", access: NOBODY,
    note: 'Inside part of the Health Check checks (018).' },
  { sig: 'alignment_open(text,text,text)', call: "select public.alignment_open('no-such-link', 'nobody@example.invalid', 'AAAAAA')", access: ANYONE,
    note: 'The outside Health Check page: link, email and code are checked inside.' },
  { sig: 'alignment_save(text,text,text,jsonb,jsonb,integer,boolean)', call: "select public.alignment_save('no-such-link', 'nobody@example.invalid', 'AAAAAA', '{}', null, 0, false)", access: ANYONE,
    note: 'The outside Health Check page: link, email and code are checked inside.' },
  { sig: 'alignment_email_check(text,text,text,text)', call: "select public.alignment_email_check('no-such-link', 'nobody@example.invalid', 'AAAAAA', 'link')", access: ANYONE,
    note: 'The Health Check email sender: link, email and code are checked inside.' },
  { sig: 'alignment_email_failed(text,text,text,text)', call: "select public.alignment_email_failed('no-such-link', 'nobody@example.invalid', 'AAAAAA', 'link')", access: ANYONE,
    note: 'The Health Check email sender: link, email and code are checked inside.' },
  { sig: 'wheel_of_life_checkin_valid(jsonb,jsonb,jsonb)', call: "select public.wheel_of_life_checkin_valid('{}', '{}', '[]')", access: SIGNED_IN,
    note: 'Signed-in people only (020).' },
  { sig: 'wheel_of_life_touch()', call: 'select public.wheel_of_life_touch()', access: NOBODY,
    note: 'Runs only as a trigger (020).' },
  { sig: 'record_migration(integer,text)', ifExists: true, call: "select public.record_migration(0, 'rules-test')", access: NOBODY,
    note: 'Tim only, in the SQL editor (025).' },
];

// ---------------------------------------------------------------- known gaps
// Real gaps in today's rules, found by this test and not fixed yet. Each
// one is still reported every run. A check that matches a gap doesn't fail
// the test; a gap that is no longer found does, so this list stays true.
export const KNOWN_GAPS = [
  {
    id: 'profiles-add-for-others',
    match: (c) => c.table === 'profiles' && c.action === 'add' && c.viewer.key !== c.owner.key,
    text: 'Anyone, even signed out, may add a profile row for another account: the rule "Allow profile creation on signup" lets any new profile through (with check (true)). Only the one-profile-per-account key stops it, so an account whose profile row was deleted could be given one by someone else.',
  },
  {
    id: 'link-to-others-rows',
    match: (c) => c.action === 'link',
    text: 'A person may point their own plan versions and POP reviews at someone else\'s mission, and their own reflections at someone else\'s decision. They still can\'t see or change the other person\'s rows, but if that person deletes the mission, these rows go with it.',
  },
  {
    id: 'test-function-grants',
    match: (c) => c.action === 'call' && c.allowed && !c.expected,
    text: 'On the test project, these functions can be called by anyone with the public key (signed out included), although 018 and 020 closed them: alignment_list (lists every Health Check, with respondents\' emails), create_alignment_session, alignment_disable, _alignment_auth, _alignment_validate, wheel_of_life_touch and wheel_of_life_checkin_valid. This is most likely the test copy only: the copy script makes functions with Supabase\'s default grants, and doesn\'t take away the ones live never had. Check live in its SQL editor (read only): select has_function_privilege(\'anon\', \'public.alignment_list()\', \'execute\');',
  },
];
