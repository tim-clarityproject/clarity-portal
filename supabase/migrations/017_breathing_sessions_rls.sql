-- Breathing Sessions RLS (prompt 11, per clarity-specs-9-to-11.md
-- section E and the user's own confirmation of the live schema).
--
-- breathing_sessions already exists on the live database with columns
-- id, user_id, breathing_mode, duration (integer, seconds), date
-- (timestamptz), created_at, updated_at - confirmed directly by the
-- user from the Supabase Table Editor, so no column changes are
-- needed here (the app's insert already used the right names; only
-- the summary page was reading the wrong ones - a code fix, not a
-- schema one). This migration only adds RLS, which could not be
-- verified from the repo (no earlier migration file created this
-- table) and the spec explicitly asks for it to be checked/added.
--
-- profiles.breathing_preference does NOT exist on the live database
-- (also confirmed directly) - migration 012_add_breathing_preference.sql
-- describes a column the app no longer uses; do NOT run it. The
-- technique preference now lives inside the existing
-- profiles.breathing_settings jsonb column instead (a new "technique"
-- key alongside its existing inhale/hold/exhale keys), which needs no
-- schema change at all.

ALTER TABLE breathing_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own breathing sessions" ON breathing_sessions;
CREATE POLICY "Users can view their own breathing sessions" ON breathing_sessions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own breathing sessions" ON breathing_sessions;
CREATE POLICY "Users can insert their own breathing sessions" ON breathing_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own breathing sessions" ON breathing_sessions;
CREATE POLICY "Users can delete their own breathing sessions" ON breathing_sessions
  FOR DELETE USING (auth.uid() = user_id);
