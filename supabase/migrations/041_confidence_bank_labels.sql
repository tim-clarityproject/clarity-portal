-- =============================================================================
-- 041_confidence_bank_labels.sql
-- Phase 5 finish, step 2 (Tim, 10 Nov, decisions part 5, 10:10: "Performance
-- Evidence becomes the Confidence Bank").
--
-- Added on 11 Nov (decisions part 5, 11 Nov, 08:25), before it was ever run:
-- the sharing list's other label with an old name, from the 10 Nov renames
-- (the Monthly Hardware and Software review and the First review).
--
-- WHAT THIS DOES (plain English)
--   Four stored labels change their words.
--   Three still said "Performance Evidence". They now say "Confidence Bank":
--     1. sharing_parts(): the label of the 'evidence' part in the list of
--        what a person can share with their coach (026, rewritten in 033),
--        now "Confidence Bank, chosen each time".
--     2. evidence_claims C10 (031): where the claim shows, now "Small-win
--        ticks, unplanned wins, Confidence Bank".
--     3. evidence_tools 'performance_evidence' (031): the tool's name, now
--        "Confidence Bank".
--   One still said "check-in":
--     4. sharing_parts(): the label of the 'checkin' part, which was
--        "Monthly check-in, including the First check-in", now "Monthly
--        review, including the First review".
--   Only the words people read change. The parts' keys ('evidence',
--   'checkin'), the tool's key ('performance_evidence'), the tables
--   performance_evidence and checkins and every saved row keep their names,
--   and no rule changes.
--
-- WHO CAN SEE WHAT (no change)
--
-- SAFE TO RUN TWICE
--   The function is replaced with the same text; each update only touches
--   a row that still holds the old words.
--
-- NEEDS 026, 031 and 033 first. On a database without them (live before
-- go-live) the parts that are missing are skipped, with no error.
-- =============================================================================

do $labels$
begin
  if to_regprocedure('public.sharing_parts()') is not null then
    execute $fn$
      create or replace function public.sharing_parts()
      returns table (part text, audience text, default_on boolean, per_item boolean, label text)
      language sql
      immutable
      set search_path = ''
      as $body$
        values
          ('mission',         'coach',        true,  false, 'Mission'),
          ('checkin',         'coach',        true,  false, 'Monthly review, including the First review'),
          ('progress',        'coach',        false, false, 'Progress: scores, Outcome Objective figures, the sprint at a glance and patterns'),
          ('debrief',         'coach',        false, true,  'Weekly debrief, chosen each week'),
          ('sweet_spot',      'coach',        false, true,  'Find my sweet spot, chosen each time'),
          ('session_prep',    'coach',        false, true,  'Session prep, chosen each time'),
          ('evidence',        'coach',        false, true,  'Confidence Bank, chosen each time'),
          ('recharge',        'coach',        false, true,  'Recovery: what would help you recharge, chosen each day'),
          ('recovery_notice', 'coach',        true,  true,  'Recovery: that it started and until when ("Let [coach] know")'),
          ('org_wellbeing',   'organisation', false, true,  'Wellbeing: Hardware and Software scores and areas, named, to the sponsor and leaders, chosen for each organisation')
      $body$
    $fn$;
  end if;

  if to_regclass('public.evidence_claims') is not null then
    update public.evidence_claims
       set where_it_shows = replace(where_it_shows, 'Performance Evidence', 'Confidence Bank')
     where where_it_shows like '%Performance Evidence%';
  end if;

  if to_regclass('public.evidence_tools') is not null then
    update public.evidence_tools
       set name = 'Confidence Bank'
     where key = 'performance_evidence' and name = 'Performance Evidence';
  end if;
end
$labels$;

-- Records itself where the migration log (025) is there; on a database
-- without it yet, this does nothing rather than stop the migration.
do $$
begin
  if to_regprocedure('public.record_migration(integer,text)') is not null then
    perform public.record_migration(41, '041_confidence_bank_labels');
  end if;
end;
$$;
