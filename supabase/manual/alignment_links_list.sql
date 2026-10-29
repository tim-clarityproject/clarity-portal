-- =============================================================================
-- alignment_links_list.sql: every Health Check link, for Tim to check whose
-- each one is (read only)
--
-- WHAT THIS DOES (plain English)
--   Lists each Health Check link: its id, the organisation, the day it was
--   made (UK time), whether a coach is recorded on it, and that coach's first
--   name. It shows no email addresses and no answers, and changes nothing.
--   Use it to pick out Adie's links, then paste their ids into
--   alignment_links_set_coach.sql, only after Tim has said yes.
--
-- HOW TO RUN
--   Supabase, the project, SQL Editor, New query: paste this file and press
--   Run. It works before and after 036 (before 036, no link has a coach
--   recorded, so the last two columns say no and nothing).
-- =============================================================================

select s.id                                                            as link_id,
       s.client_label                                                  as organisation,
       to_char(s.created_at at time zone 'Europe/London', 'Dy DD Mon YYYY') as created,
       case when to_jsonb(s) ->> 'coach_user_id' is not null then 'yes' else 'no' end as coach_recorded,
       case when to_jsonb(s) ->> 'coach_user_id' is not null then to_jsonb(s) ->> 'coach_name' end as coach
  from public.alignment_sessions s
 order by s.created_at, s.client_label;
