-- =============================================================================
-- 042_guest_copy.sql
-- Get unstuck for guests (mock-up M9, the guest's end page; 14 Nov): "A copy
-- is on its way to alex@example.com."
--
-- WHAT THIS DOES (plain English)
--   When a guest finishes a tool through a coach's link (035), the page asks
--   the server to email them a copy of what they wrote. The page holds only
--   its visit key, so the server must learn WHO to email and WHAT the
--   answers are from that key alone, never from an address the browser
--   sends. This adds the one way to do that, for the server only:
--
--     guest_copy_issue(visit)   checks the visit as every guest function
--                               does, counts the send, and hands back the
--                               guest's email, the tool, the coach's first
--                               name and the guest's own rows made through
--                               that link that the visit may see (newest
--                               first; each with id, title, form_data,
--                               status and updated_at only).
--     guest_copy_failed(visit)  takes the newest count back when the email
--                               didn't go, so it can be tried again.
--     guest_copy_sends          one row per copy asked for: the link, the
--                               guest and when. Nothing else is kept (no
--                               address, no answers).
--
--   Limits, so a link can't be used to fill someone's inbox: 3 copies per
--   link per hour and 10 per guest per day. Over either, the answer is
--   {ok: false, error: 'limit'} and nothing is counted. A visit with no
--   link (someone coming back with their email only) gets {ok: false}; a
--   link with nothing saved through it yet gets {ok: false, error:
--   'nothing'}. Only tools that keep their rows in decisions (Get unstuck,
--   Give difficult feedback, Prepare for a difficult conversation) have a
--   copy; a Performance Plan link gets 'nothing'.
--
--   It also adds one small read for the guest's start page, which must say
--   whose link it is before the code is typed ("Only you and Tim will see
--   your answers."):
--
--     guest_link_info(token)    for a real link: the tool, its name, the
--                               coach's first name and whether the link is
--                               still open. Anything else: {ok: false}. It
--                               only reads, counts no try (the token is 32
--                               random bytes, so it can't be guessed), and
--                               never gives an email, the code or an id.
--
--   Nothing that is already there changes: no table, column, function or
--   rule of 035 is touched.
--
-- WHO CAN REACH WHAT
--   Both functions: the server only (service role). Signed-out people,
--   signed-in people, coaches and the owner cannot call them, so nobody can
--   ask the database for a guest's email with a visit key.
--   guest_copy_sends: locked to everyone (row security on, no rules), like
--   035's other guest tables. Only the two functions read and write it.
--   guest_link_info: anyone holding the link (signed out or signed in), as
--   guest_open is.
--   An unknown or ended visit is refused with the same error as every other
--   guest function (42501), and a visit sees only what guest_rows would
--   show it: its own rows until the email is confirmed.
--
-- SAFE TO RUN TWICE
--   Yes. The table and its indexes are made only if missing, and the
--   functions and their permissions are replaced with the same versions.
--
-- HOW TO RUN
--   After 035 (it uses 035's guests, links, visits and items, and stops
--   with a clear message if they aren't there). Then run
--   supabase/042_guest_copy_test.sql, which should end with
--   ALL CHECKS PASSED.
-- =============================================================================

do $needs$
begin
  if to_regclass('public.guest_visits') is null or to_regclass('public.guest_items') is null
     or to_regprocedure('public._guest_visit(text)') is null then
    raise exception '042 needs 035_guest_links first. Run 035, then run this again.';
  end if;
end
$needs$;

-- ---------------------------------------------------------------- the count of copies
create table if not exists public.guest_copy_sends (
  id       bigint generated always as identity primary key,
  link_id  uuid not null references public.guest_links (id) on delete cascade,
  guest_id uuid not null references public.guests (id) on delete cascade,
  sent_at  timestamptz not null default clock_timestamp()
);
comment on table public.guest_copy_sends is
  'Each copy of a guest''s work emailed to them (042): the link, the guest and when, for the send limits. Reached only through guest_copy_issue and guest_copy_failed.';
create index if not exists guest_copy_sends_link_idx on public.guest_copy_sends (link_id, sent_at desc);
create index if not exists guest_copy_sends_guest_idx on public.guest_copy_sends (guest_id, sent_at desc);

-- Locked, like 035's guest tables: row security on, no rules.
alter table public.guest_copy_sends enable row level security;
revoke all on table public.guest_copy_sends from public, anon, authenticated;

-- ---------------------------------------------------------------- who to email, and what
-- For the server only: the guest's email and their work through this
-- visit's link, to email them a copy. The visit is checked by 035's own
-- _guest_visit (unknown, ended, claimed or closed: refused with 42501).
-- At most 3 a link each hour and 10 a guest each day.
create or replace function public.guest_copy_issue(p_visit text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.guest_visits := public._guest_visit(p_visit);
  l public.guest_links;
  v_type text;
  v_label text;
  v_rows jsonb;
begin
  if s.link_id is null or s.guest_id is null then
    return jsonb_build_object('ok', false);
  end if;
  -- the link's row is held while the sends are counted, so two requests at
  -- once can't both slip under the limit
  select * into l from public.guest_links where id = s.link_id for update;
  if l.id is null then
    return jsonb_build_object('ok', false);
  end if;
  select t.decision_type, t.label into v_type, v_label from public.guest_tools t where t.tool = l.tool;

  -- the same rows guest_rows shows this visit, made through this link only
  select coalesce(jsonb_agg(jsonb_build_object('id', y.id, 'title', y.title, 'form_data', y.form_data,
                                               'status', y.status, 'updated_at', y.updated_at)
                            order by y.updated_at desc nulls last, y.created_at desc nulls last, y.id), '[]'::jsonb)
    into v_rows
    from (select d.id, d.title, d.form_data, d.status, d.updated_at, d.created_at
            from public.decisions d
            join public.guest_items i on i.table_name = 'decisions' and i.row_key = d.id::text
           where d.guest_id = s.guest_id and i.guest_id = s.guest_id
             and i.link_id = s.link_id and (s.confirmed or i.visit_id = s.id)
             and v_type is not null and d.tool_type = v_type
           order by d.updated_at desc nulls last, d.created_at desc nulls last, d.id
           limit 20) y;
  if jsonb_array_length(v_rows) = 0 then
    return jsonb_build_object('ok', false, 'error', 'nothing');
  end if;

  if (select count(*) from public.guest_copy_sends c where c.link_id = s.link_id and c.sent_at > now() - interval '1 hour') >= 3
     or (select count(*) from public.guest_copy_sends c where c.guest_id = s.guest_id and c.sent_at > now() - interval '1 day') >= 10 then
    return jsonb_build_object('ok', false, 'error', 'limit');
  end if;
  insert into public.guest_copy_sends (link_id, guest_id) values (s.link_id, s.guest_id);

  return jsonb_build_object(
    'ok', true,
    'email', (select g.email from public.guests g where g.id = s.guest_id),
    'tool', l.tool,
    'tool_label', v_label,
    'coach_first_name', left(public._coach_first_name(l.coach_user_id), 60),
    'rows', v_rows);
end;
$$;

-- For the server only: the email didn't go, so the newest count for this
-- visit's link (made in the last 10 minutes) is taken back and the copy can
-- be asked for again. It never raises: an unknown visit changes nothing.
create or replace function public.guest_copy_failed(p_visit text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.guest_visits;
  v_n integer;
begin
  if p_visit is null or p_visit !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false);
  end if;
  select * into s from public.guest_visits where key_hash = public._guest_hash(p_visit);
  if s.id is null or s.link_id is null or s.guest_id is null then
    return jsonb_build_object('ok', false);
  end if;
  delete from public.guest_copy_sends
   where id = (select c.id from public.guest_copy_sends c
                where c.link_id = s.link_id and c.guest_id = s.guest_id and c.sent_at > now() - interval '10 minutes'
                order by c.sent_at desc, c.id desc limit 1);
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', v_n > 0);
end;
$$;

-- ---------------------------------------------------------------- whose link is this?
-- For the guest's start page, before the code is typed: the tool and the
-- coach's first name for a real link. Reads only; no try is counted.
create or replace function public.guest_link_info(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  l public.guest_links;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false);
  end if;
  select * into l from public.guest_links where token_hash = public._guest_hash(p_token);
  if l.id is null then
    return jsonb_build_object('ok', false);
  end if;
  return jsonb_build_object(
    'ok', true,
    'tool', l.tool,
    'tool_label', (select t.label from public.guest_tools t where t.tool = l.tool),
    'coach_name', left(public._coach_first_name(l.coach_user_id), 60),
    'open', (l.switched_off_at is null and l.expires_at > now()));
end;
$$;

-- ---------------------------------------------------------------- who may call what
-- The server only, exactly as 035 does for guest_email_code_issue.
revoke all on function public.guest_copy_issue(text) from public, anon, authenticated;
revoke all on function public.guest_copy_failed(text) from public, anon, authenticated;
grant execute on function public.guest_copy_issue(text) to service_role;
grant execute on function public.guest_copy_failed(text) to service_role;
-- Whoever holds the link, as for guest_open.
revoke all on function public.guest_link_info(text) from public, anon, authenticated;
grant execute on function public.guest_link_info(text) to anon, authenticated;

select public.record_migration(42, '042_guest_copy');
