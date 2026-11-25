-- Local stand-in seed, part 5: the four standing test accounts the browser
-- suites sign in as (tests/target.mjs), so the suites run on the local
-- stand-in by default (Tim, 25 Nov 2026) instead of the hosted test project.
-- Invented people, example.com addresses; the password is the stand-in's one
-- password (tests/scale/local-keys.mjs). Safe on any base snapshot on its own
-- (node tests/scale/seed.mjs --from base.tar --to base-suites.tar --only 5)
-- or after parts 1 to 4. Local only: never run on a hosted database.
set session_replication_role = replica;

insert into auth.users (id, email, aud, role, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  (md5('standing-coach-owner')::uuid, 'local-coach-owner@example.com', 'authenticated', 'authenticated', now() - interval '60 days', now() - interval '60 days', now(), '{"provider":"email"}', '{}'),
  (md5('standing-coach-two')::uuid,   'local-coach-two@example.com',   'authenticated', 'authenticated', now() - interval '60 days', now() - interval '60 days', now(), '{"provider":"email"}', '{}'),
  (md5('standing-client')::uuid,      'local-client@example.com',      'authenticated', 'authenticated', now() - interval '60 days', now() - interval '60 days', now(), '{"provider":"email"}', '{}'),
  (md5('standing-org-client')::uuid,  'local-org-client@example.com',  'authenticated', 'authenticated', now() - interval '60 days', now() - interval '60 days', now(), '{"provider":"email"}', '{}')
on conflict (id) do nothing;

insert into public.profiles (id, first_name, last_name, email, terms_accepted, created_at, updated_at)
values
  (md5('standing-coach-owner')::uuid, 'Alex',   'Morgan',  'local-coach-owner@example.com', true, now() - interval '60 days', now()),
  (md5('standing-coach-two')::uuid,   'Maya',   'Collins', 'local-coach-two@example.com',   true, now() - interval '60 days', now()),
  (md5('standing-client')::uuid,      'Sam',    'Carter',  'local-client@example.com',      true, now() - interval '60 days', now()),
  (md5('standing-org-client')::uuid,  'Jordan', 'Lee',     'local-org-client@example.com',  true, now() - interval '60 days', now())
on conflict (id) do nothing;

insert into public.person_settings (user_id, time_zone, country, units, terms_version, terms_accepted_at)
select id, 'Europe/London', 'GB', 'metric', '2026-10', now() - interval '60 days'
  from (values (md5('standing-coach-owner')::uuid), (md5('standing-coach-two')::uuid), (md5('standing-client')::uuid), (md5('standing-org-client')::uuid)) v(id)
on conflict do nothing;

-- Alex is the owner unless the scale seed's owner is already there (one owner only); Maya is an associate.
insert into public.coaches (id, user_id, role, display_first_name, full_name, active, created_at)
values
  (md5('standing-coachrow-owner')::uuid, md5('standing-coach-owner')::uuid,
   case when exists (select 1 from public.coaches where role = 'owner') then 'coach' else 'owner' end, 'Alex', 'Alex Morgan', true, now() - interval '60 days'),
  (md5('standing-coachrow-two')::uuid, md5('standing-coach-two')::uuid, 'coach', 'Maya', 'Maya Collins', true, now() - interval '60 days')
on conflict (id) do nothing;

-- Both coaches have an authenticator with its code given (053, 054), so the stand-in signs them in at aal2.
insert into public.coach_authenticators (user_id, turned_on_at, factor_id, codes_made_at, codes_saved_at)
values
  (md5('standing-coach-owner')::uuid, now() - interval '30 days', md5('standing-factor-owner')::uuid, now() - interval '30 days', now() - interval '30 days'),
  (md5('standing-coach-two')::uuid,   now() - interval '30 days', md5('standing-factor-two')::uuid,   now() - interval '30 days', now() - interval '30 days')
on conflict do nothing;

-- And their saved recovery codes (053), so the sign-in goes straight to the portal.
insert into public.coach_recovery_codes (user_id, set_id, position, code_hash, made_at)
select u, md5('standing-codeset' || u::text)::uuid, p, '$2a$10$' || rpad(md5('standing-code' || u::text || p) || md5('standing-more' || u::text || p), 53, 'x'), now() - interval '30 days'
  from (values (md5('standing-coach-owner')::uuid), (md5('standing-coach-two')::uuid)) v(u), generate_series(1, 10) p
on conflict do nothing;

insert into public.coach_settings (coach_id, time_zone, working_hours)
values (md5('standing-coachrow-owner')::uuid, 'Europe/London', '{}'), (md5('standing-coachrow-two')::uuid, 'Europe/London', '{}')
on conflict do nothing;

-- Sam is Alex's client.
insert into public.coach_clients (client_id, coach_id, started_at)
values (md5('standing-client')::uuid, md5('standing-coachrow-owner')::uuid, now() - interval '50 days')
on conflict do nothing;

set session_replication_role = origin;
do $$ begin raise notice 'SEED standing accounts: 4 people, 2 coaches'; end $$;
