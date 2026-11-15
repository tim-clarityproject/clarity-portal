-- =============================================================================
-- 044_guest_sharing.sql
-- Guests choose who sees their answers (Tim, 14 Nov, 09:49 and 09:52), and an
-- outside Health Check moves into the account made with its email
--
-- WHAT THIS DOES (plain English)
--   Until now a guest's answers always went to the coach who sent the link
--   (the rule of 27 Oct). Now the guest's eye offers "Only you" or "You and
--   Tim", with You and Tim the default. With Only you the coach gets no
--   completion email and can't open the answers by any route; the guest still
--   gets their own PDF and their own email copy. Every row saved before this
--   reads as shared, as it was.
--
--   A. The outside Health Check (alignment_sessions, 018 to 037)
--      1. alignment_sessions.shared_with_coach (true unless the guest chose
--         Only you), and claimed_at and claimed_decision_id (when the
--         Health Check moved into an account, and which saved item it
--         became; user_id, from 018, says whose account).
--      2. alignment_set_sharing(token, email, code, shared): the guest's
--         choice, checked with the link, email and access code exactly as
--         every other call of theirs (the same lockout).
--      3. alignment_open also returns shared_with_coach, so the eye shows
--         the saved choice.
--      4. alignment_email_check: a finished Health Check whose guest chose
--         Only you answers {ok: false, error: 'private'} before anything is
--         marked as sent, so no email goes to the coach or the owner. If the
--         guest switches back to You and Tim, the email can still go, once.
--         The guest's own "Email my link" (kind 'link') is unchanged.
--      5. alignment_recipients (the email server only) answers 'private'
--         too, so the server never learns a coach's address for it.
--      6. alignment_coach_answers: for Only you, {ok: true, shared: false}
--         with the organisation, email, status and dates, and no answers:
--         the coach sees it finished and can't open it. Otherwise as 036,
--         plus shared: true.
--      7. alignment_claim() (signed in): moves every finished outside
--         Health Check of the account's own confirmed email (exactly equal,
--         trimmed and lower-cased) into the account as one inside version
--         (a decisions row, 'strategic-alignment', in the inside Health
--         Check's shape 2: src/lib/healthCheck/inside.js), once per Health
--         Check. Its team is named from the organisation ("My team" when
--         there is none), and joins the account's team of that name when
--         there is one. The guest's choice moves with it
--         (form_data.shared_with_coach), and from_outside marks it for the
--         team list's one-off tip. Returns how many moved.
--
--   B. Every other guest tool (035's guest links), only where 035 has run
--      8. guest_links.shared_with_coach (true unless the guest chose Only
--         you): one link is one guest's piece of work for one coach.
--      9. guest_set_sharing(visit, shared) and guest_sharing(visit): the
--         guest's choice for the link their visit came through, with their
--         visit key, as every guest function. Setting it also writes it into
--         that link's saved items (form_data.shared_with_coach), where the
--         tools already read it.
--     10. coach_guest_answers refuses (42501) a link whose guest chose Only
--         you. coach_links (one more column) and coach_guests (one more key
--         in each link) say shared_with_coach, so a coach's Guests list can
--         show the guest finished without a way in.
--     11. _guest_claim writes each link's choice into its saved items before
--         they move into the account, so the choice moves with the work.
--   guest_copy_issue (042) is unchanged: the guest still gets their copy.
--
-- WHO CAN REACH WHAT
--   alignment_set_sharing: whoever holds the link, email and code (signed
--   out or signed in), as alignment_open. alignment_claim: signed in only,
--   for the account's own confirmed email. guest_set_sharing and
--   guest_sharing: whoever holds the visit key, as guest_save. The tables
--   stay closed to every role the app and the server use; nothing new can
--   read them directly.
--
-- SAFE TO RUN TWICE
--   Columns and the index are added only if missing; every function is
--   replaced with the same version (coach_links is dropped and made again,
--   with its rights); nothing is updated twice.
--
-- WHEN TO RUN
--   After 036 and 037 (it stops with a clear message without 036). Part B
--   needs 035 and runs only where 035 has: on a database without it, part A
--   runs alone, and part B is added by running this again after 035. At
--   go-live: after 035, 042, 043 and 037. Then run
--   supabase/044_guest_sharing_test.sql, which should end with
--   044 CHECKS PASSED.
-- =============================================================================

do $needs$
begin
  if to_regclass('public.alignment_sessions') is null
     or not exists (select 1 from pg_catalog.pg_attribute
                     where attrelid = 'public.alignment_sessions'::regclass and attname = 'coach_user_id' and not attisdropped) then
    raise exception '044 needs 036_alignment_coach_only first. Run 036 (and 037), then run this again.';
  end if;
end
$needs$;

-- =============================================================================
-- A. The outside Health Check
-- =============================================================================
alter table public.alignment_sessions add column if not exists shared_with_coach boolean not null default true;
alter table public.alignment_sessions add column if not exists claimed_at timestamptz;
alter table public.alignment_sessions add column if not exists claimed_decision_id uuid;

comment on column public.alignment_sessions.shared_with_coach is
  'The guest''s choice (044): true is "You and [coach]" (the default), false is "Only you": no completion email, and the coach can''t read the answers.';
comment on column public.alignment_sessions.claimed_at is
  'When this Health Check moved into the account with the same confirmed email (044, alignment_claim); user_id is that account.';
comment on column public.alignment_sessions.claimed_decision_id is
  'The decisions row it became when it moved into the account (044).';

create index if not exists alignment_sessions_respondent_idx on public.alignment_sessions (respondent_email) where claimed_at is null;

-- Still closed: reached only through the checked functions (018, 036).
alter table public.alignment_sessions enable row level security;
revoke all on table public.alignment_sessions from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- alignment_set_sharing (the guest): their choice, with link, email and code
-- -----------------------------------------------------------------------------
create or replace function public.alignment_set_sharing(
  p_token  text,
  p_email  text,
  p_code   text,
  p_shared boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a jsonb;
  s public.alignment_sessions;
begin
  a := public._alignment_auth(p_token, p_email, p_code);
  if not (a ->> 'ok')::boolean then
    return a;
  end if;
  if p_shared is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  update public.alignment_sessions
     set shared_with_coach = p_shared
   where id = (a ->> 'id')::uuid
  returning * into s;

  return jsonb_build_object(
    'ok', true,
    'shared_with_coach', s.shared_with_coach,
    'status', s.status,
    -- whether the coach's completion email has gone (so the page knows
    -- whether switching back to You and Tim should ask for it)
    'notified', s.notified_at is not null
  );
end;
$$;

revoke all on function public.alignment_set_sharing(text, text, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.alignment_set_sharing(text, text, text, boolean) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- alignment_open: as 036, plus the guest's choice
-- -----------------------------------------------------------------------------
create or replace function public.alignment_open(
  p_token text,
  p_email text,
  p_code  text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a jsonb;
  s public.alignment_sessions;
begin
  a := public._alignment_auth(p_token, p_email, p_code);
  if not (a ->> 'ok')::boolean then
    return a;
  end if;

  select * into s from public.alignment_sessions where id = (a ->> 'id')::uuid;

  return jsonb_build_object(
    'ok', true,
    'status', s.status,
    'current_step', s.current_step,
    'data', s.data,
    'version', s.version,
    'updated_at', s.updated_at,
    'completed_at', s.completed_at,
    'client_label', s.client_label,
    'coach_name', case when s.coach_user_id is not null then s.coach_name end,
    'shared_with_coach', s.shared_with_coach
  );
end;
$$;

revoke all on function public.alignment_open(text, text, text) from public;
grant execute on function public.alignment_open(text, text, text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- alignment_email_check: as 036, but a finished Health Check whose guest chose
-- Only you is 'private', before anything is marked as sent
-- -----------------------------------------------------------------------------
create or replace function public.alignment_email_check(
  p_token text,
  p_email text,
  p_code  text,
  p_kind  text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a      jsonb;
  s      public.alignment_sessions;
  recent jsonb;
begin
  if p_kind not in ('link', 'complete') then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  a := public._alignment_auth(p_token, p_email, p_code);
  if not (a ->> 'ok')::boolean then
    return a;
  end if;

  select * into s from public.alignment_sessions where id = (a ->> 'id')::uuid;

  if p_kind = 'link' then
    select coalesce(jsonb_agg(e), '[]'::jsonb) into recent
      from jsonb_array_elements_text(s.link_emails) as t(e)
     where e::timestamptz > now() - interval '24 hours';

    if jsonb_array_length(recent) >= 3 then
      return jsonb_build_object('ok', false, 'error', 'limit');
    end if;

    update public.alignment_sessions
       set link_emails = recent || to_jsonb(now()::text)
     where id = s.id;
  else
    if s.status <> 'complete' then
      return jsonb_build_object('ok', false, 'error', 'invalid');
    end if;
    -- Only you: nobody but the guest hears of it. Not marked as sent, so a
    -- switch back to You and Tim can still send it, once.
    if not s.shared_with_coach then
      return jsonb_build_object('ok', false, 'error', 'private');
    end if;
    if s.notified_at is not null then
      return jsonb_build_object('ok', false, 'error', 'already');
    end if;

    update public.alignment_sessions set notified_at = now() where id = s.id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'client_label', s.client_label,
    'respondent_email', s.respondent_email,
    'status', s.status,
    'completed_at', s.completed_at,
    'data', s.data,
    'has_coach', s.coach_user_id is not null
  );
end;
$$;

revoke all on function public.alignment_email_check(text, text, text, text) from public;
grant execute on function public.alignment_email_check(text, text, text, text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- alignment_recipients (the email server only): as 036, but 'private' for a
-- Health Check whose guest chose Only you
-- -----------------------------------------------------------------------------
create or replace function public.alignment_recipients(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role  text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  s       public.alignment_sessions;
begin
  -- the server (service role), or Tim in the SQL editor (no caller's claims)
  if not (v_role = 'service_role' or (v_role = '' and (select auth.uid()) is null)) then
    raise exception 'Only the email server can do this.' using errcode = '42501';
  end if;

  select * into s from public.alignment_sessions where token = coalesce(p_token, '');
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if not s.shared_with_coach then
    return jsonb_build_object('ok', false, 'error', 'private');
  end if;

  return jsonb_build_object(
    'ok', true,
    'coach_email', (select u.email from auth.users u where u.id = s.coach_user_id)
  );
end;
$$;

revoke all on function public.alignment_recipients(text) from public, anon, authenticated;
grant execute on function public.alignment_recipients(text) to service_role;

-- -----------------------------------------------------------------------------
-- alignment_coach_answers (signed in): as 036, but with Only you the coach
-- learns only that it was finished, never the answers
-- -----------------------------------------------------------------------------
create or replace function public.alignment_coach_answers(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me    uuid := (select auth.uid());
  v_owner boolean := false;
  s       public.alignment_sessions;
begin
  select * into s from public.alignment_sessions where token = coalesce(p_token, '');
  if v_me is null or not found then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  if s.coach_user_id is null and to_regprocedure('public.is_owner()') is not null then
    execute 'select public.is_owner()' into v_owner;
  end if;

  if s.coach_user_id is distinct from v_me and not (s.coach_user_id is null and v_owner) then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  if not s.shared_with_coach then
    return jsonb_build_object(
      'ok', true,
      'shared', false,
      'client_label', s.client_label,
      'respondent_email', s.respondent_email,
      'status', s.status,
      'updated_at', s.updated_at,
      'completed_at', s.completed_at
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'shared', true,
    'client_label', s.client_label,
    'respondent_email', s.respondent_email,
    'status', s.status,
    'updated_at', s.updated_at,
    'completed_at', s.completed_at,
    'data', s.data
  );
end;
$$;

revoke all on function public.alignment_coach_answers(text) from public, anon, authenticated, service_role;
grant execute on function public.alignment_coach_answers(text) to authenticated;

-- -----------------------------------------------------------------------------
-- alignment_claim (signed in): finished outside Health Checks of the
-- account's own confirmed email move in, each once, as an inside version
-- -----------------------------------------------------------------------------
create or replace function public.alignment_claim()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me    uuid := (select auth.uid());
  v_email text;
  s       public.alignment_sessions;
  v_name  text;
  v_team  text;
  v_done  timestamptz;
  v_data  jsonb;
  v_id    uuid;
  n       integer := 0;
begin
  if v_me is null then
    return 0;
  end if;
  select lower(btrim(u.email)) into v_email from auth.users u
   where u.id = v_me and u.email_confirmed_at is not null;
  if v_email is null or v_email = '' then
    return 0;
  end if;

  for s in
    select * from public.alignment_sessions
     where respondent_email = v_email and claimed_at is null and status = 'complete'
     order by coalesce(completed_at, updated_at), id
       for update
  loop
    v_name := left(coalesce(nullif(btrim(s.client_label), ''), 'My team'), 80);
    -- the account's own team of that name, when there is one (the newest)
    select d.form_data -> 'team' ->> 'id' into v_team
      from public.decisions d
     where d.user_id = v_me and d.tool_type = 'strategic-alignment'
       and d.form_data ->> 'shape' = '2'
       and lower(btrim(d.form_data -> 'team' ->> 'name')) = lower(v_name)
       and coalesce(d.form_data -> 'team' ->> 'id', '') <> ''
     order by d.updated_at desc nulls last
     limit 1;
    if v_team is null then
      v_team := gen_random_uuid()::text;
    end if;
    v_done := coalesce(s.completed_at, s.updated_at, now());
    v_data := case when jsonb_typeof(s.data) = 'object' then s.data else '{}'::jsonb end;
    if not (v_data ? 'completedAt') then
      v_data := v_data || jsonb_build_object('completedAt', to_char(v_done at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
    end if;

    insert into public.decisions (user_id, tool_type, title, form_data, status, draft)
    values (v_me, 'strategic-alignment', v_name,
            jsonb_build_object(
              'shape', 2,
              'team', jsonb_build_object('id', v_team, 'name', v_name),
              'date', to_char(v_done at time zone 'UTC', 'YYYY-MM-DD'),
              'made', 'team',
              'from', null,
              'data', v_data,
              'step', null,
              'shared_with_coach', s.shared_with_coach,
              'from_outside', jsonb_strip_nulls(jsonb_build_object(
                'at', to_char(v_done at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                'organisation', nullif(btrim(s.client_label), '')))),
            'completed', false)
    returning id into v_id;

    update public.alignment_sessions
       set user_id = v_me, claimed_at = now(), claimed_decision_id = v_id
     where id = s.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.alignment_claim() from public, anon, authenticated, service_role;
grant execute on function public.alignment_claim() to authenticated;

-- =============================================================================
-- B. Every other guest tool (035), only where 035 has run
-- =============================================================================
do $guest_part$
begin
  if to_regclass('public.guest_links') is null or to_regprocedure('public._guest_visit(text)') is null then
    raise notice '044: 035 has not run here, so the guest links part is left for later. Run 044 again after 035.';
    return;
  end if;

  execute 'alter table public.guest_links add column if not exists shared_with_coach boolean not null default true';
  execute $c$comment on column public.guest_links.shared_with_coach is
    'The guest''s choice for this link (044): true is "You and [coach]" (the default), false is "Only you": the coach can''t read the answers.'$c$;

  -- the guest's choice, written into the link's saved items too
  execute $f$
  create or replace function public._guest_share_items(p_link uuid, p_guest uuid, p_shared boolean)
  returns void
  language sql
  security definer
  set search_path = ''
  as $$
    update public.decisions d
       set form_data = jsonb_set(case when jsonb_typeof(d.form_data) = 'object' then d.form_data else '{}'::jsonb end,
                                 '{shared_with_coach}', to_jsonb(p_shared))
      from public.guest_items i
     where i.table_name = 'decisions' and i.row_key = d.id::text
       and i.link_id = p_link and i.guest_id = p_guest and d.guest_id = p_guest
       and (d.form_data -> 'shared_with_coach') is distinct from to_jsonb(p_shared);
  $$;
  $f$;
  execute 'revoke all on function public._guest_share_items(uuid, uuid, boolean) from public, anon, authenticated, service_role';

  execute $f$
  create or replace function public.guest_set_sharing(p_visit text, p_shared boolean)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
  as $$
  declare
    s public.guest_visits := public._guest_visit(p_visit);
    v_shared boolean;
  begin
    if p_shared is null then
      raise exception 'Choose Only you or You and your coach, then try again.' using errcode = '22023';
    end if;
    if s.link_id is null or s.guest_id is null then
      return jsonb_build_object('ok', false, 'error', 'no_link');
    end if;
    update public.guest_links set shared_with_coach = p_shared
     where id = s.link_id and guest_id = s.guest_id
    returning shared_with_coach into v_shared;
    if v_shared is null then
      return jsonb_build_object('ok', false, 'error', 'no_link');
    end if;
    perform public._guest_share_items(s.link_id, s.guest_id, p_shared);
    return jsonb_build_object('ok', true, 'shared_with_coach', v_shared);
  end;
  $$;
  $f$;

  execute $f$
  create or replace function public.guest_sharing(p_visit text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
  as $$
  declare
    s public.guest_visits := public._guest_visit(p_visit);
    v_shared boolean;
  begin
    if s.link_id is null or s.guest_id is null then
      return jsonb_build_object('ok', false, 'error', 'no_link');
    end if;
    select l.shared_with_coach into v_shared from public.guest_links l where l.id = s.link_id and l.guest_id = s.guest_id;
    if v_shared is null then
      return jsonb_build_object('ok', false, 'error', 'no_link');
    end if;
    return jsonb_build_object('ok', true, 'shared_with_coach', v_shared);
  end;
  $$;
  $f$;

  -- 035's, plus: refused when the guest chose Only you
  execute $f$
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
    if exists (select 1 from public.guest_links where id = p_link and not shared_with_coach) then
      raise exception 'This guest chose Only you, so their answers stay with them.' using errcode = '42501';
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
  $f$;

  -- 035's, plus shared_with_coach (one more column, so made again)
  execute 'drop function if exists public.coach_links(uuid, integer, timestamptz, uuid)';
  execute $f$
  create function public.coach_links(
    p_coach_user uuid default null, p_limit integer default 50,
    p_before_at timestamptz default null, p_before_id uuid default null)
  returns table (link_id uuid, tool text, tool_label text, coach_user_id uuid, coach_first_name text, created_at timestamptz, expires_at timestamptz,
                 switched_off_at timestamptz, first_used_at timestamptz, finished_at timestamptz, guest_id uuid, guest_email text,
                 shared_with_coach boolean)
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
             l.guest_id, g.email, l.shared_with_coach
      from public.guest_links l
      join public.guest_tools t on t.tool = l.tool
      left join public.guests g on g.id = l.guest_id
      where (v_scope is null or l.coach_user_id = v_scope)
        and (p_before_at is null or (l.created_at, l.id) < (p_before_at, p_before_id))
      order by l.created_at desc, l.id desc
      limit least(greatest(coalesce(p_limit, 50), 1), 200);
  end;
  $$;
  $f$;

  -- 035's, plus shared_with_coach in each link
  execute $f$
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
                                                  'first_used_at', l.first_used_at, 'finished_at', l.finished_at,
                                                  'shared_with_coach', l.shared_with_coach)
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
  $f$;

  -- 035's, plus: each link's choice goes into its saved items before they move
  execute $f$
  create or replace function public._guest_claim(p_guest uuid, p_user uuid)
  returns integer
  language plpgsql
  security definer
  set search_path = ''
  as $$
  declare
    g public.guests;
    t public.guest_tables;
    l public.guest_links;
    n integer;
    total integer := 0;
  begin
    select * into g from public.guests where id = p_guest for update;
    if g.id is null or g.claimed_at is not null then
      return 0;
    end if;
    for l in select * from public.guest_links where guest_id = p_guest loop
      perform public._guest_share_items(l.id, p_guest, l.shared_with_coach);
    end loop;
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
  $f$;

  -- who may call what
  execute 'revoke all on function public._guest_claim(uuid, uuid) from public, anon, authenticated';
  execute 'revoke all on function public.guest_set_sharing(text, boolean) from public, anon, authenticated, service_role';
  execute 'revoke all on function public.guest_sharing(text) from public, anon, authenticated, service_role';
  execute 'grant execute on function public.guest_set_sharing(text, boolean) to anon, authenticated';
  execute 'grant execute on function public.guest_sharing(text) to anon, authenticated';
  execute 'revoke all on function public.coach_guest_answers(uuid) from public, anon, authenticated';
  execute 'grant execute on function public.coach_guest_answers(uuid) to authenticated';
  execute 'revoke all on function public.coach_links(uuid, integer, timestamptz, uuid) from public, anon, authenticated';
  execute 'grant execute on function public.coach_links(uuid, integer, timestamptz, uuid) to authenticated';
  execute 'revoke all on function public.coach_guests(uuid, integer, timestamptz, uuid) from public, anon, authenticated';
  execute 'grant execute on function public.coach_guests(uuid, integer, timestamptz, uuid) to authenticated';
end
$guest_part$;

select public.record_migration(44, '044_guest_sharing');
