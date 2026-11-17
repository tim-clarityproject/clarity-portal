-- =============================================================================
-- 046_guest_reopen.sql: a guest's link opens on their answers again, and the
-- copy goes only to the address the link was made for (Phase 8a follow-up,
-- step 3; Tim, 16 Nov)
--
-- Needs 035 (guest links) and 044's guest part (guest_links.shared_with_coach):
-- it stops without them. Additive and safe to run twice.
--
-- WHAT IT DOES
--   1. Reopening (START-HERE rule 54: "Seeing past work needs their email
--      confirmed. Only they and Tim see it."). Until now a new visit saw only
--      what it made itself until the email was confirmed, and nothing let a
--      guest confirm it, so a guest who opened their link again (a new tab,
--      another device, the next day) found an empty tool. Now:
--        - while the guest shares with the coach (044's default), the link,
--          the email and the code bring back that link's earlier answers:
--          the coach who made the link can already read them;
--        - once the guest has chosen Only you, the coach must not be able to
--          read them, and the coach knows the link's code, so earlier answers
--          show only after the email is confirmed with a 6-digit code emailed
--          to the guest's own address (035's guest_email_code_issue and
--          guest_email_confirm; the email is sent by the server). guest_open
--          says so: 'earlier_hidden'.
--      One helper, _guest_link_shared, decides it, for every function that
--      reads, changes or deletes a guest's rows (_guest_sees, guest_rows,
--      guest_delete_link_answers, guest_copy_issue). Another link's rows,
--      and the guest's work through other links, still need the email
--      confirmed, as before.
--   2. The copy goes only to the address the link was made for. A coach makes
--      a link for one person: guest_link_create(tool, email). That link opens
--      only with that email, and guest_copy_issue sends the copy there and
--      nowhere else. A link made without an address (guest_link_create(tool),
--      and every link made before 046) still opens as before, but sends no
--      copy ('no_address'): nothing typed by whoever opens a link is ever
--      used as the address for the copy.
--
-- Test: supabase/046_guest_reopen_test.sql (then 042's and 044's tests,
-- which follow 046 when it is there). Dry run, rolled back:
--   bash scripts/dry-run-on-test.sh supabase/migrations/046_guest_reopen.sql \
--     supabase/migrations/046_guest_reopen.sql supabase/046_guest_reopen_test.sql
-- =============================================================================

do $need$
begin
  if to_regclass('public.guest_links') is null then
    raise exception '046 needs migration 035 (guest links) first.';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'guest_links' and column_name = 'shared_with_coach') then
    raise exception '046 needs migration 044''s guest part (guest_links.shared_with_coach) first: run 044 again after 035.';
  end if;
  if to_regprocedure('public.guest_copy_issue(text)') is null then
    raise exception '046 needs migration 042 (the guest''s copy) first.';
  end if;
end
$need$;

-- ---------------------------------------------------------------- the link's address
alter table public.guest_links add column if not exists for_email text;
comment on column public.guest_links.for_email is
  'The one email this link was made for (046): it opens only with this email, and the guest''s copy goes only here. Null for a link made without one (and every link made before 046): it opens with the first email used, and sends no copy.';

-- ---------------------------------------------------------------- who sees what
-- A visit that came through a link may see that link's earlier rows while
-- the guest shares with the coach (the coach can already read them); once
-- it is Only you, earlier rows need the email confirmed.
create or replace function public._guest_link_shared(s public.guest_visits, p_link uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select s.link_id is not null and p_link is not null and p_link = s.link_id
         and exists (select 1 from public.guest_links l
                      where l.id = p_link and l.guest_id = s.guest_id and l.shared_with_coach);
$$;
revoke all on function public._guest_link_shared(public.guest_visits, uuid) from public, anon, authenticated;

create or replace function public._guest_sees(s public.guest_visits, p_table text, p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.guest_items i
                 where i.table_name = p_table and i.row_key = p_key and i.guest_id = s.guest_id
                   and (s.confirmed or i.visit_id = s.id or public._guest_link_shared(s, i.link_id)));
$$;
revoke all on function public._guest_sees(public.guest_visits, text, text) from public, anon, authenticated;

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
                        where x.guest_id = $1 and i.guest_id = $1
                          and ($2 or i.visit_id = $3 or public._guest_link_shared($4, i.link_id))
                        order by x.created_at limit 1000) y',
                 p_table, p_table, public._guest_key_sql(p_table, 'x'))
    into v_out using s.guest_id, s.confirmed, s.id, s;
  return v_out;
end;
$$;

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
                      and i.link_id = $2 and ($3 or i.visit_id = $4 or public._guest_link_shared($5, i.link_id))',
                   t.table_name, t.table_name, public._guest_key_sql(t.table_name, 'x'))
      using s.guest_id, s.link_id, s.confirmed, s.id, s;
  end loop;
  -- counted after tidying, so rows that went with their parent count too
  perform public._guest_items_tidy(s.guest_id);
  if not exists (select 1 from public.guest_items where link_id = s.link_id) then
    update public.guest_links set finished_at = null where id = s.link_id;
  end if;
  return v_before - (select count(*) from public.guest_items where guest_id = s.guest_id and link_id = s.link_id);
end;
$$;

-- ---------------------------------------------------------------- the copy, to the link's own address
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
  -- only the address the link was made for (046): never one typed by whoever opened it
  if l.for_email is null then
    return jsonb_build_object('ok', false, 'error', 'no_address');
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
             and i.link_id = s.link_id and (s.confirmed or i.visit_id = s.id or public._guest_link_shared(s, i.link_id))
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
    'email', l.for_email,
    'tool', l.tool,
    'tool_label', v_label,
    'coach_first_name', left(public._coach_first_name(l.coach_user_id), 60),
    'rows', v_rows);
end;
$$;
revoke all on function public.guest_copy_issue(text) from public, anon, authenticated;
grant execute on function public.guest_copy_issue(text) to service_role;

-- ---------------------------------------------------------------- a link made for one person
-- As guest_link_create(tool), for one email: the link opens only with it,
-- and the guest's copy goes only to it. The address is never handed back.
create or replace function public.guest_link_create(p_tool text, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := public._guest_email(p_email);
  v jsonb;
begin
  if not public.is_coach() then
    raise exception 'Only a coach can make a guest link.' using errcode = '42501';
  end if;
  if v_email is null then
    raise exception 'That email doesn''t look right. Check it and try again.' using errcode = '22023';
  end if;
  v := public.guest_link_create(p_tool);
  update public.guest_links set for_email = v_email where id = (v ->> 'link_id')::uuid;
  return v || jsonb_build_object('for_email', true);
end;
$$;
revoke all on function public.guest_link_create(text, text) from public, anon, authenticated;
grant execute on function public.guest_link_create(text, text) to authenticated;

-- ---------------------------------------------------------------- opening a link
-- 035's guest_open, with two changes: a link made for an email opens only
-- with that email (one answer for every wrong detail, counted as a wrong
-- try), and the answer says whether the link holds earlier answers this
-- visit can't see yet ('earlier_hidden': Only you, so the email is confirmed
-- first).
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
  v_hidden boolean;
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
     or (l.for_email is not null and v_email <> l.for_email)
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
  v_hidden := not l.shared_with_coach
              and exists (select 1 from public.guest_items i where i.link_id = l.id and i.guest_id = g.id);
  return jsonb_build_object('ok', true, 'visit', v_key, 'tool', l.tool,
    'tool_label', (select label from public.guest_tools where tool = l.tool),
    'coach_name', left(v_coach, 60), 'link_expires_at', l.expires_at, 'confirmed', false,
    'earlier_hidden', v_hidden);
end;
$$;

select public.record_migration(46, '046_guest_reopen');
