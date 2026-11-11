-- =============================================================================
-- 041_confidence_bank_labels.sql
-- Phase 5 finish, step 2 (Tim, 10 Nov, decisions part 5, 10:10: "Performance
-- Evidence becomes the Confidence Bank").
--
-- Added on 11 Nov (decisions part 5, 11 Nov, 08:25), before it was ever run:
-- the sharing list's other label with an old name, from the 10 Nov renames
-- (the Monthly Hardware and Software review and the First review).
--
-- Added to again on 11 Nov, evening (decisions part 5, 11 Nov, 16:30 to
-- 16:45), still before it was ever run: every other old name the database
-- stores, from the 10 Nov renames ("Plan my day" is the Daily plan, "Review
-- my day" the Daily review, "Check-in" the Monthly review and "First
-- check-in" the First review). The whole schema and its seed data were
-- searched: they are stored only in the evidence library (031).
--
-- WHAT THIS DOES (plain English)
--   Nineteen stored labels change their words: the four below, then the
--   fifteen listed under "THE 10 NOV RENAMES".
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
--
--   THE 10 NOV RENAMES in the evidence library (031):
--     evidence_tools, the tool's name (its key stays as it is):
--       5. plan_my_day: "Plan my day" becomes "Daily plan".
--       6. review_my_day: "Review my day" becomes "Daily review".
--       7. hardware_and_software_check_in: "Hardware and Software check-in"
--          becomes "Monthly Hardware and Software review".
--     evidence_claims, where the claim shows (in each, "Plan my day" becomes
--     "Daily plan", "Review my day" becomes "Daily review", "First check-in"
--     becomes "First review" and "Check-in" becomes "Monthly review"):
--       8.  C3:  "Pressure plan, Daily plan's biggest risk"
--       9.  C6:  "Weekly debrief, after-action review, Daily review"
--       10. C11: "Monthly review, Hardware explanation, sleep patterns"
--       11. C15: "Daily plan"
--       12. C20: "Monthly review scoring, "green nights""
--       13. C21: "Monthly review movement questions"
--       14. C22: "Monthly review sitting question"
--       15. C23: "Monthly review alcohol questions and units guide"
--       16. C24: "Monthly review, Daily plan, team pulse"
--       17. C30: "First review, How it works"
--       18. C47: "Monthly review results, What improved, M23 checks"
--       19. C49: "Monthly review alcohol question (the units added up from
--           the drinks counted)"
--           (the test project was seeded before C49 was added, so it
--           has eighteen of these nineteen; a database seeded later has all)
--
--   Only the words people read change. The parts' keys ('evidence',
--   'checkin'), the tools' keys ('performance_evidence', 'plan_my_day',
--   'review_my_day', 'hardware_and_software_check_in'), the tables
--   performance_evidence and checkins and every saved row keep their names,
--   and no rule changes. Nothing a person wrote is touched: a habit, a
--   journal title or a plan that happens to say "check-in" stays as written.
--   (Left as they are, because nobody reads them in the portal: the notes
--   attached to tables and columns, and two error messages the app never
--   shows as written (friendlyError): pulse_send_create's "A pulse is short
--   or the full check-in." and day_plan_limits' "Plan my day holds up to 3
--   to-dos.")
--
-- WHO CAN SEE WHAT (no change)
--
-- SAFE TO RUN TWICE
--   The function is replaced with the same text; each update only touches
--   a row that still holds the old words, so a second run changes nothing.
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
    -- The 10 Nov renames: the tool's name only, never its key.
    update public.evidence_tools set name = 'Daily plan'
     where key = 'plan_my_day' and name = 'Plan my day';
    update public.evidence_tools set name = 'Daily review'
     where key = 'review_my_day' and name = 'Review my day';
    update public.evidence_tools set name = 'Monthly Hardware and Software review'
     where key = 'hardware_and_software_check_in' and name = 'Hardware and Software check-in';
  end if;

  -- The 10 Nov renames, where a claim shows. "First check-in" goes first, so
  -- it never becomes "First Monthly review".
  if to_regclass('public.evidence_claims') is not null then
    update public.evidence_claims
       set where_it_shows = replace(replace(replace(replace(where_it_shows,
             'First check-in', 'First review'),
             'Check-in', 'Monthly review'),
             'Plan my day', 'Daily plan'),
             'Review my day', 'Daily review')
     where where_it_shows like '%Check-in%'
        or where_it_shows like '%First check-in%'
        or where_it_shows like '%Plan my day%'
        or where_it_shows like '%Review my day%';
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
