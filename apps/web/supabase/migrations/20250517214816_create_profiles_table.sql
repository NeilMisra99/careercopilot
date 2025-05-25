-- Create the profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::TEXT, NOW()) NOT NULL,
  full_name TEXT,
  avatar_url TEXT
);

-- Set up Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policies for profiles
CREATE POLICY "Public profiles are viewable by everyone."
  ON public.profiles FOR SELECT
  USING (TRUE);

CREATE POLICY "Users can insert their own profile."
  ON public.profiles FOR INSERT
  WITH CHECK ((select auth.uid()) = id);

CREATE POLICY "Users can update their own profile."
  ON public.profiles FOR UPDATE
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

-- Trigger to create a profile entry on new user sign up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SET search_path = ''
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'avatar_url');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Allow authenticated users to read profiles
-- (Supersedes the "Public profiles are viewable by everyone" if you want to restrict reads only to authenticated users)
-- For now, keeping it public as per the first policy. If stricter access is needed,
-- the public SELECT policy can be removed and this one enabled:
-- CREATE POLICY "Authenticated users can view profiles."
--   ON public.profiles FOR SELECT
--   TO authenticated
--   USING (TRUE);

-- Add comments to the table and columns for better understanding
COMMENT ON TABLE public.profiles IS 'Stores public user profile information linked to auth.users.';
COMMENT ON COLUMN public.profiles.id IS 'References auth.users.id from the authentication system.';
COMMENT ON COLUMN public.profiles.updated_at IS 'Timestamp of the last profile update.';
COMMENT ON COLUMN public.profiles.full_name IS 'User''s full name.';
COMMENT ON COLUMN public.profiles.avatar_url IS 'URL to the user''s avatar image.';
