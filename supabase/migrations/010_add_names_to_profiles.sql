-- Add first_name and last_name columns to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS first_name TEXT DEFAULT '';

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS last_name TEXT DEFAULT '';

COMMENT ON COLUMN public.profiles.first_name IS 'User''s first name from signup';
COMMENT ON COLUMN public.profiles.last_name IS 'User''s last name from signup';
