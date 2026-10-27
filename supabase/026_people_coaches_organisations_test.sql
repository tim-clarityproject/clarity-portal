-- =============================================================================
-- 026_people_coaches_organisations_test.sql
-- Checks 026_people_coaches_organisations.sql. RUN ORDER: 026 first, then this.
--
-- WHAT IT DOES
--   Makes invented people (owner coach, second coach, their clients, someone
--   without a coach, an organisation with nested teams, a sponsor, leaders,
--   an admin, a member who leaves), acts as each of them, and checks who can
--   see and change what. Everything it makes is undone at the end, so
--   nothing is left behind (in the SQL editor too).
--
--   It ends with the notice ALL CHECKS PASSED, or stops with FAILED and a
--   list naming each check that failed.
-- =============================================================================

-- ---------------------------------------------------------------- helpers
-- Temporary (this session only). t_as acts as a signed-in person, as
-- Supabase does for the app; t_anon as someone signed out; t_admin goes
-- back to the admin role. t_n runs a query and returns its first value as
-- text, t_rows runs a change and returns how many rows it changed; both
-- return 'error <code>' instead of stopping (42501 means refused).
create or replace function pg_temp.t_as(p uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
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
  insert into auth.users (id, email, aud, role)
  values (u, 'p1-test-' || p_label || '-' || u || '@example.invalid', 'authenticated', 'authenticated');
  update public.profiles set first_name = initcap(p_label), last_name = 'Test' where id = u;
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

-- ---------------------------------------------------------------- the checks
do $t$
declare
  f text[] := '{}';
  owner_u uuid; coach2_u uuid; client_a uuid; client_b uuid; loner uuid;
  sponsor_u uuid; lead_parent uuid; lead_child uuid; lead_other uuid; admin_u uuid; admin2_u uuid;
  member_u uuid; leaver_u uuid; outsider uuid;
  owner_c uuid; coach2_c uuid;
  org1 uuid; org2 uuid; t_parent uuid; t_child uuid; t_other uuid; t_org2 uuid;
  m_member uuid; m_leaver uuid; tok text;
begin
  begin
    -- ------------------------------------------------ fixtures (as admin)
    owner_u := pg_temp.t_user('owner'); coach2_u := pg_temp.t_user('coachtwo');
    client_a := pg_temp.t_user('clienta'); client_b := pg_temp.t_user('clientb'); loner := pg_temp.t_user('loner');
    sponsor_u := pg_temp.t_user('sponsor'); lead_parent := pg_temp.t_user('leadparent'); lead_child := pg_temp.t_user('leadchild');
    lead_other := pg_temp.t_user('leadother'); admin_u := pg_temp.t_user('admin'); admin2_u := pg_temp.t_user('admintwo');
    member_u := pg_temp.t_user('member'); leaver_u := pg_temp.t_user('leaver'); outsider := pg_temp.t_user('outsider');
    insert into public.coaches (user_id, role, display_first_name, mobile, contact_ways)
      values (owner_u, 'owner', 'Owner', '+447700900001', array['email', 'whatsapp']) returning id into owner_c;
    insert into public.coaches (user_id, role, display_first_name) values (coach2_u, 'coach', 'Coachtwo') returning id into coach2_c;
    insert into public.coach_clients (client_id, coach_id) values (client_a, owner_c), (client_b, coach2_c);
    insert into public.organisations (name) values ('Invented Org One') returning id into org1;
    insert into public.organisations (name) values ('Invented Org Two') returning id into org2;
    insert into public.organisation_billing (organisation_id, price_per_seat_month) values (org1, 100);
    insert into public.teams (organisation_id, name) values (org1, 'Parent') returning id into t_parent;
    insert into public.teams (organisation_id, name, parent_team_id) values (org1, 'Child', t_parent) returning id into t_child;
    insert into public.teams (organisation_id, name) values (org1, 'Other') returning id into t_other;
    insert into public.teams (organisation_id, name) values (org2, 'Elsewhere') returning id into t_org2;
    insert into public.organisation_admins (organisation_id, user_id) values (org1, admin_u), (org2, admin2_u);
    insert into public.organisation_members (organisation_id, user_id) values (org1, member_u) returning id into m_member;
    insert into public.organisation_members (organisation_id, user_id) values (org1, leaver_u) returning id into m_leaver;
    insert into public.team_members (member_id, team_id) values (m_member, t_child), (m_leaver, t_child);
    insert into public.seat_sponsors (member_id, sponsor_user_id) values (m_member, sponsor_u), (m_leaver, sponsor_u);
    insert into public.leader_teams (user_id, team_id) values (lead_parent, t_parent), (lead_child, t_child), (lead_other, t_other);

    -- ------------------------------------------------ 1. own settings only
    perform pg_temp.t_as(client_a);
    f := f || pg_temp.t_eq('1a client adds own settings', pg_temp.t_rows(format('insert into public.person_settings (user_id, describes_you, country) values (%L, ''leader'', ''GB'')', client_a)), '1');
    f := f || pg_temp.t_eq('1b settings for someone else refused', pg_temp.t_rows(format('insert into public.person_settings (user_id) values (%L)', client_b)), 'error 42501');
    f := f || pg_temp.t_eq('1c a bad country refused', pg_temp.t_rows(format('update public.person_settings set country = ''gb'' where user_id = %L', client_a)), 'error 23514');
    f := f || pg_temp.t_eq('1d a working pattern with 8 days refused', pg_temp.t_rows(format('insert into public.working_patterns (user_id, starts_on, days) values (%L, current_date, ''{0,1,2,3,4,5,6,7}'')', client_a)), 'error 23514');
    f := f || pg_temp.t_eq('1e a 3-day working pattern', pg_temp.t_rows(format('insert into public.working_patterns (user_id, starts_on, days) values (%L, current_date, ''{0,2,4}'')', client_a)), '1');
    perform pg_temp.t_as(owner_u);
    f := f || pg_temp.t_eq('1f the owner can''t read a client''s settings', pg_temp.t_n('select count(*) from public.person_settings'), '0');
    f := f || pg_temp.t_eq('1g the owner can''t read a client''s working pattern', pg_temp.t_n('select count(*) from public.working_patterns'), '0');

    -- ------------------------------------------------ 2. coaches and their clients
    perform pg_temp.t_as(coach2_u);
    f := f || pg_temp.t_eq('2a a coach reads only their own coach row', pg_temp.t_n('select count(*) from public.coaches'), '1');
    f := f || pg_temp.t_eq('2b a coach sees only their own clients', pg_temp.t_n('select count(*) from public.coach_clients'), '1');
    f := f || pg_temp.t_eq('2c a coach can''t take a client', pg_temp.t_rows(format('insert into public.coach_clients (client_id, coach_id) values (%L, %L)', loner, coach2_c)), 'error 42501');
    f := f || pg_temp.t_eq('2d a coach can''t make themselves owner', pg_temp.t_rows(format('update public.coaches set role = ''owner'' where id = %L', coach2_c)), '0');
    f := f || pg_temp.t_eq('2e a coach is coach of their client', pg_temp.t_n(format('select public.is_coach_of(%L)', client_b)), 'true');
    f := f || pg_temp.t_eq('2f and not of the owner''s client', pg_temp.t_n(format('select public.is_coach_of(%L)', client_a)), 'false');
    perform pg_temp.t_as(owner_u);
    f := f || pg_temp.t_eq('2g the owner reads every coach link', pg_temp.t_n(format('select count(*) from public.coach_clients where client_id in (%L, %L)', client_a, client_b)), '2');
    f := f || pg_temp.t_eq('2h one current coach per client', pg_temp.t_rows(format('insert into public.coach_clients (client_id, coach_id) values (%L, %L)', client_a, coach2_c)), 'error 23505');
    perform pg_temp.t_as(client_a);
    f := f || pg_temp.t_eq('2i a client reads their own coach link', pg_temp.t_n('select count(*) from public.coach_clients'), '1');
    f := f || pg_temp.t_eq('2j a client can''t read the coaches table', pg_temp.t_n('select count(*) from public.coaches'), '0');
    f := f || pg_temp.t_eq('2k my_coach gives the first name', pg_temp.t_n('select first_name from public.my_coach()'), 'Owner');
    perform pg_temp.t_as(loner);
    f := f || pg_temp.t_eq('2l no coach, no my_coach row', pg_temp.t_n('select count(*) from public.my_coach()'), '0');

    -- ------------------------------------------------ 3. the checked helper
    perform pg_temp.t_as(owner_u);
    f := f || pg_temp.t_eq('3a coach sees mission (on by default)', pg_temp.t_n(format('select public.may_see(%L, ''mission'')', client_a)), 'true');
    f := f || pg_temp.t_eq('3b coach doesn''t see progress (off by default)', pg_temp.t_n(format('select public.may_see(%L, ''progress'')', client_a)), 'false');
    f := f || pg_temp.t_eq('3c a debrief week shared', pg_temp.t_n(format('select public.may_see(%L, ''debrief'', true)', client_a)), 'true');
    f := f || pg_temp.t_eq('3d a debrief week not shared', pg_temp.t_n(format('select public.may_see(%L, ''debrief'', false)', client_a)), 'false');
    f := f || pg_temp.t_eq('3e the owner sees no part of another coach''s client', pg_temp.t_n(format('select public.may_see(%L, ''mission'')', client_b)), 'false');
    f := f || pg_temp.t_eq('3f nobody sees a person without a coach', pg_temp.t_n(format('select public.may_see(%L, ''mission'')', loner)), 'false');
    f := f || pg_temp.t_eq('3g an unknown part is an error', pg_temp.t_n(format('select public.may_see(%L, ''journal'')', client_a)), 'error 22023');
    perform pg_temp.t_as(client_a);
    f := f || pg_temp.t_eq('3h the client switches progress on', pg_temp.t_rows(format('insert into public.sharing_switches (user_id, part, is_on) values (%L, ''progress'', true)', client_a)), '1');
    f := f || pg_temp.t_eq('3i a per-item part can''t be a switch', pg_temp.t_rows(format('insert into public.sharing_switches (user_id, part, is_on) values (%L, ''debrief'', true)', client_a)), 'error 22023');
    f := f || pg_temp.t_eq('3j someone else''s switch refused', pg_temp.t_rows(format('insert into public.sharing_switches (user_id, part, is_on) values (%L, ''mission'', true)', client_b)), 'error 42501');
    perform pg_temp.t_as(owner_u);
    f := f || pg_temp.t_eq('3k coach sees progress once on', pg_temp.t_n(format('select public.may_see(%L, ''progress'')', client_a)), 'true');
    perform pg_temp.t_as(client_a);
    perform pg_temp.t_rows(format('update public.sharing_switches set is_on = false where user_id = %L and part = ''progress''', client_a));
    perform pg_temp.t_rows(format('insert into public.sharing_switches (user_id, part, is_on) values (%L, ''mission'', false)', client_a));
    f := f || pg_temp.t_eq('3l every change is kept in the history', pg_temp.t_n('select count(*) from public.sharing_switch_history'), '3');
    perform pg_temp.t_as(owner_u);
    f := f || pg_temp.t_eq('3m switched off again: hidden', pg_temp.t_n(format('select public.may_see(%L, ''progress'')', client_a)), 'false');
    f := f || pg_temp.t_eq('3n mission switched off: hidden', pg_temp.t_n(format('select public.may_see(%L, ''mission'')', client_a)), 'false');
    f := f || pg_temp.t_eq('3o nobody else can ask whether a switch is on', pg_temp.t_n(format('select public.sharing_is_on(%L, ''mission'')', client_a)), 'error 42501');
    -- a coach who is switched off sees nothing
    perform pg_temp.t_admin();
    update public.coaches set active = false where id = coach2_c;
    perform pg_temp.t_as(coach2_u);
    f := f || pg_temp.t_eq('3p a switched-off coach sees nothing', pg_temp.t_n(format('select public.may_see(%L, ''mission'')', client_b)), 'false');
    perform pg_temp.t_admin();
    update public.coaches set active = true where id = coach2_c;
    -- a client who moves to another coach: the old coach sees nothing
    update public.coach_clients set ended_at = now() where client_id = client_b;
    insert into public.coach_clients (client_id, coach_id) values (client_b, owner_c);
    perform pg_temp.t_as(coach2_u);
    f := f || pg_temp.t_eq('3q the previous coach sees nothing', pg_temp.t_n(format('select public.may_see(%L, ''mission'')', client_b)), 'false');
    perform pg_temp.t_as(owner_u);
    f := f || pg_temp.t_eq('3r the new coach sees the mission', pg_temp.t_n(format('select public.may_see(%L, ''mission'')', client_b)), 'true');

    -- ------------------------------------------------ 4. organisations, teams and memberships
    perform pg_temp.t_as(admin_u);
    f := f || pg_temp.t_eq('4a an admin adds a team', pg_temp.t_rows(format('insert into public.teams (organisation_id, name, parent_team_id) values (%L, ''Grandchild'', %L)', org1, t_child)), '1');
    f := f || pg_temp.t_eq('4b not in another organisation', pg_temp.t_rows(format('insert into public.teams (organisation_id, name) values (%L, ''Sneaky'')', org2)), 'error 42501');
    f := f || pg_temp.t_eq('4c a team can''t sit below itself', pg_temp.t_rows(format('update public.teams set parent_team_id = %L where id = %L', t_child, t_parent)), 'error 23514');
    f := f || pg_temp.t_eq('4d a parent in another organisation refused', pg_temp.t_rows(format('update public.teams set parent_team_id = %L where id = %L', t_org2, t_other)), 'error 23514');
    f := f || pg_temp.t_eq('4e an admin can''t read billing', pg_temp.t_n('select count(*) from public.organisation_billing'), '0');
    f := f || pg_temp.t_eq('4f an admin can''t mark someone as confirmed', pg_temp.t_rows(format('update public.organisation_members set confirmed_at = now() where id = %L', m_member)), '1');
    f := f || pg_temp.t_eq('4g ... it stays unconfirmed', pg_temp.t_n(format('select confirmed_at is null from public.organisation_members where id = %L', m_member)), 'true');
    perform pg_temp.t_rows(format('insert into public.organisation_members (organisation_id, user_id, confirmed_at) values (%L, %L, now())', org1, loner));
    f := f || pg_temp.t_eq('4h someone an admin adds is never confirmed by them', pg_temp.t_n(format('select confirmed_at is null from public.organisation_members where user_id = %L', loner)), 'true');
    f := f || pg_temp.t_eq('4i an admin sees the organisation''s current members', pg_temp.t_n(format('select count(*) from public.organisation_members where organisation_id = %L', org1)), '3');
    f := f || pg_temp.t_eq('4j an admin sees no personal data (settings)', pg_temp.t_n('select count(*) from public.person_settings'), '0');
    perform pg_temp.t_as(admin2_u);
    f := f || pg_temp.t_eq('4k another organisation''s admin sees nothing of org one', pg_temp.t_n(format('select count(*) from public.organisation_members where organisation_id = %L', org1)), '0');
    f := f || pg_temp.t_eq('4l ... nor its teams', pg_temp.t_n(format('select count(*) from public.teams where organisation_id = %L', org1)), '0');
    perform pg_temp.t_as(outsider);
    f := f || pg_temp.t_eq('4m an outsider can''t read the organisation', pg_temp.t_n(format('select count(*) from public.organisations where id = %L', org1)), '0');
    perform pg_temp.t_as(member_u);
    f := f || pg_temp.t_eq('4n a member reads their organisation', pg_temp.t_n(format('select count(*) from public.organisations where id = %L', org1)), '1');
    f := f || pg_temp.t_eq('4o a member confirms their membership', pg_temp.t_n(format('select public.membership_confirm(%L)', m_member)), 'true');
    f := f || pg_temp.t_eq('4p ... but not someone else''s', pg_temp.t_n(format('select public.membership_confirm(%L)', m_leaver)), 'false');
    perform pg_temp.t_as(leaver_u);
    perform pg_temp.t_n(format('select public.membership_confirm(%L)', m_leaver));

    -- ------------------------------------------------ 5. organisation wellbeing
    perform pg_temp.t_as(sponsor_u);
    f := f || pg_temp.t_eq('5a off by default: the sponsor sees nothing', pg_temp.t_n(format('select public.may_see(%L, ''org_wellbeing'')', member_u)), 'false');
    f := f || pg_temp.t_eq('5b a sponsor never sees the coach parts', pg_temp.t_n(format('select public.may_see(%L, ''mission'')', member_u)), 'false');
    perform pg_temp.t_as(member_u);
    perform pg_temp.t_rows(format('insert into public.sharing_switches (user_id, part, is_on) values (%L, ''org_wellbeing'', true)', member_u));
    perform pg_temp.t_as(leaver_u);
    perform pg_temp.t_rows(format('insert into public.sharing_switches (user_id, part, is_on) values (%L, ''org_wellbeing'', true)', leaver_u));
    perform pg_temp.t_as(sponsor_u);
    f := f || pg_temp.t_eq('5c switched on: the sponsor sees it', pg_temp.t_n(format('select public.may_see(%L, ''org_wellbeing'')', member_u)), 'true');
    perform pg_temp.t_as(lead_parent);
    f := f || pg_temp.t_eq('5d a leader over the parent team sees it', pg_temp.t_n(format('select public.may_see(%L, ''org_wellbeing'')', member_u)), 'true');
    f := f || pg_temp.t_eq('5e a leader''s scope reaches every team below', pg_temp.t_n('select count(*) from public.my_leader_team_ids()'), '3');
    perform pg_temp.t_as(lead_child);
    f := f || pg_temp.t_eq('5f a leader over the child team sees it', pg_temp.t_n(format('select public.may_see(%L, ''org_wellbeing'')', member_u)), 'true');
    f := f || pg_temp.t_eq('5g a child leader''s scope doesn''t reach up', pg_temp.t_n(format('select count(*) from public.my_leader_team_ids() t where t = %L', t_parent)), '0');
    perform pg_temp.t_as(lead_other);
    f := f || pg_temp.t_eq('5h a leader of another team doesn''t', pg_temp.t_n(format('select public.may_see(%L, ''org_wellbeing'')', member_u)), 'false');
    perform pg_temp.t_as(admin_u);
    f := f || pg_temp.t_eq('5i the admin doesn''t', pg_temp.t_n(format('select public.may_see(%L, ''org_wellbeing'')', member_u)), 'false');
    -- the leaver leaves: nothing named about them again
    f := f || pg_temp.t_eq('5i2 an admin can''t mark someone as left by a plain change', pg_temp.t_rows(format('update public.organisation_members set ended_on = current_date where id = %L', m_leaver)), 'error 42501');
    f := f || pg_temp.t_eq('5i3 the admin ends the membership', pg_temp.t_n(format('select public.membership_end(%L)', m_leaver)), 'true');
    perform pg_temp.t_as(admin2_u);
    f := f || pg_temp.t_eq('5i4 another organisation''s admin can''t end it', pg_temp.t_n(format('select public.membership_end(%L)', m_member)), 'error 42501');
    perform pg_temp.t_as(admin_u);
    f := f || pg_temp.t_eq('5j once left, the admin no longer sees the membership', pg_temp.t_n(format('select count(*) from public.organisation_members where id = %L', m_leaver)), '0');
    f := f || pg_temp.t_eq('5k ... nor their sponsor link', pg_temp.t_n(format('select count(*) from public.seat_sponsors where member_id = %L', m_leaver)), '0');
    perform pg_temp.t_as(sponsor_u);
    f := f || pg_temp.t_eq('5l once left, the sponsor sees no wellbeing', pg_temp.t_n(format('select public.may_see(%L, ''org_wellbeing'')', leaver_u)), 'false');
    perform pg_temp.t_as(lead_parent);
    f := f || pg_temp.t_eq('5m ... nor does the leader', pg_temp.t_n(format('select public.may_see(%L, ''org_wellbeing'')', leaver_u)), 'false');
    -- someone who leaves loses the seats they sponsored and their admin role
    perform pg_temp.t_admin();
    insert into public.seat_sponsors (member_id, sponsor_user_id) values (m_member, outsider);
    insert into public.organisation_members (organisation_id, user_id, confirmed_at) values (org1, outsider, now());
    insert into public.organisation_admins (organisation_id, user_id) values (org1, outsider);
    perform pg_temp.t_as(owner_u);
    perform public.membership_end((select id from public.organisation_members where user_id = outsider and ended_on is null));
    perform pg_temp.t_admin();
    f := f || pg_temp.t_eq('5n1 a leaver''s own sponsoring ends', (select count(*)::text from public.seat_sponsors where sponsor_user_id = outsider and ended_on is null), '0');
    f := f || pg_temp.t_eq('5n2 ... and their admin role', (select count(*)::text from public.organisation_admins where user_id = outsider), '0');
    -- an admin who also leads a team gets no leader's view in that organisation
    insert into public.leader_teams (user_id, team_id) values (admin_u, t_parent);
    perform pg_temp.t_as(admin_u);
    f := f || pg_temp.t_eq('5n3 an admin who also leads sees no one as a leader', pg_temp.t_n('select count(*) from public.my_leader_team_ids()'), '0');
    perform pg_temp.t_as(leaver_u);
    f := f || pg_temp.t_eq('5n the leaver still sees their own past membership', pg_temp.t_n('select count(*) from public.organisation_members'), '1');
    perform pg_temp.t_as(owner_u);
    f := f || pg_temp.t_eq('5o the owner sees past memberships', pg_temp.t_n(format('select count(*) from public.organisation_members where id = %L', m_leaver)), '1');
    f := f || pg_temp.t_eq('5p the owner sees billing', pg_temp.t_n('select count(*) from public.organisation_billing'), '1');

    -- ------------------------------------------------ 6. invite links
    perform pg_temp.t_admin();
    tok := encode(extensions.gen_random_bytes(32), 'hex');
    insert into public.organisation_invites (organisation_id, email, token_hash) values (org1, 'new@example.invalid', encode(extensions.digest(tok, 'sha256'), 'hex'));
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('6a an invite link fills in the email', pg_temp.t_n(format('select email from public.invite_open(%L)', tok)), 'new@example.invalid');
    f := f || pg_temp.t_eq('6b a wrong link gives nothing', pg_temp.t_n(format('select count(*) from public.invite_open(%L)', repeat('0', 64))), '0');
    perform pg_temp.t_admin();
    update public.organisation_invites set expires_at = now() - interval '1 second';
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('6c an expired link gives nothing', pg_temp.t_n(format('select count(*) from public.invite_open(%L)', tok)), '0');

    -- ------------------------------------------------ 7. signed out: nothing at all
    perform pg_temp.t_anon();
    f := f || pg_temp.t_eq('7a signed out reads no table', pg_temp.t_n($q$
      select (select count(*) from public.person_settings) + (select count(*) from public.coaches) + (select count(*) from public.coach_clients)
           + (select count(*) from public.organisations) + (select count(*) from public.teams) + (select count(*) from public.organisation_members)$q$), 'error 42501');
    f := f || pg_temp.t_eq('7b signed out can''t use the helper', pg_temp.t_n(format('select public.may_see(%L, ''mission'')', client_a)), 'error 42501');

    raise exception using errcode = 'TT001', message = 'undo the test';
  exception when sqlstate 'TT001' then null;
  end;
  perform pg_temp.t_admin();
  if cardinality(f) > 0 then
    raise exception 'FAILED (% of the checks): %', cardinality(f), array_to_string(f, ' | ');
  end if;
  raise notice 'ALL CHECKS PASSED';
end
$t$;
