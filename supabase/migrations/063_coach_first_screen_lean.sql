-- =============================================================================
-- 063_coach_first_screen_lean.sql
-- Tidy follow-up 4 (25 Nov 2026), part 1, item 3: a coach portal page's
-- first screen with its sessions trimmed to what the first screens use.
--
-- WHAT THIS DOES (plain English)
--   060's coach_first_screen hands a coach portal page its first screen in
--   one answer. Most of that answer is 057's sessions (for the owner at
--   Tim's size about 1,455 sessions and as many session people, 1.15 MB of
--   the 1.9 MB answer), sent whole, with every column. The first screens
--   use them for Who needs attention, the sessions held counts, the day's
--   calls, the next-call bar and the calendar's tiles. None of those reads a
--   recap that has already been sent, and every session in the answer is the
--   coach's own.
--
--   One new function, coach_first_screen_lean, with the same six inputs,
--   gives back exactly what coach_first_screen gives (it asks it, so every
--   rule and every row is the same), with the sessions trimmed:
--     a session      without its coach_id (the same for every one: the
--                    answer says it once, as start.coach_id), and without
--                    its recap once that recap has been sent (recap_sent_at
--                    set). A recap not sent yet stays (Who needs attention
--                    asks whether it has words in it). Every other column
--                    stays as it is.
--     a session's    without created_at, and without its profile_id or
--     person         engagement_id when it is the same as its session's
--                    (the device puts it back from the session).
--   It also says start.lean = true. The portal puts back exactly what was
--   left out, shows the first screen, and then reads every session whole as
--   before (057's coach_sessions_start), so the device ends up holding what
--   it always did. Nothing on screen reads a sent recap until then: a
--   session's own page and the brief wait for the rest (coach rule 49).
--
-- WHO SEES WHAT (unchanged)
--   SECURITY INVOKER, and it only calls coach_first_screen, so every row is
--   read under its table's own rules, 054's "needs the 6-digit code" rule
--   included, and anyone who isn't an active coach with the code is refused
--   (42501) exactly as there. Closed to anyone signed out (no execute for
--   anon or PUBLIC). No table, column, rule or data changes.
--
-- Additive and safe to run twice. Needs 060 (stops without it). Before it
-- runs, the portal asks coach_first_screen itself, as it does today.
-- Test: supabase/063_coach_first_screen_lean_test.sql.
-- =============================================================================

do $$
begin
  if to_regprocedure('public.coach_first_screen(text,timestamptz,timestamptz,date,timestamptz,uuid[])') is null then
    raise exception '063 needs 060 first.';
  end if;
end
$$;

create or replace function public.coach_first_screen_lean(
  p_page text,
  p_from timestamptz,
  p_to timestamptz,
  p_today date,
  p_since timestamptz,
  p_profiles uuid[] default '{}'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v jsonb;
  v_start jsonb;
  v_sessions jsonb;
  v_people jsonb;
begin
  -- Every check, rule and row is coach_first_screen's own (it refuses anyone who isn't an active coach with the code).
  v := public.coach_first_screen(p_page, p_from, p_to, p_today, p_since, p_profiles);
  v_start := v->'start';

  -- Each session without its coach_id, and without its recap once that recap has been sent; in the same order.
  select coalesce(jsonb_agg(case when s.x->>'recap_sent_at' is not null then s.x - 'coach_id' - 'recap' else s.x - 'coach_id' end order by s.n), '[]'::jsonb)
    into v_sessions
    from jsonb_array_elements(coalesce(v_start->'sessions', '[]'::jsonb)) with ordinality as s(x, n);

  -- Each session's person without created_at, and without the profile and engagement it shares with its session.
  with by_session as (
    select x->>'id' as id, x->'profile_id' as profile_id, x->'engagement_id' as engagement_id
    from jsonb_array_elements(coalesce(v_start->'sessions', '[]'::jsonb)) x
  )
  select coalesce(jsonb_agg(
           (p.x - 'created_at')
           - (case when b.id is not null and (p.x->'profile_id') is not distinct from b.profile_id and p.x ? 'profile_id' then 'profile_id' else '' end)
           - (case when b.id is not null and (p.x->'engagement_id') is not distinct from b.engagement_id and p.x ? 'engagement_id' then 'engagement_id' else '' end)
           order by p.n), '[]'::jsonb)
    into v_people
    from jsonb_array_elements(coalesce(v_start->'people', '[]'::jsonb)) with ordinality as p(x, n)
    left join by_session b on b.id = p.x->>'session_id';

  return jsonb_set(v, '{start}', v_start || jsonb_build_object(
    'sessions', v_sessions,
    'people', v_people,
    'coach_id', public.my_coach_id(),
    'lean', true
  ));
end;
$$;
comment on function public.coach_first_screen_lean(text, timestamptz, timestamptz, date, timestamptz, uuid[]) is
  'A coach portal page''s first screen (063): coach_first_screen''s answer with its sessions trimmed to what the first screens use (no coach_id, no recap once sent; a session''s person without created_at and without what it shares with its session). Plain reads under the tables'' own rules; nothing without the 6-digit code.';
revoke all on function public.coach_first_screen_lean(text, timestamptz, timestamptz, date, timestamptz, uuid[]) from public, anon;
grant execute on function public.coach_first_screen_lean(text, timestamptz, timestamptz, date, timestamptz, uuid[]) to authenticated;

select public.record_migration(63, '063_coach_first_screen_lean');
