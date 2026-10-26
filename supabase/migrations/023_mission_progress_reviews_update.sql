-- =============================================================================
-- 023_mission_progress_reviews_update.sql
-- Personal Operating Plan reviews: a draft can be saved over itself
--
-- WHAT THIS DOES (plain English)
--   mission_progress_reviews has rules to view, add and delete a person's own
--   reviews, but none to change one. So when someone saves a review as a
--   draft and then saves it again, the second save finds nothing it may
--   change and the page says it didn't save. This adds the one missing rule:
--   a signed-in person can change their own reviews, and only their own, and
--   can never hand a review to someone else.
--
--   Nothing else changes: no table, column, other rule or function.
--
-- SAFE TO RUN TWICE
--   The rule is dropped first if it is already there, then made again.
--
-- WHEN TO RUN
--   Test project: now, in the SQL editor of clarity-portal-test, then run
--   supabase/mission_progress_reviews_update_test.sql.
--   Live project: at go-live (see "Go-live notes" in CLAUDE.md). The live code
--   has the same problem today, so it can also run on live earlier if Tim
--   wants the fix there sooner; it changes nothing the live code relies on.
-- =============================================================================

drop policy if exists "Users can update their own reviews" on public.mission_progress_reviews;
create policy "Users can update their own reviews" on public.mission_progress_reviews
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
