-- =============================================================================
-- 041_confidence_bank_labels_test.sql
-- Checks 041_confidence_bank_labels.sql. RUN ORDER: 026, 031, 033, 041, then this.
--
-- WHAT IT DOES
--   Reads only (it makes nothing):
--     1. sharing_parts() still lists the same ten parts, with the same
--        audience, starting choice and per-item setting as 033, and only
--        two labels changed: 'evidence', to "Confidence Bank, chosen each
--        time", and 'checkin', to "Monthly review, including the First
--        review"; signed-in people can still call it and signed-out people
--        still can't;
--     2. evidence_claims C10 and evidence_tools 'performance_evidence' say
--        Confidence Bank, their keys unchanged, and no other row of either
--        table changed its words;
--     3. "Performance Evidence" is left in none of the three places, and
--        "check-in" in no sharing label;
--     3a. the 10 Nov renames in the evidence library: the three tools'
--        names and the twelve claims' "where it shows", each word for word
--        (C49 only where the database has it);
--        the tools' keys unchanged; no "Plan my day", "Review my day" or
--        "check-in" left in any name or "where it shows"; and every other
--        tool name and "where it shows" exactly as 031 seeded it (counted);
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
  select label into t from public.sharing_parts() where part = 'checkin';
  if t is distinct from 'Monthly review, including the First review' then bad := bad || format('the checkin label is "%s"', t); end if;
  select count(*) into n from public.sharing_parts() s
   where (s.part, s.audience, s.default_on, s.per_item) in (
     ('mission', 'coach', true, false), ('checkin', 'coach', true, false), ('progress', 'coach', false, false),
     ('debrief', 'coach', false, true), ('sweet_spot', 'coach', false, true), ('session_prep', 'coach', false, true),
     ('evidence', 'coach', false, true), ('recharge', 'coach', false, true), ('recovery_notice', 'coach', true, true),
     ('org_wellbeing', 'organisation', false, true));
  if n <> 10 then bad := bad || format('only %s of the 10 parts keep their settings', n); end if;
  select count(*) into n from public.sharing_parts() s
   where s.label in ('Mission',
     'Progress: scores, Outcome Objective figures, the sprint at a glance and patterns',
     'Weekly debrief, chosen each week', 'Find my sweet spot, chosen each time', 'Session prep, chosen each time',
     'Recovery: what would help you recharge, chosen each day',
     'Recovery: that it started and until when ("Let [coach] know")',
     'Wellbeing: Hardware and Software scores and areas, named, to the sponsor and leaders, chosen for each organisation');
  if n <> 8 then bad := bad || format('%s of the 8 other labels are as they were, not 8', n); end if;
  if not has_function_privilege('authenticated', 'public.sharing_parts()', 'execute') then bad := bad || 'signed-in people can no longer call sharing_parts'::text; end if;
  if has_function_privilege('anon', 'public.sharing_parts()', 'execute') then bad := bad || 'signed-out people can call sharing_parts'::text; end if;

  -- 2. the evidence library
  select where_it_shows into t from public.evidence_claims where id = 'C10';
  if t is distinct from 'Small-win ticks, unplanned wins, Confidence Bank' then bad := bad || format('C10 shows in "%s"', t); end if;
  select name into t from public.evidence_tools where key = 'performance_evidence';
  if t is distinct from 'Confidence Bank' then bad := bad || format('the tool is named "%s"', t); end if;
  select count(*) into n from public.evidence_tools where name = 'Confidence Bank';
  if n <> 1 then bad := bad || format('%s tools are named Confidence Bank, not 1', n); end if;

  -- 3. none left
  select count(*) into n from public.sharing_parts() where label like '%Performance Evidence%';
  if n > 0 then bad := bad || 'sharing_parts still says Performance Evidence'::text; end if;
  select count(*) into n from public.sharing_parts() where label ilike '%check-in%';
  if n > 0 then bad := bad || format('%s sharing labels still say check-in', n); end if;
  select count(*) into n from public.evidence_claims where where_it_shows like '%Performance Evidence%' or wording like '%Performance Evidence%';
  if n > 0 then bad := bad || format('%s claims still say Performance Evidence', n); end if;
  select count(*) into n from public.evidence_tools where name like '%Performance Evidence%' or based_on like '%Performance Evidence%';
  if n > 0 then bad := bad || format('%s tools still say Performance Evidence', n); end if;

  -- 3a. the 10 Nov renames in the evidence library
  select count(*) into n from public.evidence_tools
   where (key, name) in (('plan_my_day', 'Daily plan'), ('review_my_day', 'Daily review'),
     ('hardware_and_software_check_in', 'Monthly Hardware and Software review'), ('performance_evidence', 'Confidence Bank'));
  if n <> 4 then bad := bad || format('%s of the 4 renamed tools have their new name under their old key, not 4', n); end if;
  -- Each of the twelve claims that is in this database reads as it should
  -- (a database seeded before C49 was added to the register has eleven).
  select count(*), string_agg(format('%s "%s"', c.id, c.where_it_shows), '; ' order by c.id) into n, t
    from public.evidence_claims c
    join (values
     ('C3', 'Pressure plan, Daily plan''s biggest risk'),
     ('C6', 'Weekly debrief, after-action review, Daily review'),
     ('C11', 'Monthly review, Hardware explanation, sleep patterns'),
     ('C15', 'Daily plan'),
     ('C20', 'Monthly review scoring, "green nights"'),
     ('C21', 'Monthly review movement questions'),
     ('C22', 'Monthly review sitting question'),
     ('C23', 'Monthly review alcohol questions and units guide'),
     ('C24', 'Monthly review, Daily plan, team pulse'),
     ('C30', 'First review, How it works'),
     ('C47', 'Monthly review results, What improved, M23 checks'),
     ('C49', 'Monthly review alcohol question (the units added up from the drinks counted)')
    ) as want (id, words) on want.id = c.id
   where c.where_it_shows is distinct from want.words;
  if n > 0 then bad := bad || format('%s renamed claims do not read as they should: %s', n, t); end if;
  select count(*) into n from public.evidence_claims
   where id in ('C3', 'C6', 'C11', 'C15', 'C20', 'C21', 'C22', 'C23', 'C24', 'C30', 'C47');
  if n <> 11 then bad := bad || format('%s of the 11 claims seeded from the start are there, not 11', n); end if;
  select count(*) into n from public.evidence_claims
   where where_it_shows ~* '(plan my day|review my day|check-in)';
  if n > 0 then bad := bad || format('%s claims still show an old name', n); end if;
  select count(*) into n from public.evidence_tools
   where name ~* '(plan my day|review my day|check-in)';
  if n > 0 then bad := bad || format('%s tools still have an old name', n); end if;
  -- Nothing else moved: the new names appear only where they were put.
  select count(*) into n from public.evidence_claims
   where where_it_shows ~ '(Daily plan|Daily review|Monthly review|First review|Confidence Bank)'
     and id not in ('C3', 'C6', 'C10', 'C11', 'C15', 'C20', 'C21', 'C22', 'C23', 'C24', 'C30', 'C47', 'C49');
  if n > 0 then bad := bad || format('%s other claims show a new name', n); end if;
  select count(*) into n from public.evidence_tools where name ~ '(Daily plan|Daily review|Monthly .*review|First review|Confidence Bank)';
  if n <> 4 then bad := bad || format('%s tools have a new name, not 4', n); end if;
  select count(*) into n from public.evidence_tools where key in ('plan_my_day', 'review_my_day', 'hardware_and_software_check_in', 'performance_evidence');
  if n <> 4 then bad := bad || format('%s of the 4 tool keys are still there, not 4', n); end if;

  -- 4. recorded
  if to_regclass('public.migration_log') is not null then
    select count(*) into n from public.migration_log where number = 41;
    if n < 1 then bad := bad || '041 did not record itself'::text; end if;
  end if;

  if array_length(bad, 1) > 0 then
    raise exception 'FAILED: %', array_to_string(bad, '; ');
  end if;
  raise notice '041 CHECKS PASSED';
end
$test$;
