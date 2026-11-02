-- =============================================================================
-- Run only after Tim has said yes.
--
-- alignment_links_set_coach.sql: records the coach (for example Adie) on the
-- Health Check links Tim has confirmed are theirs
--
-- WHAT THIS DOES (plain English)
--   For each link id pasted below, it records the coach named below as the
--   link's coach, so only that coach reads its answers and gets the email
--   with them (the owner list is told only that it was finished), and the
--   person filling it in is told "Only you and Adie see your answers."
--   - The coach is named the same way as when a new link is made (037):
--     by the email of their portal account. Where the coaches list (026) is
--     there, their first name as shown (Adie) works too. It never shows an
--     email address, and its messages never repeat the one typed in.
--   - It changes only links with no coach recorded yet. A link that already
--     has a coach is left as it is, and so is any id that isn't a link.
--   - It runs inside one transaction: if anything is wrong it stops, and
--     nothing is changed.
--   - At the end it lists the pasted links (organisation, day made and the
--     coach now recorded), with no email addresses.
--
-- BEFORE YOU RUN IT
--   1. 036 and 037 have run on this database (036 adds the coach to each
--      link; 037 finds the coach). The coaches list isn't needed.
--   2. Run alignment_links_list.sql, and Tim has said which links are whose.
--
-- HOW TO RUN
--   1. Type the coach's portal email between the quotes where it says so
--      below, in place of the words that are there.
--   2. Paste the link ids where it says so below, once: one per line, each
--      in single quotes inside round brackets and followed by a comma, above
--      the line (null), for example:
--        ('3f2c...-....'),
--        ('9a1b...-....'),
--        (null)
--   3. Supabase, the project, SQL Editor, New query: paste this file and
--      press Run. A good result: a notice "Adie is now the coach on N
--      links", then the list of those links, each with coach Adie.
--   Don't save the query with the email in it.
-- =============================================================================

begin;

drop table if exists pg_temp.chosen_coach;
create temporary table chosen_coach (coach text) on commit drop;
insert into chosen_coach (coach) values
  ('type the coach''s email here')
;

drop table if exists pg_temp.coach_links;
create temporary table coach_links (id uuid) on commit drop;
insert into coach_links (id) values
  -- paste the link ids here, one per line, each like ('3f2c...-....'),
  (null)
;
delete from coach_links where id is null;

do $$
declare
  v_ids       uuid[] := (select coalesce(array_agg(id), '{}') from coach_links);
  v_coach     text := (select btrim(coalesce(max(coach), '')) from chosen_coach);
  v_coach_id  uuid;
  v_name      text;
  v_changed   integer;
  v_had_coach integer;
  v_missing   integer;
begin
  if cardinality(v_ids) is null or cardinality(v_ids) = 0 then
    raise exception 'No link ids were pasted in. Nothing was changed.';
  end if;
  if v_coach = '' or v_coach = 'type the coach''s email here' then
    raise exception 'No coach was typed in. Type the coach''s email where it says so. Nothing was changed.';
  end if;
  if to_regclass('public.alignment_sessions') is null
     or not exists (select 1 from pg_catalog.pg_attribute
                     where attrelid = 'public.alignment_sessions'::regclass
                       and attname = 'coach_user_id' and not attisdropped) then
    raise exception 'This database doesn''t have 036 yet, so a link can''t record its coach. Run 036 first. Nothing was changed.';
  end if;
  if to_regprocedure('public._alignment_coach_id(text)') is null
     or to_regprocedure('public._alignment_first_name(uuid)') is null then
    raise exception 'This database doesn''t have 037 yet, so the coach can''t be found the way a new link finds them. Run 037 first. Nothing was changed.';
  end if;

  -- The same as a new link (037): an active coach by first name or email
  -- where the coaches list is there, otherwise the portal account with that
  -- email. It stops with its own message, which never repeats the email.
  begin
    v_coach_id := public._alignment_coach_id(v_coach);
  exception when raise_exception then
    raise exception '%', replace(sqlerrm, 'No link was made.', 'Nothing was changed.');
  end;
  if v_coach_id is null then
    raise exception 'No coach was found. Check the email. Nothing was changed.';
  end if;
  v_name := public._alignment_first_name(v_coach_id);

  select count(*) into v_missing
    from unnest(v_ids) as x(id)
   where not exists (select 1 from public.alignment_sessions s where s.id = x.id);
  select count(*) into v_had_coach
    from public.alignment_sessions s
   where s.id = any (v_ids) and s.coach_user_id is not null;

  update public.alignment_sessions s
     set coach_user_id = v_coach_id,
         coach_name    = v_name
   where s.id = any (v_ids)
     and s.coach_user_id is null;
  get diagnostics v_changed = row_count;

  raise notice '% is now the coach on % links. Left as they were: % that already had a coach, and % ids that aren''t links.',
    coalesce(v_name, 'The coach (no first name on their account)'), v_changed, v_had_coach, v_missing;
end
$$;

-- The pasted links now (no email addresses)
select s.id           as link_id,
       s.client_label as organisation,
       to_char(s.created_at at time zone 'Europe/London', 'Dy DD Mon YYYY') as created,
       case when s.coach_user_id is not null then s.coach_name end as coach
  from public.alignment_sessions s
 where s.id in (select id from coach_links)
 order by s.created_at;

commit;
