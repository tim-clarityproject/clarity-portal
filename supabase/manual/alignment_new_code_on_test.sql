-- =============================================================================
-- alignment_new_code_on_test.sql: the new access code a guest was given after
-- choosing Only you (045), for walking the preview on the TEST project only
-- (read only)
--
-- WHAT THIS DOES (plain English)
--   A preview never sends email, so the new code 045 makes when a guest
--   chooses Only you can't arrive by email there. This shows it, for one link,
--   so Tim can type it on the preview. It changes nothing. The code is kept
--   only until the guest opens the Health Check with it; after that this shows
--   nothing.
--
-- HOW TO RUN
--   Only on the test project: Supabase, clarity-portal-test, SQL Editor, New
--   query. Put the link's token (the part after /health-check/) between the
--   quotes, then press Run. Never run it on the live project.
-- =============================================================================

select new_code
  from public.alignment_sessions
 where token = 'PASTE-THE-TOKEN-HERE';
