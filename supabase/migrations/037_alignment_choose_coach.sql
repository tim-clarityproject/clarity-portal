-- =============================================================================
-- 037_alignment_choose_coach.sql
-- Strategic Alignment Health Check: the owner chooses which coach a link is
-- for (Tim, 29 Oct)
--
-- WHAT THIS DOES (plain English)
--   Links are made in the SQL editor, by Tim. Until now the third value (the
--   coach) could be any portal account's email. Now it must be a real coach,
--   and it can be the coach's first name:
--        select public.create_alignment_session('Acme Ltd', 'ceo@acme.com', 'Adie');
--        select public.create_alignment_session('Acme Ltd', 'ceo@acme.com', 'Tim');
--   The coach is recorded on the link (coach_user_id, from 036), so only that
--   coach reads the answers and gets the email with them.
--   1. Where the coaches list is there (public.coaches, from 026), the coach
--      is an active row in it, found by their first name as shown
--      (display_first_name) or by their email. No match, or two coaches with
--      that first name, stops with a message, and no link is made.
--   2. Where it isn't there yet (live before go-live), the coach is found by
--      their portal account's email, as 036 does; a first name can't be
--      used there, and says so.
--   3. Only the owner may choose another coach. In the SQL editor that is
--      Tim (the database admin). If someone signed in ever reached this, they
--      could make a link only for themselves, unless is_owner() says they are
--      the owner. Where the coaches list is there, someone signed in must be
--      an active coach.
--   4. The error messages never repeat the email typed in.
--   Nothing else changes: links already made keep their coach (or none), and
--   the two-value form still makes a link with no coach recorded.
--
-- SAFE TO RUN TWICE
--   It replaces one function with the same version each time.
--
-- WHEN TO RUN
--   After 036. Test project: when Tim chooses. Live project: on release day,
--   after 036. Test: supabase/037_alignment_choose_coach_test.sql, which should
--   end with 037 CHECKS PASSED.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Internal helper: the coach's account for a new link. Blank: the coach signed
-- in (in the SQL editor, nobody: no coach recorded). Otherwise the one active
-- coach with that first name or email (the account with that email where the
-- coaches list isn't there yet).
-- -----------------------------------------------------------------------------
create or replace function public._alignment_coach_id(p_coach_email text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me      uuid := (select auth.uid());
  v_coach   text := lower(btrim(coalesce(p_coach_email, '')));
  v_list    boolean := to_regclass('public.coaches') is not null;
  v_id      uuid;
  v_found   integer := 0;
  v_owner   boolean := false;
  v_active  boolean := false;
begin
  if v_coach = '' then
    v_id := v_me;
  elsif v_list then
    execute 'select count(*)::integer, (array_agg(c.user_id))[1]
               from public.coaches c
               left join auth.users u on u.id = c.user_id
              where c.active
                and (lower(btrim(c.display_first_name)) = $1
                     or lower(btrim(c.email)) = $1
                     or lower(u.email) = $1)'
      into v_found, v_id using v_coach;
    if v_found = 0 then
      raise exception 'No active coach has that first name or email. Check the spelling, or add them to public.coaches first. No link was made.';
    elsif v_found > 1 then
      raise exception 'More than one active coach matches that. Use the coach''s email instead. No link was made.';
    end if;
  elsif position('@' in v_coach) = 0 then
    raise exception 'This database has no coaches list yet (026), so give the coach''s email, not their name. No link was made.';
  else
    select u.id into v_id from auth.users u where lower(u.email) = v_coach limit 1;
    if v_id is null then
      raise exception 'No portal account has that coach email. Check the spelling. No link was made.';
    end if;
  end if;

  -- Someone signed in (never Tim in the SQL editor): a real coach, and only
  -- for themselves unless they are the owner.
  if v_me is not null then
    if v_list then
      execute 'select exists (select 1 from public.coaches c where c.user_id = $1 and c.active)'
        into v_active using v_me;
      if not v_active then
        raise exception 'Only a coach can make a Health Check link.' using errcode = '42501';
      end if;
    end if;
    if v_id is distinct from v_me then
      if to_regprocedure('public.is_owner()') is not null then
        execute 'select public.is_owner()' into v_owner;
      end if;
      if not v_owner then
        raise exception 'Only the owner can make a link for another coach.' using errcode = '42501';
      end if;
    end if;
  end if;

  return v_id;
end;
$$;

revoke all on function public._alignment_coach_id(text) from public, anon, authenticated, service_role;

-- Records itself where the migration log (025) is there; on a database
-- without it yet, this does nothing rather than stop the migration.
do $$
begin
  if to_regprocedure('public.record_migration(integer,text)') is not null then
    perform public.record_migration(37, '037_alignment_choose_coach');
  end if;
end;
$$;
