-- =============================================================================
-- 041_confidence_bank_labels_test.sql
-- Checks 041_confidence_bank_labels.sql. RUN ORDER: 026, 031, 033, 041, then this.
--
-- WHAT IT DOES
--   Reads only (it makes nothing):
--     1. sharing_parts() still lists the same ten parts, with the same
--        audience, starting choice and per-item setting as 033, and only
--        the 'evidence' label changed, to "Confidence Bank, chosen each
--        time"; signed-in people can still call it and signed-out people
--        still can't;
--     2. evidence_claims C10 and evidence_tools 'performance_evidence' say
--        Confidence Bank, their keys unchanged, and no other row of either
--        table changed its words;
--     3. "Performance Evidence" is left in none of the three places;
--     4. the migration recorded itself.
--
--   It ends with the notice 041 CHECKS PASSED, or stops with FAILED and a
--   list naming each check that failed.
-- =============================================================================

do $test$
declare
  bad text[] := '{}';
  n integer;
  t text;
begin
  -- 1. the parts list
  select count(*) into n from public.sharing_parts();
  if n <> 10 then bad := bad || format('sharing_parts lists %s parts, not 10', n); end if;
  select label into t from public.sharing_parts() where part = 'evidence';
  if t is distinct from 'Confidence Bank, chosen each time' then bad := bad || format('the evidence label is "%s"', t); end if;
  select count(*) into n from public.sharing_parts() s
   where (s.part, s.audience, s.default_on, s.per_item) in (
     ('mission', 'coach', true, false), ('checkin', 'coach', true, false), ('progress', 'coach', false, false),
     ('debrief', 'coach', false, true), ('sweet_spot', 'coach', false, true), ('session_prep', 'coach', false, true),
     ('evidence', 'coach', false, true), ('recharge', 'coach', false, true), ('recovery_notice', 'coach', true, true),
     ('org_wellbeing', 'organisation', false, true));
  if n <> 10 then bad := bad || format('only %s of the 10 parts keep their settings', n); end if;
  select count(*) into n from public.sharing_parts() s
   where s.label in ('Mission', 'Monthly check-in, including the First check-in',
     'Progress: scores, Outcome Objective figures, the sprint at a glance and patterns',
     'Weekly debrief, chosen each week', 'Find my sweet spot, chosen each time', 'Session prep, chosen each time',
     'Recovery: what would help you recharge, chosen each day',
     'Recovery: that it started and until when ("Let [coach] know")',
     'Wellbeing: Hardware and Software scores and areas, named, to the sponsor and leaders, chosen for each organisation');
  if n <> 9 then bad := bad || format('%s of the 9 other labels are as they were, not 9', n); end if;
  if not has_function_privilege('authenticated', 'public.sharing_parts()', 'execute') then bad := bad || 'signed-in people can no longer call sharing_parts'; end if;
  if has_function_privilege('anon', 'public.sharing_parts()', 'execute') then bad := bad || 'signed-out people can call sharing_parts'; end if;

  -- 2. the evidence library
  select where_it_shows into t from public.evidence_claims where id = 'C10';
  if t is distinct from 'Small-win ticks, unplanned wins, Confidence Bank' then bad := bad || format('C10 shows in "%s"', t); end if;
  select name into t from public.evidence_tools where key = 'performance_evidence';
  if t is distinct from 'Confidence Bank' then bad := bad || format('the tool is named "%s"', t); end if;
  select count(*) into n from public.evidence_tools where name = 'Confidence Bank';
  if n <> 1 then bad := bad || format('%s tools are named Confidence Bank, not 1', n); end if;

  -- 3. none left
  select count(*) into n from public.sharing_parts() where label like '%Performance Evidence%';
  if n > 0 then bad := bad || 'sharing_parts still says Performance Evidence'; end if;
  select count(*) into n from public.evidence_claims where where_it_shows like '%Performance Evidence%' or wording like '%Performance Evidence%';
  if n > 0 then bad := bad || format('%s claims still say Performance Evidence', n); end if;
  select count(*) into n from public.evidence_tools where name like '%Performance Evidence%' or based_on like '%Performance Evidence%';
  if n > 0 then bad := bad || format('%s tools still say Performance Evidence', n); end if;

  -- 4. recorded
  if to_regclass('public.migration_log') is not null then
    select count(*) into n from public.migration_log where number = 41;
    if n < 1 then bad := bad || '041 did not record itself'; end if;
  end if;

  if array_length(bad, 1) > 0 then
    raise exception 'FAILED: %', array_to_string(bad, '; ');
  end if;
  raise notice '041 CHECKS PASSED';
end
$test$;
