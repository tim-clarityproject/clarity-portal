-- Restore "terms accepted" for everyone whose sign-up recorded it.
--
-- Why: until Fix 1 (23 Oct 2026), every sign-in and page load rewrote
-- profiles.terms_accepted to false. Sign-up itself records the
-- acceptance in the account's sign-up details (auth.users
-- raw_user_meta_data: terms_accepted = true, with terms_accepted_at), so
-- that record is used to put the saved setting back.
--
-- Safe to run more than once: it only changes rows that are not already
-- true and whose sign-up recorded acceptance. It changes nothing else:
-- the profiles triggers are paused for this one update so updated_at is
-- left as it was.
--
-- WHEN TO RUN
--   Test project: now.
--   Live project: only at go-live, after the new code is live. The old
--   live code sets terms_accepted back to false on every page load and
--   would undo this straight away. (See "Go-live notes" in CLAUDE.md.)

BEGIN;

ALTER TABLE public.profiles DISABLE TRIGGER USER;

UPDATE public.profiles AS p
SET terms_accepted = true
FROM auth.users AS u
WHERE u.id = p.id
  AND p.terms_accepted IS DISTINCT FROM true
  AND (u.raw_user_meta_data ->> 'terms_accepted') = 'true';

ALTER TABLE public.profiles ENABLE TRIGGER USER;

COMMIT;

-- To see the result afterwards (counts only):
-- SELECT terms_accepted, count(*) FROM public.profiles GROUP BY terms_accepted;
