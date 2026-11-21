-- =============================================================================
-- 049_coach_portal_foundation_test.sql
-- Checks 049_coach_portal_foundation.sql. RUN ORDER: 026, 033, 049, then this.
--
-- WHAT IT DOES
--   Makes an invented owner, two associates (Maya and a cover coach), three
--   client accounts and someone signed out, and checks each role reading and
--   writing what it should, and being refused what it shouldn't:
--     1. every new table is locked down, and the migration recorded itself;
--     2. an associate's own clients, About them, notes (3 pins), tags,
--        fields and views (5 favourites) are theirs alone;
--     3. the owner reads only admin facts of an associate's clients;
--     4. an associate never reads, changes or moves the owner's client;
--     5. the owner moves a client, with the history kept;
--     6. an invite links an account only when that person accepts it;
--     7. a cover coach reads only what the client shares, only between the
--        dates and only after the client agreed;
--     8. merge (never with themselves), Undo, and delete with the name typed;
--     9. engagements, time entries (one running), files both ways;
--    10. organisations' contacts and documents are the owner's;
--    11. a workshop's page, registering, the waiting list and the survey for
--        someone signed out, who reads no table at all;
--    12. the bell and the Activity log.
--   Everything it makes is undone at the end.
--
--   It ends with the notice 049 CHECKS PASSED, or stops with FAILED and a
--   list naming each check that failed.
-- =============================================================================
create or replace function pg_temp.t_as(p uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated', 'aal', 'aal2')::text, true);  -- 054: signed in with the code
  perform set_config('role', 'authenticated', true);
end $f$;
create or replace function pg_temp.t_anon() returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $f$;
create or replace function pg_temp.t_admin() returns void language plpgsql as $f$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $f$;
create or replace function pg_temp.t_user(p_label text) returns uuid language plpgsql as $f$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, email_confirmed_at)
  values (u, 'p6a-test-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated', now());
  return u;
end $f$;
create or replace function pg_temp.t_n(p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  execute p_sql into v;
  return coalesce(v, 'null');
exception when others then
  return 'error ' || sqlstate;
end $f$;
create or replace function pg_temp.t_rows(p_sql text) returns text language plpgsql as $f$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n::text;
exception when others then
  return 'error ' || sqlstate;
end $f$;
create or replace function pg_temp.t_eq(p_name text, p_got text, p_want text) returns text[] language sql as $f$
  select case when p_got is distinct from p_want
              then array[format('%s: expected %s, got %s', p_name, p_want, coalesce(p_got, 'nothing'))]
              else '{}'::text[] end;
$f$;

do $t$
declare
  f text[] := '{}';
  tbl text;
  tables text[] := array[
    'coach_settings', 'coach_profiles', 'coach_cover', 'client_profiles', 'client_profile_coaches', 'client_about',
    'client_notes', 'client_files', 'client_view_requests', 'client_merges', 'coach_tags', 'coach_tag_links',
    'coach_fields', 'coach_field_values', 'coach_views', 'organisation_contacts', 'organisation_documents',
    'coach_groups', 'coach_group_members', 'engagements', 'engagement_packs', 'engagement_projects', 'time_entries',
    'workshops', 'workshop_attendees', 'workshop_materials', 'workshop_survey_answers', 'activity_log',
    'data_requests', 'coach_notifications'];
  own_u uuid; maya_u uuid; cov_u uuid; sam_u uuid; ella_u uuid; other_u uuid;
  own_c uuid; maya_c uuid; cov_c uuid;
  org uuid := gen_random_uuid();
  p_sam uuid := gen_random_uuid();   -- the owner's client, with an account later
  p_ella uuid := gen_random_uuid();  -- Maya's client
  p_dup uuid := gen_random_uuid();   -- Maya's duplicate of Ella
  p_owen uuid := gen_random_uuid();  -- added by the owner for Maya
  tag1 uuid := gen_random_uuid(); fld1 uuid := gen_random_uuid();
  eng1 uuid := gen_random_uuid(); prj1 uuid := gen_random_uuid();
  ws uuid := gen_random_uuid(); ws_key uuid; s_key uuid;
  cover1 uuid := gen_random_uuid();
  mrg uuid; i int; v text; sam_email text; ella_email text;
begin
  -- 1. Locked down, and recorded.
  foreach tbl in array tables loop
    f := f || pg_temp.t_eq('1a ' || tbl || ' has row security', (select relrowsecurity::text from pg_class where oid = ('public.' || tbl)::regclass), 'true');
    f := f || pg_temp.t_eq('1b ' || tbl || ': nothing for someone signed out', (select count(*)::text from information_schema.role_table_grants where grantee in ('anon', 'public') and table_schema = 'public' and table_name = tbl), '0');
    f := f || pg_temp.t_eq('1c ' || tbl || ': every rule is for signed-in people', (select count(*)::text from pg_policies where schemaname = 'public' and tablename = tbl and roles <> '{authenticated}'), '0');
    f := f || pg_temp.t_eq('1d ' || tbl || ': has at least one rule', (select (count(*) > 0)::text from pg_policies where schemaname = 'public' and tablename = tbl), 'true');
  end loop;
  if to_regclass('public.migration_log') is not null then
    f := f || pg_temp.t_eq('1e the migration recorded itself, once', (select count(*)::text from public.migration_log where number = 49 and name = '049_coach_portal_foundation'), '1');
  end if;
  f := f || pg_temp.t_eq('1f a time zone is a place name', (select concat(public.zone_name_ok('Europe/London'), public.zone_name_ok('America/Indiana/Knox'), public.zone_name_ok('EST'), public.zone_name_ok('-05:00'))), 'ttff');
  f := f || pg_temp.t_eq('1g an email is one address', (select concat(public.one_email_ok('a@b.co'), public.one_email_ok('a@b.co, c@d.co'), public.one_email_ok('A@b.co'))), 'tff');

  begin
    own_u := pg_temp.t_user('owner'); maya_u := pg_temp.t_user('maya'); cov_u := pg_temp.t_user('cover');
    sam_u := pg_temp.t_user('sam'); ella_u := pg_temp.t_user('ella'); other_u := pg_temp.t_user('other');
    select email into sam_email from auth.users where id = sam_u;
    select email into ella_email from auth.users where id = ella_u;
    -- an owner may already be on this database; this test's owner is its own
    insert into public.coaches (user_id, role, display_first_name, full_name) values (own_u, 'owner', 'Tess', 'Tess Owner') returning id into own_c;
    insert into public.coaches (user_id, role, display_first_name, full_name, hourly_rate) values (maya_u, 'coach', 'Maya', 'Maya Invented', 100) returning id into maya_c;
    insert into public.coaches (user_id, role, display_first_name) values (cov_u, 'coach', 'Cora') returning id into cov_c;
    insert into public.organisations (id, name, city) values (org, 'Invented Kestrel', 'London');

    -- 2. An associate's own things.
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('2a Maya adds her client, with no account', pg_temp.t_rows(format('insert into public.client_profiles (id, coach_id, name, email, organisation_id, time_zone) values (%L, %L, ''Ella Fraser'', %L, %L, ''Europe/London'')', p_ella, maya_c, ella_email, org)), '1');
    f := f || pg_temp.t_eq('2b and a duplicate', pg_temp.t_rows(format('insert into public.client_profiles (id, coach_id, name, city) values (%L, %L, ''Ella F'', ''Leeds'')', p_dup, maya_c)), '1');
    f := f || pg_temp.t_eq('2c she can''t add one for another coach', pg_temp.t_rows(format('insert into public.client_profiles (coach_id, name) values (%L, ''Nobody'')', own_c)), 'error 42501');
    f := f || pg_temp.t_eq('2d she can''t link an account herself', pg_temp.t_rows(format('update public.client_profiles set user_id = %L where id = %L', ella_u, p_ella)), 'error 42501');
    f := f || pg_temp.t_eq('2e a time zone must be a place name', pg_temp.t_rows(format('update public.client_profiles set time_zone = ''EST'' where id = %L', p_ella)), 'error 23514');
    f := f || pg_temp.t_eq('2f About them', pg_temp.t_rows(format('insert into public.client_about (profile_id, coach_id, birthday_month, birthday_day, partner) values (%L, %L, 3, 12, ''Ama'')', p_ella, maya_c)), '1');
    for i in 1..3 loop
      f := f || pg_temp.t_eq('2g pinned note ' || i, pg_temp.t_rows(format('insert into public.client_notes (profile_id, coach_id, body, pinned) values (%L, %L, ''Note %s'', true)', p_ella, maya_c, i)), '1');
    end loop;
    f := f || pg_temp.t_eq('2h a fourth pinned note is refused', pg_temp.t_rows(format('insert into public.client_notes (profile_id, coach_id, body, pinned) values (%L, %L, ''Note 4'', true)', p_ella, maya_c)), 'error 23514');
    f := f || pg_temp.t_eq('2i a fourth note, not pinned, saves', pg_temp.t_rows(format('insert into public.client_notes (profile_id, coach_id, body) values (%L, %L, ''Note 4'')', p_ella, maya_c)), '1');
    f := f || pg_temp.t_eq('2j a tag', pg_temp.t_rows(format('insert into public.coach_tags (id, coach_id, name) values (%L, %L, ''Executive'')', tag1, maya_c)), '1');
    f := f || pg_temp.t_eq('2k the same tag twice is refused', pg_temp.t_rows(format('insert into public.coach_tags (coach_id, name) values (%L, '' executive '')', maya_c)), 'error 23505');
    f := f || pg_temp.t_eq('2l the tag on her client', pg_temp.t_rows(format('insert into public.coach_tag_links (tag_id, item_kind, item_id, coach_id) values (%L, ''client'', %L, %L)', tag1, p_ella, maya_c)), '1');
    f := f || pg_temp.t_eq('2m a custom field and its value', pg_temp.t_rows(format('with a as (insert into public.coach_fields (id, coach_id, name, kind, options) values (%L, %L, ''Sector'', ''choice'', ''["Finance","Sport"]'') returning id) insert into public.coach_field_values (field_id, item_id, coach_id, value_text) select id, %L, %L, ''Finance'' from a', fld1, maya_c, p_ella, maya_c)), '1');
    for i in 1..5 loop
      f := f || pg_temp.t_eq('2n favourite view ' || i, pg_temp.t_rows(format('insert into public.coach_views (coach_id, list, name, filters, favourite) values (%L, ''clients'', ''View %s'', ''{"tag":["Executive"]}'', true)', maya_c, i)), '1');
    end loop;
    f := f || pg_temp.t_eq('2o a sixth favourite is refused', pg_temp.t_rows(format('insert into public.coach_views (coach_id, list, name, favourite) values (%L, ''clients'', ''View 6'', true)', maya_c)), 'error 23514');
    f := f || pg_temp.t_eq('2p her own settings', pg_temp.t_rows(format('insert into public.coach_settings (coach_id, time_zone, time_zones) values (%L, ''Europe/London'', ''["Europe/London","America/Chicago"]'')', maya_c)), '1');
    f := f || pg_temp.t_eq('2q she changes her own details', pg_temp.t_n('select public.coach_save_details(''Maya'', ''Maya Invented'', ''+447700900123'', array[''email'',''whatsapp''])::text'), '');
    f := f || pg_temp.t_eq('2r she can''t change her own rate or role', pg_temp.t_rows(format('update public.coaches set hourly_rate = 500, role = ''owner'' where id = %L', maya_c)), '0');
    f := f || pg_temp.t_eq('2s her profile, waiting for approval', pg_temp.t_rows(format('insert into public.coach_profiles (coach_id, bio, specialisms, submitted_at, approved_at) values (%L, ''Coaches leaders.'', array[''Change''], now(), now())', maya_c)), '1');
    f := f || pg_temp.t_eq('2t she can''t approve it herself', (select (approved_at is null)::text from public.coach_profiles where coach_id = maya_c), 'true');
    f := f || pg_temp.t_eq('2u the coach list gives her names only', (select concat(count(*), '/', count(hourly_rate), '/', count(clients)) from public.coach_list() where coach_id in (own_c, maya_c, cov_c)), '3/0/0');

    -- 3. The owner: admin facts only.
    perform pg_temp.t_as(own_u);
    f := f || pg_temp.t_eq('3a the owner adds their own client', pg_temp.t_rows(format('insert into public.client_profiles (id, coach_id, name, email, organisation_id) values (%L, %L, ''Sam Okafor'', %L, %L)', p_sam, own_c, sam_email, org)), '1');
    f := f || pg_temp.t_eq('3b the owner adds a client for Maya', pg_temp.t_rows(format('insert into public.client_profiles (id, coach_id, name) values (%L, %L, ''Owen Price'')', p_owen, maya_c)), '1');
    f := f || pg_temp.t_eq('3b2 or through the checked function, which hands back the id', pg_temp.t_n(format('select (public.client_add_for(%L, null, '' Temp Person '', ''TEMP@Example.invalid'') is not null)::text', maya_c)), 'true');
    perform pg_temp.t_admin();
    delete from public.client_profiles where name = 'Temp Person' and email = 'temp@example.invalid' and coach_id = maya_c;
    perform pg_temp.t_as(own_u);
    f := f || pg_temp.t_eq('3c the owner reads only their own profiles', (select count(*)::text from public.client_profiles), '1');
    f := f || pg_temp.t_eq('3d admin facts name every client and coach', (select string_agg(name || ':' || coach_first_name, ',' order by name) from public.coach_admin_clients()), 'Ella F:Maya,Ella Fraser:Maya,Owen Price:Maya,Sam Okafor:Tess');
    f := f || pg_temp.t_eq('3e never About them', (select count(*)::text from public.client_about), '0');
    f := f || pg_temp.t_eq('3f never notes', (select count(*)::text from public.client_notes), '0');
    f := f || pg_temp.t_eq('3g never tags, fields or views', (select concat((select count(*) from public.coach_tags), (select count(*) from public.coach_tag_links), (select count(*) from public.coach_fields), (select count(*) from public.coach_field_values), (select count(*) from public.coach_views), (select count(*) from public.coach_settings))), '000000');
    f := f || pg_temp.t_eq('3h the owner can''t change Maya''s client', pg_temp.t_rows(format('update public.client_profiles set name = ''Changed'' where id = %L', p_ella)), '0');
    f := f || pg_temp.t_eq('3i the owner approves Maya''s profile', pg_temp.t_n(format('select public.coach_profile_decide(%L, true)::text', maya_c)), '');
    f := f || pg_temp.t_eq('3j it is approved', (select (approved_at is not null)::text from public.coach_profiles where coach_id = maya_c), 'true');
    f := f || pg_temp.t_eq('3k the coach list gives the owner the facts', (select concat(clients, '/', hourly_rate::int) from public.coach_list() where coach_id = maya_c), '3/100');
    f := f || pg_temp.t_eq('3l a coach with clients can''t be switched off', pg_temp.t_n(format('select public.coach_switch(%L, false)::text', maya_c)), 'error 23514');
    f := f || pg_temp.t_eq('3m organisation contacts are the owner''s', pg_temp.t_rows(format('insert into public.organisation_contacts (organisation_id, name, roles) values (%L, ''Dana Whitfield'', array[''sponsor'',''invoices''])', org)), '1');
    f := f || pg_temp.t_eq('3n and documents, with an expiry', pg_temp.t_rows(format('insert into public.organisation_documents (organisation_id, name, expires_on) values (%L, ''Non-disclosure agreement'', ''2026-11-30'')', org)), '1');
    f := f || pg_temp.t_eq('3o a role that isn''t one is refused', pg_temp.t_rows(format('insert into public.organisation_contacts (organisation_id, name, roles) values (%L, ''X'', array[''boss''])', org)), 'error 23514');

    -- 4. An associate and the owner's client.
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('4a Maya reads only her own three', (select count(*)::text from public.client_profiles), '3');
    f := f || pg_temp.t_eq('4b not the owner''s client', (select count(*)::text from public.client_profiles where id = p_sam), '0');
    f := f || pg_temp.t_eq('4c she can''t change it', pg_temp.t_rows(format('update public.client_profiles set name = ''Mine'' where id = %L', p_sam)), '0');
    f := f || pg_temp.t_eq('4d she can''t note on it', pg_temp.t_rows(format('insert into public.client_notes (profile_id, coach_id, body) values (%L, %L, ''x'')', p_sam, maya_c)), 'error 42501');
    f := f || pg_temp.t_eq('4e she can''t move a client', pg_temp.t_n(format('select public.client_move(%L, %L)::text', p_sam, maya_c)), 'error 42501');
    f := f || pg_temp.t_eq('4f she can''t hand her own client on by a plain save', pg_temp.t_rows(format('update public.client_profiles set coach_id = %L where id = %L', own_c, p_ella)), 'error 42501');
    f := f || pg_temp.t_eq('4f2 nor add a client for another coach', pg_temp.t_n(format('select public.client_add_for(%L, null, ''X'')::text', own_c)), 'error 42501');
    f := f || pg_temp.t_eq('4f3 she takes back a client she just added (Undo)', concat(pg_temp.t_rows(format('insert into public.client_profiles (id, coach_id, name) values (''00000000-0000-4000-8000-0000000000aa'', %L, ''Just Added'')', maya_c)), pg_temp.t_rows('delete from public.client_profiles where id = ''00000000-0000-4000-8000-0000000000aa''')), '11');
    f := f || pg_temp.t_eq('4f4 but not the owner''s client', pg_temp.t_rows(format('delete from public.client_profiles where id = %L', p_sam)), '0');
    f := f || pg_temp.t_eq('4g she can''t ask for admin facts', pg_temp.t_n('select count(*)::text from public.coach_admin_clients()'), 'error 42501');
    f := f || pg_temp.t_eq('4h she reads no contacts or documents', (select concat((select count(*) from public.organisation_contacts), (select count(*) from public.organisation_documents))), '00');
    f := f || pg_temp.t_eq('4i she reads the organisation her client is in', (select count(*)::text from public.organisations where id = org), '1');
    f := f || pg_temp.t_eq('4j she reads no Activity log', (select count(*)::text from public.activity_log), '0');
    f := f || pg_temp.t_eq('4k she can''t set cover', pg_temp.t_rows(format('insert into public.coach_cover (coach_id, cover_coach_id, profile_id, starts_on, ends_on) values (%L, %L, %L, current_date, current_date)', maya_c, cov_c, p_ella)), 'error 42501');
    f := f || pg_temp.t_eq('4l she can''t approve a profile', pg_temp.t_n(format('select public.coach_profile_decide(%L, true)::text', maya_c)), 'error 42501');
    f := f || pg_temp.t_eq('4m editing her bio takes the approval off', pg_temp.t_rows(format('update public.coach_profiles set bio = ''New words.'' where coach_id = %L', maya_c)), '1');
    f := f || pg_temp.t_eq('4n it is waiting again', (select (approved_at is null)::text from public.coach_profiles where coach_id = maya_c), 'true');
    perform pg_temp.t_as(cov_u);
    f := f || pg_temp.t_eq('4o another associate reads none of Maya''s', (select concat((select count(*) from public.client_profiles), (select count(*) from public.client_notes), (select count(*) from public.coach_tags), (select count(*) from public.coach_views))), '0000');

    -- 5. The owner moves a client.
    perform pg_temp.t_as(own_u);
    f := f || pg_temp.t_eq('5a the owner moves Owen to themself', pg_temp.t_n(format('select public.client_move(%L, %L)::text', p_owen, own_c)), maya_c::text);
    f := f || pg_temp.t_eq('5b and reads Owen now', (select count(*)::text from public.client_profiles where id = p_owen), '1');
    f := f || pg_temp.t_eq('5c the history has both coaches', (select count(*)::text from public.client_profile_coaches where profile_id = p_owen), '2');
    f := f || pg_temp.t_eq('5d Undo moves Owen back', pg_temp.t_n(format('select public.client_move(%L, %L)::text', p_owen, maya_c)), own_c::text);
    f := f || pg_temp.t_eq('5e the moves are in the Activity log', (select count(*)::text from public.activity_log where kind = 'move' and actor_id = own_u), '2');

    -- 6. Invite and accept.
    f := f || pg_temp.t_eq('6a the owner invites Sam', pg_temp.t_n(format('select public.client_invite(%L)::text', p_sam)), '');
    perform pg_temp.t_as(other_u);
    f := f || pg_temp.t_eq('6b someone else sees no invite', (select count(*)::text from public.my_coach_invites()), '0');
    f := f || pg_temp.t_eq('6c and can''t accept Sam''s', pg_temp.t_n(format('select public.client_accept_invite(%L)', p_sam)), 'error 42501');
    perform pg_temp.t_as(sam_u);
    f := f || pg_temp.t_eq('6d Sam sees one invite, from Tess', (select string_agg(coach_first_name, ',') from public.my_coach_invites()), 'Tess');
    f := f || pg_temp.t_eq('6e Sam accepts', pg_temp.t_n(format('select public.client_accept_invite(%L)', p_sam)), 'linked');
    f := f || pg_temp.t_eq('6f Sam reads their own profile only', (select count(*)::text from public.client_profiles), '1');
    f := f || pg_temp.t_eq('6f2 Sam can''t delete their profile', pg_temp.t_rows(format('delete from public.client_profiles where id = %L', p_sam)), '0');
    f := f || pg_temp.t_eq('6g Sam reads no notes, tags or About them', (select concat((select count(*) from public.client_notes), (select count(*) from public.coach_tags), (select count(*) from public.client_about))), '000');
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('6h Tess is Sam''s coach now', (select count(*)::text from public.coach_clients where client_id = sam_u and coach_id = own_c and ended_at is null), '1');

    perform pg_temp.t_as(own_u);
    f := f || pg_temp.t_eq('6i a linked client is deleted only with the name typed, never by a plain delete', pg_temp.t_rows(format('delete from public.client_profiles where id = %L', p_sam)), '0');

    -- 7. Cover.
    perform pg_temp.t_as(own_u);
    f := f || pg_temp.t_eq('7a the owner sets cover for Sam', pg_temp.t_rows(format('insert into public.coach_cover (id, coach_id, cover_coach_id, profile_id, starts_on, ends_on) values (%L, %L, %L, %L, (now() at time zone ''Europe/London'')::date - 1, (now() at time zone ''Europe/London'')::date + 1)', cover1, own_c, cov_c, p_sam)), '1');
    perform pg_temp.t_as(cov_u);
    f := f || pg_temp.t_eq('7b before Sam agrees the cover coach reads nothing', (select concat((select count(*) from public.client_profiles), public.may_see(sam_u, 'mission'))), '0f');
    perform pg_temp.t_as(other_u);
    f := f || pg_temp.t_eq('7c someone else can''t agree for Sam', pg_temp.t_n(format('select public.cover_agree(%L)::text', cover1)), 'error 42501');
    perform pg_temp.t_as(sam_u);
    f := f || pg_temp.t_eq('7d Sam agrees', pg_temp.t_n(format('select public.cover_agree(%L)::text', cover1)), '');
    perform pg_temp.t_as(cov_u);
    f := f || pg_temp.t_eq('7e between the dates the cover coach reads Sam''s name and what Sam shares', (select concat((select count(*) from public.client_profiles where id = p_sam), public.may_see(sam_u, 'mission'), public.may_see(sam_u, 'debrief', false))), '1tf');
    f := f || pg_temp.t_eq('7f never the coach''s notes or About them', (select concat((select count(*) from public.client_notes), (select count(*) from public.client_about))), '00');
    f := f || pg_temp.t_eq('7g and can''t change the profile', pg_temp.t_rows(format('update public.client_profiles set name = ''X'' where id = %L', p_sam)), '0');
    perform pg_temp.t_admin();
    update public.coach_cover set starts_on = (now() at time zone 'Europe/London')::date - 10, ends_on = (now() at time zone 'Europe/London')::date - 1 where id = cover1;
    perform pg_temp.t_as(cov_u);
    f := f || pg_temp.t_eq('7h after the end date the cover coach reads nothing again', (select concat((select count(*) from public.client_profiles), public.may_see(sam_u, 'mission'))), '0f');
    perform pg_temp.t_admin();
    update public.coach_cover set starts_on = (now() at time zone 'Europe/London')::date + 1, ends_on = (now() at time zone 'Europe/London')::date + 9 where id = cover1;
    perform pg_temp.t_as(cov_u);
    f := f || pg_temp.t_eq('7i and nothing before the start date', (select concat((select count(*) from public.client_profiles), public.may_see(sam_u, 'mission'))), '0f');

    -- 8. Merge, Undo, delete.
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('8a a client can''t be merged with themselves', pg_temp.t_n(format('select public.client_merge(%L, %L)::text', p_ella, p_ella)), 'error 22023');
    f := f || pg_temp.t_eq('8b nor with another coach''s client', pg_temp.t_n(format('select public.client_merge(%L, %L)::text', p_ella, p_sam)), 'error 42501');
    insert into public.client_notes (profile_id, coach_id, body) values (p_dup, maya_c, 'On the duplicate');
    mrg := public.client_merge(p_ella, p_dup, '{"city": true}'::jsonb);
    f := f || pg_temp.t_eq('8c merged: one Ella left in the list, with the duplicate''s city and note', (select concat((select count(*) from public.client_profiles where merged_into is null and name like 'Ella%'), (select city from public.client_profiles where id = p_ella), (select count(*) from public.client_notes where profile_id = p_ella))), '1Leeds5');
    f := f || pg_temp.t_eq('8d merging the merged one again is refused', pg_temp.t_n(format('select public.client_merge(%L, %L)::text', p_ella, p_dup)), 'error 22023');
    f := f || pg_temp.t_eq('8e Undo puts both back', pg_temp.t_n(format('select public.client_unmerge(%L)::text', mrg)), '');
    f := f || pg_temp.t_eq('8f two again, the city and the note where they were', (select concat((select count(*) from public.client_profiles where merged_into is null and name like 'Ella%'), coalesce((select city from public.client_profiles where id = p_ella), 'none'), (select count(*) from public.client_notes where profile_id = p_dup))), '2none1');
    f := f || pg_temp.t_eq('8g Undo twice is refused', pg_temp.t_n(format('select public.client_unmerge(%L)::text', mrg)), 'error 22023');
    f := f || pg_temp.t_eq('8h delete needs the name typed', pg_temp.t_n(format('select public.client_delete(%L, ''Ella'')::text', p_dup)), 'error 22023');
    f := f || pg_temp.t_eq('8i with the name it goes', pg_temp.t_n(format('select public.client_delete(%L, ''Ella F'')::text', p_dup)), '');
    f := f || pg_temp.t_eq('8j and a dated data request is kept', (select count(*)::text from public.data_requests where kind = 'delete' and done_at is not null), '1');
    f := f || pg_temp.t_eq('8k she can''t delete the owner''s client', pg_temp.t_n(format('select public.client_delete(%L, ''Sam Okafor'')::text', p_sam)), 'error 42501');

    -- 9. Engagements, time, files.
    f := f || pg_temp.t_eq('9a an engagement of 6 sessions every 2 weeks', pg_temp.t_rows(format('insert into public.engagements (id, coach_id, profile_id, kind, sessions_total, default_minutes, every_weeks, time_credit_minutes) values (%L, %L, %L, ''sessions'', 6, 60, 2, 600)', eng1, maya_c, p_ella)), '1');
    f := f || pg_temp.t_eq('9b not for the owner''s client', pg_temp.t_rows(format('insert into public.engagements (coach_id, profile_id, kind) values (%L, %L, ''ongoing'')', maya_c, p_sam)), 'error 42501');
    f := f || pg_temp.t_eq('9c a pack and a project', pg_temp.t_rows(format('with a as (insert into public.engagement_packs (engagement_id, sessions) values (%L, 4) returning 1) insert into public.engagement_projects (id, engagement_id, name) values (%L, %L, ''Offsite design'')', eng1, prj1, eng1)), '1');
    f := f || pg_temp.t_eq('9d clock in', pg_temp.t_rows(format('insert into public.time_entries (engagement_id, project_id, coach_id, started_at) values (%L, %L, %L, now() - interval ''25 minutes'')', eng1, prj1, maya_c)), '1');
    f := f || pg_temp.t_eq('9e a second running clock is refused', pg_temp.t_rows(format('insert into public.time_entries (engagement_id, project_id, coach_id, started_at) values (%L, %L, %L, now())', eng1, prj1, maya_c)), 'error 23505');
    f := f || pg_temp.t_eq('9f clock out', pg_temp.t_rows(format('update public.time_entries set ended_at = now() where coach_id = %L and ended_at is null', maya_c)), '1');
    f := f || pg_temp.t_eq('9g a file from the coach', pg_temp.t_rows(format('insert into public.client_files (profile_id, name, storage_path, added_by, added_by_user) values (%L, ''Chart.pdf'', %L, ''coach'', %L)', p_ella, p_ella || '/chart.pdf', maya_u)), '1');
    f := f || pg_temp.t_eq('9h she can''t add one as the client', pg_temp.t_rows(format('insert into public.client_files (profile_id, name, storage_path, added_by, added_by_user) values (%L, ''x'', ''x'', ''client'', %L)', p_ella, maya_u)), 'error 42501');
    perform pg_temp.t_as(own_u);
    f := f || pg_temp.t_eq('9i the owner reads Maya''s engagement and its time (admin facts)', (select concat((select count(*) from public.engagements where id = eng1), (select count(*) from public.time_entries where engagement_id = eng1), (select count(*) from public.engagement_packs where engagement_id = eng1))), '111');
    f := f || pg_temp.t_eq('9j with sessions in total from the packs too', (select concat(sessions_total, '/', sessions_held) from public.coach_admin_clients() where profile_id = p_ella), '10/0');
    f := f || pg_temp.t_eq('9k but can''t change it or read her client''s files', (select concat(pg_temp.t_rows(format('update public.engagements set sessions_total = 1 where id = %L', eng1)), (select count(*) from public.client_files))), '00');
    f := f || pg_temp.t_eq('9l a file on the owner''s client', pg_temp.t_rows(format('insert into public.client_files (profile_id, name, storage_path, added_by, added_by_user) values (%L, ''Plan.pdf'', %L, ''coach'', %L)', p_sam, p_sam || '/plan.pdf', own_u)), '1');
    perform pg_temp.t_as(sam_u);
    f := f || pg_temp.t_eq('9m Sam reads it and adds their own', (select concat((select count(*) from public.client_files), pg_temp.t_rows(format('insert into public.client_files (profile_id, name, storage_path, added_by, added_by_user) values (%L, ''Hogan.pdf'', %L, ''client'', %L)', p_sam, p_sam || '/hogan.pdf', sam_u)))), '11');
    f := f || pg_temp.t_eq('9n Sam can''t add to someone else''s', pg_temp.t_rows(format('insert into public.client_files (profile_id, name, storage_path, added_by, added_by_user) values (%L, ''x'', ''x'', ''client'', %L)', p_ella, sam_u)), 'error 42501');
    f := f || pg_temp.t_eq('9o Sam reads no engagement, time or request', (select concat((select count(*) from public.engagements), (select count(*) from public.time_entries), (select count(*) from public.data_requests))), '000');
    perform pg_temp.t_as(own_u);
    f := f || pg_temp.t_eq('9p the owner asks to view Sam''s portal', pg_temp.t_rows(format('insert into public.client_view_requests (profile_id, coach_id) values (%L, %L)', p_sam, own_c)), '1');
    perform pg_temp.t_as(sam_u);
    f := f || pg_temp.t_eq('9q Sam says yes, for 30 minutes', pg_temp.t_n('select public.client_view_answer((select id from public.client_view_requests limit 1), true)::text'), '');
    f := f || pg_temp.t_eq('9r it runs out in 30 minutes', (select (expires_at between now() + interval '29 minutes' and now() + interval '31 minutes')::text from public.client_view_requests limit 1), 'true');

    -- 11. A workshop, from outside.
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('11a Maya makes a workshop for 2', pg_temp.t_rows(format('insert into public.workshops (id, coach_id, organisation_id, title, capacity, registration_open, questions) values (%L, %L, %L, ''Leading under pressure'', 2, true, ''[{"q":"Your role","needed":true}]'')', ws, maya_c, org)), '1');
    select page_key into ws_key from public.workshops where id = ws;
    f := f || pg_temp.t_eq('11b pasted attendees', pg_temp.t_rows(format('insert into public.workshop_attendees (workshop_id, name, email) values (%L, ''Dana W'', ''dana@example.invalid'')', ws)), '1');
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('11c signed out reads no table', concat(pg_temp.t_n('select count(*)::text from public.workshops'), '|', pg_temp.t_n('select count(*)::text from public.workshop_attendees'), '|', pg_temp.t_n('select count(*)::text from public.client_profiles'), '|', pg_temp.t_n('select count(*)::text from public.coach_notifications')), 'error 42501|error 42501|error 42501|error 42501');
    f := f || pg_temp.t_eq('11d the page shows 1 of 2 taken', (select concat(j ->> 'title', '/', j ->> 'taken', '/', j ->> 'capacity', '/', j ->> 'open') from public.workshop_page(ws_key) j), 'Leading under pressure/1/2/true');
    f := f || pg_temp.t_eq('11e a wrong key shows nothing', coalesce(public.workshop_page(gen_random_uuid())::text, 'nothing'), 'nothing');
    f := f || pg_temp.t_eq('11f the last place', public.workshop_register(ws_key, 'Femi A', 'Femi@Example.invalid', '{"Your role":"Lead"}'), 'registered');
    f := f || pg_temp.t_eq('11g then the waiting list', public.workshop_register(ws_key, 'Grace L', 'grace@example.invalid'), 'waiting');
    f := f || pg_temp.t_eq('11h the same email again', public.workshop_register(ws_key, 'Femi A', 'femi@example.invalid'), 'already_registered');
    f := f || pg_temp.t_eq('11i two addresses in one are refused', public.workshop_register(ws_key, 'X', 'a@example.invalid, b@example.invalid'), 'email');
    f := f || pg_temp.t_eq('11j no name is refused', public.workshop_register(ws_key, '  ', 'h@example.invalid'), 'name');
    f := f || pg_temp.t_eq('11k signed out can''t call a coach''s function', pg_temp.t_n('select public.coach_list()::text'), 'error 42501');
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('11l Maya sees 2 registered and 1 waiting', (select string_agg(status || ':' || n, ',' order by status) from (select status, count(*) n from public.workshop_attendees where workshop_id = ws group by status) s), 'registered:2,waiting:1');
    f := f || pg_temp.t_eq('11m she ticks attendance', pg_temp.t_rows(format('update public.workshop_attendees set attended = true where workshop_id = %L and email = ''femi@example.invalid''', ws)), '1');
    f := f || pg_temp.t_eq('11n the bell has both', (select count(*)::text from public.coach_notifications where kind = 'workshop'), '2');
    select survey_key into s_key from public.workshop_attendees where workshop_id = ws and email = 'femi@example.invalid';
    perform pg_temp.t_as(cov_u);
    f := f || pg_temp.t_eq('11o another coach reads none of it', (select concat((select count(*) from public.workshops), (select count(*) from public.workshop_attendees))), '00');
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('11p the survey saves once', concat(public.workshop_survey_answer(s_key, '{"useful":5}'), '/', public.workshop_survey_answer(s_key, '{"useful":1}')), 'saved/already');
    perform pg_temp.t_as(maya_u);
    f := f || pg_temp.t_eq('11q Maya reads the answer', (select answers ->> 'useful' from public.workshop_survey_answers where workshop_id = ws), '5');
    f := f || pg_temp.t_eq('11r a group, with what each member counts against', concat(pg_temp.t_rows(format('insert into public.coach_groups (coach_id, organisation_id, name) values (%L, %L, ''Leadership team'')', maya_c, org)), pg_temp.t_rows(format('insert into public.coach_group_members (group_id, profile_id, name, counts_against) select id, %L, ''Ella Fraser'', ''own'' from public.coach_groups', p_ella))), '11');
    f := f || pg_temp.t_eq('11s not with the owner''s client as a member', pg_temp.t_rows(format('insert into public.coach_group_members (group_id, profile_id, name) select id, %L, ''Sam'' from public.coach_groups limit 1', p_sam)), 'error 42501');

    -- 12. The bell and the Activity log.
    f := f || pg_temp.t_eq('12a she marks them read', pg_temp.t_rows('update public.coach_notifications set read_at = now(), title = ''Changed'' where read_at is null'), '3');
    f := f || pg_temp.t_eq('12b and nothing else about them changes', (select count(*)::text from public.coach_notifications where title = 'Changed'), '0');
    f := f || pg_temp.t_eq('12c she can''t add one', pg_temp.t_rows(format('insert into public.coach_notifications (coach_id, kind, title) values (%L, ''other'', ''x'')', maya_c)), 'error 42501');
    f := f || pg_temp.t_eq('12d she records an export', pg_temp.t_n('select public.log_activity(''export'', ''exported 2 clients.'')::text'), '');
    f := f || pg_temp.t_eq('12e but not a price change', pg_temp.t_n('select public.log_activity(''price'', ''x'')::text'), 'error 22023');
    perform pg_temp.t_as(sam_u);
    f := f || pg_temp.t_eq('12f a client can''t write to the log', pg_temp.t_n('select public.log_activity(''export'', ''x'')::text'), 'error 42501');
    perform pg_temp.t_as(own_u);
    f := f || pg_temp.t_eq('12g the owner reads the log: moves, a profile, a merge and its Undo, a delete, an export', (select string_agg(kind || ':' || n, ',' order by kind) from (select kind, count(*) n from public.activity_log where actor_id in (own_u, maya_u) group by kind) s), 'coach:1,delete:1,export:1,merge:2,move:2');
    f := f || pg_temp.t_eq('12h the log can''t be changed', pg_temp.t_rows('update public.activity_log set summary = ''x'''), 'error 42501');

    perform pg_temp.t_admin();
    raise exception 'undo the test rows' using errcode = 'P0049';
  exception when sqlstate 'P0049' then
    perform pg_temp.t_admin();
  end;

  if cardinality(f) > 0 then
    raise exception E'049 FAILED (%):\n%', cardinality(f), array_to_string(f, E'\n');
  end if;
  raise notice '049 CHECKS PASSED';
end
$t$;
