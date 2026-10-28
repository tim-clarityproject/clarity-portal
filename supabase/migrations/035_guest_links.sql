-- =============================================================================
-- 035_guest_links.sql
-- Phase 1 step 5: guest links, the data side (decisions part 2, "Any tool,
-- without an account: guest links from the coach portal", Tim, 27 Oct)
--
-- WHAT THIS DOES (plain English)
--   On a call, a coach picks a tool and makes a link. They get the link and a
--   6-character code, once. The person opens the link, types their email and
--   the code, and uses the tool without an account. Their answers belong to
--   their email (a "guest"). Later the same email gets back to its work after
--   confirming the email with a 6-digit code sent to it, and if they ever
--   make an account with that confirmed email, the work moves in.
--
--     guests              one per email (lowercased): first confirmed, last
--                         visit, and once claimed, the account and when
--     guest_tools         the tools a link can be made for (data, so any
--                         later tool adds a row): Get unstuck (GROW), Give
--                         difficult feedback, Prepare for a difficult
--                         conversation, the Performance Plan
--     guest_tables        which tables a guest's rows may be in, the columns
--                         a guest may write, and the order claiming moves them
--     guest_links         a coach's link: the tool, a hashed token and code,
--                         30 days, switched off, the guest once used, finished
--     guest_link_attempts every code try (5 wrong lock the link 15 minutes)
--     guest_visits      a visit, by a hashed key the page holds; it sees
--                         earlier work only once the email is confirmed
--     guest_email_codes   6-digit codes (hashed, 10 minutes, 5 tries)
--     guest_items         which guest row came from which link and visit
--     client_suggestions  "Send to client": "Tim suggests: GROW" on Home
--
--   The tool tables a guest can use get a guest_id beside user_id, and each
--   row has exactly one of the two: a guest's rows are owned by the guest
--   record just as an account's are by the account, so every tool works the
--   same way. The tables: decisions (GROW, Give difficult feedback, Prepare
--   for a difficult conversation) and the Performance Plan's mission,
--   objectives, Strategies and tactics (performance_plans, plan_versions,
--   outcome_objectives, plan_strategies, strategy_objectives, habits).
--   A later tool follows the same approach: public._guest_enable_table and
--   a row in guest_tables (and guest_tools).
--
-- WHO CAN REACH WHAT
--   Guests (signed out) reach their own rows only through the checked
--   functions guest_open, guest_return_start, guest_email_confirm,
--   guest_rows, guest_my_links, guest_save, guest_delete, guest_delete_link_answers and
--   guest_finish. Every guest table is locked to everyone else.
--   The 6-digit email code is handed only to the server that emails it
--   (guest_email_code_issue: service role only).
--   Coaches (checked functions): guest_link_create (the link and code, once,
--   only to that coach), guest_link_switch_off, coach_links, coach_guests,
--   coach_guest_answers and guest_invite. A coach sees only their own links
--   and guests; the owner lists all links and guests (not their answers).
--   Accounts: guest_claim moves the work of their confirmed email in.
--   Clients: my_suggestions, suggestion_opened, suggestion_dismissed.
--   Keeping: guest_purge_old (2 years after the last visit; service role or
--   the owner; not scheduled here).
--
-- SAFE TO RUN TWICE
--   Yes. Tables, columns and indexes are made only if missing; functions,
--   rules and the tool list are replaced with the same versions.
--
-- HOW TO RUN
--   After 034. Then run supabase/035_guest_links_test.sql, which should end
--   with ALL CHECKS PASSED.
-- =============================================================================

-- ---------------------------------------------------------------- guests
create table if not exists public.guests (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null unique
                     check (email = lower(email) and email !~ '[[:space:][:cntrl:]\u00a0\u2000-\u200b\u2028\u2029\u202f\u205f\u3000\ufeff]'
                            and char_length(email) between 3 and 254 and email like '%_@_%'),
  first_confirmed_at timestamptz,
  last_visit_at      timestamptz not null default now(),
  claimed_by         uuid references auth.users (id) on delete set null,
  claimed_at         timestamptz,
  last_invited_at    timestamptz,
  last_invited_by    uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now()
);
comment on table public.guests is
  'People using a tool through a coach''s link, without an account, keyed by email (035). Reached only through the guest functions.';
create index if not exists guests_last_visit_idx on public.guests (last_visit_at);
create index if not exists guests_claimed_by_idx on public.guests (claimed_by);
create index if not exists guests_last_invited_by_idx on public.guests (last_invited_by);

-- ---------------------------------------------------------------- tools
create table if not exists public.guest_tools (
  tool          text primary key check (tool ~ '^[a-z][a-z0-9-]{1,40}$'),
  label         text not null check (char_length(label) between 1 and 80),
  decision_type text,
  active        boolean not null default true,
  sort_order    integer not null default 0
);
comment on table public.guest_tools is
  'Tools a guest link can be made for (035). decision_type: the decisions.tool_type its rows use, when it keeps them in decisions.';

-- Prepare for a difficult conversation keeps its rows in decisions, beside
-- Give difficult feedback (tough-conversation), so the list of tool types
-- grows by one. (Its own phase can move it if it needs to.)
alter table public.decisions drop constraint if exists decisions_tool_type_check;
alter table public.decisions add constraint decisions_tool_type_check CHECK ((tool_type = ANY (ARRAY['grow'::text, 'inversion'::text, 'tough-conversation'::text, 'strategic-alignment'::text, 'if_then_planning'::text, 'daily_plan'::text, 'plan_meeting'::text, 'stop_doing_audit'::text, 'difficult-conversation'::text])));

insert into public.guest_tools (tool, label, decision_type, sort_order) values
  ('grow', 'Get unstuck', 'grow', 1),
  ('give-feedback', 'Give difficult feedback', 'tough-conversation', 2),
  ('prepare-conversation', 'Prepare for a difficult conversation', 'difficult-conversation', 3),
  ('performance-plan', 'Performance Plan', null, 4)
on conflict (tool) do update set label = excluded.label, decision_type = excluded.decision_type, sort_order = excluded.sort_order;

-- ---------------------------------------------------------------- the tables a guest's rows may be in
create table if not exists public.guest_tables (
  table_name  text primary key,
  tools       text[] not null,                 -- the tools whose links may write it
  key_cols    text[] not null default array['id'],
  columns     text[] not null,                 -- what a guest may write (never user_id, guest_id or approvals)
  parents     jsonb not null default '[]',     -- [{"col": ..., "table": ...}]: must be the guest's own, and visible
  top_level   boolean not null default false,  -- a new one needs a link for its tool
  changeable  boolean not null default true,   -- false: rows are only added (plan history)
  claim_order integer not null
);
comment on table public.guest_tables is
  'Where guests'' rows may be (035): the writable columns, the parents, and the order claiming moves them (parents first).';

insert into public.guest_tables (table_name, tools, key_cols, columns, parents, top_level, claim_order) values
  ('performance_plans', array['performance-plan'], array['id'], array['mission', 'major', 'minor'], '[]', true, 1),
  ('plan_strategies', array['performance-plan'], array['id'], array['plan_id', 'name', 'description', 'sort_order', 'archived_at'],
   '[{"col": "plan_id", "table": "performance_plans"}]', false, 2),
  ('outcome_objectives', array['performance-plan'], array['id'],
   array['plan_id', 'name', 'kind', 'unit', 'direction', 'start_value', 'start_set_on', 'target_value', 'by_when', 'due_on', 'reached_on', 'sort_order', 'archived_at'],
   '[{"col": "plan_id", "table": "performance_plans"}]', false, 3),
  ('plan_versions', array['performance-plan'], array['id'], array['plan_id', 'major', 'minor', 'kind', 'change_note', 'snapshot'],
   '[{"col": "plan_id", "table": "performance_plans"}]', false, 4),
  ('strategy_objectives', array['performance-plan'], array['strategy_id', 'objective_id'], array['strategy_id', 'objective_id'],
   '[{"col": "strategy_id", "table": "plan_strategies"}, {"col": "objective_id", "table": "outcome_objectives"}]', false, 5),
  ('habits', array['performance-plan'], array['id'],
   array['plan_id', 'strategy_id', 'name', 'measure', 'unit', 'target', 'target_per', 'limit_value', 'limit_per', 'direction', 'top_number', 'impact', 'sort_order', 'archived_at'],
   '[{"col": "plan_id", "table": "performance_plans"}, {"col": "strategy_id", "table": "plan_strategies"}]', false, 6),
  ('decisions', array['grow', 'give-feedback', 'prepare-conversation'], array['id'], array['title', 'form_data', 'status', 'draft'], '[]', true, 7)
on conflict (table_name) do update set tools = excluded.tools, key_cols = excluded.key_cols, columns = excluded.columns,
  parents = excluded.parents, top_level = excluded.top_level, claim_order = excluded.claim_order;
-- Plan history is only ever added to, as for an account (027).
update public.guest_tables set changeable = (table_name <> 'plan_versions');

-- A tool table a guest can own rows in: guest_id beside user_id, exactly one
-- of the two on every row, and an index. Safe to run twice.
create or replace function public._guest_enable_table(p_table text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format('alter table public.%I add column if not exists guest_id uuid references public.guests (id) on delete cascade', p_table);
  execute format('alter table public.%I alter column user_id drop not null', p_table);
  if not exists (select 1 from pg_catalog.pg_constraint
                 where conrelid = format('public.%I', p_table)::regclass and conname = p_table || '_one_owner') then
    execute format('alter table public.%I add constraint %I check (num_nonnulls(user_id, guest_id) = 1)', p_table, p_table || '_one_owner');
  end if;
  execute format('create index if not exists %I on public.%I (guest_id) where guest_id is not null', p_table || '_guest_idx', p_table);
end;
$$;
revoke all on function public._guest_enable_table(text) from public, anon, authenticated;

select public._guest_enable_table(t.table_name) from public.guest_tables t order by t.claim_order;

-- One active plan per guest, as per account.
create unique index if not exists performance_plans_one_active_guest on public.performance_plans (guest_id) where status = 'active' and guest_id is not null;

-- A child row's parent must have the same owner: the same account, or the
-- same guest (026's rule, now knowing guests).
create or replace function public.p1_same_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_id uuid := (to_jsonb(new) ->> tg_argv[1])::uuid;
  parent jsonb;
begin
  if parent_id is null then
    return new;
  end if;
  execute format('select to_jsonb(p) from public.%I p where id = $1', tg_argv[0]) into parent using parent_id;
  if parent is null
     or (parent ->> 'user_id') is distinct from (to_jsonb(new) ->> 'user_id')
     or (parent ->> 'guest_id') is distinct from (to_jsonb(new) ->> 'guest_id') then
    raise exception 'That belongs to someone else, so it wasn''t saved. Go back and try again.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.p1_same_owner() from public, anon, authenticated;

-- ---------------------------------------------------------------- links, tries, visits, codes, items
create table if not exists public.guest_links (
  id              uuid primary key default gen_random_uuid(),
  tool            text not null references public.guest_tools (tool),
  coach_user_id   uuid not null references auth.users (id) on delete cascade,
  token_hash      text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  code_hash       text not null,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '30 days',
  switched_off_at timestamptz,
  guest_id        uuid references public.guests (id) on delete set null,
  first_used_at   timestamptz,
  finished_at     timestamptz,
  locked_until    timestamptz
);
comment on table public.guest_links is
  'A coach''s guest link (035): the token and code are kept only as hashes. Tied to the first email that opens it.';
create index if not exists guest_links_coach_idx on public.guest_links (coach_user_id, created_at desc);
create index if not exists guest_links_guest_idx on public.guest_links (guest_id, created_at desc);
create index if not exists guest_links_tool_idx on public.guest_links (tool);

create table if not exists public.guest_link_attempts (
  id      bigint generated always as identity primary key,
  link_id uuid not null references public.guest_links (id) on delete cascade,
  at      timestamptz not null default clock_timestamp(),
  ok      boolean not null
);
create index if not exists guest_link_attempts_link_idx on public.guest_link_attempts (link_id, at desc);

create table if not exists public.guest_visits (
  id           uuid primary key default gen_random_uuid(),
  key_hash     text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  guest_id     uuid references public.guests (id) on delete cascade,  -- empty: coming back with an email that has no work
  link_id      uuid references public.guest_links (id) on delete cascade,
  confirmed    boolean not null default false,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '12 hours'
);
create index if not exists guest_visits_guest_idx on public.guest_visits (guest_id, created_at desc);
create index if not exists guest_visits_link_idx on public.guest_visits (link_id);

create table if not exists public.guest_email_codes (
  id         uuid primary key default gen_random_uuid(),
  guest_id   uuid not null references public.guests (id) on delete cascade,
  visit_id uuid not null references public.guest_visits (id) on delete cascade,
  code_hash  text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  tries      integer not null default 0,
  used_at    timestamptz
);
create index if not exists guest_email_codes_visit_idx on public.guest_email_codes (visit_id, created_at desc);
create index if not exists guest_email_codes_guest_idx on public.guest_email_codes (guest_id, created_at desc);

create table if not exists public.guest_items (
  table_name text not null references public.guest_tables (table_name),
  row_key    text not null,
  guest_id   uuid not null references public.guests (id) on delete cascade,
  link_id    uuid references public.guest_links (id) on delete set null,
  visit_id uuid references public.guest_visits (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (table_name, row_key)
);
comment on table public.guest_items is
  'Which link and visit made each guest row (035): a visit that hasn''t confirmed the email sees only its own.';
create index if not exists guest_items_guest_idx on public.guest_items (guest_id, table_name);
create index if not exists guest_items_link_idx on public.guest_items (link_id);
create index if not exists guest_items_visit_idx on public.guest_items (visit_id);

-- ---------------------------------------------------------------- Send to client
create table if not exists public.client_suggestions (
  id            uuid primary key default gen_random_uuid(),
  coach_user_id uuid not null references auth.users (id) on delete cascade,
  client_id     uuid not null references auth.users (id) on delete cascade,
  tool          text not null check (tool ~ '^[a-z][a-z0-9_-]{1,40}$'),
  suggested_at  timestamptz not null default now(),
  opened_at     timestamptz,
  dismissed_at  timestamptz
);
comment on table public.client_suggestions is
  'A coach''s suggestion of a tool to their own client (035), shown at the top of Home as "Tim suggests: GROW".';
create index if not exists client_suggestions_client_idx on public.client_suggestions (client_id, suggested_at desc);
create index if not exists client_suggestions_coach_idx on public.client_suggestions (coach_user_id, suggested_at desc);

-- ---------------------------------------------------------------- locked
do $lock$
declare t text;
begin
  foreach t in array array['guests', 'guest_tools', 'guest_tables', 'guest_links', 'guest_link_attempts', 'guest_visits',
                           'guest_email_codes', 'guest_items', 'client_suggestions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
  end loop;
end
$lock$;

-- The tool list for Create link, and a person's own suggestions (read only).
grant select on table public.guest_tools to authenticated;
drop policy if exists "Signed in people read the guest tools" on public.guest_tools;
create policy "Signed in people read the guest tools" on public.guest_tools for select to authenticated using (true);
grant select on table public.client_suggestions to authenticated;
drop policy if exists "Clients and their coaches read suggestions" on public.client_suggestions;
create policy "Clients and their coaches read suggestions" on public.client_suggestions for select to authenticated
  using (client_id = (select auth.uid()) or coach_user_id = (select auth.uid()));

-- ---------------------------------------------------------------- shared helpers (not callable from the app)
create or replace function public._guest_hash(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(p, 'sha256'), 'hex');
$$;

-- 32 random bytes as 64 hex characters (links and visit keys).
create or replace function public._guest_random_key()
returns text
language sql
volatile
set search_path = ''
as $$
  select encode(extensions.gen_random_bytes(32), 'hex');
$$;

-- A row's key, as guest_items keeps it.
create or replace function public._guest_key(p_table text, p_row jsonb)
returns text
language sql
stable
set search_path = ''
as $$
  select string_agg(p_row ->> c, '/' order by o)
  from public.guest_tables t, unnest(t.key_cols) with ordinality k(c, o)
  where t.table_name = p_table;
$$;

-- The same key, as an SQL expression over a table alias.
create or replace function public._guest_key_sql(p_table text, p_alias text)
returns text
language sql
stable
set search_path = ''
as $$
  select string_agg(format('%I.%I::text', p_alias, c), ' || ''/'' || ' order by o)
  from public.guest_tables t, unnest(t.key_cols) with ordinality k(c, o)
  where t.table_name = p_table;
$$;

-- The guest tables that are set up for guests (have guest_id), in claim
-- order: a row in guest_tables for a table not yet enabled is ignored.
create or replace function public._guest_ready_tables()
returns setof public.guest_tables
language sql
stable
set search_path = ''
as $$
  select t.* from public.guest_tables t
  where exists (select 1 from pg_catalog.pg_attribute a
                where a.attrelid = to_regclass('public.' || quote_ident(t.table_name)) and a.attname = 'guest_id' and not a.attisdropped)
  order by t.claim_order;
$$;

-- An email as typed, made plain: lowercased, with spaces around it removed;
-- null when it holds a space or hidden character inside, or isn't an email.
create or replace function public._guest_email(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when e ~ '[[:space:][:cntrl:]\u00a0\u2000-\u200b\u2028\u2029\u202f\u205f\u3000\ufeff]'
                or char_length(e) not between 3 and 254 or e not like '%_@_%' then null else e end
  from (select lower(regexp_replace(coalesce(p, ''), '^[[:space:]\u00a0\u2000-\u200b\u202f\u205f\u3000\ufeff]+|[[:space:]\u00a0\u2000-\u200b\u202f\u205f\u3000\ufeff]+$', '', 'g')) as e) x;
$$;

-- One wrong try at a link: recorded, and five in 15 minutes (since the
-- last right one) lock it for 15 minutes.
create or replace function public._guest_link_wrong(p_link uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_wrong integer;
begin
  insert into public.guest_link_attempts (link_id, ok) values (p_link, false);
  select count(*) into v_wrong from public.guest_link_attempts a
   where a.link_id = p_link and not a.ok and a.at > clock_timestamp() - interval '15 minutes'
     and a.at > coalesce((select max(b.at) from public.guest_link_attempts b where b.link_id = p_link and b.ok), '-infinity');
  if v_wrong >= 5 then
    update public.guest_links set locked_until = now() + interval '15 minutes' where id = p_link;
  end if;
end;
$$;

-- A coach's first name as clients see it: the name they chose to show
-- (coaches), otherwise their profile's, at most 60 characters.
create or replace function public._coach_first_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select left(coalesce(
    (select nullif(btrim(c.display_first_name), '') from public.coaches c where c.user_id = p_user),
    (select nullif(btrim(p.first_name), '') from public.profiles p where p.id = p_user)), 60);
$$;

-- The visit for a key: refused (42501) when unknown, ended, or its link has
-- closed before the email was confirmed. Touches the visit and the guest.
create or replace function public._guest_visit(p_key text)
returns public.guest_visits
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.guest_visits;
  l public.guest_links;
  g public.guests;
begin
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' then
    raise exception 'That visit has ended. Open your link again.' using errcode = '42501';
  end if;
  select * into s from public.guest_visits where key_hash = public._guest_hash(p_key);
  if s.id is null or s.expires_at <= now() then
    raise exception 'That visit has ended. Open your link again.' using errcode = '42501';
  end if;
  select * into g from public.guests where id = s.guest_id;
  if g.claimed_at is not null then
    raise exception 'This work has moved into an account. Sign in to see it.' using errcode = '42501';
  end if;
  if s.link_id is not null and not s.confirmed then
    select * into l from public.guest_links where id = s.link_id;
    if l.switched_off_at is not null or l.expires_at <= now() then
      raise exception 'That link has closed. To see your work, come back with your email.' using errcode = '42501';
    end if;
  end if;
  update public.guest_visits set last_used_at = now() where id = s.id;
  update public.guests set last_visit_at = now() where id = s.guest_id and last_visit_at < now() - interval '1 minute';
  return s;
end;
$$;

-- Can this visit see that guest row? (Confirmed: all the guest's rows;
-- otherwise only what this visit made.)
create or replace function public._guest_sees(s public.guest_visits, p_table text, p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.guest_items i
                 where i.table_name = p_table and i.row_key = p_key and i.guest_id = s.guest_id
                   and (s.confirmed or i.visit_id = s.id));
$$;

-- Forgets items whose rows have gone (deleted, or removed with a parent).
create or replace function public._guest_items_tidy(p_guest uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare t public.guest_tables;
begin
  for t in select * from public._guest_ready_tables() loop
    execute format('delete from public.guest_items i where i.guest_id = $1 and i.table_name = %L
                    and not exists (select 1 from public.%I x where %s = i.row_key)',
                   t.table_name, t.table_name, public._guest_key_sql(t.table_name, 'x'))
      using p_guest;
  end loop;
end;
$$;

do $rv$
declare f text;
begin
  foreach f in array array['_guest_hash(text)', '_guest_random_key()', '_guest_key(text,jsonb)', '_guest_key_sql(text,text)',
                           '_guest_ready_tables()', '_coach_first_name(uuid)', '_guest_email(text)', '_guest_link_wrong(uuid)', '_guest_visit(text)', '_guest_sees(public.guest_visits,text,text)', '_guest_items_tidy(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end
$rv$;

-- ---------------------------------------------------------------- the coach's side
-- Makes a link for a tool. The link and code are returned this once, in
-- plain text, to the coach who made it; only their hashes are kept.
create or replace function public.guest_link_create(p_tool text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- no 0 O 1 I L
  v_tool   public.guest_tools;
  v_token  text := public._guest_random_key();
  v_code   text := '';
  v_byte   integer;
  v_link   public.guest_links;
begin
  if not public.is_coach() then
    raise exception 'Only a coach can make a guest link.' using errcode = '42501';
  end if;
  select * into v_tool from public.guest_tools where tool = p_tool and active;
  if v_tool.tool is null then
    raise exception 'That tool can''t be used with a guest link yet.' using errcode = '22023';
  end if;
  while char_length(v_code) < 6 loop
    v_byte := get_byte(extensions.gen_random_bytes(1), 0);
    if v_byte < 248 then -- 31 * 8: unbiased
      v_code := v_code || substr(v_alphabet, (v_byte % 31) + 1, 1);
    end if;
  end loop;
  insert into public.guest_links (tool, coach_user_id, token_hash, code_hash)
  values (v_tool.tool, (select auth.uid()), public._guest_hash(v_token), extensions.crypt(v_code, extensions.gen_salt('bf')))
  returning * into v_link;
  return jsonb_build_object(
    'link_id', v_link.id,
    'tool', v_tool.tool,
    'tool_label', v_tool.label,
    'link_path', '/guest/' || v_token,
    'code', v_code,
    'expires_at', v_link.expires_at
  );
end;
$$;

create or replace function public.guest_link_switch_off(p_link uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.guest_links set switched_off_at = coalesce(switched_off_at, now())
   where id = p_link and (coach_user_id = (select auth.uid()) or public.is_owner());
  if not found then
    raise exception 'That link isn''t yours.' using errcode = '42501';
  end if;
  return true;
end;
$$;

-- A coach's links, newest first (the owner: everyone's, or one coach's).
-- Paging: pass the last row's created_at and id.
create or replace function public.coach_links(
  p_coach_user uuid default null, p_limit integer default 50,
  p_before_at timestamptz default null, p_before_id uuid default null)
returns table (link_id uuid, tool text, tool_label text, coach_user_id uuid, coach_first_name text, created_at timestamptz, expires_at timestamptz,
               switched_off_at timestamptz, first_used_at timestamptz, finished_at timestamptz, guest_id uuid, guest_email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_scope uuid;
begin
  if not public.is_coach() then
    raise exception 'Only a coach has guest links.' using errcode = '42501';
  end if;
  if public.is_owner() then
    v_scope := p_coach_user;
  elsif p_coach_user is null or p_coach_user = (select auth.uid()) then
    v_scope := (select auth.uid());
  else
    raise exception 'Those links aren''t yours.' using errcode = '42501';
  end if;
  return query
    select l.id, l.tool, t.label, l.coach_user_id, public._coach_first_name(l.coach_user_id), l.created_at, l.expires_at, l.switched_off_at, l.first_used_at, l.finished_at,
           l.guest_id, g.email
    from public.guest_links l
    join public.guest_tools t on t.tool = l.tool
    left join public.guests g on g.id = l.guest_id
    where (v_scope is null or l.coach_user_id = v_scope)
      and (p_before_at is null or (l.created_at, l.id) < (p_before_at, p_before_id))
    order by l.created_at desc, l.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

-- A coach's guests: each guest's email, the links sent, what they finished
-- and when, most recent visit first. Paging: the last row's last_visit_at and id.
create or replace function public.coach_guests(
  p_coach_user uuid default null, p_limit integer default 50,
  p_before_visit timestamptz default null, p_before_id uuid default null)
returns table (guest_id uuid, email text, last_visit_at timestamptz, first_confirmed_at timestamptz,
               claimed boolean, last_invited_at timestamptz, links jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_scope uuid;
begin
  if not public.is_coach() then
    raise exception 'Only a coach has guests.' using errcode = '42501';
  end if;
  if public.is_owner() then
    v_scope := p_coach_user;
  elsif p_coach_user is null or p_coach_user = (select auth.uid()) then
    v_scope := (select auth.uid());
  else
    raise exception 'Those guests aren''t yours.' using errcode = '42501';
  end if;
  return query
    select g.id, g.email, g.last_visit_at, g.first_confirmed_at, g.claimed_at is not null,
           case when v_scope is null or g.last_invited_by = v_scope then g.last_invited_at end,
           (select jsonb_agg(jsonb_build_object('link_id', l.id, 'tool', l.tool, 'tool_label', (select t.label from public.guest_tools t where t.tool = l.tool),
                                                'coach_user_id', l.coach_user_id, 'created_at', l.created_at,
                                                'expires_at', l.expires_at, 'switched_off_at', l.switched_off_at,
                                                'first_used_at', l.first_used_at, 'finished_at', l.finished_at)
                             order by l.created_at desc)
              from public.guest_links l
             where l.guest_id = g.id and (v_scope is null or l.coach_user_id = v_scope))
    from public.guests g
    where exists (select 1 from public.guest_links l where l.guest_id = g.id and (v_scope is null or l.coach_user_id = v_scope))
      and (p_before_visit is null or (g.last_visit_at, g.id) < (p_before_visit, p_before_id))
    order by g.last_visit_at desc, g.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

-- The answers given through one of the coach's own links (for the coach's
-- view and the PDF). Only the coach who made the link: the owner lists
-- everyone's links and guests, but reads only their own guests' answers.
create or replace function public.coach_guest_answers(p_link uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t public.guest_tables;
  v_rows jsonb;
  v_out jsonb := '{}';
begin
  if not public.is_coach() or not exists (select 1 from public.guest_links where id = p_link and coach_user_id = (select auth.uid())) then
    raise exception 'That link isn''t yours.' using errcode = '42501';
  end if;
  for t in select * from public._guest_ready_tables() loop
    execute format('select jsonb_agg(to_jsonb(x) - ''user_id'' - ''guest_id'' order by x.created_at)
                    from public.%I x join public.guest_items i on i.table_name = %L and i.row_key = %s
                    where i.link_id = $1 and x.guest_id = i.guest_id',
                   t.table_name, t.table_name, public._guest_key_sql(t.table_name, 'x'))
      into v_rows using p_link;
    if v_rows is not null then
      v_out := v_out || jsonb_build_object(t.table_name, v_rows);
    end if;
  end loop;
  return v_out;
end;
$$;

-- "Invite to an account": records the invitation and hands back the email
-- for the server to send it. The coach must have sent this guest a link.
create or replace function public.guest_invite(p_guest uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare g public.guests;
begin
  if not public.is_coach() or not exists (select 1 from public.guest_links where guest_id = p_guest and coach_user_id = (select auth.uid())) then
    raise exception 'That guest isn''t yours.' using errcode = '42501';
  end if;
  update public.guests set last_invited_at = now(), last_invited_by = (select auth.uid()) where id = p_guest returning * into g;
  if g.claimed_at is not null then
    return jsonb_build_object('ok', false, 'error', 'has_account');
  end if;
  return jsonb_build_object('ok', true, 'email', g.email);
end;
$$;

-- ---------------------------------------------------------------- the guest's side
-- Opens a link with its token, the guest's email and the code. Five wrong
-- codes lock the link for 15 minutes; the right one resets the count. One
-- answer for every wrong detail. A link is tied to the first email that
-- opens it. Returns a visit key (kept by the page, never stored in plain).
create or replace function public.guest_open(p_token text, p_email text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  bad constant jsonb := jsonb_build_object('ok', false, 'error', 'invalid',
    'message', 'That link, email or code isn''t right. Check them and try again.');
  l public.guest_links;
  g public.guests;
  v_email text := public._guest_email(p_email);
  v_key text := public._guest_random_key();
  v_coach text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return bad;
  end if;
  select * into l from public.guest_links where token_hash = public._guest_hash(p_token) for update;
  if l.id is null then
    return bad;
  end if;
  if l.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'locked',
      'message', 'Too many tries. Wait 15 minutes, then try again.');
  end if;
  if v_email is null or p_code is null
     or l.code_hash <> extensions.crypt(upper(btrim(p_code)), l.code_hash)
     or (l.guest_id is not null and not exists (select 1 from public.guests where id = l.guest_id and email = v_email)) then
    perform public._guest_link_wrong(l.id);
    return bad;
  end if;
  if l.switched_off_at is not null or l.expires_at <= now() then
    insert into public.guest_link_attempts (link_id, ok) values (l.id, true);
    return jsonb_build_object('ok', false, 'error', 'closed',
      'message', 'This link has closed. To see your work, use your email to come back.');
  end if;
  if exists (select 1 from public.guests where email = v_email and claimed_at is not null) then
    -- counted as a wrong try, so a link can't be used to ask about many emails
    perform public._guest_link_wrong(l.id);
    return jsonb_build_object('ok', false, 'error', 'has_account',
      'message', 'This email has an account with The Clarity Portal. Sign in to use the tool there.');
  end if;
  insert into public.guest_link_attempts (link_id, ok) values (l.id, true);
  insert into public.guests (email) values (v_email) on conflict (email) do update set last_visit_at = now() returning * into g;
  update public.guest_links set guest_id = g.id, first_used_at = coalesce(first_used_at, now()) where id = l.id;
  insert into public.guest_visits (key_hash, guest_id, link_id) values (public._guest_hash(v_key), g.id, l.id);
  v_coach := public._coach_first_name(l.coach_user_id);
  return jsonb_build_object('ok', true, 'visit', v_key, 'tool', l.tool,
    'tool_label', (select label from public.guest_tools where tool = l.tool),
    'coach_name', left(v_coach, 60), 'link_expires_at', l.expires_at, 'confirmed', false);
end;
$$;

-- Coming back without a link (or after it has closed): the email only. It
-- always answers the same way, so nobody learns whether an email has work
-- here; a code is emailed only when it does (guest_email_code_issue).
create or replace function public.guest_return_start(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.guests;
  v_key text := public._guest_random_key();
begin
  select * into g from public.guests where email = public._guest_email(p_email) and claimed_at is null;
  -- a visit is kept whether or not the email has work (then it belongs to no
  -- guest and never matches anything), so every answer after this is the same
  if g.id is null or (select count(*) from public.guest_visits s where s.guest_id = g.id and s.link_id is null
                      and s.created_at > now() - interval '1 hour') < 50 then
    insert into public.guest_visits (key_hash, guest_id) values (public._guest_hash(v_key), g.id);
  end if;
  return jsonb_build_object('ok', true, 'visit', v_key, 'confirmed', false);
end;
$$;

-- For the server only: a new 6-digit code for a visit, to email to the
-- guest. At most 5 a visit and 20 an email each hour (so nobody can fill the
-- guest's inbox), and none once an email has had 20 wrong codes in a day (so
-- at most 20 guesses a day at an email's earlier work); a new one replaces
-- the last. The server should also limit how often one caller asks. Nothing for an unknown or already confirmed visit.
create or replace function public.guest_email_code_issue(p_visit text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.guest_visits;
  v_code text;
begin
  if p_visit is null or p_visit !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false);
  end if;
  select * into s from public.guest_visits where key_hash = public._guest_hash(p_visit) and expires_at > now();
  if s.id is null or s.guest_id is null or s.confirmed
     or (select count(*) from public.guest_email_codes c where c.visit_id = s.id and c.created_at > now() - interval '1 hour') >= 5
     or (select count(*) from public.guest_email_codes c where c.guest_id = s.guest_id and c.created_at > now() - interval '1 hour') >= 20
     or (select coalesce(sum(c.tries), 0) from public.guest_email_codes c where c.guest_id = s.guest_id and c.created_at > now() - interval '1 day') >= 20 then
    return jsonb_build_object('ok', false);
  end if;
  v_code := lpad((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint % 1000000)::text, 6, '0');
  update public.guest_email_codes set used_at = now() where visit_id = s.id and used_at is null;
  insert into public.guest_email_codes (guest_id, visit_id, code_hash)
  values (s.guest_id, s.id, extensions.crypt(v_code, extensions.gen_salt('bf')));
  return jsonb_build_object('ok', true, 'email', (select email from public.guests where id = s.guest_id), 'code', v_code);
end;
$$;

-- Confirms the email with the 6-digit code (10 minutes, 5 tries). The visit
-- then sees the guest's earlier work too.
create or replace function public.guest_email_confirm(p_visit text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  bad constant jsonb := jsonb_build_object('ok', false, 'error', 'invalid',
    'message', 'That code isn''t right, or it has run out. Ask for a new one and try again.');
  s public.guest_visits;
  c public.guest_email_codes;
begin
  if p_visit is null or p_visit !~ '^[0-9a-f]{64}$' then
    return bad;
  end if;
  select * into s from public.guest_visits where key_hash = public._guest_hash(p_visit) and expires_at > now();
  if s.id is null then
    return bad;
  end if;
  if s.confirmed then
    return jsonb_build_object('ok', true);
  end if;
  if (select coalesce(sum(x.tries), 0) from public.guest_email_codes x where x.guest_id = s.guest_id and x.created_at > now() - interval '1 day') >= 20 then
    return jsonb_build_object('ok', false, 'error', 'locked',
      'message', 'Too many wrong codes today. Try again tomorrow, or ask your coach for help.');
  end if;
  select * into c from public.guest_email_codes
   where visit_id = s.id and used_at is null and expires_at > now() and tries < 5
   order by created_at desc limit 1 for update;
  if c.id is null then
    return bad;
  end if;
  if p_code is null or btrim(p_code) !~ '^[0-9]{6}$' or c.code_hash <> extensions.crypt(btrim(p_code), c.code_hash) then
    update public.guest_email_codes set tries = tries + 1 where id = c.id;
    return bad;
  end if;
  update public.guest_email_codes set used_at = now() where id = c.id;
  update public.guest_visits set confirmed = true where id = s.id;
  update public.guests set first_confirmed_at = coalesce(first_confirmed_at, now()), last_visit_at = now() where id = s.guest_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- The guest's own rows in one table that this visit may see.
create or replace function public.guest_rows(p_visit text, p_table text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.guest_visits := public._guest_visit(p_visit);
  v_out jsonb;
begin
  if not exists (select 1 from public._guest_ready_tables() where table_name = p_table) then
    raise exception 'That can''t be read here. Go back to the tool and try again.' using errcode = '22023';
  end if;
  -- each row says where it came from (_from: the link, its tool and coach),
  -- so a page can show one tool's or one coach's work
  execute format('select coalesce(jsonb_agg(y.j order by y.created_at), ''[]'')
                  from (select x.created_at,
                               to_jsonb(x) - ''user_id'' - ''guest_id'' || jsonb_build_object(''_from'', jsonb_build_object(
                                 ''link_id'', i.link_id, ''tool'', l.tool, ''coach_first_name'', public._coach_first_name(l.coach_user_id))) as j
                        from public.%I x join public.guest_items i on i.table_name = %L and i.row_key = %s
                        left join public.guest_links l on l.id = i.link_id
                        where x.guest_id = $1 and i.guest_id = $1 and ($2 or i.visit_id = $3)
                        order by x.created_at limit 1000) y',
                 p_table, p_table, public._guest_key_sql(p_table, 'x'))
    into v_out using s.guest_id, s.confirmed, s.id;
  return v_out;
end;
$$;

-- The guest's links this visit may see (all of them once the email is
-- confirmed, otherwise this visit's), newest first: "my work" for a guest
-- coming back.
create or replace function public.guest_my_links(p_visit text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with s as (select * from public._guest_visit(p_visit))
  select coalesce(jsonb_agg(jsonb_build_object(
           'link_id', l.id, 'tool', l.tool, 'tool_label', t.label, 'coach_first_name', public._coach_first_name(l.coach_user_id),
           'created_at', l.created_at, 'expires_at', l.expires_at, 'finished_at', l.finished_at,
           'open', l.switched_off_at is null and l.expires_at > now()) order by l.created_at desc), '[]')
  from s join public.guest_links l on l.guest_id = s.guest_id and (s.confirmed or l.id = s.link_id)
  join public.guest_tools t on t.tool = l.tool;
$$;

-- Adds or changes one of the guest's own rows. Only the columns a guest may
-- write are taken; the owner is always the guest. A new top-level row (a
-- plan, a decision) needs a link for its tool; its parents must be the
-- guest's own rows that this visit may see.
create or replace function public.guest_save(p_visit text, p_table text, p_row jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.guest_visits := public._guest_visit(p_visit);
  t public.guest_tables;
  v_tool public.guest_tools;
  v_row jsonb := coalesce(p_row, '{}');
  v_key text;
  v_cols text[];
  v_saved jsonb;
  v_keycond text;
  v_taken boolean;
  v_link uuid;
  v_new boolean := false;
  p jsonb;
begin
  select * into t from public._guest_ready_tables() where table_name = p_table;
  if t.table_name is null or jsonb_typeof(v_row) is distinct from 'object' then
    raise exception 'That can''t be saved here. Go back to the tool and try again.' using errcode = '22023';
  end if;
  if s.link_id is null and not s.confirmed then
    raise exception 'Confirm your email with the code we send to it, then try again.' using errcode = '42501';
  end if;
  if s.link_id is not null then
    select gt.* into v_tool from public.guest_tools gt join public.guest_links l on l.tool = gt.tool where l.id = s.link_id;
  end if;
  select string_agg(format('x.%I = (jsonb_populate_record(null::public.%I, $1)).%I', c, p_table, c), ' and ')
    into v_keycond from unnest(t.key_cols) c;

  v_key := case when (select bool_and(v_row ? c) from unnest(t.key_cols) c) then public._guest_key(p_table, v_row) end;
  if v_key is not null and exists (select 1 from public.guest_items where table_name = p_table and row_key = v_key) then
    -- a change to an existing row
    if not public._guest_sees(s, p_table, v_key) then
      raise exception 'That isn''t yours, so it wasn''t changed. Open your own link to carry on.' using errcode = '42501';
    end if;
    if not t.changeable then
      raise exception 'Plan history can''t be changed. Save a new version instead.' using errcode = '42501';
    end if;
    select array_agg(c) into v_cols from unnest(t.columns) c where v_row ? c and not c = any (t.key_cols);
    if v_cols is not null then
      execute format('update public.%I x set (%s) = (select %s from jsonb_populate_record(null::public.%I, $1) r) where %s and x.guest_id = $2',
                     p_table,
                     (select string_agg(format('%I', c), ', ') from unnest(v_cols) c),
                     (select string_agg(format('r.%I', c), ', ') from unnest(v_cols) c),
                     p_table, v_keycond)
        using v_row, s.guest_id;
    end if;
  else
    -- a new row
    if v_key is not null then
      execute format('select exists (select 1 from public.%I x where %s)', p_table, v_keycond) into v_taken using v_row;
      if v_taken then
        raise exception 'That isn''t yours, so it wasn''t changed. Open your own link to carry on.' using errcode = '42501';
      end if;
    end if;
    if t.top_level and (v_tool.tool is null or not v_tool.tool = any (t.tools)) then
      raise exception 'Starting new work needs the link for this tool. Ask your coach for one.' using errcode = '42501';
    end if;
    if t.top_level and exists (select 1 from public.guest_links l where l.id = s.link_id and (l.switched_off_at is not null or l.expires_at <= now())) then
      raise exception 'This link has closed, so new work can''t start here. Ask your coach for a new link.' using errcode = '42501';
    end if;
    if not t.top_level and s.link_id is not null and not v_tool.tool = any (t.tools) then
      raise exception 'That can''t be saved with this link. Ask your coach for the link for this tool.' using errcode = '42501';
    end if;
    if p_table = 'decisions' then
      v_row := v_row || jsonb_build_object('tool_type', v_tool.decision_type);
    end if;
    -- a new plan on a new link: the guest's earlier plan is kept, archived,
    -- but only one this visit may see; another is left alone
    if p_table = 'performance_plans' then
      update public.performance_plans x set status = 'archived'
       where x.guest_id = s.guest_id and x.status = 'active' and public._guest_sees(s, 'performance_plans', x.id::text);
      if exists (select 1 from public.performance_plans x where x.guest_id = s.guest_id and x.status = 'active') then
        raise exception 'You already have a plan with this email. Confirm your email to see it, then start a new one.' using errcode = '42501';
      end if;
    end if;
    select array_agg(c) into v_cols from unnest(t.columns || t.key_cols || case when p_table = 'decisions' then array['tool_type'] else '{}'::text[] end) c
     where v_row ? c;
    v_cols := array(select distinct unnest(v_cols));
    execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) r returning to_jsonb(%I)',
                   p_table,
                   (select string_agg(format('%I', c), ', ') from unnest(v_cols || array['guest_id']) c),
                   coalesce((select string_agg(format('r.%I', c), ', ') from unnest(v_cols) c) || ', ', '') || '$2',
                   p_table, p_table)
      into v_saved using v_row, s.guest_id;
    v_key := public._guest_key(p_table, v_saved);
    v_new := true;
  end if;

  execute format('select to_jsonb(x) from public.%I x where %s', p_table, public._guest_key_sql(p_table, 'x') || ' = $1')
    into v_saved using v_key;
  -- parents: the guest's own, and ones this visit may see
  for p in select * from jsonb_array_elements(t.parents) loop
    if v_saved ->> (p ->> 'col') is not null
       and not public._guest_sees(s, p ->> 'table', v_saved ->> (p ->> 'col')) then
      raise exception 'That isn''t yours, so it wasn''t saved. Open your own link to carry on.' using errcode = '42501';
    end if;
  end loop;
  if v_new then
    -- a row added when coming back without a link counts under its parent's
    -- link, so the coach sees the whole of what was made through it
    v_link := s.link_id;
    if v_link is null then
      select i.link_id into v_link
      from jsonb_array_elements(t.parents) p2
      join public.guest_items i on i.table_name = p2 ->> 'table' and i.row_key = v_saved ->> (p2 ->> 'col') and i.guest_id = s.guest_id
      where i.link_id is not null
      limit 1;
    end if;
    insert into public.guest_items (table_name, row_key, guest_id, link_id, visit_id)
    values (p_table, v_key, s.guest_id, v_link, s.id);
  end if;
  return v_saved - 'user_id' - 'guest_id';
exception
  -- answers the table can't take (a missing or badly formed value): one plain message
  when integrity_constraint_violation or data_exception then
    if sqlerrm = 'That can''t be saved here. Go back to the tool and try again.' then
      raise; -- our own plain message
    end if;
    raise exception 'Some of that couldn''t be saved as it is. Check it and try again.' using errcode = '22023';
end;
$$;

-- Deletes one of the guest's own rows (and what hangs off it).
create or replace function public.guest_delete(p_visit text, p_table text, p_key jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.guest_visits := public._guest_visit(p_visit);
  v_key text := public._guest_key(p_table, p_key);
begin
  if v_key is null or not public._guest_sees(s, p_table, v_key) then
    raise exception 'That isn''t yours, so it wasn''t changed. Open your own link to carry on.' using errcode = '42501';
  end if;
  if not (select changeable from public.guest_tables where table_name = p_table) then
    raise exception 'Plan history can''t be changed. Save a new version instead.' using errcode = '42501';
  end if;
  execute format('delete from public.%I x where %s = $1 and x.guest_id = $2', p_table, public._guest_key_sql(p_table, 'x'))
    using v_key, s.guest_id;
  perform public._guest_items_tidy(s.guest_id);
  return true;
end;
$$;

-- From the end screen: deletes the guest's answers given through this link
-- (only what this visit may see). Returns how many rows went.
create or replace function public.guest_delete_link_answers(p_visit text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.guest_visits := public._guest_visit(p_visit);
  t public.guest_tables;
  v_before integer;
begin
  if s.link_id is null then
    raise exception 'This can only be done from the link. Open your link and try again.' using errcode = '42501';
  end if;
  select count(*) into v_before from public.guest_items where guest_id = s.guest_id and link_id = s.link_id;
  for t in select * from public._guest_ready_tables() order by claim_order desc loop
    execute format('delete from public.%I x using public.guest_items i
                    where i.table_name = %L and i.row_key = %s and i.guest_id = $1 and x.guest_id = $1
                      and i.link_id = $2 and ($3 or i.visit_id = $4)',
                   t.table_name, t.table_name, public._guest_key_sql(t.table_name, 'x'))
      using s.guest_id, s.link_id, s.confirmed, s.id;
  end loop;
  -- counted after tidying, so rows that went with their parent count too
  perform public._guest_items_tidy(s.guest_id);
  if not exists (select 1 from public.guest_items where link_id = s.link_id) then
    update public.guest_links set finished_at = null where id = s.link_id;
  end if;
  return v_before - (select count(*) from public.guest_items where guest_id = s.guest_id and link_id = s.link_id);
end;
$$;

-- The end screen: marks the link's tool as finished (for the coach's list).
create or replace function public.guest_finish(p_visit text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare s public.guest_visits := public._guest_visit(p_visit);
begin
  if s.link_id is null then
    return false;
  end if;
  update public.guest_links set finished_at = coalesce(finished_at, now()) where id = s.link_id and guest_id = s.guest_id;
  return true;
end;
$$;

-- ---------------------------------------------------------------- claiming
-- Moves every row a guest owns to an account in one go, parents first, and
-- marks the guest claimed. If the account already has an active plan, the
-- guest's comes in archived. Safe to run twice (a claimed guest moves
-- nothing). Internal: guest_claim calls it for the person signed in.
create or replace function public._guest_claim(p_guest uuid, p_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.guests;
  t public.guest_tables;
  n integer;
  total integer := 0;
begin
  select * into g from public.guests where id = p_guest for update;
  if g.id is null or g.claimed_at is not null then
    return 0;
  end if;
  if exists (select 1 from public.performance_plans where user_id = p_user and status = 'active') then
    update public.performance_plans set status = 'archived' where guest_id = p_guest and status = 'active';
  end if;
  for t in select * from public._guest_ready_tables() loop
    execute format('update public.%I set user_id = $1, guest_id = null where guest_id = $2', t.table_name)
      using p_user, p_guest;
    get diagnostics n = row_count;
    total := total + n;
  end loop;
  delete from public.guest_items where guest_id = p_guest;
  -- the visits stay (until they end), so an old one says "Sign in to see it"
  update public.guests set claimed_by = p_user, claimed_at = now() where id = p_guest;
  return total;
end;
$$;
revoke all on function public._guest_claim(uuid, uuid) from public, anon, authenticated;

-- For the person signed in: moves in the guest work of their own email,
-- once the account's email is confirmed. Returns how many rows moved.
create or replace function public.guest_claim()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_guest uuid;
begin
  select lower(btrim(u.email)) into v_email from auth.users u
   where u.id = (select auth.uid()) and u.email_confirmed_at is not null;
  if v_email is null then
    return 0;
  end if;
  select id into v_guest from public.guests where email = v_email and claimed_at is null;
  if v_guest is null then
    return 0;
  end if;
  return public._guest_claim(v_guest, (select auth.uid()));
end;
$$;

-- ---------------------------------------------------------------- Send to client
create or replace function public.suggest_tool(p_client uuid, p_tool text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if not public.is_coach_of(p_client) then
    raise exception 'You can only suggest tools to your own clients.' using errcode = '42501';
  end if;
  if p_tool is null or p_tool !~ '^[a-z][a-z0-9_-]{1,40}$' then
    raise exception 'That isn''t a tool. Choose one from the list and try again.' using errcode = '22023';
  end if;
  -- the same tool suggested again moves the open suggestion to the top
  update public.client_suggestions set suggested_at = now(), opened_at = null
   where coach_user_id = (select auth.uid()) and client_id = p_client and tool = p_tool and dismissed_at is null
  returning id into v_id;
  if v_id is null then
    insert into public.client_suggestions (coach_user_id, client_id, tool) values ((select auth.uid()), p_client, p_tool)
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- The person's open suggestions, newest first, with the coach's first name.
create or replace function public.my_suggestions()
returns table (id uuid, tool text, tool_label text, coach_first_name text, suggested_at timestamptz, opened_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  -- tool_label: the name people see, where the tool is in guest_tools; the
  -- page names the others
  select s.id, s.tool, (select t.label from public.guest_tools t where t.tool = s.tool),
         public._coach_first_name(s.coach_user_id),
         s.suggested_at, s.opened_at
  from public.client_suggestions s
  where s.client_id = (select auth.uid()) and s.dismissed_at is null
    and exists (select 1 from public.coach_clients cc join public.coaches c on c.id = cc.coach_id
                where cc.client_id = s.client_id and c.user_id = s.coach_user_id and cc.ended_at is null and c.active)
  order by s.suggested_at desc
  limit 20;
$$;

create or replace function public.suggestion_opened(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.client_suggestions set opened_at = coalesce(opened_at, now())
   where id = p_id and client_id = (select auth.uid());
  return found;
end;
$$;

create or replace function public.suggestion_dismissed(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.client_suggestions set dismissed_at = coalesce(dismissed_at, now())
   where id = p_id and client_id = (select auth.uid());
  return found;
end;
$$;

-- ---------------------------------------------------------------- keeping and deleting
-- Deletes guests (and everything they own) 2 years after their last visit.
-- A claimed guest's record is kept (it holds no answers, only the coach's
-- history). For the service role (a schedule, set up later) or the owner.
create or replace function public.guest_purge_old()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  -- the server (service role), the owner, or a job run in the database itself (no caller's claims)
  if not (coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
          or (coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = '' and (select auth.uid()) is null)
          or public.is_owner()) then
    raise exception 'Only the owner can do this. Ask them to do it.' using errcode = '42501';
  end if;
  -- unclaimed guests with everything they own; a claimed guest's record
  -- (their email and the coach's history) 2 years after the claim
  delete from public.guests
   where (claimed_at is null and last_visit_at < now() - interval '2 years')
      or claimed_at < now() - interval '2 years';
  get diagnostics n = row_count;
  delete from public.guest_link_attempts where at < now() - interval '2 years';
  delete from public.guest_visits where expires_at < now() - interval '1 day';
  return n;
end;
$$;

-- ---------------------------------------------------------------- who may call what
do $grants$
declare f text;
begin
  foreach f in array array[
    'guest_link_create(text)', 'guest_link_switch_off(uuid)', 'coach_links(uuid,integer,timestamptz,uuid)',
    'coach_guests(uuid,integer,timestamptz,uuid)', 'coach_guest_answers(uuid)', 'guest_invite(uuid)',
    'guest_open(text,text,text)', 'guest_return_start(text)', 'guest_email_code_issue(text)', 'guest_email_confirm(text,text)',
    'guest_rows(text,text)', 'guest_my_links(text)', 'guest_save(text,text,jsonb)', 'guest_delete(text,text,jsonb)', 'guest_delete_link_answers(text)',
    'guest_finish(text)', 'guest_claim()', 'suggest_tool(uuid,text)', 'my_suggestions()', 'suggestion_opened(uuid)',
    'suggestion_dismissed(uuid)', 'guest_purge_old()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
  -- signed in: coaches, clients and accounts
  foreach f in array array[
    'guest_link_create(text)', 'guest_link_switch_off(uuid)', 'coach_links(uuid,integer,timestamptz,uuid)',
    'coach_guests(uuid,integer,timestamptz,uuid)', 'coach_guest_answers(uuid)', 'guest_invite(uuid)', 'guest_claim()',
    'suggest_tool(uuid,text)', 'my_suggestions()', 'suggestion_opened(uuid)', 'suggestion_dismissed(uuid)', 'guest_purge_old()'] loop
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  -- guests (signed out, or signed in as someone else on a shared device)
  foreach f in array array[
    'guest_open(text,text,text)', 'guest_return_start(text)', 'guest_email_confirm(text,text)', 'guest_rows(text,text)', 'guest_my_links(text)',
    'guest_save(text,text,jsonb)', 'guest_delete(text,text,jsonb)', 'guest_delete_link_answers(text)', 'guest_finish(text)'] loop
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
  -- the server only
  execute 'grant execute on function public.guest_email_code_issue(text) to service_role';
  execute 'grant execute on function public.guest_purge_old() to service_role';
end
$grants$;

select public.record_migration(35, '035_guest_links');
