-- =============================================================================
-- 052_coach_crm.sql
-- Phase 6a run 4 (M11 Coach portal, seq 77; Tim, 19 Nov 2026): the data under
-- Leads, the CRM and Network in Clarity Coach.
--
-- THE TABLES, IN SHORT (read this instead of the whole file)
--
--   coach_lead_stages     the pipeline's stages, the owner's own to add,
--     rename and reorder: id, coach_id, name, likelihood int (0 to 100, "Likely
--     to win"), position int, is_won bool (one a coach; always last, 100%).
--     coach_lead_stages_start() makes New 10%, Call booked 25%, Proposal sent
--     50%, Deciding 70% and Won 100% once. A stage with leads in it can't be
--     deleted until they have moved on. A stage's value is the sum of its
--     leads' values; "likely" is that times the likelihood (the app's sum).
--
--   coach_leads (051's table, EXTENDED; never a second leads table)
--     + stage_id (a new lead takes the coach's first stage by itself),
--       organisation text, organisation_id, job_title, phone text,
--       value numeric, currency, next_step text, next_step_on date,
--       next_step_time time, referred_by text, referred_by_person (a Network
--       person), network_person_id (Move to Leads keeps them in Network),
--       last_contact_on date (Quiet is worked out from it: kept by the
--       timeline), the discovery call notes that qualify: want_outcome,
--       want_pain, who_decides, who_funds, decide_when (text each),
--       won_at, won_profile_id (the client Won made), cold_at, cold_reason
--       (what happened), cold_check_on (when to check in again),
--       merged_into (cleared only by lead_unmerge(): a save from a page that
--       still shows the lead, in another tab or on another device, keeps it
--       merged; network_people.merged_into the same, by network_unmerge()).
--     051's source list gains: manual, import, email, network, referral.
--
--   coach_lead_events     the lead timeline: id, coach_id, lead_id,
--     kind (first_contact | referred | booking | call | proposal |
--       proposal_opened | note | email | stage | won | cold | warm | merged |
--       network | check_in),
--     happened_at timestamptz, happened_on date (the coach's own day),
--     title text, detail text, data jsonb (a call's minutes, a proposal's
--     name and amount, the stages moved between, booking_id, email_id).
--     A booking makes its own two lines (First contact, Booked a call). A
--     line of a contact kind moves the lead's last_contact_on forward.
--     Won carries the timeline over by itself: the client's page reads the
--     events of the lead whose won_profile_id is that client.
--   coach_lead_merges     what a merge moved, so Undo can put it back
--     (functions only).
--
--   coach_automations     "when this happens, do that": id, coach_id,
--     trigger (lead_stage | proposal_opened | lead_quiet | call_booked |
--       lead_won | coaching_ended), trigger_stage_id, trigger_count (opened
--       3 times, quiet for 14 days), call_type_key,
--     action (todo | stage: the ONLY two; nothing that sends, tags or emails
--       can be written here at all), todo_title, todo_days (-30 to 365: the
--       day before is -1, 3 days later is 3), to_stage_id, active, position.
--   coach_automation_runs each time one ran: automation_id, coach_id,
--     event_key text (ONE run for each automation and event: the loop guard),
--     lead_id, profile_id, todo_id, ran_at. The app runs automations while
--     the owner's portal is open and claims each event here first.
--
--   coach_boards          your own boards: id, coach_id, name, columns jsonb
--     ([{ id, name, kind: text|number|date|money|choice, options }]), shared
--     bool (with associates; OFF by default), position, archived_at.
--   coach_board_stages    id, board_id, coach_id, name, position.
--   coach_board_items     a card: id, board_id, coach_id, stage_id, title,
--     field_values jsonb ({ column id: value }), notes, position.
--     (A board's saved views are 049's coach_views with list 'board' and the
--     board's id in filters.)
--
--   coach_emails          an email logged to people: id, coach_id, direction
--     (in | out), from_name, from_email, to_people jsonb, cc_people jsonb,
--     subject, snippet (300 characters), sent_at, thread_key, source
--     (copy_in | gmail | manual), external_id (once a coach and source),
--     link (https: "Open in Gmail"), hidden bool ("Hide this thread").
--   coach_email_bodies    email_id, body text: read one at a time, never
--     with the list.
--   coach_email_links     whose timeline it is on: email_id, coach_id,
--     person_kind (lead | client | network | contact), person_id.
--   coach_email_waiting   an email copied to someone not in the portal,
--     waiting on Leads: id, coach_id, email_id, name, email, status (waiting
--     | added: Add as a lead | dismissed: Not now), lead_id, decided_at.
--     One row an address.
--   coach_email_addresses the coach's two addresses' keys: coach_id, kind
--     (log: the copy-in address | todo: forward emails to to-dos), key text.
--     coach_email_addresses_start() makes them once. The server finds the
--     coach by the key.
--
--   client_check_ins      past clients stay warm: id, coach_id, profile_id,
--     months (3 | 6 | 12), due_on, done_at, skipped_at, note, ask (referral
--     | testimonial). One a client and month mark. The client's coach's own.
--
--   The organisation's account map
--     organisation_contacts.roles (049) gains buyer, hr and participant
--     beside sponsor and invoices (Who's who).
--     organisation_deals    Agreements and proposals: id, organisation_id,
--       name, kind (agreement | proposal), status (draft | sent | active |
--       ended | lost), value, currency, per (once | month | year), detail,
--       starts_on, renews_on, opens int, lead_id.
--     organisation_growth   Room to grow: id, organisation_id, kind
--       (workshop | seats | renewal | other), title, note, status (open |
--       raised | won | dropped), lead_id.
--
--   Network
--     network_people        id, coach_id, name, organisation text,
--       organisation_id, role text, email, phone text,
--       influence, trust, value_delivery, what_you_get (each 0 to 10, or
--       empty until rated),
--       focus (WORKED OUT: keep_close | invest | maintain | rebalance, or
--       empty; see THE RULES KEPT HERE),
--       rhythm_months (1 to 24, empty: no rhythm), last_spoke_on date,
--       snoozed_until date ("Not now, in 2 weeks"), added_on date,
--       due_on (WORKED OUT: the later of last spoke plus the rhythm and
--       snoozed_until; never spoken counts from the day they were added),
--       given_count, asked_count (kept from network_gives),
--       own jsonb ({ column id: value } for your own columns),
--       archived_at, keep bool (unticked in "Ready to archive?": never
--       suggested again), profile_id (a client), notes, merged_into.
--       (Move to Leads: the LEAD's network_person_id points here.)
--     network_ratings       a rating's dated history: person_id, coach_id,
--       rating (influence | trust | value_delivery | what_you_get), value,
--       rated_on. One a rating and day, written when a rating changes.
--     network_gives         what you've given and asked: id, person_id,
--       coach_id, direction (gave | asked), kind (gave: idea | resource |
--       introduction | favour | other; asked: introduction | referral |
--       advice | favour | other), note, happened_on.
--     network_columns       your own columns, no limit: id, coach_id, name,
--       kind (text | number | date | choice), options, note (its one line of
--       meaning), position, hidden.
--     network_merges        what a merge moved, for Undo (functions only).
--
--   ADDED TO OLDER TABLES
--     coach_todos.network_person_id, .automation_id, .board_item_id (bare
--     ids, as 050's lead_id is) and .from_email_ref (the forwarded email's
--     own id: one to-do an email); coach_settings.crm jsonb (this run's
--     small settings: hidden Network columns, the archive card's Not now,
--     the leads view, "Suggest check-ins").
--     coach_connections.service (051: google_calendar | zoom) also takes
--     gmail, for the optional Gmail connection. Still the server's alone.
--
-- FUNCTIONS
--   The owner:
--     coach_lead_stages_start()              the five starting stages, once
--     lead_merge(keep, drop, values), lead_unmerge(merge)
--     network_page(search, sort, desc, only, archived, limit, offset, today)
--                                            ONE PAGE of Network (50 at a
--                                            time), searched, sorted and
--                                            narrowed in the database
--     network_map(show, limit, today)        up to 150 people for the map
--     network_counts(today)                  active, archived, due, ready
--     network_archive(ids, keep), network_restore(ids)
--     network_duplicates(rows), network_import(rows)
--     network_merge(keep, drop, values), network_unmerge(merge)
--     coach_email_addresses_start(), coach_email_add(email)
--   The email server (service role only):
--     email_in(key, email)                   the copy-in address logs it on
--                                            the right timelines; the to-do
--                                            address makes a to-do
--
-- WHO SEES WHAT
--   - Lead stages, automations and their runs, boards, emails, the waiting
--     list, the email addresses, the account map and ALL of Network are the
--     OWNER's alone: an associate, a client and someone signed out read
--     none of them.
--   - A board the owner has shared (off by default) can be READ by any
--     active coach: the board, its stages and its cards. Only the owner
--     changes it.
--   - coach_leads keeps 051's rule (each coach's own: a booking on an
--     associate's page still makes that associate's lead), and a lead's
--     timeline follows its lead. The owner never reads an associate's.
--   - A past client's check-ins are their own coach's.
--   - Nothing here sends anything. An automation can only add a to-do or
--     move a stage.
--
-- THE RULES KEPT HERE
--   - Where to focus, checked in this order, once all four ratings are in:
--       keep_close   trust 7 or more and what you get 7 or more
--       invest       influence 7 or more, with trust or value delivery 6
--                    or less
--       maintain     influence, trust and value delivery all 7 or more
--       rebalance    influence 4 or less and what you get 4 or less
--   - Ready to archive: no contact for 18 months (never spoken: since they
--     were added), on no focus list, not archived, and not kept.
--   - Network is never read whole: network_page() gives 50 at a time. The
--     plan: one index for each coach's active people by name and one by
--     due day; search is a filter over the coach's own rows (5,000 people
--     answer in a few milliseconds; the test times it).
--
-- SAFE TO RUN TWICE
--   Yes: tables, columns and indexes are made only when missing; functions,
--   rules and triggers are replaced with the same versions.
--
-- HOW TO RUN
--   After 049, 050 and 051. Then run supabase/052_coach_crm_test.sql, which
--   ends with 052 CHECKS PASSED.
-- =============================================================================

do $need$
begin
  if to_regclass('public.coach_leads') is null or to_regclass('public.coach_todos') is null
     or to_regclass('public.client_profiles') is null or to_regprocedure('public.zone_is_real(text)') is null then
    raise exception '052 needs 049, 050 and 051 first (public.client_profiles, public.coach_todos, public.coach_leads).';
  end if;
end
$need$;

-- ---------------------------------------------------------------- shared bits
-- The signed-in OWNER's coach row (empty for an associate).
create or replace function public.my_owner_coach_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.coaches c where c.user_id = (select auth.uid()) and c.active and c.role = 'owner';
$$;
revoke all on function public.my_owner_coach_id() from public, anon;
grant execute on function public.my_owner_coach_id() to authenticated;

-- A coach's own day (their Settings' time zone; London until it is set).
create or replace function public._coach_today(p_coach uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone coalesce(
    (select s.time_zone from public.coach_settings s where s.coach_id = p_coach and public.zone_is_real(s.time_zone)), 'Europe/London'))::date;
$$;
revoke all on function public._coach_today(uuid) from public, anon, authenticated;

-- A list of people on an email: [{ "name": "...", "email": "..." }], 50 at most.
create or replace function public.coach_email_people_ok(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is not null and jsonb_typeof(p) = 'array' and jsonb_array_length(p) <= 50 and pg_column_size(p) <= 16384
     and not exists (
       select 1 from jsonb_array_elements(p) e
       where jsonb_typeof(e) <> 'object' or jsonb_typeof(e -> 'email') is distinct from 'string'
          or not public.one_email_ok(e ->> 'email') or char_length(coalesce(e ->> 'name', '')) > 120);
$$;

-- A board's own columns: [{ "id": "...", "name": "...", "kind": "text" }], 40 at most.
create or replace function public.coach_board_columns_ok(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is not null and jsonb_typeof(p) = 'array' and jsonb_array_length(p) <= 40 and pg_column_size(p) <= 16384
     and not exists (
       select 1 from jsonb_array_elements(p) e
       where jsonb_typeof(e) <> 'object'
          or char_length(btrim(coalesce(e ->> 'id', ''))) not between 1 and 40
          or char_length(btrim(coalesce(e ->> 'name', ''))) not between 1 and 60
          or coalesce(e ->> 'kind', '') not in ('text', 'number', 'date', 'money', 'choice'));
$$;

-- ---------------------------------------------------------------- lead stages
create table if not exists public.coach_lead_stages (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.coaches (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  likelihood  integer not null default 0 check (likelihood between 0 and 100),
  position    integer not null default 0 check (position between 0 and 1000000),
  is_won      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.coach_lead_stages is
  'The pipeline''s stages (052): the owner''s own to add, rename and reorder, each with how likely a lead in it is to be won. One is Won: always last, 100%, and it makes the lead a client. A stage''s value is the sum of its leads'' values.';
create unique index if not exists coach_lead_stages_one_name on public.coach_lead_stages (coach_id, lower(btrim(name)));
create unique index if not exists coach_lead_stages_one_won on public.coach_lead_stages (coach_id) where is_won;
create index if not exists coach_lead_stages_coach_idx on public.coach_lead_stages (coach_id, position);

-- Won is always last and always 100%; no other stage can sit after it; it can't be deleted on its own.
create or replace function public.coach_lead_stages_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_won and pg_trigger_depth() <= 1 then
      raise exception 'Won is always the last stage, because it makes the lead a client.' using errcode = '23514';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.is_won and not new.is_won then
    raise exception 'Won is always the last stage, because it makes the lead a client.' using errcode = '23514';
  end if;
  if new.is_won then
    new.position := 1000000;
    new.likelihood := 100;
  elsif new.position >= 1000000 then
    new.position := 999999;
  end if;
  return new;
end;
$$;
revoke all on function public.coach_lead_stages_guard() from public, anon, authenticated;
drop trigger if exists coach_lead_stages_guard on public.coach_lead_stages;
create trigger coach_lead_stages_guard before insert or update or delete on public.coach_lead_stages
  for each row execute function public.coach_lead_stages_guard();

-- ---------------------------------------------------------------- Network: people (made before leads point at them)
create table if not exists public.network_people (
  id               uuid primary key default gen_random_uuid(),
  coach_id         uuid not null references public.coaches (id) on delete cascade,
  name             text not null check (char_length(btrim(name)) between 1 and 120),
  organisation     text check (char_length(organisation) <= 120),
  organisation_id  uuid references public.organisations (id) on delete set null,
  role             text check (char_length(role) <= 80),
  email            text check (public.one_email_ok(email)),
  phone            text check (char_length(phone) <= 40),
  influence        smallint check (influence between 0 and 10),
  trust            smallint check (trust between 0 and 10),
  value_delivery   smallint check (value_delivery between 0 and 10),
  what_you_get     smallint check (what_you_get between 0 and 10),
  focus            text generated always as (
    case
      when influence is null or trust is null or value_delivery is null or what_you_get is null then null
      when trust >= 7 and what_you_get >= 7 then 'keep_close'
      when influence >= 7 and (trust <= 6 or value_delivery <= 6) then 'invest'
      when influence >= 7 and trust >= 7 and value_delivery >= 7 then 'maintain'
      when influence <= 4 and what_you_get <= 4 then 'rebalance'
    end) stored,
  rhythm_months    smallint check (rhythm_months between 1 and 24),
  last_spoke_on    date,
  snoozed_until    date,
  added_on         date not null default current_date,
  due_on           date generated always as (
    case when rhythm_months is null then null
         else greatest((coalesce(last_spoke_on, added_on) + make_interval(months => rhythm_months::integer))::date, snoozed_until)
    end) stored,
  given_count      integer not null default 0 check (given_count >= 0),
  asked_count      integer not null default 0 check (asked_count >= 0),
  own              jsonb not null default '{}'::jsonb check (jsonb_typeof(own) = 'object' and pg_column_size(own) <= 16384),
  archived_at      timestamptz,
  keep             boolean not null default false,
  profile_id       uuid references public.client_profiles (id) on delete set null,
  notes            text check (char_length(notes) <= 6000),
  merged_into      uuid references public.network_people (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (merged_into is null or merged_into <> id)
);
comment on table public.network_people is
  'Network (052): everyone the owner keeps warm. Four ratings 0 to 10 (empty until rated); focus and due_on are worked out by the database so the table can be sorted and narrowed 50 rows at a time; own holds the values of the owner''s own columns; keep means "don''t suggest archiving again". The owner''s alone.';
comment on column public.network_people.focus is
  'Where to focus, checked in this order once all four ratings are in: keep_close (trust and what you get 7 or more), invest (influence 7 or more with trust or value delivery 6 or less), maintain (influence, trust and value delivery 7 or more), rebalance (influence and what you get 4 or less).';
create index if not exists network_people_name_idx on public.network_people (coach_id, lower(name)) where archived_at is null and merged_into is null;
create index if not exists network_people_due_idx on public.network_people (coach_id, due_on) where archived_at is null and merged_into is null;
create index if not exists network_people_spoke_idx on public.network_people (coach_id, last_spoke_on desc) where archived_at is null and merged_into is null;
create index if not exists network_people_archived_idx on public.network_people (coach_id, lower(name)) where archived_at is not null and merged_into is null;
create index if not exists network_people_email_idx on public.network_people (coach_id, lower(email));
create index if not exists network_people_org_idx on public.network_people (organisation_id);
create index if not exists network_people_profile_idx on public.network_people (profile_id);
create index if not exists network_people_merged_idx on public.network_people (merged_into);

create or replace function public.owner_owns_network_person(p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.network_people p where p.id = p_person and p.coach_id = public.my_owner_coach_id());
$$;
revoke all on function public.owner_owns_network_person(uuid) from public, anon;
grant execute on function public.owner_owns_network_person(uuid) to authenticated;

create table if not exists public.network_ratings (
  person_id   uuid not null references public.network_people (id) on delete cascade,
  coach_id    uuid not null references public.coaches (id) on delete cascade,
  rating      text not null check (rating in ('influence', 'trust', 'value_delivery', 'what_you_get')),
  rated_on    date not null default current_date,
  value       smallint check (value between 0 and 10),
  created_at  timestamptz not null default now(),
  primary key (person_id, rating, rated_on)
);
comment on table public.network_ratings is 'A Network rating''s dated history: one value a rating and day, written by itself whenever the rating changes (the day''s last value stands).';
create index if not exists network_ratings_coach_idx on public.network_ratings (coach_id);

create table if not exists public.network_gives (
  id           uuid primary key default gen_random_uuid(),
  person_id    uuid not null references public.network_people (id) on delete cascade,
  coach_id     uuid not null references public.coaches (id) on delete cascade,
  direction    text not null check (direction in ('gave', 'asked')),
  kind         text not null,
  note         text check (char_length(note) <= 600),
  happened_on  date not null default current_date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check ((direction = 'gave' and kind in ('idea', 'resource', 'introduction', 'favour', 'other'))
      or (direction = 'asked' and kind in ('introduction', 'referral', 'advice', 'favour', 'other')))
);
comment on table public.network_gives is
  'What the owner has given a Network person (an idea, an article or resource, an introduction, a favour, something else) and what they have asked (an introduction, a referral, advice, a favour, something else). The person''s given_count and asked_count are kept from these.';
create index if not exists network_gives_person_idx on public.network_gives (person_id, happened_on desc);
create index if not exists network_gives_coach_idx on public.network_gives (coach_id);

create table if not exists public.network_columns (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.coaches (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  kind        text not null default 'text' check (kind in ('text', 'number', 'date', 'choice')),
  options     jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array' and pg_column_size(options) <= 8192),
  note        text check (char_length(note) <= 120),
  position    integer not null default 0,
  hidden      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.network_columns is 'The owner''s own Network columns, with no limit on how many. A person''s value for one is in network_people.own under the column''s id.';
create unique index if not exists network_columns_one_name on public.network_columns (coach_id, lower(btrim(name)));

create table if not exists public.network_merges (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.coaches (id) on delete cascade,
  kept_id     uuid not null references public.network_people (id) on delete cascade,
  dropped_id  uuid not null references public.network_people (id) on delete cascade,
  before      jsonb not null,
  moved       jsonb not null,
  merged_at   timestamptz not null default now(),
  undone_at   timestamptz
);
create index if not exists network_merges_coach_idx on public.network_merges (coach_id, merged_at desc);
create index if not exists network_merges_kept_idx on public.network_merges (kept_id);
create index if not exists network_merges_dropped_idx on public.network_merges (dropped_id);

-- A rating that changes writes its own dated history (one value a rating and day).
create or replace function public.network_people_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := public._coach_today(new.coach_id);
begin
  if tg_op = 'INSERT' or new.influence is distinct from old.influence then
    if tg_op = 'UPDATE' or new.influence is not null then
      insert into public.network_ratings (person_id, coach_id, rating, rated_on, value) values (new.id, new.coach_id, 'influence', v_day, new.influence)
      on conflict (person_id, rating, rated_on) do update set value = excluded.value;
    end if;
  end if;
  if tg_op = 'INSERT' or new.trust is distinct from old.trust then
    if tg_op = 'UPDATE' or new.trust is not null then
      insert into public.network_ratings (person_id, coach_id, rating, rated_on, value) values (new.id, new.coach_id, 'trust', v_day, new.trust)
      on conflict (person_id, rating, rated_on) do update set value = excluded.value;
    end if;
  end if;
  if tg_op = 'INSERT' or new.value_delivery is distinct from old.value_delivery then
    if tg_op = 'UPDATE' or new.value_delivery is not null then
      insert into public.network_ratings (person_id, coach_id, rating, rated_on, value) values (new.id, new.coach_id, 'value_delivery', v_day, new.value_delivery)
      on conflict (person_id, rating, rated_on) do update set value = excluded.value;
    end if;
  end if;
  if tg_op = 'INSERT' or new.what_you_get is distinct from old.what_you_get then
    if tg_op = 'UPDATE' or new.what_you_get is not null then
      insert into public.network_ratings (person_id, coach_id, rating, rated_on, value) values (new.id, new.coach_id, 'what_you_get', v_day, new.what_you_get)
      on conflict (person_id, rating, rated_on) do update set value = excluded.value;
    end if;
  end if;
  return null;
end;
$$;
revoke all on function public.network_people_history() from public, anon, authenticated;
drop trigger if exists network_people_history on public.network_people;
create trigger network_people_history after insert or update of influence, trust, value_delivery, what_you_get on public.network_people
  for each row execute function public.network_people_history();

-- given_count and asked_count are kept from the gives themselves.
create or replace function public._network_recount(p_person uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('clarity.network_count', 'on', true);
  update public.network_people p set
    given_count = (select count(*) from public.network_gives g where g.person_id = p.id and g.direction = 'gave'),
    asked_count = (select count(*) from public.network_gives g where g.person_id = p.id and g.direction = 'asked')
  where p.id = p_person;
  perform set_config('clarity.network_count', '', true);
end;
$$;
revoke all on function public._network_recount(uuid) from public, anon, authenticated;

create or replace function public.network_gives_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then perform public._network_recount(old.person_id); end if;
  if tg_op in ('INSERT', 'UPDATE') then perform public._network_recount(new.person_id); end if;
  return null;
end;
$$;
revoke all on function public.network_gives_count() from public, anon, authenticated;
drop trigger if exists network_gives_count on public.network_gives;
create trigger network_gives_count after insert or update or delete on public.network_gives
  for each row execute function public.network_gives_count();

-- The counts and the worked-out columns are the database's: a save can't set the counts.
create or replace function public.network_people_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('clarity.network_count', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.given_count := 0;
    new.asked_count := 0;
  else
    new.given_count := old.given_count;
    new.asked_count := old.asked_count;
    new.coach_id := old.coach_id;
    -- A merge is undone only by network_unmerge(): a save from a page that still shows the person (another tab, another
    -- device) keeps them merged.
    if old.merged_into is not null and new.merged_into is null and coalesce(current_setting('clarity.unmerge', true), '') <> 'on' then
      new.merged_into := old.merged_into;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.network_people_guard() from public, anon, authenticated;
drop trigger if exists network_people_guard on public.network_people;
create trigger network_people_guard before insert or update on public.network_people
  for each row execute function public.network_people_guard();

-- ---------------------------------------------------------------- leads, extended (051's table)
alter table public.coach_leads add column if not exists stage_id uuid references public.coach_lead_stages (id) on delete restrict;
alter table public.coach_leads add column if not exists organisation text;
alter table public.coach_leads add column if not exists organisation_id uuid references public.organisations (id) on delete set null;
alter table public.coach_leads add column if not exists job_title text;
alter table public.coach_leads add column if not exists phone text;
alter table public.coach_leads add column if not exists value numeric(12, 2);
alter table public.coach_leads add column if not exists currency text not null default 'GBP';
alter table public.coach_leads add column if not exists next_step text;
alter table public.coach_leads add column if not exists next_step_on date;
alter table public.coach_leads add column if not exists next_step_time time;
alter table public.coach_leads add column if not exists referred_by text;
alter table public.coach_leads add column if not exists referred_by_person uuid references public.network_people (id) on delete set null;
alter table public.coach_leads add column if not exists network_person_id uuid references public.network_people (id) on delete set null;
alter table public.coach_leads add column if not exists last_contact_on date;
alter table public.coach_leads add column if not exists want_outcome text;
alter table public.coach_leads add column if not exists want_pain text;
alter table public.coach_leads add column if not exists who_decides text;
alter table public.coach_leads add column if not exists who_funds text;
alter table public.coach_leads add column if not exists decide_when text;
alter table public.coach_leads add column if not exists won_at timestamptz;
alter table public.coach_leads add column if not exists won_profile_id uuid references public.client_profiles (id) on delete set null;
alter table public.coach_leads add column if not exists cold_at timestamptz;
alter table public.coach_leads add column if not exists cold_reason text;
alter table public.coach_leads add column if not exists cold_check_on date;
alter table public.coach_leads add column if not exists merged_into uuid references public.coach_leads (id) on delete set null;
do $c$
begin
  -- 051's list of where a lead came from, with the CRM's own ways added.
  alter table public.coach_leads drop constraint if exists coach_leads_source_check;
  if not exists (select 1 from pg_constraint where conname = 'coach_leads_source_ok') then
    alter table public.coach_leads add constraint coach_leads_source_ok check (source in (
      'chemistry_page', 'connection_page', 'booking_page', 'single_use_link', 'other', 'manual', 'import', 'email', 'network', 'referral'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'coach_leads_crm_lengths') then
    alter table public.coach_leads add constraint coach_leads_crm_lengths check (
      char_length(organisation) <= 120 and char_length(job_title) <= 120 and char_length(phone) <= 40
      and char_length(next_step) <= 200 and char_length(referred_by) <= 120 and char_length(cold_reason) <= 600
      and char_length(want_outcome) <= 600 and char_length(want_pain) <= 600 and char_length(who_decides) <= 300
      and char_length(who_funds) <= 300 and char_length(decide_when) <= 300) not valid;
    alter table public.coach_leads validate constraint coach_leads_crm_lengths;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'coach_leads_value_ok') then
    alter table public.coach_leads add constraint coach_leads_value_ok check ((value is null or value between 0 and 100000000) and currency ~ '^[A-Z]{3}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'coach_leads_won_or_cold') then
    alter table public.coach_leads add constraint coach_leads_won_or_cold check (
      (won_at is null or cold_at is null) and (next_step_time is null or next_step_on is not null)
      and (merged_into is null or merged_into <> id));
  end if;
end
$c$;
comment on column public.coach_leads.last_contact_on is 'The last day there was contact (a call, an email, a booking, a proposal sent). Kept forward by the timeline; "Quiet for 19 days" is worked out from it.';
comment on column public.coach_leads.want_outcome is 'Discovery call notes that qualify: the outcome they want. With want_pain (what''s in the way), who_decides, who_funds and decide_when. The card says how ready they are in words, never as a score.';
create index if not exists coach_leads_stage_idx on public.coach_leads (stage_id);
create index if not exists coach_leads_org_idx on public.coach_leads (organisation_id);
create index if not exists coach_leads_referred_idx on public.coach_leads (referred_by_person);
create index if not exists coach_leads_network_idx on public.coach_leads (network_person_id);
create index if not exists coach_leads_won_profile_idx on public.coach_leads (won_profile_id);
create index if not exists coach_leads_merged_idx on public.coach_leads (merged_into);

-- A new lead takes its coach's first stage; what a lead points at is its own coach's.
create or replace function public.coach_leads_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.stage_id is null then
    select s.id into new.stage_id from public.coach_lead_stages s where s.coach_id = new.coach_id order by s.position, s.created_at limit 1;
  end if;
  if tg_op = 'UPDATE' then new.coach_id := old.coach_id; end if;
  -- A merge is undone only by lead_unmerge(): a save from a page that still shows the lead merged away (another tab,
  -- another device) keeps it merged, so its timeline never ends up on two leads.
  if tg_op = 'UPDATE' and old.merged_into is not null and new.merged_into is null and coalesce(current_setting('clarity.unmerge', true), '') <> 'on' then
    new.merged_into := old.merged_into;
  end if;
  if new.stage_id is not null and (tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id)
     and not exists (select 1 from public.coach_lead_stages s where s.id = new.stage_id and s.coach_id = new.coach_id) then
    raise exception 'That stage isn''t one of yours.' using errcode = '23514';
  end if;
  if new.won_profile_id is not null and (tg_op = 'INSERT' or new.won_profile_id is distinct from old.won_profile_id)
     and not exists (select 1 from public.client_profiles p where p.id = new.won_profile_id and p.coach_id = new.coach_id) then
    raise exception 'That client isn''t yours.' using errcode = '23514';
  end if;
  if (new.network_person_id is not null and (tg_op = 'INSERT' or new.network_person_id is distinct from old.network_person_id)
      and not exists (select 1 from public.network_people n where n.id = new.network_person_id and n.coach_id = new.coach_id))
     or (new.referred_by_person is not null and (tg_op = 'INSERT' or new.referred_by_person is distinct from old.referred_by_person)
      and not exists (select 1 from public.network_people n where n.id = new.referred_by_person and n.coach_id = new.coach_id)) then
    raise exception 'That person isn''t in your Network.' using errcode = '23514';
  end if;
  if new.merged_into is not null and (tg_op = 'INSERT' or new.merged_into is distinct from old.merged_into)
     and not exists (select 1 from public.coach_leads l where l.id = new.merged_into and l.coach_id = new.coach_id) then
    raise exception 'That lead isn''t yours.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.coach_leads_guard() from public, anon, authenticated;
drop trigger if exists coach_leads_guard on public.coach_leads;
create trigger coach_leads_guard before insert or update on public.coach_leads
  for each row execute function public.coach_leads_guard();

create or replace function public.coach_owns_lead(p_lead uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.coach_leads l where l.id = p_lead and l.coach_id = public.my_coach_id());
$$;
revoke all on function public.coach_owns_lead(uuid) from public, anon;
grant execute on function public.coach_owns_lead(uuid) to authenticated;

-- ---------------------------------------------------------------- the lead timeline
create table if not exists public.coach_lead_events (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid not null references public.coaches (id) on delete cascade,
  lead_id      uuid not null references public.coach_leads (id) on delete cascade,
  kind         text not null check (kind in ('first_contact', 'referred', 'booking', 'call', 'proposal', 'proposal_opened', 'note',
                                             'email', 'stage', 'won', 'cold', 'warm', 'merged', 'network', 'check_in')),
  happened_at  timestamptz not null default now(),
  happened_on  date,
  title        text check (char_length(title) <= 300),
  detail       text check (char_length(detail) <= 4000),
  data         jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 8192),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.coach_lead_events is
  'The lead timeline (052): bookings, calls, proposals and their opens, notes, emails, stage moves, won and cold. A booking writes its own lines; everything else is written by the app. A line of a contact kind (first_contact, booking, call, proposal, email) moves the lead''s last_contact_on forward. After Won, the client''s page reads these through coach_leads.won_profile_id.';
create index if not exists coach_lead_events_lead_idx on public.coach_lead_events (lead_id, happened_at desc);
create index if not exists coach_lead_events_coach_idx on public.coach_lead_events (coach_id, happened_at desc);

create or replace function public.coach_lead_events_contact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind in ('first_contact', 'booking', 'call', 'proposal', 'email') then
    update public.coach_leads l set last_contact_on = coalesce(new.happened_on, public._coach_today(new.coach_id))
    where l.id = new.lead_id and (l.last_contact_on is null or l.last_contact_on < coalesce(new.happened_on, public._coach_today(new.coach_id)));
  end if;
  return null;
end;
$$;
revoke all on function public.coach_lead_events_contact() from public, anon, authenticated;
drop trigger if exists coach_lead_events_contact on public.coach_lead_events;
create trigger coach_lead_events_contact after insert on public.coach_lead_events
  for each row execute function public.coach_lead_events_contact();

-- A booking writes its lead's first lines by itself (nobody's portal is open when a guest books).
create or replace function public.coach_leads_booked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date;
begin
  if coalesce(current_setting('clarity.booking', true), '') <> 'on' or new.booking_id is null then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.booking_id is not distinct from old.booking_id then
    return null;
  end if;
  v_day := public._coach_today(new.coach_id);
  if tg_op = 'INSERT' then
    insert into public.coach_lead_events (coach_id, lead_id, kind, happened_at, happened_on, data)
    values (new.coach_id, new.id, 'first_contact', now() - interval '1 second', v_day, jsonb_build_object('source', new.source));
  end if;
  insert into public.coach_lead_events (coach_id, lead_id, kind, happened_at, happened_on, data)
  values (new.coach_id, new.id, 'booking', now(), v_day,
          jsonb_build_object('booking_id', new.booking_id, 'call_type_key', new.call_type_key, 'source', new.source));
  return null;
end;
$$;
revoke all on function public.coach_leads_booked() from public, anon, authenticated;
drop trigger if exists coach_leads_booked on public.coach_leads;
create trigger coach_leads_booked after insert or update of booking_id on public.coach_leads
  for each row execute function public.coach_leads_booked();

create table if not exists public.coach_lead_merges (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.coaches (id) on delete cascade,
  kept_id     uuid not null references public.coach_leads (id) on delete cascade,
  dropped_id  uuid not null references public.coach_leads (id) on delete cascade,
  before      jsonb not null,
  moved       jsonb not null,
  merged_at   timestamptz not null default now(),
  undone_at   timestamptz
);
create index if not exists coach_lead_merges_coach_idx on public.coach_lead_merges (coach_id, merged_at desc);
create index if not exists coach_lead_merges_kept_idx on public.coach_lead_merges (kept_id);
create index if not exists coach_lead_merges_dropped_idx on public.coach_lead_merges (dropped_id);

-- ---------------------------------------------------------------- automations
create table if not exists public.coach_automations (
  id                uuid primary key default gen_random_uuid(),
  coach_id          uuid not null references public.coaches (id) on delete cascade,
  trigger           text not null check (trigger in ('lead_stage', 'proposal_opened', 'lead_quiet', 'call_booked', 'lead_won', 'coaching_ended')),
  trigger_stage_id  uuid references public.coach_lead_stages (id) on delete cascade,
  trigger_count     integer check (trigger_count between 1 and 365),
  call_type_key     text check (char_length(call_type_key) <= 40),
  action            text not null check (action in ('todo', 'stage')),
  todo_title        text check (char_length(btrim(todo_title)) between 1 and 300),
  todo_days         integer check (todo_days between -30 and 365),
  to_stage_id       uuid references public.coach_lead_stages (id) on delete cascade,
  active            boolean not null default true,
  position          integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check ((action = 'todo' and todo_title is not null and to_stage_id is null)
      or (action = 'stage' and to_stage_id is not null and todo_title is null and todo_days is null)),
  check ((trigger = 'lead_stage') = (trigger_stage_id is not null)),
  check (not (action = 'stage' and trigger = 'lead_stage' and to_stage_id = trigger_stage_id))
);
comment on table public.coach_automations is
  '"When this happens, do that" (052). The action is ''todo'' (add a to-do, todo_days after: -1 is the day before) or ''stage'' (move the lead to a stage): the ONLY two. Nothing that sends, emails, tags or messages can be written in this table. The app runs them while the owner''s portal is open; coach_automation_runs holds one run for each automation and event.';
create index if not exists coach_automations_coach_idx on public.coach_automations (coach_id, position);
create index if not exists coach_automations_stage_idx on public.coach_automations (trigger_stage_id);
create index if not exists coach_automations_to_stage_idx on public.coach_automations (to_stage_id);

-- An automation's stages are its own coach's.
create or replace function public.coach_automations_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then new.coach_id := old.coach_id; end if;
  if (new.trigger_stage_id is not null and not exists (select 1 from public.coach_lead_stages s where s.id = new.trigger_stage_id and s.coach_id = new.coach_id))
     or (new.to_stage_id is not null and not exists (select 1 from public.coach_lead_stages s where s.id = new.to_stage_id and s.coach_id = new.coach_id)) then
    raise exception 'That stage isn''t one of yours.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.coach_automations_guard() from public, anon, authenticated;
drop trigger if exists coach_automations_guard on public.coach_automations;
create trigger coach_automations_guard before insert or update on public.coach_automations
  for each row execute function public.coach_automations_guard();

create table if not exists public.coach_automation_runs (
  id             uuid primary key default gen_random_uuid(),
  automation_id  uuid not null references public.coach_automations (id) on delete cascade,
  coach_id       uuid not null references public.coaches (id) on delete cascade,
  event_key      text not null check (char_length(event_key) between 1 and 200),
  lead_id        uuid references public.coach_leads (id) on delete cascade,
  profile_id     uuid references public.client_profiles (id) on delete cascade,
  todo_id        uuid,
  ran_at         timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table public.coach_automation_runs is
  'Each time an automation ran. event_key names the event it ran for ("stage:<lead>:<stage>:<the move>", "booking:<booking>", "quiet:<lead>:<last contact>"): one run for each automation and event, so an event never runs the same automation twice and a chain of stage moves can never loop.';
create unique index if not exists coach_automation_runs_once on public.coach_automation_runs (automation_id, event_key);
create index if not exists coach_automation_runs_coach_idx on public.coach_automation_runs (coach_id, ran_at desc);
create index if not exists coach_automation_runs_lead_idx on public.coach_automation_runs (lead_id);
create index if not exists coach_automation_runs_profile_idx on public.coach_automation_runs (profile_id);

-- ---------------------------------------------------------------- boards
create table if not exists public.coach_boards (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid not null references public.coaches (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 60),
  columns      jsonb not null default '[]'::jsonb check (public.coach_board_columns_ok(columns)),
  shared       boolean not null default false,
  position     integer not null default 0,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.coach_boards is
  'The owner''s own boards for anything (speaking, partners, a book): each with its own columns, stages and cards. shared (off by default) lets every active coach READ the board, its stages and its cards; only the owner changes them.';
create unique index if not exists coach_boards_one_name on public.coach_boards (coach_id, lower(btrim(name))) where archived_at is null;
create index if not exists coach_boards_coach_idx on public.coach_boards (coach_id, position);

create table if not exists public.coach_board_stages (
  id          uuid primary key default gen_random_uuid(),
  board_id    uuid not null references public.coach_boards (id) on delete cascade,
  coach_id    uuid not null references public.coaches (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists coach_board_stages_board_idx on public.coach_board_stages (board_id, position);
create index if not exists coach_board_stages_coach_idx on public.coach_board_stages (coach_id);

create table if not exists public.coach_board_items (
  id            uuid primary key default gen_random_uuid(),
  board_id      uuid not null references public.coach_boards (id) on delete cascade,
  coach_id      uuid not null references public.coaches (id) on delete cascade,
  stage_id      uuid references public.coach_board_stages (id) on delete restrict,
  title         text not null check (char_length(btrim(title)) between 1 and 200),
  field_values  jsonb not null default '{}'::jsonb check (jsonb_typeof(field_values) = 'object' and pg_column_size(field_values) <= 16384),
  notes         text check (char_length(notes) <= 6000),
  position      double precision not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.coach_board_items is 'A card on one of the owner''s boards: its stage, its title and its values for the board''s own columns (field_values: { column id: value }).';
create index if not exists coach_board_items_board_idx on public.coach_board_items (board_id, stage_id, position);
create index if not exists coach_board_items_stage_idx on public.coach_board_items (stage_id);
create index if not exists coach_board_items_coach_idx on public.coach_board_items (coach_id);

create or replace function public.owner_owns_board(p_board uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.coach_boards b where b.id = p_board and b.coach_id = public.my_owner_coach_id());
$$;
revoke all on function public.owner_owns_board(uuid) from public, anon;
grant execute on function public.owner_owns_board(uuid) to authenticated;

-- Is this a board the owner has shared with the coaches (and am I an active coach)?
create or replace function public.board_shared_with_me(p_board uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.my_coach_id() is not null
     and exists (select 1 from public.coach_boards b where b.id = p_board and b.shared and b.archived_at is null);
$$;
revoke all on function public.board_shared_with_me(uuid) from public, anon;
grant execute on function public.board_shared_with_me(uuid) to authenticated;

-- A card's stage is one of its own board's.
create or replace function public.coach_board_items_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then new.coach_id := old.coach_id; new.board_id := old.board_id; end if;
  if new.stage_id is not null and not exists (select 1 from public.coach_board_stages s where s.id = new.stage_id and s.board_id = new.board_id) then
    raise exception 'That stage isn''t on this board.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.coach_board_items_guard() from public, anon, authenticated;
drop trigger if exists coach_board_items_guard on public.coach_board_items;
create trigger coach_board_items_guard before insert or update on public.coach_board_items
  for each row execute function public.coach_board_items_guard();

-- ---------------------------------------------------------------- emails logged to people
create table if not exists public.coach_emails (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid not null references public.coaches (id) on delete cascade,
  direction    text not null default 'out' check (direction in ('in', 'out')),
  from_name    text check (char_length(from_name) <= 120),
  from_email   text check (public.one_email_ok(from_email)),
  to_people    jsonb not null default '[]'::jsonb check (public.coach_email_people_ok(to_people)),
  cc_people    jsonb not null default '[]'::jsonb check (public.coach_email_people_ok(cc_people)),
  subject      text check (char_length(subject) <= 300),
  snippet      text check (char_length(snippet) <= 300),
  sent_at      timestamptz not null default now(),
  thread_key   text check (char_length(thread_key) <= 200),
  source       text not null default 'manual' check (source in ('copy_in', 'gmail', 'manual')),
  external_id  text check (char_length(external_id) <= 300),
  link         text check (link is null or (char_length(link) <= 600 and link ~ '^https://')),
  hidden       boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.coach_emails is
  'An email logged to people''s timelines (052), from the copy-in address or the Gmail connection: one line each (subject and a 300-character snippet; the body is in coach_email_bodies, read one at a time). hidden: "Hide this thread". The owner''s alone: associates never see the inbox.';
create unique index if not exists coach_emails_once on public.coach_emails (coach_id, source, external_id) where external_id is not null;
create index if not exists coach_emails_coach_idx on public.coach_emails (coach_id, sent_at desc);
create index if not exists coach_emails_thread_idx on public.coach_emails (coach_id, thread_key);

create table if not exists public.coach_email_bodies (
  email_id    uuid primary key references public.coach_emails (id) on delete cascade,
  coach_id    uuid not null references public.coaches (id) on delete cascade,
  body        text not null check (char_length(body) <= 100000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists coach_email_bodies_coach_idx on public.coach_email_bodies (coach_id);

create table if not exists public.coach_email_links (
  email_id     uuid not null references public.coach_emails (id) on delete cascade,
  coach_id     uuid not null references public.coaches (id) on delete cascade,
  person_kind  text not null check (person_kind in ('lead', 'client', 'network', 'contact')),
  person_id    uuid not null,
  created_at   timestamptz not null default now(),
  primary key (email_id, person_kind, person_id)
);
comment on table public.coach_email_links is 'Whose timeline an email is on: a lead, a client, a Network person or an organisation''s contact, found by their email address.';
create index if not exists coach_email_links_person_idx on public.coach_email_links (coach_id, person_kind, person_id);

create table if not exists public.coach_email_waiting (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.coaches (id) on delete cascade,
  email_id    uuid references public.coach_emails (id) on delete set null,
  name        text check (char_length(name) <= 120),
  email       text not null check (public.one_email_ok(email)),
  status      text not null default 'waiting' check (status in ('waiting', 'added', 'dismissed')),
  lead_id     uuid references public.coach_leads (id) on delete set null,
  decided_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.coach_email_waiting is
  'An email copied to someone who isn''t in the portal waits on Leads: "Add as a lead" (added, with the lead it made) or "Not now" (dismissed: that address isn''t asked about again). One row an address.';
create unique index if not exists coach_email_waiting_once on public.coach_email_waiting (coach_id, email);
create index if not exists coach_email_waiting_email_idx on public.coach_email_waiting (email_id);
create index if not exists coach_email_waiting_lead_idx on public.coach_email_waiting (lead_id);

create table if not exists public.coach_email_addresses (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.coaches (id) on delete cascade,
  kind        text not null check (kind in ('log', 'todo')),
  key         text not null check (key ~ '^[a-z0-9.]{6,40}$'),
  created_at  timestamptz not null default now(),
  unique (coach_id, kind)
);
comment on table public.coach_email_addresses is
  'The key of each of a coach''s two addresses: ''log'' (the copy-in address: an email copied to it lands on that person''s timeline) and ''todo'' (an email forwarded to it becomes a to-do). The address is <key>@ the portal''s inbound domain, which the server sets. Made once by coach_email_addresses_start(); the server finds the coach by the key.';
create unique index if not exists coach_email_addresses_key on public.coach_email_addresses (key);

-- ---------------------------------------------------------------- past clients stay warm
create table if not exists public.client_check_ins (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.coaches (id) on delete cascade,
  profile_id  uuid not null references public.client_profiles (id) on delete cascade,
  months      integer not null check (months in (3, 6, 12)),
  due_on      date not null,
  done_at     timestamptz,
  skipped_at  timestamptz,
  note        text check (char_length(note) <= 4000),
  ask         text check (ask in ('referral', 'testimonial')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (profile_id, months),
  check (done_at is null or skipped_at is null)
);
comment on table public.client_check_ins is
  'Past clients stay warm (052): a check-in suggested 3, 6 and 12 months after coaching ended, with the note the coach wrote and whether it carries a referral or testimonial ask. The coach chooses each one; nothing sends by itself. The client''s own coach''s.';
create index if not exists client_check_ins_coach_idx on public.client_check_ins (coach_id, due_on) where done_at is null and skipped_at is null;

-- ---------------------------------------------------------------- the organisation's account map
do $c$
begin
  -- Who's who: sponsor and invoices (049), with buyer, HR and participant.
  alter table public.organisation_contacts drop constraint if exists organisation_contacts_roles_check;
  if not exists (select 1 from pg_constraint where conname = 'organisation_contacts_roles_ok') then
    alter table public.organisation_contacts add constraint organisation_contacts_roles_ok
      check (roles <@ array['sponsor', 'invoices', 'buyer', 'hr', 'participant']::text[]);
  end if;
end
$c$;

create table if not exists public.organisation_deals (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations (id) on delete cascade,
  name             text not null check (char_length(btrim(name)) between 1 and 200),
  kind             text not null default 'agreement' check (kind in ('agreement', 'proposal')),
  status           text not null default 'draft' check (status in ('draft', 'sent', 'active', 'ended', 'lost')),
  value            numeric(12, 2) check (value between 0 and 100000000),
  currency         text not null default 'GBP' check (currency ~ '^[A-Z]{3}$'),
  per              text not null default 'once' check (per in ('once', 'month', 'year')),
  detail           text check (char_length(detail) <= 240),
  starts_on        date,
  renews_on        date,
  opens            integer not null default 0 check (opens between 0 and 100000),
  lead_id          uuid references public.coach_leads (id) on delete set null,
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.organisation_deals is
  'The account map''s Agreements and proposals (052): every deal with an organisation, its value (once, a month or a year), its status and when it renews. Phase 6b''s agreements and invoices fill these in; until then the owner keeps them by hand. The owner''s.';
create index if not exists organisation_deals_org_idx on public.organisation_deals (organisation_id, renews_on);
create index if not exists organisation_deals_lead_idx on public.organisation_deals (lead_id);
create index if not exists organisation_deals_created_by_idx on public.organisation_deals (created_by);

create table if not exists public.organisation_growth (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations (id) on delete cascade,
  kind             text not null default 'other' check (kind in ('workshop', 'seats', 'renewal', 'other')),
  title            text not null check (char_length(btrim(title)) between 1 and 200),
  note             text check (char_length(note) <= 600),
  status           text not null default 'open' check (status in ('open', 'raised', 'won', 'dropped')),
  lead_id          uuid references public.coach_leads (id) on delete set null,
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.organisation_growth is 'The account map''s Room to grow (052): team workshops, portal seats, a renewal to plan. "Add to the pipeline" makes a lead and links it. The owner''s.';
create index if not exists organisation_growth_org_idx on public.organisation_growth (organisation_id);
create index if not exists organisation_growth_lead_idx on public.organisation_growth (lead_id);
create index if not exists organisation_growth_created_by_idx on public.organisation_growth (created_by);

-- ---------------------------------------------------------------- added to older tables
-- A to-do's pointers are bare ids, as 050's lead_id is: a to-do can be kept before what it points at has reached the
-- database, and one whose lead or person has gone simply shows no name.
alter table public.coach_todos add column if not exists network_person_id uuid;
alter table public.coach_todos add column if not exists automation_id uuid;
alter table public.coach_todos add column if not exists board_item_id uuid;
alter table public.coach_todos add column if not exists from_email_ref text;
create index if not exists coach_todos_lead_idx on public.coach_todos (lead_id);
create index if not exists coach_todos_network_idx on public.coach_todos (network_person_id);
create index if not exists coach_todos_automation_idx on public.coach_todos (automation_id);
create index if not exists coach_todos_board_item_idx on public.coach_todos (board_item_id);
do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'coach_todos_from_email_ref_len') then
    alter table public.coach_todos add constraint coach_todos_from_email_ref_len check (char_length(from_email_ref) <= 300);
  end if;
end
$c$;
comment on column public.coach_todos.from_email_ref is 'The forwarded email''s own id, so the same email never makes two to-dos.';
create unique index if not exists coach_todos_from_email_once on public.coach_todos (coach_id, from_email_ref) where from_email_ref is not null;

alter table public.coach_settings add column if not exists crm jsonb not null default '{}'::jsonb;
do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'coach_settings_crm_ok') then
    alter table public.coach_settings add constraint coach_settings_crm_ok check (jsonb_typeof(crm) = 'object' and pg_column_size(crm) <= 8192);
  end if;
end
$c$;
comment on column public.coach_settings.crm is 'Run 4''s small settings: hidden Network columns, the archive card''s "Not now", the Leads view, "Suggest check-ins at 3, 6 and 12 months".';

-- A coach's connections (051: Google Calendar and Zoom) also take Gmail, for "Log Gmail with clients and leads". 051's own
-- file is unchanged: its unnamed check is replaced here by a named one. Still the server's alone: no person reads a row.
do $c$
begin
  alter table public.coach_connections drop constraint if exists coach_connections_service_check;
  if not exists (select 1 from pg_constraint where conname = 'coach_connections_service_ok') then
    alter table public.coach_connections add constraint coach_connections_service_ok
      check (service in ('google_calendar', 'zoom', 'gmail'));
  end if;
end
$c$;
comment on table public.coach_connections is
  'A coach''s connection to Google Calendar, Zoom or Gmail (052 adds Gmail). calendars maps work, personal and family to the Google calendars'' ids; secret is the service''s token. The server''s alone (the service role): no person reads a row. coach_connections_mine() tells a coach the status of their own, never the secret.';

-- ---------------------------------------------------------------- updated_at
do $touch$
declare t text;
begin
  foreach t in array array[
    'coach_lead_stages', 'coach_lead_events', 'coach_automations', 'coach_automation_runs', 'coach_boards', 'coach_board_stages',
    'coach_board_items', 'coach_emails', 'coach_email_bodies', 'coach_email_waiting', 'client_check_ins', 'organisation_deals',
    'organisation_growth', 'network_people', 'network_gives', 'network_columns'
  ] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.p1_touch()', t || '_touch', t);
  end loop;
end
$touch$;

-- ---------------------------------------------------------------- row security
do $lock$
declare t text;
begin
  foreach t in array array[
    'coach_lead_stages', 'coach_lead_events', 'coach_lead_merges', 'coach_automations', 'coach_automation_runs', 'coach_boards',
    'coach_board_stages', 'coach_board_items', 'coach_emails', 'coach_email_bodies', 'coach_email_links', 'coach_email_waiting',
    'coach_email_addresses', 'client_check_ins', 'organisation_deals', 'organisation_growth', 'network_people', 'network_ratings',
    'network_gives', 'network_columns', 'network_merges'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
  end loop;
end
$lock$;

create or replace function pg_temp.rule(p_table text, p_name text, p_for text, p_using text, p_check text default null)
returns void
language plpgsql
as $f$
begin
  execute format('drop policy if exists %I on public.%I', p_name, p_table);
  execute format('create policy %I on public.%I for %s to authenticated%s%s', p_name, p_table, p_for,
    case when p_using is null then '' else ' using (' || p_using || ')' end,
    case when p_check is null then '' else ' with check (' || p_check || ')' end);
end
$f$;

do $rules$
declare
  mine text := 'coach_id = (select public.my_coach_id())';
  owner text := 'coach_id = (select public.my_owner_coach_id())';
  t text;
begin
  -- The owner's alone: stages, automations, emails, the waiting list, Network's people and columns.
  foreach t in array array['coach_lead_stages', 'coach_automations', 'coach_emails', 'coach_email_waiting', 'network_people', 'network_columns'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    perform pg_temp.rule(t, 'Owner alone', 'all', owner, owner);
  end loop;

  -- An automation's runs: the owner's, for their own automation.
  grant select, insert, delete on public.coach_automation_runs to authenticated;
  perform pg_temp.rule('coach_automation_runs', 'Owner alone, read', 'select', owner);
  perform pg_temp.rule('coach_automation_runs', 'Owner alone, add', 'insert', null,
    owner || ' and exists (select 1 from public.coach_automations a where a.id = automation_id and a.coach_id = (select public.my_owner_coach_id()))');
  perform pg_temp.rule('coach_automation_runs', 'Owner alone, remove', 'delete', owner);

  -- An email's body and links follow their email.
  grant select, insert, update, delete on public.coach_email_bodies to authenticated;
  perform pg_temp.rule('coach_email_bodies', 'Owner alone', 'all', owner,
    owner || ' and exists (select 1 from public.coach_emails e where e.id = email_id and e.coach_id = (select public.my_owner_coach_id()))');
  grant select, insert, delete on public.coach_email_links to authenticated;
  perform pg_temp.rule('coach_email_links', 'Owner alone, read', 'select', owner);
  perform pg_temp.rule('coach_email_links', 'Owner alone, add', 'insert', null,
    owner || ' and exists (select 1 from public.coach_emails e where e.id = email_id and e.coach_id = (select public.my_owner_coach_id()))');
  perform pg_temp.rule('coach_email_links', 'Owner alone, remove', 'delete', owner);
  -- The two addresses' keys: the owner reads their own; only coach_email_addresses_start() makes them.
  grant select on public.coach_email_addresses to authenticated;
  perform pg_temp.rule('coach_email_addresses', 'Owner alone, read', 'select', owner);

  -- Network's history and gives: the owner's, for their own person.
  grant select, insert, update, delete on public.network_ratings to authenticated;
  perform pg_temp.rule('network_ratings', 'Owner alone', 'all', owner, owner || ' and (select public.owner_owns_network_person(person_id))');
  grant select, insert, update, delete on public.network_gives to authenticated;
  perform pg_temp.rule('network_gives', 'Owner alone', 'all', owner, owner || ' and (select public.owner_owns_network_person(person_id))');

  -- The lead timeline follows its lead (051: each coach's own).
  grant select, insert, update, delete on public.coach_lead_events to authenticated;
  perform pg_temp.rule('coach_lead_events', 'Coach alone', 'all', mine, mine || ' and (select public.coach_owns_lead(lead_id))');

  -- Boards: the owner's; a shared one can be read by any active coach.
  grant select, insert, update, delete on public.coach_boards to authenticated;
  perform pg_temp.rule('coach_boards', 'Owner alone', 'all', owner, owner);
  perform pg_temp.rule('coach_boards', 'Shared: coaches read', 'select', 'shared and archived_at is null and (select public.my_coach_id()) is not null');
  foreach t in array array['coach_board_stages', 'coach_board_items'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    perform pg_temp.rule(t, 'Owner alone', 'all', owner, owner || ' and (select public.owner_owns_board(board_id))');
    perform pg_temp.rule(t, 'Shared: coaches read', 'select', '(select public.board_shared_with_me(board_id))');
  end loop;

  -- A past client's check-ins: their own coach's.
  grant select, insert, update, delete on public.client_check_ins to authenticated;
  perform pg_temp.rule('client_check_ins', 'Coach alone', 'all', mine, mine || ' and (select public.coach_owns_profile(profile_id))');

  -- The account map: the owner's, as 049's contacts and documents are.
  foreach t in array array['organisation_deals', 'organisation_growth'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    perform pg_temp.rule(t, 'Owner only', 'all', '(select public.is_owner())', '(select public.is_owner())');
  end loop;
  -- coach_lead_merges and network_merges: no rule and no grant. Only the merge functions touch them.
end
$rules$;

-- ---------------------------------------------------------------- the starting stages
create or replace function public.coach_lead_stages_start()
returns setof public.coach_lead_stages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach uuid := public.my_owner_coach_id();
  v_first uuid;
begin
  if v_coach is null then
    raise exception 'Only the owner can do this.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('lead_stages:' || v_coach::text));
  if not exists (select 1 from public.coach_lead_stages s where s.coach_id = v_coach) then
    insert into public.coach_lead_stages (coach_id, name, likelihood, position, is_won) values
      (v_coach, 'New', 10, 0, false), (v_coach, 'Call booked', 25, 1, false), (v_coach, 'Proposal sent', 50, 2, false),
      (v_coach, 'Deciding', 70, 3, false), (v_coach, 'Won', 100, 1000000, true);
  end if;
  -- Leads a booking made before the stages were there start in the first one.
  select s.id into v_first from public.coach_lead_stages s where s.coach_id = v_coach order by s.position, s.created_at limit 1;
  update public.coach_leads l set stage_id = v_first where l.coach_id = v_coach and l.stage_id is null;
  return query select * from public.coach_lead_stages s where s.coach_id = v_coach order by s.position, s.created_at;
end;
$$;
revoke all on function public.coach_lead_stages_start() from public, anon;
grant execute on function public.coach_lead_stages_start() to authenticated;

-- ---------------------------------------------------------------- merging two leads, with Undo
create or replace function public.lead_merge(p_keep uuid, p_drop uuid, p_values jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach uuid := public.my_coach_id();
  k public.coach_leads%rowtype;
  d public.coach_leads%rowtype;
  v_moved jsonb := '{}'::jsonb;
  v_ids jsonb;
  v_merge uuid := gen_random_uuid();
begin
  if p_keep = p_drop then
    raise exception 'Choose two different people to merge.' using errcode = '22023';
  end if;
  if v_coach is null or not public.coach_owns_lead(p_keep) or not public.coach_owns_lead(p_drop) then
    raise exception 'Both leads must be yours.' using errcode = '42501';
  end if;
  perform 1 from public.coach_leads where id in (p_keep, p_drop) order by id for update;
  select * into k from public.coach_leads where id = p_keep;
  select * into d from public.coach_leads where id = p_drop;
  if k.merged_into is not null or d.merged_into is not null then
    raise exception 'One of these has already been merged.' using errcode = '22023';
  end if;

  with m as (update public.coach_lead_events set lead_id = p_keep where lead_id = p_drop returning id)
  select coalesce(jsonb_agg(id), '[]'::jsonb) into v_ids from m;
  v_moved := v_moved || jsonb_build_object('events', v_ids);
  with m as (update public.coach_todos set lead_id = p_keep where lead_id = p_drop and coach_id = v_coach returning id)
  select coalesce(jsonb_agg(id), '[]'::jsonb) into v_ids from m;
  v_moved := v_moved || jsonb_build_object('todos', v_ids);
  with m as (update public.coach_bookings set lead_id = p_keep where lead_id = p_drop and coach_id = v_coach returning id)
  select coalesce(jsonb_agg(id), '[]'::jsonb) into v_ids from m;
  v_moved := v_moved || jsonb_build_object('bookings', v_ids);
  with m as (
    update public.coach_email_links l set person_id = p_keep
    where l.person_kind = 'lead' and l.person_id = p_drop and l.coach_id = v_coach
      and not exists (select 1 from public.coach_email_links x where x.email_id = l.email_id and x.person_kind = 'lead' and x.person_id = p_keep)
    returning email_id)
  select coalesce(jsonb_agg(email_id), '[]'::jsonb) into v_ids from m;
  v_moved := v_moved || jsonb_build_object('emails', v_ids);
  with m as (
    update public.coach_tag_links l set item_id = p_keep
    where l.item_kind = 'lead' and l.item_id = p_drop and l.coach_id = v_coach
      and not exists (select 1 from public.coach_tag_links x where x.tag_id = l.tag_id and x.item_kind = 'lead' and x.item_id = p_keep)
    returning tag_id)
  select coalesce(jsonb_agg(tag_id), '[]'::jsonb) into v_ids from m;
  v_moved := v_moved || jsonb_build_object('tags', v_ids);
  with m as (
    update public.coach_field_values fv set item_id = p_keep
    where fv.item_id = p_drop and fv.coach_id = v_coach
      and not exists (select 1 from public.coach_field_values x where x.field_id = fv.field_id and x.item_id = p_keep)
    returning field_id)
  select coalesce(jsonb_agg(field_id), '[]'::jsonb) into v_ids from m;
  v_moved := v_moved || jsonb_build_object('fields', v_ids);

  insert into public.coach_lead_merges (id, coach_id, kept_id, dropped_id, before, moved)
  values (v_merge, v_coach, p_keep, p_drop, jsonb_build_object('keep', to_jsonb(k), 'drop', to_jsonb(d)), v_moved);

  update public.coach_leads set merged_into = p_keep where id = p_drop;
  update public.coach_leads set
    name            = case when p_values ? 'name' then d.name else k.name end,
    email           = case when p_values ? 'email' then d.email else coalesce(k.email, d.email) end,
    phone           = case when p_values ? 'phone' then d.phone else coalesce(k.phone, d.phone) end,
    organisation    = case when p_values ? 'organisation' then d.organisation else coalesce(k.organisation, d.organisation) end,
    organisation_id = case when p_values ? 'organisation' then d.organisation_id else coalesce(k.organisation_id, d.organisation_id) end,
    job_title       = case when p_values ? 'job_title' then d.job_title else coalesce(k.job_title, d.job_title) end,
    notes           = case when p_values ? 'notes' then d.notes else coalesce(k.notes, d.notes) end,
    referred_by     = case when p_values ? 'referred_by' then d.referred_by else coalesce(k.referred_by, d.referred_by) end,
    value           = case when p_values ? 'value' then d.value else coalesce(k.value, d.value) end,
    next_step       = coalesce(k.next_step, d.next_step),
    next_step_on    = case when k.next_step is null then d.next_step_on else k.next_step_on end,
    next_step_time  = case when k.next_step is null then d.next_step_time else k.next_step_time end,
    time_zone       = coalesce(k.time_zone, d.time_zone),
    booking_id      = coalesce(k.booking_id, d.booking_id),
    network_person_id = coalesce(k.network_person_id, d.network_person_id),
    referred_by_person = coalesce(k.referred_by_person, d.referred_by_person),
    want_outcome    = coalesce(k.want_outcome, d.want_outcome),
    want_pain       = coalesce(k.want_pain, d.want_pain),
    who_decides     = coalesce(k.who_decides, d.who_decides),
    who_funds       = coalesce(k.who_funds, d.who_funds),
    decide_when     = coalesce(k.decide_when, d.decide_when),
    last_contact_on = greatest(k.last_contact_on, d.last_contact_on)
  where id = p_keep;
  return v_merge;
end;
$$;
revoke all on function public.lead_merge(uuid, uuid, jsonb) from public, anon;
grant execute on function public.lead_merge(uuid, uuid, jsonb) to authenticated;

create or replace function public.lead_unmerge(p_merge uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach uuid := public.my_coach_id();
  m public.coach_lead_merges%rowtype;
  k jsonb;
begin
  select * into m from public.coach_lead_merges where id = p_merge and coach_id = v_coach and undone_at is null for update;
  if not found then
    raise exception 'That merge can''t be undone any more.' using errcode = '22023';
  end if;
  k := m.before -> 'keep';
  update public.coach_lead_events set lead_id = m.dropped_id where id in (select (jsonb_array_elements_text(m.moved -> 'events'))::uuid);
  update public.coach_todos set lead_id = m.dropped_id where id in (select (jsonb_array_elements_text(m.moved -> 'todos'))::uuid);
  update public.coach_bookings set lead_id = m.dropped_id where id in (select (jsonb_array_elements_text(m.moved -> 'bookings'))::uuid);
  update public.coach_email_links set person_id = m.dropped_id
  where person_kind = 'lead' and person_id = m.kept_id and email_id in (select (jsonb_array_elements_text(m.moved -> 'emails'))::uuid);
  update public.coach_tag_links set item_id = m.dropped_id
  where item_kind = 'lead' and item_id = m.kept_id and tag_id in (select (jsonb_array_elements_text(m.moved -> 'tags'))::uuid);
  update public.coach_field_values set item_id = m.dropped_id
  where item_id = m.kept_id and field_id in (select (jsonb_array_elements_text(m.moved -> 'fields'))::uuid);
  update public.coach_leads set
    name = k ->> 'name', email = k ->> 'email', phone = k ->> 'phone', organisation = k ->> 'organisation',
    organisation_id = (k ->> 'organisation_id')::uuid, job_title = k ->> 'job_title', notes = k ->> 'notes',
    referred_by = k ->> 'referred_by', value = (k ->> 'value')::numeric, next_step = k ->> 'next_step',
    next_step_on = (k ->> 'next_step_on')::date, next_step_time = (k ->> 'next_step_time')::time, time_zone = k ->> 'time_zone',
    booking_id = (k ->> 'booking_id')::uuid, network_person_id = (k ->> 'network_person_id')::uuid,
    referred_by_person = (k ->> 'referred_by_person')::uuid, want_outcome = k ->> 'want_outcome', want_pain = k ->> 'want_pain',
    who_decides = k ->> 'who_decides', who_funds = k ->> 'who_funds', decide_when = k ->> 'decide_when',
    last_contact_on = (k ->> 'last_contact_on')::date
  where id = m.kept_id;
  perform set_config('clarity.unmerge', 'on', true);
  update public.coach_leads set merged_into = null where id = m.dropped_id;
  perform set_config('clarity.unmerge', '', true);
  update public.coach_lead_merges set undone_at = now() where id = p_merge;
end;
$$;
revoke all on function public.lead_unmerge(uuid) from public, anon;
grant execute on function public.lead_unmerge(uuid) to authenticated;

-- ---------------------------------------------------------------- Network, a page at a time
-- ONE page of Network: searched by name or organisation, sorted, and narrowed
-- ("Show only"), all in the database. Never everyone at once.
--   p_sort: name | organisation | role | email | phone | focus | influence |
--     trust | value_delivery | what_you_get | rhythm | last_spoke | due |
--     given | asked | own:<a column's id>
--   p_only: { "focus": ["keep_close", "invest", "maintain", "rebalance",
--     "none"], "role": [...], "organisation": [...], "rhythm": [1, 3, 0 for
--     none], "due": "now" | "coming", "ready": true (ready to archive) }
--   p_today: the owner's own day (the app sends it).
-- Returns { "total": matches, "all": everyone active (or archived), "rows": [...] }.
create or replace function public.network_page(
  p_search text default null, p_sort text default 'name', p_desc boolean default false, p_only jsonb default '{}'::jsonb,
  p_archived boolean default false, p_limit integer default 50, p_offset integer default 0, p_today date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_coach uuid := public.my_owner_coach_id();
  v_today date;
  v_base text;
  v_where text;
  v_q text := lower(btrim(coalesce(p_search, '')));
  v_like text;
  v_order text;
  v_own text;
  v_kind text;
  v_limit integer := greatest(1, least(200, coalesce(p_limit, 50)));
  v_offset integer := greatest(0, least(1000000, coalesce(p_offset, 0)));
  v_only jsonb := case when jsonb_typeof(p_only) = 'object' then p_only else '{}'::jsonb end;
  v_total bigint;
  v_all bigint;
  v_rows jsonb;
begin
  if v_coach is null then
    raise exception 'Only the owner can do this.' using errcode = '42501';
  end if;
  v_today := coalesce(p_today, public._coach_today(v_coach));
  v_base := format('p.coach_id = %L and p.merged_into is null and p.archived_at is %s null', v_coach, case when coalesce(p_archived, false) then 'not' else '' end);
  v_where := v_base;
  if v_q <> '' then
    v_like := '%' || replace(replace(replace(left(v_q, 120), '\', '\\'), '%', '\%'), '_', '\_') || '%';
    v_where := v_where || format(' and (lower(p.name) like %L or lower(coalesce(p.organisation, '''')) like %L)', v_like, v_like);
  end if;
  if jsonb_typeof(v_only -> 'focus') = 'array' and jsonb_array_length(v_only -> 'focus') > 0 then
    v_where := v_where || format(' and coalesce(p.focus, ''none'') = any (%L::text[])',
      (select array_agg(x) from jsonb_array_elements_text(v_only -> 'focus') x));
  end if;
  if jsonb_typeof(v_only -> 'role') = 'array' and jsonb_array_length(v_only -> 'role') > 0 then
    v_where := v_where || format(' and coalesce(p.role, '''') = any (%L::text[])',
      (select array_agg(x) from jsonb_array_elements_text(v_only -> 'role') x));
  end if;
  if jsonb_typeof(v_only -> 'organisation') = 'array' and jsonb_array_length(v_only -> 'organisation') > 0 then
    v_where := v_where || format(' and coalesce(p.organisation, '''') = any (%L::text[])',
      (select array_agg(x) from jsonb_array_elements_text(v_only -> 'organisation') x));
  end if;
  if jsonb_typeof(v_only -> 'rhythm') = 'array' and jsonb_array_length(v_only -> 'rhythm') > 0 then
    v_where := v_where || format(' and coalesce(p.rhythm_months, 0) = any (%L::integer[])',
      (select coalesce(array_agg(x::integer), '{}'::integer[]) from jsonb_array_elements_text(v_only -> 'rhythm') x where x ~ '^[0-9]{1,2}$'));
  end if;
  if v_only ->> 'due' = 'now' then
    v_where := v_where || format(' and p.due_on <= %L::date', v_today);
  elsif v_only ->> 'due' = 'coming' then
    v_where := v_where || format(' and p.due_on > %L::date', v_today);
  end if;
  if v_only ->> 'ready' = 'true' then
    v_where := v_where || format(' and not p.keep and p.focus is null and coalesce(p.last_spoke_on, p.added_on) < (%L::date - interval ''18 months'')::date', v_today);
  end if;

  if left(coalesce(p_sort, ''), 4) = 'own:' then
    v_own := substr(p_sort, 5);
    select c.kind into v_kind from public.network_columns c where c.coach_id = v_coach and c.id::text = v_own;
    if v_kind is null then
      v_order := 'lower(p.name)';
    elsif v_kind = 'number' then
      v_order := format('(case when p.own ->> %L ~ ''^-?[0-9]{1,12}(\.[0-9]{1,6})?$'' then (p.own ->> %L)::numeric end)', v_own, v_own);
    else
      v_order := format('nullif(lower(p.own ->> %L), '''')', v_own);
    end if;
  else
    v_order := case coalesce(p_sort, 'name')
      when 'organisation' then 'nullif(lower(p.organisation), '''')'
      when 'role' then 'nullif(lower(p.role), '''')'
      when 'email' then 'p.email'
      when 'phone' then 'nullif(p.phone, '''')'
      when 'focus' then '(case p.focus when ''keep_close'' then 1 when ''maintain'' then 2 when ''invest'' then 3 when ''rebalance'' then 4 end)'
      when 'influence' then 'p.influence'
      when 'trust' then 'p.trust'
      when 'value_delivery' then 'p.value_delivery'
      when 'what_you_get' then 'p.what_you_get'
      when 'rhythm' then 'p.rhythm_months'
      when 'last_spoke' then 'p.last_spoke_on'
      when 'due' then 'p.due_on'
      when 'given' then 'p.given_count'
      when 'asked' then 'p.asked_count'
      else 'lower(p.name)' end;
  end if;
  v_order := v_order || case when coalesce(p_desc, false) then ' desc' else ' asc' end || ' nulls last, lower(p.name), p.id';

  execute 'select count(*) from public.network_people p where ' || v_base into v_all;
  execute 'select count(*) from public.network_people p where ' || v_where into v_total;
  execute format(
    'select coalesce(jsonb_agg(to_jsonb(x) - ''n'' order by x.n), ''[]''::jsonb) from (
       select p.*, row_number() over (order by %s) as n from public.network_people p where %s order by %s limit %s offset %s) x',
    v_order, v_where, v_order, v_limit, v_offset) into v_rows;
  return jsonb_build_object('total', v_total, 'all', v_all, 'rows', v_rows);
end;
$$;
revoke all on function public.network_page(text, text, boolean, jsonb, boolean, integer, integer, date) from public, anon;
grant execute on function public.network_page(text, text, boolean, jsonb, boolean, integer, integer, date) to authenticated;

-- The map: up to 150 people with a spot (influence and trust both rated).
-- Keep close, Maintain and Invest first, then whoever was spoken to most
-- recently. p_show: everyone | keep_close | maintain | invest | rebalance | none.
-- Returns { "total": everyone active, "placed": with a spot (in this Show), "rows": [...] }.
create or replace function public.network_map(p_show text default 'everyone', p_limit integer default 150, p_today date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_coach uuid := public.my_owner_coach_id();
  v_limit integer := greatest(1, least(500, coalesce(p_limit, 150)));
  v_show text := coalesce(p_show, 'everyone');
  v_total bigint;
  v_placed bigint;
  v_rows jsonb;
begin
  if v_coach is null then
    raise exception 'Only the owner can do this.' using errcode = '42501';
  end if;
  select count(*) into v_total from public.network_people p where p.coach_id = v_coach and p.merged_into is null and p.archived_at is null;
  select count(*) into v_placed from public.network_people p
  where p.coach_id = v_coach and p.merged_into is null and p.archived_at is null and p.influence is not null and p.trust is not null
    and (v_show = 'everyone' or coalesce(p.focus, 'none') = v_show);
  select coalesce(jsonb_agg(to_jsonb(x) - 'n' order by x.n), '[]'::jsonb) into v_rows from (
    select p.id, p.name, p.organisation, p.role, p.focus, p.influence, p.trust, p.value_delivery, p.what_you_get, p.rhythm_months,
           p.last_spoke_on, p.due_on,
           row_number() over (order by (p.focus in ('keep_close', 'maintain', 'invest')) desc nulls last, p.last_spoke_on desc nulls last, lower(p.name), p.id) as n
    from public.network_people p
    where p.coach_id = v_coach and p.merged_into is null and p.archived_at is null and p.influence is not null and p.trust is not null
      and (v_show = 'everyone' or coalesce(p.focus, 'none') = v_show)
    order by (p.focus in ('keep_close', 'maintain', 'invest')) desc nulls last, p.last_spoke_on desc nulls last, lower(p.name), p.id
    limit v_limit) x;
  return jsonb_build_object('total', v_total, 'placed', v_placed, 'rows', v_rows);
end;
$$;
revoke all on function public.network_map(text, integer, date) from public, anon;
grant execute on function public.network_map(text, integer, date) to authenticated;

-- The counts the pages and the menu show: { active, archived, due (a catch-up
-- is due), ready (to archive) }.
create or replace function public.network_counts(p_today date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_coach uuid := public.my_owner_coach_id();
  v_today date;
  v jsonb;
begin
  if v_coach is null then
    raise exception 'Only the owner can do this.' using errcode = '42501';
  end if;
  v_today := coalesce(p_today, public._coach_today(v_coach));
  select jsonb_build_object(
    'active', count(*) filter (where p.archived_at is null),
    'archived', count(*) filter (where p.archived_at is not null),
    'due', count(*) filter (where p.archived_at is null and p.due_on <= v_today),
    'ready', count(*) filter (where p.archived_at is null and not p.keep and p.focus is null
                              and coalesce(p.last_spoke_on, p.added_on) < (v_today - interval '18 months')::date))
  into v from public.network_people p where p.coach_id = v_coach and p.merged_into is null;
  return v;
end;
$$;
revoke all on function public.network_counts(date) from public, anon;
grant execute on function public.network_counts(date) to authenticated;

-- "Archive 33": the ticked people are archived; anyone unticked (p_keep) is
-- kept and never suggested again. Returns how many were archived. Undo is
-- network_restore() with the same ids.
create or replace function public.network_archive(p_ids uuid[], p_keep uuid[] default '{}'::uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach uuid := public.my_owner_coach_id();
  n integer;
begin
  if v_coach is null then
    raise exception 'Only the owner can do this.' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_ids), 0) > 5000 or coalesce(cardinality(p_keep), 0) > 5000 then
    raise exception 'That''s too many at once. Choose fewer and try again.' using errcode = '22023';
  end if;
  update public.network_people p set keep = true where p.coach_id = v_coach and p.id = any (coalesce(p_keep, '{}'::uuid[])) and not p.keep;
  update public.network_people p set archived_at = now()
  where p.coach_id = v_coach and p.id = any (coalesce(p_ids, '{}'::uuid[])) and p.archived_at is null and p.merged_into is null;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.network_archive(uuid[], uuid[]) from public, anon;
grant execute on function public.network_archive(uuid[], uuid[]) to authenticated;

-- Restore (and the Undo of an archive). p_unkeep: people whose "keep" the
-- same Undo takes back.
create or replace function public.network_restore(p_ids uuid[], p_unkeep uuid[] default '{}'::uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach uuid := public.my_owner_coach_id();
  n integer;
begin
  if v_coach is null then
    raise exception 'Only the owner can do this.' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_ids), 0) > 5000 or coalesce(cardinality(p_unkeep), 0) > 5000 then
    raise exception 'That''s too many at once. Choose fewer and try again.' using errcode = '22023';
  end if;
  update public.network_people p set keep = false where p.coach_id = v_coach and p.id = any (coalesce(p_unkeep, '{}'::uuid[])) and p.keep;
  update public.network_people p set archived_at = null
  where p.coach_id = v_coach and p.id = any (coalesce(p_ids, '{}'::uuid[])) and p.archived_at is not null;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.network_restore(uuid[], uuid[]) from public, anon;
grant execute on function public.network_restore(uuid[], uuid[]) to authenticated;

-- Import, step 1: which of these rows may already be in Network (the same
-- email, or the same name whatever its capitals)? Duplicates show first.
-- p_rows: [{ "name": "...", "email": "..." }, ...]. Returns
-- [{ "index": 0, "id": ..., "name": ..., "organisation": ..., "email": ..., "by": "email" | "name", "archived": bool }].
create or replace function public.network_duplicates(p_rows jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_coach uuid := public.my_owner_coach_id();
  v jsonb;
begin
  if v_coach is null then
    raise exception 'Only the owner can do this.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 5000 then
    raise exception 'That''s too many rows at once. Import up to 5,000 at a time.' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('index', r.i - 1, 'id', m.id, 'name', m.name, 'organisation', m.organisation, 'email', m.email,
                                               'by', m.by, 'archived', m.archived) order by r.i), '[]'::jsonb)
  into v
  from jsonb_array_elements(p_rows) with ordinality as r(row, i)
  cross join lateral (
    select p.id, p.name, p.organisation, p.email, p.archived_at is not null as archived,
           case when r.row ->> 'email' is not null and p.email is not null and lower(p.email) = lower(btrim(r.row ->> 'email')) then 'email' else 'name' end as by
    from public.network_people p
    where p.coach_id = v_coach and p.merged_into is null
      and ((nullif(btrim(r.row ->> 'email'), '') is not null and lower(p.email) = lower(btrim(r.row ->> 'email')))
        or (nullif(btrim(r.row ->> 'name'), '') is not null and lower(p.name) = lower(btrim(r.row ->> 'name'))))
    order by (lower(p.email) = lower(btrim(r.row ->> 'email'))) desc nulls last, p.created_at
    limit 1) m;
  return v;
end;
$$;
revoke all on function public.network_duplicates(jsonb) from public, anon;
grant execute on function public.network_duplicates(jsonb) to authenticated;

-- Import, step 2: add everyone in one go (up to 5,000). Each row may carry
-- id, name, organisation, role, email, phone, the four ratings,
-- rhythm_months, last_spoke_on, notes and own. A missing rating is left
-- empty. Returns { "added": n }.
create or replace function public.network_import(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach uuid := public.my_owner_coach_id();
  n integer;
begin
  if v_coach is null then
    raise exception 'Only the owner can do this.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 5000 then
    raise exception 'That''s too many rows at once. Import up to 5,000 at a time.' using errcode = '22023';
  end if;
  insert into public.network_people (id, coach_id, name, organisation, role, email, phone, influence, trust, value_delivery, what_you_get,
                                     rhythm_months, last_spoke_on, notes, own)
  select coalesce(r.id, gen_random_uuid()), v_coach, btrim(r.name), nullif(btrim(r.organisation), ''), nullif(btrim(r.role), ''),
         nullif(lower(btrim(r.email)), ''), nullif(btrim(r.phone), ''), r.influence, r.trust, r.value_delivery, r.what_you_get,
         r.rhythm_months, r.last_spoke_on, nullif(r.notes, ''), coalesce(r.own, '{}'::jsonb)
  from jsonb_to_recordset(p_rows) as r(id uuid, name text, organisation text, role text, email text, phone text, influence smallint,
                                       trust smallint, value_delivery smallint, what_you_get smallint, rhythm_months smallint,
                                       last_spoke_on date, notes text, own jsonb)
  where nullif(btrim(r.name), '') is not null
  on conflict (id) do nothing;
  get diagnostics n = row_count;
  return jsonb_build_object('added', n);
end;
$$;
revoke all on function public.network_import(jsonb) from public, anon;
grant execute on function public.network_import(jsonb) to authenticated;

-- Merge two Network people into one, with Undo. p_values names the fields
-- to keep from the one being merged away.
create or replace function public.network_merge(p_keep uuid, p_drop uuid, p_values jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach uuid := public.my_owner_coach_id();
  k public.network_people%rowtype;
  d public.network_people%rowtype;
  v_moved jsonb := '{}'::jsonb;
  v_ids jsonb;
  v_merge uuid := gen_random_uuid();
begin
  if p_keep = p_drop then
    raise exception 'Choose two different people to merge.' using errcode = '22023';
  end if;
  if v_coach is null or not public.owner_owns_network_person(p_keep) or not public.owner_owns_network_person(p_drop) then
    raise exception 'Both people must be in your Network.' using errcode = '42501';
  end if;
  perform 1 from public.network_people where id in (p_keep, p_drop) order by id for update;
  select * into k from public.network_people where id = p_keep;
  select * into d from public.network_people where id = p_drop;
  if k.merged_into is not null or d.merged_into is not null then
    raise exception 'One of these has already been merged.' using errcode = '22023';
  end if;

  with m as (update public.network_gives set person_id = p_keep where person_id = p_drop returning id)
  select coalesce(jsonb_agg(id), '[]'::jsonb) into v_ids from m;
  v_moved := v_moved || jsonb_build_object('gives', v_ids);
  with m as (update public.coach_todos set network_person_id = p_keep where network_person_id = p_drop and coach_id = v_coach returning id)
  select coalesce(jsonb_agg(id), '[]'::jsonb) into v_ids from m;
  v_moved := v_moved || jsonb_build_object('todos', v_ids);
  with m as (update public.coach_leads set network_person_id = p_keep where network_person_id = p_drop and coach_id = v_coach returning id)
  select coalesce(jsonb_agg(id), '[]'::jsonb) into v_ids from m;
  v_moved := v_moved || jsonb_build_object('leads', v_ids);
  with m as (update public.coach_leads set referred_by_person = p_keep where referred_by_person = p_drop and coach_id = v_coach returning id)
  select coalesce(jsonb_agg(id), '[]'::jsonb) into v_ids from m;
  v_moved := v_moved || jsonb_build_object('referred', v_ids);
  with m as (
    update public.coach_email_links l set person_id = p_keep
    where l.person_kind = 'network' and l.person_id = p_drop and l.coach_id = v_coach
      and not exists (select 1 from public.coach_email_links x where x.email_id = l.email_id and x.person_kind = 'network' and x.person_id = p_keep)
    returning email_id)
  select coalesce(jsonb_agg(email_id), '[]'::jsonb) into v_ids from m;
  v_moved := v_moved || jsonb_build_object('emails', v_ids);

  insert into public.network_merges (id, coach_id, kept_id, dropped_id, before, moved)
  values (v_merge, v_coach, p_keep, p_drop, jsonb_build_object('keep', to_jsonb(k), 'drop', to_jsonb(d)), v_moved);

  update public.network_people set merged_into = p_keep where id = p_drop;
  update public.network_people set
    name            = case when p_values ? 'name' then d.name else k.name end,
    organisation    = case when p_values ? 'organisation' then d.organisation else coalesce(k.organisation, d.organisation) end,
    organisation_id = case when p_values ? 'organisation' then d.organisation_id else coalesce(k.organisation_id, d.organisation_id) end,
    role            = case when p_values ? 'role' then d.role else coalesce(k.role, d.role) end,
    email           = case when p_values ? 'email' then d.email else coalesce(k.email, d.email) end,
    phone           = case when p_values ? 'phone' then d.phone else coalesce(k.phone, d.phone) end,
    notes           = case when p_values ? 'notes' then d.notes else coalesce(k.notes, d.notes) end,
    influence       = coalesce(k.influence, d.influence),
    trust           = coalesce(k.trust, d.trust),
    value_delivery  = coalesce(k.value_delivery, d.value_delivery),
    what_you_get    = coalesce(k.what_you_get, d.what_you_get),
    rhythm_months   = coalesce(k.rhythm_months, d.rhythm_months),
    last_spoke_on   = greatest(k.last_spoke_on, d.last_spoke_on),
    added_on        = least(k.added_on, d.added_on),
    own             = d.own || k.own,
    keep            = k.keep or d.keep,
    profile_id      = coalesce(k.profile_id, d.profile_id)
  where id = p_keep;
  perform public._network_recount(p_keep);
  perform public._network_recount(p_drop);
  return v_merge;
end;
$$;
revoke all on function public.network_merge(uuid, uuid, jsonb) from public, anon;
grant execute on function public.network_merge(uuid, uuid, jsonb) to authenticated;

create or replace function public.network_unmerge(p_merge uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach uuid := public.my_owner_coach_id();
  m public.network_merges%rowtype;
  k jsonb;
begin
  select * into m from public.network_merges where id = p_merge and coach_id = v_coach and undone_at is null for update;
  if not found then
    raise exception 'That merge can''t be undone any more.' using errcode = '22023';
  end if;
  k := m.before -> 'keep';
  update public.network_gives set person_id = m.dropped_id where id in (select (jsonb_array_elements_text(m.moved -> 'gives'))::uuid);
  update public.coach_todos set network_person_id = m.dropped_id where id in (select (jsonb_array_elements_text(m.moved -> 'todos'))::uuid);
  update public.coach_leads set network_person_id = m.dropped_id where id in (select (jsonb_array_elements_text(m.moved -> 'leads'))::uuid);
  update public.coach_leads set referred_by_person = m.dropped_id where id in (select (jsonb_array_elements_text(m.moved -> 'referred'))::uuid);
  update public.coach_email_links set person_id = m.dropped_id
  where person_kind = 'network' and person_id = m.kept_id and email_id in (select (jsonb_array_elements_text(m.moved -> 'emails'))::uuid);
  update public.network_people set
    name = k ->> 'name', organisation = k ->> 'organisation', organisation_id = (k ->> 'organisation_id')::uuid, role = k ->> 'role',
    email = k ->> 'email', phone = k ->> 'phone', notes = k ->> 'notes', influence = (k ->> 'influence')::smallint,
    trust = (k ->> 'trust')::smallint, value_delivery = (k ->> 'value_delivery')::smallint, what_you_get = (k ->> 'what_you_get')::smallint,
    rhythm_months = (k ->> 'rhythm_months')::smallint, last_spoke_on = (k ->> 'last_spoke_on')::date, added_on = (k ->> 'added_on')::date,
    own = coalesce(k -> 'own', '{}'::jsonb), keep = (k ->> 'keep')::boolean, profile_id = (k ->> 'profile_id')::uuid
  where id = m.kept_id;
  perform set_config('clarity.unmerge', 'on', true);
  update public.network_people set merged_into = null where id = m.dropped_id;
  perform set_config('clarity.unmerge', '', true);
  perform public._network_recount(m.kept_id);
  perform public._network_recount(m.dropped_id);
  update public.network_merges set undone_at = now() where id = p_merge;
end;
$$;
revoke all on function public.network_unmerge(uuid) from public, anon;
grant execute on function public.network_unmerge(uuid) to authenticated;

-- ---------------------------------------------------------------- emails logged by themselves
-- The coach's two addresses' keys, made once.
create or replace function public.coach_email_addresses_start()
returns setof public.coach_email_addresses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach uuid := public.my_owner_coach_id();
  v_name text;
  v_kind text;
begin
  if v_coach is null then
    raise exception 'Only the owner can do this.' using errcode = '42501';
  end if;
  select coalesce(nullif(regexp_replace(lower(c.display_first_name), '[^a-z0-9]', '', 'g'), ''), 'coach') into v_name
  from public.coaches c where c.id = v_coach;
  foreach v_kind in array array['log', 'todo'] loop
    insert into public.coach_email_addresses (coach_id, kind, key)
    values (v_coach, v_kind, v_kind || '.' || left(v_name, 20) || '.' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
    on conflict (coach_id, kind) do nothing;
  end loop;
  return query select * from public.coach_email_addresses a where a.coach_id = v_coach order by a.kind;
end;
$$;
revoke all on function public.coach_email_addresses_start() from public, anon;
grant execute on function public.coach_email_addresses_start() to authenticated;

-- Logs one email for a coach: kept once, put on the timeline of everyone it
-- names who is a lead, a client, a Network person or an organisation's
-- contact (found by their address), and anyone it names who isn't in the
-- portal waits on Leads. p_email:
--   { "external_id", "source": copy_in | gmail | manual, "direction": in | out,
--     "from": { "name", "email" }, "to": [{ "name", "email" }], "cc": [...],
--     "subject", "snippet", "body", "sent_at", "thread_key", "link" }
-- Returns { "email_id", "new": bool, "links": n, "waiting": n }.
create or replace function public._email_log(p_coach uuid, p_email jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_source text := case when p_email ->> 'source' in ('copy_in', 'gmail', 'manual') then p_email ->> 'source' else 'manual' end;
  v_direction text := case when p_email ->> 'direction' = 'in' then 'in' else 'out' end;
  v_external text := nullif(left(btrim(coalesce(p_email ->> 'external_id', '')), 300), '');
  v_sent timestamptz;
  v_from text := nullif(lower(btrim(coalesce(p_email #>> '{from,email}', ''))), '');
  v_to jsonb;
  v_cc jsonb;
  v_subject text := nullif(left(btrim(coalesce(p_email ->> 'subject', '')), 300), '');
  v_body text := left(coalesce(p_email ->> 'body', ''), 100000);
  v_snippet text := left(btrim(regexp_replace(coalesce(nullif(p_email ->> 'snippet', ''), p_email ->> 'body', ''), '\s+', ' ', 'g')), 300);
  v_link text := case when p_email ->> 'link' ~ '^https://' and char_length(p_email ->> 'link') <= 600 then p_email ->> 'link' end;
  v_own text[];
  v_links integer := 0;
  v_waiting integer := 0;
  v_day date;
  r record;
  n integer;
begin
  if p_coach is null or jsonb_typeof(p_email) is distinct from 'object' then
    raise exception 'That email can''t be read.' using errcode = '22023';
  end if;
  if v_from is not null and not public.one_email_ok(v_from) then v_from := null; end if;
  begin
    v_sent := coalesce((p_email ->> 'sent_at')::timestamptz, now());
  exception when others then
    v_sent := now();
  end;
  -- Only well-formed addresses are kept, lower-cased, 50 at most each.
  select coalesce(jsonb_agg(jsonb_build_object('name', left(btrim(coalesce(e ->> 'name', '')), 120), 'email', lower(btrim(e ->> 'email')))), '[]'::jsonb) into v_to
  from (select e from jsonb_array_elements(case when jsonb_typeof(p_email -> 'to') = 'array' then p_email -> 'to' else '[]'::jsonb end) e
        where jsonb_typeof(e) = 'object' and public.one_email_ok(lower(btrim(e ->> 'email'))) limit 50) x;
  select coalesce(jsonb_agg(jsonb_build_object('name', left(btrim(coalesce(e ->> 'name', '')), 120), 'email', lower(btrim(e ->> 'email')))), '[]'::jsonb) into v_cc
  from (select e from jsonb_array_elements(case when jsonb_typeof(p_email -> 'cc') = 'array' then p_email -> 'cc' else '[]'::jsonb end) e
        where jsonb_typeof(e) = 'object' and public.one_email_ok(lower(btrim(e ->> 'email'))) limit 50) x;

  if v_external is not null then
    select e.id into v_id from public.coach_emails e where e.coach_id = p_coach and e.source = v_source and e.external_id = v_external;
    if v_id is not null then
      return jsonb_build_object('email_id', v_id, 'new', false, 'links', 0, 'waiting', 0);
    end if;
  end if;
  v_id := gen_random_uuid();
  insert into public.coach_emails (id, coach_id, direction, from_name, from_email, to_people, cc_people, subject, snippet, sent_at, thread_key, source, external_id, link)
  values (v_id, p_coach, v_direction, nullif(left(btrim(coalesce(p_email #>> '{from,name}', '')), 120), ''), v_from, v_to, v_cc, v_subject,
          nullif(v_snippet, ''), v_sent, nullif(left(coalesce(p_email ->> 'thread_key', ''), 200), ''), v_source, v_external, v_link);
  if v_body <> '' then
    insert into public.coach_email_bodies (email_id, coach_id, body) values (v_id, p_coach, v_body);
  end if;

  -- The coach's own addresses, and the copy-in addresses themselves, are nobody's timeline.
  select array_remove(array[lower(c.email), lower(u.email::text)], null) into v_own
  from public.coaches c left join auth.users u on u.id = c.user_id where c.id = p_coach;
  v_day := (v_sent at time zone coalesce(
    (select s.time_zone from public.coach_settings s where s.coach_id = p_coach and public.zone_is_real(s.time_zone)), 'Europe/London'))::date;

  for r in
    select distinct on (a.email) a.email, a.name, a.main
    from (
      select v_from as email, nullif(left(btrim(coalesce(p_email #>> '{from,name}', '')), 120), '') as name, true as main, 0 as o where v_from is not null
      union all select e ->> 'email', nullif(e ->> 'name', ''), true, 1 from jsonb_array_elements(v_to) e
      union all select e ->> 'email', nullif(e ->> 'name', ''), false, 2 from jsonb_array_elements(v_cc) e
    ) a
    where not (a.email = any (coalesce(v_own, '{}'::text[])))
      and not exists (select 1 from public.coach_email_addresses k where k.key = split_part(a.email, '@', 1))
    order by a.email, a.o
  loop
    n := 0;
    insert into public.coach_email_links (email_id, coach_id, person_kind, person_id)
    select v_id, p_coach, 'lead', l.id from public.coach_leads l where l.coach_id = p_coach and l.merged_into is null and lower(l.email) = r.email
    on conflict do nothing;
    get diagnostics n = row_count;
    v_links := v_links + n;
    if n > 0 then
      insert into public.coach_lead_events (coach_id, lead_id, kind, happened_at, happened_on, title, data)
      select p_coach, l.id, 'email', v_sent, v_day, v_subject, jsonb_build_object('email_id', v_id, 'direction', v_direction)
      from public.coach_leads l where l.coach_id = p_coach and l.merged_into is null and lower(l.email) = r.email;
    end if;
    insert into public.coach_email_links (email_id, coach_id, person_kind, person_id)
    select v_id, p_coach, 'client', c.id from public.client_profiles c where c.coach_id = p_coach and c.merged_into is null and lower(c.email) = r.email
    on conflict do nothing;
    get diagnostics n = row_count;
    v_links := v_links + n;
    if n > 0 then
      update public.client_profiles c set last_contact_on = v_day
      where c.coach_id = p_coach and c.merged_into is null and lower(c.email) = r.email and (c.last_contact_on is null or c.last_contact_on < v_day);
    end if;
    insert into public.coach_email_links (email_id, coach_id, person_kind, person_id)
    select v_id, p_coach, 'network', p.id from public.network_people p where p.coach_id = p_coach and p.merged_into is null and lower(p.email) = r.email
    on conflict do nothing;
    get diagnostics n = row_count;
    v_links := v_links + n;
    insert into public.coach_email_links (email_id, coach_id, person_kind, person_id)
    select v_id, p_coach, 'contact', oc.id from public.organisation_contacts oc where lower(oc.email) = r.email
    on conflict do nothing;
    get diagnostics n = row_count;
    v_links := v_links + n;
    -- Someone on the To or From line who isn't in the portal waits on Leads (once an address; "Not now" is remembered).
    if r.main and not exists (
         select 1 from public.coach_leads l where l.coach_id = p_coach and lower(l.email) = r.email
         union all select 1 from public.client_profiles c where c.coach_id = p_coach and lower(c.email) = r.email
         union all select 1 from public.network_people p where p.coach_id = p_coach and lower(p.email) = r.email
         union all select 1 from public.organisation_contacts oc where lower(oc.email) = r.email) then
      insert into public.coach_email_waiting (coach_id, email_id, name, email) values (p_coach, v_id, r.name, r.email)
      on conflict (coach_id, email) do nothing;
      get diagnostics n = row_count;
      v_waiting := v_waiting + n;
    end if;
  end loop;
  return jsonb_build_object('email_id', v_id, 'new', true, 'links', v_links, 'waiting', v_waiting);
end;
$$;
revoke all on function public._email_log(uuid, jsonb) from public, anon, authenticated;

-- The owner logs an email themself (the Gmail connection's sync, with the owner's own sign-in).
create or replace function public.coach_email_add(p_email jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach uuid := public.my_owner_coach_id();
begin
  if v_coach is null then
    raise exception 'Only the owner can do this.' using errcode = '42501';
  end if;
  return public._email_log(v_coach, p_email);
end;
$$;
revoke all on function public.coach_email_add(jsonb) from public, anon;
grant execute on function public.coach_email_add(jsonb) to authenticated;

-- The email server hands in an email that arrived at one of the two
-- addresses (service role only). The copy-in address logs it; the to-do
-- address makes a to-do from it. An unknown key answers { "status": "unknown" }.
create or replace function public.email_in(p_key text, p_email jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.coach_email_addresses%rowtype;
  v_todo uuid;
  v_title text;
  v_sent timestamptz;
  v_ref text := nullif(left(btrim(coalesce(p_email ->> 'external_id', '')), 300), '');
begin
  select * into a from public.coach_email_addresses k where k.key = lower(btrim(coalesce(p_key, '')));
  if not found or not exists (select 1 from public.coaches c where c.id = a.coach_id and c.active) then
    return jsonb_build_object('status', 'unknown');
  end if;
  if jsonb_typeof(p_email) is distinct from 'object' then
    return jsonb_build_object('status', 'unreadable');
  end if;
  if a.kind = 'log' then
    return jsonb_build_object('status', 'logged') || public._email_log(a.coach_id, p_email || jsonb_build_object('source', 'copy_in'));
  end if;
  -- Forwarded to to-dos: once an email (its external id), as a to-do that says where it came from.
  begin
    v_sent := coalesce((p_email ->> 'sent_at')::timestamptz, now());
  exception when others then
    v_sent := now();
  end;
  v_title := left(btrim(regexp_replace(coalesce(nullif(btrim(p_email ->> 'subject'), ''), 'An email from ' || coalesce(nullif(btrim(p_email #>> '{from,name}'), ''), 'someone')), '^((fwd?|fw|re):\s*)+', '', 'i')), 300);
  if v_title = '' then v_title := 'An email'; end if;
  if v_ref is not null then
    select t.id into v_todo from public.coach_todos t where t.coach_id = a.coach_id and t.from_email_ref = v_ref;
    if v_todo is not null then
      return jsonb_build_object('status', 'todo', 'todo_id', v_todo, 'new', false);
    end if;
  end if;
  v_todo := gen_random_uuid();
  insert into public.coach_todos (id, coach_id, title, notes, from_email_ref, from_email_sender, from_email_subject, from_email_at)
  values (v_todo, a.coach_id, v_title,
          nullif(left(btrim(coalesce(nullif(p_email ->> 'snippet', ''), p_email ->> 'body', '')), 4000), ''), v_ref,
          nullif(left(btrim(coalesce(nullif(p_email #>> '{from,name}', ''), p_email #>> '{from,email}', '')), 200), ''),
          nullif(left(btrim(coalesce(p_email ->> 'subject', '')), 300), ''), v_sent);
  return jsonb_build_object('status', 'todo', 'todo_id', v_todo, 'new', true);
end;
$$;
revoke all on function public.email_in(text, jsonb) from public, anon, authenticated;
grant execute on function public.email_in(text, jsonb) to service_role;

-- ---------------------------------------------------------------- record it
do $log$
begin
  if to_regprocedure('public.record_migration(integer,text)') is not null then
    perform public.record_migration(52, '052_coach_crm');
  end if;
end
$log$;
