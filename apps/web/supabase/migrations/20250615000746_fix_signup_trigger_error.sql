-- Fix signup error: Add missing UNIQUE constraint on user_job_discovery_preferences.user_id
-- This enables the ON CONFLICT clause in the create_default_job_discovery_preferences() trigger function

-- Add UNIQUE constraint on user_id to enable ON CONFLICT functionality
ALTER TABLE public.user_job_discovery_preferences 
ADD CONSTRAINT user_job_discovery_preferences_user_id_unique UNIQUE (user_id);

-- Add comment explaining the constraint
COMMENT ON CONSTRAINT user_job_discovery_preferences_user_id_unique ON public.user_job_discovery_preferences 
IS 'Ensures one job discovery preference record per user and enables ON CONFLICT in signup trigger';

-- Fix signup trigger permissions: Add SECURITY DEFINER to create_default_job_discovery_preferences function
-- This allows the function to run with elevated permissions to bypass RLS during user creation

CREATE OR REPLACE FUNCTION create_default_job_discovery_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER  -- This is the key fix - run with function owner's permissions
SET search_path = ''
AS $$
BEGIN
    -- Create default job discovery preferences for new users
    INSERT INTO public.user_job_discovery_preferences (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    
    RETURN NEW;
END;
$$; 