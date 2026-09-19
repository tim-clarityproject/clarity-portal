-- Add personal_goal column to profiles table
ALTER TABLE public.profiles
ADD COLUMN personal_goal TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.personal_goal IS 'User''s personal goal/purpose displayed in header';
