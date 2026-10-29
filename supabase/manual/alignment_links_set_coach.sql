-- =============================================================================
-- Run only after Tim has said yes.
--
-- alignment_links_set_coach.sql: records Adie as the coach on the Health
-- Check links Tim has confirmed are hers
--
-- WHAT THIS DOES (plain English)
--   For each link id pasted below, it records Adie as the link's coach, so
--   only Adie reads its answers and gets the email with them, and the person
--   filling it in is told "Only you and Adie see your answers."
--   - It finds Adie by her coach record (public.coaches: the one active coach
--     whose first name is Adie). It never shows an email address.
--   - It changes only links with no coach recorded yet. A link that already
--     has a coach is left as it is, and so is any id that isn't a link.
--   - It runs inside one transaction: if anything is wrong it stops, and
--     nothing is changed.
--   - At the end it lists the pasted links (organisation, day made and the
--     coach now recorded), with no email addresses.
--
-- BEFORE YOU RUN IT
--   1. 036 has run on this database (it adds the coach to each link).
--   2. The coaches list (026) is there, with Adie's coach record in it.
--      Until then this stops and changes nothing; her links' answers keep
--      going to the owner list, as today.
--   3. Run alignment_links_list.sql, and Tim has said which links are Adie's.
--
-- HOW TO RUN
--   Paste the link ids where it says so below, once: one per line, each in
--   single quotes inside round brackets and followed by a comma, above the
--   line (null), for example:
--     ('3f2c...-....'),
--     ('9a1b...-....'),
--     (null)
--   Then Supabase, the project, SQL Editor, New query: paste this file and
--   press Run. A good result: a notice "Adie is now the coach on N links",
--   then the list of those links, each with coach Adie.
-- =============================================================================

begin;

drop table if exists pg_temp.adie_links;
create temporary table adie_links (id uuid) on commit drop;
insert into adie_links (id) values
  -- paste the link ids here, one per line, each like ('3f2c...-....'),
  (null)
;
delete from adie_links where id is null;

do $$
declare
  v_ids       uuid[] := (select coalesce(array_agg(id), '{}') from adie_links);
  v_adie      uuid;
  v_name      text;
  v_coaches   integer;
  v_changed   integer;
  v_had_coach integer;
  v_missing   integer;
begin
  if cardinality(v_ids) is null or cardinality(v_ids) = 0 then
    raise exception 'No link ids were pasted in. Nothing was changed.';
  end if;
  if to_regclass('public.alignment_sessions') is null
     or not exists (select 1 from pg_catalog.pg_attribute
                     where attrelid = 'public.alignment_sessions'::regclass
                       and attname = 'coach_user_id' and not attisdropped) then
    raise exception 'This database doesn''t have 036 yet, so a link can''t record its coach. Run 036 first. Nothing was changed.';
  end if;
  if to_regclass('public.coaches') is null then
    raise exception 'This database has no coaches list yet (026), so Adie can''t be found by her coach record. Nothing was changed.';
  end if;

  execute 'select count(*)::integer, (array_agg(c.user_id))[1], (array_agg(btrim(c.display_first_name)))[1]
             from public.coaches c
            where c.active and c.role = ''coach'' and lower(btrim(c.display_first_name)) = ''adie'''
    into v_coaches, v_adie, v_name;
  if v_coaches <> 1 then
    raise exception 'Expected one active coach called Adie in the coaches list, found %. Nothing was changed.', v_coaches;
  end if;

  select count(*) into v_missing
    from unnest(v_ids) as x(id)
   where not exists (select 1 from public.alignment_sessions s where s.id = x.id);
  select count(*) into v_had_coach
    from public.alignment_sessions s
   where s.id = any (v_ids) and s.coach_user_id is not null;

  update public.alignment_sessions s
     set coach_user_id = v_adie,
         coach_name    = v_name
   where s.id = any (v_ids)
     and s.coach_user_id is null;
  get diagnostics v_changed = row_count;

  raise notice 'Adie is now the coach on % links. Left as they were: % that already had a coach, and % ids that aren''t links.',
    v_changed, v_had_coach, v_missing;
end
$$;

-- The pasted links now (no email addresses)
select s.id           as link_id,
       s.client_label as organisation,
       to_char(s.created_at at time zone 'Europe/London', 'Dy DD Mon YYYY') as created,
       case when s.coach_user_id is not null then s.coach_name end as coach
  from public.alignment_sessions s
 where s.id in (select id from adie_links)
 order by s.created_at;

commit;
